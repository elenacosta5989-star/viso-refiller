'use strict';

/* ============ Strato dati (finto) ============
   Tutto quello che parla con il frigo / la dashboard passa da `api`.
   Quando decideremo come collegarla basta sostituire queste funzioni. */
const KEY = 'viso_refiller_v2';
const CAT_COL = { 'Piatti freddi': '#0085ff', Panini: '#e0a43a', Dessert: '#d96bb0', Frutta: '#4fc36b', Bevande: '#3ec3e8', Snack: '#9b7bff' };
/* Immagine segnaposto: in produzione arriva dal backend (campo `img` = URL caricato nella sezione Prodotti della dashboard). */
const thumb = (name, cat) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0b0d3a"/><circle cx="48" cy="48" r="34" fill="${CAT_COL[cat] || '#9c9e9f'}" opacity=".85"/><text x="48" y="58" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#050625">${name.slice(0, 2).toUpperCase()}</text></svg>`);
const SKUS = [
  { sku: 'VS-1001', name: 'Insalata di pollo', cat: 'Piatti freddi' },
  { sku: 'VS-1002', name: 'Pasta fredda al pesto', cat: 'Piatti freddi' },
  { sku: 'VS-1003', name: 'Poke salmone', cat: 'Piatti freddi' },
  { sku: 'VS-2001', name: 'Panino prosciutto e formaggio', cat: 'Panini' },
  { sku: 'VS-3001', name: 'Yogurt greco', cat: 'Dessert' },
  { sku: 'VS-3002', name: 'Macedonia', cat: 'Frutta' },
  { sku: 'VS-4001', name: 'Acqua naturale 50cl', cat: 'Bevande' },
  // altri prodotti del catalogo (sezione Prodotti della dashboard), non presenti di default nel frigo
  { sku: 'VS-1004', name: 'Wrap vegetariano', cat: 'Panini' },
  { sku: 'VS-1005', name: 'Insalata caprese', cat: 'Piatti freddi' },
  { sku: 'VS-3003', name: 'Tiramisù monoporzione', cat: 'Dessert' },
  { sku: 'VS-4002', name: 'Succo d\'arancia', cat: 'Bevande' },
  { sku: 'VS-4003', name: 'Caffè freddo', cat: 'Bevande' },
  { sku: 'VS-5001', name: 'Barretta proteica', cat: 'Snack' },
];
const byName = (a, b) => a.name.localeCompare(b.name, 'it');
const DEFAULT_LIST = SKUS.slice(0, 7).sort(byName);
const imgOf = (s) => s.img || thumb(s.name, s.cat);
const FRIDGES = [
  { id: 'f1', code: 'TRI4', name: 'Frigo Mensa Piano 1', site: 'Sede Milano' },
  { id: 'f2', code: 'MIL1', name: 'Frigo Reception', site: 'Sede Milano' },
  { id: 'f3', code: 'TOR2', name: 'Frigo Open Space B', site: 'Sede Torino' },
];

let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || { user: null, refills: [] }; } catch (e) { db = { user: null, refills: [] }; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage non disponibile */ } };
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

const api = {
  async login(email, pwd) {
    await wait(300);
    if (!email || pwd.length < 4) return null;
    db.user = { email, name: email.split('@')[0].replace(/[._]/g, ' ') }; save(); return db.user;
  },
  logout() { db.user = null; save(); },
  async fridgeByCode(code) {
    await wait(200);
    const c = String(code).trim().toUpperCase();
    return FRIDGES.find((f) => c === f.code || c.split(/[^A-Z0-9]/).includes(f.code)) || null;
  },
  /* Sblocca la serratura. `onDoor('open'|'closed')` verrà chiamato dagli eventi reali del frigo.
     In demo la porta si apre da sola dopo un attimo; la chiusura si simula con il pulsante. */
  async unlock(fridge, onDoor) {
    await wait(300);
    api._doorCb = onDoor;
    setTimeout(() => onDoor('open'), 1800);
  },
  simulateDoorClose() { api._doorCb && api._doorCb('closed'); },
  async submitRefill({ fridge, quantities, photo }) {
    await wait(400);
    const r = { id: 'r' + Date.now(), fridgeId: fridge.id, operator: db.user.name, date: Date.now(), items: quantities, photo: !!photo, declaredTotal: R.total === '' ? null : Number(R.total) };
    db.refills.push(r); save(); return r; // la foto verrebbe caricata sul server
  },
};

/* ============ Utilità ============ */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2000); };
const logo = (s) => `<div class="logo" style="--s:${s}px" aria-label="VISO"><span>VIS</span><img src="assets/lens.png" alt=""></div>`;
const tagline = '<div class="tag">Turning <b>vision</b> into action</div>';
const render = (html) => { stopCamera(); $('#app').innerHTML = html; window.scrollTo(0, 0); };
const sumQty = (q) => Object.values(q).reduce((a, n) => a + n, 0);

/* ============ Stato del refill ============ */
let R = null; // { fridge, phase, q:{sku:n}, photo }
const newRefill = (fridge) => ({ fridge, phase: 'unlocking', list: [...DEFAULT_LIST], q: Object.fromEntries(DEFAULT_LIST.map((s) => [s.sku, 0])), photo: null, total: '', filter: '', mode: 'add', rm: Object.fromEntries(DEFAULT_LIST.map((s) => [s.sku, 0])) });

/* ============ Schermate ============ */
// 1. Intro
let introTimer;
function introScreen() {
  render(`<div class="screen intro" id="intro">${logo(72)}${tagline}<p class="note">Refiller · v0.2</p>
    <div class="bar"><button class="btn" id="go">Inizia</button></div></div>`);
  const next = () => { clearTimeout(introTimer); location.hash = db.user ? '#/scan' : '#/login'; };
  $('#go').onclick = next; introTimer = setTimeout(next, 3200);
}

// 2. Login
function loginScreen() {
  render(`<div class="screen center">${logo(52)}<p style="margin:6px 0 22px">${tagline}</p>
    <form id="lf" style="width:100%;text-align:left"><label>Email</label><input name="email" type="email" required autocomplete="username" placeholder="nome@azienda.it">
    <label>Password</label><input name="pwd" type="password" required minlength="4" autocomplete="current-password"><div class="sp"></div>
    <button class="btn">Accedi</button></form><p class="note">Demo: qualsiasi email e password di 4+ caratteri.</p></div>`);
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
    const u = await api.login(e.target.email.value, e.target.pwd.value);
    if (u) location.hash = '#/scan'; else { toast('Credenziali non valide'); b.disabled = false; }
  };
}

// 3. QR code o codice manuale
let stream, scanRaf;
function stopCamera() { cancelAnimationFrame(scanRaf); if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
function scanScreen() {
  R = null;
  render(`<div class="scan"><video id="vid" playsinline muted></video><div class="cutout"></div><p class="scan-t">Inquadra il QRCode</p><p class="scan-n" id="ph"></p>
    <div class="bar row2"><button class="btn ghost" id="back">Indietro</button><button class="btn" id="byc">Sblocca con codice</button></div></div>`);
  $('#back').onclick = () => { api.logout(); location.hash = '#/login'; };
  $('#byc').onclick = () => (location.hash = '#/code');
  startCamera(async (c) => { const f = await api.fridgeByCode(c); if (f) { stopCamera(); startRefill(f); } else { toast('QR non riconosciuto'); scanScreen(); } });
}
function codeScreen() {
  render(`<div class="screen"><div class="top">${logo(26)}<span></span></div>
    <h1 class="mint" style="font-weight:600;font-size:22px;margin-top:30px">Inserisci il codice di 4 lettere presente sul frigo</h1>
    <label style="margin-top:30px">Codice di sblocco</label><input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="es. TRI4" style="letter-spacing:.3em;font-size:22px;text-transform:uppercase">
    <div class="chips"><span class="note" style="align-self:center">Demo:</span>${FRIDGES.map((f) => `<button class="chip" data-c="${f.code}">${f.code}</button>`).join('')}</div></div>
    <div class="bar row2"><button class="btn ghost" id="back">Indietro</button><button class="btn" id="ok" disabled>Avanti</button></div>`);
  const inp = $('#code'); inp.focus();
  inp.oninput = () => { inp.value = inp.value.toUpperCase(); $('#ok').disabled = inp.value.length < 4; };
  const submit = async (c) => { const f = await api.fridgeByCode(c); if (f) startRefill(f); else toast('Codice non valido'); };
  $('#ok').onclick = () => submit(inp.value);
  inp.onkeydown = (e) => e.key === 'Enter' && inp.value.length === 4 && submit(inp.value);
  document.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => submit(b.dataset.c));
  $('#back').onclick = () => (location.hash = '#/scan');
}
async function startCamera(onCode) {
  const ph = $('#ph');
  if (!navigator.mediaDevices || !('BarcodeDetector' in window)) { ph.textContent = 'Scansione con camera non supportata su questo browser.\nUsa "Sblocca con codice".'; ph.classList.add('solid'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#vid'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    let busy = false;
    const tick = async () => {
      if (!stream) return;
      if (!busy) { busy = true; try { const r = await det.detect(v); if (r[0]) { onCode(r[0].rawValue); return; } } catch (e) { /* frame non pronto */ } busy = false; }
      scanRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) { ph.textContent = 'Camera non disponibile.\nUsa "Sblocca con codice".'; ph.classList.add('solid'); }
}

// icone a linea sottile in menta (linguaggio visivo VISO)
const svgi = (inner) => `<svg class="ic" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const IC = {
  lock: svgi('<rect x="14" y="28" width="36" height="26" rx="5"/><path d="M22 28v-8a10 10 0 0 1 20 0v8"/><circle cx="32" cy="41" r="2.5"/>'),
  unlock: svgi('<rect x="14" y="28" width="36" height="26" rx="5"/><path d="M22 28v-8a10 10 0 0 1 19.5-3.2"/><circle cx="32" cy="41" r="2.5"/>'),
  door: svgi('<path d="M18 56V10h28v46"/><path d="M12 56h40"/><circle cx="40" cy="34" r="2"/>'),
  camera: svgi('<path d="M10 22h10l4-6h16l4 6h10v30H10z"/><circle cx="32" cy="37" r="9"/>'),
  check: svgi('<path d="M16 34l10 10 22-24"/>'),
};
// Flusso refill
const fridgeIcon = '<svg class="fi" viewBox="0 0 64 96" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="4" width="44" height="86" rx="4"/><line x1="10" y1="40" x2="54" y2="40"/><line x1="20" y1="16" x2="20" y2="30"/><line x1="20" y1="52" x2="20" y2="70"/></svg>';
const head = (t = 'Refill in corso') => `<div class="rhead">${fridgeIcon}<span>${t}</span></div>`;
function onDoor(ev) {
  if (!R) return;
  if (ev === 'open' && R.phase === 'unlocking') setPhase('opened');
  if (ev === 'closed' && (R.phase === 'loading' || R.phase === 'opened')) setPhase('info');
}
function startRefill(fridge) {
  R = newRefill(fridge); location.hash = '#/refill'; drawRefill();
  api.unlock(fridge, onDoor);
}
function setPhase(p) { R.phase = p; drawRefill(); }
const endBtn = '<button class="btn ghost" id="end">Fine Refill</button>';

