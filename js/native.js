// Native (Capacitor) integratie. In de gewone PWA doet dit niets;
// in de Android-app plant het een lokale notificatie als eindtijd-alarm
// en beheert het een foreground-service voor vergrendelschermweergave.

const NOTIF_ID   = 1001;
const CHANNEL_ID = "alarm";

function getLN() {
  if (!isNativeApp()) return null;
  return window.Capacitor?.Plugins?.LocalNotifications ?? null;
}

function getSB() {
  if (!isNativeApp()) return null;
  return window.Capacitor?.Plugins?.Scoreboard ?? null;
}

export function isNativeApp() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

export async function ensureNotificationPermission() {
  const ln = getLN();
  if (!ln) return false;
  try {
    const r = await ln.requestPermissions();
    return r?.display === "granted";
  } catch {
    return false;
  }
}

export async function initNativeNotifications() {
  const ln = getLN();
  if (!ln) return;
  try {
    // ScoreboardPlugin.load() maakt dit kanaal al met USAGE_ALARM;
    // deze aanroep is een no-op als het kanaal al bestaat.
    await ln.createChannel({
      id: CHANNEL_ID,
      name: "Wedstrijdalarm",
      description: "Alarm wanneer de wedstrijdtijd is verstreken",
      importance: 5,
      sound: "alarm_buzzer.wav",
      vibration: true,
      visibility: 1,
    });
  } catch {
    // negeren
  }
}

export async function scheduleEndAlarm(remainingMs) {
  const ln = getLN();
  if (!ln) return false;
  try {
    await ln.cancel({ notifications: [{ id: NOTIF_ID }] });
    await ln.schedule({
      notifications: [{
        id: NOTIF_ID,
        title: "Tijd!",
        body: "De wedstrijdtijd is verstreken.",
        channelId: CHANNEL_ID,
        sound: "alarm_buzzer.wav",
        schedule: { at: new Date(Date.now() + remainingMs), allowWhileIdle: true },
      }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelEndAlarm() {
  const ln = getLN();
  if (!ln) return;
  try {
    await ln.cancel({ notifications: [{ id: NOTIF_ID }] });
  } catch {
    // negeren
  }
}

/* ---------- Foreground-service brug ---------- */

export async function startForegroundService(endTimeMs, scoreBlue, scoreRed) {
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.startService({ endTimeMs: Math.floor(endTimeMs), scoreBlue, scoreRed });
  } catch {
    // negeren
  }
}

export async function stopForegroundService() {
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.stopService();
  } catch {
    // negeren
  }
}

export async function updateServiceScores(scoreBlue, scoreRed) {
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.updateScores({ scoreBlue, scoreRed });
  } catch {
    // negeren
  }
}

export async function getServiceState() {
  const sb = getSB();
  if (!sb) return null;
  try {
    return await sb.getState();
  } catch {
    return null;
  }
}
