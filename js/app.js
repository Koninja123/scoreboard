import { CountdownTimer, formatTime } from "./timer.js";
import { primeAlarm, scheduleAlarmIn, playAlarmNow, stopAlarm } from "./audio.js";
import { requestWakeLock, releaseWakeLock } from "./wakelock.js";
import { isNativeApp, ensureNotificationPermission, scheduleEndAlarm, cancelEndAlarm } from "./native.js";

const STORAGE_KEY = "hockey-scoreboard-state";

const defaultState = {
  teamBlueName: "Blauw team",
  teamRedName: "Rood team",
  scores: { blue: 0, red: 0 },
  selectedMinutes: 15,
};

const el = {
  board: document.querySelector("#board"),
  blueName: document.querySelector("#blue-name"),
  redName: document.querySelector("#red-name"),
  blueScore: document.querySelector("#blue-score"),
  redScore: document.querySelector("#red-score"),
  tapButtons: [...document.querySelectorAll(".team__tap")],
  minusButtons: [...document.querySelectorAll(".team__minus")],
  clock: document.querySelector("#clock"),
  clockTime: document.querySelector("#clock-time"),
  status: document.querySelector("#status"),
  openSettings: document.querySelector("#open-settings"),
  sheet: document.querySelector("#settings-sheet"),
  closeSettings: document.querySelector("#close-settings"),
  settingsForm: document.querySelector("#settings-form"),
  blueNameInput: document.querySelector("#blue-name-input"),
  redNameInput: document.querySelector("#red-name-input"),
  presetButtons: [...document.querySelectorAll(".preset[data-minutes]")],
  customMinutes: document.querySelector("#custom-minutes"),
  testAlarm: document.querySelector("#test-alarm"),
  resetClock: document.querySelector("#reset-clock"),
  newMatch: document.querySelector("#new-match"),
  lockBtn: document.querySelector("#lock-btn"),
  lockOverlay: document.querySelector("#lock-overlay"),
  unlockBtn: document.querySelector("#unlock-btn"),
};

let state = loadState();
let completed = false;
let alarmScheduled = false;

const timer = new CountdownTimer({
  onTick: ({ remainingMs, isRunning }) => {
    el.clockTime.textContent = formatTime(remainingMs);
    updateClockUi(isRunning, remainingMs);
  },
  onComplete: () => {
    completed = true;
    // Geluid is al ingepland op de audio-klok bij de start. Lukte dat niet,
    // dan spelen we het alarm nu alsnog (best effort, app op de voorgrond).
    if (!isNativeApp() && !alarmScheduled) {
      playAlarmNow();
    }
    alarmScheduled = false;
    triggerVibration();
    releaseWakeLock();
    setClockState("done");
    el.status.textContent = "Tijd! Tik op de tijd om te stoppen";
  },
});

initialize();

function initialize() {
  bindEvents();
  hydrateSettings();
  render();
  timer.setDurationMinutes(state.selectedMinutes);
  setClockState("idle");
  registerServiceWorker();
}

function bindEvents() {
  el.tapButtons.forEach((button) => {
    button.addEventListener("click", () => updateScore(button.dataset.team, 1));
  });

  el.minusButtons.forEach((button) => {
    button.addEventListener("click", () => updateScore(button.dataset.team, -1));
  });

  el.clockTime.addEventListener("click", () => {
    if (completed) {
      resetClock();
      return;
    }
    if (timer.isRunning) {
      pauseClock();
    } else {
      startClock();
    }
  });

  el.openSettings.addEventListener("click", openSettings);
  el.closeSettings.addEventListener("click", closeSettings);
  el.sheet.querySelector("[data-close]").addEventListener("click", closeSettings);

  el.presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyMinutes(button.dataset.minutes));
  });

  el.customMinutes.addEventListener("change", () => applyMinutes(el.customMinutes.value));

  el.testAlarm.addEventListener("click", async () => {
    await safePrime();
    playAlarmNow();
  });

  el.resetClock.addEventListener("click", () => {
    resetClock();
    closeSettings();
  });

  el.newMatch.addEventListener("click", () => {
    state.scores.blue = 0;
    state.scores.red = 0;
    resetClock();
    persistState();
    render();
    closeSettings();
  });

  el.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
    closeSettings();
  });

  el.lockBtn.addEventListener("click", lockField);
  el.unlockBtn.addEventListener("pointerdown", startUnlockHold);
  el.unlockBtn.addEventListener("pointerup", cancelUnlockHold);
  el.unlockBtn.addEventListener("pointerleave", cancelUnlockHold);
  el.unlockBtn.addEventListener("pointercancel", cancelUnlockHold);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      timer.tick();
      if (timer.isRunning) {
        requestWakeLock();
      }
      primeAlarm().catch(() => {});
    }
  });
}

/* ---------- Score ---------- */
function updateScore(team, delta) {
  state.scores[team] = Math.max(0, state.scores[team] + delta);
  persistState();
  render();
}

