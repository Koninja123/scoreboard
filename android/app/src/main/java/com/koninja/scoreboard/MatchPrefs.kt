package com.koninja.scoreboard

import android.content.Context
import android.content.SharedPreferences

// Native spiegel van de wedstrijdstatus. De web-app is eigenaar van de status
// en stuurt elke wijziging hierheen; service, melding en widget lezen alleen.
// De volledige app-status (incl. uitslagen) wordt ook als JSON bewaard, zodat
// die niet verloren gaat als Android de WebView-opslag opruimt.
object MatchPrefs {
    const val PREF_NAME = "scoreboard_v2"

    const val KEY_STATE_JSON  = "stateJson"
    const val KEY_RUNNING     = "running"
    const val KEY_END_TIME    = "endTimeMs"
    const val KEY_REMAINING   = "remainingMs"
    const val KEY_WARN        = "warnEnabled"
    const val KEY_WARNED_FOR  = "warnedForEnd"
    const val KEY_FIRED_FOR   = "firedForEnd"
    const val KEY_SCORE_BLUE  = "scoreBlue"
    const val KEY_SCORE_RED   = "scoreRed"
    const val KEY_NAME_BLUE   = "nameBlue"
    const val KEY_NAME_RED    = "nameRed"
    const val KEY_PERIOD      = "periodLabel"

    const val WARN_BEFORE_MS  = 60_000L

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun isRunning(context: Context) = prefs(context).getBoolean(KEY_RUNNING, false)
    fun endTime(context: Context) = prefs(context).getLong(KEY_END_TIME, 0L)

    fun scoreLine(context: Context): String {
        val p = prefs(context)
        val blue = p.getString(KEY_NAME_BLUE, "Blauw") ?: "Blauw"
        val red  = p.getString(KEY_NAME_RED, "Rood") ?: "Rood"
        return "$blue ${p.getInt(KEY_SCORE_BLUE, 0)} – ${p.getInt(KEY_SCORE_RED, 0)} $red"
    }

    fun formatMs(ms: Long): String {
        val sec = (ms.coerceAtLeast(0L) + 999) / 1000
        return "%d:%02d".format(sec / 60, sec % 60)
    }
}
