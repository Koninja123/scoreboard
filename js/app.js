import { playAlarm, primeAlarm } from "./audio.js";
import { CountdownTimer, formatTime } from "./timer.js";
import { requestWakeLock, releaseWakeLock } from "./wakelock.js";

const STORAGE_KEY = "hockey-scoreboard-state";

const defaultState = {
  teamBlueName: "Blauw team",
  teamRedName: "Rood team",
  scores: {
    blue: 0,
    red: 0,
  },
  selectedMinutes: 15,
};

const elements = {
  settingsForm: document.querySelector("#settings-form"),
  teamBlueNameInput: document.querySelector("#team-blue-name"),
  teamRedNameInput: document.querySelector("#team-red-name"),
  customMinutesInput: document.querySelector("#custom-minutes"),
  applyCustomTimeButton: document.querySelector("#apply-custom-time"),
  toggleSetupButton: document.querySelector("#toggle-setup-button"),
  setupContent: document.querySelector("#setup-content"),
  newMatchButton: document.querySelector("#new-match-button"),
  teamBlueNameDisplay: document.querySelector("#team-blue-display"),
  teamRedNameDisplay: document.querySelector("#team-red-display"),
  teamBlueScore: document.querySelector("#team-blue-score"),
  teamRedScore: document.querySelector("#team-red-score"),
  scoreButtons: [...document.querySelectorAll(".score-button")],
  presetButtons: [...document.querySelectorAll(".preset-button")],
  timerDisplay: document.querySelector("#timer-display"),
  timerStatus: document.querySelector("#timer-status"),
  timerPanel: document.querySelector(".timer-panel"),
  timeUpBanner: document.querySelector("#time-up-banner"),
  startButton: document.querySelector("#start-button"),
  pauseButton: document.querySelector("#pause-button"),
  resetButton: document.querySelector("#reset-button"),
};

let state = loadState();
let timerCompleted = false;

const timer = new CountdownTimer({
  onTick: ({ remainingMs, isRunning }) => {
    elements.timerDisplay.textContent = formatTime(remainingMs);
    updateTimerButtons(isRunning, remainingMs);

    if (timerCompleted) {
      elements.timerStatus.textContent = "Tijd verstreken";
      return;
    }

    if (isRunning) {
      elements.timerStatus.textContent = "Klok loopt";
      return;
    }

    if (remainingMs < timer.durationMs) {
      elements.timerStatus.textContent = "Gepauzeerd";
      return;
    }

    elements.timerStatus.textContent = "Klaar om te starten";
  },
  onComplete: async () => {
    timerCompleted = true;
    updateTimerEndState();
    updateTimerButtons(false, 0);
    releaseWakeLock();
    triggerVibration();
    elements.timerStatus.textContent = "Tijd verstreken";

    try {
      await playAlarm();
    } catch {
      elements.timerStatus.textContent = "Tijd verstreken - controleer audio-instellingen";
    }
  },
});

initialize();

function initialize() {
  bindEvents();
  hydrateInputs();
  applyStateToView();
  timer.setDurationMinutes(state.selectedMinutes);
  updateTimerEndState();
  registerServiceWorker();
}

function bindEvents() {
  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNames();
  });

  elements.applyCustomTimeButton.addEventListener("click", () => {
    applySelectedMinutes(elements.customMinutesInput.value);
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const minutes = sanitizeMinutes(button.dataset.minutes);
      elements.customMinutesInput.value = String(minutes);
      applySelectedMinutes(minutes);
    });
  });

  elements.scoreButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const team = button.dataset.team;
      const delta = Number(button.dataset.delta);
      updateScore(team, delta);
    });
  });

  elements.startButton.addEventListener("click", async () => {
    if (timer.isRunning) {
      return;
    }

    timerCompleted = false;
    updateTimerEndState();
    elements.startButton.disabled = true;
    await safePrimeAlarm();
    timer.start();
    requestWakeLock();
  });

  elements.pauseButton.addEventListener("click", () => {
    timer.pause();
    releaseWakeLock();
  });

  elements.resetButton.addEventListener("click", () => {
    timerCompleted = false;
    timer.reset();
    releaseWakeLock();
    updateTimerEndState();
    updateTimerButtons(false, timer.remainingMs);
  });

  elements.toggleSetupButton.addEventListener("click", () => {
    const isHidden = elements.setupContent.classList.toggle("hidden");
    elements.toggleSetupButton.textContent = isHidden ? "Toon" : "Verberg";
    elements.toggleSetupButton.setAttribute("aria-expanded", String(!isHidden));
  });

  elements.newMatchButton.addEventListener("click", () => {
    state.scores.blue = 0;
    state.scores.red = 0;
    timerCompleted = false;
    timer.reset();
    releaseWakeLock();
    updateTimerEndState();
    updateTimerButtons(false, timer.remainingMs);
    persistState();
    applyStateToView();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      timer.tick();
      if (timer.isRunning) {
        requestWakeLock();
      }
    }
  });
}

function saveNames() {
  state.teamBlueName = elements.teamBlueNameInput.value.trim() || defaultState.teamBlueName;
  state.teamRedName = elements.teamRedNameInput.value.trim() || defaultState.teamRedName;
  persistState();
  applyStateToView();
}

function updateScore(team, delta) {
  const nextScore = Math.max(0, state.scores[team] + delta);
  state.scores[team] = nextScore;
  persistState();
  applyStateToView();
}

function applyStateToView() {
  elements.teamBlueNameDisplay.textContent = state.teamBlueName;
  elements.teamRedNameDisplay.textContent = state.teamRedName;
  elements.teamBlueScore.textContent = String(state.scores.blue);
  elements.teamRedScore.textContent = String(state.scores.red);
  updateScoreButtons();
  syncPresetButtons();
}

function updateScoreButtons() {
  elements.scoreButtons.forEach((button) => {
    if (Number(button.dataset.delta) < 0) {
      button.disabled = state.scores[button.dataset.team] === 0;
    }
  });
}

function triggerVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate([300, 150, 300, 150, 600]);
  }
}

function hydrateInputs() {
  elements.teamBlueNameInput.value = state.teamBlueName;
  elements.teamRedNameInput.value = state.teamRedName;
  elements.customMinutesInput.value = String(state.selectedMinutes);
}

function applySelectedMinutes(value) {
  const minutes = sanitizeMinutes(value);
  state.selectedMinutes = minutes;
  timerCompleted = false;
  elements.customMinutesInput.value = String(minutes);
  persistState();
  syncPresetButtons();
  timer.setDurationMinutes(minutes);
  updateTimerEndState();
}

function updateTimerEndState() {
  elements.timerPanel.classList.toggle("time-up", timerCompleted);
  elements.timeUpBanner.hidden = !timerCompleted;
}

function updateTimerButtons(isRunning, remainingMs) {
  elements.startButton.disabled = isRunning || timerCompleted || remainingMs === 0;
  elements.pauseButton.disabled = !isRunning;
}

function syncPresetButtons() {
  elements.presetButtons.forEach((button) => {
    const isActive = Number(button.dataset.minutes) === Number(state.selectedMinutes);
    button.classList.toggle("active", isActive);
  });
}

function sanitizeMinutes(value) {
  return Math.max(1, Math.min(120, Number.parseInt(value, 10) || 1));
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (!savedState) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(savedState);
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

async function safePrimeAlarm() {
  try {
    await primeAlarm();
  } catch {
    elements.timerStatus.textContent = "Audio niet klaar, timer start wel";
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Stil falen; de app blijft bruikbaar zonder service worker.
  }
}
