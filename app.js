import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, runTransaction, serverTimestamp, getCountFromServer, getAggregateFromServer, count, average } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getDatabase, ref, set, remove, onValue, onDisconnect, serverTimestamp as rtdbTime } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyDCE4TNP_einciB5isvoB_4BwVZjjrJ4nE",
  authDomain: "jnf-moto.firebaseapp.com",
  databaseURL: "https://jnf-moto-default-rtdb.firebaseio.com",
  projectId: "jnf-moto",
  storageBucket: "jnf-moto.firebasestorage.app",
  messagingSenderId: "881645737213",
  appId: "1:881645737213:web:26bf401db841abebe35a94"
};
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const rtdb = getDatabase(fb);

const MIN = 2000;
const LOGO = 'icon-192.png';
const appEl = document.getElementById('app');

/* ---------- utilidades ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const parseMoney = v => { const d = String(v).replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : NaN; };
const validAmount = n => isNaN(n) ? 'Escribe un valor en pesos.' : n < MIN ? 'El mínimo es ' + money(MIN) + '.' : n % 100 !== 0 ? 'Usa múltiplos de $100 (por ejemplo $2.300).' : '';
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
const tsMs = t => t && typeof t.toMillis === 'function' ? t.toMillis() : Date.now();
const fmtRating = v => v.toFixed(1).replace('.', ',');
const pagoTxt = v => (v && v.pago === 'transferencia') ? 'Transferencia' : 'Efectivo';
const cobroTxt = v => (v && v.pago === 'transferencia') ? 'Cobrar por transferencia' : 'Cobrar en efectivo';
function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const etaMin = km => Math.max(1, Math.round(km * 3)); // estimado urbano (~20 km/h)
const normKey = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const fmtDist = km => km == null ? '' : km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
function errMsg(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Usa "Ingresar".',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Usa correo y contraseña.',
    'auth/network-request-failed': 'Sin conexión a internet. Revisa tu señal e intenta de nuevo.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
    'permission-denied': 'La operación no está permitida.',
    'unavailable': 'Sin conexión con el servidor. Revisa tu señal.'
  };
  return map[c] || (e && e.message && !c ? e.message : 'Ocurrió un error (' + (c || 'desconocido') + '). Intenta de nuevo.');
}
/* ---------- estado ---------- */
const S = {
  screen: 'cargando', user: null, perfil: null, conductor: null, admin: false, mode: 'pasajero',
  f: {}, err: null, banner: null, busy: false,
  pos: null, gps: 'pendiente',
  offer: MIN, otroOpen: false, notaOpen: false, pago: 'efectivo', cTransfer: null,
  viajeId: null, viaje: null, ofertas: [], ratings: {}, cPhone: null, pPhone: null, sos: null, drvPos: null, paxPos: null, route: null, sharing: false, reqMap: null, others: {}, destPin: null, pickDest: false, docs: {}, docsFor: null, topDest: null, rates: {}, cancel: { motivo: null, texto: '' }, admUsers: null, admQ: {}, admLimit: 30, admMake: null, admKpi: null, hideInstall: false, showPass: false, docMsg: '', admOpen: null, admDocs: {}, admBig: null,
  rating: 5, chips: {}, reportOpen: false,
  online: false, requests: [], ignored: {}, cOtro: {}, stats: null, espera: null,
  cal: null, hist: null, admTab: 'conductores', adm: {}
};
let subs = [], gsubs = [], map = null, mk = {}, watchId = null, lastPush = 0, audioCtx = null;
const addSub = u => subs.push(u);
function clearSubs() { subs.forEach(u => { try { u(); } catch (e) { } }); subs = []; }
function clearGSubs() { gsubs.forEach(u => { try { u(); } catch (e) { } }); gsubs = []; }

/* ---------- íconos ---------- */
const I = {
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;opacity:.6"><path d="M9 18l6-6-6-6"/></svg>',
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  starOn: '<svg width="40" height="40" viewBox="0 0 24 24" fill="#C9A227" stroke="#A8841A" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
  starOff: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--star-off)" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>'
};
const LABELS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
const RADIO_KM = 2; // zona en la que se cuentan y muestran los conductores cercanos
// Cancelaciones. Las reglas de Firestore usan 2 min, 5 min y ETA+10 min; la app usa márgenes para no contradecirlas.
const GRACIA_S = 105, ESPERA_S = 310, TARDE_EXTRA_MIN = 10.25;
const REC = st => st === 'asignado' || st === 'en_punto'; // fase de recogida
const fmtClock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const MOTIVOS = {
  pasajero: [['ya_no', 'Ya no lo necesito'], ['no_llega', 'El conductor no llega'], ['inseguro', 'Me siento inseguro'], ['otro', 'Otro motivo']],
  conductor: [['inconveniente', 'Tuve un inconveniente'], ['inseguro', 'Me siento inseguro'], ['otro', 'Otro motivo']]
};
const ASP_C = ['Conducción segura', 'Puntualidad', 'Amabilidad', 'Vehículo limpio', 'Mototour en buen estado'];
const ASP_P = ['Pagó completo', 'Puntual en el punto', 'Respetuoso', 'Cuidó el vehículo'];

/* ---------- piezas de interfaz ---------- */
const brandRow = right => '<div class="row between"><div class="row"><img class="logo" src="' + LOGO + '" alt="Logo JNF S.A.S."><span class="brandname">JNF Moto</span></div>' + (right || '') + '</div>';
const subTop = (title, back) => '<div class="top"><div class="row"><button class="iconbtn" data-act="go" data-v="' + (back || 'menu') + '" aria-label="Volver">' + I.back + '</button><h1 class="h1">' + title + '</h1></div></div>';
function bannerHTML(b) { if (!b) return ''; return '<div class="banner ' + b.kind + '" role="status">' + (b.kind === 'danger' ? I.shield : I.info) + '<div class="grow">' + esc(b.text) + '</div><button data-act="closeBanner" aria-label="Cerrar aviso">Cerrar</button></div>'; }
const errHTML = () => S.err ? '<div class="banner danger" role="alert">' + I.info + '<div class="grow">' + esc(S.err) + '</div><button data-act="closeErr" aria-label="Cerrar error">Cerrar</button></div>' : '';
function starsHTML(val, act) { let h = '<div class="stars" role="group" aria-label="Calificación">'; for (let n = 1; n <= 5; n++) h += '<button class="star" data-act="' + act + '" data-v="' + n + '" aria-label="' + n + (n === 1 ? ' estrella' : ' estrellas') + '" aria-pressed="' + (n <= val) + '">' + (n <= val ? I.starOn : I.starOff) + '</button>'; return h + '</div>'; }
const chipsHTML = (names, sel, act) => '<div class="chips">' + names.map(n => '<button class="chip" data-act="' + act + '" data-v="' + esc(n) + '" aria-pressed="' + (!!sel[n]) + '">' + esc(n) + '</button>').join('') + '</div>';
const fv = k => esc(S.f[k] || '');
function ratingLine(r) { if (!r) return '★ …'; return '★ ' + fmtRating(r.avg) + (r.n < 5 ? ' <span class="pill p-info">Nuevo</span>' : ' · ' + r.n + ' calificaciones'); }
const busyAttr = () => S.busy ? ' disabled' : '';

/* ---------- instalación en el celular ---------- */
let installEvt = null;
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (['login', 'home', 'menu'].includes(S.screen)) render(); });
window.addEventListener('appinstalled', () => { installEvt = null; S.banner = { kind: 'ok', text: 'JNF Moto quedó instalada. Ábrela desde el ícono en tu celular.' }; render(); });
function homeInstallCard() {
  if (isStandalone() || S.hideInstall) return '';
  const body = installEvt ? '<div class="muted small">Así se abre a pantalla completa, sin la barra del navegador.</div><div class="row"><button class="btn btn-gold btn-sm" style="flex:1" data-act="install">Instalar</button><button class="btn btn-ghost btn-sm" style="flex:1" data-act="hideInstall">Ahora no</button></div>'
    : isIOS() ? '<div class="muted small">Ábrela en Safari, toca Compartir (el cuadro con la flecha) y elige "Agregar a inicio".</div><button class="link" data-act="hideInstall" style="align-self:flex-start;font-size:13px">Ahora no</button>'
      : '<div class="muted small">En Chrome toca ⋮ y luego "Instalar app". Si la abriste desde WhatsApp, primero toca ⋮ y "Abrir en Chrome".</div><button class="link" data-act="hideInstall" style="align-self:flex-start;font-size:13px">Ahora no</button>';
  return '<div class="card" style="gap:8px"><div class="strong">Estás usando JNF Moto desde el navegador</div>' + body + '</div>';
}
function installCard() {
  if (isStandalone()) return '';
  if (installEvt) return '<div class="card" style="flex-direction:row;align-items:center;gap:12px"><img src="' + LOGO + '" alt="" style="width:44px;height:44px;flex-shrink:0"><div class="col grow"><div class="strong">Instala JNF Moto</div><div class="muted small">Ábrela desde un ícono, como cualquier app.</div></div><button class="btn btn-gold btn-sm" data-act="install" style="flex-shrink:0">Instalar</button></div>';
  if (isIOS()) return '<div class="card"><div class="strong">Instala JNF Moto en tu iPhone</div><div class="muted small">En Safari toca el botón Compartir (el cuadro con la flecha) y elige "Agregar a inicio".</div></div>';
  return '';
}

