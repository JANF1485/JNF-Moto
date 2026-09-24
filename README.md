# JNF Moto — versión de prueba

App web instalable (PWA) de Asesorías y Consultorías JNF S.A.S. para solicitar mototaxi con precio acordado entre pasajero y conductor.

- Publicación: GitHub Pages (`https://janf1485.github.io/jnf-moto/`)
- Backend: Firebase, proyecto `jnf-moto` (plan Spark)
- Mapa: OpenStreetMap (Leaflet)
- Tarifa mínima: $2.000, múltiplos de $100, sin tope

Las reglas de seguridad (`firestore.rules` y `database.rules.json`) se publican desde la consola de Firebase; tenerlas aquí es solo para control de versiones.

Al publicar cambios, subir el número de versión en `index.html` (`app.js?v=1` → `app.js?v=2`).
