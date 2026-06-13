package com.koninja.scoreboard

import android.app.PendingIntent
import android.appwidget.*
import android.content.*
import android.widget.RemoteViews

class ScoreboardWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        val p       = context.getSharedPreferences(ScoreboardService.PREF_NAME, Context.MODE_PRIVATE)
        val blue    = p.getInt(ScoreboardService.KEY_SCORE_BLUE, 0)
        val red     = p.getInt(ScoreboardService.KEY_SCORE_RED,  0)
        val end     = p.getLong(ScoreboardService.KEY_END_TIME,  0L)
        val running = p.getBoolean(ScoreboardService.KEY_RUNNING, false)
        val rem     = (end - System.currentTimeMillis()).coerceAtLeast(0L)
        val sec     = (rem + 999) / 1000
        val time    = if (running && rem > 0) "%d:%02d".format(sec / 60, sec % 60) else "--:--"

        val openPi = PendingIntent.getActivity(
            context, 0,
            context.packageManager.getLaunchIntentForPackage(context.packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        for (id in ids) {
            val views = RemoteViews(context.packageName, R.layout.widget_scoreboard).apply {
                setTextViewText(R.id.widget_score, "$blue  –  $red")
                setTextViewText(R.id.widget_time,  time)
                setOnClickPendingIntent(R.id.widget_root, openPi)
            }
            mgr.updateAppWidget(id, views)
        }
    }
}
