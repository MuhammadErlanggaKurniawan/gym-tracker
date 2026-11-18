// Data model and persistence. Functions take the state object and change it in place;
// the caller saves afterwards. Storage is injected so tests can use a fake one.
import { fmtDuration, fmtKg, lastSession, uniqueInOrder, volume } from './logic.js';

export const STORAGE_KEY = 'gymtracker.v1';
export const MUSCLE_GROUPS = ['Dada', 'Punggung', 'Bahu', 'Kaki', 'Lengan', 'Perut', 'Lainnya'];

const SEED_EXERCISES = [
  ['Bench Press', 'Dada'], ['Incline Bench Press', 'Dada'], ['Dumbbell Press', 'Dada'], ['Chest Fly', 'Dada'], ['Push Up', 'Dada'],
  ['Deadlift', 'Punggung'], ['Pull Up', 'Punggung'], ['Lat Pulldown', 'Punggung'], ['Barbell Row', 'Punggung'], ['Seated Cable Row', 'Punggung'],
  ['Overhead Press', 'Bahu'], ['Lateral Raise', 'Bahu'], ['Face Pull', 'Bahu'],
  ['Squat', 'Kaki'], ['Leg Press', 'Kaki'], ['Romanian Deadlift', 'Kaki'], ['Leg Curl', 'Kaki'], ['Leg Extension', 'Kaki'], ['Lunge', 'Kaki'], ['Calf Raise', 'Kaki'],
  ['Bicep Curl', 'Lengan'], ['Hammer Curl', 'Lengan'], ['Tricep Pushdown', 'Lengan'], ['Skull Crusher', 'Lengan'],
  ['Crunch', 'Perut'], ['Hanging Leg Raise', 'Perut'],
];

export function defaultState() {
  return {
    version: 1,
    exercises: SEED_EXERCISES.map(([name, group]) => ({ name, group })),
    routines: [],
    workouts: [],
    settings: { restSeconds: 90 },
    rest: null,
  };
}

const newId = () => crypto.randomUUID();

// ---------- persistence ----------

/** Loads saved data. Unreadable data is copied to a separate key, never silently overwritten. */
export function load(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { state: defaultState(), problem: null };
  try {
    return { state: normalize(JSON.parse(raw)), problem: null };
  } catch {
    const backupKey = `${STORAGE_KEY}.unreadable.${Date.now()}`;
    storage.setItem(backupKey, raw);
    return { state: defaultState(), problem: backupKey };
  }
}

export function save(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Checks the shape of saved data or a backup file. Throws if it isn't Gym Tracker data. */
export function normalize(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.exercises) || !Array.isArray(data.routines) || !Array.isArray(data.workouts)) {
    throw new Error('Format data tidak dikenali');
  }
  for (const w of data.workouts) {
    const okSets = Array.isArray(w.sets) && w.sets.every((s) => typeof s.exercise === 'string' && typeof s.weightKg === 'number' && typeof s.reps === 'number');
    if (typeof w.id !== 'string' || typeof w.startedAt !== 'number' || !okSets) throw new Error('Data latihan rusak');
  }
  const defaults = defaultState();
  return {
    ...defaults,
    ...data,
    settings: { ...defaults.settings, ...data.settings },
    rest: data.rest && typeof data.rest.endAt === 'number' ? data.rest : null,
  };
}

// ---------- workouts ----------

export const orderedSets = (w) => [...w.sets].sort((a, b) => a.order - b.order);
/** Exercises in the order they were first added. */
export const exerciseNamesOf = (w) => uniqueInOrder(orderedSets(w).map((s) => s.exercise));
export const setsOf = (w, exercise) => orderedSets(w).filter((s) => s.exercise === exercise);
export const doneSets = (w) => orderedSets(w).filter((s) => s.done);
export const recordsOf = (w) =>
  doneSets(w).map((s) => ({ exercise: s.exercise, weightKg: s.weightKg, reps: s.reps, date: w.startedAt, order: s.order }));