function render() {
  el.blueName.textContent = state.teamBlueName;
  el.redName.textContent = state.teamRedName;
  el.blueScore.textContent = String(state.scores.blue);
  el.redScore.textContent = String(state.scores.red);
  el.minusButtons.forEach((button) => {
    button.disabled = state.scores[button.dataset.team] === 0;
  });
}

/* ---------- Klok ---------- */
function startClock() {
  completed = false;
  timer.start();
  requestWakeLock();

  if (isNativeApp()) {
    // Android-app: plan een lokale notificatie zodat het alarm ook met
    // het scherm op slot afgaat.
    ensureNotificationPermission().then((granted) => {
      if (granted) {
        scheduleEndAlarm(timer.remainingMs);
      }
    });
    return;
  }

  // PWA: audio mag de klok nooit blokkeren: prime + plan het alarm niet-blokkerend in.
  primeAlarm()
    .then(() => {
      alarmScheduled = scheduleAlarmIn(timer.remainingMs / 1000);
    })
    .catch(() => {
      alarmScheduled = false;
      el.status.textContent = "Audio niet klaar — klok loopt wel";
    });
}

function pauseClock() {
  timer.pause();
  stopAlarm();
  cancelEndAlarm();
  alarmScheduled = false;
  releaseWakeLock();
}

function resetClock() {
  completed = false;
  stopAlarm();
  cancelEndAlarm();
  alarmScheduled = false;
  timer.reset();
  releaseWakeLock();
  setClockState("idle");
  el.clockTime.textContent = formatTime(timer.remainingMs);
}

function updateClockUi(isRunning, remainingMs) {
  if (completed) {
    setClockState("done");
    return;
  }
  if (isRunning) {
    setClockState("running");
    el.status.textContent = "Klok loopt — tik om te pauzeren";
  } else if (remainingMs < timer.durationMs) {
    setClockState("paused");
    el.status.textContent = "Gepauzeerd — tik om verder te gaan";
  } else {
    setClockState("idle");
    el.status.textContent = "Tik op de tijd om te starten";
  }
}

function setClockState(stateName) {
  el.clock.dataset.state = stateName;
}

function triggerVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
  }
}

/* ---------- Instellingen ---------- */
function openSettings() {
  hydrateSettings();
  el.sheet.hidden = false;
}

function closeSettings() {
  el.sheet.hidden = true;
}

function hydrateSettings() {
  el.blueNameInput.value = state.teamBlueName;
  el.redNameInput.value = state.teamRedName;
  el.customMinutes.value = String(state.selectedMinutes);
  syncPresets();
}

function applyMinutes(value) {
  state.selectedMinutes = sanitizeMinutes(value);
  completed = false;
  stopAlarm();
  cancelEndAlarm();
  alarmScheduled = false;
  timer.setDurationMinutes(state.selectedMinutes);
  releaseWakeLock();
  el.customMinutes.value = String(state.selectedMinutes);
  el.clockTime.textContent = formatTime(timer.remainingMs);
  setClockState("idle");
  syncPresets();
  persistState();
}

function saveSettings() {
  state.teamBlueName = el.blueNameInput.value.trim() || defaultState.teamBlueName;
  state.teamRedName = el.redNameInput.value.trim() || defaultState.teamRedName;
  applyMinutes(el.customMinutes.value);
  render();
}

function syncPresets() {
  el.presetButtons.forEach((button) => {
    const isActive = Number(button.dataset.minutes) === Number(state.selectedMinutes);
    button.classList.toggle("active", isActive);
  });
}

function sanitizeMinutes(value) {
  return Math.max(1, Math.min(120, Number.parseInt(value, 10) || 1));
}

/* ---------- Veld-slot (vergrendel-modus) ---------- */
let unlockTimer = null;

function lockField() {
  el.lockOverlay.hidden = false;
}

function unlockField() {
  cancelUnlockHold();
  el.lockOverlay.hidden = true;
}

function startUnlockHold(event) {
  event.preventDefault();
  el.unlockBtn.classList.add("holding");
  unlockTimer = window.setTimeout(unlockField, 1500);
}

function cancelUnlockHold() {
  if (unlockTimer !== null) {
    window.clearTimeout(unlockTimer);
    unlockTimer = null;
  }
  el.unlockBtn.classList.remove("holding");
}

/* ---------- Audio helper ---------- */
async function safePrime() {
  try {
    await primeAlarm();
  } catch {
    el.status.textContent = "Audio niet klaar — klok loopt wel";
  }
}

/* ---------- Opslag ---------- */
function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return structuredClone(defaultState);
    }
    const parsed = JSON.parse(saved);
    return {
      teamBlueName: parsed.teamBlueName || defaultState.teamBlueName,
      teamRedName: parsed.teamRedName || defaultState.teamRedName,
      selectedMinutes: sanitizeMinutes(parsed.selectedMinutes ?? defaultState.selectedMinutes),
      scores: {
        blue: Math.max(0, Number(parsed.scores?.blue) || 0),
        red: Math.max(0, Number(parsed.scores?.red) || 0),
      },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

async function registerServiceWorker() {
  if (isNativeApp() || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Stil falen; de app blijft bruikbaar zonder service worker.
  }
}