/* ---------- pantallas: acceso ---------- */
function vCargando() { return '<div class="screen"><div class="pad" style="flex:1;justify-content:center;align-items:center"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:96px;height:96px"><div class="spinner" role="status" aria-label="Cargando"></div></div></div>'; }
function vLogin() {
  const crear = S.f.modoCrear;
  return '<div class="screen"><div class="top" style="align-items:center;text-align:center;padding:28px 20px"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:88px;height:88px"><h1 class="h1" style="color:#C9A227">JNF Moto</h1><div class="sub">Tu mototour, al precio que acuerdas.</div></div>' +
    '<div class="pad">' + errHTML() + bannerHTML(S.banner) +
    '<button class="btn gbtn" data-act="google"' + busyAttr() + '>Entrar con Google</button><div class="divider">o con tu correo</div>' +
    '<div class="field"><label for="em">Correo electrónico</label><input type="email" id="em" data-in="email" autocomplete="email" value="' + fv('email') + '"></div>' +
    '<div class="field"><label for="pw">Contraseña</label><div class="row"><input type="' + (S.showPass ? 'text' : 'password') + '" id="pw" data-in="pass" autocomplete="' + (crear ? 'new-password' : 'current-password') + '" autocapitalize="off" spellcheck="false" value="' + fv('pass') + '"><button class="iconbtn light" style="width:48px;height:48px;border-radius:12px" data-act="togglePass" aria-controls="pw" aria-pressed="' + S.showPass + '" aria-label="' + (S.showPass ? 'Ocultar contraseña' : 'Mostrar contraseña') + '">' + (S.showPass ? I.eyeOff : I.eye) + '</button></div>' + (crear ? '<span class="muted small">Mínimo 6 caracteres.</span>' : '') + '</div>' +
    '<button class="btn btn-gold" data-act="' + (crear ? 'signup' : 'signin') + '"' + busyAttr() + '>' + (crear ? 'Crear cuenta' : 'Ingresar') + '</button>' +
    '<button class="link" data-act="toggleCrear" style="align-self:center">' + (crear ? 'Ya tengo cuenta: ingresar' : 'No tengo cuenta: crear una') + '</button>' +
    (crear ? '' : '<button class="link" data-act="reset" style="align-self:center;font-size:13px">Olvidé mi contraseña</button>') +
    installCard() + '</div><div class="demo">Versión de prueba · Asesorías y Consultorías JNF S.A.S.</div></div>';
}
function vOnboarding() {
  return '<div class="screen"><div class="top">' + brandRow() + '<h1 class="h1">Completa tu perfil</h1><div class="sub">Lo usamos para que conductores y pasajeros se identifiquen.</div></div><div class="pad">' + errHTML() +
    '<div class="field"><label for="on">Nombre y primer apellido</label><input type="text" id="on" data-in="nombre" autocomplete="name" value="' + fv('nombre') + '"></div>' +
    '<div class="field"><label for="ot">Celular</label><input type="tel" id="ot" data-in="telefono" inputmode="numeric" placeholder="10 dígitos" autocomplete="tel" value="' + fv('telefono') + '"></div>' +
    '<label class="check"><input type="checkbox" id="oa" data-in="acepta"' + (S.f.acepta ? ' checked' : '') + '><span>Autorizo a Asesorías y Consultorías JNF S.A.S. el tratamiento de mis datos personales (nombre, celular y ubicación durante los viajes) conforme a la Ley 1581 de 2012, para prestar el servicio de la app.</span></label>' +
    '<button class="btn btn-gold" data-act="saveProfile"' + busyAttr() + '>Continuar</button><button class="link" data-act="logout" style="align-self:center">Salir</button></div></div>';
}
/* ---------- pantallas: pasajero ---------- */
function vHome() {
  let gps = '';
  if (S.gps === 'ok') gps = '<div class="muted small">Ubicación GPS detectada. Agrega una referencia para que el conductor te encuentre.</div>';
  else if (S.gps === 'pendiente') gps = '<div class="muted small">Buscando tu ubicación…</div>';
  else gps = '<div class="banner warn">' + I.info + '<div class="grow">No pudimos obtener tu ubicación. Activa el GPS y el permiso de ubicación del navegador, o escribe con detalle dónde te recogen.</div><button data-act="retryGps">Reintentar</button></div>';
  let h = '<div class="screen"><div class="row between" style="padding:12px 16px;background:var(--bg)"><button class="iconbtn light" data-act="go" data-v="menu" aria-label="Abrir menú">' + I.menu + '</button>' +
    '<div class="row" style="background:#1A2580;border-radius:28px;padding:4px 16px 4px 4px"><img class="logo" src="' + LOGO + '" alt="Logo JNF S.A.S."><span class="brandname">JNF Moto</span></div><div style="width:44px"></div></div>';
  h += S.gps === 'ok' ? '<div id="map" class="lmap" role="img" aria-label="Mapa con tu ubicación' + (S.destPin ? ' y el destino' : '') + '"></div>' + legendHTML([['person', 'Tú'], ['otro', 'Conductores cerca']].concat(S.destPin ? [['dest', 'Destino']] : [])) : '';
  h += '<div class="sheet"><div class="handle"></div>' + bannerHTML(S.banner) + errHTML() + homeInstallCard() + '<h1 class="h1">¿Dónde estás?</h1>';
  h += '<div class="field"><label for="ref">Punto de recogida (referencia)</label><input type="text" id="ref" data-in="ref" placeholder="Ej. Frente a la tienda azul, Calle 5" value="' + fv('ref') + '">' + gps + '</div>';
  h += '<h2 class="h1" style="margin-top:6px">¿A dónde vas?</h2><div class="field"><label for="destino">Destino</label><input type="text" id="destino" data-in="destino" placeholder="Barrio, dirección o lugar" value="' + fv('destino') + '" autocomplete="off">';
  if (S.pickDest) h += '<div class="banner info">' + I.info + '<div class="grow">Toca el mapa en el punto exacto de tu destino.</div><button data-act="pickDest">Cancelar</button></div>';
  else if (S.destPin) h += '<div class="row between" style="flex-wrap:wrap;gap:6px"><span class="muted small">Destino marcado · recorrido estimado: <b data-eta>' + esc(etaText()) + '</b></span><button class="link" data-act="clearDest" style="font-size:13px;min-height:36px">Quitar</button></div>';
  else if (S.gps === 'ok') h += '<div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button class="btn btn-ghost btn-sm" style="width:100%" data-act="geoDest"' + busyAttr() + '>Ubicar en el mapa</button><button class="btn btn-ghost btn-sm" style="width:100%" data-act="pickDest">Marcar en el mapa</button></div>';
  h += '</div>';
  const sel = {}; sel[S.f.destino] = true;
  if (S.topDest && S.topDest.length) h += '<div class="col" style="gap:8px"><span class="lbl">Sitios frecuentes</span>' + chipsHTML(S.topDest.map(d => d.texto), sel, 'freq') + '</div>';
  h += '<div class="offerbox"><span class="lbl">Tu oferta</span><div class="stepper"><button class="round" data-act="minus" aria-label="Bajar oferta 500 pesos"' + (S.offer <= MIN ? ' disabled' : '') + '>−</button><div class="amount" id="amount">' + money(S.offer) + '</div><button class="round solid" data-act="plus" aria-label="Subir oferta 500 pesos">+</button></div>' +
    '<div class="row between" style="flex-wrap:wrap;gap:4px"><span class="muted small">Mínimo ' + money(MIN) + ' · sin tope</span><button class="link" data-act="otroToggle" aria-expanded="' + S.otroOpen + '" style="font-size:13px">' + (S.otroOpen ? 'Cerrar' : 'Escribir otro valor') + '</button></div>';
  if (S.otroOpen) h += '<div class="field"><label for="otro">Valor que ofreces</label><div class="row"><input type="text" inputmode="numeric" id="otro" data-in="otroVal" placeholder="Ej. 2.300" value="' + fv('otroVal') + '"><button class="btn btn-navy btn-sm" data-act="otroUse" style="min-height:48px">Usar</button></div>' + (S.f.otroErr ? '<div class="err" role="alert">' + esc(S.f.otroErr) + '</div>' : '') + '</div>';
  h += '</div><div class="col" style="gap:8px"><span class="lbl" id="lblpago">Forma de pago</span><div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))" role="group" aria-labelledby="lblpago">' +
    '<button class="chip" data-act="pago" data-v="efectivo" aria-pressed="' + (S.pago === 'efectivo') + '">Efectivo</button><button class="chip" data-act="pago" data-v="transferencia" aria-pressed="' + (S.pago === 'transferencia') + '">Transferencia</button></div></div>' +
    '<button class="chip" data-act="notaToggle" aria-expanded="' + S.notaOpen + '" style="align-self:flex-start">' + (S.notaOpen ? 'Ocultar nota' : 'Agregar nota al conductor') + '</button>';
  if (S.notaOpen) h += '<div class="field"><label for="nota">Nota para el conductor</label><textarea id="nota" data-in="nota" maxlength="200" placeholder="Ej. Llevo un paquete pequeño">' + fv('nota') + '</textarea></div>';
  const bl = blockOf(S.user.uid, 'pasajero'), rt = rateOf(S.user.uid, 'pasajero');
  if (!bl && rt && rt.pct != null && rt.pct > 15) h += '<div class="banner warn">' + I.info + '<div class="grow">Tu tasa de cancelación es de <b>' + rt.pct + ' %</b>. Si supera el 30 %, tu cuenta pasa a revisión del administrador.</div></div>';
  h += bl ? blockCard('pasajero', bl) : '<button class="btn btn-gold" data-act="buscar"' + busyAttr() + '>Buscar mototour · ' + money(S.offer) + '</button>';
  h += '</div></div>';
  return h;
}
function livePos(uid) { const o = S.others && S.others[uid]; return o && o.rol === 'conductor' && typeof o.ts === 'number' && Date.now() - o.ts < 3 * 60 * 1000 ? { lat: o.lat, lng: o.lng } : null; }
function zoneCenter() { return S.screen === 'buscando' ? (pickupOf(S.viaje) || S.pos) : S.screen === 'home' ? S.pos : null; }
function zoneCount() {
  const c = zoneCenter(); if (!c) return 0; const me = S.user && S.user.uid;
  return Object.keys(S.others || {}).filter(uid => { const p = livePos(uid); return uid !== me && p && distKm(c, p) <= RADIO_KM; }).length;
}
function offerEta(o) { const p = livePos(o.id) || (o.lat != null ? { lat: o.lat, lng: o.lng } : null); const km = distKm(p, pickupOf(S.viaje) || S.pos); return km == null ? null : { km, min: etaMin(km) }; }
function vBuscando() {
  const v = S.viaje || {}, n = zoneCount(), no = S.ofertas.length;
  const CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const OK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>';
  const chip = (ic, t, attr) => '<span class="row" style="gap:6px;padding:7px 12px;border-radius:12px;background:#1A2580;color:#FFFFFF;font-size:15px;font-weight:800;white-space:nowrap"' + attr + '>' + ic + t + '</span>';
  let h = '<div class="screen"><div class="top" style="gap:6px"><h1 class="h1">' + (no ? 'Ofertas recibidas' : 'Buscando conductores') + '</h1><div class="sub">Tu oferta: <span style="color:#C9A227;font-weight:800">' + money(v.oferta || S.offer) + '</span> hacia ' + esc(v.destino ? v.destino.texto : '') + ' · ' + pagoTxt(v) + '</div>' +
    '<div class="sub"><span data-count>' + n + '</span> ' + (n === 1 ? 'conductor' : 'conductores') + ' en tu zona · ' + (no ? no + (no === 1 ? ' oferta' : ' ofertas') : 'esperando ofertas') + '</div></div>';
  h += '<div id="map" class="lmap" role="img" aria-label="Mapa con tu ubicación, la zona de búsqueda y los conductores cercanos"></div>' + legendHTML([['person', 'Tú'], ['otro', 'En tu zona'], ['moto', 'Con oferta']]);
  h += '<div class="pad">' + errHTML();
  if (!no) h += '<div class="card" style="flex-direction:row;align-items:center;gap:12px"><div class="spinner" aria-hidden="true" style="flex-shrink:0"></div><div class="col"><div class="strong">Enviamos tu solicitud a los conductores de tu zona</div><div class="muted small">Las ofertas aparecen aquí y en el mapa a medida que llegan. Mantén esta pantalla abierta.</div></div></div>';
  S.ofertas.forEach(o => {
    const r = S.ratings[o.id], e = offerEta(o), tu = o.precio === v.oferta;
    h += '<div class="card' + (tu ? ' sel' : '') + '"><div class="row"><div class="avatar">' + esc(initials(o.nombre)) + '</div><div class="col grow"><div class="strong">' + esc(o.nombre) + '</div><div class="muted small row" style="gap:6px;flex-wrap:wrap">' + ratingLine(r) + ratePill(o.id, 'conductor') + '</div></div>' +
      '<div class="col" style="align-items:flex-end"><div class="price">' + money(o.precio) + '</div>' + (tu ? '<span class="pill p-warn">Tu precio</span>' : '') + '</div></div>' +
      (e ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + chip(CLOCK, 'Llega en <span data-ofmin="' + esc(o.id) + '">' + e.min + '</span> min', '') + chip(PIN, 'a <span data-ofkm="' + esc(o.id) + '">' + fmtDist(e.km) + '</span>', '') + '</div>' : '<div class="muted small">Ubicación del conductor no disponible.</div>') +
      '<div class="col" style="gap:4px"><div class="muted">' + esc(o.moto) + ' ' + esc(o.color) + ' · Placa ' + esc(o.placa) + '</div>' +
      (o.registro ? '<div class="row small strong" style="gap:6px;color:var(--ok-ink)">' + OK + 'Registro de tránsito N° ' + esc(o.registro) + '</div>' : '') + '</div>' +
      '<button class="btn btn-gold" data-act="accept" data-v="' + esc(o.id) + '" style="min-height:48px;font-size:15px"' + busyAttr() + '>Aceptar ' + money(o.precio) + '</button></div>';
  });
  return h + '<button class="link danger" data-act="cancelTrip" style="align-self:center"' + busyAttr() + '>Cancelar solicitud</button></div></div>';
}
function graceLeft() { const v = S.viaje; return v && v.asignadoEn ? GRACIA_S - (Date.now() - tsMs(v.asignadoEn)) / 1000 : 0; }
function penPasajero(v, motivo) {
  if (motivo === 'inseguro') return null;
  const el = (Date.now() - tsMs(v.asignadoEn)) / 1000;
  if (el < GRACIA_S) return null;
  if (motivo === 'no_llega' && v.estado === 'asignado' && el / 60 > (v.etaMin || 5) + TARDE_EXTRA_MIN) return 'conductor';
  return 'pasajero';
}
function vCancelar() {
  const v = S.viaje || {}, rol = S.cancelRol, m = S.cancel.motivo;
  const quien = rol === 'pasajero' ? (v.conductor ? v.conductor.nombre : '') : v.pasajeroNombre;
  let h = '<div class="screen"><div class="top" style="gap:4px"><h1 class="h1">Cancelar viaje</h1><div class="sub">' + esc(quien) + ' · ' + esc(v.destino ? v.destino.texto : '') + ' · ' + money(v.precioFinal || 0) + '</div></div><div class="pad">' + errHTML();
  h += '<h2 class="h2">¿Por qué cancelas?</h2><div class="card" style="gap:0;padding:4px 14px" role="radiogroup" aria-label="Motivo de la cancelación">';
  MOTIVOS[rol].forEach(o => {
    const on = m === o[0];
    h += '<button role="radio" aria-checked="' + on + '" class="menuitem" data-act="motivo" data-v="' + o[0] + '" style="justify-content:flex-start;gap:12px"><span style="width:22px;height:22px;border-radius:11px;border:2px solid var(--ink);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + (on ? '<span style="width:12px;height:12px;border-radius:6px;background:var(--ink)"></span>' : '') + '</span>' + o[1] + '</button>';
  });
  h += '</div>';
  if (m === 'otro') h += '<div class="field"><label for="mt">Escribe el motivo de la cancelación</label><textarea id="mt" data-in="motivoTexto" maxlength="200" placeholder="Cuéntanos qué pasó">' + fv('motivoTexto') + '</textarea></div>';
  const ok = t => '<div class="banner ok">' + I.info + '<div class="grow">' + t + '</div></div>', inf = t => '<div class="banner info">' + I.info + '<div class="grow">' + t + '</div></div>';
  if (rol === 'pasajero') {
    const g = graceLeft();
    if (m === 'inseguro') h += ok('No penaliza. El caso llega a revisión del administrador.');
    else if (g > 0) h += ok('<b>Sin penalización:</b> estás dentro de los 2 minutos de gracia (quedan <span data-timer="gracia">' + fmtClock(g) + '</span>).');
    else if (m === 'no_llega' && penPasajero(v, m) === 'conductor') h += ok('No cuenta en tu tasa: el conductor superó su tiempo de llegada.');
    else h += inf('Esta cancelación contará en tu tasa de cancelación. "Me siento inseguro" nunca penaliza y llega a revisión del administrador.');
  } else {
    h += m === 'inseguro' ? ok('No penaliza. El caso llega a revisión del administrador.') : '<div class="banner warn">' + I.info + '<div class="grow">Esta cancelación contará en tu tasa de cancelación. Si el pasajero no se presentó, espera los 5 minutos en el punto y usa ese botón.</div></div>';
  }
  return h + '<button class="btn btn-danger" data-act="doCancel"' + busyAttr() + '>Cancelar viaje</button><button class="btn btn-ghost" data-act="backFromCancel">Volver al viaje</button></div></div>';
}
function sosBlock() {
  if (S.sos === 'confirm') return '<div class="banner danger" role="alertdialog" aria-label="Confirmar alerta de pánico">' + I.shield + '<div class="grow col" style="gap:10px"><div class="strong">¿Activar la alerta de pánico?</div><div>Se registra una alerta con tu ubicación para el administrador de JNF Moto' + ((S.perfil.contactos || []).length ? ' y podrás avisar a tus contactos por WhatsApp' : '') + '.</div><div class="row"><button class="btn btn-danger btn-sm" data-act="sosSend" style="flex:1;min-height:44px">Activar alerta</button><button class="btn btn-ghost btn-sm" data-act="sosCancel" style="flex:1;min-height:44px">Cancelar</button></div></div></div>';
  if (S.sos === 'sent') {
    const loc = S.pos ? 'https://maps.google.com/?q=' + S.pos.lat + ',' + S.pos.lng : '';
    const txt = encodeURIComponent('Alerta JNF Moto: necesito ayuda durante un viaje en mototour.' + (loc ? ' Mi ubicación: ' + loc : ''));
    const btns = (S.perfil.contactos || []).map(c => '<a class="btn btn-danger btn-sm" style="width:100%;min-height:44px" target="_blank" rel="noopener" href="https://wa.me/57' + esc(c.telefono) + '?text=' + txt + '">Avisar a ' + esc(c.nombre) + ' por WhatsApp</a>').join('');
    return '<div class="banner danger" role="alert">' + I.shield + '<div class="grow col" style="gap:8px"><div><b>Alerta registrada.</b> El administrador de JNF Moto la ve en su panel.</div>' + btns + '</div></div>';
  }
  return '';
}
function vViaje() {
  const v = S.viaje || {}, c = v.conductor || {}, st = v.estado;
  const hasDest = !!destOf(v);
  const sub = st === 'en_punto' ? 'Tu conductor llegó' : st === 'asignado' ? 'Tu conductor llega en' : hasDest ? 'Llegas a ' + esc(v.destino.texto) + ' en' : 'Vas en camino a';
  const big = st === 'en_punto' ? 'Sal al punto de recogida' : st === 'asignado' ? '<span data-eta>' + esc(S.drvPos ? etaText() : 'Ubicando al conductor…') + '</span>' : hasDest ? '<span data-eta>' + esc(etaText()) + '</span>' : esc(v.destino ? v.destino.texto : '');
  let h = '<div class="screen"><div class="top" style="gap:10px"><div class="row between"><div class="col"><div class="sub">' + sub + '</div><div class="h1" style="color:#C9A227">' + big + '</div></div><button class="sos" data-act="sos" aria-label="Botón de pánico">SOS</button></div></div>';
  h += '<div id="map" class="lmap tall" role="img" aria-label="Mapa del viaje"></div>' + legendHTML(REC(st) ? [['person', 'Tú'], ['moto', 'Tu conductor'], ['otro', 'Otros conductores']] : [['moto', 'Tu conductor']].concat(hasDest ? [['dest', 'Destino']] : []));
  h += '<div class="sheet"><div class="handle"></div>' + sosBlock() + errHTML() + bannerHTML(S.banner);
  if (st === 'en_punto') h += '<div class="card" style="align-items:center;gap:6px"><div class="muted small strong">Tu conductor te espera</div><div class="amount" style="line-height:1.25" data-timer="espera">' + fmtClock(ESPERA_S - 10 - (Date.now() - tsMs(v.enPuntoEn)) / 1000) + '</div><div class="bar" style="width:100%"><div data-timerbar="espera" style="width:' + Math.min(100, (Date.now() - tsMs(v.enPuntoEn)) / 3000) + '%;background:#C9A227"></div></div></div>' +
    '<div class="banner warn">' + I.info + '<div class="grow">Si no te presentas antes de que termine el tiempo, el conductor podrá cancelar y el viaje contará en tu tasa de cancelación.</div></div>';
  h += '<div class="row"><div class="avatar lg">' + esc(initials(c.nombre)) + '</div><div class="col grow"><div class="strong" style="font-size:16px">' + esc(c.nombre) + '</div><div class="muted">' + ratingLine(S.ratings[v.conductorId]) + '</div><div class="muted">' + esc(c.moto) + ' ' + esc(c.color) + '</div></div><div class="plate">' + esc(c.placa) + '</div></div>';
  h += S.cPhone ? '<a class="btn btn-ghost" href="tel:' + esc(S.cPhone) + '">' + I.phone + 'Llamar al conductor</a>' : '';
  h += '<div class="offerbox" style="gap:8px"><div class="row"><span class="dot"></span>' + esc(v.origen ? v.origen.texto : '') + '</div><div class="row"><span class="sq"></span>' + esc(v.destino ? v.destino.texto : '') + '</div><div class="row between" style="border-top:1px solid var(--line);padding-top:8px"><span class="muted">' + pagoTxt(v) + '</span><span class="strong">' + money(v.precioFinal || 0) + '</span></div></div>';
  if (v.pago === 'transferencia') h += S.cTransfer ? '<div class="banner info">' + I.info + '<div class="grow">Transfiere <b>' + money(v.precioFinal || 0) + '</b> a: <b>' + esc(S.cTransfer) + '</b></div></div>' : '<div class="banner warn">' + I.info + '<div class="grow">El conductor no ha registrado datos para transferencia. Acuérdenlo por llamada o paga en efectivo.</div></div>';
  if (REC(st)) h += '<button class="link danger" data-act="openCancel" style="align-self:center"' + busyAttr() + '>Cancelar viaje</button>';
  return h + '</div></div>';
}
function vCalificar() {
  const v = S.viaje || {}, c = v.conductor || {};
  let h = '<div class="screen"><div class="top" style="padding-bottom:22px">' + brandRow() + '<div class="sub">Viaje finalizado · ' + money(v.precioFinal || 0) + (v.pago === 'transferencia' ? ' por transferencia' : ' en efectivo') + '</div><h1 class="h1">¿Cómo estuvo tu viaje?</h1></div><div class="pad">' + errHTML();
  h += '<div class="card" style="align-items:center;text-align:center"><div class="avatar lg">' + esc(initials(c.nombre)) + '</div><div class="col" style="align-items:center"><div class="strong" style="font-size:16px">' + esc(c.nombre) + '</div><div class="muted">' + esc(c.moto) + ' · Placa ' + esc(c.placa) + '</div></div>' + starsHTML(S.rating, 'rate') + '<div class="strong">' + LABELS[S.rating] + '</div></div>';
  h += '<div class="col" style="gap:8px"><span class="lbl">¿Qué destacas del conductor?</span>' + chipsHTML(ASP_C, S.chips, 'chip') + '</div>';
  h += '<div class="field"><label for="com">Comentario (opcional)</label><textarea id="com" data-in="comentario" maxlength="500" placeholder="Cuéntanos más sobre el servicio">' + fv('comentario') + '</textarea></div>';
  return h + '<button class="btn btn-gold" data-act="sendRating"' + busyAttr() + '>Enviar calificación</button><button class="link" data-act="skipRating" style="align-self:center">Ahora no</button></div></div>';
}
/* ---------- menú y secciones ---------- */
function vMenu() {
  const c = S.conductor, st = c ? c.estado : 'ninguno', pOn = S.mode === 'pasajero';
  let h = '<div class="screen"><div class="top">' + brandRow('<button class="iconbtn" data-act="closeMenu" aria-label="Cerrar menú">' + I.close + '</button>') +
    '<div class="row"><div class="avatar" style="background:#FFFFFF;color:#1A2580;width:52px;height:52px;border-radius:26px">' + esc(initials(S.perfil.nombre)) + '</div><div class="col"><div class="strong" style="font-size:16px">' + esc(S.perfil.nombre) + '</div><div class="sub">' + esc(S.user.email || '') + '</div></div></div>';
  h += '<div class="seg" role="group" aria-label="Modo de uso"><button data-act="modeP" aria-current="' + pOn + '">Modo pasajero</button>';
  if (st === 'aprobado') h += '<button data-act="modeC" aria-current="' + (!pOn) + '">Modo conductor</button>';
  else if (st === 'pendiente') h += '<button disabled aria-current="false">' + I.lock + 'En revisión</button>';
  else if (st === 'ninguno') h += '<button data-act="go" data-v="registroC" aria-current="false">' + I.lock + 'Modo conductor</button>';
  else h += '<button disabled aria-current="false">' + I.lock + 'No habilitado</button>';
  h += '</div></div><div class="pad">' + bannerHTML(S.banner) + errHTML() + installCard();
  if (st === 'ninguno') h += '<div class="card"><div class="h2">¿Tienes mototour? Conduce con JNF Moto</div><div class="muted">Regístrate con los datos de tu mototour y las fotos de tu licencia, tarjeta de propiedad, SOAT y una foto tuya. El administrador las revisará antes de habilitarte.</div><button class="btn btn-gold" data-act="go" data-v="registroC">Registrarme como conductor</button></div>';
  if (st === 'pendiente') h += '<div class="card"><div class="h2">Tu registro está en revisión</div><div class="muted">El administrador está revisando tus documentos. Cuando te apruebe, esta opción se habilita sola.</div><button class="btn btn-ghost" data-act="go" data-v="registroC">Ver mis documentos</button></div>';
  if (st === 'rechazado' || st === 'suspendido') h += '<div class="card"><div class="h2">Modo conductor no habilitado</div><div class="muted">Tu cuenta de conductor está ' + st + '. Revisa tus documentos y comunícate con la oficina de JNF S.A.S.</div><button class="btn btn-ghost" data-act="go" data-v="registroC">Ver mis documentos</button></div>';
  if (st === 'aprobado') h += '<div class="card"><div class="row between"><div class="h2">Modo conductor habilitado</div><span class="pill p-ok">Aprobado</span></div><div class="banner warn">' + I.info + '<div class="grow">En esta versión de prueba, tu ubicación se comparte solo mientras la app está abierta y estás conectado.</div></div>' + (pOn ? '<button class="btn btn-gold" data-act="modeC">Conectarme como conductor</button>' : '<button class="btn btn-ghost" data-act="modeP">Volver a modo pasajero</button>') + '</div>';
  const items = [['historial', 'Mis viajes'], ['contactos', 'Contactos de emergencia']];
  if (st === 'aprobado') items.push(['transfer', 'Mis datos para transferencias'], ['micalif', 'Mi calificación como conductor'], ['suscripcion', 'Mi suscripción']);
  if (S.admin) items.push(['admin', 'Panel de administración']);
  items.push(['ayuda', 'Ayuda y soporte'], ['terminos', 'Términos y tratamiento de datos']);
  h += '<nav aria-label="Opciones">' + items.map(it => '<button class="menuitem" data-act="go" data-v="' + it[0] + '">' + it[1] + I.chev + '</button>').join('') + '</nav>';
  return h + '<button class="link danger" data-act="logout" style="align-self:flex-start">Cerrar sesión</button></div><div class="demo">Versión de prueba</div></div>';
}
function vHistorial() {
  let h = '<div class="screen">' + subTop('Mis viajes') + '<div class="pad">' + errHTML();
  if (!S.hist) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
  if (!S.hist.length) h += '<div class="card"><div class="strong">Aún no tienes viajes.</div><div class="muted">Tus viajes aparecen aquí cuando terminas uno.</div><button class="btn btn-gold" data-act="modeP">Pedir un mototour</button></div>';
  const lab = { buscando: 'Buscando', asignado: 'Asignado', en_curso: 'En curso', finalizado: 'Finalizado', cancelado: 'Cancelado' };
  S.hist.forEach(v => { h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(v.destino.texto) + '</div><div class="muted small">' + (v._rol === 'conductor' ? 'Como conductor · ' + esc(v.pasajeroNombre) : 'Como pasajero' + (v.conductor ? ' · ' + esc(v.conductor.nombre) : '')) + ' · ' + new Date(tsMs(v.creado)).toLocaleDateString('es-CO') + '</div></div><div class="col" style="align-items:flex-end"><div class="price" style="font-size:18px">' + money(v.precioFinal || v.oferta) + '</div><span class="pill ' + (v.estado === 'finalizado' ? 'p-ok' : v.estado === 'cancelado' ? 'p-warn' : 'p-info') + '">' + (lab[v.estado] || v.estado) + '</span></div></div></div>'; });
  return h + '</div></div>';
}
function vContactos() {
  const cs = S.perfil.contactos || [];
  let h = '<div class="screen">' + subTop('Contactos de emergencia') + '<div class="pad">' + errHTML() + '<div class="muted">Si activas el botón de pánico durante un viaje, podrás avisarles por WhatsApp con tu ubicación.</div>';
  cs.forEach((c, i) => { h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(c.nombre) + '</div><div class="muted">' + esc(c.telefono) + '</div></div><button class="btn btn-ghost btn-sm" data-act="delContact" data-v="' + i + '"' + busyAttr() + '>Quitar</button></div></div>'; });
  if (cs.length < 5) h += '<div class="card"><div class="h2">Agregar contacto</div><div class="field"><label for="cn">Nombre</label><input type="text" id="cn" data-in="cNombre" value="' + fv('cNombre') + '"></div><div class="field"><label for="cp">Celular</label><input type="tel" inputmode="numeric" id="cp" data-in="cTel" placeholder="10 dígitos" value="' + fv('cTel') + '"></div>' + (S.f.cErr ? '<div class="err" role="alert">' + esc(S.f.cErr) + '</div>' : '') + '<button class="btn btn-navy" data-act="addContact"' + busyAttr() + '>Agregar contacto</button></div>';
  return h + '</div></div>';
}
function vTransfer() {
  return '<div class="screen">' + subTop('Datos para transferencias') + '<div class="pad">' + errHTML() + bannerHTML(S.banner) +
    '<div class="muted">Cuando un pasajero elija pagar por transferencia, verá estos datos durante el viaje. Nadie más puede verlos.</div>' +
    '<div class="field"><label for="tr">Entidad y número</label><input type="text" id="tr" data-in="transferencia" maxlength="80" placeholder="Ej. Nequi 300 123 4567" value="' + fv('transferencia') + '"></div>' +
    '<button class="btn btn-navy" data-act="saveTransfer"' + busyAttr() + '>Guardar datos</button></div></div>';
}
const vTexto = (t, b) => '<div class="screen">' + subTop(t) + '<div class="pad"><div class="card">' + b + '</div></div></div>';
const DOCS_C = [['licencia', 'Licencia de conducción', 'Foto clara del documento vigente'], ['foto', 'Foto del conductor', 'Rostro visible, de frente y sin gafas'], ['tarjeta', 'Tarjeta de propiedad', 'Licencia de tránsito del mototour'], ['soat', 'SOAT', 'Póliza vigente del mototour'], ['transito', 'Registro ante la Secretaría de Tránsito', 'Certificado o carné expedido por la Secretaría de Tránsito']];
function vRegistroC() {
  const c = S.conductor, reg = !!c, locked = reg && c.estado === 'aprobado';
  const lab = { pendiente: ['p-warn', 'En revisión'], aprobado: ['p-ok', 'Aprobado'], rechazado: ['p-danger', 'Rechazado'], suspendido: ['p-danger', 'Suspendido'] };
  let h = '<div class="screen">' + subTop(reg ? 'Mis documentos' : 'Registro de conductor') + '<div class="pad">' + errHTML() + bannerHTML(S.banner);
  if (!reg) {
    h += '<div class="field"><label for="rm">Marca y modelo del mototour</label><input type="text" id="rm" data-in="moto" placeholder="Marca y modelo" value="' + fv('moto') + '"></div>' +
      '<div class="field"><label for="rc">Color</label><input type="text" id="rc" data-in="color" placeholder="Ej. Blanco" value="' + fv('color') + '"></div>' +
      '<div class="field"><label for="rp">Placa</label><input type="text" id="rp" data-in="placa" placeholder="Ej. ABC12D" autocapitalize="characters" value="' + fv('placa') + '"></div>' +
      '<div class="field"><label for="rt">Número de registro de tránsito</label><input type="text" id="rt" data-in="registro" placeholder="Como aparece en el certificado" autocapitalize="characters" value="' + fv('registro') + '"></div>';
  } else {
    const l = lab[c.estado] || ['p-info', c.estado];
    h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(c.moto) + ' ' + esc(c.color) + '</div><div class="muted small">Placa ' + esc(c.placa) + (c.registro ? ' · Registro de tránsito N° ' + esc(c.registro) : '') + '</div></div><span class="pill ' + l[0] + '">' + l[1] + '</span></div>' +
      (locked ? '<div class="muted small">Tus documentos fueron aprobados y ya no se pueden cambiar.</div>' : '<div class="muted small">Si cambias una foto, se envía de inmediato al administrador.</div>') + '</div>';
  }
  h += '<span class="lbl">Documentos (los ' + DOCS_C.length + ' son obligatorios)</span>';
  if (reg && S.docsFor !== S.user.uid) return h + '<div class="spinner" role="status" aria-label="Cargando documentos"></div></div></div>';
  h += '<div class="card" style="gap:0;padding:4px 14px">';
  DOCS_C.forEach(d => {
    const x = S.docs[d[0]];
    const pill = !x ? '<span style="align-self:flex-start" class="pill p-warn">Falta</span>' : x.estado === 'local' ? '<span style="align-self:flex-start" class="pill p-info">Lista para enviar</span>' : '<span style="align-self:flex-start" class="pill p-ok">Enviada</span>';
    const thumb = x ? '<img src="' + x.img + '" alt="' + d[1] + '" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid var(--line)">' : '<span style="width:52px;height:52px;border-radius:8px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--muted)">' + I.doc + '</span>';
    const btn = locked ? '' : '<label class="upl">' + (x ? 'Cambiar' : 'Subir') + '<input class="vh" type="file" accept="image/*" data-docup="' + d[0] + '"' + (d[0] === 'foto' ? ' capture="user"' : '') + ' aria-label="' + (x ? 'Cambiar ' : 'Subir ') + d[1] + '"></label>';
    h += '<div class="docrow">' + thumb + '<div class="col grow"><div class="strong" style="font-size:14px">' + d[1] + '</div><div class="muted small">' + d[2] + '</div>' + pill + '</div>' + btn + '</div>';
  });
  h += '</div>';
  if (S.docMsg) h += '<div class="banner info" role="status">' + I.info + '<div class="grow">' + esc(S.docMsg) + '</div></div>';
  if (!reg) h += '<button class="btn btn-navy" data-act="saveConductor"' + busyAttr() + '>Enviar registro</button>';
  return h + '</div></div>';
}
// Reduce la foto en el celular (JPEG, máx. 1.280 px) para que quepa en Firestore sin usar Storage
function compressImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let max = 1280, q = 0.8, out = '';
      for (let i = 0; i < 10; i++) {
        const sc = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
        const cx = cv.getContext('2d'); cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        out = cv.toDataURL('image/jpeg', q);
        if (out.length < 900000) break;
        if (q > 0.55) q -= 0.1; else max = Math.round(max * 0.8);
      }
      URL.revokeObjectURL(url);
      out.length < 900000 ? res(out) : rej(new Error('La foto es demasiado pesada. Intenta con otra.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen. Intenta con otra foto.')); };
    img.src = url;
  });
}
async function loadMyDocs() {
  try {
    const qs = await getDocs(collection(db, 'conductores', S.user.uid, 'documentos'));
    const d = {}; qs.docs.forEach(x => { d[x.id] = { img: x.data().img, estado: 'subido' }; });
    Object.keys(S.docs).forEach(k => { if (S.docs[k].estado === 'local') d[k] = S.docs[k]; });
    S.docs = d; S.docsFor = S.user.uid; if (S.screen === 'registroC') render();
  } catch (e) { fail(e); }
}
/* ---------- pantallas: conductor ---------- */
function vSolicitudes() {
  const st = S.stats;
  let h = '<div class="screen"><div class="top"><div class="row between"><div class="row"><button class="iconbtn" data-act="go" data-v="menu" aria-label="Abrir menú">' + I.menu + '</button><div class="col"><div class="sub">Hola, ' + esc(S.perfil.nombre.split(' ')[0]) + '</div><h1 class="h1" style="white-space:nowrap">Solicitudes</h1></div></div>' +
    '<button class="toggle ' + (S.online ? 'on' : 'off') + '" data-act="online" aria-pressed="' + S.online + '">' + (S.online ? 'En línea' : 'Desconectado') + '<span class="knob"></span></button></div>' +
    '<div class="grid3"><div class="stat"><span class="k">Viajes hoy</span><span class="v">' + (st ? st.viajes : '…') + '</span></div><div class="stat"><span class="k">Ganado hoy</span><span class="v" style="color:#C9A227">' + (st ? money(st.ganado) : '…') + '</span></div><div class="stat"><span class="k">Calificación</span><span class="v">' + (S.ratings[S.user.uid] ? '★ ' + fmtRating(S.ratings[S.user.uid].avg) : '★ …') + '</span></div></div></div><div class="pad">' + errHTML() + bannerHTML(S.banner);
  const blc = blockOf(S.user.uid, 'conductor'), rtc = rateOf(S.user.uid, 'conductor');
  if (blc) return h + blockCard('conductor', blc) + '</div></div>';
  if (rtc && rtc.pct != null && rtc.pct > 10) h += '<div class="banner warn">' + I.info + '<div class="grow">Tu tasa de cancelación es de <b>' + rtc.pct + ' %</b>. Si supera el 20 %, tu cuenta pasa a revisión del administrador.</div></div>';
  if (!S.online) h += '<div class="card"><div class="strong">Estás desconectado.</div><div class="muted">Conéctate para recibir solicitudes de pasajeros. La app debe permanecer abierta.</div><button class="btn btn-gold" data-act="online">Conectarme</button></div>';
  else if (!S.requests.length) h += '<div class="card"><div class="spinner" aria-hidden="true"></div><div class="strong center">Buscando pasajeros…</div><div class="muted center">Las solicitudes aparecen aquí con un sonido. Puedes aceptar el precio o contraofertar.</div></div>';
  if (S.online) S.requests.forEach(r => {
    const o = S.cOtro[r.id] || {}, pr = S.ratings['p_' + r.pasajeroId], km = distKm(S.pos, r.origen);
    h += '<div class="card"><div class="row between" style="align-items:flex-start"><div class="col"><div class="strong">' + esc(r.pasajeroNombre) + ' <span class="muted" style="font-weight:500">' + (pr ? '★ ' + fmtRating(pr.avg) : '') + '</span></div>' + ratePill(r.pasajeroId, 'pasajero') + '<div class="muted small">' + (km != null ? 'A ' + fmtDist(km) + ' de ti' : 'Distancia no disponible') + '</div></div><div class="col" style="align-items:flex-end;gap:4px"><div class="price">' + money(r.oferta) + '</div><span class="pill ' + (r.pago === 'transferencia' ? 'p-info' : 'p-ok') + '">' + pagoTxt(r) + '</span></div></div>' +
      '<div class="col" style="gap:6px"><div class="row"><span class="dot"></span>' + esc(r.origen.texto) + '</div><div class="row"><span class="sq"></span>' + esc(r.destino.texto) + '</div>' + (r.nota ? '<div class="muted small">Nota: ' + esc(r.nota) + '</div>' : '') + '</div>' +
      (pickupOf(r) ? '<button class="btn btn-ghost btn-sm" style="width:100%" data-act="reqMap" data-v="' + r.id + '" aria-expanded="' + (S.reqMap === r.id) + '">' + (S.reqMap === r.id ? 'Ocultar mapa' : 'Ver ubicación del pasajero') + '</button>' : '<div class="muted small">El pasajero no compartió su GPS; usa la referencia.</div>') +
      (S.reqMap === r.id ? '<div style="border-radius:12px;overflow:hidden;border:1px solid var(--line)"><div id="map" class="lmap" style="height:220px" role="img" aria-label="Mapa con la ubicación del pasajero"></div>' + legendHTML([['person', 'Pasajero'], ['moto', 'Tú']].concat(destOf(r) ? [['dest', 'Destino']] : [])) + '</div>' : '') +
      '<button class="btn btn-gold" data-act="cOffer" data-v="' + r.id + '" data-p="' + r.oferta + '" style="min-height:48px;font-size:15px"' + busyAttr() + '>Aceptar ' + money(r.oferta) + '</button>' +
      '<div class="col" style="gap:6px"><span class="lbl">O contraoferta</span><div class="grid4">' + [500, 1000, 1500].map(d => '<button class="cbtn" data-act="cOffer" data-v="' + r.id + '" data-p="' + (r.oferta + d) + '"' + busyAttr() + '>' + money(r.oferta + d) + '</button>').join('') +
      '<button class="cbtn other" data-act="cOtroToggle" data-v="' + r.id + '" aria-expanded="' + !!o.open + '" aria-label="Escribir otro valor">Otro</button></div></div>';
    if (o.open) h += '<div class="field"><label for="co' + r.id + '">Tu contraoferta</label><div class="row"><input type="text" inputmode="numeric" id="co' + r.id + '" data-in="cOtro" data-id="' + r.id + '" placeholder="Ej. 2.800" value="' + esc(o.val || '') + '"><button class="btn btn-navy btn-sm" data-act="cOtroSend" data-v="' + r.id + '" style="min-height:48px"' + busyAttr() + '>Enviar</button></div>' + (o.err ? '<div class="err" role="alert">' + esc(o.err) + '</div>' : '') + '</div>';
    h += '<button class="link" data-act="cIgnore" data-v="' + r.id + '" style="align-self:center;font-size:13px">Ignorar solicitud</button></div>';
  });
  return h + '</div></div>';
}
function vEspera() {
  const e = S.espera || {};
  let h = '<div class="screen"><div class="top"><h1 class="h1">' + (e.perdida ? 'Solicitud no disponible' : 'Oferta enviada') + '</h1>';
  if (!e.perdida) h += '<div class="sub">Esperando que ' + esc(e.nombre) + ' acepte tu oferta de <span style="color:#C9A227;font-weight:800">' + money(e.precio) + '</span> · ' + pagoTxt(e) + '</div>';
  h += '</div><div class="pad">' + errHTML();
  if (e.perdida) return h + '<div class="card"><div class="strong">El pasajero eligió otra oferta o canceló la solicitud.</div><button class="btn btn-gold" data-act="backToRequests">Ver más solicitudes</button></div></div></div>';
  return h + '<div class="card"><div class="spinner" aria-hidden="true"></div><div class="row"><span class="dot"></span>' + esc(e.origen) + '</div><div class="row"><span class="sq"></span>' + esc(e.destino) + '</div></div><button class="btn btn-ghost" data-act="cWithdraw"' + busyAttr() + '>Retirar oferta</button></div></div>';
}
function vCViaje() {
  const v = S.viaje || {}, st = v.estado, o = v.origen || {}, live = S.paxPos || pickupOf(v), dst = destOf(v), target = REC(st) ? live : dst;
  const q = target ? target.lat + ',' + target.lng : encodeURIComponent(REC(st) ? o.texto : v.destino.texto);
  const waze = target ? 'https://waze.com/ul?ll=' + q + '&navigate=yes' : 'https://waze.com/ul?q=' + q + '&navigate=yes';
  const gm = 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  let h = '<div class="screen"><div class="top" style="gap:10px"><div class="row between"><div class="col"><div class="sub">' + (st === 'en_punto' ? 'Llegaste al punto de' : st === 'asignado' ? 'Recoge a' : 'Lleva a') + '</div><div class="h1" style="color:#C9A227">' + esc(REC(st) ? v.pasajeroNombre : v.destino.texto) + '</div></div><button class="sos" data-act="sos" aria-label="Botón de pánico">SOS</button></div></div>';
  h += '<div id="map" class="lmap" role="img" aria-label="Mapa del viaje"></div>' + legendHTML(REC(st) ? [['moto', 'Tú'], ['person', 'Pasajero'], ['otro', 'Otros conductores']] : [['moto', 'Tú']].concat(dst ? [['dest', 'Destino']] : [])) + '<div class="sheet"><div class="handle"></div>' + sosBlock() + errHTML() + bannerHTML(S.banner);
  if (st === 'en_punto') { const t = (Date.now() - tsMs(v.enPuntoEn)) / 1000; h += '<div class="card" style="align-items:center;gap:6px"><div class="muted small strong">El pasajero tiene para salir</div><div class="amount" style="line-height:1.25" data-timer="espera">' + fmtClock(ESPERA_S - 10 - t) + '</div><div class="bar" style="width:100%"><div data-timerbar="espera" style="width:' + Math.min(100, t / 3) + '%;background:#C9A227"></div></div></div>'; }
  if (st === 'asignado') h += live ? '<div class="row between"><span class="muted">Ruta hasta el pasajero</span><span class="strong" data-eta>' + esc(S.pos ? etaText() : 'Ubicándote…') + '</span></div>' : '<div class="banner warn">' + I.info + '<div class="grow">El pasajero no compartió su GPS. Guíate por la referencia y llámalo.</div></div>';
  if (st === 'en_curso') h += dst ? '<div class="row between"><span class="muted">Ruta hasta el destino</span><span class="strong" data-eta>' + esc(S.pos ? etaText() : 'Ubicándote…') + '</span></div>' : '<div class="banner warn">' + I.info + '<div class="grow">El destino no está marcado en el mapa. Usa Waze o Google Maps con la dirección.</div></div>';
  h += '<div class="row"><div class="avatar">' + esc(initials(v.pasajeroNombre)) + '</div><div class="col grow"><div class="strong">' + esc(v.pasajeroNombre) + '</div><div class="muted small">' + (S.ratings['p_' + v.pasajeroId] ? '★ ' + fmtRating(S.ratings['p_' + v.pasajeroId].avg) + ' como pasajero' : 'Pasajero') + '</div></div><div class="col" style="align-items:flex-end"><span class="muted small">' + cobroTxt(v) + '</span><span class="price">' + money(v.precioFinal || 0) + '</span></div></div>';
  h += '<div class="offerbox" style="gap:8px"><div class="row"><span class="dot"></span>' + esc(o.texto) + '</div><div class="row"><span class="sq"></span>' + esc(v.destino.texto) + '</div>' + (v.nota ? '<div class="muted small">Nota: ' + esc(v.nota) + '</div>' : '') + '</div>';
  h += '<div class="row"><a class="btn btn-ghost" style="flex:1" target="_blank" rel="noopener" href="' + waze + '">Navegar con Waze</a><a class="btn btn-ghost" style="flex:1" target="_blank" rel="noopener" href="' + gm + '">Google Maps</a></div>';
  if (S.pPhone) h += '<a class="btn btn-ghost" href="tel:' + esc(S.pPhone) + '">' + I.phone + 'Llamar al pasajero</a>';
  if (st === 'asignado') {
    const d = distKm(S.pos, live), cerca = !live || (d != null && d <= 0.1);
    h += '<button class="btn btn-gold" data-act="llegue"' + (S.busy || !cerca ? ' disabled' : '') + '>Llegué al punto</button>' +
      (cerca ? '' : '<div class="muted small center">Se habilita cuando estés a menos de 100 m del punto de recogida' + (d != null ? ' (estás a ' + fmtDist(d) + ')' : '') + '.</div>') +
      '<button class="btn btn-ghost" data-act="cStart"' + busyAttr() + '>Recogí al pasajero</button>';
  } else if (st === 'en_punto') {
    const listo = (Date.now() - tsMs(v.enPuntoEn)) / 1000 >= ESPERA_S;
    h += '<button class="btn btn-gold" data-act="cStart"' + busyAttr() + '>Recogí al pasajero</button>' +
      '<button class="btn btn-ghost" data-act="noShow" data-noshow' + (S.busy || !listo ? ' disabled' : '') + '>El pasajero no se presentó</button>' +
      '<div class="muted small center">' + (listo ? 'Cancelar por no presentarse no afecta tu tasa de cancelación.' : 'Se habilita al terminar los 5 minutos de espera. No afecta tu tasa de cancelación.') + '</div>';
  } else h += '<button class="btn btn-gold" data-act="cFinish"' + busyAttr() + '>Finalizar viaje</button>';
  if (REC(st)) h += '<button class="link danger" data-act="openCancel" style="align-self:center"' + busyAttr() + '>Cancelar viaje</button>';
  return h + '</div></div>';
}
function vCCalificar() {
  const v = S.viaje || {};
  let h = '<div class="screen"><div class="top">' + brandRow() + '<div class="row between" style="align-items:flex-end"><div class="col"><div class="sub">Cobra al pasajero</div><div class="amount" style="color:#C9A227">' + money(v.precioFinal || 0) + '</div></div><div class="sub" style="text-align:right">' + pagoTxt(v) + '</div></div></div><div class="pad">' + errHTML();
  h += '<div class="card" style="align-items:center;text-align:center"><div class="h2">Califica a ' + esc(v.pasajeroNombre) + '</div><div class="muted">Solo los conductores ven la calificación de los pasajeros.</div>' + starsHTML(S.rating, 'rate') + '<div class="strong">' + LABELS[S.rating] + '</div></div>';
  h += '<div class="col" style="gap:8px"><span class="lbl">¿Qué destacas del pasajero?</span>' + chipsHTML(ASP_P, S.chips, 'chip') + '</div>';
  return h + '<button class="btn btn-gold" data-act="cSendRating"' + busyAttr() + '>Enviar y seguir conectado</button><button class="link" data-act="cSkipRating" style="align-self:center">Ahora no</button></div></div>';
}
function vMiCalif() {
  let h = '<div class="screen">' + subTop('Mi calificación') + '<div class="pad">' + errHTML();
  const c = S.cal; if (!c) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
  if (!c.n) return h + '<div class="card"><div class="strong">Aún no tienes calificaciones.</div><div class="muted">Mientras tengas menos de 5, los pasajeros verán la etiqueta "Nuevo" junto a tu nombre.</div></div></div></div>';
  h += '<div class="row" style="align-items:flex-end;gap:12px"><div class="amount" style="font-size:44px;line-height:1.2">' + fmtRating(c.raw) + '</div><div class="muted" style="padding-bottom:6px">★ sobre tus últimas ' + c.n + ' calificaciones</div></div>';
  if (c.n >= 5 && c.raw < 4.5) h += '<div class="banner warn">' + I.info + '<div class="grow">Tu promedio está por debajo de 4,5. Si baja de 4,2, tu cuenta pasa a revisión.</div></div>';
  h += '<div class="card" style="gap:8px">' + [5, 4, 3, 2, 1].map(s => { const n = c.dist[s] || 0; return '<div class="row small"><span class="strong" style="width:26px">' + s + '★</span><div class="bar grow"><div style="width:' + Math.round(n / c.n * 100) + '%"></div></div><span class="muted" style="width:26px;text-align:right">' + n + '</span></div>'; }).join('') + '</div>';
  const coms = c.items.filter(x => x.comentario);
  if (coms.length) { h += '<span class="lbl">Comentarios recientes</span>'; coms.slice(0, 10).forEach(x => { h += '<div class="card" style="gap:8px"><div class="row between small"><span class="strong">★ ' + x.estrellas + ' · Pasajero</span><span class="muted">' + new Date(tsMs(x.creado)).toLocaleDateString('es-CO') + '</span></div><div>' + esc(x.comentario) + '</div></div>'; }); }
  return h + '</div></div>';
}
/* ---------- panel de administración ---------- */
function vAdmin() {
  const t = S.admTab, A = S.adm;
  let h = '<div class="screen">' + subTop('Administración') + '<div class="pad">' + errHTML() + bannerHTML(S.banner) + '<div class="tabs" role="group" aria-label="Secciones">' +
    [['usuarios', 'Usuarios'], ['conductores', 'Conductores'], ['alertas', 'Alertas' + (A.alertas && A.alertas.length ? ' (' + A.alertas.length + ')' : '')], ['viajes', 'Viajes']].map(x => '<button data-act="admTab" data-v="' + x[0] + '" aria-current="' + (t === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  if (t === 'conductores') {
    const L = A.conductores; if (!L) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
    const lab = { pendiente: ['p-warn', 'Pendiente'], aprobado: ['p-ok', 'Aprobado'], rechazado: ['p-danger', 'Rechazado'], suspendido: ['p-danger', 'Suspendido'] };
    if (!L.length) h += '<div class="card"><div class="muted">Aún no hay conductores registrados.</div></div>';
    L.slice().sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)).forEach(c => {
      const l = lab[c.estado] || ['p-info', c.estado];
      const open = S.admOpen === c.id, dl = S.admDocs[c.id], nDocs = dl && dl !== 'cargando' ? Object.keys(dl).length : null;
      h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(c.nombre) + '</div><div class="muted small">' + esc(c.moto) + ' ' + esc(c.color) + ' · Placa ' + esc(c.placa) + '</div><div class="small strong">' + (c.registro ? 'Registro de tránsito N° ' + esc(c.registro) : 'Sin número de registro de tránsito') + '</div></div><span class="pill ' + l[0] + '">' + l[1] + '</span></div>' +
        '<button class="btn btn-ghost btn-sm" style="width:100%" data-act="admDocs" data-v="' + c.id + '" aria-expanded="' + open + '">' + (open ? 'Ocultar documentos' : 'Ver documentos') + '</button>';
      if (open) {
        if (!dl || dl === 'cargando') h += '<div class="spinner" role="status" aria-label="Cargando documentos"></div>';
        else h += '<div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + DOCS_C.map(d => {
          const x = dl[d[0]], big = S.admBig === c.id + ':' + d[0];
          return '<div class="col" style="gap:4px' + (big ? ';grid-column:1 / -1' : '') + '"><span class="small strong">' + d[1] + '</span>' + (x ? '<button data-act="admBig" data-v="' + c.id + ':' + d[0] + '" aria-label="' + (big ? 'Reducir ' : 'Ampliar ') + d[1] + '" style="padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--field)"><img src="' + x + '" alt="' + d[1] + ' de ' + esc(c.nombre) + '" style="width:100%;' + (big ? 'height:auto' : 'height:110px;object-fit:cover') + ';display:block"></button>' : '<div class="pill p-danger" style="align-self:flex-start">Falta</div>') + '</div>';
        }).join('') + '</div>';
      }
      const canApprove = nDocs === DOCS_C.length;
      const incompleto = nDocs !== null && !canApprove;
      if (c.estado !== 'aprobado' && nDocs === null) h += '<div class="muted small">Revisa los documentos antes de aprobar.</div>';
      if (c.estado !== 'aprobado' && incompleto) h += '<div class="muted small">Faltan ' + (DOCS_C.length - nDocs) + ' documento(s).</div>' +
        '<label class="check"><input type="checkbox" data-in="force_' + c.id + '"' + (S.f['force_' + c.id] ? ' checked' : '') + '><span>Confirmo que verifiqué al conductor y lo apruebo sin documentos completos.</span></label>';
      if (c.aprobadoSinDocs) h += '<span class="pill p-warn" style="align-self:flex-start">Aprobado sin documentos completos</span>';
      h += '<div class="row">' +
        (c.estado !== 'aprobado' ? (incompleto ? '<button class="btn btn-gold btn-sm" style="flex:1" data-act="admForce" data-v="' + c.id + '"' + (S.busy || !S.f['force_' + c.id] ? ' disabled' : '') + '>Aprobar sin documentos completos</button>'
          : '<button class="btn btn-gold btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="aprobado"' + (S.busy || !canApprove ? ' disabled' : '') + '>Aprobar</button>') : '') +
        (c.estado === 'pendiente' ? '<button class="btn btn-ghost btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="rechazado"' + busyAttr() + '>Rechazar</button>' : '') +
        (c.estado === 'aprobado' ? '<button class="btn btn-ghost btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="suspendido"' + busyAttr() + '>Suspender</button>' : '') + '</div></div>';
    });
  }
  if (t === 'usuarios') {
    const K = S.admKpi, U = S.admUsers;
    const kpi = (k, v) => '<div class="card" style="gap:2px;padding:12px"><span class="muted small">' + k + '</span><span class="price" style="font-size:24px">' + (v == null ? '…' : v) + '</span></div>';
    const enLinea = Object.keys(S.others || {}).filter(u => livePos(u)).length;
    h += '<div class="grid3" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + kpi('Personas registradas', K && K.total) + kpi('Conductores en línea ahora', enLinea) + kpi('Conductores aprobados', K && K.aprob) + kpi('Conductores pendientes', K && K.pend) + '</div>';
    if (!U) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
    const cmap = {}; (A.conductores || []).forEach(c => { cmap[c.id] = c; });
    h += '<div class="muted small">Calidad de cada persona: calificación recibida como pasajero y como conductor, y tasa de cancelación histórica.</div>';
    U.forEach(u => {
      const q = S.admQ[u.id], c = cmap[u.id];
      const st = c ? (c.estado === 'aprobado' ? '<span class="pill p-ok">Conductor' + (c.aprobadoSinDocs ? ' · sin documentos' : '') + '</span>' : '<span class="pill p-warn">Conductor ' + esc(c.estado) + '</span>') : '<span class="pill p-info">Pasajero</span>';
      let ql = '<span class="muted small">Calculando calidad…</span>';
      if (q) {
        const pc = q.tot ? Math.round(q.pen * 100 / q.tot) : null;
        ql = '<div class="col" style="gap:2px"><span class="small">' + (q.pN ? '★ ' + fmtRating(q.pAvg) + ' como pasajero (' + q.pN + ')' : 'Sin calificaciones como pasajero') + '</span>' +
          (c ? '<span class="small">' + (q.cN ? '★ ' + fmtRating(q.cAvg) + ' como conductor (' + q.cN + ')' : 'Sin calificaciones como conductor') + '</span>' : '') +
          '<span class="small">' + (pc == null ? 'Sin viajes aceptados' : 'Cancela ' + pc + ' % (' + q.tot + ' viajes)') + '</span></div>';
        const alerta = (pc != null && q.tot >= 3 && pc > (c ? 20 : 30)) || (q.pN >= 5 && q.pAvg < 4.2) || (q.cN >= 5 && q.cAvg < 4.2);
        if (alerta) ql += '<span class="pill p-danger" style="align-self:flex-start">Revisar</span>';
      }
      h += '<div class="card" style="gap:8px"><div class="row between" style="align-items:flex-start"><div class="col"><div class="strong">' + esc(u.nombre) + '</div><div class="muted small">' + esc(u.telefono || '') + '</div></div>' + st + '</div>' + ql;
      if (!c) {
        if (S.admMake === u.id) {
          h += '<div class="col" style="gap:8px;border-top:1px solid var(--line);padding-top:10px"><div class="strong small">Habilitar como conductor</div>' +
            '<div class="field"><label for="am">Marca y modelo del mototour</label><input type="text" id="am" data-in="amMoto" value="' + fv('amMoto') + '"></div>' +
            '<div class="field"><label for="ac">Color</label><input type="text" id="ac" data-in="amColor" value="' + fv('amColor') + '"></div>' +
            '<div class="field"><label for="ap">Placa</label><input type="text" id="ap" data-in="amPlaca" autocapitalize="characters" value="' + fv('amPlaca') + '"></div>' +
            '<div class="field"><label for="ar">Número de registro de tránsito (opcional)</label><input type="text" id="ar" data-in="amReg" autocapitalize="characters" value="' + fv('amReg') + '"></div>' +
            '<label class="check"><input type="checkbox" data-in="amOk"' + (S.f.amOk ? ' checked' : '') + '><span>Confirmo que verifiqué a esta persona y la habilito como conductor sin documentos completos.</span></label>' +
            '<div class="row"><button class="btn btn-gold btn-sm" style="flex:1" data-act="admMakeSave" data-v="' + u.id + '"' + (S.busy || !S.f.amOk ? ' disabled' : '') + '>Habilitar</button><button class="btn btn-ghost btn-sm" style="flex:1" data-act="admMake" data-v="">Cancelar</button></div></div>';
        } else h += '<button class="btn btn-ghost btn-sm" style="width:100%" data-act="admMake" data-v="' + u.id + '">Habilitar como conductor</button>';
      }
      h += '</div>';
    });
    if (U.length >= S.admLimit) h += '<button class="btn btn-ghost" data-act="admMore">Ver más personas</button>';
  }
  if (t === 'alertas') {
    const L = A.alertas; if (!L) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
    if (!L.length) h += '<div class="card"><div class="strong">Sin alertas activas.</div><div class="muted">Cuando alguien active el botón de pánico, aparece aquí con su ubicación.</div></div>';
    L.forEach(a => { h += '<div class="card" style="border:2px solid #B42318"><div class="row between"><div class="col"><div class="strong">' + esc(a.nombre) + ' (' + esc(a.rol) + ')</div><div class="muted small">' + new Date(tsMs(a.creado)).toLocaleString('es-CO') + '</div></div><span class="pill p-danger">Activa</span></div><div class="row">' + (a.lat != null ? '<a class="btn btn-ghost btn-sm" style="flex:1" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + a.lat + ',' + a.lng + '">Ver ubicación</a>' : '<span class="muted small" style="flex:1">Sin ubicación GPS</span>') + '<button class="btn btn-gold btn-sm" style="flex:1" data-act="admAlert" data-v="' + a.id + '"' + busyAttr() + '>Marcar atendida</button></div></div>'; });
  }
  if (t === 'viajes') {
    const L = A.viajes; if (!L) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
    if (!L.length) h += '<div class="card"><div class="muted">Aún no hay viajes.</div></div>';
    const fin = L.filter(v => v.estado === 'finalizado');
    h += '<div class="card"><div class="row between"><span class="muted">Viajes finalizados (últimos 100)</span><span class="strong">' + fin.length + '</span></div><div class="row between"><span class="muted">Valor movido</span><span class="strong">' + money(fin.reduce((s, v) => s + (v.precioFinal || 0), 0)) + '</span></div></div>';
    L.forEach(v => { h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(v.pasajeroNombre) + ' → ' + esc(v.destino.texto) + '</div><div class="muted small">' + (v.conductor ? 'Conductor: ' + esc(v.conductor.nombre) + ' · ' : '') + new Date(tsMs(v.creado)).toLocaleString('es-CO') + '</div></div><div class="col" style="align-items:flex-end"><span class="strong">' + money(v.precioFinal || v.oferta) + '</span><span class="muted small">' + pagoTxt(v) + '</span><span class="pill p-info">' + esc(v.estado) + '</span></div></div>' + (v.estado === 'cancelado' && v.motivo ? '<div class="muted small">Motivo: ' + esc({ ya_no: 'Ya no lo necesitaba', no_llega: 'El conductor no llegaba', inseguro: 'Se sintió inseguro', otro: 'Otro', inconveniente: 'Inconveniente del conductor', no_se_presento: 'El pasajero no se presentó' }[v.motivo] || v.motivo) + (v.motivoTexto ? ': ' + esc(v.motivoTexto) : '') + (v.penalizaA ? ' · penaliza al ' + esc(v.penalizaA) : ' · sin penalización') + '</div>' : '') + '</div>'; });
  }
  return h + '</div></div>';
}
function vSinConexion() { return '<div class="screen"><div class="pad" style="flex:1;justify-content:center"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:88px;height:88px;align-self:center"><div class="card"><div class="h2">No pudimos conectar con el servidor</div><div class="muted">' + esc(S.connErr || '') + '</div><button class="btn btn-gold" data-act="retryLogin">Reintentar</button><button class="link" data-act="logout" style="align-self:center">Cerrar sesión</button></div></div></div>'; }
const V = {
  sinConexion: vSinConexion,
  cancelar: vCancelar,
  cargando: vCargando, login: vLogin, onboarding: vOnboarding, home: vHome, buscando: vBuscando, viaje: vViaje, calificar: vCalificar,
  menu: vMenu, historial: vHistorial, contactos: vContactos, registroC: vRegistroC, solicitudes: vSolicitudes, espera: vEspera, cviaje: vCViaje,
  ccalificar: vCCalificar, micalif: vMiCalif, admin: vAdmin, transfer: vTransfer,
  suscripcion: () => vTexto('Mi suscripción', '<div class="row between"><div class="h2">Periodo de prueba</div><span class="pill p-ok">Activa</span></div><div class="muted">Durante la prueba no se cobra la cuota. La cuota semanal y las formas de pago (Nequi, Daviplata, PSE o efectivo en oficina) se definen al terminar la prueba.</div>'),
  ayuda: () => vTexto('Ayuda y soporte', '<div class="h2">¿Necesitas ayuda?</div><div class="muted">Comunícate con Asesorías y Consultorías JNF S.A.S. al [número de soporte].</div>'),
  terminos: () => vTexto('Términos y tratamiento de datos', '<div class="muted">Asesorías y Consultorías JNF S.A.S. trata tus datos personales (nombre, celular y ubicación durante los viajes) conforme a la Ley 1581 de 2012, únicamente para prestar el servicio de la app.</div><div class="muted">[Texto completo de la política de tratamiento de datos]</div>')
};

/* ---------- mapa (Leaflet + OpenStreetMap), íconos y rutas (OSRM) ---------- */
const GOLD = '#C9A227', GREEN = '#1F6F43', GREY = '#8A919E';
// Azul que se adapta al tema: marino en modo claro, azul claro en modo oscuro (variable --route del tema)
const navyCol = () => (getComputedStyle(document.documentElement).getPropertyValue('--route') || '').trim() || '#1A2580';
const ICON = {
  carro: '<rect x="9" y="5" width="30" height="5" rx="2.5" fill="currentColor"/><path d="M12 40 V19 C12 13 16.5 9 22 9 H26 C31.5 9 36 13 36 19 V40 Z" fill="currentColor"/><path d="M16 14 H32 V23 H16 Z" fill="#fff"/><circle cx="24" cy="30" r="3" fill="#fff"/><rect x="21" y="38" width="6" height="8" rx="3" fill="currentColor"/><rect x="10" y="36" width="4" height="7" rx="2" fill="currentColor"/><rect x="34" y="36" width="4" height="7" rx="2" fill="currentColor"/>',
  person: '<ellipse cx="24" cy="44" rx="11" ry="3.2" fill="currentColor" opacity=".35"/><circle cx="24" cy="7" r="4.4" fill="currentColor"/><path d="M17.8 13.5 H30.2 C31.2 13.5 32 14.3 32 15.3 V26.5 H28.4 V41 H25.2 V30 H22.8 V41 H19.6 V26.5 H16 V15.3 C16 14.3 16.8 13.5 17.8 13.5 Z" fill="currentColor"/>',
  flag: '<path d="M12 44 V6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 7 H37 L31 15 L37 23 H12 Z" fill="currentColor"/>'
};
// ax/ay: punto del ícono que marca la ubicación exacta (base de las ruedas, pies, pie del asta)
const KIND = {
  moto: () => ({ d: ICON.carro, col: GOLD, w: 46, op: 1, ax: 0.5, ay: 0.93 }),
  otro: () => ({ d: ICON.carro, col: GREY, w: 32, op: 0.55, ax: 0.5, ay: 0.93 }),
  person: () => ({ d: ICON.person, col: navyCol(), w: 42, op: 1, ax: 0.5, ay: 0.9 }),
  dest: () => ({ d: ICON.flag, col: GREEN, w: 40, op: 1, ax: 16 / 60, ay: 48 / 56 })
};
function iconSVG(k, w) {
  const s = KIND[k](), W = w || s.w, H = Math.round(W * 56 / 60);
  return '<svg class="jm-ico" data-kind="' + k + '" width="' + W + '" height="' + H + '" viewBox="-4 -4 60 56" aria-hidden="true" style="color:' + s.col + ';opacity:' + s.op + ';overflow:visible;display:block;flex-shrink:0"><g class="halo">' + s.d + '</g>' + s.d + '</svg>';
}
const badge = (k, px) => iconSVG(k, px);
const pickupOf = v => v && v.origen && v.origen.lat != null ? { lat: v.origen.lat, lng: v.origen.lng } : null;
const destOf = v => v && v.destino && v.destino.lat != null ? { lat: v.destino.lat, lng: v.destino.lng } : null;
// Marcadores de cada pantalla: [clave, posición, tipo, etiqueta]
function mapPoints() {
  const v = S.viaje, st = v && v.estado, m = [];
  if (S.screen === 'home') { if (S.pos) m.push(['me', S.pos, 'person', 'Tú']); if (S.destPin) m.push(['dest', S.destPin, 'dest', 'Destino']); }
  if (S.screen === 'buscando') { const c = pickupOf(v) || S.pos; if (c) m.push(['me', c, 'person', 'Tú']); S.ofertas.forEach(o => { const p = livePos(o.id) || (o.lat != null ? { lat: o.lat, lng: o.lng } : null); if (p) m.push(['of_' + o.id, p, 'oferta', money(o.precio)]); }); }
  if (S.screen === 'solicitudes' && S.reqMap) { const r = S.requests.find(x => x.id === S.reqMap); if (r) { const p = pickupOf(r), d = destOf(r); if (p) m.push(['pax', p, 'person', 'Pasajero']); if (d) m.push(['dest', d, 'dest', 'Destino']); if (S.pos) m.push(['me', S.pos, 'moto', 'Tú']); } }
  if (S.screen === 'viaje') {
    const me = S.pos || pickupOf(v); if (me && REC(st)) m.push(['me', me, 'person', 'Tú']);
    if (S.drvPos) m.push(['drv', S.drvPos, 'moto', 'Tu conductor']);
    if (st === 'en_curso' && destOf(v)) m.push(['dest', destOf(v), 'dest', 'Destino']);
  }
  if (S.screen === 'cviaje') {
    if (S.pos) m.push(['me', S.pos, 'moto', 'Tú']);
    if (REC(st)) { const p = S.paxPos || pickupOf(v); if (p) m.push(['pax', p, 'person', 'Pasajero']); }
    if (st === 'en_curso' && destOf(v)) m.push(['dest', destOf(v), 'dest', 'Destino']);
  }
  return m;
}
function mountMap() {
  const el = document.getElementById('map'); if (!el || !window.L) return;
  const pts = mapPoints(); mk = {};
  if (!pts.length) { el.innerHTML = '<div class="muted small" style="padding:16px">Esperando la ubicación GPS…</div>'; return; }
  const L = window.L;
  map = L.map(el, { zoomControl: true, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false }).setView([pts[0][1].lat, pts[0][1].lng], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  pts.forEach(p => setMarker(p[0], p[1], p[2], p[3]));
  const zc = S.screen === 'buscando' ? zoneCenter() : null;
  if (zc) mk.zone = L.circle([zc.lat, zc.lng], { radius: RADIO_KM * 1000, color: navyCol(), weight: 2, opacity: 0.45, dashArray: '7 7', fillColor: navyCol(), fillOpacity: 0.07, interactive: false }).addTo(map);
  syncOthers(); drawRoute(); fitMap();
  if (S.screen === 'home') map.on('click', e => { if (!S.pickDest) return; S.destPin = { lat: e.latlng.lat, lng: e.latlng.lng }; S.pickDest = false; S.route = null; render(); });
  if (S.screen === 'home' && S.pickDest) el.style.cursor = 'crosshair';
}
function setMarker(key, pos, kind, label) {
  if (!map || !pos || !window.L || !document.getElementById('map')) return;
  if (mk[key]) { mk[key].setLatLng([pos.lat, pos.lng]); return; }
  if (kind === 'oferta') {
    const s = KIND.moto(), W = s.w, H = Math.round(W * 56 / 60), TW = 96;
    const icon = window.L.divIcon({ className: 'jm-icon', html: '<div class="jm-of"><span class="jm-tag">' + esc(label) + '</span>' + iconSVG('moto') + '</div>', iconSize: [TW, H + 30], iconAnchor: [TW / 2, Math.round(30 + H * s.ay)] });
    mk[key] = window.L.marker([pos.lat, pos.lng], { icon, keyboard: false, zIndexOffset: 800, title: 'Oferta ' + label, alt: 'Oferta ' + label }).addTo(map);
    return;
  }
  const s = KIND[kind](), W = s.w, H = Math.round(W * 56 / 60);
  const icon = window.L.divIcon({ className: 'jm-icon', html: iconSVG(kind), iconSize: [W, H], iconAnchor: [Math.round(W * s.ax), Math.round(H * s.ay)] });
  mk[key] = window.L.marker([pos.lat, pos.lng], { icon, keyboard: false, zIndexOffset: kind === 'otro' ? 0 : 500, title: label, alt: label }).addTo(map).bindTooltip(label);
}
function removeMarker(key) { if (mk[key] && map) { map.removeLayer(mk[key]); delete mk[key]; } }
// Otros conductores conectados: motos grises y semitransparentes
function syncOthers() {
  if (!map) return;
  const keep = {}, me = S.user && S.user.uid, assigned = S.viaje && S.viaje.conductorId, zc = zoneCenter();
  const withOffer = {}; if (S.screen === 'buscando') S.ofertas.forEach(o => { withOffer[o.id] = money(o.precio); });
  const show = S.screen === 'home' || S.screen === 'buscando' || S.screen === 'viaje' || S.screen === 'cviaje' || (S.screen === 'solicitudes' && S.reqMap);
  if (show) Object.keys(S.others || {}).forEach(uid => {
    const p = livePos(uid);
    if (!p || uid === me || uid === assigned) return;
    if (withOffer[uid]) { setMarker('of_' + uid, p, 'oferta', withOffer[uid]); return; }
    if (zc && distKm(zc, p) > RADIO_KM) return;
    keep['o_' + uid] = true; setMarker('o_' + uid, p, 'otro', 'Conductor en tu zona');
  });
  Object.keys(mk).forEach(k => { if (k.indexOf('o_') === 0 && !keep[k]) removeMarker(k); });
  document.querySelectorAll('[data-count]').forEach(el => { el.textContent = zoneCount(); });
  if (S.screen === 'buscando') S.ofertas.forEach(o => { const e = offerEta(o); if (!e) return; document.querySelectorAll('[data-ofmin="' + o.id + '"]').forEach(el => { el.textContent = e.min; }); document.querySelectorAll('[data-ofkm="' + o.id + '"]').forEach(el => { el.textContent = fmtDist(e.km); }); });
}
function fitMap() {
  if (!map || !window.L) return;
  if (mk.zone && S.screen === 'buscando') { map.fitBounds(mk.zone.getBounds(), { padding: [8, 8], animate: false }); return; }
  const ll = Object.keys(mk).filter(k => k !== 'route' && k !== 'zone' && k.indexOf('o_') !== 0).map(k => mk[k].getLatLng());
  if (mk.route) ll.push(...mk.route.getLatLngs());
  if (ll.length >= 2) map.fitBounds(window.L.latLngBounds(ll), { padding: [44, 44], maxZoom: 17, animate: false });
}
// Tramo que se dibuja: recogida mientras está asignado; destino durante el viaje; vista previa en el inicio
function routeEnds() {
  const v = S.viaje, st = v && v.estado;
  if (S.screen === 'home') return [S.pos, S.destPin];
  if (S.screen === 'viaje') return REC(st) ? [S.drvPos, S.pos || pickupOf(v)] : st === 'en_curso' ? [S.drvPos || S.pos, destOf(v)] : [null, null];
  if (S.screen === 'cviaje') return REC(st) ? [S.pos, S.paxPos || pickupOf(v)] : st === 'en_curso' ? [S.pos, destOf(v)] : [null, null];
  return [null, null];
}
const routeActive = () => { const e = routeEnds(); return !!(e[0] && e[1]) || (S.screen !== 'home' && S.viaje && REC(S.viaje.estado)); };
function drawRoute() {
  if (!map || !window.L) return;
  if (mk.route) { map.removeLayer(mk.route); delete mk.route; }
  const e = routeEnds();
  if (S.route && e[0] && e[1] && S.route.key === routeKey()) mk.route = window.L.polyline(S.route.coords, { color: S.route.straight ? '#8A93B8' : navyCol(), weight: 5, opacity: 0.85, dashArray: S.route.straight ? '8 8' : null }).addTo(map);
}
const routeKey = () => S.screen + ':' + (S.viaje ? S.viaje.estado : 'previa');
let routeBusy = false;
async function refreshRoute() {
  if (routeBusy) return;
  const [a, b] = routeEnds(); if (!a || !b) return;
  const r = S.route, key = routeKey();
  if (r && r.key === key && distKm(r.from, a) < 0.15 && distKm(r.to, b) < 0.05 && Date.now() - r.at < 60000) return;
  routeBusy = true;
  try {
    const res = await fetch('https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=full&geometries=geojson');
    const j = await res.json(); const rt = j && j.routes && j.routes[0]; if (!rt) throw new Error('sin ruta');
    S.route = { key, coords: rt.geometry.coordinates.map(c => [c[1], c[0]]), dist: rt.distance / 1000, dur: rt.duration / 60, from: a, to: b, at: Date.now() };
  } catch (e) {
    S.route = { key, coords: [[a.lat, a.lng], [b.lat, b.lng]], dist: distKm(a, b), dur: null, straight: true, from: a, to: b, at: Date.now() };
  }
  routeBusy = false; drawRoute(); fitMap(); updateEta();
}
function etaText() {
  const r = S.route; if (r && r.key === routeKey() && r.dur != null) return Math.max(1, Math.round(r.dur)) + ' min · ' + fmtDist(r.dist);
  const e = routeEnds(), km = distKm(e[0], e[1]);
  return km != null ? fmtDist(km) + ' en línea recta' : 'Ubicando…';
}
function updateEta() { document.querySelectorAll('[data-eta]').forEach(el => { el.textContent = etaText(); }); }
function legendHTML(items) {
  const e = routeEnds(), withRoute = !!(e[0] && e[1]);
  return '<div class="row small" style="gap:14px;flex-wrap:wrap;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--line)">' +
    items.map(it => '<span class="row" style="gap:6px">' + badge(it[0], 22) + it[1] + '</span>').join('') +
    (withRoute ? '<span class="row" style="gap:6px"><span style="width:18px;height:4px;border-radius:2px;background:' + navyCol() + ';flex-shrink:0"></span>Ruta</span>' : '') + '</div>';
}
// Ubicaciones en vivo (conductores conectados y el pasajero del viaje)
function listenOthers() {
  addSub(onValue(ref(rtdb, 'ubicaciones'), snap => { S.others = snap.val() || {}; syncOthers(); }, () => { }));
}
// Búsqueda de dirección con Nominatim (OpenStreetMap), solo al tocar el botón
async function geocodeDestino(q) {
  let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co&q=' + encodeURIComponent(q);
  if (S.pos) url += '&viewbox=' + (S.pos.lng - 0.08) + ',' + (S.pos.lat + 0.08) + ',' + (S.pos.lng + 0.08) + ',' + (S.pos.lat - 0.08) + '&bounded=1';
  const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  const j = await res.json();
  return j && j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
}

/* ---------- render y navegación ---------- */
function render() {
  if (map) { try { map.remove(); } catch (e) { } map = null; }
  appEl.innerHTML = V[S.screen]();
  mountMap();
  const ends = routeEnds(); if (ends[0] && ends[1]) refreshRoute();
}
function go(s) { clearSubs(); if (S.banner && S.banner._seen) S.banner = null; S.screen = s; S.err = null; S.busy = false; render(); if (S.banner) S.banner._seen = true; window.scrollTo(0, 0); enter(s); }
function fail(e) { S.busy = false; S.err = errMsg(e); render(); }

/* ---------- geolocalización ---------- */
function getGps() {
  if (!navigator.geolocation) { S.gps = 'error'; render(); return; }
  S.gps = S.pos ? 'ok' : 'pendiente';
  navigator.geolocation.getCurrentPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; S.gps = 'ok'; if (S.screen === 'home') render(); },
    () => { if (!S.pos) { S.gps = 'error'; if (S.screen === 'home') render(); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
function gpsOnce(ms) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    let done = false; const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
    navigator.geolocation.getCurrentPosition(p => { if (done) return; done = true; clearTimeout(t); S.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; S.gps = 'ok'; res(S.pos); },
      () => { if (done) return; done = true; clearTimeout(t); res(null); }, { enableHighAccuracy: true, timeout: ms, maximumAge: 30000 });
  });
}
function pushPos(force) {
  const now = Date.now();
  if (!S.pos || !S.user || !(S.online || S.sharing)) return;
  if (!force && now - lastPush < 10000) return;
  lastPush = now; set(ref(rtdb, 'ubicaciones/' + S.user.uid), { lat: S.pos.lat, lng: S.pos.lng, ts: rtdbTime(), rol: S.online ? 'conductor' : 'pasajero' }).catch(() => { });
}
function startWatch() {
  if (watchId != null || !navigator.geolocation) { pushPos(true); return; }
  watchId = navigator.geolocation.watchPosition(p => {
    S.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    pushPos(false);
    if (S.screen === 'cviaje') { setMarker('me', S.pos, 'moto', 'Tú'); refreshRoute(); updateEta(); }
    if (S.screen === 'viaje' && S.viaje && REC(S.viaje.estado)) { setMarker('me', S.pos, 'person', 'Tú'); refreshRoute(); updateEta(); }
    if (S.screen === 'solicitudes' && S.reqMap) setMarker('me', S.pos, 'moto', 'Tú');
  }, () => { }, { enableHighAccuracy: true, maximumAge: 10000 });
  try { onDisconnect(ref(rtdb, 'ubicaciones/' + S.user.uid)).remove(); } catch (e) { }
  pushPos(true);
}
function stopWatch() {
  if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null; lastPush = 0;
  return S.user ? remove(ref(rtdb, 'ubicaciones/' + S.user.uid)).catch(() => { }) : Promise.resolve();
}
function beep() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.35); } catch (e) { }
}

