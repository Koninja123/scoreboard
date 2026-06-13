package com.koninja.scoreboard

import android.app.*
import android.appwidget.AppWidgetManager
import android.content.*
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat

class ScoreboardService : Service() {

    companion object {
        const val CHANNEL_SERVICE  = "scoreboard_service"
        const val NOTIF_SERVICE    = 1002
        const val ACTION_BLUE_PLUS  = "com.koninja.scoreboard.BLUE_PLUS"
        const val ACTION_BLUE_MINUS = "com.koninja.scoreboard.BLUE_MINUS"
        const val ACTION_RED_PLUS   = "com.koninja.scoreboard.RED_PLUS"
        const val ACTION_RED_MINUS  = "com.koninja.scoreboard.RED_MINUS"
        const val PREF_NAME        = "scoreboard"
        const val KEY_END_TIME     = "endTimeMs"
        const val KEY_SCORE_BLUE   = "scoreBlue"
        const val KEY_SCORE_RED    = "scoreRed"
        const val KEY_RUNNING      = "running"

        fun startService(context: Context, endTimeMs: Long, scoreBlue: Int, scoreRed: Int) {
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE).edit()
                .putLong(KEY_END_TIME, endTimeMs)
                .putInt(KEY_SCORE_BLUE, scoreBlue)
                .putInt(KEY_SCORE_RED, scoreRed)
                .putBoolean(KEY_RUNNING, true)
                .apply()
            val i = Intent(context, ScoreboardService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(i)
            else
                context.startService(i)
        }

        fun stopService(context: Context) {
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_RUNNING, false).apply()
            context.stopService(Intent(context, ScoreboardService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            refresh()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createServiceChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_SERVICE, buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIF_SERVICE, buildNotification())
        }
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun prefs() = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    private fun createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_SERVICE,
                "Scoreboard tijdweergave",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun pendingBroadcast(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getBroadcast(
            this, requestCode,
            Intent(action).setPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun buildNotification(): Notification {
        val p       = prefs()
        val endTime = p.getLong(KEY_END_TIME, 0L)
        val blue    = p.getInt(KEY_SCORE_BLUE, 0)
        val red     = p.getInt(KEY_SCORE_RED, 0)
        val rem     = (endTime - System.currentTimeMillis()).coerceAtLeast(0L)
        val sec     = (rem + 999) / 1000
        val timeStr = "%d:%02d".format(sec / 60, sec % 60)

        val openPi = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("$timeStr  —  Blauw $blue • Rood $red")
            .setContentText("Tik om de app te openen")
            .setContentIntent(openPi)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .addAction(0, "Blauw +1", pendingBroadcast(ACTION_BLUE_PLUS,  1))
            .addAction(0, "Blauw -1", pendingBroadcast(ACTION_BLUE_MINUS, 2))
            .addAction(0, "Rood +1",  pendingBroadcast(ACTION_RED_PLUS,   3))
            .addAction(0, "Rood -1",  pendingBroadcast(ACTION_RED_MINUS,  4))
            .build()
    }

    private fun refresh() {
        if (!prefs().getBoolean(KEY_RUNNING, false)) {
            stopSelf(); return
        }
        getSystemService(NotificationManager::class.java).notify(NOTIF_SERVICE, buildNotification())
        updateWidget()
    }

    private fun updateWidget() {
        val mgr = AppWidgetManager.getInstance(this)
        val ids = mgr.getAppWidgetIds(ComponentName(this, ScoreboardWidget::class.java))
        if (ids.isEmpty()) return
        sendBroadcast(
            Intent(this, ScoreboardWidget::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
        )
    }
}
