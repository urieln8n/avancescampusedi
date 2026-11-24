# Avancés Campus · web + presupuesto online + tablero del taller

Web de una página para Avancés Campus (avancés, sobreavances y cocinas para caravana, Barcelona).

- `public/` — la web (HTML, CSS y JS sin dependencias).
  - Portada, productos, trabajos, 13 reseñas reales y presupuesto paso a paso que se envía por WhatsApp.
  - `/#taller`: tablero de pedidos para el taller (PIN inicial 1234). Los pedidos se guardan en el navegador del taller.
- `wrangler.jsonc` — configuración para publicarla en Cloudflare Workers como web estática.

## Publicar en Cloudflare
1. Cloudflare → Workers & Pages → Create → Import a repository → `avancescampusedi`.
2. Deploy command: `npx wrangler deploy` (sin build command).
3. Settings → Domains & Routes → Add → Custom domain → `avancescampus.andresrendon.com`.

Hecho por Andrés AI Studio.
