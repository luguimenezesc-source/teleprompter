(() => {
'use strict';

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const countWords = t => (t.trim().match(/\S+/g) || []).length;
const pad2 = n => String(n).padStart(2, '0');

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}
const fmtDur = sec => {
  sec = Math.round(sec);
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
};
const fmtClock = ms => { const s = Math.floor(ms / 1000); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
};
let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ================= dados ================= */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento */ } }
};

const DEFAULTS = {
  wpm: 140, fontSize: 52, margin: 5, area: 55, bg: 45,
  color: '#ffffff', align: 'center', mirror: false, marker: true,
  countdown: 3, autoScroll: true,
  res: 1080, fps: 30, audioId: '', denoise: true
};
const SAMPLE_TEXT =
`Olá! Este é o seu primeiro roteiro no Teleprompter.

Toque na tela para iniciar ou pausar a rolagem. Arraste o dedo para o texto subir ou descer.

Use os botões de mais e menos para ajustar a velocidade em palavras por minuto.

Para gravar, toque no ícone da câmera, escolha entre a frontal e a traseira e aperte o botão vermelho. O texto aparece sobre a câmera, mas não entra no vídeo gravado.

Você pode gravar com o aparelho na vertical ou na horizontal. Gire o aparelho antes de começar a gravar.

Edite ou apague este roteiro quando quiser.`;

const savedSettings = store.get('tp.settings.v1', {});
if (savedSettings.quality && !savedSettings.res) savedSettings.res = savedSettings.quality; // migra versão anterior
delete savedSettings.quality;
let settings = { ...DEFAULTS, ...savedSettings };
let scripts = store.get('tp.scripts.v1', null);
if (!Array.isArray(scripts) || !scripts.length) {
  scripts = [{ id: uid(), title: 'Meu primeiro roteiro', text: SAMPLE_TEXT, updated: Date.now() }];
  saveScripts();
}
function saveScripts() { store.set('tp.scripts.v1', scripts); }

/* ================= navegação ================= */
let currentView = 'home';
let editingId = null;
let returnTo = 'home';

function showView(name) {
  currentView = name;
  $('#home').hidden = name !== 'home';
  $('#editor').hidden = name !== 'editor';
  $('#prompter').hidden = name !== 'prompter';
}

/* ================= home ================= */
function scriptMeta(text) {
  const w = countWords(text);
  return `${w} ${w === 1 ? 'palavra' : 'palavras'} · ≈ ${fmtDur(w / settings.wpm * 60)} a ${settings.wpm} ppm`;
}

function renderHome() {
  const list = $('#list');
  list.replaceChildren();
  const sorted = [...scripts].sort((a, b) => b.updated - a.updated);
  $('#emptyHint').hidden = sorted.length > 0;
  for (const s of sorted) {
    list.append(h('li', { class: 'card' },
      h('button', { class: 'card-main', onclick: () => openEditor(s.id) },
        h('span', { class: 'card-title', text: s.title || 'Sem título' }),
        h('span', { class: 'card-snippet', text: s.text.trim() || '(vazio)' }),
        h('span', { class: 'card-meta', text: scriptMeta(s.text) })),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn sm', text: 'Ler', onclick: () => { returnTo = 'home'; openPrompter(s.id); } }),
        h('button', { class: 'btn sm rec', text: 'Gravar', onclick: () => { returnTo = 'home'; openPrompter(s.id, { camera: true }); } }))));
  }
  showView('home');
}

function newScript() {
  const s = { id: uid(), title: '', text: '', updated: Date.now() };
  scripts.push(s);
  saveScripts();
  openEditor(s.id, true);
}

/* ================= editor ================= */
let saveTimer;
function openEditor(id, focus = false) {
  const s = scripts.find(x => x.id === id);
  if (!s) return renderHome();
  editingId = id;
  $('#titleInput').value = s.title;
  $('#textInput').value = s.text;
  updateStats();
  showView('editor');
  if (focus) $('#titleInput').focus();
}
function updateStats() { $('#stats').textContent = scriptMeta($('#textInput').value); }
function commitEditor() {
  const s = scripts.find(x => x.id === editingId);
  if (!s) return;
  s.title = $('#titleInput').value.trim();
  s.text = $('#textInput').value;
  s.updated = Date.now();
  saveScripts();
}
function onEditorInput() {
  updateStats();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commitEditor, 300);
}
function closeEditor() {
  clearTimeout(saveTimer);
  commitEditor();
  const s = scripts.find(x => x.id === editingId);
  if (s && !s.title && !s.text.trim()) scripts = scripts.filter(x => x !== s); // descarta rascunho vazio
  saveScripts();
  renderHome();
}