// totali: inseriti (+) e rimossi (−)
const totHtml = () => `<span class="mint">+${sumQty(R.q)}</span> <span class="neg">−${sumQty(R.rm)}</span>`;
const otherTag = (sku) => R.mode === 'rm' ? (R.q[sku] ? `<span class="pos">Inseriti +${R.q[sku]}</span>` : '') : (R.rm[sku] ? `Rimossi −${R.rm[sku]}` : '');
const segBar = () => `<div class="seg"><button data-mode="add" class="${R.mode === 'add' ? 'on' : ''}">Aggiungi</button><button data-mode="rm" class="${R.mode === 'rm' ? 'on' : ''}">Rimuovi</button></div>`;
function qtyRow(s) {
  const neg = R.mode === 'rm' ? ' neg' : '', v = (R.mode === 'rm' ? R.rm : R.q)[s.sku];
  return `<div class="card sku"><img class="pimg" src="${esc(imgOf(s))}" alt="" loading="lazy" onerror="this.onerror=null;this.src=thumb('${esc(s.name).replace(/'/g, '')}','${esc(s.cat)}')"><div class="pn"><div class="n">${esc(s.name)}</div><div class="c">${s.sku} · ${esc(s.cat)}</div><div class="tag2" id="o-${s.sku}">${otherTag(s.sku)}</div></div>
    <div class="qty"><button data-m="${s.sku}" aria-label="Meno">−</button><b id="q-${s.sku}" class="${neg}">${v}</b><button class="p${neg}" data-p="${s.sku}" aria-label="Più">+</button></div></div>`;
}
function bindQty() {
  const cur = () => (R.mode === 'rm' ? R.rm : R.q);
  const upd = (sku) => { $('#q-' + sku).textContent = cur()[sku]; $('#o-' + sku).innerHTML = otherTag(sku); const t = $('#tot'); if (t) t.innerHTML = totHtml(); };
  document.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { cur()[b.dataset.p]++; upd(b.dataset.p); });
  document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { cur()[b.dataset.m] = Math.max(0, cur()[b.dataset.m] - 1); upd(b.dataset.m); });
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { R.mode = b.dataset.mode; const y = window.scrollY; drawRefill(); window.scrollTo(0, y); });
}