/* ---------- panel: personas registradas y su calidad (consultas de agregación: 1 lectura cada una) ---------- */
async function loadAdmUsers() {
  try {
    const [t, ap, pe] = await Promise.all([getCountFromServer(collection(db, 'usuarios')), getCountFromServer(query(collection(db, 'conductores'), where('estado', '==', 'aprobado'))), getCountFromServer(query(collection(db, 'conductores'), where('estado', '==', 'pendiente')))]);
    S.admKpi = { total: t.data().count, aprob: ap.data().count, pend: pe.data().count };
  } catch (e) { S.admKpi = { total: '—', aprob: '—', pend: '—' }; }
  if (S.screen === 'admin') render();
  try {
    const qs = await getDocs(query(collection(db, 'usuarios'), limit(S.admLimit)));
    S.admUsers = qs.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es'));
  } catch (e) { S.admUsers = []; S.err = errMsg(e); }
  if (S.screen === 'admin') render();
  for (const u of S.admUsers) {
    if (S.admQ[u.id]) continue;
    try {
      const esC = (S.adm.conductores || []).some(c => c.id === u.id);
      const [p, cc, tot, pen] = await Promise.all([
        getAggregateFromServer(collection(db, 'usuarios', u.id, 'calificaciones'), { n: count(), avg: average('estrellas') }),
        esC ? getAggregateFromServer(collection(db, 'conductores', u.id, 'calificaciones'), { n: count(), avg: average('estrellas') }) : Promise.resolve(null),
        getCountFromServer(collection(db, 'stats', u.id, 'viajes')),
        getCountFromServer(query(collection(db, 'stats', u.id, 'viajes'), where('pen', '==', true)))]);
      S.admQ[u.id] = { pN: p.data().n, pAvg: p.data().avg || 0, cN: cc ? cc.data().n : 0, cAvg: cc ? cc.data().avg || 0 : 0, tot: tot.data().count, pen: pen.data().count };
    } catch (e) { S.admQ[u.id] = { pN: 0, pAvg: 0, cN: 0, cAvg: 0, tot: 0, pen: 0 }; }
    if (S.screen === 'admin' && S.admTab === 'usuarios') render();
  }
}

