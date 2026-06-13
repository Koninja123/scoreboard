import { CountdownTimer, formatTime } from "./timer.js";
import { primeAlarm, scheduleAlarmIn, playAlarmNow, stopAlarm } from "./audio.js";
import { requestWakeLock, releaseWakeLock } from "./wakelock.js";
import {
  isNativeApp,
  initNativeNotifications,
  ensureNotificationPermission,
  scheduleEndAlarm,
  cancelEndAlarm,
  startForegroundService,
  stopForegroundService,
  updateServiceScores,
  getServiceState,
} from "./native.js";

const STORAGE_KEY = "hockey-scoreboard-state";

const defaultState = {
  teamBlueName: "Blauw team",
  teamRedName:  "Rood team",
  scores:       { blue: 0, red: 0 },
  selectedMinutes: 15,
  period:       1,
  totalPeriods: 2,
};

const el = {
  board:          document.querySelector("#board"),
  blueName:       document.querySelector("#blue-name"),
  redName:        document.querySelector("#red-name"),
  blueScore:      document.querySelector("#blue-score"),
  redScore:       document.querySelector("#red-score"),
  tapButtons:     [...document.querySelectorAll(".team__tap")],
  minusButtons:   [...document.querySelectorAll(".team__minus")],
  clock:          document.querySelector("#clock"),
  clockTime:      document.querySelector("#clock-time"),
  periodBadge:    document.querySelector("#period-badge"),
  status:         document.querySelector("#status"),
  undoBtn:        document.querySelector("#undo-btn"),
  openSettings:   document.querySelector("#open-settings"),
  sheet:          document.querySelector("#settings-sheet"),
  closeSettings:  document.querySelector("#close-settings"),
  settingsForm:   document.querySelector("#settings-form"),
  blueNameInput:  document.querySelector("#blue-name-input"),
  redNameInput:   document.querySelector("#red-name-input"),
  presetButtons:  [...document.querySelectorAll(".preset[data-minutes]")],
  customMinutes:  document.querySelector("#custom-minutes"),
  periodButtons:  [...document.querySelectorAll(".period-preset[data-periods]")],
  testAlarm:      document.querySelector("#test-alarm"),
  resetClock:     document.querySelector("#reset-clock"),
  newMatch:       document.querySelector("#new-match"),
  swapSidesBtn:   document.querySelector("#swap-sides"),
  nextPeriodBtn:  document.querySelector("#next-period"),
  lockBtn:        document.querySelector("#lock-btn"),
  lockOverlay:    document.querySelector("#lock-overlay"),
  unlockBtn:      document.querySelector("#unlock-btn"),
};

let state         = loadState();
let completed     = false;
let alarmScheduled = false;
let undoStack     = [];
let undoHideTimer = null;
let lastSyncMs    = 0;

const timer = new CountdownTimer({
  onTick: ({ remainingMs, isRunning }) => {
    el.clockTime.textContent = formatTime(remainingMs);
    updateClockUi(isRunning, remainingMs);
    if (isNativeApp() && isRunning) {
      const now = Date.now();
      if (now - lastSyncMs > 1000) {
        lastSyncMs = now;
        syncFromService();
      }
    }
  },
  onComplete: () => {
    completed = true;
    if (!isNativeApp() && !alarmScheduled) playAlarmNow();
    alarmScheduled = false;
    stopForegroundService();
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
  initNativeNotifications();
}

function bindEvents() {
  el.tapButtons.forEach((btn) => {
    btn.addEventListener("click", () => updateScore(btn.dataset.team, 1));
  });

  el.minusButtons.forEach((btn) => {
    btn.addEventListener("click", () => updateScore(btn.dataset.team, -1));
  });

  el.undoBtn.addEventListener("click", undoScore);

  el.clockTime.addEventListener("click", () => {
    if (completed) { resetClock(); return; }
    if (timer.isRunning) pauseClock(); else startClock();
  });

  el.openSettings.addEventListener("click", openSettings);
  el.closeSettings.addEventListener("click", closeSettings);
  el.sheet.querySelector("[data-close]").addEventListener("click", closeSettings);

  el.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyMinutes(btn.dataset.minutes));
  });

  el.customMinutes.addEventListener("change", () => applyMinutes(el.customMinutes.value));

  el.periodButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyTotalPeriods(Number(btn.dataset.periods)));
  });

  el.testAlarm.addEventListener("click", async () => {
    await safePrime();
    playAlarmNow();
  });

  el.resetClock.addEventListener("click", () => { resetClock(); closeSettings(); });

  el.newMatch.addEventListener("click", () => {
    state.scores.blue = 0;
    state.scores.red  = 0;
    state.period      = 1;
    undoStack         = [];
    hideUndoBtn();
    resetClock();
    persistState();
    render();
    closeSettings();
  });

  el.swapSidesBtn.addEventListener("click", () => {
    swapSides();
    closeSettings();
  });

  el.nextPeriodBtn.addEventListener("click", () => {
    nextPeriod();
    closeSettings();
  });

  el.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
    closeSettings();
  });

  el.lockBtn.addEventListener("click", lockField);
  el.unlockBtn.addEventListener("pointerdown",  startUnlockHold);
  el.unlockBtn.addEventListener("pointerup",    cancelUnlockHold);
  el.unlockBtn.addEventListener("pointerleave", cancelUnlockHold);
  el.unlockBtn.addEventListener("pointercancel", cancelUnlockHold);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      timer.tick();
      if (timer.isRunning) requestWakeLock();
      primeAlarm().catch(() => {});
    }
  });
}

