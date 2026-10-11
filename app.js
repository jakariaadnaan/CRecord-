(() => {
'use strict';

const VERSION = '3.0';

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = id => document.getElementById(id);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#i-' + name); s.append(u); return s;
}
function setIcon(host, name) { const u = host.querySelector('use'); if (u) u.setAttribute('href', '#i-' + name); }

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

/* =====================================================================
   Settings (one JSON object in localStorage)
   ===================================================================== */
const DEFAULTS = { lang: 'en', theme: 'auto', notif: false, quality: 'std', countdown: 0, vibrate: true, agc: true, noise: false, echo: false, maxMin: 0, silenceMin: 0, sort: 'new', group: false, lockAfter: 1, drvAuto: true, drvWifi: false, drvFav: false };
const CHOICES = { quality: ['low', 'std', 'high'], countdown: [0, 3, 5], maxMin: [0, 30, 60, 120], silenceMin: [0, 1, 2, 5], sort: ['new', 'old', 'name', 'long'], lockAfter: [0, 1, 5] };
const Settings = {
  data: { ...DEFAULTS },
  load() {
    let s = {};
    try { s = JSON.parse(store.get('callrec.settings', '{}')) || {}; } catch { s = {}; }
    this.data = { ...DEFAULTS, ...s };
    const legacyTheme = store.get('theme');          // written by the previous version
    if (!('theme' in s) && legacyTheme) this.data.theme = legacyTheme;
    if (!['en', 'bn'].includes(this.data.lang)) this.data.lang = 'en';
    if (!['auto', 'light', 'dark'].includes(this.data.theme)) this.data.theme = 'auto';
    this.data.notif = this.data.notif === true;
    for (const k of ['vibrate', 'agc', 'noise', 'echo', 'group', 'drvAuto', 'drvWifi', 'drvFav']) if (typeof this.data[k] !== 'boolean') this.data[k] = DEFAULTS[k];
    for (const k in CHOICES) if (!CHOICES[k].includes(this.data[k])) this.data[k] = DEFAULTS[k];
  },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; store.set('callrec.settings', JSON.stringify(this.data)); }
};
Settings.load();

/* =====================================================================
   Text (English and Bangla)
   ===================================================================== */
