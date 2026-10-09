// Brug naar de Android-app (Capacitor-plugin "Scoreboard"). In de PWA doen
// deze functies niets; daar valt de app terug op web-audio en localStorage.

export function isNativeApp() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

function plugin(name) {
  if (!isNativeApp()) return null;
  return window.Capacitor?.Plugins?.[name] ?? null;
}

async function call(method, args) {
  const sb = plugin("Scoreboard");
  if (!sb || typeof sb[method] !== "function") return null;
  try {
    return await sb[method](args);
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission() {
  const ln = plugin("LocalNotifications");
  if (!ln) return false;
  try {
    const current = await ln.checkPermissions();
    if (current?.display === "granted") return true;
    const r = await ln.requestPermissions();
    return r?.display === "granted";
  } catch {
    return false;
  }
}

export async function loadNativeState() {
  const r = await call("loadState");
  return r?.json ?? null;
}

export function saveNativeState(json) {
  return call("saveState", { json });
}

export function setNativeClock(payload) {
  return call("setClock", payload);
}

export function stopNativeAlarm() {
  return call("stopAlarm");
}

export async function isNativeAlarmActive() {
  const r = await call("getAlarmState");
  return Boolean(r?.active);
}

export function testNativeAlarm() {
  return call("testAlarm");
}

export function testNativeWarning() {
  return call("testWarning");
}

export function setFieldMode({ keepAwake, proximity }) {
  return call("setFieldMode", { keepAwake, proximity });
}

export async function getCapabilities() {
  return (await call("getCapabilities")) ?? {};
}

export function requestBatteryExemption() {
  return call("requestBatteryExemption");
}

export function shareNative(text) {
  return call("share", { text, title: "Uitslagen delen" });
}

export function onAlarmState(callback) {
  const sb = plugin("Scoreboard");
  if (!sb || typeof sb.addListener !== "function") return;
  try {
    sb.addListener("alarmState", (data) => callback(Boolean(data?.active)));
  } catch {
    // negeren
  }
}
