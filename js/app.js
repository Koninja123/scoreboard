import { CountdownTimer, formatTime } from "./timer.js";
import * as audio from "./audio.js";
import { requestWakeLock, releaseWakeLock } from "./wakelock.js";
import * as native from "./native.js";
import { STORAGE_KEY, createDefaultState, newMatchId, parseState, sanitizeMinutes } from "./store.js";
import {
  upsertResult, removeResult, groupByDay, buildShareText, formatClockTime, teamSuggestions,
} from "./history.js";
import { bindHold } from "./hold.js";

const HOLD_MS         = 600;   // vasthouden voor score / pauze
const UNLOCK_MS       = 1500;  // vasthouden om te ontgrendelen
const AUTO_LOCK_MS    = 10_000;
const WARN_BEFORE_MS  = 60_000;
const LATE_ALARM_MS   = 30_000; // alarm niet meer afspelen als de tijd al langer voorbij is

const isNative = native.isNativeApp();

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
  suggestions:    document.querySelector("#team-suggestions"),
  presetButtons:  [...document.querySelectorAll(".preset[data-minutes]")],
  customMinutes:  document.querySelector("#custom-minutes"),
  periodButtons:  [...document.querySelectorAll(".period-preset[data-periods]")],
  optWarn:        document.querySelector("#opt-warn"),
  optAutoLock:    document.querySelector("#opt-autolock"),
  optPocket:      document.querySelector("#opt-pocket"),
  optPocketRow:   document.querySelector("#opt-pocket-row"),
  batteryBtn:     document.querySelector("#battery-btn"),
  testAlarm:      document.querySelector("#test-alarm"),
  testWarn:       document.querySelector("#test-warn"),
  resetClock:     document.querySelector("#reset-clock"),
  newMatch:       document.querySelector("#new-match"),
  swapSidesBtn:   document.querySelector("#swap-sides"),
  nextPeriodBtn:  document.querySelector("#next-period"),
  lockBtn:        document.querySelector("#lock-btn"),
  lockOverlay:    document.querySelector("#lock-overlay"),
  unlockBtn:      document.querySelector("#unlock-btn"),
  alarmOverlay:   document.querySelector("#alarm-overlay"),
  alarmStop:      document.querySelector("#alarm-stop"),
  openResults:    document.querySelector("#open-results"),
  resultsSheet:   document.querySelector("#results-sheet"),
  closeResults:   document.querySelector("#close-results"),
  resultsList:    document.querySelector("#results-list"),
  resultsClear:   document.querySelector("#results-clear"),
};

let state           = createDefaultState();
let undoStack       = [];
let undoHideTimer   = null;
let hintTimer       = null;
let alarmActive     = false;
let alarmHideTimer  = null;
let lastInteraction = Date.now();
let editingResultId = null;

const timer = new CountdownTimer({
  onTick: ({ remainingMs, isRunning }) => {
    el.clockTime.textContent = formatTime(remainingMs);
    updateClockUi(isRunning, remainingMs);
  },
  onComplete: ({ endTime }) => handleComplete(endTime),
});

initialize();

async function initialize() {
  state = await loadState();
  bindEvents();
  timer.setDurationMinutes(state.selectedMinutes);
  render();
  hydrateSettings();
  restoreClock();
  registerServiceWorker();
  window.setInterval(autoLockCheck, 1000);

  if (isNative) {
    native.onAlarmState(setAlarmActive);
    refreshNativeAlarm();
    refreshCapabilities();
    pushNativeClock();
  }
}