/* ================= teleprompter ================= */
const MARKER = 0.32; // posição da linha-guia dentro da área de texto
const P = {
  script: null, pos: 0, contentH: 1, words: 1, playing: false, raf: 0, last: 0, drag: null,
  counting: false, cancelCountdown: null, barsTimer: 0, wake: null,
  camOn: false, facing: 'user', stream: null, noAudio: false, landscape: false,
  recording: false, rec: null, chunks: [], recStart: 0, recTimer: 0, recRes: '', recBytes: 0, mime: '',
  review: null
};
const MAX_BYTES = 1.5e9; // limite da gravação em memória (iPhone)

function openPrompter(id, { camera = false } = {}) {
  const s = scripts.find(x => x.id === id);
  if (!s) return;
  P.script = s;
  P.words = countWords(s.text);
  $('#textContent').textContent = s.text.trim() ? s.text : '(roteiro vazio)';
  showView('prompter');
  P.pos = 0; P.contentH = 0;
  setPlaying(false);
  applySettings();
  relayout(false);
  updateHud();
  syncCamUi();
  cancelAnimationFrame(P.raf);
  P.last = performance.now();
  P.raf = requestAnimationFrame(tick);
  lockScreen();
  bump();
  if (camera) cameraOn();
}

function closePrompter() {
  if (P.recording) return toast('Pare a gravação antes de sair.');
  if (!$('#review').hidden) return;
  P.cancelCountdown?.();
  setPlaying(false);
  closeStream();
  P.camOn = false;
  $('#prompter').classList.remove('cam');
  closeSheets();
  cancelAnimationFrame(P.raf);
  unlockScreen();
  if (returnTo === 'editor') openEditor(P.script.id); else renderHome();
}

/* ---------- layout & rolagem ---------- */
function applySettings() {
  const el = $('#prompter');
  el.style.setProperty('--fs', settings.fontSize + 'px');
  el.style.setProperty('--margin', settings.margin);
  el.style.setProperty('--area', settings.area / 100);
  el.style.setProperty('--bgop', settings.bg / 100);
  el.style.setProperty('--text-color', settings.color);
  el.style.setProperty('--align', settings.align);
  $('#mirrorWrap').classList.toggle('mirror', settings.mirror);
  el.classList.toggle('nomarker', !settings.marker);
  $('#marker').style.top = (MARKER * 100) + '%';
  $('#wpmVal').textContent = settings.wpm;
  syncSettingsUi();
  relayout(true);
}

function relayout(keepRatio = true) {
  const H = $('#textArea').clientHeight;
  if (!H) return;
  const ratio = keepRatio && P.contentH ? P.pos / P.contentH : 0;
  const sc = $('#scroller');
  sc.style.paddingTop = (H * MARKER) + 'px';
  sc.style.paddingBottom = (H * (1 - MARKER)) + 'px';
  P.contentH = Math.max($('#textContent').offsetHeight, 1);
  P.pos = clamp(ratio * P.contentH, 0, P.contentH);
  render();
}

function render() {
  $('#scroller').style.transform = `translate3d(0, ${-P.pos}px, 0)`;
  $('#progress').style.width = (P.pos / P.contentH * 100) + '%';
}

// velocidade em px/s derivada de palavras/min e do tamanho real do texto
const pxPerSec = () => (settings.wpm / 60) * (P.contentH / Math.max(P.words, 1));

function tick(t) {
  P.raf = requestAnimationFrame(tick);
  const dt = Math.min((t - P.last) / 1000, 0.05);
  P.last = t;
  if (P.playing && !P.drag) {
    P.pos += pxPerSec() * dt;
    if (P.pos >= P.contentH) { P.pos = P.contentH; setPlaying(false); toast('Fim do texto'); }
    render();
  }
}

