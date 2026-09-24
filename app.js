import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, query, where, limit, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
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
function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
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
  offer: MIN, otroOpen: false, notaOpen: false,
  viajeId: null, viaje: null, ofertas: [], ratings: {}, cPhone: null, pPhone: null, sos: null, drvPos: null,
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
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  starOn: '<svg width="40" height="40" viewBox="0 0 24 24" fill="#C9A227" stroke="#A8841A" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
  starOff: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--star-off)" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>'
};
const LABELS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
const FREQ = ['Terminal de transporte', 'Hospital', 'Parque principal', 'Plaza de mercado'];
const ASP_C = ['Conducción segura', 'Puntualidad', 'Amabilidad', 'Casco para el pasajero', 'Moto en buen estado'];
const ASP_P = ['Pagó completo', 'Puntual en el punto', 'Respetuoso', 'Usó casco'];

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

/* ---------- pantallas: acceso ---------- */
function vCargando() { return '<div class="screen"><div class="pad" style="flex:1;justify-content:center;align-items:center"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:96px;height:96px"><div class="spinner" role="status" aria-label="Cargando"></div></div></div>'; }
function vLogin() {
  const crear = S.f.modoCrear;
  return '<div class="screen"><div class="top" style="align-items:center;text-align:center;padding:28px 20px"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:88px;height:88px"><h1 class="h1" style="color:#C9A227">JNF Moto</h1><div class="sub">Tu mototaxi, al precio que acuerdas.</div></div>' +
    '<div class="pad">' + errHTML() + bannerHTML(S.banner) +
    '<button class="btn gbtn" data-act="google"' + busyAttr() + '>Entrar con Google</button><div class="divider">o con tu correo</div>' +
    '<div class="field"><label for="em">Correo electrónico</label><input type="email" id="em" data-in="email" autocomplete="email" value="' + fv('email') + '"></div>' +
    '<div class="field"><label for="pw">Contraseña</label><input type="password" id="pw" data-in="pass" autocomplete="' + (crear ? 'new-password' : 'current-password') + '" value="' + fv('pass') + '">' + (crear ? '<span class="muted small">Mínimo 6 caracteres.</span>' : '') + '</div>' +
    '<button class="btn btn-gold" data-act="' + (crear ? 'signup' : 'signin') + '"' + busyAttr() + '>' + (crear ? 'Crear cuenta' : 'Ingresar') + '</button>' +
    '<button class="link" data-act="toggleCrear" style="align-self:center">' + (crear ? 'Ya tengo cuenta: ingresar' : 'No tengo cuenta: crear una') + '</button>' +
    (crear ? '' : '<button class="link" data-act="reset" style="align-self:center;font-size:13px">Olvidé mi contraseña</button>') +
    '</div><div class="demo">Versión de prueba · Asesorías y Consultorías JNF S.A.S.</div></div>';
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
  h += S.gps === 'ok' ? '<div id="map" class="lmap" role="img" aria-label="Mapa con tu ubicación"></div>' : '';
  h += '<div class="sheet"><div class="handle"></div>' + bannerHTML(S.banner) + errHTML() + '<h1 class="h1">¿A dónde vas?</h1>';
  h += '<div class="field"><label for="ref">Punto de recogida (referencia)</label><input type="text" id="ref" data-in="ref" placeholder="Ej. Frente a la tienda azul, Calle 5" value="' + fv('ref') + '">' + gps + '</div>';
  h += '<div class="field"><label for="destino">Destino</label><input type="text" id="destino" data-in="destino" placeholder="Barrio, dirección o lugar" value="' + fv('destino') + '" autocomplete="off"></div>';
  const sel = {}; sel[S.f.destino] = true;
  h += '<div class="col" style="gap:8px"><span class="lbl">Lugares frecuentes</span>' + chipsHTML(FREQ, sel, 'freq') + '</div>';
  h += '<div class="offerbox"><span class="lbl">Tu oferta</span><div class="stepper"><button class="round" data-act="minus" aria-label="Bajar oferta 500 pesos"' + (S.offer <= MIN ? ' disabled' : '') + '>−</button><div class="amount" id="amount">' + money(S.offer) + '</div><button class="round solid" data-act="plus" aria-label="Subir oferta 500 pesos">+</button></div>' +
    '<div class="row between" style="flex-wrap:wrap;gap:4px"><span class="muted small">Mínimo ' + money(MIN) + ' · sin tope</span><button class="link" data-act="otroToggle" aria-expanded="' + S.otroOpen + '" style="font-size:13px">' + (S.otroOpen ? 'Cerrar' : 'Escribir otro valor') + '</button></div>';
  if (S.otroOpen) h += '<div class="field"><label for="otro">Valor que ofreces</label><div class="row"><input type="text" inputmode="numeric" id="otro" data-in="otroVal" placeholder="Ej. 2.300" value="' + fv('otroVal') + '"><button class="btn btn-navy btn-sm" data-act="otroUse" style="min-height:48px">Usar</button></div>' + (S.f.otroErr ? '<div class="err" role="alert">' + esc(S.f.otroErr) + '</div>' : '') + '</div>';
  h += '</div><div class="row"><button class="chip" aria-pressed="true" style="flex:1">Efectivo</button><button class="chip" data-act="notaToggle" aria-expanded="' + S.notaOpen + '" style="flex:1">' + (S.notaOpen ? 'Ocultar nota' : 'Nota al conductor') + '</button></div>';
  if (S.notaOpen) h += '<div class="field"><label for="nota">Nota para el conductor</label><textarea id="nota" data-in="nota" maxlength="200" placeholder="Ej. Llevo un paquete pequeño">' + fv('nota') + '</textarea></div>';
  h += '<button class="btn btn-gold" data-act="buscar"' + busyAttr() + '>Buscar mototaxi · ' + money(S.offer) + '</button></div></div>';
  return h;
}
function vBuscando() {
  const v = S.viaje || {};
  let h = '<div class="screen"><div class="top"><div class="row"><h1 class="h1">Ofertas recibidas</h1></div><div class="sub">Tu oferta: <span style="color:#C9A227;font-weight:800">' + money(v.oferta || S.offer) + '</span> hacia ' + esc(v.destino ? v.destino.texto : '') + '</div>' +
    '<div class="sub">' + (S.ofertas.length ? S.ofertas.length + (S.ofertas.length === 1 ? ' conductor respondió' : ' conductores respondieron') : 'Esperando respuesta de los conductores cercanos…') + '</div></div><div class="pad">' + errHTML();
  if (!S.ofertas.length) h += '<div class="card"><div class="spinner" aria-hidden="true"></div><div class="strong center">Enviamos tu solicitud a los conductores conectados.</div><div class="muted center">Las ofertas aparecen aquí a medida que llegan. Mantén esta pantalla abierta.</div></div>';
  S.ofertas.forEach(o => {
    const r = S.ratings[o.id];
    h += '<div class="card' + (o.precio === v.oferta ? ' sel' : '') + '"><div class="row"><div class="avatar">' + esc(initials(o.nombre)) + '</div><div class="col grow"><div class="strong">' + esc(o.nombre) + '</div><div class="muted small row" style="gap:6px;flex-wrap:wrap">' + ratingLine(r) + (o.distTxt ? ' · a ' + o.distTxt : '') + '</div></div>' +
      '<div class="col" style="align-items:flex-end"><div class="price">' + money(o.precio) + '</div>' + (o.precio === v.oferta ? '<span class="pill p-warn">Tu precio</span>' : '') + '</div></div>' +
      '<div class="muted">' + esc(o.moto) + ' ' + esc(o.color) + ' · Placa ' + esc(o.placa) + '</div>' +
      '<button class="btn btn-gold" data-act="accept" data-v="' + esc(o.id) + '" style="min-height:48px;font-size:15px"' + busyAttr() + '>Aceptar ' + money(o.precio) + '</button></div>';
  });
  return h + '<button class="link danger" data-act="cancelTrip" style="align-self:center"' + busyAttr() + '>Cancelar solicitud</button></div></div>';
}
function sosBlock() {
  if (S.sos === 'confirm') return '<div class="banner danger" role="alertdialog" aria-label="Confirmar alerta de pánico">' + I.shield + '<div class="grow col" style="gap:10px"><div class="strong">¿Activar la alerta de pánico?</div><div>Se registra una alerta con tu ubicación para el administrador de JNF Moto' + ((S.perfil.contactos || []).length ? ' y podrás avisar a tus contactos por WhatsApp' : '') + '.</div><div class="row"><button class="btn btn-danger btn-sm" data-act="sosSend" style="flex:1;min-height:44px">Activar alerta</button><button class="btn btn-ghost btn-sm" data-act="sosCancel" style="flex:1;min-height:44px">Cancelar</button></div></div></div>';
  if (S.sos === 'sent') {
    const loc = S.pos ? 'https://maps.google.com/?q=' + S.pos.lat + ',' + S.pos.lng : '';
    const txt = encodeURIComponent('Alerta JNF Moto: necesito ayuda durante un viaje en mototaxi.' + (loc ? ' Mi ubicación: ' + loc : ''));
    const btns = (S.perfil.contactos || []).map(c => '<a class="btn btn-danger btn-sm" style="width:100%;min-height:44px" target="_blank" rel="noopener" href="https://wa.me/57' + esc(c.telefono) + '?text=' + txt + '">Avisar a ' + esc(c.nombre) + ' por WhatsApp</a>').join('');
    return '<div class="banner danger" role="alert">' + I.shield + '<div class="grow col" style="gap:8px"><div><b>Alerta registrada.</b> El administrador de JNF Moto la ve en su panel.</div>' + btns + '</div></div>';
  }
  return '';
}
function vViaje() {
  const v = S.viaje || {}, c = v.conductor || {}, st = v.estado;
  const title = st === 'asignado' ? 'Tu conductor va en camino' : st === 'en_curso' ? 'Vas en camino a' : 'Estado del viaje';
  const km = distKm(S.drvPos, v.origen);
  const big = st === 'asignado' ? (km != null ? 'A ' + fmtDist(km) : 'Ubicando conductor…') : esc(v.destino ? v.destino.texto : '');
  let h = '<div class="screen"><div class="top" style="gap:10px"><div class="row between"><div class="col"><div class="sub">' + title + '</div><div class="h1" style="color:#C9A227" id="bigline">' + big + '</div></div><button class="sos" data-act="sos" aria-label="Botón de pánico">SOS</button></div></div>';
  h += '<div id="map" class="lmap tall" role="img" aria-label="Mapa del viaje"></div>';
  h += '<div class="sheet"><div class="handle"></div>' + sosBlock() + errHTML() + bannerHTML(S.banner);
  h += '<div class="row"><div class="avatar lg">' + esc(initials(c.nombre)) + '</div><div class="col grow"><div class="strong" style="font-size:16px">' + esc(c.nombre) + '</div><div class="muted">' + ratingLine(S.ratings[v.conductorId]) + '</div><div class="muted">' + esc(c.moto) + ' ' + esc(c.color) + '</div></div><div class="plate">' + esc(c.placa) + '</div></div>';
  h += S.cPhone ? '<a class="btn btn-ghost" href="tel:' + esc(S.cPhone) + '">' + I.phone + 'Llamar al conductor</a>' : '';
  h += '<div class="offerbox" style="gap:8px"><div class="row"><span class="dot"></span>' + esc(v.origen ? v.origen.texto : '') + '</div><div class="row"><span class="sq"></span>' + esc(v.destino ? v.destino.texto : '') + '</div><div class="row between" style="border-top:1px solid var(--line);padding-top:8px"><span class="muted">Efectivo</span><span class="strong">' + money(v.precioFinal || 0) + '</span></div></div>';
  if (st === 'asignado') h += '<button class="link danger" data-act="cancelTrip" style="align-self:center"' + busyAttr() + '>Cancelar viaje</button>';
  return h + '</div></div>';
}
function vCalificar() {
  const v = S.viaje || {}, c = v.conductor || {};
  let h = '<div class="screen"><div class="top" style="padding-bottom:22px">' + brandRow() + '<div class="sub">Viaje finalizado · ' + money(v.precioFinal || 0) + ' en efectivo</div><h1 class="h1">¿Cómo estuvo tu viaje?</h1></div><div class="pad">' + errHTML();
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
  h += '</div></div><div class="pad">' + bannerHTML(S.banner) + errHTML();
  if (st === 'ninguno') h += '<div class="card"><div class="h2">¿Tienes moto? Conduce con JNF Moto</div><div class="muted">Regístrate y el administrador verificará tus documentos en persona antes de habilitarte.</div><button class="btn btn-gold" data-act="go" data-v="registroC">Registrarme como conductor</button></div>';
  if (st === 'pendiente') h += '<div class="card"><div class="h2">Tu registro está en revisión</div><div class="muted">Lleva tu cédula, licencia A2, SOAT, técnico-mecánica (si aplica) y tarjeta de propiedad a la oficina de JNF S.A.S. Cuando el administrador te apruebe, esta opción se habilita sola.</div></div>';
  if (st === 'rechazado' || st === 'suspendido') h += '<div class="card"><div class="h2">Modo conductor no habilitado</div><div class="muted">Tu cuenta de conductor está ' + st + '. Comunícate con la oficina de JNF S.A.S.</div></div>';
  if (st === 'aprobado') h += '<div class="card"><div class="row between"><div class="h2">Modo conductor habilitado</div><span class="pill p-ok">Aprobado</span></div><div class="banner warn">' + I.info + '<div class="grow">En esta versión de prueba, tu ubicación se comparte solo mientras la app está abierta y estás conectado.</div></div>' + (pOn ? '<button class="btn btn-gold" data-act="modeC">Conectarme como conductor</button>' : '<button class="btn btn-ghost" data-act="modeP">Volver a modo pasajero</button>') + '</div>';
  const items = [['historial', 'Mis viajes'], ['contactos', 'Contactos de emergencia']];
  if (st === 'aprobado') items.push(['micalif', 'Mi calificación como conductor'], ['suscripcion', 'Mi suscripción']);
  if (S.admin) items.push(['admin', 'Panel de administración']);
  items.push(['ayuda', 'Ayuda y soporte'], ['terminos', 'Términos y tratamiento de datos']);
  h += '<nav aria-label="Opciones">' + items.map(it => '<button class="menuitem" data-act="go" data-v="' + it[0] + '">' + it[1] + I.chev + '</button>').join('') + '</nav>';
  return h + '<button class="link danger" data-act="logout" style="align-self:flex-start">Cerrar sesión</button></div><div class="demo">Versión de prueba</div></div>';
}
function vHistorial() {
  let h = '<div class="screen">' + subTop('Mis viajes') + '<div class="pad">' + errHTML();
  if (!S.hist) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
  if (!S.hist.length) h += '<div class="card"><div class="strong">Aún no tienes viajes.</div><div class="muted">Tus viajes aparecen aquí cuando terminas uno.</div><button class="btn btn-gold" data-act="modeP">Pedir un mototaxi</button></div>';
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
const vTexto = (t, b) => '<div class="screen">' + subTop(t) + '<div class="pad"><div class="card">' + b + '</div></div></div>';
function vRegistroC() {
  return '<div class="screen">' + subTop('Registro de conductor') + '<div class="pad">' + errHTML() + '<div class="muted">En la versión de prueba, los documentos se verifican en persona en la oficina de JNF S.A.S. Aquí solo registras los datos de tu moto.</div>' +
    '<div class="field"><label for="rm">Marca y referencia de la moto</label><input type="text" id="rm" data-in="moto" placeholder="Ej. Honda CB 125F" value="' + fv('moto') + '"></div>' +
    '<div class="field"><label for="rc">Color</label><input type="text" id="rc" data-in="color" placeholder="Ej. Negra" value="' + fv('color') + '"></div>' +
    '<div class="field"><label for="rp">Placa</label><input type="text" id="rp" data-in="placa" placeholder="Ej. ABC12D" autocapitalize="characters" value="' + fv('placa') + '"></div>' +
    '<div class="banner info">' + I.info + '<div class="grow">Documentos a presentar: cédula, licencia A2 vigente, SOAT vigente, técnico-mecánica (si aplica) y tarjeta de propiedad.</div></div>' +
    '<button class="btn btn-navy" data-act="saveConductor"' + busyAttr() + '>Enviar registro</button></div></div>';
}
/* ---------- pantallas: conductor ---------- */
function vSolicitudes() {
  const st = S.stats;
  let h = '<div class="screen"><div class="top"><div class="row between"><div class="row"><button class="iconbtn" data-act="go" data-v="menu" aria-label="Abrir menú">' + I.menu + '</button><div class="col"><div class="sub">Hola, ' + esc(S.perfil.nombre.split(' ')[0]) + '</div><h1 class="h1" style="white-space:nowrap">Solicitudes</h1></div></div>' +
    '<button class="toggle ' + (S.online ? 'on' : 'off') + '" data-act="online" aria-pressed="' + S.online + '">' + (S.online ? 'En línea' : 'Desconectado') + '<span class="knob"></span></button></div>' +
    '<div class="grid3"><div class="stat"><span class="k">Viajes hoy</span><span class="v">' + (st ? st.viajes : '…') + '</span></div><div class="stat"><span class="k">Ganado hoy</span><span class="v" style="color:#C9A227">' + (st ? money(st.ganado) : '…') + '</span></div><div class="stat"><span class="k">Calificación</span><span class="v">' + (S.ratings[S.user.uid] ? '★ ' + fmtRating(S.ratings[S.user.uid].avg) : '★ …') + '</span></div></div></div><div class="pad">' + errHTML() + bannerHTML(S.banner);
  if (!S.online) h += '<div class="card"><div class="strong">Estás desconectado.</div><div class="muted">Conéctate para recibir solicitudes de pasajeros. La app debe permanecer abierta.</div><button class="btn btn-gold" data-act="online">Conectarme</button></div>';
  else if (!S.requests.length) h += '<div class="card"><div class="spinner" aria-hidden="true"></div><div class="strong center">Buscando pasajeros…</div><div class="muted center">Las solicitudes aparecen aquí con un sonido. Puedes aceptar el precio o contraofertar.</div></div>';
  if (S.online) S.requests.forEach(r => {
    const o = S.cOtro[r.id] || {}, pr = S.ratings['p_' + r.pasajeroId], km = distKm(S.pos, r.origen);
    h += '<div class="card"><div class="row between" style="align-items:flex-start"><div class="col"><div class="strong">' + esc(r.pasajeroNombre) + ' <span class="muted" style="font-weight:500">' + (pr ? '★ ' + fmtRating(pr.avg) : '') + '</span></div><div class="muted small">' + (km != null ? 'A ' + fmtDist(km) + ' de ti' : 'Distancia no disponible') + '</div></div><div class="price">' + money(r.oferta) + '</div></div>' +
      '<div class="col" style="gap:6px"><div class="row"><span class="dot"></span>' + esc(r.origen.texto) + '</div><div class="row"><span class="sq"></span>' + esc(r.destino.texto) + '</div>' + (r.nota ? '<div class="muted small">Nota: ' + esc(r.nota) + '</div>' : '') + '</div>' +
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
  if (!e.perdida) h += '<div class="sub">Esperando que ' + esc(e.nombre) + ' acepte tu oferta de <span style="color:#C9A227;font-weight:800">' + money(e.precio) + '</span></div>';
  h += '</div><div class="pad">' + errHTML();
  if (e.perdida) return h + '<div class="card"><div class="strong">El pasajero eligió otra oferta o canceló la solicitud.</div><button class="btn btn-gold" data-act="backToRequests">Ver más solicitudes</button></div></div></div>';
  return h + '<div class="card"><div class="spinner" aria-hidden="true"></div><div class="row"><span class="dot"></span>' + esc(e.origen) + '</div><div class="row"><span class="sq"></span>' + esc(e.destino) + '</div></div><button class="btn btn-ghost" data-act="cWithdraw"' + busyAttr() + '>Retirar oferta</button></div></div>';
}
function vCViaje() {
  const v = S.viaje || {}, st = v.estado, o = v.origen || {}, target = st === 'asignado' ? o : null;
  const q = target && target.lat != null ? target.lat + ',' + target.lng : encodeURIComponent(st === 'asignado' ? o.texto : v.destino.texto);
  const waze = target && target.lat != null ? 'https://waze.com/ul?ll=' + q + '&navigate=yes' : 'https://waze.com/ul?q=' + q + '&navigate=yes';
  const gm = 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  let h = '<div class="screen"><div class="top" style="gap:10px"><div class="row between"><div class="col"><div class="sub">' + (st === 'asignado' ? 'Recoge a' : 'Lleva a') + '</div><div class="h1" style="color:#C9A227">' + esc(st === 'asignado' ? v.pasajeroNombre : v.destino.texto) + '</div></div><button class="sos" data-act="sos" aria-label="Botón de pánico">SOS</button></div></div>';
  h += '<div id="map" class="lmap" role="img" aria-label="Mapa del viaje"></div><div class="sheet"><div class="handle"></div>' + sosBlock() + errHTML() + bannerHTML(S.banner);
  h += '<div class="row"><div class="avatar">' + esc(initials(v.pasajeroNombre)) + '</div><div class="col grow"><div class="strong">' + esc(v.pasajeroNombre) + '</div><div class="muted small">' + (S.ratings['p_' + v.pasajeroId] ? '★ ' + fmtRating(S.ratings['p_' + v.pasajeroId].avg) + ' como pasajero' : 'Pasajero') + '</div></div><div class="col" style="align-items:flex-end"><span class="muted small">Cobrar en efectivo</span><span class="price">' + money(v.precioFinal || 0) + '</span></div></div>';
  h += '<div class="offerbox" style="gap:8px"><div class="row"><span class="dot"></span>' + esc(o.texto) + '</div><div class="row"><span class="sq"></span>' + esc(v.destino.texto) + '</div>' + (v.nota ? '<div class="muted small">Nota: ' + esc(v.nota) + '</div>' : '') + '</div>';
  h += '<div class="row"><a class="btn btn-ghost" style="flex:1" target="_blank" rel="noopener" href="' + waze + '">Navegar con Waze</a><a class="btn btn-ghost" style="flex:1" target="_blank" rel="noopener" href="' + gm + '">Google Maps</a></div>';
  if (S.pPhone) h += '<a class="btn btn-ghost" href="tel:' + esc(S.pPhone) + '">' + I.phone + 'Llamar al pasajero</a>';
  h += st === 'asignado' ? '<button class="btn btn-gold" data-act="cStart"' + busyAttr() + '>Recogí al pasajero</button><button class="link danger" data-act="cCancel" style="align-self:center"' + busyAttr() + '>Cancelar viaje</button>' : '<button class="btn btn-gold" data-act="cFinish"' + busyAttr() + '>Finalizar viaje</button>';
  return h + '</div></div>';
}
function vCCalificar() {
  const v = S.viaje || {};
  let h = '<div class="screen"><div class="top">' + brandRow() + '<div class="row between" style="align-items:flex-end"><div class="col"><div class="sub">Cobra al pasajero</div><div class="amount" style="color:#C9A227">' + money(v.precioFinal || 0) + '</div></div><div class="sub" style="text-align:right">Efectivo</div></div></div><div class="pad">' + errHTML();
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
    [['conductores', 'Conductores'], ['alertas', 'Alertas' + (A.alertas && A.alertas.length ? ' (' + A.alertas.length + ')' : '')], ['viajes', 'Viajes']].map(x => '<button data-act="admTab" data-v="' + x[0] + '" aria-current="' + (t === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  if (t === 'conductores') {
    const L = A.conductores; if (!L) return h + '<div class="spinner" role="status" aria-label="Cargando"></div></div></div>';
    const lab = { pendiente: ['p-warn', 'Pendiente'], aprobado: ['p-ok', 'Aprobado'], rechazado: ['p-danger', 'Rechazado'], suspendido: ['p-danger', 'Suspendido'] };
    if (!L.length) h += '<div class="card"><div class="muted">Aún no hay conductores registrados.</div></div>';
    L.slice().sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)).forEach(c => {
      const l = lab[c.estado] || ['p-info', c.estado];
      h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(c.nombre) + '</div><div class="muted small">' + esc(c.moto) + ' ' + esc(c.color) + ' · Placa ' + esc(c.placa) + '</div></div><span class="pill ' + l[0] + '">' + l[1] + '</span></div><div class="row">' +
        (c.estado !== 'aprobado' ? '<button class="btn btn-gold btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="aprobado"' + busyAttr() + '>Aprobar</button>' : '') +
        (c.estado === 'pendiente' ? '<button class="btn btn-ghost btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="rechazado"' + busyAttr() + '>Rechazar</button>' : '') +
        (c.estado === 'aprobado' ? '<button class="btn btn-ghost btn-sm" style="flex:1" data-act="admSet" data-v="' + c.id + '" data-p="suspendido"' + busyAttr() + '>Suspender</button>' : '') + '</div></div>';
    });
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
    L.forEach(v => { h += '<div class="card"><div class="row between"><div class="col"><div class="strong">' + esc(v.pasajeroNombre) + ' → ' + esc(v.destino.texto) + '</div><div class="muted small">' + (v.conductor ? 'Conductor: ' + esc(v.conductor.nombre) + ' · ' : '') + new Date(tsMs(v.creado)).toLocaleString('es-CO') + '</div></div><div class="col" style="align-items:flex-end"><span class="strong">' + money(v.precioFinal || v.oferta) + '</span><span class="pill p-info">' + esc(v.estado) + '</span></div></div></div>'; });
  }
  return h + '</div></div>';
}
function vSinConexion() { return '<div class="screen"><div class="pad" style="flex:1;justify-content:center"><img src="' + LOGO + '" alt="Logo JNF S.A.S." style="width:88px;height:88px;align-self:center"><div class="card"><div class="h2">No pudimos conectar con el servidor</div><div class="muted">' + esc(S.connErr || '') + '</div><button class="btn btn-gold" data-act="retryLogin">Reintentar</button><button class="link" data-act="logout" style="align-self:center">Cerrar sesión</button></div></div></div>'; }
const V = {
  sinConexion: vSinConexion,
  cargando: vCargando, login: vLogin, onboarding: vOnboarding, home: vHome, buscando: vBuscando, viaje: vViaje, calificar: vCalificar,
  menu: vMenu, historial: vHistorial, contactos: vContactos, registroC: vRegistroC, solicitudes: vSolicitudes, espera: vEspera, cviaje: vCViaje,
  ccalificar: vCCalificar, micalif: vMiCalif, admin: vAdmin,
  suscripcion: () => vTexto('Mi suscripción', '<div class="row between"><div class="h2">Periodo de prueba</div><span class="pill p-ok">Activa</span></div><div class="muted">Durante la prueba no se cobra la cuota. La cuota semanal y las formas de pago (Nequi, Daviplata, PSE o efectivo en oficina) se definen al terminar la prueba.</div>'),
  ayuda: () => vTexto('Ayuda y soporte', '<div class="h2">¿Necesitas ayuda?</div><div class="muted">Comunícate con Asesorías y Consultorías JNF S.A.S. al [número de soporte].</div>'),
  terminos: () => vTexto('Términos y tratamiento de datos', '<div class="muted">Asesorías y Consultorías JNF S.A.S. trata tus datos personales (nombre, celular y ubicación durante los viajes) conforme a la Ley 1581 de 2012, únicamente para prestar el servicio de la app.</div><div class="muted">[Texto completo de la política de tratamiento de datos]</div>')
};

/* ---------- mapa (Leaflet + OpenStreetMap) ---------- */
function mountMap() {
  const el = document.getElementById('map'); if (!el || !window.L) return;
  const L = window.L; mk = {};
  const v = S.viaje, center = (S.screen === 'home' ? S.pos : (v && v.origen && v.origen.lat != null ? v.origen : S.pos)) || null;
  if (!center) { el.outerHTML = ''; return; }
  map = L.map(el, { zoomControl: true, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false }).setView([center.lat, center.lng], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const dot = (color, r) => ({ radius: r, color: '#FFFFFF', weight: 3, fillColor: color, fillOpacity: 1 });
  if (S.screen === 'home') mk.me = L.circleMarker([center.lat, center.lng], dot('#1A2580', 9)).addTo(map);
  else {
    if (v && v.origen && v.origen.lat != null) mk.origen = L.circleMarker([v.origen.lat, v.origen.lng], dot('#1A2580', 9)).addTo(map).bindTooltip('Recogida');
    const d = S.screen === 'cviaje' ? S.pos : S.drvPos;
    if (d) mk.moto = L.circleMarker([d.lat, d.lng], dot('#C9A227', 11)).addTo(map).bindTooltip(S.screen === 'cviaje' ? 'Tú' : 'Conductor');
    fitMap();
  }
}
function fitMap() { if (!map || !window.L) return; const pts = []; if (mk.origen) pts.push(mk.origen.getLatLng()); if (mk.moto) pts.push(mk.moto.getLatLng()); if (pts.length === 2) map.fitBounds(window.L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17, animate: false }); }
function moveMoto(p) {
  if (!map || !p || !window.L || !document.getElementById('map')) return;
  if (mk.moto) mk.moto.setLatLng([p.lat, p.lng]); else mk.moto = window.L.circleMarker([p.lat, p.lng], { radius: 11, color: '#FFFFFF', weight: 3, fillColor: '#C9A227', fillOpacity: 1 }).addTo(map);
  fitMap();
}

/* ---------- render y navegación ---------- */
function render() {
  if (map) { try { map.remove(); } catch (e) { } map = null; }
  appEl.innerHTML = V[S.screen]();
  mountMap();
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
function startWatch() {
  if (watchId != null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(p => {
    S.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    const now = Date.now();
    if (S.online && now - lastPush > 10000) { lastPush = now; set(ref(rtdb, 'ubicaciones/' + S.user.uid), { lat: S.pos.lat, lng: S.pos.lng, ts: rtdbTime() }).catch(() => { }); }
    if (S.screen === 'cviaje') moveMoto(S.pos);
  }, () => { }, { enableHighAccuracy: true, maximumAge: 10000 });
  try { onDisconnect(ref(rtdb, 'ubicaciones/' + S.user.uid)).remove(); } catch (e) { }
}
function stopWatch() {
  if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null; lastPush = 0;
  return S.user ? remove(ref(rtdb, 'ubicaciones/' + S.user.uid)).catch(() => { }) : Promise.resolve();
}
function beep() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.35); } catch (e) { }
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
  if (s === 'home') getGps();
  if (s === 'buscando') {
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      if (!d.exists()) return; S.viaje = Object.assign({ id: d.id }, d.data());
      if (S.viaje.estado === 'asignado') { go('viaje'); return; }
      if (S.viaje.estado === 'cancelado') { S.banner = { kind: 'info', text: 'Cancelaste la solicitud.' }; S.viajeId = null; go('home'); return; }
    }, fail));
    addSub(onSnapshot(collection(db, 'viajes', S.viajeId, 'ofertas'), qs => {
      S.ofertas = qs.docs.map(d => { const o = Object.assign({ id: d.id }, d.data()); const km = distKm(S.viaje && S.viaje.origen, o.lat != null ? o : null); o.distTxt = km != null ? fmtDist(km) : ''; return o; }).sort((a, b) => a.precio - b.precio);
      S.ofertas.forEach(o => { if (!S.ratings[o.id]) loadRating(o.id, ['conductores', o.id, 'calificaciones']).then(() => { if (S.screen === 'buscando') render(); }); });
      if (S.screen === 'buscando') render();
    }, fail));
  }
  if (s === 'viaje') {
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      const prev = S.viaje && S.viaje.estado; S.viaje = Object.assign({ id: d.id }, d.data());
      const st = S.viaje.estado;
      if (st === 'finalizado') { S.rating = 5; S.chips = {}; S.f.comentario = ''; go('calificar'); return; }
      if (st === 'cancelado') { S.banner = { kind: 'warn', text: S.viaje.canceladoPor === S.user.uid ? 'Cancelaste el viaje.' : 'El conductor canceló el viaje. Puedes pedir otro.' }; S.viajeId = null; S.viaje = null; go('home'); return; }
      if (prev !== st) render();
    }, fail));
    addSub(onValue(ref(rtdb, 'ubicaciones/' + S.viaje.conductorId), snap => {
      const p = snap.val(); if (!p) return; S.drvPos = { lat: p.lat, lng: p.lng }; moveMoto(S.drvPos);
      const el = document.getElementById('bigline'); if (el && S.viaje && S.viaje.estado === 'asignado') { const km = distKm(S.drvPos, S.viaje.origen); if (km != null) el.textContent = 'A ' + fmtDist(km); }
    }));
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId, 'privado', S.viaje.conductorId), d => { if (d.exists()) { S.cPhone = d.data().telefono; render(); } }, () => { }));
    loadRating(S.viaje.conductorId, ['conductores', S.viaje.conductorId, 'calificaciones']).then(() => { if (S.screen === 'viaje') render(); });
    getGps();
  }
  if (s === 'solicitudes') {
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
    setDoc(doc(db, 'viajes', S.viajeId, 'privado', S.user.uid), { telefono: S.perfil.telefono, nombre: S.perfil.nombre }).catch(() => { });
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId), d => {
      const prev = S.viaje && S.viaje.estado; S.viaje = Object.assign({ id: d.id }, d.data());
      if (S.viaje.estado === 'cancelado') { S.banner = { kind: 'warn', text: S.viaje.canceladoPor === S.user.uid ? 'Cancelaste el viaje.' : 'El pasajero canceló el viaje.' }; S.viajeId = null; go('solicitudes'); return; }
      if (S.viaje.estado === 'finalizado') { S.rating = 5; S.chips = {}; go('ccalificar'); return; }
      if (prev !== S.viaje.estado) render();
    }, fail));
    addSub(onSnapshot(doc(db, 'viajes', S.viajeId, 'privado', S.viaje.pasajeroId), d => { if (d.exists()) { S.pPhone = d.data().telefono; render(); } }, () => { }));
    loadRating('p_' + S.viaje.pasajeroId, ['usuarios', S.viaje.pasajeroId, 'calificaciones']).then(() => { if (S.screen === 'cviaje') render(); });
    startWatch();
  }
  if (s === 'micalif') { S.cal = null; delete S.ratings[S.user.uid]; loadRating(S.user.uid, ['conductores', S.user.uid, 'calificaciones']).then(r => { S.cal = r || { n: 0 }; if (S.screen === 'micalif') render(); }); }
  if (s === 'historial') {
    S.hist = null;
    Promise.all([getDocs(query(collection(db, 'viajes'), where('pasajeroId', '==', S.user.uid), limit(50))),
      S.conductor && S.conductor.estado === 'aprobado' ? getDocs(query(collection(db, 'viajes'), where('conductorId', '==', S.user.uid), limit(50))) : Promise.resolve({ docs: [] })])
      .then(([a, b]) => { S.hist = a.docs.map(d => Object.assign({ id: d.id, _rol: 'pasajero' }, d.data())).concat(b.docs.map(d => Object.assign({ id: d.id, _rol: 'conductor' }, d.data()))).sort((x, y) => tsMs(y.creado) - tsMs(x.creado)); if (S.screen === 'historial') render(); })
      .catch(fail);
  }
  if (s === 'admin') {
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
    const pv = await findActive('pasajeroId', user.uid, ['buscando', 'asignado', 'en_curso']);
    if (pv) { S.viajeId = pv.id; S.viaje = pv; S.mode = 'pasajero'; go(pv.estado === 'buscando' ? 'buscando' : 'viaje'); return; }
    const cond = await getDoc(doc(db, 'conductores', user.uid));
    if (cond.exists() && cond.data().estado === 'aprobado') {
      const cv = await findActive('conductorId', user.uid, ['asignado', 'en_curso']);
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
appEl.addEventListener('change', e => { const k = e.target.getAttribute('data-in'); if (k && e.target.type === 'checkbox') S.f[k] = e.target.checked; });

async function act(a, v, b) {
  const uid = S.user && S.user.uid;
  switch (a) {
    case 'go':
      if (v === 'contactos') { S.f.cNombre = ''; S.f.cTel = ''; S.f.cErr = ''; }
      go(v); break;
    case 'retryLogin': go('cargando'); afterLogin(S.user); break;
    case 'closeBanner': S.banner = null; render(); break;
    case 'closeErr': S.err = null; render(); break;
    case 'toggleCrear': S.f.modoCrear = !S.f.modoCrear; S.err = null; render(); break;
    case 'google': S.busy = true; S.err = null; render(); try { await signInWithPopup(auth, new GoogleAuthProvider()); S.busy = false; } catch (e) { fail(e); } break;
    case 'signin': case 'signup': {
      const em = (S.f.email || '').trim(), pw = S.f.pass || '';
      if (!em || !pw) { S.err = 'Escribe tu correo y tu contraseña.'; render(); break; }
      S.busy = true; S.err = null; render();
      try { if (a === 'signup') await createUserWithEmailAndPassword(auth, em, pw); else await signInWithEmailAndPassword(auth, em, pw); S.busy = false; S.f.pass = ''; } catch (e) { fail(e); }
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
    case 'freq': S.f.destino = v; S.err = null; render(); break;
    case 'minus': S.offer = Math.max(MIN, S.offer - 500); render(); break;
    case 'plus': S.offer += 500; render(); break;
    case 'otroToggle': S.otroOpen = !S.otroOpen; S.f.otroErr = ''; render(); break;
    case 'otroUse': { const n = parseMoney(S.f.otroVal), er = validAmount(n); if (er) { S.f.otroErr = er; render(); break; } S.offer = n; S.otroOpen = false; S.f.otroVal = ''; S.f.otroErr = ''; render(); break; }
    case 'notaToggle': S.notaOpen = !S.notaOpen; render(); break;
    case 'buscar': {
      const dest = (S.f.destino || '').trim(), refTxt = (S.f.ref || '').trim();
      if (dest.length < 2) { S.err = 'Escribe o elige el destino del viaje.'; render(); break; }
      if (!S.pos && refTxt.length < 3) { S.err = 'Sin GPS necesitamos una referencia del punto de recogida.'; render(); break; }
      S.busy = true; S.err = null; S.banner = null; render();
      try {
        const data = { pasajeroId: uid, pasajeroNombre: S.perfil.nombre, origen: { texto: refTxt || 'Ubicación GPS', lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null }, destino: { texto: dest }, oferta: S.offer, nota: S.notaOpen ? (S.f.nota || '').trim().slice(0, 200) : '', estado: 'buscando', creado: serverTimestamp(), conductorId: null, precioFinal: null, conductor: null };
        const r = await addDoc(collection(db, 'viajes'), data);
        await setDoc(doc(db, 'viajes', r.id, 'privado', uid), { telefono: S.perfil.telefono, nombre: S.perfil.nombre });
        S.viajeId = r.id; S.viaje = Object.assign({ id: r.id }, data); S.ofertas = []; S.busy = false; go('buscando');
      } catch (e) { fail(e); }
      break;
    }
    case 'cancelTrip':
      S.busy = true; render();
      try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid }); S.busy = false; } catch (e) { fail(e); }
      break;
    case 'accept':
      S.busy = true; render();
      try {
        await runTransaction(db, async tx => {
          const vref = doc(db, 'viajes', S.viajeId), oref = doc(db, 'viajes', S.viajeId, 'ofertas', v);
          const vs = await tx.get(vref), os = await tx.get(oref);
          if (!vs.exists() || vs.data().estado !== 'buscando') throw new Error('Esta solicitud ya no está disponible.');
          if (!os.exists()) throw new Error('El conductor retiró su oferta. Elige otra.');
          const o = os.data();
          tx.update(vref, { estado: 'asignado', conductorId: v, precioFinal: o.precio, conductor: { nombre: o.nombre, moto: o.moto, color: o.color, placa: o.placa }, asignadoEn: serverTimestamp() });
        });
        S.busy = false;
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
    case 'delContact': {
      const cs = (S.perfil.contactos || []).filter((c, i) => i !== +v);
      try { await updateDoc(doc(db, 'usuarios', uid), { contactos: cs }); S.perfil.contactos = cs; render(); } catch (e) { fail(e); }
      break;
    }
    case 'saveConductor': {
      const moto = (S.f.moto || '').trim(), color = (S.f.color || '').trim(), placa = (S.f.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (moto.length < 2) { S.err = 'Escribe la marca y referencia de la moto.'; render(); break; }
      if (color.length < 2) { S.err = 'Escribe el color de la moto.'; render(); break; }
      if (!/^[A-Z]{3}[0-9]{2}[A-Z]?$/.test(placa)) { S.err = 'La placa debe tener el formato ABC12D (tres letras, dos números y una letra).'; render(); break; }
      S.busy = true; render();
      try { await setDoc(doc(db, 'conductores', uid), { nombre: S.perfil.nombre, moto, color, placa, estado: 'pendiente', creado: serverTimestamp() }); S.busy = false; S.banner = { kind: 'info', text: 'Registro enviado. Lleva tus documentos a la oficina de JNF S.A.S. para la verificación.' }; go('menu'); } catch (e) { fail(e); }
      break;
    }
    case 'online':
      S.online = !S.online;
      if (S.online) { beepUnlock(); go('solicitudes'); } else { S.requests = []; stopWatch(); go('solicitudes'); }
      break;
    case 'cIgnore': S.ignored[v] = true; S.requests = S.requests.filter(r => r.id !== v); render(); break;
    case 'cOtroToggle': { const cur = S.cOtro[v] || {}; S.cOtro[v] = { open: !cur.open, val: cur.val || '', err: '' }; render(); break; }
    case 'cOffer': case 'cOtroSend': {
      const r = S.requests.find(x => x.id === v); if (!r) break;
      let price = +(b.getAttribute('data-p') || 0);
      if (a === 'cOtroSend') { const o = S.cOtro[v] || {}; const n = parseMoney(o.val), er = validAmount(n); if (er) { S.cOtro[v] = { open: true, val: o.val, err: er }; render(); break; } price = n; }
      S.busy = true; render();
      try {
        await setDoc(doc(db, 'viajes', v, 'ofertas', uid), { conductorId: uid, nombre: S.conductor.nombre, moto: S.conductor.moto, color: S.conductor.color, placa: S.conductor.placa, precio: price, creado: serverTimestamp(), lat: S.pos ? S.pos.lat : null, lng: S.pos ? S.pos.lng : null });
        S.busy = false; S.espera = { viajeId: v, nombre: r.pasajeroNombre, precio: price, origen: r.origen.texto, destino: r.destino.texto }; go('espera');
      } catch (e) { fail(e); }
      break;
    }
    case 'cWithdraw':
      try { await deleteDoc(doc(db, 'viajes', S.espera.viajeId, 'ofertas', uid)); } catch (e) { }
      S.espera = null; go('solicitudes'); break;
    case 'backToRequests': S.espera = null; go('solicitudes'); break;
    case 'cStart': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'en_curso', iniciadoEn: serverTimestamp() }); S.busy = false; } catch (e) { fail(e); } break;
    case 'cFinish': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'finalizado', finalizadoEn: serverTimestamp() }); S.busy = false; } catch (e) { fail(e); } break;
    case 'cCancel': S.busy = true; render(); try { await updateDoc(doc(db, 'viajes', S.viajeId), { estado: 'cancelado', canceladoEn: serverTimestamp(), canceladoPor: uid }); S.busy = false; } catch (e) { fail(e); } break;
    case 'cSendRating':
      S.busy = true; render();
      try { await setDoc(doc(db, 'usuarios', S.viaje.pasajeroId, 'calificaciones', S.viaje.id), { estrellas: S.rating, aspectos: Object.keys(S.chips).filter(k => S.chips[k]), creado: serverTimestamp() }); S.busy = false; endDriverTrip(); } catch (e) { fail(e); }
      break;
    case 'cSkipRating': endDriverTrip(); break;
    case 'admTab': S.admTab = v; render(); break;
    case 'admSet': S.busy = true; render(); try { await updateDoc(doc(db, 'conductores', v), { estado: b.getAttribute('data-p') }); S.busy = false; render(); } catch (e) { fail(e); } break;
    case 'admAlert': S.busy = true; render(); try { await updateDoc(doc(db, 'alertas', v), { estado: 'atendida' }); S.busy = false; render(); } catch (e) { fail(e); } break;
  }
}
function beepUnlock() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { } }
function endPassengerTrip() { S.viajeId = null; S.viaje = null; S.ofertas = []; S.sos = null; S.cPhone = null; S.drvPos = null; S.offer = MIN; S.f.destino = ''; S.f.ref = ''; S.f.nota = ''; S.notaOpen = false; go('home'); }
function endDriverTrip() { S.viajeId = null; S.viaje = null; S.sos = null; S.pPhone = null; S.stats = null; S.banner = { kind: 'ok', text: 'Viaje finalizado. Sigues conectado.' }; go('solicitudes'); }
appEl.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; act(b.getAttribute('data-act'), b.getAttribute('data-v'), b); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