/* ---------- Events ---------- */
function bindEvents() {
  el.tapButtons.forEach((btn) => {
    bindHold(btn, {
      duration: HOLD_MS,
      onHold: () => updateScore(btn.dataset.team, 1),
      onTap: () => showHint("Houd vast voor een doelpunt"),
    });
  });

  el.minusButtons.forEach((btn) => {
    bindHold(btn, {
      duration: HOLD_MS,
      onHold: () => updateScore(btn.dataset.team, -1),
      onTap: () => showHint("Houd −1 vast om een doelpunt eraf te halen"),
    });
  });

  el.undoBtn.addEventListener("click", undoScore);

  bindHold(el.clockTime, {
    duration: HOLD_MS,
    onTap: onClockTap,
    onHold: () => (timer.isRunning ? pauseClock() : onClockTap()),
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

  el.optWarn.addEventListener("change", () => updateSetting("warnOneMinute", el.optWarn.checked));
  el.optAutoLock.addEventListener("change", () => updateSetting("autoLock", el.optAutoLock.checked));
  el.optPocket.addEventListener("change", () => updateSetting("pocketMode", el.optPocket.checked));
  el.batteryBtn.addEventListener("click", async () => {
    await native.requestBatteryExemption();
    setTimeout(refreshCapabilities, 1500);
  });

  el.testAlarm.addEventListener("click", testAlarm);
  el.testWarn.addEventListener("click", testWarning);

  el.resetClock.addEventListener("click", () => {
    if (isClockTouched() && !confirm("Klok resetten naar het begin van deze periode?")) return;
    resetClock();
    closeSettings();
  });

  el.newMatch.addEventListener("click", () => {
    if (isMatchTouched() && !confirm("Nieuwe wedstrijd starten? De huidige stand wordt opgeslagen bij de uitslagen.")) return;
    newMatch();
  });

  el.swapSidesBtn.addEventListener("click", () => { swapSides(); closeSettings(); });
  el.nextPeriodBtn.addEventListener("click", () => { nextPeriod(); closeSettings(); });

  el.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
    closeSettings();
  });

  el.lockBtn.addEventListener("click", lockField);
  bindHold(el.unlockBtn, { duration: UNLOCK_MS, onHold: unlockField, moveTolerance: 30 });

  el.alarmStop.addEventListener("click", stopAlarmNow);

  el.openResults.addEventListener("click", openResults);
  el.closeResults.addEventListener("click", closeResults);
  el.resultsSheet.querySelector("[data-close]").addEventListener("click", closeResults);
  el.resultsClear.addEventListener("click", clearResults);

  // Alleen bewuste acties (en werken in een menu) stellen de auto-vergrendeling
  // uit — niet elk contact, anders houdt schuren in de broekzak hem open.
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".sheet")) noteInteraction();
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer.isRunning && state.settings.autoLock) lockField();
      return;
    }
    timer.tick();
    if (timer.isRunning) requestWakeLock();
    if (isNative) { refreshNativeAlarm(); refreshCapabilities(); }
    else audio.primeAlarm().catch(() => {});
  });
}

/* ---------- Score ---------- */
function updateScore(team, delta) {
  if (delta < 0 && state.scores[team] === 0) return;
  undoStack.push({ blue: state.scores.blue, red: state.scores.red });
  if (undoStack.length > 20) undoStack.shift();
  state.scores[team] = Math.max(0, state.scores[team] + delta);
  markMatchStarted();
  refreshSavedResult();
  persistState();
  render();
  pushNativeClock();
  showUndoBtn();
  noteInteraction();
}

function undoScore() {
  if (undoStack.length === 0) return;
  const prev = undoStack.pop();
  noteInteraction();
  state.scores.blue = prev.blue;
  state.scores.red  = prev.red;
  refreshSavedResult();
  persistState();
  render();
  pushNativeClock();
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
  el.board.classList.toggle("board--swapped", state.swapped);
  renderPeriodBadge();
  renderPeriodButtons();
}

function periodLabel() {
  if (state.totalPeriods <= 1) return "";
  return `${state.totalPeriods === 4 ? "K" : "H"}${Math.min(state.period, state.totalPeriods)}`;
}

function renderPeriodBadge() {
  const label = periodLabel();
  el.periodBadge.hidden = !label;
  el.periodBadge.textContent = label;
}

function renderPeriodButtons() {
  el.periodButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.periods) === state.totalPeriods);
  });
  el.nextPeriodBtn.hidden = !(state.totalPeriods > 1 && state.period < state.totalPeriods);
}

