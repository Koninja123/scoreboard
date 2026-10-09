// Uitslagenlijst: opslaan, groeperen per dag en deeltekst maken. Pure functies.

export const HISTORY_LIMIT = 300;

const pad = (n) => String(n).padStart(2, "0");

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatClockTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sortNewestFirst(list) {
  return [...list].sort((a, b) => b.startedAt - a.startedAt);
}

// Voegt een uitslag toe of werkt een bestaande (zelfde id) bij.
export function upsertResult(history, record) {
  const rest = history.filter((r) => r.id !== record.id);
  return sortNewestFirst([record, ...rest]).slice(0, HISTORY_LIMIT);
}

export function removeResult(history, id) {
  return history.filter((r) => r.id !== id);
}

export function formatDayLabel(key, now = Date.now()) {
  if (key === dayKey(now)) return "Vandaag";
  if (key === dayKey(now - 86_400_000)) return "Gisteren";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function formatLongDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Groepen per dag, nieuwste dag bovenaan; binnen een dag nieuwste bovenaan.
export function groupByDay(history, now = Date.now()) {
  const groups = new Map();
  for (const r of sortNewestFirst(history)) {
    const key = dayKey(r.startedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, label: formatDayLabel(key, now), items }));
}

export function formatResultLine(r) {
  const note = r.note ? `  (${r.note})` : "";
  return `${formatClockTime(r.startedAt)}  ${r.blueName} – ${r.redName}  ${r.blue}-${r.red}${note}`;
}

// Tekst voor WhatsApp/mail: uitslagen van één dag in speelvolgorde.
export function buildShareText(key, items) {
  const lines = [...items].sort((a, b) => a.startedAt - b.startedAt).map(formatResultLine);
  return [`Uitslagen ${formatLongDate(key)}`, "", ...lines].join("\n");
}

// Eerder gebruikte teamnamen, meest recent eerst, zonder dubbelen.
export function teamSuggestions(history, limit = 30) {
  const seen = new Set();
  const out = [];
  for (const r of sortNewestFirst(history)) {
    for (const name of [r.blueName, r.redName]) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key) || key === "blauw team" || key === "rood team") continue;
      seen.add(key);
      out.push(name.trim());
      if (out.length >= limit) return out;
    }
  }
  return out;
}