export const activeWorkout = (state) => state.workouts.find((w) => w.finishedAt === null) ?? null;
export const finishedWorkouts = (state) =>
  state.workouts.filter((w) => w.finishedAt !== null).sort((a, b) => b.startedAt - a.startedAt);
/** Checked sets from finished workouts only (the one in progress is excluded). */
export const finishedRecords = (state) => finishedWorkouts(state).flatMap(recordsOf);

export function workoutSummary(w) {
  const seconds = ((w.finishedAt ?? Date.now()) - w.startedAt) / 1000;
  return `${fmtDuration(seconds)} · ${exerciseNamesOf(w).length} gerakan · ${doneSets(w).length} set · ${fmtKg(volume(recordsOf(w)))} kg`;
}

export function addSet(w, exercise, weightKg = 0, reps = 0) {
  const order = w.sets.reduce((max, s) => Math.max(max, s.order), -1) + 1;
  const set = { id: newId(), exercise, order, weightKg, reps, done: false };
  w.sets.push(set);
  return set;
}

/** Adds an exercise pre-filled with what was done last time (or one empty set). */
export function addPrefilled(w, exercise, history) {
  const last = lastSession(exercise, history);
  if (last.length === 0) addSet(w, exercise);
  else for (const r of last) addSet(w, exercise, r.weightKg, r.reps);
}

export function startWorkout(state, routine, now) {
  if (activeWorkout(state)) throw new Error('Masih ada latihan yang berjalan');
  const w = { id: newId(), title: routine?.name ?? 'Latihan Bebas', startedAt: now, finishedAt: null, sets: [] };
  const history = finishedRecords(state);
  for (const name of routine?.exerciseNames ?? []) addPrefilled(w, name, history);
  state.workouts.push(w);
  return w;
}

export function removeSet(w, setId) {
  w.sets = w.sets.filter((s) => s.id !== setId);
}

export function removeExercise(w, exercise) {
  w.sets = w.sets.filter((s) => s.exercise !== exercise);
}

/** Saves the active workout. Unchecked sets are dropped. */
export function finishWorkout(state, now) {
  const w = activeWorkout(state);
  w.sets = w.sets.filter((s) => s.done);
  w.finishedAt = now;
  return w;
}

export function cancelWorkout(state) {
  state.workouts = state.workouts.filter((w) => w.finishedAt !== null);
}

export function deleteWorkout(state, id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
}

// ---------- exercises & routines ----------

/** Adds a custom exercise. Returns null for empty names or duplicates (case-insensitive). */
export function addExercise(state, name, group = 'Lainnya') {
  const clean = name.trim();
  if (!clean || state.exercises.some((e) => e.name.toLowerCase() === clean.toLowerCase())) return null;
  const exercise = { name: clean, group };
  state.exercises.push(exercise);
  return exercise;
}

export const sortedRoutines = (state) => [...state.routines].sort((a, b) => a.name.localeCompare(b.name, 'id'));

export function saveRoutine(state, { id, name, exerciseNames }) {
  const existing = id ? state.routines.find((r) => r.id === id) : null;
  if (existing) {
    existing.name = name;
    existing.exerciseNames = [...exerciseNames];
    return existing;
  }
  const routine = { id: newId(), name, exerciseNames: [...exerciseNames], createdAt: Date.now() };
  state.routines.push(routine);
  return routine;
}

export function deleteRoutine(state, id) {
  state.routines = state.routines.filter((r) => r.id !== id);
}

// ---------- export ----------

const csvCell = (value) => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** One row per completed set, oldest first. Plain "." decimals so pandas/Excel read it as numbers. */
export function toCSV(state) {
  const rows = [['tanggal', 'latihan', 'gerakan', 'set', 'beban_kg', 'reps']];
  for (const w of finishedWorkouts(state).reverse()) {
    const date = new Date(w.startedAt).toISOString();
    for (const name of exerciseNamesOf(w)) {
      setsOf(w, name).forEach((s, i) => rows.push([date, w.title, name, i + 1, s.weightKg, s.reps]));
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}
