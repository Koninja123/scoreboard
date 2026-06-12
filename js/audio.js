let audioContext = null;
let scheduledNodes = [];

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export async function primeAlarm() {
  const context = getAudioContext();
  if (!context) {
    throw new Error("AudioContext niet beschikbaar");
  }
  if (context.state === "suspended") {
    await context.resume();
  }
  return true;
}

// Eén korte felle piep, ingepland op een absoluut tijdstip van de audio-klok.
function scheduleBeep(context, startAt, frequency, duration, peak) {
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

  scheduledNodes.push(oscillator, gainNode);
}

// Bouwt een lang, dringend alarm (groepjes van 3 piepen) vanaf een absoluut tijdstip.
function buildAlarm(context, startAt) {
  const groups = 16; // ~19 seconden aanhoudend alarm
  const beepDuration = 0.16;
  const beepGap = 0.09;
  const groupGap = 0.45;
  const peak = 0.45; // fors luider dan voorheen (was 0.18)

  let cursor = startAt;
  for (let group = 0; group < groups; group += 1) {
    for (let beep = 0; beep < 3; beep += 1) {
      const frequency = beep === 1 ? 1319 : 988; // E6 / B5, snijdt door veldrumoer
      scheduleBeep(context, cursor, frequency, beepDuration, peak);
      cursor += beepDuration + beepGap;
    }
    cursor += groupGap;
  }
}

// Plan het alarm in over `seconds` seconden (0 = nu). Geeft true bij succes.
export function scheduleAlarmIn(seconds) {
  const context = getAudioContext();
  if (!context) {
    return false;
  }
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  stopAlarm();
  const startAt = context.currentTime + Math.max(0, seconds);
  buildAlarm(context, startAt);
  return true;
}

export function playAlarmNow() {
  return scheduleAlarmIn(0);
}

export function stopAlarm() {
  const now = audioContext ? audioContext.currentTime : 0;
  for (const node of scheduledNodes) {
    try {
      if (typeof node.stop === "function") {
        node.stop(now);
      }
    } catch {
      // al gestopt
    }
    try {
      node.disconnect();
    } catch {
      // al losgekoppeld
    }
  }
  scheduledNodes = [];
}