function setPlaying(v) {
  P.playing = v;
  $('#btnPlay use').setAttribute('href', v ? '#i-pause' : '#i-play');
  $('#btnPlay').setAttribute('aria-label', v ? 'Pausar rolagem' : 'Iniciar rolagem');
  bump();
}

async function togglePlay() {
  if (P.counting) return P.cancelCountdown?.();
  if (P.playing) return setPlaying(false);
  if (P.pos >= P.contentH - 1) P.pos = 0;
  if (P.pos < 2 && settings.countdown > 0 && !P.recording) {
    if (!(await countdown(settings.countdown))) return;
  }
  setPlaying(true);
}

function restart() { P.pos = 0; render(); bump(); }
function nudge(sec) { P.pos = clamp(P.pos + pxPerSec() * sec, 0, P.contentH); render(); }
function changeWpm(d) {
  settings.wpm = clamp(settings.wpm + d, 40, 300);
  store.set('tp.settings.v1', settings);
  $('#wpmVal').textContent = settings.wpm;
  bump();
}

function countdown(sec) {
  return new Promise(resolve => {
    const el = $('#countdown');
    let n = sec;
    P.counting = true; el.textContent = n; el.hidden = false;
    const finish = ok => {
      clearInterval(timer);
      P.counting = false; P.cancelCountdown = null; el.hidden = true;
      resolve(ok);
    };
    const timer = setInterval(() => { n -= 1; if (n <= 0) finish(true); else el.textContent = n; }, 1000);
    P.cancelCountdown = () => finish(false);
  });
}

// barras ficam translúcidas enquanto o texto rola
function bump() {
  const el = $('#prompter');
  el.classList.remove('dim');
  clearTimeout(P.barsTimer);
  if (P.playing) P.barsTimer = setTimeout(() => el.classList.add('dim'), 3000);
}

/* ---------- gestos ---------- */
const stage = $('#stage');
stage.addEventListener('pointerdown', e => {
  const wasCounting = P.counting;
  if (wasCounting) P.cancelCountdown?.();
  stage.setPointerCapture(e.pointerId);
  P.drag = { y: e.clientY, pos: P.pos, moved: false, ignore: wasCounting };
  bump();
});
stage.addEventListener('pointermove', e => {
  const d = P.drag;
  if (!d) return;
  const dy = e.clientY - d.y;
  if (!d.moved && Math.abs(dy) > 8) d.moved = true;
  if (d.moved) { P.pos = clamp(d.pos - dy, 0, P.contentH); render(); }
});
const endDrag = e => {
  const d = P.drag;
  if (!d) return;
  P.drag = null;
  if (e.type === 'pointerup' && !d.moved && !d.ignore) togglePlay();
  bump();
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', e => { e.preventDefault(); P.pos = clamp(P.pos + e.deltaY, 0, P.contentH); render(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

new ResizeObserver(() => { if (currentView === 'prompter') relayout(true); }).observe($('#textArea'));

/* ---------- tela sempre ligada ---------- */
async function lockScreen() {
  try {
    if ('wakeLock' in navigator && !P.wake) {
      P.wake = await navigator.wakeLock.request('screen');
      P.wake.addEventListener('release', () => { P.wake = null; });
    }
  } catch { /* indisponível */ }
}
function unlockScreen() { try { P.wake?.release(); } catch { /* ok */ } P.wake = null; }

/* ================= câmera ================= */
function camError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError': return 'Permissão de câmera/microfone negada. Libere o acesso nos Ajustes e tente de novo.';
    case 'NotFoundError': return 'Nenhuma câmera encontrada neste aparelho.';
    case 'NotReadableError': return 'A câmera está sendo usada por outro app.';
    default: return 'Não foi possível abrir a câmera' + (e?.message ? ` (${e.message})` : '') + '.';
  }
}

const RES = { 2160: [3840, 2160], 1080: [1920, 1080], 720: [1280, 720] };
const RES_LABEL = { 2160: '4K', 1080: '1080p', 720: '720p' };
const resText = s => `${s.width || '?'}×${s.height || '?'}${s.frameRate ? ` · ${Math.round(s.frameRate)} fps` : ''}`;

