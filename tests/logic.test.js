// Ported from ~/gym-tracker/Tests/LogicTests/main.swift, plus chart-scale tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

test('parseWeight', () => {
  assert.equal(L.parseWeight('62,5'), 62.5);
  assert.equal(L.parseWeight('62.5'), 62.5);
  assert.equal(L.parseWeight(''), 0, 'empty = bodyweight');
  assert.equal(L.parseWeight(' 80 '), 80);
  assert.equal(L.parseWeight('5,'), 5, 'mid-typing state');
  for (const bad of ['abc', '-5', 'nan', 'inf', '99999', '1e3', '.', '6,2,5']) assert.equal(L.parseWeight(bad), null, bad);
});

test('parseReps', () => {
  assert.equal(L.parseReps('8'), 8);
  assert.equal(L.parseReps(''), 0);
  for (const bad of ['8.5', '-1', 'x', '8,5']) assert.equal(L.parseReps(bad), null, bad);
});

test('fmtKg and round trip', () => {
  assert.equal(L.fmtKg(60), '60');
  assert.equal(L.fmtKg(62.5), '62,5');
  assert.equal(L.fmtKg(62.25), '62,25');
  assert.equal(L.fmtKg(1250), '1.250');
  assert.equal(L.fmtKgInput(1250), '1250');
  for (const v of [62.5, 1250, 0.25, 100]) assert.equal(L.parseWeight(L.fmtKgInput(v)), v);
});

test('durations and clocks', () => {
  assert.equal(L.fmtDuration(59), '< 1 mnt');
  assert.equal(L.fmtDuration(60), '1 mnt');
  assert.equal(L.fmtDuration(2700), '45 mnt');
  assert.equal(L.fmtDuration(3600), '1 jam');
  assert.equal(L.fmtDuration(3900), '1 jam 5 mnt');
  assert.equal(L.fmtDuration(-5), '< 1 mnt');
  assert.equal(L.fmtClock(90), '1:30');
  assert.equal(L.fmtClock(0.2), '0:01');
  assert.equal(L.fmtClock(0), '0:00');
  assert.equal(L.fmtClock(59.5), '1:00');
  assert.equal(L.fmtClock(600), '10:00');
  assert.equal(L.fmtElapsed(65), '1:05');
  assert.equal(L.fmtElapsed(3725), '1:02:05');
  assert.equal(L.fmtElapsed(0), '0:00');
});

const d1 = 1_700_000_000_000;
const d2 = d1 + 86_400_000 * 3;
const d3 = d2 + 86_400_000 * 4;
const r = (exercise, weightKg, reps, date, order) => ({ exercise, weightKg, reps, date, order });
const records = [
  r('Bench Press', 62.5, 5, d1, 2), r('Bench Press', 60, 8, d1, 0), r('Bench Press', 60, 8, d1, 1),
  r('Squat', 100, 5, d1, 3),
  r('Bench Press', 65, 2, d2, 2), r('Bench Press', 62.5, 6, d2, 0), r('Bench Press', 65, 3, d2, 1),
  r('Pull Up', 0, 8, d1, 4), r('Pull Up', 0, 10, d2, 3),
];

test('sessions', () => {
  assert.equal(L.volume(records.filter((x) => x.exercise === 'Bench Press' && x.date === d1)), 1272.5);
  const bench = L.sessions('Bench Press', records);
  assert.deepEqual(bench.map((s) => s.date), [d1, d2]);
  assert.deepEqual(bench[0], { date: d1, maxWeight: 62.5, repsAtMaxWeight: 5, maxReps: 8, volume: 1272.5, setCount: 3 });
  assert.equal(bench[1].maxWeight, 65);
  assert.equal(bench[1].repsAtMaxWeight, 3, 'best reps at the top weight');
  assert.equal(bench[1].volume, 700);
  assert.deepEqual(L.sessions('Deadlift', records), []);
});

test('personalRecord', () => {
  assert.deepEqual(L.personalRecord('Bench Press', records), r('Bench Press', 65, 3, d2, 1));
  assert.equal(L.personalRecord('Bench Press', [...records, r('Bench Press', 65, 3, d3, 0)]).date, d2, 'tie keeps the first time');
  assert.equal(L.personalRecord('Deadlift', records), null);
  assert.equal(L.personalRecord('Pull Up', records).reps, 10, 'bodyweight PR = most reps');
});

test('lastSession, uniqueInOrder, text helpers', () => {
  assert.deepEqual(L.lastSession('Bench Press', records).map((x) => x.weightKg), [62.5, 65, 65]);
  assert.deepEqual(L.lastSession('Deadlift', records), []);
  assert.deepEqual(L.uniqueInOrder(['B', 'A', 'B', 'C', 'A']), ['B', 'A', 'C']);
  assert.equal(L.setText({ weightKg: 60, reps: 8 }), '60 kg × 8');
  assert.equal(L.setText({ weightKg: 0, reps: 12 }), '12 reps');
  assert.equal(L.summaryLine([{ weightKg: 60, reps: 8 }, { weightKg: 62.5, reps: 5 }, { weightKg: 0, reps: 12 }]), '60 × 8 · 62,5 × 5 · 12 reps');
});

test('metrics', () => {
  const bench = L.sessions('Bench Press', records);
  assert.equal(L.METRICS.weight.value(bench[1]), 65);
  assert.equal(L.METRICS.volume.value(bench[1]), 700);
  assert.equal(L.METRICS.reps.value(bench[0]), 8);
  assert.equal(L.METRICS.weight.text(bench[1]), '65 kg × 3');
  assert.equal(L.METRICS.volume.text(bench[0]), '1.272,5 kg');
});

test('rest timer', () => {
  const t0 = 1_000_000;
  let rest = L.startRest(t0, 90);
  assert.equal(L.restRemaining(rest, t0 + 30_000), 60);
  assert.ok(Math.abs(L.restProgress(rest, t0 + 30_000) - 1 / 3) < 1e-9);
  assert.equal(L.restRemaining(rest, t0 + 100_000), 0, 'never negative');
  rest = L.adjustRest(rest, 15, t0 + 30_000);
  assert.equal(L.restRemaining(rest, t0 + 30_000), 75);
  assert.equal(rest.duration, 105);
  rest = L.adjustRest(rest, -200, t0 + 30_000);
  assert.equal(L.restRemaining(rest, t0 + 30_000), 0, 'big minus ends the rest now');
  assert.equal(rest.endAt, t0 + 30_000, 'end clamps to now');
  assert.equal(rest.duration, 30);
  assert.equal(L.restProgress(rest, t0 + 30_000), 1);
  assert.equal(L.startRest(t0, -10).duration, 0);
  assert.equal(L.restProgress(L.startRest(t0, 0), t0), 1);
});

test('niceScale', () => {
  assert.deepEqual(L.niceScale([55, 57.5, 57.5, 60, 60, 62.5]), { min: 54, max: 64, ticks: [54, 56, 58, 60, 62, 64] });
  const vol = L.niceScale([1200, 1375]);
  assert.ok(vol.min <= 1200 && vol.max >= 1375 && vol.min > 0, 'fitted, not from zero');
  const flat = L.niceScale([60]);
  assert.ok(flat.min < 60 && flat.max > 60, 'single value gets padding');
  assert.equal(L.niceScale([0, 0]).min, 0, 'never below zero for non-negative data');
  for (const s of [L.niceScale([8, 10, 12, 15, 18, 20]), vol, flat]) {
    assert.equal(s.ticks[0], s.min);
    assert.equal(s.ticks.at(-1), s.max);
  }
});
