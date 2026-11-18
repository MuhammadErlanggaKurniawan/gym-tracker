// UI for Gym Tracker. State lives in store.js and is saved to localStorage after every change.
// Rendering is plain template strings; clicks go through one delegated handler keyed by data-action.
import * as L from './logic.js';
import * as S from './store.js';

const app = document.getElementById('app');
const loaded = S.load(localStorage);
let state = loaded.state;
/** View state that is not saved: current tab, detail page, open sheet. */
const ui = { tab: 'latihan', detail: null, sheet: null };

if (loaded.problem) {
  alert(`Data lama tidak bisa dibaca. Isinya disimpan terpisah dengan kunci "${loaded.problem}", dan app mulai dari kosong.`);
}
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) {
  // After a deploy the new service worker takes over; reload once so the new files are used.
  // (Data is saved on every change, so a reload loses nothing.)
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register('./sw.js');
}

// ---------- helpers ----------

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const active = () => S.activeWorkout(state);

function persist() {
  try {
    S.save(localStorage, state);
  } catch (error) {
    alert(`Gagal menyimpan data: ${error.message}`);
  }
}

const svg = (paths, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  chart: svg('<path d="M4 4v16h16"/><path d="M8 15l3.5-4 3 3L20 8"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 22),
  minus: svg('<path d="M5 12h14"/>', 22),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 26),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 18),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 22),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 22),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 22),
  tick: svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 22),
  play: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M10 8l6 4-6 4z" fill="var(--card)"/></svg>',
  done: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--card)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  open: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Rest-over sound. iOS blocks audio until a tap, so the context is created/resumed on every tap.
let audio = null;
function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio ??= new Ctx();
  if (audio.state === 'suspended') audio.resume();
}
function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [offset, freq] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.22);
  }
}

// ---------- render ----------

function render() {
  const rest = restBar();
  app.innerHTML = `
    <main class="screen">${ui.detail ? detailView() : tabView()}</main>
    ${rest}
    ${tabBar()}
    ${ui.sheet ? sheetView() : ''}`;
  document.body.classList.toggle('has-rest', Boolean(rest));
  document.body.classList.toggle('sheet-open', Boolean(ui.sheet));
  tick();
}

function tabView() {
  if (ui.tab === 'riwayat') return historyView();
  if (ui.tab === 'progres') return progressView();
  if (ui.tab === 'template') return routinesView();
  const w = active();
  return w ? activeWorkoutView(w) : startView();
}

function detailView() {
  if (ui.detail.kind === 'workout') return workoutDetail(ui.detail.id);
  return exerciseDetail(ui.detail.name, ui.detail.metric);
}

function sheetView() {
  return ui.sheet.kind === 'picker' ? pickerSheet(ui.sheet) : routineSheet(ui.sheet);
}

const TABS = [['latihan', 'Latihan', ICONS.dumbbell], ['riwayat', 'Riwayat', ICONS.history], ['progres', 'Progres', ICONS.chart], ['template', 'Template', ICONS.list]];

