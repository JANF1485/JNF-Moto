# Motocaimán — versión 1.0

App web instalable (PWA) de Asesorías y Consultorías JNF S.A.S. para solicitar mototour con precio acordado entre pasajero y conductor.

- Publicación: GitHub Pages (`https://janf1485.github.io/JNF-Moto/`)
- Backend: Firebase, proyecto `jnf-moto` (plan Spark)
- Mapa: OpenStreetMap (Leaflet)
- Tarifa mínima: $2.000, múltiplos de $100, sin tope

Las reglas de seguridad (`firestore.rules` y `database.rules.json`) se publican desde la consola de Firebase; tenerlas aquí es solo para control de versiones.

Al publicar cambios, subir el número de versión en `index.html` (`app.js?v=1` → `app.js?v=2`).

## Máscaras de temporada (v13)

Panel de administración → **Máscaras**: adjuntar una imagen, elegir una de las 4 opciones (A insignia y aviso, B franja, C aviso destacado, D colores de la temporada), nombre, mensaje y fechas.

- Datos en `mascaras/{id}` e imagen en `mascaras/{id}/img/data` (lectura pública, escritura solo administrador).
- Solo una máscara activa a la vez. Una programada, mientras esté en sus fechas, se muestra en lugar de la activa.
- Se ve en el ingreso, el inicio del pasajero y las solicitudes del conductor (la opción D cambia los colores de toda la app, menos el panel).

## Notificaciones push (v18)

- La app guarda la suscripción de cada celular en `push/{uid}`; solo un conductor aprobado puede quedar "en línea".
- El servidor de avisos (`worker.js`, Cloudflare Workers, plan gratuito) envía las notificaciones con Web Push (VAPID). Lee Firestore con una cuenta robot registrada en `bots/{uid}` y verifica cada evento antes de avisar; `avisos/{id}` evita repetidos.
- La dirección del servidor se configura en el panel → Notificaciones (se guarda en `config/app`).

## Envíos y documento de identidad (interno 24, sigue siendo versión 1.0)

- **Envíos:** el usuario elige "Viaje | Envío". El envío guarda `tipo: 'envio'` y `envio: { contenido, desc, pagaRecibe }` en `viajes/{id}`. Quien recibe va en `viajes/{id}/entrega/recibe` (lo ve el conductor asignado). El código de 4 dígitos va en `entrega/codigo` y solo lo ve quien envía. Las reglas exigen ese código para cerrar el envío, sea entregado o devuelto.
- **Conductores:** solo reciben envíos si activan "Acepto envíos" (`conductores/{id}.envios`, copiado en `push/{id}.envios` para el servidor de avisos).
- **Devolución:** el conductor la marca con un motivo (`devolucion`, `devolucionMotivo`), y quien envía confirma con el mismo código.
- **Documento de identidad:** el tipo (CC, CE, PPT, PA) va en `conductores/{id}.idTipo`, el número en `privado/datos.idNumero`, y las fotos en `documentos/id1` (frente o página de datos) e `id2` (reverso; no aplica a pasaporte). Un conductor ya aprobado puede subir una sola vez la foto que le falte; el número solo lo cambia el administrador.
- **Orden de publicación:** 1) reglas de Firestore, 2) `app.js`, `index.html` y `sw.js` en GitHub, 3) `worker.js` en Cloudflare.

## Entrada animada (interno 26, sigue siendo versión 1.0)
- Al abrir la app, el logo de JNF aparece por capas de color: anillo dorado, fondo azul, espiral bronce, disco blanco y letras JNF, y luego el nombre Motocaimán. Dura unos 3 segundos.
- Se muestra una vez por sesión, se salta tocando la pantalla y no se usa si el celular tiene activado reducir movimiento.
- Archivos nuevos que hay que subir junto con los demás: `splash.js` y `splash-1.png` a `splash-5.png`.
- Si se quiere desactivar, basta quitar `<script src="splash.js"></script>` de `index.html`.

## Imagen oficial e ícono (interno 27)
- `banner-motocaiman.jpg`: imagen oficial, se muestra en la pantalla de ingreso.
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`: nuevo ícono de la app (instalación, pantalla de inicio y notificaciones).
- `logo-jnf.png`: logo de JNF S.A.S. (antes era `icon-192.png`); sigue en los encabezados de la app.
- La app sigue mostrando «Versión 1.0».

## Entrada con imagen y aviso de actualización (interno 28)
- Al abrir: primero el logo de JNF por capas de color y luego la imagen de Motocaimán a pantalla completa (fondo difuminado) con «Entrando…» hasta que la app esté lista (mínimo 1,5 s, máximo 8 s).
- Aviso de versión nueva: la app consulta `version.json` al abrirse, al volver a primer plano y cada 10 minutos. Si el número no coincide con el de la app, muestra «Hay una versión nueva de Motocaimán» con los botones Actualizar y Luego.
- **En cada actualización futura:** subir `version.json` con un número mayor y cambiar `APP_VERSION` en `app.js` al mismo número (además de `CACHE` en `sw.js` y `?v=` en `index.html`). Si `version.json` no cambia, los celulares no avisan.
- La app sigue mostrando «Versión 1.0».

## Logo en encabezados y ingreso fijo (interno 29)
- `logo-motocaiman.png`: palabra «Motocaimán» (recortada de la imagen oficial, fondo transparente). Reemplaza al texto en los encabezados de la app, el menú y el panel de administración.
- Pantalla de ingreso: la imagen de Motocaimán queda fija arriba (más pequeña) y solo se desplaza lo que está debajo, desde la franja de los 400 años. Al tocar un campo para escribir, la imagen se suelta para dejar espacio al teclado.
- La app sigue mostrando «Versión 1.0».
