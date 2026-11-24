// Avancés Campus · API del panel del taller (Cloudflare Worker + D1)
// Rutas /api/*; todo lo demás lo sirven los archivos estáticos de /public.

const TABLAS = {
  clientes:   ['nombre', 'telefono', 'email', 'lugar', 'vehiculo', 'modelo', 'notas'],
  pedidos:    ['cliente_id', 'trabajo', 'colores', 'estructura', 'montaje', 'carril', 'medidas', 'fase', 'fecha_entrega', 'precio', 'notas', 'origen', 'historial', 'archivado'],
  cobros:     ['pedido_id', 'fecha', 'importe', 'metodo', 'concepto'],
  materiales: ['nombre', 'categoria', 'unidad', 'stock', 'minimo', 'coste', 'proveedor', 'notas'],
  gastos:     ['fecha', 'concepto', 'categoria', 'importe', 'proveedor', 'pedido_id'],
};
const ORDEN = { clientes: 'nombre COLLATE NOCASE', pedidos: 'creado DESC', cobros: 'fecha DESC', materiales: 'nombre COLLATE NOCASE', gastos: 'fecha DESC', movimientos: 'fecha DESC' };
const NUMEROS = new Set(['precio', 'importe', 'stock', 'minimo', 'coste', 'archivado', 'cantidad', 'coste_unit']);
const DIAS_SESION = 30;

const json = (datos, estado = 200, extra = {}) => new Response(JSON.stringify(datos), {
  status: estado, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});
const error = (msg, estado = 400) => json({ error: msg }, estado);
const id = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const hoy = () => new Date().toISOString().slice(0, 10);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function hashClave(clave, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, base, 256);
  return hex(bits);
}
function igual(a, b) { // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function limpiar(tabla, cuerpo) {
  const fila = {};
  for (const c of TABLAS[tabla]) if (c in cuerpo) {
    let v = cuerpo[c];
    if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    if (NUMEROS.has(c)) v = v === '' || v === null ? 0 : Number(v);
    else if (v !== null) v = String(v).slice(0, 4000);
    if (NUMEROS.has(c) && !Number.isFinite(v)) throw new Error(`El campo ${c} tiene que ser un número`);
    fila[c] = v;
  }
  return fila;
}
const cookie = req => Object.fromEntries((req.headers.get('cookie') || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]));

async function usuarioDe(req, env) {
  const t = cookie(req).taller;
  if (!t) return null;
  const s = await env.DB.prepare('SELECT u.id, u.nombre, s.expira FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?').bind(t).first();
  if (!s || s.expira < Date.now()) return null;
  return s;
}
async function abrirSesion(env, usuarioId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = Date.now() + DIAS_SESION * 864e5;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesiones WHERE expira < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, ?)').bind(token, usuarioId, expira)
  ]);
  return json({ ok: true }, 200, { 'set-cookie': `taller=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DIAS_SESION * 86400}` });
}

async function resumen(env) {
  const mes = hoy().slice(0, 7);
  const q = (sql, ...p) => env.DB.prepare(sql).bind(...p);
  const [cobMes, gasMes, fases, pendiente, entregas, stockBajo, serieC, serieG, ultimos, valorStock] = await env.DB.batch([
    q("SELECT COALESCE(SUM(importe),0) v FROM cobros WHERE substr(fecha,1,7) = ?", mes),
    q("SELECT COALESCE(SUM(importe),0) v FROM gastos WHERE substr(fecha,1,7) = ?", mes),
    q("SELECT fase, COUNT(*) n FROM pedidos WHERE archivado = 0 GROUP BY fase"),
    q(`SELECT COALESCE(SUM(p.precio - COALESCE(c.cob,0)),0) v FROM pedidos p
       LEFT JOIN (SELECT pedido_id, SUM(importe) cob FROM cobros GROUP BY pedido_id) c ON c.pedido_id = p.id
       WHERE p.archivado = 0 AND p.fase NOT IN ('nuevo','medidas') AND p.precio > COALESCE(c.cob,0)`),
    q(`SELECT p.id, p.trabajo, p.fecha_entrega, p.fase, cl.nombre FROM pedidos p LEFT JOIN clientes cl ON cl.id = p.cliente_id
       WHERE p.archivado = 0 AND p.fase != 'entregado' AND p.fecha_entrega IS NOT NULL AND p.fecha_entrega != ''
       ORDER BY p.fecha_entrega LIMIT 6`),
    q("SELECT id, nombre, stock, minimo, unidad FROM materiales WHERE stock <= minimo ORDER BY nombre"),
    q("SELECT substr(fecha,1,7) m, SUM(importe) v FROM cobros WHERE fecha >= date('now','-5 months','start of month') GROUP BY m"),
    q("SELECT substr(fecha,1,7) m, SUM(importe) v FROM gastos WHERE fecha >= date('now','-5 months','start of month') GROUP BY m"),
    q(`SELECT 'cobro' tipo, fecha, importe, concepto texto FROM cobros
       UNION ALL SELECT 'gasto', fecha, importe, concepto FROM gastos ORDER BY fecha DESC LIMIT 8`),
    q("SELECT COALESCE(SUM(stock * coste),0) v FROM materiales")
  ]);
  return {
    mes, cobrado: cobMes.results[0].v, gastado: gasMes.results[0].v, pendiente: pendiente.results[0].v,
    valorStock: valorStock.results[0].v, fases: fases.results, entregas: entregas.results, stockBajo: stockBajo.results,
    serie: { cobros: serieC.results, gastos: serieG.results }, ultimos: ultimos.results
  };
}