function tabBar() {
  return `<nav class="tabbar" aria-label="Navigasi utama">${TABS.map(([id, label, icon]) => `
    <button class="tab" data-action="tab" data-tab="${id}" ${ui.tab === id && !ui.detail ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}
  </nav>`;
}

const navHeader = (title) =>
  `<header class="nav-bar"><button class="nav-btn back" data-action="back" aria-label="Kembali">${ICONS.back}</button><h1>${esc(title)}</h1><span></span></header>`;

const emptyState = (icon, title, text) => `<div class="empty-state">${icon}<h2>${title}</h2><p>${text}</p></div>`;

const routineText = (r) =>
  `<span class="row-text"><strong>${esc(r.name)}</strong><small>${r.exerciseNames.length ? r.exerciseNames.map(esc).join(' · ') : 'Belum ada gerakan'}</small></span>`;

// ---------- Latihan tab ----------

function startView() {
  const routines = S.sortedRoutines(state);
  const rows = routines.length === 0
    ? '<li class="row muted">Belum ada template. Buat dulu di tab Template.</li>'
    : routines.map((r) => `<li><button class="row" data-action="start-routine" data-id="${r.id}">
        ${routineText(r)}<span class="accent">${ICONS.play}</span></button></li>`).join('');
  return `
    <h1 class="large-title">Latihan</h1>
    <button class="btn-primary" data-action="start-empty">${ICONS.plus}<span>Mulai Latihan Kosong</span></button>
    <h2 class="section-title">Mulai dari Template</h2>
    <ul class="card list">${rows}</ul>
    <h2 class="section-title">Pengaturan</h2>
    <div class="card"><div class="row">
      <span>Istirahat default</span>
      <div class="stepper">
        <button class="icon-btn" data-action="rest-default" data-delta="-15" aria-label="Kurangi istirahat default 15 detik" ${state.settings.restSeconds <= 15 ? 'disabled' : ''}>${ICONS.minus}</button>
        <output aria-live="polite">${L.fmtClock(state.settings.restSeconds)}</output>
        <button class="icon-btn" data-action="rest-default" data-delta="15" aria-label="Tambah istirahat default 15 detik" ${state.settings.restSeconds >= 600 ? 'disabled' : ''}>${ICONS.plus}</button>
      </div>
    </div></div>`;
}

function activeWorkoutView(w) {
  const history = S.finishedRecords(state);
  const done = S.doneSets(w).length;
  const sections = S.exerciseNamesOf(w).map((name) => {
    const sets = S.setsOf(w, name);
    const last = L.lastSession(name, history);
    return `
      <section class="exercise" aria-label="${esc(name)}">
        <div class="exercise-head">
          <h2>${esc(name)}</h2>
          <button class="icon-btn subtle" data-action="remove-exercise" data-name="${esc(name)}" aria-label="Hapus ${esc(name)} dari latihan">${ICONS.trash}</button>
        </div>
        <div class="card">
          <div class="set-row set-head" aria-hidden="true"><span>Set</span><span>Kg</span><span>Reps</span><span></span></div>
          ${sets.map((s, i) => setRow(s, i + 1)).join('')}
          <div class="set-actions">
            <button class="link" data-action="add-set" data-name="${esc(name)}">${ICONS.plus}<span>Tambah Set</span></button>
            ${sets.length > 1 ? `<button class="link subtle" data-action="remove-last-set" data-name="${esc(name)}">Hapus set terakhir</button>` : ''}
          </div>
        </div>
        ${last.length ? `<p class="footnote">Terakhir: ${esc(L.summaryLine(last))}</p>` : ''}
      </section>`;
  }).join('');
  return `
    <header class="nav-bar">
      <button class="nav-btn danger" data-action="cancel-workout">Batal</button>
      <h1>${esc(w.title)}</h1>
      <button class="nav-btn strong" data-action="finish-workout" ${done ? '' : 'disabled'}>Selesai</button>
    </header>
    <div class="card stats">
      <div><b id="stat-elapsed">${L.fmtElapsed((Date.now() - w.startedAt) / 1000)}</b><small>Durasi</small></div>
      <div><b id="stat-sets">${done}</b><small>Set</small></div>
      <div><b id="stat-volume">${L.fmtKg(L.volume(S.recordsOf(w)))} kg</b><small>Volume</small></div>
    </div>
    ${sections}
    <h2 class="section-title" aria-hidden="true"></h2>
    <div class="card"><button class="row link" data-action="open-picker">${ICONS.plus}<span>Tambah Gerakan</span></button></div>`;
}

function setRow(s, n) {
  const blocked = !s.done && s.reps === 0;
  return `
    <div class="set-row ${s.done ? 'done' : ''}">
      <span class="set-no">${n}</span>
      <input class="num" inputmode="decimal" autocomplete="off" placeholder="0" value="${s.weightKg ? esc(L.fmtKgInput(s.weightKg)) : ''}"
        data-set="${s.id}" data-field="weight" aria-label="Beban set ${n}, kilogram">
      <input class="num" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" value="${s.reps || ''}"
        data-set="${s.id}" data-field="reps" aria-label="Repetisi set ${n}">
      <button class="check" data-action="toggle-set" data-id="${s.id}" aria-pressed="${s.done}"
        aria-label="${s.done ? `Set ${n} selesai` : `Tandai set ${n} selesai`}" ${blocked ? 'disabled' : ''}>${s.done ? ICONS.done : ICONS.open}</button>
    </div>`;
}

function restBar() {
  if (!state.rest || ui.tab !== 'latihan' || ui.detail || !active()) return '';
  return `
    <div class="rest-bar" role="group" aria-label="Timer istirahat">
      <div class="rest-track"><div class="rest-fill" id="rest-fill"></div></div>
      <div class="rest-main">
        <div class="rest-time"><small>Istirahat</small><b id="rest-clock" role="timer">${L.fmtClock(L.restRemaining(state.rest, Date.now()))}</b></div>
        <button class="pill" data-action="rest-adjust" data-delta="-15" aria-label="Kurangi 15 detik">−15</button>
        <button class="pill" data-action="rest-adjust" data-delta="15" aria-label="Tambah 15 detik">+15</button>
        <button class="btn-primary compact" data-action="rest-skip">Lewati</button>
      </div>
    </div>`;
}

/** Updates clocks without re-rendering, so typing in a field never loses focus. */
function tick() {
  const now = Date.now();
  const w = active();
  const elapsed = document.getElementById('stat-elapsed');
  if (elapsed && w) elapsed.textContent = L.fmtElapsed((now - w.startedAt) / 1000);
  if (!state.rest) return;
  const remaining = L.restRemaining(state.rest, now);
  if (remaining <= 0) {
    finishRest(now);
    return;
  }
  const clock = document.getElementById('rest-clock');
  if (clock) clock.textContent = L.fmtClock(remaining);
  const fill = document.getElementById('rest-fill');
  if (fill) fill.style.transform = `scaleX(${L.restProgress(state.rest, now)})`;
}

function finishRest(now) {
  const overdue = now - state.rest.endAt;
  state.rest = null;
  persist();
  // Coming back to the app long after the rest ended should not beep.
  if (overdue < 5000) {
    beep();
    navigator.vibrate?.([200, 100, 200]);
    toast('Istirahat selesai');
    document.body.classList.add('rest-finished');
    setTimeout(() => document.body.classList.remove('rest-finished'), 1000);
  }
  render();
}

function updateWorkoutStats() {
  const w = active();
  const sets = document.getElementById('stat-sets');
  const vol = document.getElementById('stat-volume');
  if (!w || !sets || !vol) return;
  sets.textContent = S.doneSets(w).length;
  vol.textContent = `${L.fmtKg(L.volume(S.recordsOf(w)))} kg`;
}

// ---------- Riwayat tab ----------

function historyView() {
  const workouts = S.finishedWorkouts(state);
  const list = workouts.length === 0
    ? emptyState(ICONS.history, 'Belum Ada Riwayat', 'Latihan yang sudah diselesaikan akan muncul di sini.')
    : `<ul class="card list">${workouts.map((w) => `<li><button class="row" data-action="open-workout" data-id="${w.id}">
        <span class="row-text"><strong>${esc(w.title)}</strong><small>${L.fmtDate(w.startedAt, 'long')}</small><small>${esc(S.workoutSummary(w))}</small></span>
        <span class="chevron">${ICONS.chevron}</span></button></li>`).join('')}</ul>`;
  return `
    <h1 class="large-title">Riwayat</h1>
    ${list}
    <h2 class="section-title">Data</h2>
    <ul class="card list">
      <li><button class="row link" data-action="export-csv">Ekspor CSV</button></li>
      <li><button class="row link" data-action="export-backup">Backup data (JSON)</button></li>
      <li><button class="row link" data-action="import-backup">Pulihkan dari backup</button></li>
    </ul>
    <p class="footnote">Data hanya tersimpan di perangkat ini. Lakukan backup secara berkala agar aman jika data Safari terhapus atau berganti HP.</p>`;
}

function workoutDetail(id) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) {
    ui.detail = null;
    return tabView();
  }
  return `
    ${navHeader(w.title)}
    <ul class="card list">
      <li class="row"><span>Tanggal</span><span class="value">${L.fmtDate(w.startedAt, 'dateTime')}</span></li>
      <li class="row"><span>Durasi</span><span class="value">${L.fmtDuration((w.finishedAt - w.startedAt) / 1000)}</span></li>
      <li class="row"><span>Volume</span><span class="value num">${L.fmtKg(L.volume(S.recordsOf(w)))} kg</span></li>
    </ul>
    ${S.exerciseNamesOf(w).map((name) => `
      <h2 class="section-title">${esc(name)}</h2>
      <ul class="card list">${S.setsOf(w, name).map((s, i) => `
        <li class="row"><span>Set ${i + 1}</span><span class="value num">${esc(L.setText(s))}</span></li>`).join('')}
      </ul>`).join('')}
    <button class="btn-danger" data-action="delete-workout" data-id="${w.id}">Hapus Latihan Ini</button>`;
}

// ---------- Progres tab ----------

function progressView() {
  const records = S.finishedRecords(state);
  const names = [...new Set(records.map((r) => r.exercise))].sort((a, b) => a.localeCompare(b));
  const body = names.length === 0
    ? emptyState(ICONS.chart, 'Belum Ada Data Progres', 'Selesaikan satu latihan untuk mulai melihat progres tiap gerakan.')
    : `<ul class="card list">${names.map((name) => {
        const mine = records.filter((r) => r.exercise === name);
        const count = new Set(mine.map((r) => r.date)).size;
        return `<li><button class="row" data-action="open-exercise" data-name="${esc(name)}">
          <span class="row-text"><strong>${esc(name)}</strong><small>${count} sesi</small></span>
          <span class="row-end"><strong class="num">${esc(L.setText(L.personalRecord(name, mine)))}</strong><small>Rekor</small></span>
          <span class="chevron">${ICONS.chevron}</span></button></li>`;
      }).join('')}</ul>`;
  return `<h1 class="large-title">Progres</h1>${body}`;
}

function exerciseDetail(name, metricKey) {
  const records = S.finishedRecords(state).filter((r) => r.exercise === name);
  const sessions = L.sessions(name, records);
  if (sessions.length === 0) {
    ui.detail = null;
    return tabView();
  }
  const metric = L.METRICS[metricKey];
  const pr = L.personalRecord(name, records);
  return `
    ${navHeader(name)}
    <h2 class="section-title">Rekor Pribadi</h2>
    <ul class="card list">
      <li class="row"><span>Terberat</span><span class="value num">${esc(L.setText(pr))}</span></li>
      <li class="row"><span>Tanggal</span><span class="value">${L.fmtDate(pr.date, 'dayMonthYear')}</span></li>
    </ul>
    <h2 class="section-title">Grafik per Sesi</h2>
    <div class="card chart-card">
      <div class="segmented" role="radiogroup" aria-label="Ukuran grafik">${Object.entries(L.METRICS).map(([key, m]) => `
        <button role="radio" aria-checked="${key === metricKey}" data-action="metric" data-metric="${key}">${m.title}</button>`).join('')}
      </div>
      <p class="chart-unit">${metric.unit}</p>
      ${chart(name, sessions, metric)}
      ${sessions.length < 2 ? '<p class="footnote">Butuh minimal 2 sesi untuk melihat tren.</p>' : ''}
    </div>
    <h2 class="section-title">Riwayat Sesi</h2>
    <ul class="card list">${[...sessions].reverse().map((s) => `
      <li class="row"><span>${L.fmtDate(s.date, 'short')}</span><span class="value num">${esc(metric.text(s))}</span></li>`).join('')}
    </ul>`;
}

function chart(name, sessions, metric) {
  const W = 340, H = 210, left = 6, right = 44, top = 10, bottom = 26;
  const values = sessions.map(metric.value);
  const scale = L.niceScale(values);
  const t0 = sessions[0].date;
  const t1 = sessions.at(-1).date;
  const x = (t) => (t1 === t0 ? (left + W - right) / 2 : left + ((t - t0) / (t1 - t0)) * (W - right - left));
  const y = (v) => top + (1 - (v - scale.min) / (scale.max - scale.min)) * (H - top - bottom);
  const label = (v) => (metric.unit === 'reps' ? String(Math.round(v)) : L.fmtKg(v));
  const grid = scale.ticks.map((v) => `
    <line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${W - right + 6}" y="${y(v) + 4}">${label(v)}</text>`).join('');
  const points = sessions.map((s) => [x(s.date), y(metric.value(s))]);
  const line = points.length > 1 ? `<polyline class="line" points="${points.map((p) => p.join(',')).join(' ')}"/>` : '';
  const dots = sessions.map((s, i) => `<circle class="dot" cx="${points[i][0]}" cy="${points[i][1]}" r="4.5"><title>${L.fmtDate(s.date, 'short')}: ${esc(metric.text(s))}</title></circle>`).join('');
  const xLabels = t1 === t0
    ? `<text class="axis" x="${x(t0)}" y="${H - 6}" text-anchor="middle">${L.fmtDate(t0, 'dayMonth')}</text>`
    : `<text class="axis" x="${left}" y="${H - 6}">${L.fmtDate(t0, 'dayMonth')}</text>
       <text class="axis" x="${W - right}" y="${H - 6}" text-anchor="end">${L.fmtDate(t1, 'dayMonth')}</text>`;
  const summary = `Grafik ${metric.title.toLowerCase()} ${name}: ${sessions.length} sesi, dari ${label(values[0])} ke ${label(values.at(-1))} ${metric.unit}.`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${grid}${line}${dots}${xLabels}</svg>`;
}

// ---------- Template tab ----------

function routinesView() {
  const routines = S.sortedRoutines(state);
  const body = routines.length === 0
    ? `${emptyState(ICONS.list, 'Belum Ada Template', 'Simpan paket latihan, misalnya Push, Pull, atau Legs, supaya tinggal mulai.')}
       <button class="btn-primary" data-action="new-routine">${ICONS.plus}<span>Buat Template</span></button>`
    : `<ul class="card list">${routines.map((r) => `<li><button class="row" data-action="edit-routine" data-id="${r.id}">
        ${routineText(r)}<span class="chevron">${ICONS.chevron}</span></button></li>`).join('')}</ul>
       <button class="btn-secondary" data-action="new-routine">${ICONS.plus}<span>Buat Template</span></button>`;
  return `<h1 class="large-title">Template</h1>${body}`;
}

// ---------- sheets ----------

function pickerSheet(sheet) {
  return `
    <div class="sheet-backdrop">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <button class="nav-btn" data-action="picker-cancel">Batal</button>
          <h2 id="sheet-title">Pilih Gerakan</h2>
          <button class="nav-btn strong" id="picker-confirm" data-action="picker-confirm" ${sheet.selected.length ? '' : 'disabled'}>${pickerConfirmLabel(sheet)}</button>
        </header>
        <div class="search"><input type="search" id="picker-search" placeholder="Cari atau ketik gerakan baru" aria-label="Cari gerakan" value="${esc(sheet.query)}" autocomplete="off" autocapitalize="words"></div>
        <div class="sheet-body" id="picker-list">${pickerList(sheet)}</div>
      </section>
    </div>`;
}

const pickerConfirmLabel = (sheet) => (sheet.selected.length ? `Tambah (${sheet.selected.length})` : 'Tambah');

function pickerList(sheet) {
  const query = sheet.query.trim();
  const q = query.toLowerCase();
  const available = state.exercises.filter((e) => !sheet.excluded.includes(e.name) && (!q || e.name.toLowerCase().includes(q)));
  const canCreate = q && !state.exercises.some((e) => e.name.toLowerCase() === q);
  let html = canCreate
    ? `<div class="card" style="margin-top:8px"><button class="row link" data-action="picker-create">${ICONS.plus}<span>Tambah “${esc(query)}” sebagai gerakan baru</span></button></div>`
    : '';
  for (const group of S.MUSCLE_GROUPS) {
    const items = available.filter((e) => e.group === group).sort((a, b) => a.name.localeCompare(b.name));
    if (items.length === 0) continue;
    html += `<h3 class="section-title">${group}</h3><ul class="card list">${items.map((e) => {
      const on = sheet.selected.includes(e.name);
      return `<li><button class="row" data-action="picker-toggle" data-name="${esc(e.name)}" aria-pressed="${on}">
        <span>${esc(e.name)}</span>${on ? `<span class="accent">${ICONS.tick}</span>` : ''}</button></li>`;
    }).join('')}</ul>`;
  }
  return html || '<p class="empty">Tidak ada gerakan yang cocok.</p>';
}

/** Re-renders only the list and the confirm button, so the search field keeps focus. */
function refreshPicker() {
  document.getElementById('picker-list').innerHTML = pickerList(ui.sheet);
  const confirmButton = document.getElementById('picker-confirm');
  confirmButton.textContent = pickerConfirmLabel(ui.sheet);
  confirmButton.disabled = ui.sheet.selected.length === 0;
}

function closePicker(names) {
  const sheet = ui.sheet;
  if (sheet.target === 'routine') {
    sheet.draft.exerciseNames.push(...names);
    ui.sheet = { kind: 'routine', draft: sheet.draft };
    return;
  }
  const w = active();
  const history = S.finishedRecords(state);
  for (const name of names) S.addPrefilled(w, name, history);
  if (names.length) persist();
  ui.sheet = null;
}

function routineSheet({ draft }) {
  const last = draft.exerciseNames.length - 1;
  return `
    <div class="sheet-backdrop">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <button class="nav-btn" data-action="routine-cancel">Batal</button>
          <h2 id="sheet-title">${draft.id ? 'Ubah Template' : 'Template Baru'}</h2>
          <button class="nav-btn strong" id="routine-save" data-action="routine-save" ${routineValid(draft) ? '' : 'disabled'}>Simpan</button>
        </header>
        <div class="sheet-body">
          <label class="section-title" for="routine-name">Nama Template</label>
          <div class="card"><input id="routine-name" class="text-input" placeholder="Misalnya Push Day" value="${esc(draft.name)}" autocomplete="off" autocapitalize="words"></div>
          <h3 class="section-title">Gerakan</h3>
          <ul class="card list">
            ${draft.exerciseNames.map((name, i) => `<li class="row">
              <span class="row-text">${esc(name)}</span>
              <span class="row-tools">
                <button class="icon-btn subtle" data-action="routine-move" data-index="${i}" data-delta="-1" aria-label="Naikkan ${esc(name)}" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
                <button class="icon-btn subtle" data-action="routine-move" data-index="${i}" data-delta="1" aria-label="Turunkan ${esc(name)}" ${i === last ? 'disabled' : ''}>${ICONS.down}</button>
                <button class="icon-btn danger" data-action="routine-remove" data-index="${i}" aria-label="Hapus ${esc(name)}">${ICONS.minus}</button>
              </span></li>`).join('')}
            <li><button class="row link" data-action="open-picker-routine">${ICONS.plus}<span>Tambah Gerakan</span></button></li>
          </ul>
          ${draft.id ? '<button class="btn-danger" data-action="routine-delete">Hapus Template</button>' : ''}
        </div>
      </section>
    </div>`;
}

const routineValid = (draft) => draft.name.trim() !== '' && draft.exerciseNames.length > 0;

// ---------- actions ----------

function startWorkout(routine) {
  S.startWorkout(state, routine ?? null, Date.now());
  persist();
  window.scrollTo(0, 0);
}

function toggleSet(id) {
  const set = active().sets.find((s) => s.id === id);
  set.done = !set.done;
  if (set.done) {
    document.activeElement?.blur();
    state.rest = L.startRest(Date.now(), state.settings.restSeconds);
  }
  persist();
}

function finishWorkout() {
  const pending = active().sets.filter((s) => !s.done).length;
  if (pending && !confirm(`${pending} set belum dicentang dan tidak akan disimpan. Selesaikan latihan?`)) return false;
  S.finishWorkout(state, Date.now());
  state.rest = null;
  persist();
  toast('Latihan disimpan');
  window.scrollTo(0, 0);
}

async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (error) {
      if (error.name !== 'AbortError') alert(`Gagal membagikan file: ${error.message}`);
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

// Each action changes state/ui; returning false skips the re-render, 'picker' refreshes only the picker.
const actions = {
  tab: (el) => {
    ui.tab = el.dataset.tab;
    ui.detail = null;
    window.scrollTo(0, 0);
  },
  back: () => {
    ui.detail = null;
  },
  'start-empty': () => startWorkout(null),
  'start-routine': (el) => startWorkout(state.routines.find((r) => r.id === el.dataset.id)),
  'rest-default': (el) => {
    state.settings.restSeconds = Math.min(600, Math.max(15, state.settings.restSeconds + Number(el.dataset.delta)));
    persist();
  },
  'toggle-set': (el) => toggleSet(el.dataset.id),
  'add-set': (el) => {
    const w = active();
    const last = S.setsOf(w, el.dataset.name).at(-1);
    S.addSet(w, el.dataset.name, last?.weightKg ?? 0, last?.reps ?? 0);
    persist();
  },
  'remove-last-set': (el) => {
    const w = active();
    const last = S.setsOf(w, el.dataset.name).at(-1);
    if (last) S.removeSet(w, last.id);
    persist();
  },
  'remove-exercise': (el) => {
    if (!confirm(`Hapus ${el.dataset.name} beserta semua setnya dari latihan ini?`)) return false;
    S.removeExercise(active(), el.dataset.name);
    persist();
  },
  'finish-workout': () => finishWorkout(),
  'cancel-workout': () => {
    if (!confirm('Batalkan latihan ini? Semua set di sesi ini akan dihapus.')) return false;
    S.cancelWorkout(state);
    state.rest = null;
    persist();
  },
  'rest-adjust': (el) => {
    state.rest = L.adjustRest(state.rest, Number(el.dataset.delta), Date.now());
    persist();
  },
  'rest-skip': () => {
    state.rest = null;
    persist();
  },
  'open-picker': () => {
    ui.sheet = { kind: 'picker', target: 'workout', query: '', selected: [], excluded: S.exerciseNamesOf(active()) };
  },
  'open-picker-routine': () => {
    const { draft } = ui.sheet;
    ui.sheet = { kind: 'picker', target: 'routine', draft, query: '', selected: [], excluded: [...draft.exerciseNames] };
  },
  'picker-toggle': (el) => {
    const { selected } = ui.sheet;
    const index = selected.indexOf(el.dataset.name);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(el.dataset.name);
    return 'picker';
  },
  'picker-create': () => {
    const exercise = S.addExercise(state, ui.sheet.query);
    if (exercise) {
      persist();
      ui.sheet.selected.push(exercise.name);
    }
    ui.sheet.query = '';
  },
  'picker-cancel': () => closePicker([]),
  'picker-confirm': () => closePicker(ui.sheet.selected),
  'new-routine': () => {
    ui.sheet = { kind: 'routine', draft: { id: null, name: '', exerciseNames: [] } };
  },
  'edit-routine': (el) => {
    const r = state.routines.find((x) => x.id === el.dataset.id);
    ui.sheet = { kind: 'routine', draft: { id: r.id, name: r.name, exerciseNames: [...r.exerciseNames] } };
  },
  'routine-move': (el) => {
    const list = ui.sheet.draft.exerciseNames;
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.delta);
    [list[i], list[j]] = [list[j], list[i]];
  },
  'routine-remove': (el) => {
    ui.sheet.draft.exerciseNames.splice(Number(el.dataset.index), 1);
  },
  'routine-cancel': () => {
    ui.sheet = null;
  },
  'routine-save': () => {
    const { draft } = ui.sheet;
    S.saveRoutine(state, { id: draft.id, name: draft.name.trim(), exerciseNames: draft.exerciseNames });
    persist();
    ui.sheet = null;
  },
  'routine-delete': () => {
    if (!confirm(`Hapus template "${ui.sheet.draft.name}"?`)) return false;
    S.deleteRoutine(state, ui.sheet.draft.id);
    persist();
    ui.sheet = null;
  },
  'open-workout': (el) => {
    ui.detail = { kind: 'workout', id: el.dataset.id };
    window.scrollTo(0, 0);
  },
  'delete-workout': (el) => {
    if (!confirm('Hapus latihan ini dari riwayat? Tindakan ini tidak bisa dibatalkan.')) return false;
    S.deleteWorkout(state, el.dataset.id);
    persist();
    ui.detail = null;
  },
  'open-exercise': (el) => {
    const records = S.finishedRecords(state).filter((r) => r.exercise === el.dataset.name);
    // Bodyweight exercises (all 0 kg) open on reps, where the chart means something.
    const metric = records.every((r) => r.weightKg === 0) ? 'reps' : 'weight';
    ui.detail = { kind: 'exercise', name: el.dataset.name, metric };
    window.scrollTo(0, 0);
  },
  metric: (el) => {
    ui.detail.metric = el.dataset.metric;
  },
  'export-csv': () => {
    shareFile(`gym-tracker-${today()}.csv`, S.toCSV(state), 'text/csv');
    return false;
  },
  'export-backup': () => {
    shareFile(`gym-tracker-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
    return false;
  },
  'import-backup': () => {
    document.getElementById('restore-input').click();
    return false;
  },
};

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  unlockAudio();
  const result = actions[el.dataset.action]?.(el);
  if (result === false) return;
  if (result === 'picker') refreshPicker();
  else render();
});