/* ---------- Klok ---------- */
function onClockTap() {
  if (alarmActive) { stopAlarmNow(); return; }
  if (state.clock.completed) {
    if (state.period < state.totalPeriods) nextPeriod();
    else showHint("Wedstrijd klaar — nieuwe wedstrijd via ⚙", 4000);
    return;
  }
  if (timer.isRunning) { showHint("Houd de tijd vast om te pauzeren"); return; }
  startClock();
}

function startClock() {
  if (state.clock.completed || timer.remainingMs <= 0) return;
  timer.start();
  noteInteraction();
  state.clock = { running: true, endTimeMs: timer.endTime, remainingMs: null, completed: false };
  markMatchStarted();
  persistState();
  onRunningChanged();
}

function pauseClock() {
  timer.pause();
  noteInteraction();
  state.clock = { running: false, endTimeMs: null, remainingMs: timer.remainingMs, completed: false };
  persistState();
  onRunningChanged();
}

function resetClock() {
  stopAlarmNow();
  timer.reset();
  state.clock = { running: false, endTimeMs: null, remainingMs: null, completed: false };
  undoStack = [];
  hideUndoBtn();
  persistState();
  onRunningChanged();
}

// Herstel de klok na (her)openen van de app.
function restoreClock() {
  const c = state.clock;
  if (c.running && c.endTimeMs) {
    if (c.endTimeMs > Date.now()) {
      timer.resumeUntil(c.endTimeMs);
      onRunningChanged();
    } else {
      timer.setRemaining(0);
      handleComplete(c.endTimeMs);
    }
  } else if (c.completed) {
    timer.setRemaining(0);
    setClockState("done");
    el.status.textContent = completedStatus();
  } else if (c.remainingMs !== null) {
    timer.setRemaining(c.remainingMs);
  }
}

// Alles wat moet gebeuren als de klok start/stopt: alarm plannen, scherm aan,
// native service bijwerken.
function onRunningChanged() {
  const running = timer.isRunning;
  if (running) requestWakeLock(); else releaseWakeLock();

  if (isNative) {
    if (running) native.ensureNotificationPermission();
    pushNativeClock();
    native.setFieldMode({ keepAwake: running, proximity: running && state.settings.pocketMode });
    return;
  }

  audio.stopAll();
  if (!running) return;
  const remaining = timer.remainingMs;
  audio.primeAlarm()
    .then(() => {
      audio.scheduleAlarmIn(remaining / 1000);
      if (state.settings.warnOneMinute && remaining > WARN_BEFORE_MS + 500) {
        audio.scheduleWarningIn((remaining - WARN_BEFORE_MS) / 1000);
      }
    })
    .catch(() => { el.status.textContent = "Audio niet klaar — klok loopt wel"; });
}

function handleComplete(endTime) {
  const late = Date.now() - (endTime ?? Date.now()) > LATE_ALARM_MS;
  state.clock = { running: false, endTimeMs: null, remainingMs: 0, completed: true };
  releaseWakeLock();

  if (isNative) {
    // De native service speelt het alarm en zet zelf de klok stil; hier niet
    // setClock(running:false) sturen, anders wordt dat alarm afgebroken.
    native.setFieldMode({ keepAwake: false, proximity: false });
    // Optimistisch: de service start het alarm binnen een halve seconde en
    // meldt de echte stand via het "alarmState"-event.
    if (!late) setAlarmActive(true);
  } else if (!late) {
    if (!audio.isAlarmPlaying()) audio.playAlarmNow();
    setAlarmActive(true);
    if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
  }

  if (state.period >= state.totalPeriods) saveResult();
  persistState();
  setClockState("done");
  el.status.textContent = completedStatus();
}

function completedStatus() {
  const hasNext = state.totalPeriods > 1 && state.period < state.totalPeriods;
  const unit = state.totalPeriods === 4 ? "kwart" : "helft";
  return hasNext
    ? `Tijd! Tik op de tijd voor ${unit} ${state.period + 1}`
    : "Einde wedstrijd — uitslag opgeslagen";
}

function isClockTouched() {
  return timer.isRunning || state.clock.completed || timer.remainingMs < timer.durationMs;
}

