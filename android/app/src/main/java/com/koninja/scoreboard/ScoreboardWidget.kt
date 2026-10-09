package com.koninja.scoreboard

import android.appwidget.*
import android.content.*
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

// Home-scherm widget. De tijd telt zelf af via een Chronometer, dus de widget
// hoeft alleen bijgewerkt te worden als er iets verandert.
class ScoreboardWidget : AppWidgetProvider() {

    companion object {
        fun updateAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, ScoreboardWidget::class.java))
            if (ids.isNotEmpty()) render(context, mgr, ids)
        }

        private fun render(context: Context, mgr: AppWidgetManager, ids: IntArray) {
            val p         = MatchPrefs.prefs(context)
            val running   = p.getBoolean(MatchPrefs.KEY_RUNNING, false)
            val end       = p.getLong(MatchPrefs.KEY_END_TIME, 0L)
            val remaining = if (running) end - System.currentTimeMillis()
                            else p.getLong(MatchPrefs.KEY_REMAINING, -1L)
            val openPi    = ScoreboardService.openAppIntent(context, false)

            for (id in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_scoreboard).apply {
                    setTextViewText(R.id.widget_blue, p.getInt(MatchPrefs.KEY_SCORE_BLUE, 0).toString())
                    setTextViewText(R.id.widget_red,  p.getInt(MatchPrefs.KEY_SCORE_RED, 0).toString())
                    if (running && remaining > 0) {
                        setViewVisibility(R.id.widget_time, View.GONE)
                        setViewVisibility(R.id.widget_chrono, View.VISIBLE)
                        setChronometer(R.id.widget_chrono, SystemClock.elapsedRealtime() + remaining, null, true)
                        setChronometerCountDown(R.id.widget_chrono, true)
                    } else {
                        setChronometer(R.id.widget_chrono, SystemClock.elapsedRealtime(), null, false)
                        setViewVisibility(R.id.widget_chrono, View.GONE)
                        setViewVisibility(R.id.widget_time, View.VISIBLE)
                        setTextViewText(R.id.widget_time, if (remaining >= 0) MatchPrefs.formatMs(remaining) else "--:--")
                    }
                    setOnClickPendingIntent(R.id.widget_root, openPi)
                }
                mgr.updateAppWidget(id, views)
            }
        }
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
    }
}
