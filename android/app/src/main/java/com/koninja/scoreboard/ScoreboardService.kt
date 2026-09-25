package com.koninja.scoreboard

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Voorgrondservice die de wedstrijdklok bewaakt zolang die loopt, ook met het
// scherm uit of de app op de achtergrond. Speelt de 1-minuut-piep en het
// eindalarm af. AlarmManager.setAlarmClock() is het vangnet voor als Android
// het proces toch afsluit: dat start de service op de eindtijd opnieuw.
class ScoreboardService : Service() {

    companion object {
        const val CHANNEL_CLOCK   = "match_clock"
        const val CHANNEL_ALARM   = "match_alarm_v2"
        const val NOTIF_ID        = 1002

        const val ACTION_SYNC       = "com.koninja.scoreboard.SYNC"
        const val ACTION_FIRE       = "com.koninja.scoreboard.FIRE"
        const val ACTION_STOP_ALARM = "com.koninja.scoreboard.STOP_ALARM"
        const val EXTRA_FROM_ALARM  = "fromAlarm"

        private const val BACKUP_REQUEST = 20

        fun sync(context: Context) {
            if (MatchPrefs.isRunning(context)) {
                scheduleBackup(context, MatchPrefs.endTime(context))
                startSelf(context, ACTION_SYNC)
            } else {
                cancelBackup(context)
                if (!AlarmPlayer.isActive) context.stopService(Intent(context, ScoreboardService::class.java))
            }
            ScoreboardWidget.updateAll(context)
        }

        fun startSelf(context: Context, action: String) {
            val i = Intent(context, ScoreboardService::class.java).setAction(action)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
            else context.startService(i)
        }

        fun createChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_CLOCK, "Wedstrijdklok", NotificationManager.IMPORTANCE_LOW).apply {
                    setSound(null, null)
                    enableVibration(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
            )
            // Geluid en trillen komen van AlarmPlayer (alarm-stream), niet van de melding.
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ALARM, "Wedstrijdalarm", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(null, null)
                    enableVibration(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
            )
            // Kanalen van de vorige versie opruimen.
            nm.deleteNotificationChannel("scoreboard_service")
            nm.deleteNotificationChannel("alarm")
        }