/* ---------- cancelaciones: temporizadores, resultados, tasa y restricciones ---------- */
function startTick() { const id = setInterval(tick, 1000); addSub(() => clearInterval(id)); }
function tick() {
  const v = S.viaje;
  if (v && v.estado === 'en_punto') {
    const t = (Date.now() - tsMs(v.enPuntoEn)) / 1000;
    document.querySelectorAll('[data-timer="espera"]').forEach(el => { el.textContent = fmtClock(ESPERA_S - 10 - t); });
    document.querySelectorAll('[data-timerbar="espera"]').forEach(el => { el.style.width = Math.min(100, t / 3) + '%'; });
    const b = document.querySelector('[data-noshow]'); if (b && b.disabled && t >= ESPERA_S && !S.busy) render();
  }
  if (S.screen === 'cancelar') { const g = graceLeft(); document.querySelectorAll('[data-timer="gracia"]').forEach(el => { el.textContent = fmtClock(g); }); if (S._gWas > 0 && g <= 0) render(); S._gWas = g; }
  if (S.screen === 'cviaje' && v && v.estado === 'asignado') { const btn = document.querySelector('[data-act="llegue"]'), live = S.paxPos || pickupOf(v), d = distKm(S.pos, live), cerca = !live || (d != null && d <= 0.1); if (btn && !S.busy && btn.disabled === cerca) render(); }
  document.querySelectorAll('[data-timer="block"]').forEach(el => { const u = +el.getAttribute('data-until'), s = (u - Date.now()) / 1000; if (s <= 0) render(); else el.textContent = s > 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : fmtClock(s); });
}
// Resultado de cada viaje aceptado (finalizado o cancelado) para la tasa de cancelación de ambos
function cancelMsg(v, yoRol) {
  const yo = v.canceladoPor === S.user.uid, pen = v.penalizaA || null;
  if (yo) return 'Cancelaste el viaje.' + (pen === yoRol ? ' Cuenta en tu tasa de cancelación.' : ' Sin penalización.');
  if (v.motivo === 'no_se_presento') return 'El conductor canceló porque no te presentaste en el punto. Cuenta en tu tasa de cancelación.';
  return (yoRol === 'pasajero' ? 'El conductor canceló el viaje. Puedes pedir otro.' : 'El pasajero canceló el viaje.') + (pen === yoRol ? '' : ' No afecta tu tasa.');
}
function writeStats(v) {
  if (!v || !v.conductorId || !v.id) return;
  [[v.pasajeroId, 'pasajero'], [v.conductorId, 'conductor']].forEach(([u, rol]) => {
    setDoc(doc(db, 'stats', u, 'viajes', v.id), { pen: (v.penalizaA || null) === rol, rol, ts: serverTimestamp() }).catch(() => { });
    delete S.rates[u];
  });
}
async function loadRate(uid) {
  if (S.rates[uid]) return S.rates[uid];
  try { const qs = await getDocs(query(collection(db, 'stats', uid, 'viajes'), orderBy('ts', 'desc'), limit(20))); S.rates[uid] = { items: qs.docs.map(d => d.data()) }; }
  catch (e) { S.rates[uid] = { items: [] }; }
  return S.rates[uid];
}
function rateOf(uid, rol) { const r = S.rates[uid]; if (!r) return null; const it = r.items.filter(x => x.rol === rol); if (it.length < 3) return { n: it.length, pct: null }; return { n: it.length, pct: Math.round(it.filter(x => x.pen).length * 100 / it.length) }; }
function ratePill(uid, rol) { const r = rateOf(uid, rol); if (!r || r.pct == null) return ''; return '<span class="pill ' + (r.pct < 10 ? 'p-ok' : r.pct < 20 ? 'p-warn' : 'p-danger') + '">Cancela ' + r.pct + ' %</span>'; }
function blockOf(uid, rol) {
  const r = S.rates[uid]; if (!r) return null; const now = Date.now();
  const pens = r.items.filter(x => x.rol === rol && x.pen && now - tsMs(x.ts) < 86400000).map(x => tsMs(x.ts)).sort((p, q) => q - p);
  if (pens.length < 3) return null;
  const until = pens[0] + (rol === 'pasajero' ? 30 * 60000 : 86400000);
  return until > now ? { until, n: pens.length } : null;
}
function blockCard(rol, bl) {
  const s = (bl.until - Date.now()) / 1000, t = s > 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : fmtClock(s);
  return rol === 'pasajero'
    ? '<div class="card" style="border:2px solid #B42318"><div class="h2">No puedes pedir viajes por ahora</div><div class="muted">Cancelaste ' + bl.n + ' viajes en las últimas 24 horas después del periodo de gracia.</div><div class="col" style="align-items:center;gap:4px"><span class="muted small strong">Podrás pedir de nuevo en</span><span class="amount" style="line-height:1.25" data-timer="block" data-until="' + bl.until + '">' + t + '</span></div></div>'
    : '<div class="card" style="border:2px solid #B42318"><div class="h2">Modo conductor pausado</div><div class="muted">Cancelaste ' + bl.n + ' viajes aceptados en las últimas 24 horas. Podrás conectarte de nuevo en <b data-timer="block" data-until="' + bl.until + '">' + t + '</b>.</div></div>';
}