function drawRefill() {
  if (!R) return (location.hash = '#/scan');
  const f = R.fridge, ph = R.phase;
  const name = `<p class="muted small" style="margin:0 0 12px">${esc(f.name)} · ${esc(f.site)}</p>`;
  if (ph === 'unlocking') {
    render(`<div class="screen center">${head()}<div class="ring wait">${IC.door}</div><h2>Apri la porta</h2><p class="muted">Sblocco in corso su<br><b>${esc(f.name)}</b>.<br>Apri il frigorifero.</p></div>
      <div class="bar">${endBtn}</div>`);
  } else if (ph === 'opened') {
    render(`<div class="screen center">${head()}<div class="ring">${IC.unlock}</div><span class="status"><i class="dot"></i>PORTA APERTA</span>
      <h1 style="margin-top:18px">La porta è <span class="mint">aperta</span></h1><p class="muted">Metti i prodotti nel frigo.</p></div>
      <div class="bar"><button class="btn" id="cont">Inserisci i prodotti</button></div>`);
    $('#cont').onclick = () => setPhase('loading'); setTimeout(() => R && R.phase === 'opened' && setPhase('loading'), 1600);
  } else if (ph === 'loading') {
    render(`<div class="screen">${head()}<div class="top"><span class="status"><i class="dot"></i>PORTA APERTA</span><button class="demo" id="sim">DEMO · chiudi porta</button></div>
      <h1 style="font-size:20px">Metti i prodotti nel frigo, poi seleziona quanti prodotti aggiungi o rimuovi e vai su <span class="mint">Fine Refill</span></h1>${name}
      ${segBar()}${R.list.map(qtyRow).join('')}<button class="btn ghost" id="addp">+ Aggiungi prodotto</button><div class="sum"><span>Totale pezzi</span><span id="tot">${totHtml()}</span></div></div>
      <div class="bar">${endBtn}</div>`);
    bindQty(); $('#addp').onclick = addSheet; $('#sim').onclick = () => api.simulateDoorClose();
  } else if (ph === 'info') {
    render(`<div class="screen">${head()}<span class="status closed" style="align-self:center"><i class="dot"></i>PORTA CHIUSA</span>
      <h2 class="mint" style="font-weight:600;text-align:center;margin:18px 0">Mentre verifichiamo i prodotti in frigo, alcune informazioni da inserire:</h2>
      <label>Prodotti in frigo</label><input id="tn" type="number" inputmode="numeric" min="0" placeholder="Numero totale di prodotti in frigo" value="${R.total}">
      <p class="note center" style="text-align:center;margin:22px 0 8px">Premi sull'immagine per cambiarla/scattarne una nuova</p>
      <button class="photo" id="snap" aria-label="Scatta foto">${R.photo ? `<img src="${R.photo}" alt="Foto del frigo">` : IC.camera}</button></div>
      <div class="bar row2"><button class="btn ghost" id="skip">Salta</button><button class="btn" id="nx" ${R.total !== '' || R.photo ? '' : 'disabled'}>Avanti</button></div>`);
    $('#tn').oninput = (e) => { R.total = e.target.value; $('#nx').disabled = R.total === '' && !R.photo; };
    $('#snap').onclick = async () => { const ph = await takePhoto(); if (ph) { R.total = $('#tn').value; R.photo = ph; setPhase('info'); } };
    $('#skip').onclick = () => setPhase('review');
    $('#nx').onclick = () => setPhase('review');
  } else if (ph === 'review') {
    const q = R.filter.toLowerCase(), rows = R.list.filter((s) => (s.name + s.sku + s.cat).toLowerCase().includes(q));
    render(`<div class="screen" style="padding-top:0"><div class="searchbar">${head()}<input id="sq" placeholder="SKU, nome prodotto, …" value="${esc(R.filter)}">
      ${segBar()}<div class="cols"><span>Product type</span><span>Quantity</span></div></div>
      <div id="list">${rows.map(qtyRow).join('') || '<p class="muted center" style="text-align:center">Nessun prodotto</p>'}</div><button class="btn ghost" id="addp" style="margin-top:6px">+ Aggiungi prodotto</button></div>
      <div class="bar"><div class="sum" style="padding:0 4px"><span>Inseriti / rimossi: <span id="tot">${totHtml()}</span>${R.total !== '' ? ` <span class="note">(dichiarati ${esc(R.total)})</span>` : ''}</span></div>
      <div class="row2" style="display:flex;gap:10px"><button class="btn ghost" id="res">Riprendi Refill</button><button class="btn mintb" id="end">Fine Refill</button></div></div>`);
    bindQty(); $('#addp').onclick = addSheet;
    $('#sq').oninput = (e) => { R.filter = e.target.value; const p = e.target.selectionStart; drawRefill(); const i = $('#sq'); i.focus(); i.setSelectionRange(p, p); };
    $('#res').onclick = () => { R.phase = 'unlocking'; drawRefill(); api.unlock(f, onDoor); };
  } else if (ph === 'done') {
    const rows = SKUS.filter((s) => R.q[s.sku] || R.rm[s.sku]);
    render(`<div class="screen center"><div class="ring">${IC.check}</div><h1><span class="mint">Refill</span> completato</h1><p class="muted">${esc(f.name)}</p>
      <div class="card" style="width:100%;text-align:left;margin-top:12px">${rows.map((s) => `<div class="sum" style="padding:4px 0"><span>${esc(s.name)}</span><span>${R.q[s.sku] ? `<span class="mint">+${R.q[s.sku]}</span>` : ''} ${R.rm[s.sku] ? `<span class="neg">−${R.rm[s.sku]}</span>` : ''}</span></div>`).join('') || '<span class="muted">Nessun prodotto inserito</span>'}
      <div class="sum" style="border-top:1px solid var(--line);margin-top:6px"><span>Totale</span><span>${totHtml()}</span></div></div>
      ${R.photo ? '<p class="note">Foto del frigo allegata</p>' : ''}</div>
      <div class="bar"><button class="btn" id="again">Nuovo refill</button></div>`);
    $('#again').onclick = () => (location.hash = '#/scan');
    return;
  }
  const end = $('#end'); if (end) end.onclick = confirmEnd;
}

