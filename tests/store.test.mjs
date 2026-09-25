import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeState, parseState, sanitizeMinutes } from "../js/store.js";

test("lege of kapotte opslag geeft standaardstatus", () => {
  assert.equal(parseState(null), null);
  assert.equal(parseState("{kapot"), null);
  const s = normalizeState(undefined);
  assert.deepEqual(s.scores, { blue: 0, red: 0 });
  assert.equal(s.clock.running, false);
  assert.equal(s.settings.warnOneMinute, true);
  assert.deepEqual(s.history, []);
});

test("oude opslag (vorige app-versie) wordt aangevuld", () => {
  const old = { teamBlueName: "HC A", teamRedName: "HC B", scores: { blue: 2, red: 1 },
    selectedMinutes: 35, period: 2, totalPeriods: 2, swapped: true };
  const s = normalizeState(old);
  assert.equal(s.teamBlueName, "HC A");
  assert.deepEqual(s.scores, { blue: 2, red: 1 });
  assert.equal(s.period, 2);
  assert.equal(s.swapped, true);
  assert.equal(s.clock.completed, false);
  assert.ok(s.match.id);
  assert.equal(s.settings.autoLock, true);
});

test("lopende klok blijft bewaard, zonder eindtijd niet", () => {
  const running = normalizeState({ clock: { running: true, endTimeMs: 123456 } });
  assert.equal(running.clock.running, true);
  assert.equal(running.clock.endTimeMs, 123456);
  const broken = normalizeState({ clock: { running: true } });
  assert.equal(broken.clock.running, false);
});

test("ongeldige waarden worden begrensd", () => {
  const s = normalizeState({ scores: { blue: -3, red: "x" }, totalPeriods: 3, period: 9, selectedMinutes: 999 });
  assert.deepEqual(s.scores, { blue: 0, red: 0 });
  assert.equal(s.totalPeriods, 2);
  assert.equal(s.period, 2);
  assert.equal(s.selectedMinutes, 120);
  assert.equal(sanitizeMinutes("0"), 1);
});

test("instellingen die uit staan blijven uit", () => {
  const s = normalizeState({ settings: { warnOneMinute: false, autoLock: false, pocketMode: false } });
  assert.deepEqual(s.settings, { warnOneMinute: false, autoLock: false, pocketMode: false });
});

test("uitslagen zonder id of tijd worden weggefilterd", () => {
  const s = normalizeState({ history: [
    { id: "a", startedAt: 1000, blueName: "X", redName: "Y", blue: 1, red: 0 },
    { startedAt: 1000 },
    { id: "b" },
  ] });
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].note, "");
});

test("roundtrip via JSON", () => {
  const d = createDefaultState(0);
  assert.deepEqual(parseState(JSON.stringify(d)), d);
});