// sem cancelamento de eco (não há áudio tocando); "reduzir ruído" liga redução de ruído + ganho automático
function audioConstraints(withDevice) {
  const a = { echoCancellation: false, noiseSuppression: settings.denoise, autoGainControl: settings.denoise };
  if (withDevice && settings.audioId) a.deviceId = { exact: settings.audioId };
  return a;
}

async function openStream() {
  closeStream();
  const land = innerWidth > innerHeight;
  P.landscape = land;
  const [long, short] = RES[settings.res] || RES[1080];
  const video = {
    facingMode: { ideal: P.facing },
    width: { ideal: land ? long : short },
    height: { ideal: land ? short : long },
    frameRate: { ideal: settings.fps }
  };
  const attempts = [{ audio: audioConstraints(true) }];
  if (settings.audioId) attempts.push({ audio: audioConstraints(false), warn: 'Microfone escolhido indisponível; usando o padrão.' });
  attempts.push({ audio: false, noAudio: true });
  let stream, lastErr;
  for (const a of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: a.audio });
      P.noAudio = !!a.noAudio;
      if (a.warn) toast(a.warn);
      break;
    } catch (e) {
      lastErr = e;
      if (['NotAllowedError', 'SecurityError', 'NotReadableError'].includes(e.name)) throw e;
    }
  }
  if (!stream) throw lastErr;
  P.stream = stream;
  const track = stream.getVideoTracks()[0];
  const fm = track.getSettings?.().facingMode;
  const cam = $('#cam');
  cam.srcObject = stream;
  cam.classList.toggle('mirrored', fm ? fm === 'user' : P.facing === 'user');
  track.addEventListener('ended', onTrackEnded);
  await cam.play().catch(() => {});
  updateHud();
  reportActual();
  refreshMics();
}

// avisa quando o aparelho não entregou a resolução/fps pedidos
function reportActual() {
  const s = P.stream?.getVideoTracks()[0]?.getSettings?.() || {};
  if (!s.width || !s.height) return;
  const [long] = RES[settings.res] || RES[1080];
  const fps = Math.round(s.frameRate || 0);
  const lowRes = Math.max(s.width, s.height) < long * 0.9;
  const offFps = fps && Math.abs(fps - settings.fps) > 2;
  if (lowRes || offFps) {
    toast(`Pedido: ${RES_LABEL[settings.res]} ${settings.fps} fps. O aparelho entregou ${s.width}×${s.height}${fps ? ` a ${fps} fps` : ''} nesta câmera.`, 6500);
  }
}

function closeStream() {
  stopMeter();
  P.stream?.getTracks().forEach(t => t.stop());
  P.stream = null;
  $('#cam').srcObject = null;
}

async function cameraOn() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast(isSecureContext ? 'Este navegador não permite acessar a câmera.' : 'A câmera só funciona em página segura (HTTPS).');
    return false;
  }
  try { await openStream(); } catch (e) { toast(camError(e)); return false; }
  P.camOn = true;
  $('#prompter').classList.add('cam');
  syncCamUi(); updateHud(); relayout(true);
  return true;
}

function cameraOff() {
  if (P.recording) return toast('Pare a gravação antes de desligar a câmera.');
  closeStream();
  P.camOn = false;
  $('#prompter').classList.remove('cam');
  syncCamUi(); updateHud(); relayout(true);
}

async function flipCamera() {
  if (P.recording || !P.camOn) return;
  const prev = P.facing;
  P.facing = prev === 'user' ? 'environment' : 'user';
  try { await openStream(); }
  catch (e) { P.facing = prev; toast(camError(e)); try { await openStream(); } catch { /* ok */ } }
  updateHud();
}

function syncCamUi() {
  $('#btnCam').classList.toggle('on', P.camOn);
  $('#btnCam').setAttribute('aria-label', P.camOn ? 'Desligar câmera' : 'Ligar câmera');
  $('#btnFlip').hidden = !P.camOn;
  $('#btnRec').hidden = !P.camOn;
}

