let audioContext = null;

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

export async function playAlarm() {
  const context = getAudioContext();

  if (!context) {
    throw new Error("AudioContext niet beschikbaar");
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const now = context.currentTime;
  const beepCount = 6;
  for (let index = 0; index < beepCount; index += 1) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startAt = now + index * 0.32;
    const stopAt = startAt + 0.26;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index % 2 === 0 ? 988 : 740, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.4, startAt + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  return true;
}