package com.koninja.scoreboard

import android.content.*

class ScoreboardReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = context.getSharedPreferences(ScoreboardService.PREF_NAME, Context.MODE_PRIVATE)
        val edit  = prefs.edit()
        when (intent.action) {
            ScoreboardService.ACTION_BLUE_PLUS  -> edit.putInt(ScoreboardService.KEY_SCORE_BLUE, (prefs.getInt(ScoreboardService.KEY_SCORE_BLUE, 0) + 1))
            ScoreboardService.ACTION_BLUE_MINUS -> edit.putInt(ScoreboardService.KEY_SCORE_BLUE, (prefs.getInt(ScoreboardService.KEY_SCORE_BLUE, 0) - 1).coerceAtLeast(0))
            ScoreboardService.ACTION_RED_PLUS   -> edit.putInt(ScoreboardService.KEY_SCORE_RED,  (prefs.getInt(ScoreboardService.KEY_SCORE_RED,  0) + 1))
            ScoreboardService.ACTION_RED_MINUS  -> edit.putInt(ScoreboardService.KEY_SCORE_RED,  (prefs.getInt(ScoreboardService.KEY_SCORE_RED,  0) - 1).coerceAtLeast(0))
            else -> return
        }
        edit.apply()
    }
}