function updateHud() {
  const hud = $('#hud');
  hud.replaceChildren();
  hud.classList.toggle('rec', P.recording);
  if (P.recording) {
    const mb = P.recBytes / 1e6;
    hud.append(h('span', { class: 'recdot' }), `${fmtClock(Date.now() - P.recStart)} · ${mb.toFixed(mb < 10 ? 1 : 0)} MB`);
  } else if (P.camOn && P.stream) {
    const s = P.stream.getVideoTracks()[0]?.getSettings?.() || {};
    hud.textContent = `${resText(s)} · ${P.facing === 'user' ? 'Frontal' : 'Traseira'}${P.noAudio ? ' · sem microfone' : ''}`;
  } else {
    hud.textContent = P.script?.title || '';
  }
}
$('#cam').addEventListener('resize', () => { if (!P.recording) updateHud(); });

/* girar o aparelho: reabre o stream já na orientação certa (só fora da gravação) */
function onOrientation() {
  if (currentView !== 'prompter' || !P.camOn) return;
  const land = innerWidth > innerHeight;
  if (land === P.landscape) return;
  if (P.recording) return toast('A orientação fica fixa durante a gravação.');
  openStream().catch(e => toast(camError(e)));
}
let rzTimer;
const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(onOrientation, 400); };
addEventListener('resize', onResize);
addEventListener('orientationchange', onResize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden || currentView !== 'prompter') return;
  lockScreen();
  const tracks = P.stream?.getVideoTracks() || [];
  if (P.camOn && !P.recording && tracks.length && tracks.every(t => t.readyState === 'ended')) {
    openStream().catch(e => toast(camError(e)));
  }
});

/* ================= gravação ================= */
function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

async function toggleRecord() {
  if (P.counting) return P.cancelCountdown?.();
  if (P.recording) return stopRecording();
  if (!P.camOn && !(await cameraOn())) return;
  if (typeof MediaRecorder === 'undefined') return toast('Este navegador não suporta gravação de vídeo.');
  setPlaying(false);
  if (P.pos >= P.contentH - 1) P.pos = 0;
  if (settings.countdown > 0 && !(await countdown(settings.countdown))) return;
  beginRecording();
}

function videoBitrate() {
  const base = { 2160: 30e6, 1080: 10e6, 720: 5e6 }[settings.res] || 10e6;
  const k = settings.fps >= 60 ? 1.7 : settings.fps <= 24 ? 0.85 : 1;
  return Math.round(base * k);
}

function beginRecording() {
  if (!P.stream) return;
  P.mime = pickMime();
  const opts = { videoBitsPerSecond: videoBitrate(), audioBitsPerSecond: 128_000 };
  if (P.mime) opts.mimeType = P.mime;
  let rec;
  try { rec = new MediaRecorder(P.stream, opts); }
  catch { try { rec = new MediaRecorder(P.stream); } catch { return toast('Não foi possível iniciar a gravação.'); } }

  const s = P.stream.getVideoTracks()[0]?.getSettings?.() || {};
  P.recRes = s.width ? resText(s) : '';
  P.recBytes = 0;
  P.chunks = [];
  P.rec = rec;
  rec.ondataavailable = e => {
    if (!e.data || !e.data.size) return;
    P.chunks.push(e.data);
    P.recBytes += e.data.size;
    if (P.recBytes > MAX_BYTES) { toast('Limite de memória atingido. Gravação encerrada.'); stopRecording(); }
  };
  rec.onerror = () => { toast('Erro durante a gravação.'); stopRecording(); };
  rec.onstop = onRecStop;
  rec.start(1000);

  P.recording = true;
  P.recStart = Date.now();
  P.recTimer = setInterval(updateHud, 250);
  $('#btnRec').classList.add('on');
  $('#btnRec').setAttribute('aria-label', 'Parar gravação');
  $('#btnFlip').disabled = true;
  $('#btnCam').disabled = true;
  updateHud();
  if (settings.autoScroll) setPlaying(true);
}

function stopRecording() {
  if (P.rec && P.rec.state !== 'inactive') P.rec.stop();
}

function onRecStop() {
  clearInterval(P.recTimer);
  const type = P.rec?.mimeType || P.mime || 'video/mp4';
  const blob = new Blob(P.chunks, { type });
  const duration = Date.now() - P.recStart;
  P.chunks = []; P.rec = null; P.recording = false;
  $('#btnRec').classList.remove('on');
  $('#btnRec').setAttribute('aria-label', 'Gravar');
  $('#btnFlip').disabled = false;
  $('#btnCam').disabled = false;
  setPlaying(false);
  updateHud();
  if (blob.size > 0) openReview(blob, type, duration);
  else toast('A gravação saiu vazia.');
  onOrientation();
}

