import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../store.js';

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

function finishedWorkout(state, title, startedAt, sets) {
  const w = S.startWorkout(state, null, startedAt);
  w.title = title;
  for (const [exercise, weightKg, reps] of sets) S.addSet(w, exercise, weightKg, reps).done = true;
  S.finishWorkout(state, startedAt + 3_600_000);
  return w;
}

test('fresh state has seeded exercises and nothing else', () => {
  const { state, problem } = S.load(fakeStorage());
  assert.equal(problem, null);
  assert.equal(state.exercises.length, 26);
  assert.deepEqual([state.routines, state.workouts, state.settings.restSeconds], [[], [], 90]);
});

test('save then load round-trips', () => {
  const storage = fakeStorage();
  const state = S.defaultState();
  finishedWorkout(state, 'A', 1000, [['Squat', 100, 5]]);
  S.save(storage, state);
  assert.deepEqual(S.load(storage).state, state);
});

test('unreadable data is preserved under another key, not overwritten', () => {
  const storage = fakeStorage({ [S.STORAGE_KEY]: '{broken json' });
  const { state, problem } = S.load(storage);
  assert.ok(problem.startsWith(`${S.STORAGE_KEY}.unreadable.`));
  assert.equal(storage.getItem(problem), '{broken json');
  assert.equal(state.workouts.length, 0);
});

test('normalize rejects foreign or broken data', () => {
  assert.throws(() => S.normalize({ hello: 1 }));
  assert.throws(() => S.normalize({ version: 1, exercises: [], routines: [], workouts: [{ id: 'x', startedAt: 'today', sets: [] }] }));
  assert.throws(() => S.normalize({ version: 1, exercises: [], routines: [], workouts: [{ id: 'x', startedAt: 1, sets: [{ exercise: 'A', weightKg: '60', reps: 8 }] }] }));
  const ok = S.normalize({ version: 1, exercises: [], routines: [], workouts: [] });
  assert.equal(ok.settings.restSeconds, 90, 'missing settings get defaults');
  assert.equal(ok.rest, null);
});

test('starting from a routine pre-fills from the last session', () => {
  const state = S.defaultState();
  finishedWorkout(state, 'Push', 1000, [['Bench Press', 60, 8], ['Bench Press', 60, 6]]);
  finishedWorkout(state, 'Push', 5000, [['Bench Press', 62.5, 8], ['Bench Press', 62.5, 7], ['Bench Press', 62.5, 6]]);
  const routine = S.saveRoutine(state, { name: 'Push', exerciseNames: ['Bench Press', 'Pull Up'] });
  const w = S.startWorkout(state, routine, 9000);
  assert.equal(w.title, 'Push');
  assert.deepEqual(S.setsOf(w, 'Bench Press').map((s) => [s.weightKg, s.reps, s.done]), [[62.5, 8, false], [62.5, 7, false], [62.5, 6, false]]);
  assert.deepEqual(S.setsOf(w, 'Pull Up').map((s) => [s.weightKg, s.reps]), [[0, 0]], 'new exercise gets one empty set');
  assert.deepEqual(S.exerciseNamesOf(w), ['Bench Press', 'Pull Up']);
  assert.throws(() => S.startWorkout(state, null, 9500), /berjalan/);
});

test('finishing drops unchecked sets; active workout is excluded from history', () => {
  const state = S.defaultState();
  const w = S.startWorkout(state, null, 1000);
  S.addSet(w, 'Squat', 100, 5).done = true;
  S.addSet(w, 'Squat', 100, 5);
  assert.equal(S.finishedRecords(state).length, 0, 'in-progress sets are not history');
  S.finishWorkout(state, 2000);
  assert.equal(w.sets.length, 1);
  assert.equal(S.activeWorkout(state), null);
  assert.equal(S.finishedRecords(state).length, 1);
});

test('cancel removes only the active workout', () => {
  const state = S.defaultState();
  finishedWorkout(state, 'Old', 1000, [['Squat', 100, 5]]);
  S.startWorkout(state, null, 5000);
  S.cancelWorkout(state);
  assert.deepEqual(state.workouts.map((w) => w.title), ['Old']);
});

test('set order survives removing and adding sets', () => {
  const state = S.defaultState();
  const w = S.startWorkout(state, null, 1000);
  const a = S.addSet(w, 'Squat');
  S.addSet(w, 'Bench Press');
  S.addSet(w, 'Squat');
  S.removeSet(w, a.id);
  S.addSet(w, 'Squat');
  assert.deepEqual(S.exerciseNamesOf(w), ['Bench Press', 'Squat']);
  assert.equal(S.setsOf(w, 'Squat').length, 2);
  S.removeExercise(w, 'Squat');
  assert.deepEqual(S.exerciseNamesOf(w), ['Bench Press']);
});

test('custom exercises are de-duplicated case-insensitively', () => {
  const state = S.defaultState();
  assert.equal(S.addExercise(state, 'bench press'), null);
  assert.equal(S.addExercise(state, '   '), null);
  assert.deepEqual(S.addExercise(state, ' Hip Thrust '), { name: 'Hip Thrust', group: 'Lainnya' });
});

test('routines: edit in place, sort by name, delete', () => {
  const state = S.defaultState();
  const legs = S.saveRoutine(state, { name: 'Leg Day', exerciseNames: ['Squat'] });
  S.saveRoutine(state, { name: 'Arm Day', exerciseNames: ['Bicep Curl'] });
  S.saveRoutine(state, { id: legs.id, name: 'Leg Day', exerciseNames: ['Calf Raise', 'Squat'] });
  assert.equal(state.routines.length, 2);
  assert.deepEqual(legs.exerciseNames, ['Calf Raise', 'Squat']);
  assert.deepEqual(S.sortedRoutines(state).map((r) => r.name), ['Arm Day', 'Leg Day']);
  S.deleteRoutine(state, legs.id);
  assert.deepEqual(state.routines.map((r) => r.name), ['Arm Day']);
});

test('summary line and CSV export', () => {
  const state = S.defaultState();
  finishedWorkout(state, 'Push, "Heavy"', Date.UTC(2026, 10, 15, 14, 0), [['Bench Press', 62.5, 8], ['Bench Press', 62.5, 6], ['Push Up', 0, 20]]);
  const [w] = S.finishedWorkouts(state);
  assert.equal(S.workoutSummary(w), '1 jam · 2 gerakan · 3 set · 875 kg');
  assert.equal(S.toCSV(state), [
    'tanggal,latihan,gerakan,set,beban_kg,reps',
    '2026-11-15T14:00:00.000Z,"Push, ""Heavy""",Bench Press,1,62.5,8',
    '2026-11-15T14:00:00.000Z,"Push, ""Heavy""",Bench Press,2,62.5,6',
    '2026-11-15T14:00:00.000Z,"Push, ""Heavy""",Push Up,1,0,20',
    '',
  ].join('\n'));
});
