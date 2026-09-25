// Web-audio voor de PWA (iPhone/browser). In de Android-app speelt de native
// kant het alarm af. Let op: in de browser klinkt dit alleen zolang de app open
// is en het scherm aan staat.
let audioContext = null;
let alarmNodes = [];
let warnNodes = [];
let alarmWindow = null; // { start, end } in audio-klok seconden

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export async function primeAlarm() {
  // iPhone (Safari 17+): speel als "media" af, zodat de stil-schakelaar het
  // alarm niet dempt.
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {
    // niet ondersteund
  }
  const context = getAudioContext();
  if (!context) throw new Error("AudioContext niet beschikbaar");
  if (context.state === "suspended") await context.resume();
  return true;
}

function scheduleBeep(context, list, startAt, frequency, duration, peak) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };

  list.push(oscillator, gainNode);
}

function stopNodes(list) {
  const now = audioContext ? audioContext.currentTime : 0;
  for (const node of list) {
    try {
      if (typeof node.stop === "function") node.stop(now);
    } catch {
      // al gestopt
    }
    try {
      node.disconnect();
    } catch {
      // al losgekoppeld
    }
  }
  list.length = 0;
}

function contextOrNull() {
  const context = getAudioContext();
  if (!context) return null;
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

// Lang, dringend alarm (groepjes van 3 piepen, ~55 s) over `seconds` seconden.
export function scheduleAlarmIn(seconds) {
  const context = contextOrNull();
  if (!context) return false;
  stopNodes(alarmNodes);
  const startAt = context.currentTime + Math.max(0, seconds);
  const groups = 46;
  const beepDuration = 0.16;
  const beepGap = 0.09;
  const groupGap = 0.45;

  let cursor = startAt;
  for (let group = 0; group < groups; group += 1) {
    for (let beep = 0; beep < 3; beep += 1) {
      const frequency = beep === 1 ? 1319 : 988; // E6 / B5, snijdt door veldrumoer
      scheduleBeep(context, alarmNodes, cursor, frequency, beepDuration, 0.45);
      cursor += beepDuration + beepGap;
    }
    cursor += groupGap;
  }
  alarmWindow = { start: startAt, end: cursor };
  return true;
}

// Korte dubbele piep (1 minuut resterend) over `seconds` seconden.
export function scheduleWarningIn(seconds) {
  const context = contextOrNull();
  if (!context) return false;
  stopNodes(warnNodes);
  const startAt = context.currentTime + Math.max(0, seconds);
  scheduleBeep(context, warnNodes, startAt, 1175, 0.25, 0.4);
  scheduleBeep(context, warnNodes, startAt + 0.4, 1568, 0.25, 0.4);
  return true;
}

export function playAlarmNow() {
  return scheduleAlarmIn(0);
}

export function isAlarmPlaying() {
  if (!audioContext || !alarmWindow) return false;
  const t = audioContext.currentTime;
  return t >= alarmWindow.start && t < alarmWindow.end;
}

export function stopAlarm() {
  stopNodes(alarmNodes);
  alarmWindow = null;
}

export function stopAll() {
  stopAlarm();
  stopNodes(warnNodes);
}
