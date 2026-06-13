// Genereert een luid alarmgeluid (WAV) voor de Android-meldingen.
// Eenmalige dev-tooling; de WAV wordt met de android/-map meegecommit.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "android", "app", "src", "main", "res", "raw");
const outFile = join(outDir, "alarm_buzzer.wav");

const sampleRate = 44100;
const durationSec = 4;
const totalSamples = Math.floor(sampleRate * durationSec);
const amplitude = 0.72 * 32767;

// Groepjes van 3 felle piepen, afwisselend hoog, met pauzes — een dringend alarm.
function frequencyAt(t) {
  const beep = 0.16;
  const gap = 0.09;
  const slot = beep + gap;
  const cycle = t % 1.2;
  if (cycle >= 3 * slot) {
    return 0;
  }
  const index = Math.floor(cycle / slot);
  const within = cycle - index * slot;
  if (within >= beep) {
    return 0;
  }
  return index === 1 ? 1319 : 988;
}

const data = Buffer.alloc(totalSamples * 2);
for (let i = 0; i < totalSamples; i += 1) {
  const t = i / sampleRate;
  const f = frequencyAt(t);
  const sample = f > 0 ? Math.sign(Math.sin(2 * Math.PI * f * t)) * amplitude : 0;
  data.writeInt16LE(sample | 0, i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

await mkdir(outDir, { recursive: true });
await writeFile(outFile, Buffer.concat([header, data]));
console.log("alarm_buzzer.wav geschreven:", header.length + data.length, "bytes");