        private fun backupIntent(context: Context): PendingIntent =
            PendingIntent.getBroadcast(
                context, BACKUP_REQUEST,
                Intent(context, AlarmReceiver::class.java).setAction(ACTION_FIRE),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

        private fun scheduleBackup(context: Context, endTimeMs: Long) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val pi = backupIntent(context)
            try {
                val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
                if (exact) {
                    am.setAlarmClock(AlarmManager.AlarmClockInfo(endTimeMs, openAppIntent(context, false)), pi)
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endTimeMs, pi)
                }
            } catch (_: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endTimeMs, pi)
            }
        }

        private fun cancelBackup(context: Context) {
            context.getSystemService(AlarmManager::class.java)?.cancel(backupIntent(context))
        }

        fun openAppIntent(context: Context, fromAlarm: Boolean): PendingIntent {
            val i = (context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(context, MainActivity::class.java))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_FROM_ALARM, fromAlarm)
            return PendingIntent.getActivity(
                context, if (fromAlarm) 11 else 10, i,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private val alarmListener: (Boolean) -> Unit = { active -> if (!active) handler.post { onAlarmEnded() } }

    private val tick = object : Runnable {
        override fun run() {
            if (checkClock()) handler.postDelayed(this, 500)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannels(this)
        AlarmPlayer.addListener(alarmListener)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Altijd eerst naar de voorgrond (verplicht binnen 5 s na startForegroundService).
        goForeground(if (AlarmPlayer.isActive) buildAlarmNotification() else buildClockNotification())

        when (intent?.action) {
            ACTION_STOP_ALARM -> { AlarmPlayer.stop(); return START_NOT_STICKY }
            ACTION_FIRE -> {
                if (MatchPrefs.isRunning(this) && System.currentTimeMillis() >= MatchPrefs.endTime(this) - 1000) {
                    fire(); return START_NOT_STICKY
                }
            }
        }

        if (!MatchPrefs.isRunning(this)) {
            if (!AlarmPlayer.isActive) stopEverything()
            return START_NOT_STICKY
        }

        armWarning()
        acquireWakeLock()
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        AlarmPlayer.removeListener(alarmListener)
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Waarschuwing overslaan als de klok (her)start met minder dan een minuut te gaan.
    private fun armWarning() {
        val p = MatchPrefs.prefs(this)
        val end = p.getLong(MatchPrefs.KEY_END_TIME, 0L)
        val warnedFor = p.getLong(MatchPrefs.KEY_WARNED_FOR, 0L)
        if (warnedFor != end && end - System.currentTimeMillis() <= MatchPrefs.WARN_BEFORE_MS + 500) {
            p.edit().putLong(MatchPrefs.KEY_WARNED_FOR, end).apply()
        }
    }

    /** @return true als de klok nog loopt en er verder getikt moet worden. */
    private fun checkClock(): Boolean {
        val p = MatchPrefs.prefs(this)
        if (!p.getBoolean(MatchPrefs.KEY_RUNNING, false)) {
            if (!AlarmPlayer.isActive) stopEverything()
            return false
        }
        val end = p.getLong(MatchPrefs.KEY_END_TIME, 0L)
        val remaining = end - System.currentTimeMillis()
        if (remaining <= 0) {
            fire()
            return false
        }
        if (remaining <= MatchPrefs.WARN_BEFORE_MS &&
            p.getBoolean(MatchPrefs.KEY_WARN, true) &&
            p.getLong(MatchPrefs.KEY_WARNED_FOR, 0L) != end
        ) {
            p.edit().putLong(MatchPrefs.KEY_WARNED_FOR, end).apply()
            AlarmPlayer.playWarning(this)
        }
        return true
    }

    private fun fire() {
        handler.removeCallbacks(tick)
        val p = MatchPrefs.prefs(this)
        val end = p.getLong(MatchPrefs.KEY_END_TIME, 0L)
        p.edit()
            .putBoolean(MatchPrefs.KEY_RUNNING, false)
            .putLong(MatchPrefs.KEY_REMAINING, 0L)
            .apply()
        cancelBackup(this)
        if (p.getLong(MatchPrefs.KEY_FIRED_FOR, 0L) == end) {
            if (!AlarmPlayer.isActive) stopEverything()
            return
        }
        p.edit().putLong(MatchPrefs.KEY_FIRED_FOR, end).apply()
        AlarmPlayer.start(this)
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildAlarmNotification())
        ScoreboardWidget.updateAll(this)
        // Het alarm-scherm direct tonen (ook boven het vergrendelscherm).
        try { openAppIntent(this, true).send() } catch (_: Exception) {}
    }

    private fun onAlarmEnded() {
        if (MatchPrefs.isRunning(this)) {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildClockNotification())
        } else {
            stopEverything()
        }
    }

    private fun stopEverything() {
        handler.removeCallbacks(tick)
        releaseWakeLock()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
        ScoreboardWidget.updateAll(this)
    }

    private fun goForeground(notification: Notification) {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notification, type)
    }

    // Houdt de CPU wakker zodat de piep en het alarm op tijd komen met het scherm uit.
    private fun acquireWakeLock() {
        val remaining = MatchPrefs.endTime(this) - System.currentTimeMillis()
        releaseWakeLock()
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "scoreboard:clock")
            .apply { acquire(remaining.coerceAtLeast(0L) + 120_000L) }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun buildClockNotification(): Notification {
        val p = MatchPrefs.prefs(this)
        val end = p.getLong(MatchPrefs.KEY_END_TIME, 0L)
        val period = p.getString(MatchPrefs.KEY_PERIOD, "") ?: ""
        return NotificationCompat.Builder(this, CHANNEL_CLOCK)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(MatchPrefs.scoreLine(this))
            .setContentText(if (period.isNotEmpty()) "$period · klok loopt" else "Klok loopt")
            .setWhen(end)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setContentIntent(openAppIntent(this, false))
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .build()
    }

    private fun buildAlarmNotification(): Notification {
        val stopPi = PendingIntent.getBroadcast(
            this, 21,
            Intent(this, AlarmReceiver::class.java).setAction(ACTION_STOP_ALARM),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ALARM)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Tijd!")
            .setContentText(MatchPrefs.scoreLine(this))
            .setContentIntent(openAppIntent(this, true))
            .setFullScreenIntent(openAppIntent(this, true), true)
            .addAction(0, "Stop alarm", stopPi)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .build()
    }
}
