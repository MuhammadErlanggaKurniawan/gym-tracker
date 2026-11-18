// Pure logic for Gym Tracker: parsing, formatting, stats, rest timer, chart scale.
// No DOM and no storage, so the same file runs in the browser and in `node --test`.
// Ported from the SwiftUI version (~/gym-tracker/GymTracker/Logic).

export const LOCALE = 'id-ID';

const kgFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const kgInputFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, useGrouping: false });
const dateFormats = {
  long: new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dayMonthYear: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }),
  short: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  dayMonth: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
  dateTime: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
};

// ---------- input parsing ----------

/** "" -> 0, "62,5" / "62.5" -> 62.5. Letters, negatives, exponents or absurd values -> null (keep old value). */
export function parseWeight(text) {
  const t = String(text).trim().replaceAll(',', '.');
  if (t === '') return 0;
  if (t === '.' || !/^\d*\.?\d*$/.test(t)) return null;
  const value = Number(t);
  return Number.isFinite(value) && value < 10_000 ? value : null;
}

/** "" -> 0, "8" -> 8, decimals or negatives -> null. */
export function parseReps(text) {
  const t = String(text).trim();
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return null;
  const value = Number(t);
  return value < 10_000 ? value : null;
}

// ---------- formatting ----------

/** 60 -> "60", 62.5 -> "62,5", 1250 -> "1.250" */
export const fmtKg = (value) => kgFormat.format(value);
/** Initial text for an input: no grouping separator, so it parses back cleanly. */
export const fmtKgInput = (value) => kgInputFormat.format(value);
export const fmtDate = (ms, style = 'long') => dateFormats[style].format(new Date(ms));

/** Workout length: 59 s -> "< 1 mnt", 45 min -> "45 mnt", 65 min -> "1 jam 5 mnt" */
export function fmtDuration(seconds) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  if (totalMinutes < 1) return '< 1 mnt';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} mnt`;
  return minutes === 0 ? `${hours} jam` : `${hours} jam ${minutes} mnt`;
}

/** Countdown, rounded up so it never shows 0:00 while time is left: 90 -> "1:30", 0.2 -> "0:01" */
export function fmtClock(seconds) {
  const s = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Stopwatch, rounded down: 65 -> "1:05", 3725 -> "1:02:05" */
export function fmtElapsed(seconds) {
  const s = Math.floor(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------- stats ----------
// A record is a completed set: { exercise, weightKg, reps, date (workout start, ms), order }.

/** Total volume = sum of weight × reps. */
export const volume = (sets) => sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);

/** Per-session summary of one exercise, oldest first. */
export function sessions(exercise, records) {
  const bySession = new Map();
  for (const r of records) {
    if (r.exercise !== exercise) continue;
    if (!bySession.has(r.date)) bySession.set(r.date, []);
    bySession.get(r.date).push(r);
  }
  return [...bySession]
    .map(([date, sets]) => {
      const maxWeight = Math.max(...sets.map((s) => s.weightKg));
      return {
        date,
        maxWeight,
        repsAtMaxWeight: Math.max(...sets.filter((s) => s.weightKg === maxWeight).map((s) => s.reps)),
        maxReps: Math.max(...sets.map((s) => s.reps)),
        volume: volume(sets),
        setCount: sets.length,
      };
    })
    .sort((a, b) => a.date - b.date);
}

/** Personal record: heaviest weight; ties go to more reps, then to whichever came first. */
export function personalRecord(exercise, records) {
  let best = null;
  for (const r of records) {
    if (r.exercise !== exercise) continue;
    const better = !best
      || r.weightKg > best.weightKg
      || (r.weightKg === best.weightKg && (r.reps > best.reps || (r.reps === best.reps && r.date < best.date)));
    if (better) best = r;
  }
  return best;
}

/** Sets from the most recent session of an exercise, in the order they were done. */
export function lastSession(exercise, records) {
  const mine = records.filter((r) => r.exercise === exercise);
  if (mine.length === 0) return [];
  const latest = Math.max(...mine.map((r) => r.date));
  return mine.filter((r) => r.date === latest).sort((a, b) => a.order - b.order);
}

/** Unique names, keeping the order of first appearance. */
export const uniqueInOrder = (names) => [...new Set(names)];

/** "60 kg × 8", or "12 reps" for bodyweight sets. */
export const setText = (s) => (s.weightKg > 0 ? `${fmtKg(s.weightKg)} kg × ${s.reps}` : `${s.reps} reps`);

/** Compact "last time" hint: "60 × 8 · 62,5 × 5 · 12 reps" */
export const summaryLine = (sets) =>
  sets.map((s) => (s.weightKg > 0 ? `${fmtKg(s.weightKg)} × ${s.reps}` : `${s.reps} reps`)).join(' · ');

export const METRICS = {
  weight: { title: 'Beban', unit: 'kg', value: (s) => s.maxWeight, text: (s) => `${fmtKg(s.maxWeight)} kg × ${s.repsAtMaxWeight}` },
  volume: { title: 'Volume', unit: 'kg', value: (s) => s.volume, text: (s) => `${fmtKg(s.volume)} kg` },
  reps: { title: 'Reps', unit: 'reps', value: (s) => s.maxReps, text: (s) => `${s.maxReps} reps` },
};

// ---------- rest timer ----------
// Stores the end time instead of ticking a counter, so it stays right while the page sleeps.

export function startRest(nowMs, seconds) {
  const duration = Math.max(0, seconds);
  return { endAt: nowMs + duration * 1000, duration };
}

export const restRemaining = (rest, nowMs) => Math.max(0, (rest.endAt - nowMs) / 1000);

/** 0 = just started, 1 = done. */
export function restProgress(rest, nowMs) {
  if (rest.duration <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - restRemaining(rest, nowMs) / rest.duration));
}

/** Add or remove time from the current rest only. Never pushes the end into the past. */
export function adjustRest(rest, deltaSeconds, nowMs) {
  const endAt = Math.max(nowMs, rest.endAt + deltaSeconds * 1000);
  return { endAt, duration: Math.max(0, rest.duration + (endAt - rest.endAt) / 1000) };
}

// ---------- chart ----------

/** Y axis for a line chart: fitted to the data (a zero baseline flattens small gains) with round ticks. */
export function niceScale(values, tickCount = 4) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rawStep - 1e-12);
  let lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  if (values.every((v) => v >= 0)) lo = Math.max(0, lo);
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { min: lo, max: hi, ticks };
}