// aggiunta di prodotti del catalogo (sezione Prodotti della dashboard) non presenti nel frigo
function addSheet() {
  const m = document.createElement('div'); m.className = 'modal sheetm';
  const draw = (q = '') => {
    const rows = SKUS.filter((s) => !R.list.includes(s) && (s.name + s.sku + s.cat).toLowerCase().includes(q.toLowerCase())).sort(byName);
    m.querySelector('#alist').innerHTML = rows.map((s) => `<div class="card sku"><img class="pimg" src="${esc(imgOf(s))}" alt=""><div class="pn"><div class="n">${esc(s.name)}</div><div class="c">${s.sku} · ${esc(s.cat)}</div></div><button class="btn" data-a="${s.sku}" style="width:auto;padding:10px 16px">Aggiungi</button></div>`).join('') || '<p class="muted" style="text-align:center">Nessun altro prodotto nel catalogo</p>';
    m.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { const s = SKUS.find((x) => x.sku === b.dataset.a); R.list.push(s); R.list.sort(byName); R.q[s.sku] = 0; R.rm[s.sku] = 0; toast(s.name + ' aggiunto'); draw($('#asq').value); });
  };
  m.innerHTML = `<div class="card" style="text-align:left;max-height:85vh;display:flex;flex-direction:column"><h2>Aggiungi prodotto</h2><p class="muted small" style="margin:4px 0 10px">Catalogo della dashboard</p>
    <input id="asq" placeholder="Cerca per nome o SKU"><div id="alist" style="overflow:auto;margin:12px 0"></div><button class="btn mintb" id="adone">Fatto</button></div>`;
  document.body.appendChild(m); draw();
  m.querySelector('#asq').oninput = (e) => draw(e.target.value);
  m.querySelector('#adone').onclick = () => { m.remove(); drawRefill(); };
}