/* ---------- sitios frecuentes (los 5 destinos más pedidos) ---------- */
async function loadTopDest() {
  try {
    const qs = await getDocs(query(collection(db, 'destinos'), orderBy('veces', 'desc'), limit(5)));
    S.topDest = qs.docs.map(d => Object.assign({ id: d.id }, d.data()));
    if (S.screen === 'home') render();
  } catch (e) { S.topDest = []; }
}
async function countDestino(texto, pin) {
  const id = normKey(texto); if (!id) return;
  const r = doc(db, 'destinos', id);
  await runTransaction(db, async tx => {
    const d = await tx.get(r);
    const extra = pin ? { lat: pin.lat, lng: pin.lng } : {};
    if (d.exists()) tx.update(r, Object.assign({ veces: (d.data().veces || 0) + 1, actualizado: serverTimestamp() }, extra));
    else tx.set(r, Object.assign({ texto: String(texto).trim().slice(0, 120), veces: 1, actualizado: serverTimestamp() }, extra));
  });
}

/* ---------- calificaciones ---------- */
async function loadRating(key, path) {
  if (S.ratings[key]) return S.ratings[key];
  try {
    const qs = await getDocs(query(collection(db, ...path), limit(100)));
    let sum = 0, n = 0; const dist = {}, items = [];
    qs.docs.forEach(d => { const x = d.data(); sum += x.estrellas; n++; dist[x.estrellas] = (dist[x.estrellas] || 0) + 1; items.push(x); });
    const r = { avg: (5 * 4.5 + sum) / (5 + n), raw: n ? sum / n : 0, n, dist, items: items.sort((a, b) => tsMs(b.creado) - tsMs(a.creado)) };
    S.ratings[key] = r; return r;
  } catch (e) { return null; }
}

