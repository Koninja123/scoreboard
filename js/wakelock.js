let wakeLock = null;

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return false;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
    return true;
  } catch {
    wakeLock = null;
    return false;
  }
}

export async function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }

  try {
    await wakeLock.release();
  } catch {
    // Stil falen; de app blijft bruikbaar.
  } finally {
    wakeLock = null;
  }
}