function onTrackEnded() {
  if (P.recording) { toast('A câmera foi interrompida. Gravação encerrada.'); stopRecording(); }
}

/* ---------- revisão / salvar ---------- */
function openReview(blob, type, duration) {
  discardReview(true);
  const base = type.split(';')[0];
  const ext = base.includes('mp4') ? 'mp4' : 'webm';
  P.review = { blob, url: URL.createObjectURL(blob), name: `teleprompter-${stamp()}.${ext}`, type: base, saved: false };
  $('#reviewVideo').src = P.review.url;
  $('#reviewInfo').textContent = `${fmtClock(duration)} · ${(blob.size / 1e6).toFixed(1)} MB${P.recRes ? ' · ' + P.recRes : ''} · ${ext.toUpperCase()}`;
  $('#review').hidden = false;
}

function discardReview(silent = false) {
  const r = P.review;
  if (!r) { $('#review').hidden = true; return; }
  if (!silent && !r.saved && !confirm('Descartar este vídeo sem salvar?')) return;
  $('#reviewVideo').pause();
  $('#reviewVideo').removeAttribute('src');
  $('#reviewVideo').load();
  URL.revokeObjectURL(r.url);
  P.review = null;
  $('#review').hidden = true;
}

async function shareReview() {
  const r = P.review;
  if (!r) return;
  const file = new File([r.blob], r.name, { type: r.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Vídeo do Teleprompter' }); r.saved = true; }
    catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar. Use “Baixar”.'); }
  } else {
    downloadReview();
  }
}

function downloadReview() {
  const r = P.review;
  if (!r) return;
  const a = h('a', { href: r.url, download: r.name });
  document.body.append(a); a.click(); a.remove();
  r.saved = true;
}

/* ================= ajustes ================= */
function syncSettingsUi() {
  $$('#settings [data-key]').forEach(el => {
    const v = settings[el.dataset.key];
    if (el.matches('input[type=range]')) el.value = v;
    else if (el.matches('input[type=checkbox]')) el.checked = !!v;
    else if (el.matches('select')) { el.value = String(v); if (el.selectedIndex < 0) el.value = ''; }
    else if (el.classList.contains('seg')) $$('button', el).forEach(b => b.classList.toggle('on', b.dataset.val === String(v)));
  });
  const units = { fontSize: 'px', margin: '%', area: '%', bg: '%' };
  $$('#settings [data-out]').forEach(o => { o.textContent = settings[o.dataset.out] + units[o.dataset.out]; });
}

function setSetting(key, val) {
  settings[key] = val;
  store.set('tp.settings.v1', settings);
  applySettings();
  if (RESTART_KEYS.includes(key) && P.camOn && !P.recording) {
    openStream().then(() => { if (!$('#settings').hidden) startMeter(); }).catch(e => toast(camError(e)));
  }
}

$$('#settings [data-key]').forEach(el => {
  const key = el.dataset.key;
  if (el.matches('input[type=range]')) el.addEventListener('input', () => setSetting(key, Number(el.value)));
  else if (el.matches('input[type=checkbox]')) el.addEventListener('change', () => setSetting(key, el.checked));
  else if (el.matches('select')) el.addEventListener('change', () => setSetting(key, el.value));
  else if (el.classList.contains('seg')) el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const raw = b.dataset.val;
    setSetting(key, isNaN(raw) ? raw : Number(raw));
  });
});

let meter = null;
const RESTART_KEYS = ['res', 'fps', 'audioId', 'denoise']; // mudar isso reabre a câmera

function openSettings() {
  setPlaying(false);
  syncSettingsUi();
  RESTART_KEYS.forEach(k => $$(`#settings [data-key="${k}"], #settings [data-key="${k}"] button`).forEach(el => { el.disabled = P.recording; }));
  $('#settings').hidden = false;
  refreshMics();
  if (P.camOn && !P.recording) startMeter();
}
function closeSheets() { $('#settings').hidden = true; stopMeter(); }