/* ---------- Score ---------- */
function updateScore(team, delta) {
  undoStack.push({ blue: state.scores.blue, red: state.scores.red });
  if (undoStack.length > 20) undoStack.shift();
  state.scores[team] = Math.max(0, state.scores[team] + delta);
  persistState();
  render();
  updateServiceScores(state.scores.blue, state.scores.red);
  showUndoBtn();
}

function undoScore() {
  if (undoStack.length === 0) return;
  const prev = undoStack.pop();
  state.scores.blue = prev.blue;
  state.scores.red  = prev.red;
  persistState();
  render();
  updateServiceScores(state.scores.blue, state.scores.red);
  if (undoStack.length === 0) hideUndoBtn();
  else showUndoBtn();
}

function showUndoBtn() {
  el.undoBtn.hidden = false;
  if (undoHideTimer) clearTimeout(undoHideTimer);
  undoHideTimer = setTimeout(hideUndoBtn, 8000);
}

function hideUndoBtn() {
  el.undoBtn.hidden = true;
  if (undoHideTimer) { clearTimeout(undoHideTimer); undoHideTimer = null; }
}

function render() {
  el.blueName.textContent  = state.teamBlueName;
  el.redName.textContent   = state.teamRedName;
  el.blueScore.textContent = String(state.scores.blue);
  el.redScore.textContent  = String(state.scores.red);
  el.minusButtons.forEach((btn) => {
    btn.disabled = state.scores[btn.dataset.team] === 0;
  });
  renderPeriodBadge();
  renderPeriodButtons();
}

function renderPeriodBadge() {
  if (state.totalPeriods <= 1) {
    el.periodBadge.hidden = true;
    return;
  }
  const labels = state.totalPeriods === 4
    ? ["K1", "K2", "K3", "K4"]
    : ["H1", "H2"];
  el.periodBadge.textContent = labels[Math.min(state.period, state.totalPeriods) - 1] ?? labels[labels.length - 1];
  el.periodBadge.hidden = false;
}

function renderPeriodButtons() {
  el.periodButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.periods) === state.totalPeriods);
  });
  const canAdvance = state.totalPeriods > 1 && state.period < state.totalPeriods;
  if (el.nextPeriodBtn) el.nextPeriodBtn.hidden = !canAdvance;
}

/* ---------- Klok ---------- */
function startClock() {
  completed = false;
  timer.start();
  requestWakeLock();

  if (isNativeApp()) {
    ensureNotificationPermission().then((granted) => {
      if (granted) {
        scheduleEndAlarm(timer.remainingMs);
        startForegroundService(Date.now() + timer.remainingMs, state.scores.blue, state.scores.red);
      } else {
        primeAlarm()
          .then(() => { alarmScheduled = scheduleAlarmIn(timer.remainingMs / 1000); })
          .catch(() => {});
      }
    });
    return;
  }

  primeAlarm()
    .then(() => { alarmScheduled = scheduleAlarmIn(timer.remainingMs / 1000); })
    .catch(() => {
      alarmScheduled = false;
      el.status.textContent = "Audio niet klaar — klok loopt wel";
    });
}

function pauseClock() {
  timer.pause();
  stopAlarm();
  cancelEndAlarm();
  stopForegroundService();
  alarmScheduled = false;
  releaseWakeLock();
}

