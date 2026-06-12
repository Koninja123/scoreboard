// Genereert de PNG-iconen uit het bestaande SVG-ontwerp.
// Eenmalige dev-tooling: de gehoste app blijft puur statisch.
// Gebruik: npm install (eenmalig) en daarna `npm run icons`.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "icons");

// Volvlaks vierkant (geen ronde hoeken): iOS en Android passen zelf hun masker toe.
// De witte kaart blijft binnen de veilige zone, dus ook bruikbaar als 'maskable'.
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b5394"/>
      <stop offset="100%" stop-color="#b51f30"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="64" y="104" width="384" height="304" rx="64" fill="#ffffff" fill-opacity="0.92"/>
  <text x="256" y="232" text-anchor="middle" font-size="88" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#102033">12:00</text>
  <text x="170" y="336" text-anchor="middle" font-size="92" font-family="Segoe UI, Arial, sans-serif" font-weight="800" fill="#0b5394">2</text>
  <text x="342" y="336" text-anchor="middle" font-size="92" font-family="Segoe UI, Arial, sans-serif" font-weight="800" fill="#b51f30">1</text>
</svg>`;

const targets = [
  { size: 180, file: "icon-180.png" },
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" },
  { size: 512, file: "icon-512-maskable.png" },
];

await mkdir(outDir, { recursive: true });

for (const { size, file } of targets) {
  await sharp(Buffer.from(masterSvg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, file));
  console.log(`✓ ${file} (${size}x${size})`);
}