app.addEventListener('input', (event) => {
  const el = event.target;
  if (el.dataset.field) editSet(el);
  else if (el.id === 'picker-search') {
    ui.sheet.query = el.value;
    refreshPicker();
  } else if (el.id === 'routine-name') {
    ui.sheet.draft.name = el.value;
    document.getElementById('routine-save').disabled = !routineValid(ui.sheet.draft);
  }
});

function editSet(el) {
  const set = active()?.sets.find((s) => s.id === el.dataset.set);
  if (!set) return;
  const value = el.dataset.field === 'weight' ? L.parseWeight(el.value) : L.parseReps(el.value);
  el.setAttribute('aria-invalid', String(value === null));
  if (value === null) return;
  if (el.dataset.field === 'weight') set.weightKg = value;
  else set.reps = value;
  persist();
  const check = app.querySelector(`[data-action="toggle-set"][data-id="${set.id}"]`);
  if (check) check.disabled = !set.done && set.reps === 0;
  updateWorkoutStats();
}

document.getElementById('restore-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  let next;
  try {
    next = S.normalize(JSON.parse(await file.text()));
  } catch {
    alert('File ini bukan backup Gym Tracker yang valid.');
    return;
  }
  const count = next.workouts.filter((w) => w.finishedAt !== null).length;
  if (!confirm(`Ganti semua data di perangkat ini dengan backup berisi ${count} latihan? Data yang sekarang akan tertimpa.`)) return;
  state = next;
  persist();
  ui.detail = null;
  ui.sheet = null;
  render();
  toast('Backup berhasil dipulihkan');
});

setInterval(tick, 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

render();
