// Kopieert de statische web-app naar www/ zodat Capacitor het kan inpakken.
// De service worker wordt bewust NIET meegekopieerd: in de native app zijn de
// assets al lokaal en zou een SW alleen maar in de weg zitten.
import { rm, mkdir, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const items = ["index.html", "manifest.webmanifest", "js", "styles", "assets"];

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

for (const item of items) {
  await cp(join(root, item), join(www, item), { recursive: true });
}

console.log("www/ gebouwd uit:", items.join(", "));