/* ---------- entrada a cada pantalla ---------- */
function enter(s) {
  if (s === 'home') { if (S.sharing) { S.sharing = false; stopWatch(); } S.route = null; getGps(); listenOthers(); loadTopDest(); delete S.rates[S.user.uid]; loadRate(S.user.uid).then(() => { if (S.screen === 'home') render(); }); startTick(); }
  if (s === 'buscando') {
    S.sharing = true; startWatch(); listenOthers();
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      if (!d.exists()) return; S.viaje = Object.assign({ id: d.id }, d.data());
      if (S.viaje.estado === 'asignado') { go('viaje'); return; }
      if (S.viaje.estado === 'cancelado') { S.banner = { kind: 'info', text: 'Cancelaste la solicitud.' }; S.viajeId = null; go('home'); return; }
    }, fail));
    addSub(onSnapshot(collection(db, 'viajes', S.viajeId, 'ofertas'), qs => {
      S.ofertas = qs.docs.map(d => { const o = Object.assign({ id: d.id }, d.data()); const km = distKm(S.viaje && S.viaje.origen, o.lat != null ? o : null); o.distTxt = km != null ? fmtDist(km) : ''; return o; }).sort((a, b) => a.precio - b.precio || (((rateOf(a.id, 'conductor') || {}).pct || 0) - ((rateOf(b.id, 'conductor') || {}).pct || 0)));
      S.ofertas.forEach(o => { if (!S.ratings[o.id]) loadRating(o.id, ['conductores', o.id, 'calificaciones']).then(() => { if (S.screen === 'buscando') render(); }); if (!S.rates[o.id]) loadRate(o.id).then(() => { if (S.screen === 'buscando') { S.ofertas.sort((a, b) => a.precio - b.precio || (((rateOf(a.id, 'conductor') || {}).pct || 0) - ((rateOf(b.id, 'conductor') || {}).pct || 0))); render(); } }); });
      if (S.screen === 'buscando') render();
    }, fail));
  }
  if (s === 'cancelar') {
    startTick();
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      const prev = S.viaje && S.viaje.estado; S.viaje = Object.assign({ id: d.id }, d.data());
      if (!REC(S.viaje.estado)) { go(S.cancelBack || (S.cancelRol === 'conductor' ? 'cviaje' : 'viaje')); return; }
      if (prev !== S.viaje.estado) render();
    }, fail));
  }
  if (s === 'viaje') {
    listenOthers(); startTick();
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      const prev = S.viaje && S.viaje.estado; S.viaje = Object.assign({ id: d.id }, d.data());
      const st = S.viaje.estado;
      if (st === 'finalizado') { writeStats(S.viaje); S.rating = 5; S.chips = {}; S.f.comentario = ''; go('calificar'); return; }
      if (st === 'cancelado') { writeStats(S.viaje); S.banner = { kind: 'warn', text: cancelMsg(S.viaje, 'pasajero') }; S.viajeId = null; S.viaje = null; go('home'); return; }
      if (prev !== st) render();
    }, fail));
    addSub(onValue(ref(rtdb, 'ubicaciones/' + S.viaje.conductorId), snap => {
      const p = snap.val(); if (!p) return; const first = !S.drvPos; S.drvPos = { lat: p.lat, lng: p.lng };
      setMarker('drv', S.drvPos, 'moto', 'Tu conductor'); if (first) fitMap(); refreshRoute(); updateEta();
    }));
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId, 'privado', S.viaje.conductorId), d => { if (d.exists()) { S.cPhone = d.data().telefono; S.cTransfer = d.data().transferencia || null; render(); } }, () => { }));
    loadRating(S.viaje.conductorId, ['conductores', S.viaje.conductorId, 'calificaciones']).then(() => { if (S.screen === 'viaje') render(); });
    S.sharing = true; startWatch();
  }
  if (s === 'solicitudes') {
    listenOthers(); startTick();
    delete S.rates[S.user.uid]; loadRate(S.user.uid).then(() => { if (blockOf(S.user.uid, 'conductor') && S.online) { S.online = false; stopWatch(); } if (S.screen === 'solicitudes') render(); });
    loadStats();
    loadRating(S.user.uid, ['conductores', S.user.uid, 'calificaciones']).then(() => { if (S.screen === 'solicitudes') render(); });
    if (S.online) listenRequests();
  }
  if (s === 'espera') {
    addSub(onSnapshot(doc(db, 'viajes', S.espera.viajeId), d => {
      const v = d.data();
      if (v.estado === 'asignado' && v.conductorId === S.user.uid) { S.viajeId = d.id; S.viaje = Object.assign({ id: d.id }, v); go('cviaje'); return; }
      if (v.estado !== 'buscando') { S.espera.perdida = true; render(); }
    }, () => { S.espera.perdida = true; render(); }));
  }
  if (s === 'cviaje') {
    listenOthers(); startTick();
    const priv = { telefono: S.perfil.telefono, nombre: S.perfil.nombre }; if (S.perfil.transferencia) priv.transferencia = S.perfil.transferencia;
    setDoc(doc(db, 'viajes', S.viajeId, 'privado', S.user.uid), priv).catch(() => { });
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      const prev = S.viaje && S.viaje.estado; S.viaje = Object.assign({ id: d.id }, d.data());
      if (S.viaje.estado === 'cancelado') { writeStats(S.viaje); S.banner = { kind: 'warn', text: cancelMsg(S.viaje, 'conductor') }; S.viajeId = null; go('solicitudes'); return; }
      if (S.viaje.estado === 'finalizado') { writeStats(S.viaje); S.rating = 5; S.chips = {}; go('ccalificar'); return; }
      if (prev !== S.viaje.estado) render();
    }, fail));
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId, 'privado', S.viaje.pasajeroId), d => { if (d.exists()) { S.pPhone = d.data().telefono; render(); } }, () => { }));
    loadRating('p_' + S.viaje.pasajeroId, ['usuarios', S.viaje.pasajeroId, 'calificaciones']).then(() => { if (S.screen === 'cviaje') render(); });
    addSub(onValue(ref(rtdb, 'ubicaciones/' + S.viaje.pasajeroId), snap => {
      const p = snap.val(); if (!p || !S.viaje || !REC(S.viaje.estado)) return; const first = !S.paxPos; S.paxPos = { lat: p.lat, lng: p.lng };
      setMarker('pax', S.paxPos, 'person', 'Pasajero'); if (first) fitMap(); refreshRoute(); updateEta();
    }));
    startWatch(); refreshRoute();
  }
  if (s === 'registroC' && S.conductor) { if (S.docsFor !== S.user.uid) loadMyDocs(); }
  if (s === 'micalif') { S.cal = null; delete S.ratings[S.user.uid]; loadRating(S.user.uid, ['conductores', S.user.uid, 'calificaciones']).then(r => { S.cal = r || { n: 0 }; if (S.screen === 'micalif') render(); }); }
  if (s === 'historial') {
    S.hist = null;
    Promise.all([getDocs(query(collection(db, 'viajes'), where('pasajeroId', '==', S.user.uid), limit(50))),
      S.conductor && S.conductor.estado === 'aprobado' ? getDocs(query(collection(db, 'viajes'), where('conductorId', '==', S.user.uid), limit(50))) : Promise.resolve({ docs: [] })])
      .then(([a, b]) => { S.hist = a.docs.map(d => Object.assign({ id: d.id, _rol: 'pasajero' }, d.data())).concat(b.docs.map(d => Object.assign({ id: d.id, _rol: 'conductor' }, d.data()))).sort((x, y) => tsMs(y.creado) - tsMs(x.creado)); if (S.screen === 'historial') render(); })
      .catch(fail);
  }
  if (s === 'admin') {
    listenOthers(); if (S.admTab === 'usuarios') loadAdmUsers();
    addSub(onSnapshot(query(collection(db, 'conductores'), limit(200)), qs => { S.adm.conductores = qs.docs.map(d => Object.assign({ id: d.id }, d.data())); if (S.screen === 'admin') render(); }, fail));
    addSub(onSnapshot(query(collection(db, 'alertas'), where('estado', '==', 'activa'), limit(50)), qs => { S.adm.alertas = qs.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => tsMs(b.creado) - tsMs(a.creado)); if (S.screen === 'admin') render(); }, fail));
    getDocs(query(collection(db, 'viajes'), limit(100))).then(qs => { S.adm.viajes = qs.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => tsMs(b.creado) - tsMs(a.creado)); if (S.screen === 'admin') render(); }).catch(fail);
  }
}
function listenRequests() {
  let known = new Set(S.requests.map(r => r.id)), first = true;
  addSub(onSnapshot(query(collection(db, 'viajes'), where('estado', '==', 'buscando'), limit(30)), qs => {
    const now = Date.now();
    S.requests = qs.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .filter(v => v.pasajeroId !== S.user.uid && !S.ignored[v.id] && now - tsMs(v.creado) < 20 * 60 * 1000)
      .sort((a, b) => tsMs(b.creado) - tsMs(a.creado));
    const fresh = S.requests.some(r => !known.has(r.id));
    if (fresh && !first) beep();
    first = false; known = new Set(S.requests.map(r => r.id));
    S.requests.forEach(r => { if (!S.rates[r.pasajeroId]) loadRate(r.pasajeroId).then(() => { if (S.screen === 'solicitudes') render(); }); });
    S.requests.forEach(r => { const k = 'p_' + r.pasajeroId; if (!S.ratings[k]) loadRating(k, ['usuarios', r.pasajeroId, 'calificaciones']).then(() => { if (S.screen === 'solicitudes') render(); }); });
    if (S.screen === 'solicitudes') render();
  }, fail));
  startWatch();
}
async function loadStats() {
  try {
    const qs = await getDocs(query(collection(db, 'viajes'), where('conductorId', '==', S.user.uid), limit(200)));
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const hoy = qs.docs.map(d => d.data()).filter(v => v.estado === 'finalizado' && tsMs(v.finalizadoEn || v.creado) >= d0.getTime());
    S.stats = { viajes: hoy.length, ganado: hoy.reduce((s, v) => s + (v.precioFinal || 0), 0) };
    if (S.screen === 'solicitudes') render();
  } catch (e) { S.stats = { viajes: 0, ganado: 0 }; }
}