function updateClockUi(isRunning, remainingMs) {
  if (state.clock.completed && !isRunning) { setClockState("done"); return; }
  const clockState = isRunning ? "running" : remainingMs < timer.durationMs ? "paused" : "idle";
  setClockState(clockState);
  if (hintTimer) return;
  if (clockState === "running") {
    el.status.textContent = "Klok loopt — houd de tijd vast om te pauzeren";
  } else if (clockState === "paused") {
    el.status.textContent = "Gepauzeerd — tik op de tijd om verder te gaan";
  } else {
    const suffix = state.totalPeriods > 1
      ? `  (${state.totalPeriods === 4 ? "Kwart" : "Helft"} ${state.period}/${state.totalPeriods})`
      : "";
    el.status.textContent = "Tik op de tijd om te starten" + suffix;
  }
}

function setClockState(stateName) {
  el.clock.dataset.state = stateName;
}

function showHint(text, ms = 2500) {
  el.status.textContent = text;
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hintTimer = null;
    if (state.clock.completed) el.status.textContent = completedStatus();
    else timer.emitTick();
  }, ms);
}

/* ---------- Alarm ---------- */
function setAlarmActive(active) {
  alarmActive = active;
  el.alarmOverlay.hidden = !active;
  if (alarmHideTimer) { clearTimeout(alarmHideTimer); alarmHideTimer = null; }
  // Web-alarm duurt ~55 s; daarna verdwijnt de stopknop vanzelf.
  if (active && !isNative) alarmHideTimer = setTimeout(() => setAlarmActive(false), 60_000);
}

function stopAlarmNow() {
  if (isNative) native.stopNativeAlarm();
  audio.stopAll();
  setAlarmActive(false);
}

async function refreshNativeAlarm() {
  setAlarmActive(await native.isNativeAlarmActive());
}

async function testAlarm() {
  if (isNative) { native.testNativeAlarm(); return; }
  try {
    await audio.primeAlarm();
    audio.playAlarmNow();
    setTimeout(() => { if (!alarmActive) audio.stopAlarm(); }, 4000);
  } catch {
    el.status.textContent = "Audio niet klaar";
  }
}

async function testWarning() {
  if (isNative) { native.testNativeWarning(); return; }
  try {
    await audio.primeAlarm();
    audio.scheduleWarningIn(0);
  } catch {
    el.status.textContent = "Audio niet klaar";
  }
}

/* ---------- Native ---------- */
function pushNativeClock() {
  if (!isNative) return;
  // Na het eindsignaal beheert de service zelf de klok (zie handleComplete).
  if (state.clock.completed && alarmActive) return;
  native.setNativeClock({
    running: timer.isRunning,
    endTimeMs: timer.isRunning ? Math.round(timer.endTime) : null,
    remainingMs: Math.round(timer.remainingMs),
    warnEnabled: state.settings.warnOneMinute,
    scoreBlue: state.scores.blue,
    scoreRed: state.scores.red,
    nameBlue: state.teamBlueName,
    nameRed: state.teamRedName,
    periodLabel: periodLabel(),
  });
}

async function refreshCapabilities() {
  if (!isNative) return;
  const caps = await native.getCapabilities();
  el.optPocketRow.hidden = !caps.proximitySupported;
  el.batteryBtn.hidden = caps.batteryUnrestricted !== false;
}

/* ---------- Perioden & kanten wisselen ---------- */
// Wisselt alleen de schermpositie van de twee helften: elke ploeg houdt z'n
// kleur, naam én score.
function swapSides() {
  state.swapped = !state.swapped;
  persistState();
  render();
}

function nextPeriod() {
  if (state.period >= state.totalPeriods) return;
  state.period += 1;
  resetClock();
  persistState();
  render();
  pushNativeClock();
}

function applyTotalPeriods(n) {
  state.totalPeriods = n;
  if (state.period > n) state.period = 1;
  persistState();
  render();
}

/* ---------- Wedstrijd & uitslagen ---------- */
function markMatchStarted() {
  if (state.match.started) return;
  state.match.started = true;
  state.match.startedAt = Date.now();
}

