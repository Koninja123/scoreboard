export class CountdownTimer {
  constructor({ onTick, onComplete }) {
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.durationMs = 15 * 60 * 1000;
    this.remainingMs = this.durationMs;
    this.endTime = null;
    this.intervalId = null;
    this.isRunning = false;
  }

  setDurationMinutes(minutes) {
    const safeMinutes = Math.max(1, Math.min(120, Number(minutes) || 1));
    this.durationMs = safeMinutes * 60 * 1000;
    this.remainingMs = this.durationMs;
    this.isRunning = false;
    this.endTime = null;
    this.stopTicking();
    this.emitTick();
  }

  start() {
    if (this.isRunning || this.remainingMs <= 0) {
      return;
    }

    this.endTime = Date.now() + this.remainingMs;
    this.isRunning = true;
    this.stopTicking();
    this.tick();
    this.intervalId = window.setInterval(() => this.tick(), 250);
  }

  pause() {
    if (!this.isRunning) {
      return;
    }

    this.remainingMs = Math.max(0, this.endTime - Date.now());
    this.isRunning = false;
    this.endTime = null;
    this.stopTicking();
    this.emitTick();
  }

  reset() {
    this.isRunning = false;
    this.endTime = null;
    this.remainingMs = this.durationMs;
    this.stopTicking();
    this.emitTick();
  }

  tick() {
    if (!this.isRunning) {
      return;
    }

    this.remainingMs = Math.max(0, this.endTime - Date.now());
    this.emitTick();

    if (this.remainingMs === 0) {
      this.isRunning = false;
      this.endTime = null;
      this.stopTicking();
      this.onComplete();
    }
  }

  emitTick() {
    this.onTick({
      remainingMs: this.remainingMs,
      durationMs: this.durationMs,
      isRunning: this.isRunning,
    });
  }

  stopTicking() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export function formatTime(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}