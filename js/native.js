// Native (Capacitor) integratie. In de gewone PWA doet dit niets;
// in de Android-app plant het een lokale notificatie als eindtijd-alarm,
// zodat het geluid ook afgaat met het scherm op slot.
const NOTIF_ID = 1001;
const CHANNEL_ID = "alarm";

function getPlugin() {
  if (!isNativeApp()) {
    return null;
  }
  return window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications
    ? window.Capacitor.Plugins.LocalNotifications
    : null;
}

export function isNativeApp() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

export async function ensureNotificationPermission() {
  const ln = getPlugin();
  if (!ln) {
    return false;
  }
  try {
    const result = await ln.requestPermissions();
    return result && result.display === "granted";
  } catch {
    return false;
  }
}

export async function initNativeNotifications() {
  const ln = getPlugin();
  if (!ln) {
    return;
  }
  try {
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
  const ln = getPlugin();
  if (!ln) {
    return false;
  }
  try {
    await ln.cancel({ notifications: [{ id: NOTIF_ID }] });
    await ln.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title: "Tijd!",
          body: "De wedstrijdtijd is verstreken.",
          channelId: CHANNEL_ID,
          sound: "alarm_buzzer.wav",
          schedule: { at: new Date(Date.now() + remainingMs), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelEndAlarm() {
  const ln = getPlugin();
  if (!ln) {
    return;
  }
  try {
    await ln.cancel({ notifications: [{ id: NOTIF_ID }] });
  } catch {
    // negeren
  }
}
