# El club clandestino

Juego de fiesta semicooperativo para 3 a 8 jugadores. Seis semanas de fiestas secretas: cada uno aporta cartas en privado para ganar alegría, pero las fiestas grandes hacen ruido y la sospecha sube. Cualquiera puede ir en secreto a dar un soplo a la policía.

🔗 **Jugar ahora:** https://adrianezd.github.io/el-club-clandestino/

## Dos modos

- **Mismo móvil:** el móvil se pasa de mano en mano para las fases secretas y hace de narrador. Funciona sin conexión.
- **Con código de sala:** uno crea la sala y elige los ajustes; el resto entra con el código y cada uno juega en su móvil. Los móviles se comunican por [ntfy.sh](https://ntfy.sh) (sin cuentas), así que hace falta internet.

## Reglas

- Si el club aguanta seis semanas, gana quien tenga más alegría.
- Si la sospecha llega a 15, hay redada y gana el chivato con más soplos.
- Acusar a alguien que dio algún soplo lo expulsa; acusar a un inocente sube la sospecha.

## Stack técnico

Sitio estático sin dependencias ni build: HTML, CSS y JavaScript vanilla servidos por GitHub Pages.

- `script.js`: el juego. Un único motor (`act`, `privateTurn`, `render`) para los dos modos.
- `mesa.js`: modo «Mismo móvil», igual en los juegos de fiesta por fases.
- `sala.js` y `sala.css`: modo con código de sala, iguales en todos los juegos de fiesta.
- `kit.js` y `style.css`: piezas y estilos comunes. `juego.css`: lo propio de este juego.
- `sw.js`: caché para jugar sin conexión.

## Aviso

Juego de fiesta **original**, no afiliado a ninguna marca, producto o juego comercial.