const DICT = window.I18N || { en: {}, bn: {} };
function t(key, vars) {
  const lang = Settings.get('lang');
  let s = (DICT[lang] && DICT[lang][key]);
  if (s === undefined) s = DICT.en[key];
  if (s === undefined) return key;
  if (s.includes('|') && vars && typeof vars.n === 'number') s = s.split('|')[vars.n === 1 ? 0 : 1];
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
let tf, df, nf, nf1;
function makeFormatters() {
  const loc = Settings.get('lang') === 'bn' ? 'bn-BD' : undefined;
  tf = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' });
  df = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  nf = new Intl.NumberFormat(loc);
  nf1 = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
makeFormatters();

const pad = n => String(n).padStart(2, '0');
function fmtWhen(ts) {
  const d = new Date(ts), now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((t0 - d0) / 86400000);
  const time = tf.format(d);
  if (days === 0) return t('today') + ', ' + time;
  if (days === 1) return t('yesterday') + ', ' + time;
  return df.format(d) + ', ' + time;
}
const stamp = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`; };
const fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
const fmtSize = b => b >= 1073741824 ? nf1.format(b / 1073741824) + ' GB' : nf1.format(b / 1048576) + ' MB';
const extFor = m => /mpeg|mp3/.test(m) ? 'mp3' : /wav/.test(m) ? 'wav' : /flac/.test(m) ? 'flac' : /mp4|aac|m4a/.test(m) ? 'm4a' : /ogg/.test(m) ? 'ogg' : 'webm';
const safe = s => (s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim()) || 'recording';
// "Unknown" is stored as plain English so it stays stable; it is only translated when shown.
const displayName = n => (n === 'Unknown' ? t('unknown') : n);

function hueOf(name) { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 360; }
function initials(name) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length || name.trim() === 'Unknown') return '?';
  const a = [...p[0]][0], b = p.length > 1 ? [...p[p.length - 1]][0] : '';
  return (a + b).toUpperCase();
}
function setAvatar(node, name) { node.textContent = initials(name); node.style.setProperty('--h', hueOf(name || '?')); }
function avatar(name) { const d = el('span', 'avatar'); setAvatar(d, name); return d; }

let toastTimer = 0;
function toast(msg) {
  const x = $('toast'); x.textContent = msg; x.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => x.classList.remove('show'), 3400);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* =====================================================================
   Sheets and dialogs
   ===================================================================== */
document.querySelectorAll('dialog.sheet').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close('cancel'); }));

function askConfirm({ title, message, okText = t('delete'), danger = true }) {
  const d = $('confirmSheet');
  $('cfTitle').textContent = title; $('cfMsg').textContent = message;
  const ok = $('cfOk'); ok.textContent = okText; ok.className = 'btn ' + (danger ? 'danger-fill' : 'primary');
  return new Promise(res => {
    d.returnValue = '';
    const done = () => { d.removeEventListener('close', done); res(d.returnValue === 'ok'); };
    d.addEventListener('close', done);
    d.showModal();
  });
}

function askText({ title, placeholder = '', value = '', type = 'text', inputMode = 'text', maxLength = 60, okText = t('save'), validate }) {
  const d = $('textSheet'), f = $('tsForm'), inp = $('tsInput'), err = $('tsErr');
  $('tsTitle').textContent = title; $('tsOk').textContent = okText;
  inp.type = type; inp.value = value; inp.maxLength = maxLength; inp.placeholder = placeholder;
  inp.setAttribute('inputmode', inputMode); err.textContent = '';
  return new Promise(res => {
    d.returnValue = '';
    const onSubmit = e => {
      if (!validate) return;
      const m = validate(inp.value.trim());
      if (m) { e.preventDefault(); err.textContent = m; }
    };
    const done = () => {
      f.removeEventListener('submit', onSubmit); d.removeEventListener('close', done);
      const out = d.returnValue === 'ok' ? inp.value.trim() : null;
      inp.value = '';
      res(out);
    };
    f.addEventListener('submit', onSubmit); d.addEventListener('close', done);
    d.showModal();
    setTimeout(() => { inp.focus(); if (type === 'text') inp.select(); }, 60);
  });
}
$('tsCancel').onclick = () => $('textSheet').close('cancel');

function ensureConsent() {
  if (store.get('consent') === '1') return Promise.resolve(true);
  const d = $('consentSheet');
  return new Promise(res => {
    d.returnValue = '';
    const done = () => {
      d.removeEventListener('close', done);
      if (d.returnValue === 'ok') { store.set('consent', '1'); res(true); } else res(false);
    };
    d.addEventListener('close', done);
    d.showModal();
  });
}

/* =====================================================================
   IndexedDB (version 2: recordings, meta, chunks)
   ===================================================================== */
const DB_NAME = 'callrec', STORE = 'recordings';
let dbPromise = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['sid', 'seq'] });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      res(db);
    };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}
const getDB = () => dbPromise || (dbPromise = openDB().catch(e => { dbPromise = null; throw e; }));
async function tx(mode, fn) {
  const d = await getDB();
  return new Promise((res, rej) => {
    const t1 = d.transaction(STORE, mode);
    let out;
    const req = fn(t1.objectStore(STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    t1.oncomplete = () => res(out);
    t1.onerror = () => rej(t1.error);
    t1.onabort = () => rej(t1.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbAdd = rec => tx('readwrite', s => s.add(rec));
const dbPut = rec => tx('readwrite', s => s.put(rec));
async function dbPatch(id, patch) {
  const d = await getDB();
  return new Promise((res, rej) => {
    const t1 = d.transaction(STORE, 'readwrite'), s = t1.objectStore(STORE), g = s.get(id);
    g.onsuccess = () => { if (g.result) s.put({ ...g.result, ...patch }); };
    t1.oncomplete = () => res(); t1.onerror = t1.onabort = () => rej(t1.error);
  });
}
async function metaOp(mode, fn) {
  const d = await getDB();
  return new Promise((res, rej) => {
    const t1 = d.transaction('meta', mode); let out;
    const req = fn(t1.objectStore('meta')); if (req) req.onsuccess = () => { out = req.result; };
    t1.oncomplete = () => res(out); t1.onerror = t1.onabort = () => rej(t1.error);
  });
}
const metaGet = async k => { const r = await metaOp('readonly', s => s.get(k)); return r ? r.v : undefined; };
const metaSet = (k, v) => metaOp('readwrite', s => s.put({ k, v }));
const metaDel = k => metaOp('readwrite', s => s.delete(k));
const dbDel = id => tx('readwrite', s => s.delete(id));

/* =====================================================================
   Navigation: tabs and settings pages
   ===================================================================== */
const TITLE_KEYS = { record: 'tabRecord', library: 'tabRecordings', settings: 'tabSettings' };
let curTab = 'record';
function go(tab) {
  curTab = tab;
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== 'screen-' + tab; });
  document.querySelectorAll('.tab').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('screenTitle').textContent = t(TITLE_KEYS[tab]);
  $('screens').scrollTop = 0;
  if (tab === 'library') renderList();
  if (tab === 'settings') updateSummaries();
  if (tab === 'record') sizeWave();
  updateLive();
}
document.querySelectorAll('.tab').forEach(b => { b.onclick = () => go(b.dataset.tab); });
$('emptyGo').onclick = () => go('record');
$('liveBar').onclick = () => go('record');

const BG_IDS = ['appbar', 'liveBar', 'screens', 'tabbar'];
let openPageId = null, pageOpener = null;
function showPageUi(id, opener) {
  const p = $('page-' + id);
  if (!p) return;
  openPageId = id; pageOpener = opener || null;
  if (id === 'storage') { showStorage(); locationUi(); }
  if (id === 'security') pinUi();
  if (id === 'backup') { backupUi(); if (store.get('drvClientId')) loadGis().catch(() => {}); }
  if (id === 'about') $('aboutVersion').textContent = t('version', { v: VERSION });
  p.inert = false; p.classList.add('open');
  BG_IDS.forEach(i => { $(i).inert = true; });
  const b = p.querySelector('[data-back]');
  if (b) b.focus({ preventScroll: true });
}
function closePageUi() {
  if (!openPageId) return;
  const p = $('page-' + openPageId);
  p.classList.remove('open'); p.inert = true;
  BG_IDS.forEach(i => { $(i).inert = false; });
  const o = pageOpener;
  openPageId = null; pageOpener = null;
  if (o && o.isConnected) o.focus({ preventScroll: true });
}
function openPage(id, opener) {
  if (openPageId) return;
  try { history.pushState({ page: id }, ''); } catch {}
  showPageUi(id, opener);
}
function backFromPage() {
  if (!openPageId) return;
  if (history.state && history.state.page) history.back(); else closePageUi();
}
document.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => openPage(b.dataset.page, b); });
document.querySelectorAll('[data-back]').forEach(b => { b.onclick = backFromPage; });
window.addEventListener('popstate', () => { if (openPageId) closePageUi(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openPageId && !document.querySelector('dialog[open]')) backFromPage();
});
try { if (history.state && history.state.page) history.replaceState(null, ''); } catch {}

/* =====================================================================
   Waveform
   ===================================================================== */
const wave = $('wave'), wctx = wave.getContext('2d');
let state = 'idle';            // recorder state: idle | rec | paused
let wHist = [], wDpr = 1, colLive = '#E5383B', colMuted = '#5B6270', colFaint = '#CDD1D9';
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  colLive = cs.getPropertyValue('--rec').trim() || colLive;
  colMuted = cs.getPropertyValue('--ink2').trim() || colMuted;
  colFaint = cs.getPropertyValue('--faint').trim() || colFaint;
}
function sizeWave() {
  const r = wave.getBoundingClientRect();
  if (!r.width) return;
  wDpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(r.width * wDpr), h = Math.round(r.height * wDpr);
  if (wave.width !== w || wave.height !== h) { wave.width = w; wave.height = h; }
  drawWave();
}
function drawWave() {
  const W = wave.width, H = wave.height;
  if (!W || !H) return;
  wctx.clearRect(0, 0, W, H);
  const bar = 3 * wDpr, step = 6 * wDpr, n = Math.floor(W / step), mid = H / 2;
  const x0 = (W - n * step) / 2 + (step - bar) / 2;
  for (let i = 0; i < n; i++) {
    const idx = wHist.length - n + i;
    const active = idx >= 0;
    const v = active ? wHist[idx] : 0;
    const h = Math.max(bar, v * H * 0.92);
    wctx.fillStyle = !active ? colFaint : state === 'rec' ? colLive : colMuted;
    const x = x0 + i * step, y = mid - h / 2;
    wctx.beginPath();
    if (wctx.roundRect) wctx.roundRect(x, y, bar, h, bar / 2); else wctx.rect(x, y, bar, h);
    wctx.fill();
  }
}
if ('ResizeObserver' in window) new ResizeObserver(sizeWave).observe(wave);
else window.addEventListener('resize', sizeWave);

/* =====================================================================
   Recorder
   ===================================================================== */
const contact = $('contactName');
const supportsPicker = 'contacts' in navigator && 'ContactsManager' in window;
let stream = null, recorder = null, chunks = [];
let recName = '', recMime = '', recStartedAt = 0;
let elapsed = 0, segStart = 0, timerId = 0;
let actx = null, rafId = 0, wake = null;

const QUALITY_BPS = { low: 24000, std: 48000, high: 96000 };
let counting = false, cancelCount = false, marks = [], anNode = null, anBuf = null, lastSound = 0;
const vibrate = p => { try { if (Settings.get('vibrate') && navigator.vibrate) navigator.vibrate(p); } catch {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function addMark() {
  if (state === 'idle') return;
  const s = Math.round(currentSeconds());
  if (!marks.includes(s)) marks.push(s);
  vibrate(20);
  toast(t('markAdded', { time: fmtTime(s) }));
}

function checkAutoStop() {
  if (state !== 'rec') return;
  const maxMin = Settings.get('maxMin');
  if (maxMin && currentSeconds() >= maxMin * 60) { toast(t('stoppedMax')); stopRec(); return; }
  const silMin = Settings.get('silenceMin');
  if (!silMin || !anNode) return;
  anNode.getByteTimeDomainData(anBuf);
  let sum = 0;
  for (let i = 0; i < anBuf.length; i++) { const v = (anBuf[i] - 128) / 128; sum += v * v; }
  const now = performance.now();
  if (Math.sqrt(sum / anBuf.length) > 0.008) lastSound = now;
  else if (now - lastSound > silMin * 60000) { toast(t('stoppedSilence')); stopRec(); }
}

function pickMime() {
  if (!window.MediaRecorder) return '';
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return list.find(m => MediaRecorder.isTypeSupported(m)) || '';
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch {}
}
function releaseAwake() { try { if (wake) wake.release(); } catch {} wake = null; }

function setupMeter() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    const src = actx.createMediaStreamSource(stream);
    const analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    anNode = analyser; anBuf = new Uint8Array(analyser.fftSize);
    let last = 0;
    const loop = ts => {
      if (state === 'rec' && ts - last >= 55) {
        last = ts;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        wHist.push(Math.min(1, Math.sqrt(rms) * 1.5));
        if (wHist.length > 800) wHist.splice(0, wHist.length - 800);
        drawWave();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  } catch {}
}

function teardown() {
  clearInterval(timerId); timerId = 0;
  cancelAnimationFrame(rafId); rafId = 0;
  if (actx) { try { actx.close(); } catch {} actx = null; }
  anNode = null; anBuf = null;
  if (stream) { stream.getTracks().forEach(tr => { tr.onended = null; tr.stop(); }); stream = null; }
  releaseAwake();
  wHist = []; drawWave();
}

function currentSeconds() {
  return elapsed + (state === 'rec' ? (performance.now() - segStart) / 1000 : 0);
}

function updateLive() {
  const show = state !== 'idle' && curTab !== 'record';
  $('liveBar').hidden = !show;
  if (show) { $('liveText').textContent = t('liveRecording', { name: displayName(recName) }); $('liveTime').textContent = fmtTime(currentSeconds()); }
}

function ui() {
  const idle = state === 'idle';
  document.body.dataset.rstate = state;
  $('recBtn').setAttribute('aria-label', idle ? t('startRecordingAria') : t('stopSave'));
  $('pauseBtn').disabled = idle;
  setIcon($('pauseBtn'), state === 'paused' ? 'play' : 'pause');
  $('pauseBtn').setAttribute('aria-label', state === 'paused' ? t('resume') : t('pause'));
  contact.disabled = !idle;
  $('pickBtn').disabled = !idle;
  $('statusText').textContent = idle ? t('statusReady') : state === 'rec' ? t('statusRecording') : t('statusPaused');
  if (idle) $('timer').textContent = '00:00';
  drawWave();
  updateLive();
}

async function startRec() {
  if (state !== 'idle' || counting) return;
  if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast(t('recUnsupported'));
    return;
  }
  if (!(await ensureConsent())) return;
  if (state !== 'idle' || counting) return;
  try {
    // Echo cancellation and noise suppression are OFF on purpose, otherwise the
    // other person's voice coming from the speaker is treated as echo and removed.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: Settings.get('echo'), noiseSuppression: Settings.get('noise'), autoGainControl: Settings.get('agc'), channelCount: 1 }
    });
  } catch {
    toast(t('micDenied'));
    return;
  }
  recName = contact.value.trim() || 'Unknown';
  recMime = pickMime();
  try {
    const mo = { audioBitsPerSecond: QUALITY_BPS[Settings.get('quality')] };
    if (recMime) mo.mimeType = recMime;
    recorder = new MediaRecorder(stream, mo);
  } catch {
    toast(t('recorderFail'));
    teardown();
    return;
  }
  const cd = Settings.get('countdown');
  if (cd) {
    counting = true; cancelCount = false;
    contact.disabled = true; $('pickBtn').disabled = true;
    $('statusText').textContent = t('statusStarting');
    for (let n = cd; n > 0 && !cancelCount; n--) {
      $('timer').textContent = nf.format(n); vibrate(15);
      await sleep(1000);
    }
    counting = false;
    if (cancelCount) { cancelCount = false; recorder = null; teardown(); ui(); return; }
  }
  chunks = []; marks = []; elapsed = 0; recStartedAt = Date.now(); wHist = []; lastSound = performance.now();
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecorderStop;
  recorder.onerror = () => toast(t('recError'));
  const track = stream.getAudioTracks()[0];
  if (track) track.onended = () => { if (state !== 'idle') { toast(t('micStopped')); stopRec(); } };
  recorder.start(1000);
  segStart = performance.now();
  state = 'rec';
  vibrate(40);
  showRecNote();
  setupMeter();
  keepAwake();
  timerId = setInterval(() => {
    const s = fmtTime(currentSeconds());
    $('timer').textContent = s;
    if (!$('liveBar').hidden) $('liveTime').textContent = s;
    checkAutoStop();
  }, 250);
  ui();
}

function togglePause() {
  if (!recorder) return;
  if (state === 'rec') {
    recorder.pause();
    elapsed += (performance.now() - segStart) / 1000;
    state = 'paused';
    showRecNote();
  } else if (state === 'paused') {
    recorder.resume();
    segStart = performance.now();
    lastSound = performance.now();
    state = 'rec';
    showRecNote();
  }
  ui();
}

function stopRec() {
  if (state === 'idle' || !recorder) return;
  if (recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
}

async function onRecorderStop() {
  if (state === 'idle') return;
  const duration = currentSeconds();
  const name = recName;
  const type = (recorder && recorder.mimeType) || recMime || 'audio/webm';
  const blob = new Blob(chunks, { type });
  const createdAt = recStartedAt;
  const myMarks = marks.filter(m => m <= duration + 1); marks = [];
  vibrate([30, 60, 30]);
  chunks = []; recorder = null; state = 'idle';
  hideRecNote();
  teardown();
  ui();
  if (!blob.size) { toast(t('nothingRecorded')); return; }
  try {
    await dbAdd({ name, createdAt, mime: type, duration, fav: false, marks: myMarks, blob });
    toast(t('savedName', { name: displayName(name) }));
    await refresh();
    copyToFolder(blob, `${safe(name)}_${stamp(createdAt)}.${extFor(type)}`);
    runQueue();
  } catch {
    toast(t('saveFailedDownload'));
    downloadBlob(blob, `${safe(name)}_${stamp(createdAt)}.${extFor(type)}`);
  }
}

/* =====================================================================
   Library
   ===================================================================== */
let items = [];
let favOnly = false;
const list = $('list');

async function refresh() {
  items = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt);
  renderList();
  updateNames();
  updateSummaries();
}

function updateNames() {
  const dl = $('nameList'); dl.replaceChildren();
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.name) || it.name === 'Unknown') continue;
    seen.add(it.name);
    const o = document.createElement('option'); o.value = it.name; dl.append(o);
    if (seen.size >= 50) break;
  }
  const box = $('recentNames'); box.replaceChildren();
  for (const n of [...seen].slice(0, 6)) {
    const b = el('button'); b.type = 'button'; b.textContent = n;
    b.onclick = () => { if (state !== 'idle' || counting) return; contact.value = n; contact.dispatchEvent(new Event('input')); };
    box.append(b);
  }
  box.hidden = !seen.size;
}

function buildRow(it) {
  const li = el('li', 'row');
  const main = el('button', 'row-main'); main.type = 'button';
  const txt = el('span', 'row-text');
  const nm = el('span', 'row-name'); nm.textContent = displayName(it.name);
  const dt = el('span', 'row-date'); dt.textContent = fmtWhen(it.createdAt);
  txt.append(nm, dt);
  main.append(avatar(it.name), txt);
  main.onclick = () => openPlayer(it);
  li.append(main);
  if (it.fav) {
    const s = el('span', 'fav-mark'); s.append(icon('star'));
    s.setAttribute('role', 'img'); s.setAttribute('aria-label', t('favourite')); li.append(s);
  }
  return li;
}

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const shown = items.filter(it =>
    (!favOnly || it.fav) &&
    (!q || (displayName(it.name) + ' ' + it.name + ' ' + fmtWhen(it.createdAt) + ' ' + df.format(new Date(it.createdAt))).toLowerCase().includes(q))
  );
  const cmp = {
    new: (x, y) => y.createdAt - x.createdAt,
    old: (x, y) => x.createdAt - y.createdAt,
    name: (x, y) => displayName(x.name).localeCompare(displayName(y.name), undefined, { sensitivity: 'base' }) || y.createdAt - x.createdAt,
    long: (x, y) => (y.duration || 0) - (x.duration || 0)
  }[Settings.get('sort')];
  shown.sort(cmp);
  if (Settings.get('group')) {
    const groups = new Map();
    for (const it of shown) { if (!groups.has(it.name)) groups.set(it.name, []); groups.get(it.name).push(it); }
    const nodes = [];
    for (const [name, arr] of groups) {
      const g = el('li', 'grp'); g.setAttribute('role', 'presentation');
      const a1 = el('span'); a1.textContent = displayName(name);
      const a2 = el('span'); a2.textContent = nf.format(arr.length);
      g.append(a1, a2); nodes.push(g, ...arr.map(buildRow));
    }
    list.replaceChildren(...nodes);
  } else list.replaceChildren(...shown.map(buildRow));
  list.hidden = shown.length === 0;
  $('libTools').hidden = items.length === 0;
  $('emptyAll').hidden = items.length > 0;
  $('emptyNone').hidden = !(items.length > 0 && shown.length === 0);
  $('count').hidden = shown.length === 0;
  $('count').textContent = t('countRecordings', { n: shown.length, num: nf.format(shown.length) });
}

$('search').addEventListener('input', renderList);
function sortUi() {
  $('sortSel').value = Settings.get('sort');
  $('groupBtn').setAttribute('aria-pressed', String(Settings.get('group')));
}
$('sortSel').onchange = () => { Settings.set('sort', $('sortSel').value); renderList(); };
$('groupBtn').onclick = () => { Settings.set('group', !Settings.get('group')); sortUi(); renderList(); };
sortUi();
function setFilter(fav) {
  favOnly = fav;
  $('segAll').setAttribute('aria-pressed', String(!fav));
  $('segFav').setAttribute('aria-pressed', String(fav));
  renderList();
}
$('segAll').onclick = () => setFilter(false);
$('segFav').onclick = () => setFilter(true);

/* =====================================================================
   Player
   ===================================================================== */
const audio = $('audioEl');
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
let cur = null, curUrl = null, dragging = false, fixing = false, speedIdx = 0;

const total = () => {
  const d = audio.duration;
  return Number.isFinite(d) && d > 0 ? d : (cur && cur.duration) || 0;
};
function setProgress(c, tt) {
  const p = tt ? Math.min(1, c / tt) : 0;
  $('pSeek').value = Math.round(p * 1000);
  $('pSeek').style.setProperty('--p', (p * 100) + '%');
  $('pCur').textContent = fmtTime(c);
  $('pDur').textContent = fmtTime(tt);
}
const renderProgress = () => setProgress(audio.currentTime || 0, total());
function setFavUi() {
  const on = !!(cur && cur.fav);
  $('pFav').classList.toggle('on', on);
  $('pFav').setAttribute('aria-label', on ? t('removeFav') : t('addFav'));
}
function setPlayUi(playing) {
  setIcon($('pPlay'), playing ? 'pause' : 'play');
  $('pPlay').setAttribute('aria-label', playing ? t('pause') : t('play'));
}
function setSpeed(i) {
  speedIdx = i;
  const r = SPEEDS[i];
  audio.defaultPlaybackRate = r; audio.playbackRate = r;
  $('pSpeed').textContent = r + 'x';
}

function openPlayer(it) {
  cur = it;
  setAvatar($('pAvatar'), it.name);
  $('pName').textContent = displayName(it.name);
  $('pDate').textContent = fmtWhen(it.createdAt);
  setFavUi();
  setPlayUi(false);
  curUrl = URL.createObjectURL(it.blob);
  audio.src = curUrl;
  setSpeed(0);
  setProgress(0, it.duration || 0);
  renderMarks(it.marks || []);
  $('playerSheet').showModal();
}

function renderMarks(list) {
  const box = $('pMarks');
  box.replaceChildren();
  const sorted = [...list].sort((x, y) => x - y);
  box.hidden = !sorted.length;
  for (const s of sorted) {
    const b = el('button'); b.type = 'button';
    b.append(icon('flag'), document.createTextNode(fmtTime(s)));
    b.setAttribute('aria-label', t('markersLabel') + ' ' + fmtTime(s));
    b.onclick = () => { try { audio.currentTime = s; audio.play().catch(() => {}); } catch {} };
    box.append(b);
  }
}

$('pShare').hidden = !(navigator.share && navigator.canShare);
$('pShare').onclick = async () => {
  if (!cur) return;
  try {
    const f = new File([cur.blob], `${safe(cur.name)}_${stamp(cur.createdAt)}.${extFor(cur.mime)}`, { type: cur.mime || cur.blob.type });
    if (!navigator.canShare({ files: [f] })) { toast(t('shareFail')); return; }
    await navigator.share({ files: [f], title: displayName(cur.name) });
  } catch (e) { if (!e || e.name !== 'AbortError') toast(t('shareFail')); }
};

const MP3_KBPS = { low: 32, std: 64, high: 96 };
const MP3_RATE = 22050, MP3_MAX_SEC = 20 * 60;
async function toMp3(blob, kbps, onProgress) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let decoded;
  try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch {} }
  if (decoded.duration > MP3_MAX_SEC + 5) { const e = new Error('long'); e.code = 'long'; throw e; }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * MP3_RATE)), MP3_RATE);
  const srcNode = off.createBufferSource(); srcNode.buffer = decoded; srcNode.connect(off.destination); srcNode.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const pcm = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) { const v = Math.max(-1, Math.min(1, mono[i])); pcm[i] = v < 0 ? v * 32768 : v * 32767; }
  return new Promise((res, rej) => {
    const w = new Worker('mp3-worker.js');
    w.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.value);
      else if (m.type === 'done') { w.terminate(); res(new Blob(m.parts, { type: 'audio/mpeg' })); }
      else if (m.type === 'error') { w.terminate(); rej(new Error(m.message)); }
    };
    w.onerror = () => { w.terminate(); rej(new Error('worker')); };
    w.postMessage({ samples: pcm, sampleRate: MP3_RATE, kbps }, [pcm.buffer]);
  });
}
let mp3Busy = false;
$('pMp3').onclick = async () => {
  if (!cur || mp3Busy) return;
  const rec = cur; mp3Busy = true;
  const txt = $('pMp3Txt'); $('pMp3').disabled = true;
  try {
    txt.textContent = t('mp3Working', { num: nf.format(0) });
    const out = await toMp3(rec.blob, MP3_KBPS[Settings.get('quality')], p => { txt.textContent = t('mp3Working', { num: nf.format(Math.round(p * 100)) }); });
    downloadBlob(out, `${safe(rec.name)}_${stamp(rec.createdAt)}.mp3`);
  } catch (e) { toast(e && e.code === 'long' ? t('mp3Long') : t('mp3Fail')); }
  mp3Busy = false; $('pMp3').disabled = false; txt.textContent = t('mp3Label');
};

function closePlayerState() {
  audio.pause(); audio.removeAttribute('src'); audio.load();
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  cur = null; fixing = false; dragging = false;
}
$('playerSheet').addEventListener('close', closePlayerState);
$('pClose').onclick = () => $('playerSheet').close();

// Chrome reports an infinite duration for MediaRecorder files; this nudge makes seeking work.
audio.addEventListener('loadedmetadata', () => {
  if (audio.duration === Infinity) {
    fixing = true;
    const h = () => { audio.removeEventListener('timeupdate', h); audio.currentTime = 0; fixing = false; renderProgress(); };
    audio.addEventListener('timeupdate', h);
    audio.currentTime = 1e101;
  } else renderProgress();
});
audio.addEventListener('timeupdate', () => { if (!fixing && !dragging) renderProgress(); });
audio.addEventListener('play', () => setPlayUi(true));
audio.addEventListener('pause', () => setPlayUi(false));
audio.addEventListener('ended', () => renderProgress());
audio.addEventListener('error', () => { if (cur) toast(t('playFail')); });

$('pPlay').onclick = () => {
  if (!cur) return;
  if (audio.paused) audio.play().catch(() => toast(t('playFail'))); else audio.pause();
};
$('pBack').onclick = () => { audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10); renderProgress(); };
$('pFwd').onclick = () => {
  const tt = total(), n = (audio.currentTime || 0) + 10;
  audio.currentTime = tt ? Math.min(tt, n) : n; renderProgress();
};
$('pSpeed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
$('pSeek').addEventListener('input', e => { dragging = true; const tt = total(); setProgress(e.target.value / 1000 * tt, tt); });
$('pSeek').addEventListener('change', e => { const tt = total(); if (tt) audio.currentTime = e.target.value / 1000 * tt; dragging = false; renderProgress(); });

$('pFav').onclick = async () => {
  if (!cur) return;
  cur.fav = !cur.fav; setFavUi();
  await dbPut(cur); renderList();
};
$('pRename').onclick = async () => {
  if (!cur) return;
  const it = cur;
  const v = await askText({
    title: t('renameTitle'), value: displayName(it.name), placeholder: t('contactPh'), okText: t('save'),
    validate: s => s ? '' : t('enterName')
  });
  if (!v || v === displayName(it.name)) return;
  it.name = v;
  $('pName').textContent = v; setAvatar($('pAvatar'), v);
  await dbPut(it); renderList(); updateNames();
  toast(t('renamed'));
};
$('pDownload').onclick = () => { if (cur) downloadBlob(cur.blob, `${safe(cur.name)}_${stamp(cur.createdAt)}.${extFor(cur.mime)}`); };
$('pDelete').onclick = async () => {
  if (!cur) return;
  const it = cur;
  const ok = await askConfirm({ title: t('deleteRecTitle'), message: t('deleteRecMsg', { name: displayName(it.name) }), okText: t('delete') });
  if (!ok) return;
  $('playerSheet').close();
  await dbDel(it.id);
  items = items.filter(x => x.id !== it.id);
  renderList(); updateNames(); updateSummaries();
  toast(t('deleted'));
};

/* =====================================================================
   Settings: appearance and language
   ===================================================================== */
function applyTheme(th) {
  const r = document.documentElement;
  if (th === 'light' || th === 'dark') r.dataset.theme = th; else delete r.dataset.theme;
  document.querySelectorAll('[data-theme-val]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeVal === th)));
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#0C0E12' : '#F2F3F5';
  readColors(); drawWave();
}
document.querySelectorAll('[data-theme-val]').forEach(b => {
  b.onclick = () => { Settings.set('theme', b.dataset.themeVal); applyTheme(b.dataset.themeVal); updateSummaries(); };
});
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(Settings.get('theme'))); } catch {}

function applyLang() {
  makeFormatters();
  const lang = Settings.get('lang');
  document.documentElement.lang = lang;
  document.title = t('appName');
  document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(n => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  document.querySelectorAll('[data-lang-val]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.langVal === lang)));
  $('screenTitle').textContent = t(TITLE_KEYS[curTab]);
  ui(); renderList(); pinUi(); updateSummaries();
  $('aboutVersion').textContent = t('version', { v: VERSION });
  if (cur) { $('pName').textContent = displayName(cur.name); $('pDate').textContent = fmtWhen(cur.createdAt); setFavUi(); setPlayUi(!audio.paused); }
  if (openPageId === 'storage') showStorage();
}
document.querySelectorAll('[data-lang-val]').forEach(b => {
  b.onclick = () => { Settings.set('lang', b.dataset.langVal); applyLang(); };
});

function recOptionsUi() {
  document.querySelectorAll('.seg[data-set]').forEach(g => {
    const k = g.dataset.set, cur = String(Settings.get(k));
    g.querySelectorAll('button').forEach(b => {
      const v = b.dataset.val;
      if (!b.hasAttribute('data-i18n')) b.textContent = t(k === 'countdown' ? 'nSec' : 'nMin', { num: nf.format(Number(v)) });
      b.setAttribute('aria-pressed', String(v === cur));
    });
  });
  document.querySelectorAll('[role=switch][data-set]').forEach(s => s.setAttribute('aria-checked', String(!!Settings.get(s.dataset.set))));
  $('subRecording').textContent = t('q_' + Settings.get('quality'));
}
document.querySelectorAll('.seg[data-set] button').forEach(b => {
  b.onclick = () => {
    const k = b.parentElement.dataset.set;
    Settings.set(k, k === 'quality' ? b.dataset.val : Number(b.dataset.val));
    recOptionsUi();
  };
});
document.querySelectorAll('[role=switch][data-set]').forEach(s => {
  s.onclick = () => { Settings.set(s.dataset.set, !Settings.get(s.dataset.set)); recOptionsUi(); };
});

function updateSummaries() {
  notifUi(); recOptionsUi(); backupUi();
  const th = Settings.get('theme');
  const themeName = th === 'light' ? t('themeLight') : th === 'dark' ? t('themeDark') : t('themeAuto');
  $('subAppearance').textContent = themeName + ', ' + (Settings.get('lang') === 'bn' ? 'বাংলা' : 'English');
  const bytes = items.reduce((s, i) => s + (i.blob ? i.blob.size : 0), 0);
  $('subStorage').textContent = t('storageSummary', { n: items.length, num: nf.format(items.length), size: fmtSize(bytes) });
  $('subSecurity').textContent = ({ pin: t('pinIsOn'), pattern: t('patIsOn') })[lockType()] || t('lockIsOff');
  $('subAbout').textContent = t('version', { v: VERSION });
}

/* =====================================================================
   Notification bar (one switch: on shows it while recording, off shows nothing)
   ===================================================================== */
const NOTE_TAG = 'callrec-recording';
const notifSupported = () => 'Notification' in window;
async function noteReg() {
  try { return ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null; } catch { return null; }
}
async function showRecNote() {
  if (!Settings.get('notif') || !notifSupported() || Notification.permission !== 'granted') return;
  try {
    const opts = { body: displayName(recName) + ' · ' + t(state === 'paused' ? 'notifPaused' : 'notifRecording'), tag: NOTE_TAG, silent: true, requireInteraction: true, icon: 'icon-192.png', badge: 'icon-192.png' };
    const reg = await noteReg();
    if (state === 'idle') return;                    // stopped while we were waiting
    if (reg) await reg.showNotification(t('appName'), opts); else new Notification(t('appName'), opts);
  } catch {}
}
async function hideRecNote() {
  try {
    const reg = await noteReg();
    if (reg) (await reg.getNotifications({ tag: NOTE_TAG })).forEach(n => n.close());
  } catch {}
}
function notifUi() {
  const on = Settings.get('notif') && notifSupported() && Notification.permission === 'granted';
  $('notifSwitch').setAttribute('aria-checked', String(!!on));
  $('subNotif').textContent = !notifSupported() ? t('notifUnsupported') : (on ? t('notifOn') : t('notifOff'));
}
$('notifSwitch').onclick = async () => {
  if (!notifSupported()) { toast(t('notifUnsupported')); return; }
  if (Settings.get('notif')) {
    Settings.set('notif', false); hideRecNote(); notifUi(); return;
  }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; } }
  if (perm !== 'granted') { Settings.set('notif', false); notifUi(); toast(t('notifBlocked')); return; }
  Settings.set('notif', true); notifUi();
  if (state !== 'idle') showRecNote();
};

/* =====================================================================
   Settings: storage
   ===================================================================== */
async function showStorage() {
  const totalBytes = items.reduce((s, i) => s + (i.blob ? i.blob.size : 0), 0);
  $('recSize').textContent = t('recordingsStat', { num: nf.format(items.length), size: fmtSize(totalBytes) });
  const f = pickMime();
  $('fmtText').textContent = f ? t('formatStat', { fmt: f.split(';')[0] }) : t('formatNone');
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      $('storageText').textContent = t('storageUsed', { used: fmtSize(usage), quota: fmtSize(quota) });
      $('storageBar').style.width = quota ? Math.max(1, Math.min(100, usage / quota * 100)) + '%' : '0%';
    } else { $('storageText').textContent = t('storageNA'); }
  } catch { $('storageText').textContent = t('storageNA'); }
}

async function deleteOld() {
  const days = parseInt($('cleanDays').value, 10);
  if (!(days >= 1)) { toast(t('enterDays')); return; }
  const cutoff = Date.now() - days * 86400000;
  const victims = items.filter(i => i.createdAt < cutoff && !i.fav);
  if (!victims.length) { toast(t('noOld', { days: nf.format(days) })); return; }
  const ok = await askConfirm({
    title: t('deleteNTitle', { n: victims.length, num: nf.format(victims.length) }),
    message: t('deleteNMsg', { days: nf.format(days) }), okText: t('delete')
  });
  if (!ok) return;
  for (const v of victims) await dbDel(v.id);
  await refresh(); showStorage();
  toast(t('deletedN', { n: victims.length, num: nf.format(victims.length) }));
}
$('cleanBtn').onclick = deleteOld;

/* =====================================================================
   Settings: import and export (backup file)
   ===================================================================== */
function blobToDataURL(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
async function exportAll() {
  if (!items.length) { toast(t('exportNone')); return; }
  toast(t('exportPreparing'));
  try {
    const parts = ['{"app":"callrec","version":1,"items":['];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const data = await blobToDataURL(it.blob);
      parts.push((i ? ',' : '') + JSON.stringify({ name: it.name, createdAt: it.createdAt, mime: it.mime, duration: it.duration, fav: !!it.fav, marks: it.marks || [], data }));
    }
    parts.push(']}');
    downloadBlob(new Blob(parts, { type: 'application/json' }), `call-recorder-backup-${stamp(Date.now())}.json`);
  } catch { toast(t('exportFail')); }
}
async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast(t('importInvalid')); return; }
  if (!data || data.app !== 'callrec' || !Array.isArray(data.items)) { toast(t('importNotBackup')); return; }
  const have = new Set(items.map(i => i.createdAt + '|' + i.name));
  let added = 0;
  for (const it of data.items) {
    if (!it || !it.data || !it.name) continue;
    const key = it.createdAt + '|' + it.name;
    if (have.has(key)) continue;
    const blob = await (await fetch(it.data)).blob();
    await dbAdd({ name: String(it.name), createdAt: Number(it.createdAt) || Date.now(), mime: it.mime || blob.type, duration: Number(it.duration) || 0, fav: !!it.fav, marks: Array.isArray(it.marks) ? it.marks.map(Number).filter(n => n >= 0 && isFinite(n)).slice(0, 200) : [], blob });
    have.add(key); added++;
  }
  await refresh(); showStorage();
  toast(t('importedN', { n: added, num: nf.format(added) }));
}
$('exportBtn').onclick = exportAll;
function probeDuration(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file), au = new Audio();
    let tm = 0;
    const done = d => { clearTimeout(tm); au.removeAttribute('src'); URL.revokeObjectURL(url); res(isFinite(d) && d > 0 ? d : 0); };
    tm = setTimeout(() => done(0), 4000);
    au.preload = 'metadata';
    au.onloadedmetadata = () => done(au.duration);
    au.onerror = () => done(0);
    au.src = url;
  });
}
async function importAudioFiles(files) {
  const have = new Set(items.map(i => i.createdAt + '|' + i.name));
  let added = 0;
  for (const f of files) {
    const looksAudio = /^audio\//.test(f.type) || /\.(m4a|mp3|wav|aac|amr|ogg|opus|3gp|flac|webm)$/i.test(f.name);
    if (!looksAudio || !f.size) continue;
    const name = (f.name.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 60)) || 'Unknown';
    const createdAt = f.lastModified || Date.now();
    const key = createdAt + '|' + name;
    if (have.has(key)) continue;
    const mime = f.type || (/\.mp3$/i.test(f.name) ? 'audio/mpeg' : /\.wav$/i.test(f.name) ? 'audio/wav' : /\.(m4a|aac|3gp)$/i.test(f.name) ? 'audio/mp4' : /\.(ogg|opus)$/i.test(f.name) ? 'audio/ogg' : 'audio/webm');
    await dbAdd({ name, createdAt, mime, duration: await probeDuration(f), fav: false, marks: [], blob: f.slice(0, f.size, mime) });
    have.add(key); added++;
  }
  await refresh(); showStorage();
  toast(added ? t('importedN', { n: added, num: nf.format(added) }) : t('importAudioNone'));
}
$('importAudioBtn').onclick = () => $('importAudioFile').click();
$('importAudioFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await importAudioFiles(fs); };
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); };

/* =====================================================================
   Security: PIN lock
   ===================================================================== */
const canHash = !!(window.crypto && crypto.subtle);
async function hashPin(pin, salt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
let bioAvail = null;
const pinLen = () => parseInt(store.get('pinLen', '0'), 10) || 0;
// Which lock is active: 'pin', 'pattern' or '' (none). A PIN saved by an older version counts as 'pin'.
function lockType() {
  const pin = !!store.get('pinHash'), pat = !!store.get('patHash');
  if (store.get('lockType') === 'pattern' && pat) return 'pattern';
  if (pin) return 'pin';
  return pat ? 'pattern' : '';
}
function clearLock() {
  ['pinHash', 'pinSalt', 'pinLen', 'patHash', 'patSalt', 'lockType', 'bioId', 'lockFails', 'lockUntil'].forEach(k => store.del(k));
}
function pinUi() {
  const ty = lockType();
  $('pinSub').textContent = ty === 'pin' ? t('pinIsOn') : t('pinIsOff');
  $('removePin').hidden = ty !== 'pin';
  $('setPin').textContent = ty === 'pin' ? t('change') : t('setPin');
  $('patSub').textContent = ty === 'pattern' ? t('patIsOn') : t('lockIsOff');
  $('removePat').hidden = ty !== 'pattern';
  $('setPat').textContent = ty === 'pattern' ? t('change') : t('setPattern');
  const bioOn = !!store.get('bioId') && !!ty;
  $('bioSwitch').setAttribute('aria-checked', String(bioOn));
  $('bioSub').textContent = bioAvail === false ? t('bioNoSupport') : t('bioSub');
  $('lockOpts').hidden = !ty;
  $('lockNowBtn').hidden = !ty;
  $('lockNowBtn').closest('.group').hidden = !ty;
}
$('setPin').onclick = async () => {
  if (!canHash) { toast(t('pinNeedsHttps')); return; }
  const on = lockType() === 'pin';
  const v = await askText({
    title: on ? t('changePinTitle') : t('setPinTitle'), placeholder: t('pinPh'), type: 'password', inputMode: 'numeric', maxLength: 8, okText: t('savePin'),
    validate: s => /^\d{4,8}$/.test(s) ? '' : t('pinInvalid')
  });
  if (!v) return;
  const salt = Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');
  ['patHash', 'patSalt', 'lockFails', 'lockUntil'].forEach(k => store.del(k));
  store.set('lockType', 'pin');
  store.set('pinSalt', salt); store.set('pinLen', String(v.length));
  store.set('pinHash', await hashPin(v, salt));
  pinUi(); updateSummaries(); toast(t('pinSaved'));
};
$('removePin').onclick = async () => {
  const ok = await askConfirm({ title: t('removePinTitle'), message: t('removePinMsg'), okText: t('remove') });
  if (!ok) return;
  clearLock(); pinUi(); updateSummaries(); toast(t('pinRemoved'));
};
$('removePat').onclick = async () => {
  const ok = await askConfirm({ title: t('removePatTitle'), message: t('removePatMsg'), okText: t('remove') });
  if (!ok) return;
  clearLock(); pinUi(); updateSummaries(); toast(t('patRemoved'));
};

/* ---- pattern pad (3 x 3 dots, drawn with a finger or chosen with the keyboard) ---- */
function createPad(host, onDone) {
  const wrap = el('div', 'patwrap'), pad = el('div', 'pat');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'), line = document.createElementNS(svgNS, 'polyline');
  svg.setAttribute('viewBox', '0 0 240 240'); svg.append(line); pad.append(svg);
  const dots = [];
  for (let i = 0; i < 9; i++) {
    const b = el('button', 'pd'); b.type = 'button';
    b.style.left = (i % 3) * 80 + 12 + 'px'; b.style.top = Math.floor(i / 3) * 80 + 12 + 'px';
    b.setAttribute('aria-label', String(i + 1));
    pad.append(b); dots.push(b);
  }
  const ok = el('button', 'btn sm'); ok.type = 'button'; ok.hidden = true; ok.textContent = t('ok');
  ok.dataset.i18n = 'ok';
  wrap.append(pad, ok); host.replaceChildren(wrap);
  let seq = [], drawing = false, pt = null, disabled = false;
  const center = i => [(i % 3) * 80 + 40, Math.floor(i / 3) * 80 + 40];
  function paint() {
    dots.forEach((d, i) => d.classList.toggle('on', seq.includes(i)));
    const pts = seq.map(center); if (drawing && pt) pts.push(pt);
    line.setAttribute('points', pts.map(p => p.join(',')).join(' '));
  }
  function add(i) { if (!seq.includes(i)) { seq.push(i); if (navigator.vibrate && Settings.get('vibrate')) try { navigator.vibrate(8); } catch {} } }
  function hit(x, y) {
    for (let i = 0; i < 9; i++) { const [cx, cy] = center(i); if (Math.hypot(cx - x, cy - y) < 30) { add(i); break; } }
  }
  const local = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * 240 / r.width, (e.clientY - r.top) * 240 / r.height]; };
  function finish() {
    const s = seq.join('-'); ok.hidden = true;
    seq = []; drawing = false; pt = null;
    if (s) onDone(s);
  }
  pad.addEventListener('pointerdown', e => {
    if (disabled) return;
    e.preventDefault(); seq = []; drawing = true; ok.hidden = true; pad.classList.remove('bad');
    try { pad.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = local(e); pt = [x, y]; hit(x, y); paint();
  });
  pad.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = local(e); pt = [x, y]; hit(x, y); paint(); });
  const up = () => { if (!drawing) return; drawing = false; paint(); finish(); };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', () => { drawing = false; seq = []; pt = null; paint(); });
  dots.forEach((d, i) => d.addEventListener('click', e => {
    if (disabled || e.detail !== 0) return;       // detail 0 means keyboard
    add(i); ok.hidden = false; pad.classList.remove('bad'); paint();
  }));
  ok.onclick = () => { drawing = false; paint(); finish(); };
  return {
    reset() { seq = []; drawing = false; pt = null; ok.hidden = true; pad.classList.remove('bad'); paint(); },
    bad() { pad.classList.add('bad'); setTimeout(() => { pad.classList.remove('bad'); seq = []; paint(); }, 600); },
    disable(v) { disabled = v; pad.style.opacity = v ? '.4' : ''; dots.forEach(d => { d.disabled = v; }); }
  };
}

$('setPat').onclick = async () => {
  if (!canHash) { toast(t('pinNeedsHttps')); return; }
  const d = $('patSheet'), msg = $('patMsg');
  let first = null, saved = false;
  $('patTitle').textContent = lockType() === 'pattern' ? t('change') + ': ' + t('patLock') : t('setPattern');
  msg.textContent = t('drawPattern');
  const pad = createPad($('patSetPad'), async s => {
    if (s.split('-').length < 4) { msg.textContent = t('patShort'); pad.bad(); first = null; return; }
    if (!first) { first = s; msg.textContent = t('drawAgain'); return; }
    if (first !== s) { first = null; msg.textContent = t('patMismatch'); pad.bad(); return; }
    const salt = Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');
    ['pinHash', 'pinSalt', 'pinLen', 'lockFails', 'lockUntil'].forEach(k => store.del(k));
    store.set('lockType', 'pattern'); store.set('patSalt', salt); store.set('patHash', await hashPin(s, salt));
    saved = true; d.close();
  });
  $('patCancel').onclick = () => d.close();
  await new Promise(res => { const done = () => { d.removeEventListener('close', done); res(); }; d.addEventListener('close', done); d.showModal(); });
  $('patSetPad').replaceChildren();
  if (saved) { pinUi(); updateSummaries(); toast(t('patSaved')); }
};

/* ---- attempt limit: 5 wrong tries, then waits of 30 s, 1 min, 5 min, 15 min ---- */
let blockTimer = 0;
function blockedLeft() { return Math.max(0, Math.ceil((parseInt(store.get('lockUntil', '0'), 10) - Date.now()) / 1000)); }
function showBlock() {
  clearInterval(blockTimer); blockTimer = 0;
  const tick = () => {
    const left = blockedLeft();
    if (left <= 0) { clearInterval(blockTimer); blockTimer = 0; $('pinErr').textContent = ''; setLockBusy(false); return; }
    $('pinErr').textContent = t('tryAgainIn', { num: nf.format(left) }); setLockBusy(true);
  };
  if (blockedLeft() > 0) { tick(); blockTimer = setInterval(tick, 1000); }
}
function registerFail() {
  const f = (parseInt(store.get('lockFails', '0'), 10) || 0) + 1;
  store.set('lockFails', String(f));
  if (f >= 5) { store.set('lockUntil', String(Date.now() + [30, 60, 300, 900][Math.min(f - 5, 3)] * 1000)); showBlock(); }
}
const resetFails = () => { store.del('lockFails'); store.del('lockUntil'); };

/* ---- fingerprint / face unlock (WebAuthn platform authenticator; a local check on this phone) ---- */
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
(async () => {
  try {
    bioAvail = !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { bioAvail = false; }
  pinUi();
})();
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Call Recorder' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'owner', displayName: 'Owner' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000
  } });
  if (!cred) throw new Error('none');
  store.set('bioId', b64(new Uint8Array(cred.rawId)));
}
let bioRunning = false;
async function bioUnlock() {
  const id = store.get('bioId');
  if (!id || bioRunning) return;
  bioRunning = true;
  try {
    const r = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
      userVerification: 'required', timeout: 60000
    } });
    if (r) { resetFails(); unlock(); }
  } catch {} finally { bioRunning = false; }
}
$('bioBtn').onclick = bioUnlock;
$('bioSwitch').onclick = async () => {
  if (store.get('bioId')) { store.del('bioId'); pinUi(); return; }
  if (!lockType()) { toast(t('bioNeedLock')); return; }
  if (!bioAvail) { toast(t('bioNoSupport')); return; }
  try { await bioRegister(); } catch { toast(t('bioSetupFail')); }
  pinUi();
};
$('lockNowBtn').onclick = () => lockApp(false);

/* ---- the lock screen ---- */
let pinBuf = '', pinBusy = false, lockPad = null;
function setLockBusy(v) { if (lockPad) lockPad.disable(v); }
function renderDots() {
  const n = pinLen() || 8, d = $('pinDots');
  d.replaceChildren();
  for (let i = 0; i < n; i++) d.append(el('span', 'dot' + (i < pinBuf.length ? ' on' : '')));
}
function lockApp(autoBio = true) {
  const ty = lockType();
  if (!ty || !canHash) return;
  pinBuf = ''; $('pinErr').textContent = '';
  const pat = ty === 'pattern';
  $('lockTitle').dataset.i18n = pat ? 'enterPattern' : 'enterPin';
  $('lockTitle').textContent = t(pat ? 'enterPattern' : 'enterPin');
  $('pinDots').hidden = pat; $('keypad').hidden = pat; $('patPad').hidden = !pat;
  if (pat) {
    lockPad = createPad($('patPad'), async s => {
      if (blockedLeft() > 0 || pinBusy) return;
      pinBusy = true;
      const okk = (await hashPin(s, store.get('patSalt', ''))) === store.get('patHash');
      pinBusy = false;
      if (okk) { resetFails(); unlock(); return; }
      $('pinErr').textContent = t('wrongPattern'); lockPad.bad(); registerFail();
    });
  } else { lockPad = null; $('patPad').replaceChildren(); renderDots(); }
  const bio = !!store.get('bioId');
  $('bioBtn').hidden = !bio;
  $('lock').hidden = false;
  showBlock();
  if (bio && autoBio) bioUnlock();
}
function unlock() { $('lock').hidden = true; pinBuf = ''; $('pinErr').textContent = ''; if (lockPad) { lockPad = null; $('patPad').replaceChildren(); } }
async function pinDigit(k) {
  if (pinBusy || blockedLeft() > 0) return;
  const L = pinLen(), max = L || 8;
  if (pinBuf.length >= max) return;
  pinBuf += k; renderDots(); $('pinErr').textContent = '';
  if ((L && pinBuf.length === L) || (!L && pinBuf.length >= 4)) {
    pinBusy = true;
    const h = await hashPin(pinBuf, store.get('pinSalt', ''));
    pinBusy = false;
    if (h === store.get('pinHash')) { resetFails(); unlock(); return; }
    if (pinBuf.length >= max) {
      $('pinErr').textContent = t('wrongPin');
      const d = $('pinDots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      pinBuf = ''; renderDots(); registerFail();
    }
  }
}
function pinBack() { if (pinBusy) return; pinBuf = pinBuf.slice(0, -1); renderDots(); }
(function buildKeypad() {
  const pd = $('keypad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].forEach(k => {
    if (k === '') { pd.append(el('span')); return; }
    const b = el('button', 'key'); b.type = 'button';
    if (k === 'back') { b.append(icon('backspace')); b.setAttribute('aria-label', t('deleteDigit')); b.dataset.i18nAria = 'deleteDigit'; b.onclick = pinBack; }
    else { b.textContent = k; b.onclick = () => pinDigit(k); }
    pd.append(b);
  });
})();
document.addEventListener('keydown', e => {
  if ($('lock').hidden || lockType() !== 'pin') return;
  if (/^\d$/.test(e.key)) pinDigit(e.key); else if (e.key === 'Backspace') pinBack();
});

/* =====================================================================
   Backup: Google Drive with an offline queue
   ===================================================================== */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let drvToken = null, drvExp = 0, drvBusy = false, drvErr = '';
const isOnline = () => navigator.onLine !== false;
const drvTokenOk = () => !!drvToken && Date.now() < drvExp - 60000;
function loadGis() {
  return new Promise((res, rej) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('gis'));
    document.head.append(s);
  });
}
function getToken(interactive) {
  if (drvTokenOk()) return Promise.resolve(drvToken);
  const cid = store.get('drvClientId', '');
  if (!cid) return Promise.resolve(null);
  const ask = loadGis().then(() => new Promise(res => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: cid, scope: DRIVE_SCOPE,
      callback: r => {
        if (r && r.access_token) { drvToken = r.access_token; drvExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; store.set('drvLinked', '1'); res(drvToken); }
        else res(null);
      },
      error_callback: () => res(null)
    });
    tc.requestAccessToken({ prompt: '' });
  })).catch(() => null);
  return Promise.race([ask, sleep(90000).then(() => null)]);
}
async function drvFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + drvToken } });
  if (r.status === 401) { drvToken = null; drvExp = 0; throw Object.assign(new Error('auth'), { code: 'auth' }); }
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'http', status: r.status });
  return r;
}
async function ensureFolder() {
  const saved = store.get('drvFolder');
  if (saved) {
    try {
      const j = await (await drvFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(saved)}?fields=id,trashed`)).json();
      if (j && j.id && !j.trashed) return j.id;
    } catch (e) { if (e.code === 'auth') throw e; }
  }
  const q = encodeURIComponent("name='Call Recorder' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const found = await (await drvFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`)).json();
  let id = found.files && found.files[0] && found.files[0].id;
  if (!id) {
    const mk = await drvFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Call Recorder', mimeType: 'application/vnd.google-apps.folder' })
    });
    id = (await mk.json()).id;
  }
  store.set('drvFolder', id);
  return id;
}
async function drvUpload(it, folderId) {
  const mime = ((it.mime || it.blob.type || '').split(';')[0]) || 'application/octet-stream';
  const meta = { name: `${safe(it.name)}_${stamp(it.createdAt)}.${extFor(it.mime || '')}`, parents: [folderId], mimeType: mime, appProperties: { createdAt: String(it.createdAt) } };
  const bd = 'cr' + Math.random().toString(36).slice(2);
  const body = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: ${mime}\r\n\r\n`, it.blob, `\r\n--${bd}--`]);
  const r = await drvFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bd}` }, body
  });
  return (await r.json()).id;
}
const drvPending = () => items.filter(it => !it.driveId && (!Settings.get('drvFav') || it.fav));
function wifiOk() {
  if (!Settings.get('drvWifi')) return true;
  const c = navigator.connection;
  if (!c || !c.type) return true;                  // the browser cannot tell, so do not block
  return c.type === 'wifi' || c.type === 'ethernet';
}
async function runQueue(manual) {
  if (drvBusy || !store.get('drvClientId')) return;
  if (!manual && !(store.get('drvLinked') === '1' && Settings.get('drvAuto'))) return;
  if (!isOnline() || (!manual && !wifiOk())) { backupUi(); return; }
  const todo = drvPending();
  if (!todo.length) { if (manual) toast(t('drvNothing')); backupUi(); return; }
  drvBusy = true; drvErr = ''; backupUi();
  let done = 0;
  try {
    if (!(await getToken(!!manual))) { drvErr = 'auth'; if (manual) toast(t('drvPopup')); return; }
    const folder = await ensureFolder();
    for (const it of todo) {
      if (!isOnline()) break;
      const id = await drvUpload(it, folder);
      await dbPatch(it.id, { driveId: id, driveAt: Date.now() });
      const live = items.find(x => x.id === it.id); if (live) live.driveId = id;
      done++; backupUi();
    }
    if (done) { store.set('drvLast', String(Date.now())); toast(t('drvDone', { num: nf.format(done) })); }
  } catch (e) { drvErr = e && e.code === 'auth' ? 'auth' : 'fail'; }
  finally { drvBusy = false; backupUi(); }
}
function backupUi() {
  const cid = store.get('drvClientId', ''), linked = store.get('drvLinked') === '1';
  const st = $('drvStatus'), q = $('drvQueue'), n = drvPending().length;
  $('drvClient').placeholder = t('drvIdPh');
  if (document.activeElement !== $('drvClient')) $('drvClient').value = cid;
  st.textContent = !cid ? t('drvNoId') : drvErr === 'auth' ? t('drvNeedSignIn') : drvErr === 'fail' ? t('drvFailed') : (linked ? t('drvConnected') : t('drvNotConnected'));
  q.textContent = drvBusy ? t('drvBusy') : !cid ? '' : !isOnline() && n ? t('drvOffline', { num: nf.format(n) }) : n ? t('drvWaiting', { num: nf.format(n) }) :
    (store.get('drvLast') ? t('drvAllDone') + ' · ' + t('drvLastAt', { when: fmtWhen(Number(store.get('drvLast'))) }) : t('drvAllDone'));
  $('drvConnect').textContent = linked ? t('drvDisconnect') : t('drvConnect');
  $('drvConnect').disabled = !cid;
  $('drvNow').disabled = !cid || !linked || drvBusy;
  $('subBackup').textContent = !cid ? t('subBackupNone') : (linked ? 'Google Drive: ' + (drvBusy ? t('drvBusy') : n ? t('drvWaiting', { num: nf.format(n) }) : t('drvAllDone')) : t('drvNotConnected'));
}
$('drvSaveId').onclick = () => {
  const v = $('drvClient').value.trim();
  if (v && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(v)) { toast(t('drvIdBad')); return; }
  if (v !== store.get('drvClientId', '')) {
    ['drvLinked', 'drvFolder', 'drvLast'].forEach(k => store.del(k)); drvToken = null; drvExp = 0; drvErr = '';
  }
  if (v) store.set('drvClientId', v); else store.del('drvClientId');
  backupUi(); toast(t('drvIdSaved'));
};
$('drvConnect').onclick = async () => {
  if (store.get('drvLinked') === '1') {
    try { if (drvToken && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(drvToken, () => {}); } catch {}
    drvToken = null; drvExp = 0; drvErr = ''; store.del('drvLinked'); store.del('drvFolder'); backupUi(); return;
  }
  const tok = await getToken(true);
  if (!tok) { toast(t('drvPopup')); return; }
  drvErr = ''; backupUi(); runQueue(true);
};
$('drvNow').onclick = () => runQueue(true);
['drvAuto', 'drvWifi', 'drvFav'].forEach(k => {
  const b = document.querySelector(`[role=switch][data-set="${k}"]`);
  if (b) b.addEventListener('click', () => { backupUi(); runQueue(); });
});
window.addEventListener('online', () => { backupUi(); runQueue(); });
window.addEventListener('offline', backupUi);
setInterval(() => { if (!document.hidden) runQueue(); }, 120000);

/* =====================================================================
   Storage location: protection from cleanup and an optional folder (desktop browsers)
   ===================================================================== */
const hasFolderApi = typeof window.showDirectoryPicker === 'function';
async function locationUi() {
  let persisted = false;
  try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch {}
  $('persistSwitch').setAttribute('aria-checked', String(persisted));
  const sub = $('folderSub'), clr = $('folderClear'), btn = $('folderBtn');
  btn.disabled = !hasFolderApi;
  if (!hasFolderApi) { sub.textContent = t('folderUnsupported'); clr.hidden = true; return; }
  let h; try { h = await metaGet('dirHandle'); } catch {}
  sub.textContent = h ? t('folderSet', { name: h.name }) : t('folderNone');
  clr.hidden = !h;
}
$('persistSwitch').onclick = async () => {
  try {
    if (navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()) { toast(t('persistOn')); return; }
    const ok = !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist());
    if (!ok) toast(t('persistDenied'));
  } catch { toast(t('persistDenied')); }
  locationUi();
};
$('folderBtn').onclick = async () => {
  if (!hasFolderApi) return;
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    await metaSet('dirHandle', h); toast(t('folderSaved', { name: h.name }));
  } catch {}
  locationUi();
};
$('folderClear').onclick = async () => { try { await metaDel('dirHandle'); } catch {} locationUi(); };
let folderWarned = false;
async function copyToFolder(blob, filename) {
  if (!hasFolderApi) return;
  try {
    const h = await metaGet('dirHandle');
    if (!h) return;
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') { if (!folderWarned) { folderWarned = true; toast(t('folderNeedsAccess')); } return; }
    const fh = await h.getFileHandle(filename, { create: true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
  } catch {}
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}

/* =====================================================================
   Wiring
   ===================================================================== */
$('recBtn').onclick = () => { if (counting) cancelCount = true; else if (state === 'idle') startRec(); else stopRec(); };
$('pauseBtn').onclick = togglePause;
$('markBtn').onclick = addMark;
$('helpBtn').onclick = () => $('guideSheet').showModal();
$('aboutGuide').onclick = () => $('guideSheet').showModal();
$('guideClose').onclick = () => $('guideSheet').close();

contact.addEventListener('input', () => setAvatar($('whoAvatar'), contact.value));
$('pickBtn').onclick = async () => {
  if (!supportsPicker) { toast(t('contactUnsupported')); contact.focus(); return; }
  try {
    const r = await navigator.contacts.select(['name'], { multiple: false });
    const n = r && r[0] && r[0].name && r[0].name[0];
    if (n) { contact.value = n; setAvatar($('whoAvatar'), n); }
  } catch {}
};

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (state !== 'idle') keepAwake();
  if (hiddenAt && Date.now() - hiddenAt >= Settings.get('lockAfter') * 60000 && state === 'idle') lockApp();
  hiddenAt = 0;
});
window.addEventListener('beforeunload', e => { if (state !== 'idle') { e.preventDefault(); e.returnValue = ''; } });

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch {}
  installEvt = null; $('installBtn').hidden = true;
};
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* =====================================================================
   Start
   ===================================================================== */
(async function init() {
  applyTheme(Settings.get('theme'));
  applyLang();
  lockApp();
  sizeWave();
  try { await refresh(); } catch { toast(t('storageUnavailable')); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
})();