/* ---------- sesión ---------- */
async function findActive(field, uid, estados) {
  try {
    const q1 = await getDocs(query(collection(db, 'viajes'), where(field, '==', uid), where('estado', 'in', estados), limit(1)));
    if (!q1.empty) return Object.assign({ id: q1.docs[0].id }, q1.docs[0].data());
    return null;
  } catch (e) {
    try {
      const q2 = await getDocs(query(collection(db, 'viajes'), where(field, '==', uid), limit(100)));
      const d = q2.docs.find(x => estados.includes(x.data().estado));
      return d ? Object.assign({ id: d.id }, d.data()) : null;
    } catch (e2) { return null; }
  }
}
async function afterLogin(user) {
  S.user = user; clearGSubs();
  try {
    const p = await getDoc(doc(db, 'usuarios', user.uid));
    if (!p.exists()) { S.f.nombre = user.displayName || ''; go('onboarding'); return; }
    S.perfil = p.data();
    try { S.admin = (await getDoc(doc(db, 'admins', user.uid))).exists(); } catch (e) { S.admin = false; }
    gsubs.push(onSnapshot(doc(db, 'conductores', user.uid), d => {
      const before = S.conductor && S.conductor.estado; S.conductor = d.exists() ? d.data() : null;
      const now = S.conductor && S.conductor.estado;
      if (before && before !== now && now === 'aprobado') { S.banner = { kind: 'ok', text: 'El administrador aprobó tu registro. Ya puedes usar el modo conductor.' }; if (S.screen === 'menu' || S.screen === 'home') render(); }
      if (before === 'aprobado' && now !== 'aprobado' && S.mode === 'conductor') { S.online = false; stopWatch(); S.mode = 'pasajero'; S.banner = { kind: 'warn', text: 'Tu modo conductor fue ' + now + '.' }; go('home'); }
    }, () => { }));
    // Retomar un viaje en curso (si la consulta falla, se continúa normalmente)
    const pv = await findActive('pasajeroId', user.uid, ['buscando', 'asignado', 'en_punto', 'en_curso']);
    if (pv) { S.viajeId = pv.id; S.viaje = pv; S.mode = 'pasajero'; go(pv.estado === 'buscando' ? 'buscando' : 'viaje'); return; }
    const cond = await getDoc(doc(db, 'conductores', user.uid));
    if (cond.exists() && cond.data().estado === 'aprobado') {
      const cv = await findActive('conductorId', user.uid, ['asignado', 'en_punto', 'en_curso']);
      if (cv) { S.viajeId = cv.id; S.viaje = cv; S.mode = 'conductor'; S.online = true; go('cviaje'); return; }
    }
    go('home');
  } catch (e) { S.connErr = errMsg(e); go('sinConexion'); }
}
onAuthStateChanged(auth, user => {
  if (user) afterLogin(user);
  else { clearSubs(); clearGSubs(); S.user = null; S.perfil = null; S.conductor = null; S.admin = false; S.mode = 'pasajero'; S.online = false; go('login'); }
});

/* ---------- eventos ---------- */
appEl.addEventListener('input', e => {
  const k = e.target.getAttribute('data-in'); if (!k) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (k === 'cOtro') { const id = e.target.getAttribute('data-id'); S.cOtro[id] = Object.assign(S.cOtro[id] || { open: true }, { val: v }); return; }
  S.f[k] = v;
});
appEl.addEventListener('change', async e => {
  const k = e.target.getAttribute('data-in'); if (k && e.target.type === 'checkbox') { S.f[k] = e.target.checked; if (k.indexOf('force_') === 0 || k === 'amOk') render(); }
  const t = e.target.getAttribute('data-docup');
  if (t && e.target.files && e.target.files[0]) {
    S.err = null; S.docMsg = 'Procesando la foto…'; render();
    try {
      const img = await compressImage(e.target.files[0]);
      S.docs[t] = { img, estado: 'local' };
      if (S.conductor && S.conductor.estado !== 'aprobado') {
        S.docMsg = 'Enviando la foto…'; render();
        await setDoc(doc(db, 'conductores', S.user.uid, 'documentos', t), { tipo: t, img, subido: serverTimestamp() });
        S.docs[t].estado = 'subido';
      }
      S.docMsg = ''; render();
    } catch (err) { S.docMsg = ''; S.err = err && err.code ? errMsg(err) : (err.message || 'No se pudo procesar la foto.'); render(); }
  }
});