function confirmEnd() {
  // stato reale della porta: aperta solo dopo l'evento di apertura e fino a quello di chiusura
  const door = R.phase === 'unlocking' ? '<b class="blue">La porta non è ancora stata aperta.</b>' : ['opened', 'loading'].includes(R.phase) ? '<b class="mint">La porta è ancora aperta.</b>' : '<b class="blue">La porta è chiusa.</b>';
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card"><h2>Concludere il refill?</h2>
    <p class="muted">${door}<br>Inseriti: <b class="mint">${sumQty(R.q)}</b> · Rimossi: <b class="neg">${sumQty(R.rm)}</b>.</p>
    <button class="btn mintb" id="y">Sì, Fine Refill</button><div class="sp"></div><button class="btn text" id="n">No, aggiungi altri prodotti</button></div>`;
  document.body.appendChild(m);
  m.querySelector('#n').onclick = () => { m.remove(); if (['unlocking', 'opened'].includes(R.phase)) setPhase('loading'); };
  const card = m.firstElementChild;
  const finish = async () => {
    card.innerHTML = '<p class="muted" style="margin:12px 0">Chiusura del refill…</p>';
    const quantities = SKUS.filter((s) => R.q[s.sku] || R.rm[s.sku]).map((s) => ({ sku: s.sku, added: R.q[s.sku], removed: R.rm[s.sku] }));
    await api.submitRefill({ fridge: R.fridge, quantities, photo: R.photo });
    m.remove(); setPhase('done');
  };
  // ultimo passo prima di chiudere: foto del frigo (facoltativa)
  const photoStep = () => {
    card.innerHTML = `<div class="ring" style="width:110px;height:110px;margin:0 auto 14px">${IC.camera}</div><h2>Foto del frigo</h2>
      <p class="muted">Scatta una foto del frigo prima di chiudere il refill, oppure salta.</p>
      <button class="btn" id="ps">Scatta foto</button><div class="sp"></div><button class="btn text" id="pk">Salta</button>`;
    card.querySelector('#pk').onclick = finish;
    card.querySelector('#ps').onclick = async () => {
      const ph = await takePhoto(); if (!ph) return;
      R.photo = ph;
      card.innerHTML = `<div class="ring" style="width:110px;height:110px;margin:0 auto 14px">${IC.check}</div><h2>Foto scattata</h2>
        <img class="photo-prev" src="${R.photo}" alt="Foto del frigo" style="width:100%;max-height:180px;object-fit:cover;border-radius:14px;margin:10px 0"><p class="muted">Chiusura del refill…</p>`;
      setTimeout(finish, 1600);
    };
  };
  m.querySelector('#y').onclick = () => (R.photo ? finish() : photoStep());
}

// Fotocamera: anteprima live con pulsante di scatto; se la camera non è disponibile (es. anteprima nel browser) usa il selettore foto del telefono
function takePhoto() {
  return new Promise(async (resolve) => {
    const viaFile = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
      i.onchange = async () => resolve(i.files[0] ? await shrink(i.files[0]) : null); i.oncancel = () => resolve(null); i.click();
    };
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); } catch (e) { return viaFile(); }
    const o = document.createElement('div'); o.className = 'cam';
    o.innerHTML = '<video playsinline muted autoplay></video><div class="cam-bar"><button class="btn ghost" id="cx" style="flex:1">Annulla</button><button class="shutter" id="cs" aria-label="Scatta"></button><span style="flex:1"></span></div>';
    document.body.appendChild(o);
    const v = o.querySelector('video'); v.srcObject = st; await v.play().catch(() => {});
    const done = (r) => { st.getTracks().forEach((t) => t.stop()); o.remove(); resolve(r); };
    o.querySelector('#cx').onclick = () => done(null);
    o.querySelector('#cs').onclick = () => {
      const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
      c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      done(c.toDataURL('image/jpeg', 0.7));
    };
  });
}

// riduce la foto prima di salvarla/inviarla
function shrink(file, max = 1024) {
  return new Promise((res) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => res(null); img.src = url;
  });
}

/* ============ Router ============ */
function route() {
  clearTimeout(introTimer);
  const p = (location.hash.slice(2) || 'intro').split('/')[0];
  if (p === 'intro') return introScreen();
  if (!db.user && p !== 'login') return (location.hash = '#/login');
  if (p === 'login') return db.user ? (location.hash = '#/scan') : loginScreen();
  if (p === 'scan') return scanScreen();
  if (p === 'code') return codeScreen();
  if (p === 'refill') return drawRefill();
  location.hash = '#/scan';
}
window.addEventListener('hashchange', route);
route();