function isMatchTouched() {
  return state.match.started || state.scores.blue > 0 || state.scores.red > 0 || isClockTouched();
}

function saveResult() {
  if (!state.match.started) markMatchStarted();
  const existing = state.history.find((r) => r.id === state.match.id);
  state.history = upsertResult(state.history, {
    id: state.match.id,
    startedAt: existing?.startedAt ?? state.match.startedAt ?? Date.now(),
    endedAt: existing?.endedAt ?? Date.now(),
    blueName: state.teamBlueName,
    redName: state.teamRedName,
    blue: state.scores.blue,
    red: state.scores.red,
    note: existing?.note ?? "",
  });
  state.match.saved = true;
}

// Correctie na het eindsignaal (ongedaan maken, naam aanpassen) meteen doorvoeren.
function refreshSavedResult() {
  if (state.match.saved) saveResult();
}

function newMatch() {
  if (state.match.started && !state.match.saved) saveResult();
  state.scores   = { blue: 0, red: 0 };
  state.period   = 1;
  state.swapped  = false;
  state.match    = { id: newMatchId(), started: false, saved: false, startedAt: null };
  undoStack = [];
  hideUndoBtn();
  resetClock();
  persistState();
  render();
  hydrateSettings();
  pushNativeClock();
  showHint("Nieuwe wedstrijd — vul de teamnamen in", 3000);
}

function openResults() {
  editingResultId = null;
  renderResults();
  el.resultsSheet.hidden = false;
}

function closeResults() {
  el.resultsSheet.hidden = true;
}

