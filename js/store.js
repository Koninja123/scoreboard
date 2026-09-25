// App-status: standaardwaarden, opschonen van opgeslagen data en de opslag zelf.
// Pure functies (behalve load/save) zodat ze los te testen zijn.

export const STORAGE_KEY = "hockey-scoreboard-state";

export function newMatchId(now = Date.now()) {
  return `m${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultState(now = Date.now()) {
  return {
    teamBlueName: "Blauw team",
    teamRedName: "Rood team",
    scores: { blue: 0, red: 0 },
    selectedMinutes: 15,
    period: 1,
    totalPeriods: 2,
    swapped: false,
    // remainingMs null = volledige periodeduur
    clock: { running: false, endTimeMs: null, remainingMs: null, completed: false },
    settings: { warnOneMinute: true, autoLock: true, pocketMode: true },
    match: { id: newMatchId(now), started: false, saved: false, startedAt: null },
    history: [],
  };
}

export function sanitizeMinutes(value) {
  return Math.max(1, Math.min(120, Number.parseInt(value, 10) || 1));
}

function nonNegInt(value) {
  return Math.max(0, Math.floor(Number(value)) || 0);
}

function finiteOrNull(value) {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n) ? null : n;
}

function normalizeResult(r) {
  if (!r || typeof r !== "object" || !r.id) return null;
  const startedAt = finiteOrNull(r.startedAt) ?? finiteOrNull(r.endedAt);
  if (startedAt === null) return null;
  return {
    id: String(r.id),
    startedAt,
    endedAt: finiteOrNull(r.endedAt) ?? startedAt,
    blueName: String(r.blueName ?? "Blauw team"),
    redName: String(r.redName ?? "Rood team"),
    blue: nonNegInt(r.blue),
    red: nonNegInt(r.red),
    note: String(r.note ?? ""),
  };
}

// Zet (mogelijk oude of beschadigde) opgeslagen data om naar een geldige status.
export function normalizeState(p, now = Date.now()) {
  const d = createDefaultState(now);
  if (!p || typeof p !== "object") return d;

  const periods = [1, 2, 4].includes(Number(p.totalPeriods)) ? Number(p.totalPeriods) : d.totalPeriods;
  const c = p.clock ?? {};
  const running = Boolean(c.running) && finiteOrNull(c.endTimeMs) !== null;
  const s = p.settings ?? {};
  const m = p.match ?? {};

  return {
    teamBlueName: String(p.teamBlueName || d.teamBlueName),
    teamRedName: String(p.teamRedName || d.teamRedName),
    scores: { blue: nonNegInt(p.scores?.blue), red: nonNegInt(p.scores?.red) },
    selectedMinutes: sanitizeMinutes(p.selectedMinutes ?? d.selectedMinutes),
    period: Math.min(periods, Math.max(1, nonNegInt(p.period) || 1)),
    totalPeriods: periods,
    swapped: Boolean(p.swapped),
    clock: {
      running,
      endTimeMs: running ? Number(c.endTimeMs) : null,
      remainingMs: running ? null : finiteOrNull(c.remainingMs),
      completed: !running && Boolean(c.completed),
    },
    settings: {
      warnOneMinute: s.warnOneMinute !== false,
      autoLock: s.autoLock !== false,
      pocketMode: s.pocketMode !== false,
    },
    match: {
      id: m.id ? String(m.id) : d.match.id,
      started: Boolean(m.started),
      saved: Boolean(m.saved),
      startedAt: finiteOrNull(m.startedAt),
    },
    history: Array.isArray(p.history) ? p.history.map(normalizeResult).filter(Boolean) : [],
  };
}

export function parseState(json, now = Date.now()) {
  if (!json) return null;
  try {
    return normalizeState(JSON.parse(json), now);
  } catch {
    return null;
  }
}