function resetClock() {
  completed = false;
  stopAlarm();
  cancelEndAlarm();
  stopForegroundService();
  alarmScheduled = false;
  undoStack = [];
  hideUndoBtn();
  timer.reset();
  releaseWakeLock();
  setClockState("idle");
  el.clockTime.textContent = formatTime(timer.remainingMs);
}

function updateClockUi(isRunning, remainingMs) {
  if (completed) { setClockState("done"); return; }
  if (isRunning) {
    setClockState("running");
    el.status.textContent = "Klok loopt — tik om te pauzeren";
  } else if (remainingMs < timer.durationMs) {
    setClockState("paused");
    el.status.textContent = "Gepauzeerd — tik om verder te gaan";
  } else {
    setClockState("idle");
    const suffix = state.totalPeriods > 1
      ? `  (${state.totalPeriods === 4 ? "Kwart" : "Helft"} ${state.period}/${state.totalPeriods})`
      : "";
    el.status.textContent = "Tik op de tijd om te starten" + suffix;
  }
}

function setClockState(stateName) {
  el.clock.dataset.state = stateName;
}

function triggerVibration() {
  if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
}

/* ---------- Service sync (vergrendelscherm → web) ---------- */
async function syncFromService() {
  try {
    const svc = await getServiceState();
    if (!svc?.running) return;
    if (svc.scoreBlue !== state.scores.blue || svc.scoreRed !== state.scores.red) {
      state.scores.blue = svc.scoreBlue;
      state.scores.red  = svc.scoreRed;
      persistState();
      render();
    }
  } catch {
    // stil falen
  }
}

/* ---------- Perioden & kanten wisselen ---------- */
function swapSides() {
  [state.teamBlueName, state.teamRedName] = [state.teamRedName, state.teamBlueName];
  [state.scores.blue, state.scores.red]   = [state.scores.red, state.scores.blue];
  undoStack = [];
  hideUndoBtn();
  persistState();
  render();
  updateServiceScores(state.scores.blue, state.scores.red);
}

function nextPeriod() {
  if (state.period >= state.totalPeriods) return;
  state.period += 1;
  resetClock();
  persistState();
  render();
}

function applyTotalPeriods(n) {
  state.totalPeriods = n;
  if (state.period > n) state.period = 1;
  persistState();
  render();
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
  el.redNameInput.value  = state.teamRedName;
  el.customMinutes.value = String(state.selectedMinutes);
  syncPresets();
  renderPeriodButtons();
}

function applyMinutes(value) {
  state.selectedMinutes = sanitizeMinutes(value);
  completed = false;
  stopAlarm();
  cancelEndAlarm();
  stopForegroundService();
  alarmScheduled = false;
  timer.setDurationMinutes(state.selectedMinutes);
  releaseWakeLock();
  el.customMinutes.value  = String(state.selectedMinutes);
  el.clockTime.textContent = formatTime(timer.remainingMs);
  setClockState("idle");
  syncPresets();
  persistState();
}

function saveSettings() {
  state.teamBlueName = el.blueNameInput.value.trim() || defaultState.teamBlueName;
  state.teamRedName  = el.redNameInput.value.trim()  || defaultState.teamRedName;
  applyMinutes(el.customMinutes.value);
  render();
}

function syncPresets() {
  el.presetButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.minutes) === Number(state.selectedMinutes));
  });
}

function sanitizeMinutes(value) {
  return Math.max(1, Math.min(120, Number.parseInt(value, 10) || 1));
}

/* ---------- Veld-slot ---------- */
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

/* ---------- Audio ---------- */
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
    if (!saved) return structuredClone(defaultState);
    const p = JSON.parse(saved);
    return {
      teamBlueName:    p.teamBlueName    || defaultState.teamBlueName,
      teamRedName:     p.teamRedName     || defaultState.teamRedName,
      selectedMinutes: sanitizeMinutes(p.selectedMinutes ?? defaultState.selectedMinutes),
      scores: {
        blue: Math.max(0, Number(p.scores?.blue) || 0),
        red:  Math.max(0, Number(p.scores?.red)  || 0),
      },
      period:       Math.max(1, Number(p.period)       || 1),
      totalPeriods: [1, 2, 4].includes(Number(p.totalPeriods)) ? Number(p.totalPeriods) : 2,
    };
  } catch {
    return structuredClone(defaultState);
  }
}

async function registerServiceWorker() {
  if (isNativeApp() || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // stil falen; app werkt zonder SW
  }
}
