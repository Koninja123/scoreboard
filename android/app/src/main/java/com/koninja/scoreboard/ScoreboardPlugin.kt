package com.koninja.scoreboard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Scoreboard")
class ScoreboardPlugin : Plugin() {

    override fun load() {
        // Alarm-kanaal aanmaken met USAGE_ALARM zodat het alarm afspeelt
        // op de alarm-audiostream (ook bij stille/trilstand en DND).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundUri = Uri.parse(
                "android.resource://${context.packageName}/raw/alarm_buzzer"
            )
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val ch = NotificationChannel("alarm", "Wedstrijdalarm", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(soundUri, attrs)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        val endTimeMs = call.getLong("endTimeMs") ?: return call.reject("missing endTimeMs")
        val blue      = call.getInt("scoreBlue", 0)!!
        val red       = call.getInt("scoreRed",  0)!!
        ScoreboardService.startService(context, endTimeMs, blue, red)
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        ScoreboardService.stopService(context)
        call.resolve()
    }

    @PluginMethod
    fun updateScores(call: PluginCall) {
        val blue = call.getInt("scoreBlue") ?: return call.reject("missing scoreBlue")
        val red  = call.getInt("scoreRed")  ?: return call.reject("missing scoreRed")
        context.getSharedPreferences(ScoreboardService.PREF_NAME, Context.MODE_PRIVATE).edit()
            .putInt(ScoreboardService.KEY_SCORE_BLUE, blue)
            .putInt(ScoreboardService.KEY_SCORE_RED,  red)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        val p = context.getSharedPreferences(ScoreboardService.PREF_NAME, Context.MODE_PRIVATE)
        call.resolve(JSObject().apply {
            put("scoreBlue", p.getInt(ScoreboardService.KEY_SCORE_BLUE, 0))
            put("scoreRed",  p.getInt(ScoreboardService.KEY_SCORE_RED,  0))
            put("running",   p.getBoolean(ScoreboardService.KEY_RUNNING, false))
        })
    }
}