async function api(req, env, url) {
  const ruta = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const metodo = req.method;
  const cuerpo = ['POST', 'PUT'].includes(metodo) ? await req.json().catch(() => ({})) : {};

  // --- Acceso ---
  if (ruta[0] === 'estado') {
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM usuarios').first();
    const u = await usuarioDe(req, env);
    return json({ hayUsuarios: n.n > 0, usuario: u ? u.nombre : null });
  }
  if (ruta[0] === 'alta' && metodo === 'POST') { // primer acceso: hace falta el código de alta
    const codigo = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'codigo_alta'").first();
    if (!codigo || !igual(String(cuerpo.codigo || ''), codigo.valor)) return error('Código de alta incorrecto', 403);
    const nombre = String(cuerpo.nombre || '').trim().slice(0, 40), clave = String(cuerpo.clave || '');
    if (!nombre || clave.length < 8) return error('Pon un nombre y una contraseña de al menos 8 caracteres');
    if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE nombre = ?').bind(nombre).first()) return error('Ese nombre ya existe');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), uid = id();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO usuarios (id, nombre, hash, salt) VALUES (?, ?, ?, ?)').bind(uid, nombre, await hashClave(clave, salt), salt),
      env.DB.prepare("DELETE FROM ajustes WHERE clave = 'codigo_alta'") // el código solo vale una vez
    ]);
    return abrirSesion(env, uid);
  }
  if (ruta[0] === 'entrar' && metodo === 'POST') {
    const u = await env.DB.prepare('SELECT * FROM usuarios WHERE nombre = ?').bind(String(cuerpo.nombre || '').trim()).first();
    const h = u ? await hashClave(String(cuerpo.clave || ''), u.salt) : await hashClave('x', 'x');
    if (!u || !igual(h, u.hash)) return error('Nombre o contraseña incorrectos', 401);
    return abrirSesion(env, u.id);
  }
  if (ruta[0] === 'salir') {
    const t = cookie(req).taller;
    if (t) await env.DB.prepare('DELETE FROM sesiones WHERE token = ?').bind(t).run();
    return json({ ok: true }, 200, { 'set-cookie': 'taller=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }

  // --- A partir de aquí, hace falta sesión ---
  const yo = await usuarioDe(req, env);
  if (!yo) return error('Tienes que entrar con tu usuario', 401);
  if (metodo !== 'GET' && req.headers.get('x-taller') !== '1') return error('Petición no válida', 403);

  if (ruta[0] === 'resumen') return json(await resumen(env));

  if (ruta[0] === 'clave' && metodo === 'POST') {
    const clave = String(cuerpo.clave || '');
    if (clave.length < 8) return error('La contraseña tiene que tener al menos 8 caracteres');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('UPDATE usuarios SET hash = ?, salt = ? WHERE id = ?').bind(await hashClave(clave, salt), salt, yo.id).run();
    return json({ ok: true });
  }
  if (ruta[0] === 'usuarios' && metodo === 'POST') { // dar acceso a otra persona del taller
    const nombre = String(cuerpo.nombre || '').trim().slice(0, 40), clave = String(cuerpo.clave || '');
    if (!nombre || clave.length < 8) return error('Pon un nombre y una contraseña de al menos 8 caracteres');
    if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE nombre = ?').bind(nombre).first()) return error('Ese nombre ya existe');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('INSERT INTO usuarios (id, nombre, hash, salt) VALUES (?, ?, ?, ?)').bind(id(), nombre, await hashClave(clave, salt), salt).run();
    return json({ ok: true });
  }
  if (ruta[0] === 'usuarios' && metodo === 'GET') return json((await env.DB.prepare('SELECT id, nombre FROM usuarios ORDER BY nombre').all()).results);

  if (ruta[0] === 'ajustes') {
    if (metodo === 'GET') return json(Object.fromEntries((await env.DB.prepare("SELECT clave, valor FROM ajustes WHERE clave != 'codigo_alta'").all()).results.map(r => [r.clave, r.valor])));
    if (metodo === 'PUT') {
      const ops = Object.entries(cuerpo).filter(([k]) => /^[a-z_]{2,30}$/.test(k) && k !== 'codigo_alta')
        .map(([k, v]) => env.DB.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').bind(k, typeof v === 'string' ? v : JSON.stringify(v)));
      if (ops.length) await env.DB.batch(ops);
      return json({ ok: true });
    }
  }

  // Movimiento de material: actualiza el stock y, si es una compra, apunta el gasto
  if (ruta[0] === 'movimientos') {
    if (metodo === 'GET') {
      const mid = url.searchParams.get('material');
      const r = mid ? await env.DB.prepare('SELECT * FROM movimientos WHERE material_id = ? ORDER BY fecha DESC LIMIT 200').bind(mid).all()
                    : await env.DB.prepare('SELECT * FROM movimientos ORDER BY fecha DESC LIMIT 300').all();
      return json(r.results);
    }
    if (metodo === 'POST') {
      const m = await env.DB.prepare('SELECT * FROM materiales WHERE id = ?').bind(cuerpo.material_id).first();
      if (!m) return error('Ese material no existe');
      const tipo = cuerpo.tipo === 'entrada' ? 'entrada' : cuerpo.tipo === 'ajuste' ? 'ajuste' : 'salida';
      const cantidad = Number(cuerpo.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) return error('La cantidad tiene que ser mayor que 0');
      const costeUnit = tipo === 'entrada' && Number(cuerpo.coste_unit) > 0 ? Number(cuerpo.coste_unit) : m.coste;
      const mid = id(), fecha = cuerpo.fecha || hoy();
      const nuevoStock = tipo === 'entrada' ? m.stock + cantidad : tipo === 'salida' ? m.stock - cantidad : cantidad;
      // Coste medio ponderado al comprar
      const nuevoCoste = tipo === 'entrada' && nuevoStock > 0 ? ((Math.max(m.stock, 0) * m.coste) + cantidad * costeUnit) / (Math.max(m.stock, 0) + cantidad) : m.coste;
      const ops = [
        env.DB.prepare('INSERT INTO movimientos (id, material_id, fecha, tipo, cantidad, coste_unit, pedido_id, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(mid, m.id, fecha, tipo, cantidad, costeUnit, cuerpo.pedido_id || null, cuerpo.nota || null),
        env.DB.prepare('UPDATE materiales SET stock = ?, coste = ? WHERE id = ?').bind(Math.round(nuevoStock * 1000) / 1000, Math.round(nuevoCoste * 10000) / 10000, m.id)
      ];
      if (tipo === 'entrada' && cuerpo.apuntar_gasto) ops.push(env.DB.prepare('INSERT INTO gastos (id, fecha, concepto, categoria, importe, proveedor, movimiento_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id(), fecha, `Compra: ${m.nombre} (${cantidad} ${m.unidad})`, 'Material', Math.round(cantidad * costeUnit * 100) / 100, cuerpo.proveedor || m.proveedor || null, mid));
      await env.DB.batch(ops);
      return json({ ok: true, id: mid, stock: nuevoStock });
    }
  }

  // Ficha de un pedido con su cliente, cobros, material usado y gastos
  if (ruta[0] === 'pedidos' && ruta[1] && ruta[2] === 'ficha') {
    const pid = ruta[1];
    const [p, cob, mat, gas] = await env.DB.batch([
      env.DB.prepare('SELECT p.*, c.nombre cliente, c.telefono FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?').bind(pid),
      env.DB.prepare('SELECT * FROM cobros WHERE pedido_id = ? ORDER BY fecha').bind(pid),
      env.DB.prepare("SELECT mv.*, m.nombre, m.unidad FROM movimientos mv JOIN materiales m ON m.id = mv.material_id WHERE mv.pedido_id = ? AND mv.tipo = 'salida' ORDER BY mv.fecha").bind(pid),
      env.DB.prepare('SELECT * FROM gastos WHERE pedido_id = ? ORDER BY fecha').bind(pid)
    ]);
    if (!p.results[0]) return error('No existe ese pedido', 404);
    return json({ pedido: p.results[0], cobros: cob.results, material: mat.results, gastos: gas.results });
  }

  // CRUD genérico
  const tabla = ruta[0];
  if (!TABLAS[tabla] && tabla !== 'movimientos') return error('Ruta desconocida', 404);
  if (metodo === 'GET' && !ruta[1]) {
    let sql = `SELECT * FROM ${tabla}`;
    if (tabla === 'pedidos') sql = 'SELECT p.*, c.nombre cliente, c.telefono, c.lugar, c.modelo, (SELECT COALESCE(SUM(importe),0) FROM cobros WHERE pedido_id = p.id) cobrado FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id';
    if (tabla === 'clientes') sql = 'SELECT c.*, (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) pedidos FROM clientes c';
    return json((await env.DB.prepare(`${sql} ORDER BY ${tabla === 'pedidos' ? 'p.' : tabla === 'clientes' ? 'c.' : ''}${ORDEN[tabla]} LIMIT 2000`).all()).results);
  }
  if (metodo === 'GET' && ruta[1]) {
    const r = await env.DB.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).bind(ruta[1]).first();
    return r ? json(r) : error('No encontrado', 404);
  }
  if (tabla === 'movimientos') return error('Método no permitido', 405);
  try {
    if (metodo === 'POST') {
      const fila = limpiar(tabla, cuerpo), nid = id();
      if (tabla === 'clientes' && !fila.nombre) return error('El cliente necesita un nombre');
      if (tabla === 'materiales' && !fila.nombre) return error('El material necesita un nombre');
      if ((tabla === 'cobros' || tabla === 'gastos') && !fila.fecha) fila.fecha = hoy();
      if (tabla === 'gastos' && !fila.concepto) return error('El gasto necesita un concepto');
      const cols = Object.keys(fila);
      await env.DB.prepare(`INSERT INTO ${tabla} (id${cols.map(c => ', ' + c).join('')}) VALUES (?${cols.map(() => ', ?').join('')})`).bind(nid, ...Object.values(fila)).run();
      return json({ ok: true, id: nid });
    }
    if (metodo === 'PUT' && ruta[1]) {
      const fila = limpiar(tabla, cuerpo), cols = Object.keys(fila);
      if (!cols.length) return error('No hay nada que guardar');
      if (tabla === 'pedidos') { fila.actualizado = new Date().toISOString(); cols.push('actualizado'); }
      await env.DB.prepare(`UPDATE ${tabla} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`).bind(...cols.map(c => fila[c]), ruta[1]).run();
      return json({ ok: true });
    }
    if (metodo === 'DELETE' && ruta[1]) {
      if (tabla === 'clientes' && await env.DB.prepare('SELECT 1 FROM pedidos WHERE cliente_id = ?').bind(ruta[1]).first()) return error('Este cliente tiene pedidos: archiva los pedidos o bórralos antes');
      const ops = [env.DB.prepare(`DELETE FROM ${tabla} WHERE id = ?`).bind(ruta[1])];
      if (tabla === 'pedidos') ops.unshift(env.DB.prepare('DELETE FROM cobros WHERE pedido_id = ?').bind(ruta[1]));
      if (tabla === 'materiales') ops.unshift(env.DB.prepare('DELETE FROM movimientos WHERE material_id = ?').bind(ruta[1]));
      await env.DB.batch(ops);
      return json({ ok: true });
    }
  } catch (e) { return error(e.message || 'No se pudo guardar'); }
  return error('Método no permitido', 405);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { console.error(e); return error('Error del servidor', 500); }
    }
    return env.ASSETS.fetch(req);
  }
};