async function act(a, v, b) {
  const uid = S.user && S.user.uid;
  switch (a) {
    case 'go':
      if (v === 'contactos') { S.f.cNombre = ''; S.f.cTel = ''; S.f.cErr = ''; }
      if (v === 'transfer') S.f.transferencia = S.perfil.transferencia || '';
      go(v); break;
    case 'retryLogin': go('cargando'); afterLogin(S.user); break;
    case 'hideInstall': S.hideInstall = true; render(); break;
    case 'install':
      if (!installEvt) break;
      try { installEvt.prompt(); await installEvt.userChoice; } catch (e) { }
      installEvt = null; render(); break;
    case 'closeBanner': S.banner = null; render(); break;
    case 'closeErr': S.err = null; render(); break;
    case 'togglePass': { const pos = (document.getElementById('pw') || {}).selectionStart; S.showPass = !S.showPass; render(); const p = document.getElementById('pw'); if (p) { p.focus(); try { p.setSelectionRange(pos, pos); } catch (e) { } } break; }
    case 'toggleCrear': S.f.modoCrear = !S.f.modoCrear; S.err = null; render(); break;
    case 'google': S.busy = true; S.err = null; render(); try { await signInWithPopup(auth, new GoogleAuthProvider()); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'signin': case 'signup': {
      const em = (S.f.email || '').trim(), pw = S.f.pass || '';
      if (!em || !pw) { S.err = 'Escribe tu correo y tu contraseña.'; render(); break; }
      S.busy = true; S.err = null; render();
      try { if (a === 'signup') await createUserWithEmailAndPassword(auth, em, pw); else await signInWithEmailAndPassword(auth, em, pw); S.busy = false; render(); S.f.pass = ''; } catch (e) { fail(e); }
      break;
    }
    case 'reset': {
      const em = (S.f.email || '').trim(); if (!em) { S.err = 'Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".'; render(); break; }
      try { await sendPasswordResetEmail(auth, em); S.banner = { kind: 'ok', text: 'Te enviamos un correo para restablecer la contraseña.' }; S.err = null; render(); } catch (e) { fail(e); }
      break;
    }
    case 'saveProfile': {
      const nom = (S.f.nombre || '').trim(), tel = String(S.f.telefono || '').replace(/\D/g, '');
      if (nom.length < 2) { S.err = 'Escribe tu nombre.'; render(); break; }
      if (tel.length !== 10) { S.err = 'El celular debe tener 10 dígitos.'; render(); break; }
      if (!S.f.acepta) { S.err = 'Debes autorizar el tratamiento de datos para usar la app.'; render(); break; }
      S.busy = true; render();
      try { await setDoc(doc(db, 'usuarios', uid), { nombre: nom, telefono: tel, aceptoDatos: true, aceptoEn: serverTimestamp(), creado: serverTimestamp(), contactos: [] }); S.busy = false; afterLogin(S.user); } catch (e) { fail(e); }
      break;
    }
    case 'logout': S.online = false; await stopWatch(); await signOut(auth); break;
    case 'retryGps': S.gps = 'pendiente'; render(); getGps(); break;
    case 'freq': { const t = (S.topDest || []).find(d => d.texto === v); S.f.destino = v; S.err = null; S.destPin = t && typeof t.lat === 'number' ? { lat: t.lat, lng: t.lng } : null; S.route = null; render(); break; }
    case 'pickDest': S.pickDest = !S.pickDest; S.err = null; render(); if (S.pickDest) { const m = document.getElementById('map'); if (m) m.scrollIntoView({ block: 'center' }); } break;
    case 'clearDest': S.destPin = null; S.route = null; render(); break;
    case 'geoDest': {
      const q = (S.f.destino || '').trim();
      if (q.length < 3) { S.err = 'Escribe primero el destino y luego toca "Ubicar en el mapa".'; render(); break; }
      S.busy = true; S.err = null; render();
      try { const p = await geocodeDestino(q); S.busy = false; if (p) { S.destPin = p; S.route = null; render(); } else { S.err = 'No encontramos esa dirección en el mapa. Toca "Marcar en el mapa" y señala el punto.'; render(); } }
      catch (e) { S.busy = false; S.err = 'No se pudo buscar la dirección. Toca "Marcar en el mapa" y señala el punto.'; render(); }
      break;
    }
    case 'minus': S.offer = Math.max(MIN, S.offer - 500); render(); break;
    case 'plus': S.offer += 500; render(); break;
    case 'otroToggle': S.otroOpen = !S.otroOpen; S.f.otroErr = ''; render(); break;
    case 'otroUse': { const n = parseMoney(S.f.otroVal), er = validAmount(n); if (er) { S.f.otroErr = er; render(); break; } S.offer = n; S.otroOpen = false; S.f.otroVal = ''; S.f.otroErr = ''; render(); break; }
    case 'notaToggle': S.notaOpen = !S.notaOpen; render(); break;
    case 'pago': S.pago = v === 'transferencia' ? 'transferencia' : 'efectivo'; render(); break;
    case 'buscar': {
      if (blockOf(uid, 'pasajero')) { S.err = 'Tu cuenta tiene una restricción temporal por cancelaciones.'; render(); break; }
      const dest = (S.f.destino || '').trim(), refTxt = (S.f.ref || '').trim();
      if (dest.length < 2) { S.err = 'Escribe o elige el destino del viaje.'; render(); break; }
      S.busy = true; S.err = null; S.banner = null; render();
      if (!S.pos) await gpsOnce(8000);
      if (!S.pos && refTxt.length < 3) { S.busy = false; S.err = 'No pudimos obtener tu ubicación GPS. Escribe una referencia del punto de recogida.'; render(); break; }
      try {
        const data = { pasajeroId: uid, pasajeroNombre: S.perfil.nombre, origen: { texto: refTxt || 'Ubicación GPS', lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null }, destino: S.destPin ? { texto: dest, lat: S.destPin.lat, lng: S.destPin.lng } : { texto: dest }, oferta: S.offer, nota: S.notaOpen ? (S.f.nota || '').trim().slice(0, 200) : '', pago: S.pago, estado: 'buscando', creado: serverTimestamp(), conductorId: null, precioFinal: null, conductor: null };
        const r = await addDoc(collection(db, 'viajes'), data);
        await setDoc(doc(db, 'viajes', r.id, 'privado', uid), { telefono: S.perfil.telefono, nombre: S.perfil.nombre });
        countDestino(dest, S.destPin).catch(() => { });
        S.viajeId = r.id; S.viaje = Object.assign({ id: r.id }, data); S.ofertas = []; S.busy = false; go('buscando');
      } catch (e) { fail(e); }
      break;
    }
    case 'cancelTrip':
      S.busy = true; render();
      try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid }); S.busy = false; render(); } catch (e) { fail(e); }
      break;
    case 'accept':
      S.busy = true; render();
      try {
        await runTransaction(db, async tx => {
          const vref = doc(db, 'viajes', S.viajeId), oref = doc(db, 'viajes', S.viajeId, 'ofertas', v);
          const vs = await tx.get(vref), os = await tx.get(oref);
          if (!vs.exists() || vs.data().estado !== 'buscando') throw new Error('Esta solicitud ya no está disponible.');
          if (!os.exists()) throw new Error('El conductor retiró su oferta. Elige otra.');
          const o = os.data(), e = offerEta(Object.assign({ id: v }, o));
          tx.update(vref, { estado: 'asignado', conductorId: v, precioFinal: o.precio, conductor: { nombre: o.nombre, moto: o.moto, color: o.color, placa: o.placa }, asignadoEn: serverTimestamp(), etaMin: e ? e.min : 5 });
        });
        S.busy = false; render();
      } catch (e) { fail(e); }
      break;
    case 'sos': S.sos = S.sos === 'sent' ? 'sent' : 'confirm'; render(); break;
    case 'sosCancel': S.sos = null; render(); break;
    case 'sosSend':
      try { await addDoc(collection(db, 'alertas'), { viajeId: S.viajeId, creadoPor: uid, nombre: S.perfil.nombre, rol: S.screen === 'cviaje' ? 'conductor' : 'pasajero', lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null, estado: 'activa', creado: serverTimestamp() }); S.sos = 'sent'; render(); } catch (e) { fail(e); }
      break;
    case 'rate': S.rating = +v; render(); break;
    case 'chip': S.chips[v] = !S.chips[v]; render(); break;
    case 'sendRating':
      S.busy = true; render();
      try { await setDoc(doc(db, 'conductores', S.viaje.conductorId, 'calificaciones', S.viaje.id), { estrellas: S.rating, aspectos: Object.keys(S.chips).filter(k => S.chips[k]), comentario: (S.f.comentario || '').trim().slice(0, 500), creado: serverTimestamp() }); S.busy = false; delete S.ratings[S.viaje.conductorId]; S.banner = { kind: 'ok', text: 'Calificación enviada. Gracias por viajar con JNF Moto.' }; endPassengerTrip(); } catch (e) { fail(e); }
      break;
    case 'skipRating': endPassengerTrip(); break;
    case 'closeMenu': go(S.mode === 'conductor' ? 'solicitudes' : 'home'); break;
    case 'modeP': S.mode = 'pasajero'; S.online = false; stopWatch(); go('home'); break;
    case 'modeC': S.mode = 'conductor'; go('solicitudes'); break;
    case 'addContact': {
      const nom = (S.f.cNombre || '').trim(), tel = String(S.f.cTel || '').replace(/\D/g, '');
      if (nom.length < 2) { S.f.cErr = 'Escribe el nombre del contacto.'; render(); break; }
      if (tel.length !== 10) { S.f.cErr = 'El celular debe tener 10 dígitos.'; render(); break; }
      const cs = (S.perfil.contactos || []).concat([{ nombre: nom, telefono: tel }]);
      S.busy = true; render();
      try { await updateDoc(doc(db, 'usuarios', uid), { contactos: cs }); S.perfil.contactos = cs; S.f.cNombre = ''; S.f.cTel = ''; S.f.cErr = ''; S.busy = false; render(); } catch (e) { fail(e); }
      break;
    }
    case 'saveTransfer': {
      const t = (S.f.transferencia || '').trim().slice(0, 80);
      if (t.length < 5) { S.err = 'Escribe la entidad y el número, por ejemplo: Nequi 300 123 4567.'; render(); break; }
      S.busy = true; render();
      try { await updateDoc(doc(db, 'usuarios', uid), { transferencia: t }); S.perfil.transferencia = t; S.busy = false; S.banner = { kind: 'ok', text: 'Datos guardados.' }; go('menu'); } catch (e) { fail(e); }
      break;
    }
    case 'delContact': {
      const cs = (S.perfil.contactos || []).filter((c, i) => i !== +v);
      try { await updateDoc(doc(db, 'usuarios', uid), { contactos: cs }); S.perfil.contactos = cs; render(); } catch (e) { fail(e); }
      break;
    }
    case 'saveConductor': {
      const moto = (S.f.moto || '').trim(), color = (S.f.color || '').trim(), placa = (S.f.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (moto.length < 2) { S.err = 'Escribe la marca y el modelo del mototour.'; render(); break; }
      if (color.length < 2) { S.err = 'Escribe el color del mototour.'; render(); break; }
      if (!/^[A-Z0-9]{5,7}$/.test(placa) || !/[A-Z]/.test(placa) || !/[0-9]/.test(placa)) { S.err = 'La placa debe tener entre 5 y 7 letras y números, por ejemplo ABC12D.'; render(); break; }
      const registro = String(S.f.registro || '').trim().replace(/\s+/g, ' ').toUpperCase();
      if (registro.length < 2 || registro.length > 30) { S.err = 'Escribe el número de registro de tránsito tal como aparece en el certificado.'; render(); break; }
      const falta = DOCS_C.filter(d => !S.docs[d[0]]).map(d => d[1]);
      if (falta.length) { S.err = 'Falta subir: ' + falta.join(', ') + '.'; render(); break; }
      S.busy = true; S.docMsg = 'Enviando registro…'; render();
      try {
        if (!S.conductor) await setDoc(doc(db, 'conductores', uid), { nombre: S.perfil.nombre, moto, color, placa, registro, estado: 'pendiente', creado: serverTimestamp() });
        let n = 0;
        for (const d of DOCS_C) {
          n++; S.docMsg = 'Subiendo documentos (' + n + ' de ' + DOCS_C.length + ')…'; render();
          if (S.docs[d[0]].estado === 'local') { await setDoc(doc(db, 'conductores', uid, 'documentos', d[0]), { tipo: d[0], img: S.docs[d[0]].img, subido: serverTimestamp() }); S.docs[d[0]].estado = 'subido'; }
        }
        S.docMsg = ''; S.busy = false; S.banner = { kind: 'info', text: 'Registro enviado. El administrador revisará tus documentos.' }; go('menu');
      } catch (e) { S.docMsg = ''; fail(e); }
      break;
    }
    case 'online':
      if (!S.online && blockOf(uid, 'conductor')) { S.err = 'Tu modo conductor está pausado por cancelaciones.'; render(); break; }
      S.online = !S.online;
      if (S.online) { beepUnlock(); go('solicitudes'); } else { S.requests = []; stopWatch(); go('solicitudes'); }
      break;
    case 'reqMap': S.reqMap = S.reqMap === v ? null : v; render(); break;
    case 'cIgnore': S.ignored[v] = true; S.requests = S.requests.filter(r => r.id !== v); render(); break;
    case 'cOtroToggle': { const cur = S.cOtro[v] || {}; S.cOtro[v] = { open: !cur.open, val: cur.val || '', err: '' }; render(); break; }
    case 'cOffer': case 'cOtroSend': {
      const r = S.requests.find(x => x.id === v); if (!r) break;
      let price = +(b.getAttribute('data-p') || 0);
      if (a === 'cOtroSend') { const o = S.cOtro[v] || {}; const n = parseMoney(o.val), er = validAmount(n); if (er) { S.cOtro[v] = { open: true, val: o.val, err: er }; render(); break; } price = n; }
      S.busy = true; render();
      try {
        const of = { conductorId: uid, nombre: S.conductor.nombre, moto: S.conductor.moto, color: S.conductor.color, placa: S.conductor.placa, precio: price, creado: serverTimestamp(), lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null };
        if (S.conductor.registro) of.registro = S.conductor.registro;
        await setDoc(doc(db, 'viajes', v, 'ofertas', uid), of);
        S.busy = false; S.espera = { viajeId: v, nombre: r.pasajeroNombre, precio: price, origen: r.origen.texto, destino: r.destino.texto, pago: r.pago }; go('espera');
      } catch (e) { fail(e); }
      break;
    }
    case 'cWithdraw':
      try { await deleteDoc(doc(db, 'viajes', S.espera.viajeId, 'ofertas', uid)); } catch (e) { }
      S.espera = null; go('solicitudes'); break;
    case 'backToRequests': S.espera = null; go('solicitudes'); break;
    case 'llegue': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'en_punto', enPuntoEn: serverTimestamp() }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'openCancel': S.cancel = { motivo: null }; S.f.motivoTexto = ''; S.cancelRol = S.screen === 'cviaje' ? 'conductor' : 'pasajero'; S.cancelBack = S.screen; go('cancelar'); break;
    case 'backFromCancel': go(S.cancelBack || (S.cancelRol === 'conductor' ? 'cviaje' : 'viaje')); break;
    case 'motivo': S.cancel.motivo = v; S.err = null; render(); if (v === 'otro') { const t = document.getElementById('mt'); if (t) t.focus(); } break;
    case 'doCancel': {
      const m = S.cancel.motivo, txt = (S.f.motivoTexto || '').trim();
      if (!m) { S.err = 'Elige el motivo de la cancelación.'; render(); break; }
      if (m === 'otro' && txt.length < 5) { S.err = 'Escribe el motivo de la cancelación (mínimo 5 caracteres).'; render(); const t = document.getElementById('mt'); if (t) t.focus(); break; }
      const v0 = S.viaje, rol = S.cancelRol, pen = rol === 'pasajero' ? penPasajero(v0, m) : (m === 'inseguro' ? null : 'conductor');
      S.busy = true; render();
      try {
        await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid, motivo: m, motivoTexto: m === 'otro' ? txt.slice(0, 200) : '', penalizaA: pen });
        if (m === 'inseguro') addDoc(collection(db, 'alertas'), { viajeId: v0.id, creadoPor: uid, nombre: S.perfil.nombre, rol: rol + ' (canceló: se siente inseguro)', lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null, estado: 'activa', creado: serverTimestamp() }).catch(() => { });
        S.busy = false; render();
      } catch (e) { fail(e); }
      break;
    }
    case 'noShow':
      S.busy = true; render();
      try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid, motivo: 'no_se_presento', motivoTexto: '', penalizaA: 'pasajero' }); S.busy = false; render(); } catch (e) { fail(e); }
      break;
    case 'cStart': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'en_curso', iniciadoEn: serverTimestamp() }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'cFinish': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'finalizado', finalizadoEn: serverTimestamp() }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'cCancel': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'cSendRating':
      S.busy = true; render();
      try { await setDoc(doc(db, 'usuarios', S.viaje.pasajeroId, 'calificaciones', S.viaje.id), { estrellas: S.rating, aspectos: Object.keys(S.chips).filter(k => S.chips[k]), creado: serverTimestamp() }); S.busy = false; endDriverTrip(); } catch (e) { fail(e); }
      break;
    case 'cSkipRating': endDriverTrip(); break;
    case 'admTab': S.admTab = v; render(); if (v === 'usuarios' && !S.admUsers) loadAdmUsers(); break;
    case 'admMore': S.admLimit += 30; S.admUsers = null; render(); loadAdmUsers(); break;
    case 'admMake': S.admMake = v || null; S.f.amMoto = ''; S.f.amColor = ''; S.f.amPlaca = ''; S.f.amReg = ''; S.f.amOk = false; render(); break;
    case 'admMakeSave': {
      const u = (S.admUsers || []).find(x => x.id === v); if (!u) break;
      const moto = (S.f.amMoto || '').trim(), color = (S.f.amColor || '').trim(), placa = (S.f.amPlaca || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), reg = String(S.f.amReg || '').trim().replace(/\s+/g, ' ').toUpperCase();
      if (moto.length < 2 || color.length < 2) { S.err = 'Escribe la marca, el modelo y el color del mototour.'; render(); break; }
      if (!/^[A-Z0-9]{5,7}$/.test(placa) || !/[A-Z]/.test(placa) || !/[0-9]/.test(placa)) { S.err = 'La placa debe tener entre 5 y 7 letras y números, por ejemplo ABC12D.'; render(); break; }
      if (reg && (reg.length < 2 || reg.length > 30)) { S.err = 'El número de registro de tránsito debe tener entre 2 y 30 caracteres.'; render(); break; }
      S.busy = true; render();
      try {
        const d = { nombre: u.nombre, moto, color, placa, estado: 'aprobado', aprobadoSinDocs: true, creado: serverTimestamp() }; if (reg) d.registro = reg;
        await setDoc(doc(db, 'conductores', v), d); S.admMake = null; S.busy = false; S.banner = { kind: 'ok', text: u.nombre + ' quedó habilitado como conductor.' }; render();
      } catch (e) { fail(e); }
      break;
    }
    case 'admForce':
      if (!S.f['force_' + v]) break;
      S.busy = true; render();
      try { await updateDoc(doc(db, 'conductores', v), { estado: 'aprobado', aprobadoSinDocs: true }); S.busy = false; render(); } catch (e) { fail(e); }
      break;
    case 'admDocs':
      if (S.admOpen === v) { S.admOpen = null; S.admBig = null; render(); break; }
      S.admOpen = v; S.admBig = null; S.admDocs[v] = 'cargando'; render();
      try { const qs = await getDocs(collection(db, 'conductores', v, 'documentos')); const m = {}; qs.docs.forEach(x => { m[x.id] = x.data().img; }); S.admDocs[v] = m; } catch (e) { S.admDocs[v] = {}; S.err = errMsg(e); }
      render(); break;
    case 'admBig': S.admBig = S.admBig === v ? null : v; render(); break;
    case 'admSet': S.busy = true; render(); try { await updateDoc(doc(db, 'conductores', v), { estado: b.getAttribute('data-p') }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'admAlert': S.busy = true; render(); try { await updateDoc(doc(db, 'alertas', v), { estado: 'atendida' }); S.busy = false; render(); } catch (e) { fail(e); } break;
  }
}
function beepUnlock() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { } }
function endPassengerTrip() { S.viajeId = null; S.viaje = null; S.ofertas = []; S.sos = null; S.cPhone = null; S.cTransfer = null; S.pago = 'efectivo'; S.drvPos = null; S.route = null; S.destPin = null; S.pickDest = false; S.sharing = false; stopWatch(); S.offer = MIN; S.f.destino = ''; S.f.ref = ''; S.f.nota = ''; S.notaOpen = false; go('home'); }
function endDriverTrip() { S.viajeId = null; S.viaje = null; S.sos = null; S.pPhone = null; S.paxPos = null; S.route = null; S.stats = null; S.banner = { kind: 'ok', text: 'Viaje finalizado. Sigues conectado.' }; go('solicitudes'); }
appEl.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; act(b.getAttribute('data-act'), b.getAttribute('data-v'), b); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