/* ---------- microfones ---------- */
async function refreshMics() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  let devs;
  try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'default'); }
  catch { return; }
  const sel = $('#micSelect');
  sel.replaceChildren(h('option', { value: '', text: 'Padrão do aparelho' }));
  devs.forEach((d, i) => sel.append(h('option', { value: d.deviceId, text: d.label || `Microfone ${i + 1}` })));
  sel.value = settings.audioId;
  if (sel.selectedIndex < 0) sel.value = '';
}
navigator.mediaDevices?.addEventListener?.('devicechange', refreshMics);

/* medidor de nível: só roda com os ajustes abertos e fora da gravação */
function startMeter() {
  stopMeter();
  const track = P.stream?.getAudioTracks()[0];
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!track || !AC) return;
  try {
    const ctx = new AC();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const m = { ctx, raf: 0 };
    const loop = () => {
      m.raf = requestAnimationFrame(loop);
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      $('#meterBar').style.width = Math.min(100, peak / 128 * 160) + '%';
    };
    meter = m;
    loop();
  } catch { /* sem medidor */ }
}
function stopMeter() {
  if (!meter) return;
  cancelAnimationFrame(meter.raf);
  meter.ctx.close().catch(() => {});
  meter = null;
  $('#meterBar').style.width = '0';
}

/* ================= eventos ================= */
$('#btnNew').addEventListener('click', newScript);
$('#btnBack').addEventListener('click', closeEditor);
$('#titleInput').addEventListener('input', onEditorInput);
$('#textInput').addEventListener('input', onEditorInput);
$('#btnDelete').addEventListener('click', () => {
  if (!confirm('Apagar este roteiro?')) return;
  scripts = scripts.filter(x => x.id !== editingId);
  saveScripts();
  renderHome();
});
$('#btnRead').addEventListener('click', () => { commitEditor(); returnTo = 'editor'; openPrompter(editingId); });
$('#btnRecordFromEditor').addEventListener('click', () => { commitEditor(); returnTo = 'editor'; openPrompter(editingId, { camera: true }); });

$('#btnClose').addEventListener('click', closePrompter);
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnRestart').addEventListener('click', restart);
$('#btnSlower').addEventListener('click', () => changeWpm(-10));
$('#btnFaster').addEventListener('click', () => changeWpm(10));
$('#btnSettings').addEventListener('click', openSettings);
$('#btnSettingsDone').addEventListener('click', closeSheets);
$('#settings').addEventListener('click', e => { if (e.target === $('#settings')) closeSheets(); });
$('#btnCam').addEventListener('click', () => (P.camOn ? cameraOff() : cameraOn()));
$('#btnFlip').addEventListener('click', flipCamera);
$('#btnRec').addEventListener('click', toggleRecord);
$('#btnShare').addEventListener('click', shareReview);
$('#btnDownload').addEventListener('click', downloadReview);
$('#btnDiscard').addEventListener('click', () => discardReview(false));
// qualquer toque nas barras reativa a opacidade total
$$('.bars').forEach(b => b.addEventListener('pointerdown', bump));

/* atalhos de teclado (também funcionam com pedal/controle Bluetooth que envia setas) */
document.addEventListener('keydown', e => {
  if (currentView !== 'prompter') return;
  if (!$('#review').hidden) return;
  if (!$('#settings').hidden) { if (e.key === 'Escape') closeSheets(); return; }
  const key = e.key;
  const handled = () => e.preventDefault();
  if (key === ' ' || key === 'ArrowRight' || key === 'PageDown') { handled(); togglePlay(); }
  else if (key === 'ArrowLeft' || key === 'PageUp') { handled(); nudge(-5); }
  else if (key === 'ArrowUp') { handled(); changeWpm(10); }
  else if (key === 'ArrowDown') { handled(); changeWpm(-10); }
  else if (key === 'Home') { handled(); restart(); }
  else if (key === 'm' || key === 'M') setSetting('mirror', !settings.mirror);
  else if (key === 'c' || key === 'C') (P.camOn ? cameraOff() : cameraOn());
  else if (key === 'r' || key === 'R') toggleRecord();
  else if (key === '+' || key === '=') setSetting('fontSize', clamp(settings.fontSize + 4, 24, 140));
  else if (key === '-') setSetting('fontSize', clamp(settings.fontSize - 4, 24, 140));
  else if (key === 'Escape') closePrompter();
});

/* ================= PWA ================= */
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

syncSettingsUi();
renderHome();
})();
