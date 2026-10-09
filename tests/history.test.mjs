import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upsertResult, removeResult, groupByDay, buildShareText, teamSuggestions, dayKey, formatDayLabel, HISTORY_LIMIT,
} from "../js/history.js";

const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();
const r = (id, startedAt, extra = {}) => ({
  id, startedAt, endedAt: startedAt, blueName: "HC A", redName: "HC B", blue: 1, red: 0, note: "", ...extra,
});

test("upsert voegt toe en werkt bij op id", () => {
  let h = upsertResult([], r("a", at(2026, 9, 26, 10, 0)));
  h = upsertResult(h, r("b", at(2026, 9, 26, 11, 0)));
  h = upsertResult(h, r("a", at(2026, 9, 26, 10, 0), { blue: 3 }));
  assert.deepEqual(h.map((x) => x.id), ["b", "a"]);
  assert.equal(h.find((x) => x.id === "a").blue, 3);
  assert.deepEqual(removeResult(h, "a").map((x) => x.id), ["b"]);
});

test("lijst is begrensd", () => {
  let h = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) h = upsertResult(h, r(`m${i}`, i * 1000));
  assert.equal(h.length, HISTORY_LIMIT);
  assert.equal(h[0].id, `m${HISTORY_LIMIT + 4}`);
});

test("groeperen per dag met labels", () => {
  const now = at(2026, 9, 26, 18, 0);
  const groups = groupByDay([
    r("a", at(2026, 9, 26, 9, 0)),
    r("b", at(2026, 9, 25, 14, 0)),
    r("c", at(2026, 9, 26, 12, 0)),
    r("d", at(2026, 9, 20, 12, 0)),
  ], now);
  assert.deepEqual(groups.map((g) => g.label.slice(0, 8)), ["Vandaag", "Gisteren", formatDayLabel(dayKey(at(2026, 9, 20, 12, 0)), now).slice(0, 8)]);
  assert.deepEqual(groups[0].items.map((x) => x.id), ["c", "a"]);
});

test("deeltekst in speelvolgorde met notitie", () => {
  const items = [
    r("b", at(2026, 9, 26, 11, 5), { blueName: "HC C", redName: "HC D", blue: 0, red: 0, note: "veld 2" }),
    r("a", at(2026, 9, 26, 10, 0), { blue: 2, red: 1 }),
  ];
  const text = buildShareText(dayKey(items[0].startedAt), items);
  const lines = text.split("\n");
  assert.match(lines[0], /^Uitslagen .*26 september 2026$/);
  assert.equal(lines[2], "10:00  HC A – HC B  2-1");
  assert.equal(lines[3], "11:05  HC C – HC D  0-0  (veld 2)");
});

test("teamnamen-suggesties zonder dubbelen en standaardnamen", () => {
  const h = [
    r("a", 2000, { blueName: "HC A", redName: "Rood team" }),
    r("b", 1000, { blueName: "hc a ", redName: "HC B" }),
  ];
  assert.deepEqual(teamSuggestions(h), ["HC A", "HC B"]);
});
