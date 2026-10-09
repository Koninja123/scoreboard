package com.koninja.scoreboard

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.util.concurrent.CopyOnWriteArraySet

// Speelt het eindalarm en de 1-minuut-piep af op de ALARM-audiostream, net als
// een wekker: hoorbaar in stille/trilstand en bij Niet Storen (alarmen staan
// daar standaard aan). Het alarmvolume gaat tijdelijk naar maximaal en wordt
// daarna teruggezet. Het alarm herhaalt tot iemand op Stop drukt (max 60 s).
object AlarmPlayer {
    const val ALARM_MAX_MS = 60_000L

    private val handler = Handler(Looper.getMainLooper())
    private val autoStop = Runnable { stop() }
    private val listeners = CopyOnWriteArraySet<(Boolean) -> Unit>()

    private var appContext: Context? = null
    private var alarmPlayer: MediaPlayer? = null
    private var warnPlayer: MediaPlayer? = null
    private var savedVolume = -1

    @Volatile
    var isActive = false
        private set

    fun addListener(listener: (Boolean) -> Unit) { listeners.add(listener) }
    fun removeListener(listener: (Boolean) -> Unit) { listeners.remove(listener) }

    fun start(context: Context, maxMs: Long = ALARM_MAX_MS) {
        val ctx = context.applicationContext
        appContext = ctx
        releaseWarn()
        releaseAlarm()
        boostVolume(ctx)
        alarmPlayer = createPlayer(ctx, R.raw.alarm_buzzer, looping = true)
        vibrate(ctx, longArrayOf(0, 700, 300, 700, 300, 700, 900), repeat = 0)
        handler.removeCallbacks(autoStop)
        handler.postDelayed(autoStop, maxMs)
        if (!isActive) {
            isActive = true
            listeners.forEach { it(true) }
        }
    }

    fun stop() {
        handler.removeCallbacks(autoStop)
        releaseAlarm()
        appContext?.let { vibrator(it)?.cancel() }
        restoreVolume()
        if (isActive) {
            isActive = false
            listeners.forEach { it(false) }
        }
    }

    fun playWarning(context: Context) {
        if (isActive) return
        val ctx = context.applicationContext
        appContext = ctx
        releaseWarn()
        boostVolume(ctx)
        warnPlayer = createPlayer(ctx, R.raw.warn_beep, looping = false)?.apply {
            setOnCompletionListener {
                releaseWarn()
                if (!isActive) restoreVolume()
            }
        }
        if (warnPlayer == null && !isActive) restoreVolume()
        vibrate(ctx, longArrayOf(0, 250, 150, 250), repeat = -1)
    }

    private fun createPlayer(ctx: Context, resId: Int, looping: Boolean): MediaPlayer? = try {
        MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            ctx.resources.openRawResourceFd(resId).use { afd ->
                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            }
            isLooping = looping
            prepare()
            start()
        }
    } catch (e: Exception) {
        null
    }

    private fun releaseAlarm() {
        alarmPlayer?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        alarmPlayer = null
    }

    private fun releaseWarn() {
        warnPlayer?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        warnPlayer = null
    }

    private fun boostVolume(ctx: Context) {
        val am = ctx.getSystemService(AudioManager::class.java) ?: return
        try {
            if (savedVolume < 0) savedVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
        } catch (_: Exception) {
            // sommige toestellen weigeren dit; dan klinkt het op het ingestelde alarmvolume
        }
    }

    private fun restoreVolume() {
        val ctx = appContext ?: return
        if (savedVolume < 0) return
        try {
            ctx.getSystemService(AudioManager::class.java)
                ?.setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0)
        } catch (_: Exception) {}
        savedVolume = -1
    }

    @Suppress("DEPRECATION")
    private fun vibrator(ctx: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else
            ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

    @Suppress("DEPRECATION")
    private fun vibrate(ctx: Context, pattern: LongArray, repeat: Int) {
        val v = vibrator(ctx) ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
                v.vibrate(VibrationEffect.createWaveform(pattern, repeat), attrs)
            } else {
                v.vibrate(pattern, repeat)
            }
        } catch (_: Exception) {}
    }
}