function clearResults() {
  if (state.history.length === 0) return;
  if (!confirm(`Alle ${state.history.length} uitslagen wissen? Dit kan niet ongedaan worden.`)) return;
  state.history = [];
  state.match.saved = false;
  persistState();
  renderResults();
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResults() {
  const list = el.resultsList;
  list.replaceChildren();
  el.resultsClear.hidden = state.history.length === 0;

  if (state.history.length === 0) {
    list.append(make("p", "results__empty",
      "Nog geen uitslagen. Een wedstrijd wordt automatisch opgeslagen na de laatste periode of bij “Nieuwe wedstrijd”."));
    return;
  }

  for (const group of groupByDay(state.history)) {
    const head = make("div", "results__day");
    head.append(make("h3", "", `${group.label} (${group.items.length})`));
    const share = make("button", "results__share", "Delen");
    share.type = "button";
    share.addEventListener("click", () => shareText(buildShareText(group.key, group.items)));
    head.append(share);
    list.append(head);

    for (const r of group.items) list.append(renderResultItem(r));
  }
}

function renderResultItem(r) {
  const item = make("div", "result");
  const row = make("button", "result__row");
  row.type = "button";
  row.append(
    make("span", "result__time", formatClockTime(r.startedAt)),
    make("span", "result__teams", `${r.blueName} – ${r.redName}`),
    make("span", "result__score", `${r.blue}-${r.red}`),
  );
  if (r.note) row.append(make("span", "result__note", r.note));
  row.addEventListener("click", () => {
    editingResultId = editingResultId === r.id ? null : r.id;
    renderResults();
  });
  item.append(row);

  if (editingResultId === r.id) item.append(renderResultEditor(r));
  return item;
}

function renderResultEditor(r) {
  const form = make("form", "result__edit");
  const blue = Object.assign(make("input"), { type: "number", min: "0", max: "99", value: String(r.blue), inputMode: "numeric" });
  const red  = Object.assign(make("input"), { type: "number", min: "0", max: "99", value: String(r.red), inputMode: "numeric" });
  const note = Object.assign(make("input"), { type: "text", maxLength: 40, value: r.note, placeholder: "Notitie (veld, poule…)" });
  blue.setAttribute("aria-label", `Doelpunten ${r.blueName}`);
  red.setAttribute("aria-label", `Doelpunten ${r.redName}`);

  const scores = make("div", "result__scores");
  scores.append(blue, make("span", "", "–"), red);

  const save = make("button", "btn btn--primary", "Opslaan");
  save.type = "submit";
  const del = make("button", "btn btn--ghost", "Verwijderen");
  del.type = "button";
  del.addEventListener("click", () => {
    if (!confirm(`Uitslag ${r.blueName} – ${r.redName} verwijderen?`)) return;
    state.history = removeResult(state.history, r.id);
    if (r.id === state.match.id) state.match.saved = false;
    editingResultId = null;
    persistState();
    renderResults();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.history = upsertResult(state.history, {
      ...r,
      blue: Math.max(0, Number.parseInt(blue.value, 10) || 0),
      red: Math.max(0, Number.parseInt(red.value, 10) || 0),
      note: note.value.trim(),
    });
    editingResultId = null;
    persistState();
    renderResults();
  });

  const actions = make("div", "result__actions");
  actions.append(del, save);
  form.append(scores, note, actions);
  return form;
}

async function shareText(text) {
  if (isNative) { native.shareNative(text); return; }
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("Uitslagen gekopieerd — plak ze in WhatsApp of een mail.");
  } catch {
    prompt("Kopieer de uitslagen:", text);
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
  el.redNameInput.value  = state.teamRedName;
  el.customMinutes.value = String(state.selectedMinutes);
  el.optWarn.checked     = state.settings.warnOneMinute;
  el.optAutoLock.checked = state.settings.autoLock;
  el.optPocket.checked   = state.settings.pocketMode;
  el.suggestions.replaceChildren(
    ...teamSuggestions(state.history).map((name) => Object.assign(document.createElement("option"), { value: name })),
  );
  syncPresets();
  renderPeriodButtons();
}

function updateSetting(key, value) {
  state.settings[key] = value;
  persistState();
  if (timer.isRunning) onRunningChanged();
}

function applyMinutes(value) {
  const minutes = sanitizeMinutes(value);
  el.customMinutes.value = String(minutes);
  if (minutes === state.selectedMinutes) { syncPresets(); return; }
  if (isClockTouched() && !confirm("Speeltijd wijzigen? De klok van deze periode wordt dan gereset.")) {
    el.customMinutes.value = String(state.selectedMinutes);
    return;
  }
  state.selectedMinutes = minutes;
  timer.setDurationMinutes(minutes);
  resetClock();
  syncPresets();
}

function saveSettings() {
  state.teamBlueName = el.blueNameInput.value.trim() || "Blauw team";
  state.teamRedName  = el.redNameInput.value.trim()  || "Rood team";
  applyMinutes(el.customMinutes.value);
  refreshSavedResult();
  persistState();
  render();
  pushNativeClock();
}

function syncPresets() {
  el.presetButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.minutes) === Number(state.selectedMinutes));
  });
}

/* ---------- Veld-slot ---------- */
function lockField() {
  el.lockOverlay.hidden = false;
}

function unlockField() {
  el.lockOverlay.hidden = true;
  noteInteraction();
}

function noteInteraction() {
  lastInteraction = Date.now();
}

function autoLockCheck() {
  if (!state.settings.autoLock || !timer.isRunning) return;
  if (!el.lockOverlay.hidden || !el.sheet.hidden || !el.resultsSheet.hidden) return;
  if (Date.now() - lastInteraction >= AUTO_LOCK_MS) lockField();
}

/* ---------- Opslag ---------- */
function persistState() {
  const json = JSON.stringify(state);
  try { localStorage.setItem(STORAGE_KEY, json); } catch { /* vol of geblokkeerd */ }
  if (isNative) native.saveNativeState(json);
}

async function loadState() {
  let local = null;
  try { local = localStorage.getItem(STORAGE_KEY); } catch { /* geblokkeerd */ }
  // In de Android-app is de native kopie leidend (WebView-opslag kan worden opgeruimd).
  const nativeJson = isNative ? await native.loadNativeState() : null;
  return parseState(nativeJson) ?? parseState(local) ?? createDefaultState();
}

async function registerServiceWorker() {
  if (isNative || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // stil falen; app werkt zonder SW
  }
}
