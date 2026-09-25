package com.koninja.scoreboard

import android.content.*

// Ontvangt het AlarmManager-vangnet (eindtijd) en de "Stop alarm"-knop uit de melding.
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ScoreboardService.ACTION_FIRE ->
                if (MatchPrefs.isRunning(context)) ScoreboardService.startSelf(context, ScoreboardService.ACTION_FIRE)
            ScoreboardService.ACTION_STOP_ALARM -> AlarmPlayer.stop()
        }
    }
}
