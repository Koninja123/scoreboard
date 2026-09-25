package com.koninja.scoreboard

import android.annotation.SuppressLint
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

// Brug tussen de web-app en Android. De web-app is eigenaar van de status en
// meldt elke wijziging via setClock(); de native kant zorgt voor klok op de
// achtergrond, alarm, veld-modus (scherm aan + nabijheidssensor) en opslag.
@CapacitorPlugin(name = "Scoreboard")
class ScoreboardPlugin : Plugin() {

    private var proximityLock: PowerManager.WakeLock? = null
    private val alarmListener: (Boolean) -> Unit = { active ->
        notifyListeners("alarmState", JSObject().put("active", active))
        if (!active) activity?.runOnUiThread { setShowOverLockScreen(false) }
    }

    override fun load() {
        ScoreboardService.createChannels(context)
        AlarmPlayer.addListener(alarmListener)
        handleAlarmIntent(activity?.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleAlarmIntent(intent)
    }

    override fun handleOnDestroy() {
        AlarmPlayer.removeListener(alarmListener)
        releaseProximity()
        super.handleOnDestroy()
    }

    private fun handleAlarmIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(ScoreboardService.EXTRA_FROM_ALARM, false) == true && AlarmPlayer.isActive) {
            activity?.runOnUiThread { setShowOverLockScreen(true) }
        }
    }

    @Suppress("DEPRECATION")
    private fun setShowOverLockScreen(on: Boolean) {
        val act = activity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            act.setShowWhenLocked(on)
            act.setTurnScreenOn(on)
        } else {
            val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            if (on) act.window.addFlags(flags) else act.window.clearFlags(flags)
        }
    }

    /* ---------- Opslag ---------- */

    @PluginMethod
    fun loadState(call: PluginCall) {
        val json = MatchPrefs.prefs(context).getString(MatchPrefs.KEY_STATE_JSON, null)
        call.resolve(JSObject().put("json", json))
    }

    @PluginMethod
    fun saveState(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("missing json")
        MatchPrefs.prefs(context).edit().putString(MatchPrefs.KEY_STATE_JSON, json).apply()
        call.resolve()
    }

    /* ---------- Klok ---------- */

    // PluginCall.getLong() geeft null voor getallen die in een int passen
    // (org.json maakt daar een Integer van); dit leest elk JS-getal.
    private fun PluginCall.long(name: String): Long? = (data.opt(name) as? Number)?.toLong()

    @PluginMethod
    fun setClock(call: PluginCall) {
        val running = call.getBoolean("running", false)!!
        val p = MatchPrefs.prefs(context)
        val edit = p.edit()
            .putBoolean(MatchPrefs.KEY_RUNNING, running)
            .putLong(MatchPrefs.KEY_REMAINING, call.long("remainingMs") ?: -1L)
            .putBoolean(MatchPrefs.KEY_WARN, call.getBoolean("warnEnabled", true)!!)
            .putInt(MatchPrefs.KEY_SCORE_BLUE, call.getInt("scoreBlue", 0)!!)
            .putInt(MatchPrefs.KEY_SCORE_RED, call.getInt("scoreRed", 0)!!)
            .putString(MatchPrefs.KEY_NAME_BLUE, call.getString("nameBlue", "Blauw"))
            .putString(MatchPrefs.KEY_NAME_RED, call.getString("nameRed", "Rood"))
            .putString(MatchPrefs.KEY_PERIOD, call.getString("periodLabel", ""))
        if (running) {
            val end = call.long("endTimeMs") ?: return call.reject("missing endTimeMs")
            edit.putLong(MatchPrefs.KEY_END_TIME, end)
        }
        edit.commit()
        ScoreboardService.sync(context)
        call.resolve()
    }

    /* ---------- Alarm ---------- */

    @PluginMethod
    fun getAlarmState(call: PluginCall) {
        call.resolve(JSObject().put("active", AlarmPlayer.isActive))
    }

    @PluginMethod
    fun stopAlarm(call: PluginCall) {
        AlarmPlayer.stop()
        call.resolve()
    }

    @PluginMethod
    fun testAlarm(call: PluginCall) {
        AlarmPlayer.start(context, maxMs = 4_000L)
        call.resolve()
    }

    @PluginMethod
    fun testWarning(call: PluginCall) {
        AlarmPlayer.playWarning(context)
        call.resolve()
    }

    /* ---------- Veld-modus ---------- */

    // keepAwake: scherm blijft aan. proximity: scherm gaat uit (en negeert
    // aanrakingen) zolang de nabijheidssensor bedekt is, zoals tijdens bellen.
    @PluginMethod
    fun setFieldMode(call: PluginCall) {
        val keepAwake = call.getBoolean("keepAwake", false)!!
        val proximity = call.getBoolean("proximity", false)!!
        activity?.runOnUiThread {
            if (keepAwake) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        if (proximity) acquireProximity() else releaseProximity()
        call.resolve(JSObject().put("proximitySupported", proximitySupported()))
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val pm = context.getSystemService(PowerManager::class.java)
        call.resolve(JSObject().apply {
            put("proximitySupported", proximitySupported())
            put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(context.packageName))
        })
    }

    private fun proximitySupported(): Boolean {
        val pm = context.getSystemService(PowerManager::class.java)
        val sm = context.getSystemService(SensorManager::class.java)
        return pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK) &&
            sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY) != null
    }

    private fun acquireProximity() {
        if (proximityLock?.isHeld == true || !proximitySupported()) return
        proximityLock = context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "scoreboard:pocket")
            .apply { setReferenceCounted(false); acquire(3 * 60 * 60 * 1000L) }
    }

    private fun releaseProximity() {
        proximityLock?.let { if (it.isHeld) it.release() }
        proximityLock = null
    }

    /* ---------- Batterij ---------- */

    @SuppressLint("BatteryLife")
    @PluginMethod
    fun requestBatteryExemption(call: PluginCall) {
        try {
            val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        } catch (_: Exception) {
            context.startActivity(
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        call.resolve()
    }

    /* ---------- Delen ---------- */

    @PluginMethod
    fun share(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("missing text")
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text)
        val chooser = Intent.createChooser(send, call.getString("title", "Uitslagen delen"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
        call.resolve()
    }
}
