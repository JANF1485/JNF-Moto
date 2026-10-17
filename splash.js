// Motocaimán — © 2026 Asesorías y Consultorías JNF S.A.S. (NIT 901.904.435-9). Todos los derechos reservados.
// Pantalla de entrada: el logo de JNF aparece por capas de color (anillo dorado, fondo azul, espiral bronce, disco blanco y letras).
// Al terminar, la imagen de Motocaimán ocupa la pantalla mientras la app termina de cargar (mínimo 1,5 s, máximo 8 s).
// Se muestra una vez por sesión, se salta tocando la pantalla y no se usa si el celular pide reducir el movimiento.
(function () {
  var root = document.getElementById('splash'), s2 = document.getElementById('splash2');
  if (!root) return;
  function quitar() { try { root.parentNode && root.parentNode.removeChild(root); } catch (e) {} }
  function quitar2() { try { s2 && s2.parentNode && s2.parentNode.removeChild(s2); } catch (e) {} }
  var listoApp = false, s2desde = 0, s2cerrado = false;
  window.__mcListo = function () { listoApp = true; cerrar2(); };
  function cerrar2(forzar) {
    if (!s2 || !s2desde || s2cerrado) return;
    var falta = forzar ? 0 : 1500 - (Date.now() - s2desde);
    if (!forzar && !listoApp) return;
    setTimeout(function () {
      if (s2cerrado) return; s2cerrado = true;
      try { var t = s2.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' }); t.onfinish = quitar2; } catch (e) { quitar2(); }
      setTimeout(quitar2, 900);
    }, Math.max(0, falta));
  }
  function mostrar2(rapido) {
    if (!s2) { quitar(); return; }
    s2.style.display = 'flex'; s2desde = Date.now();
    try { var t = s2.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rapido ? 160 : 420, fill: 'forwards' }); t.onfinish = function () { quitar(); cerrar2(); }; } catch (e) { quitar(); }
    setTimeout(quitar, 1200);
    setTimeout(function () { cerrar2(true); }, 8000); // tope: nunca se queda atascada
  }
  var omitir = false;
  try {
    omitir = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || navigator.webdriver === true ||
      /nosplash/.test(location.hash + location.search) || sessionStorage.getItem('mc_splash') === '1';
  } catch (e) {}
  if (omitir || !root.animate) { quitar(); quitar2(); return; }
  try { sessionStorage.setItem('mc_splash', '1'); } catch (e) {}

  var capas = [1, 2, 3, 4, 5].map(function (n) { return root.querySelector('.sp-l' + n); });
  var glow = root.querySelector('.sp-glow'), shine = root.querySelector('.sp-shine'), word = root.querySelector('.sp-word');
  var conic = !!(window.CSS && typeof CSS.registerProperty === 'function');
  var run = [], fin = false, M = 0.8;
  function A(e, kf, o) { var a = e.animate(kf, o); run.push(a); return a; }
  function mask(e, deg) { var g = 'conic-gradient(from ' + (deg || 0) + 'deg,#000 var(--a),transparent calc(var(--a) + .5deg))'; e.style.webkitMaskImage = g; e.style.maskImage = g; }
  function unmask(e) { e.style.webkitMaskImage = ''; e.style.maskImage = ''; }
  function barrer(e, delay, dur, from) {
    A(e, [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1 }], { duration: dur, delay: delay, fill: 'forwards' });
    if (!conic) return;
    mask(e, from);
    var a = A(e, [{ '--a': '0deg' }, { '--a': '360deg' }], { duration: dur, delay: delay, fill: 'both', easing: 'cubic-bezier(.45,.05,.2,1)' });
    a.onfinish = function () { unmask(e); };
  }
  function cerrar(rapido) {
    if (fin) return; fin = true;
    mostrar2(rapido);
  }
  function jugar() {
    root.style.display = 'flex';
    barrer(capas[0], 0, 900 * M, 0);
    A(capas[1], [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700 * M, delay: 750 * M, fill: 'forwards', easing: 'cubic-bezier(.2,.9,.25,1)' });
    barrer(capas[2], 1400 * M, 950 * M, 180);
    A(capas[3], [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.08)', offset: .65 }, { opacity: 1, transform: 'scale(1)' }], { duration: 620 * M, delay: 2250 * M, fill: 'forwards', easing: 'ease-out' });
    A(capas[4], [{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520 * M, delay: 2700 * M, fill: 'forwards', easing: 'cubic-bezier(.2,.9,.25,1)' });
    A(glow, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }, { opacity: .35, transform: 'scale(1.06)' }], { duration: 900 * M, delay: 2900 * M, fill: 'forwards', easing: 'ease-out' });
    A(shine, [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: 800 * M, delay: 3150 * M, fill: 'forwards' });
    try { run.push(shine.animate([{ left: '-50%' }, { left: '125%' }], { duration: 800 * M, delay: 3150 * M, fill: 'both', easing: 'ease-in-out', pseudoElement: '::after' })); } catch (e) {}
    var w = A(word, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520 * M, delay: 3250 * M, fill: 'forwards', easing: 'ease-out' });
    w.onfinish = function () { setTimeout(function () { cerrar(false); }, 450); };
  }
  root.addEventListener('click', function () { cerrar(true); });
  if (s2) s2.addEventListener('click', function () { if (listoApp) cerrar2(true); });
  try { var pre = new Image(); pre.src = 'banner-motocaiman.jpg'; } catch (e) {}
  setTimeout(function () { quitar(); cerrar2(true); }, 20000); // tope general
  // espera a que carguen las capas para que el anillo no aparezca tarde
  var n = 0, ya = false;
  function listo() { if (ya) return; ya = true; jugar(); }
  ['1', '2', '3', '4', '5'].forEach(function (k) { var im = new Image(); im.onload = im.onerror = function () { if (++n === 5) listo(); }; im.src = 'splash-' + k + '.png'; });
  setTimeout(listo, 900);
})();
