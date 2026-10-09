// Genereert de korte waarschuwingspiep (1 minuut resterend) voor de Android-app.
// Eenmalige dev-tooling; de WAV wordt met de android/-map meegecommit.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "android", "app", "src", "main", "res", "raw");
const outFile = join(outDir, "warn_beep.wav");

const sampleRate = 44100;
const durationSec = 0.9;
const totalSamples = Math.floor(sampleRate * durationSec);
const amplitude = 0.72 * 32767;

// Twee heldere piepen: 0.0–0.25 s en 0.4–0.65 s.
function frequencyAt(t) {
  if (t < 0.25) return 1175;
  if (t >= 0.4 && t < 0.65) return 1568;
  return 0;
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
console.log("warn_beep.wav geschreven:", header.length + data.length, "bytes");
