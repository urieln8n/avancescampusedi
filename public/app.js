/* Puntada · presupuestos y tablero de pedidos para Avancés Campus.
   Sin servidor: el pedido viaja en el WhatsApp y el tablero se guarda en este navegador. */
{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Guardado (puede fallar: se sigue funcionando en memoria) ---------- */
const CLAVE = 'puntada-v1';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } };
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); return true; } catch { return false; } };

const FASES = [
  ['nuevo','Presupuesto nuevo'],['medidas','Medidas tomadas'],['aceptado','Aceptado'],['cortando','Cortando'],
  ['cosiendo','Cosiendo'],['montaje','Montaje y prueba'],['listo','Listo para entregar'],['entregado','Entregado']];
const nombreFase = id => (FASES.find(f => f[0] === id) || [,''])[1];

const AJUSTES_BASE = {
  whatsapp: '34632083624', pin: '1234',
  medidas: ['Longitud del carril (cm)','Altura suelo-carril (cm)','Fondo del avancé (cm)','Altura del lateral (cm)'],
  avisos: {
    medidas: 'Hola {nombre}: somos Avancés Campus. ¿Qué día podemos pasar por {lugar} a tomar las medidas de tu caravana?',
    aceptado: 'Hola {nombre}: confirmamos tu pedido ({trabajo}). Te avisamos en cuanto esté listo. Avancés Campus',
    montaje: 'Hola {nombre}: tu {trabajo} está terminado. ¿Qué día te va bien para el montaje en {lugar}? Avancés Campus',
    listo: 'Hola {nombre}: ¡tu {trabajo} ya está listo! ¿Cuándo te va bien la entrega? Avancés Campus',
    otro: 'Hola {nombre}, te escribimos de Avancés Campus sobre tu {trabajo}.'
  }
};

const hoy = () => new Date().toISOString().slice(0,10);
const masDias = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const nuevoId = () => 'P' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();

function ejemplos(){
  const p = (nombre, tel, vehiculo, modelo, trabajo, carril, colores, lugar, fase, fecha, med) => ({
    id: nuevoId(), ejemplo: true, nombre, telefono: tel, vehiculo, modelo, trabajo, carril, estructura: 'Sí, con estructura',
    colores, montaje: 'Sí, que me lo montéis', lugar, cuando: 'Este mes', fase, fecha, medidas: med || {}, notas: '',
    creado: hoy(), historial: [{fase, dia: hoy()}] });
  return [
    p('Jordi','600000001','Caravana','Hobby De Luxe 460','Avancé SCAR','No la sé','Azul marino y gris','Camping de Calella','nuevo','',null),
    p('Marta','600000002','Caravana','Adria Altea 4521','Avancé CAMPUS','920','Gris y antracita','Camping de Blanes','medidas','',{'Longitud del carril (cm)':'920','Altura suelo-carril (cm)':'245'}),
    p('Antonio','600000003','Caravana','Knaus Sport 450','Cocina de camping','—','Azul marino y gris','Camping de Cubelles','cosiendo',masDias(6),{'Fondo del avancé (cm)':'200'}),
    p('Rosa','600000004','Autocaravana','Fiat Ducato perfilada','Sobreavance','No la sé','Todo gris','Camping de Malgrat','listo',masDias(-2),{})
  ];
}

let db = leer();
if (!db || !Array.isArray(db.pedidos)) db = { pedidos: ejemplos(), ajustes: structuredClone(AJUSTES_BASE) };
db.ajustes = Object.assign(structuredClone(AJUSTES_BASE), db.ajustes || {});
const puedeGuardar = guardar();

function aviso(t){ const a = $('#aviso'); a.textContent = t; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 2600); }

/* ---------- Código del pedido (viaja dentro del WhatsApp) ---------- */
function codificar(o){
  const b = new TextEncoder().encode(JSON.stringify(o)); let s = '';
  b.forEach(x => s += String.fromCharCode(x));
  return 'PTD1-' + btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodificar(txt){
  const m = String(txt).match(/PTD1-([A-Za-z0-9_-]+)/); if (!m) return null;
  try {
    const s = atob(m[1].replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0))));
  } catch { return null; }
}

/* =====================  CARA DEL CLIENTE  ===================== */
const PREGUNTAS = [
  {k:'vehiculo', t:'¿Qué vehículo tienes?', tipo:'op', ops:['Caravana','Autocaravana','Camper o furgoneta']},
  {k:'modelo', t:'Marca y modelo', ayuda:'Así sabemos cómo es tu vehículo. Ejemplo: Adria Altea 4521', tipo:'txt', ph:'Marca y modelo'},
  {k:'trabajo', t:'¿Qué necesitas?', tipo:'op', ops:[
    ['Avancé SCAR','Dos puertas delanteras desmontables y laterales con mosquitera'],
    ['Avancé CAMPUS','Frontal que se quita entero y queda como un balcón'],
    ['Cocina de camping','Con ventanas de cristal y tapas enrollables'],
    ['Sobreavance',''],['Otra cosa o aconsejadme','Cuéntanoslo luego por WhatsApp']]},
  {k:'carril', t:'¿Cuánto mide el carril de tu caravana?', ayuda:'En centímetros. Si no lo sabes, la medimos nosotros.', tipo:'num', ph:'Por ejemplo, 920', nose:'No la sé, medidla vosotros'},
  {k:'estructura', t:'¿Lo quieres con estructura?', ayuda:'Nuestra estructura es de acero galvanizado de 25 mm.', tipo:'op', ops:['Sí, con estructura','No, ya tengo estructura','No lo sé']},
  {k:'colores', t:'¿Qué colores te gustan?', ayuda:'Lona PVC Trevira, fácil de limpiar.', tipo:'op', ops:['Azul marino y gris','Gris y antracita','Todo gris','Aconsejadme']},
  {k:'montaje', t:'¿Te lo montamos nosotros?', tipo:'op', ops:['Sí, que me lo montéis','Lo monto yo','No lo sé']},
  {k:'lugar', t:'¿Dónde está la caravana?', ayuda:'Nombre del camping o población.', tipo:'txt', ph:'Camping o población'},
  {k:'cuando', t:'¿Para cuándo lo necesitas?', tipo:'op', ops:['Lo antes posible','Este mes','Antes del verano','Sin prisa']},
  {k:'nombre', t:'¿Cómo te llamas?', tipo:'txt', ph:'Tu nombre'},
  {k:'telefono', t:'Tu teléfono', ayuda:'Te contestamos por WhatsApp a este número.', tipo:'tel', ph:'600 000 000'}
];
const ETIQ = {vehiculo:'Vehículo',modelo:'Modelo',trabajo:'Trabajo',carril:'Carril (cm)',estructura:'Estructura',colores:'Colores',montaje:'Montaje',lugar:'Dónde está',cuando:'Para cuándo',nombre:'Nombre',telefono:'Teléfono'};

let resp = {}, paso = 0, volverResumen = false;
const wz = $('#wizard');

function pintarPaso(){
  const total = PREGUNTAS.length;
  $('#barra').style.width = (Math.min(paso,total) / total * 100) + '%';
  $('#paso-n').textContent = paso < total ? `Pregunta ${paso+1} de ${total}` : 'Revisa y envía';
  if (paso >= total) return pintarResumen();
  const q = PREGUNTAS[paso], v = resp[q.k] ?? '';
  let cuerpo = '';
  if (q.tipo === 'op') {
    cuerpo = `<div class="opciones">${q.ops.map((o,i) => {
      const [t, s] = Array.isArray(o) ? o : [o,''];
      return `<button class="op" data-op="${esc(t)}" aria-pressed="${v===t}"><span class="n">${i+1}</span><span>${esc(t)}${s?`<small>${esc(s)}</small>`:''}</span></button>`;
    }).join('')}</div>`;
  } else {
    const type = q.tipo === 'num' ? 'number' : q.tipo === 'tel' ? 'tel' : 'text';
    const valor = (q.nose && v === q.nose) ? '' : v;
    cuerpo = `<input class="campo" id="entrada" type="${type}" ${type==='number'?'inputmode="numeric" min="100" max="2000"':''} ${type==='tel'?'inputmode="tel" autocomplete="tel"':''} placeholder="${esc(q.ph||'')}" value="${esc(valor)}">
      ${q.nose ? `<div class="opciones" style="margin-top:10px"><button class="op" data-op="${esc(q.nose)}" aria-pressed="${v===q.nose}"><span>${esc(q.nose)}</span></button></div>` : ''}`;
  }
  wz.innerHTML = `<div class="preg"><h2>${esc(q.t)}</h2>${q.ayuda?`<p class="ayuda">${esc(q.ayuda)}</p>`:''}${cuerpo}
    <p class="error" id="error"></p>
    <div class="nav-preg"><button class="btn-ghost" id="atras">${paso===0?'Salir':'‹ Atrás'}</button><button class="btn" id="sigue">${volverResumen?'Volver al resumen':'Siguiente ›'}</button></div></div>`;
  const ent = $('#entrada'); if (ent) ent.focus({preventScroll:true});
}

function validar(){
  const q = PREGUNTAS[paso], ent = $('#entrada');
  if (ent && ent.value.trim()) resp[q.k] = ent.value.trim();
  const v = (resp[q.k] || '').trim();
  if (!v) return 'Responde para seguir.';
  if (q.tipo === 'num' && v !== q.nose && !(+v >= 100 && +v <= 2000)) return 'Pon la medida en centímetros (entre 100 y 2000).';
  if (q.tipo === 'tel') { const d = v.replace(/\D/g,'').replace(/^34(?=\d{9}$)/,''); if (!/^[6789]\d{8}$/.test(d)) return 'Pon un teléfono español de 9 cifras.'; resp.telefono = d; }
  return '';
}
function avanzar(){
  const e = validar(); if (e) { $('#error').textContent = e; return; }
  paso = volverResumen ? PREGUNTAS.length : paso + 1; volverResumen = false; pintarPaso(); scrollTo(0,0);
}

wz.addEventListener('click', ev => {
  const op = ev.target.closest('[data-op]');
  if (op) {
    const q = PREGUNTAS[paso]; resp[q.k] = op.dataset.op;
    if ($('#entrada')) $('#entrada').value = '';
    wz.querySelectorAll('[data-op]').forEach(b => b.setAttribute('aria-pressed', b === op));
    setTimeout(avanzar, 220); return;
  }
  if (ev.target.closest('#sigue')) return avanzar();
  if (ev.target.closest('#atras')) { if (paso === 0) { location.hash = ''; return; } paso--; volverResumen = false; return pintarPaso(); }
  const ed = ev.target.closest('[data-editar]');
  if (ed) { paso = +ed.dataset.editar; volverResumen = true; pintarPaso(); }
  if (ev.target.closest('#enviar')) enviar(ev);
});
document.addEventListener('keydown', ev => {
  if ($('#v-presupuesto').hidden) return;
  if (ev.key === 'Enter' && ev.target.id === 'entrada') { ev.preventDefault(); avanzar(); }
  if (paso < PREGUNTAS.length && PREGUNTAS[paso].tipo === 'op' && /^[1-9]$/.test(ev.key)) {
    const b = wz.querySelectorAll('[data-op]')[+ev.key-1]; if (b) b.click();
  }
});

function textoPedido(p){
  return [`Hola, quiero presupuesto para un avancé:`,
    ...PREGUNTAS.map(q => `• ${ETIQ[q.k]}: ${p[q.k]}`),
    ``, `Código para el taller: ${codificar(p)}`].join('\n');
}
function pintarResumen(){
  const p = {...resp};
  wz.innerHTML = `<div class="preg"><h2>Revisa tu presupuesto</h2>
    <ul class="resumen">${PREGUNTAS.map((q,i) => `<li><span>${esc(ETIQ[q.k])}</span><b>${esc(resp[q.k])}</b><button data-editar="${i}">Cambiar</button></li>`).join('')}</ul>
    <label class="check"><input type="checkbox" id="privacidad"><span>Acepto que Avancés Campus use mi nombre, teléfono y estos datos solo para contestarme y hacer el presupuesto. Puedo pedir que los borren cuando quiera.</span></label>
    <p class="error" id="error"></p>
    <div class="nav-preg"><button class="btn-ghost" id="atras">‹ Atrás</button>
      <a class="btn btn-big" id="enviar" href="https://wa.me/${esc(db.ajustes.whatsapp)}?text=${encodeURIComponent(textoPedido(p))}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
    <p class="nota">Se abre WhatsApp con el mensaje ya escrito para el 632 083 624. Solo tienes que darle a enviar.</p></div>`;
}
function enviar(ev){
  if (!$('#privacidad').checked) { ev.preventDefault(); $('#error').textContent = 'Marca la casilla de privacidad para enviar.'; return; }
  setTimeout(() => {
    $('#barra').style.width = '100%'; $('#paso-n').textContent = '¡Enviado!';
    wz.innerHTML = `<div class="preg fin"><div class="tick">✓</div><h2>¡Gracias, ${esc(resp.nombre)}!</h2>
      <p>Si WhatsApp se ha abierto, dale a enviar y te contestamos con tu presupuesto.</p>
      <p class="nota">¿No se ha abierto? Escríbenos al <b>632 083 624</b>.</p>
      <a class="btn-ghost" style="display:inline-flex;align-items:center;margin-top:12px;text-decoration:none" href="#">Volver al inicio</a></div>`;
    resp = {}; paso = 0;
  }, 400);
}

/* Galería */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-gal]'); if (!b) return;
  const g = $('#galeria'); g.scrollBy({left: +b.dataset.gal * g.clientWidth * .8, behavior:'smooth'});
});
$('#galeria').addEventListener('keydown', ev => {
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); $('#galeria').scrollBy({left:(ev.key==='ArrowRight'?1:-1)*300, behavior:'smooth'}); }
});

/* =====================  CARA DEL TALLER  ===================== */
let dentro = false, filtro = '';
const T = $('#taller');

function pintarTaller(){
  if (!dentro) {
    T.innerHTML = `<div class="pin"><h2>Acceso del taller</h2><p class="nota">Escribe el PIN del taller. La primera vez es 1234; cámbialo en Ajustes.</p>
      <input class="campo" id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="PIN">
      <p class="error" id="pin-err"></p><button class="btn" id="pin-ok" style="width:100%">Entrar</button>
      <p><a href="#">‹ Volver a la web</a></p></div>`;
    $('#pin').focus(); return;
  }
  const q = filtro.toLowerCase();
  const visibles = db.pedidos.filter(p => !p.archivado && (!q || [p.nombre,p.modelo,p.telefono,p.lugar,p.trabajo].join(' ').toLowerCase().includes(q)));
  const hayEj = db.pedidos.some(p => p.ejemplo);
  T.innerHTML = `<div class="t-top"><span class="marca">Puntada · Taller</span>
      <input class="t-busca" id="busca" type="search" placeholder="Buscar nombre, modelo, teléfono…" value="${esc(filtro)}" aria-label="Buscar pedidos">
      <button class="btn btn-sm" data-acc="pegar">Pegar pedido de WhatsApp</button>
      <button class="btn-ghost" data-acc="nuevo">+ Pedido a mano</button>
      <button class="btn-ghost" data-acc="ajustes">Ajustes</button></div>
    ${hayEj ? `<div class="t-ejemplo"><span>Estás viendo pedidos de ejemplo para probar el tablero.</span><button class="btn-ghost" data-acc="borrar-ejemplos">Quitar los ejemplos</button></div>` : ''}
    ${!puedeGuardar ? `<div class="t-ejemplo"><span>Este navegador no deja guardar: los cambios se pierden al cerrar. Usa Ajustes › Copia de seguridad.</span></div>` : ''}
    <div class="tablero">${FASES.map(([id,nom]) => {
      const ps = visibles.filter(p => p.fase === id);
      return `<section class="col" data-col="${id}"><h3>${esc(nom)}<span>${ps.length}</span></h3>
        ${ps.map(tarjeta).join('') || '<p class="vacia">Sin pedidos</p>'}</section>`;
    }).join('')}</div>`;
}
function tarjeta(p){
  const tarde = p.fecha && p.fecha < hoy() && p.fase !== 'entregado';
  const faltaMed = ['nuevo','medidas'].includes(p.fase) && !Object.values(p.medidas||{}).some(v => String(v).trim());
  return `<button class="tarjeta" draggable="true" data-id="${esc(p.id)}"><b>${esc(p.nombre)}</b><span>${esc(p.trabajo)} · ${esc(p.modelo)}</span>
    <span class="meta">${p.fecha?`<i class="chip ${tarde?'tarde':''}">${tarde?'Retrasado · ':''}${esc(fechaCorta(p.fecha))}</i>`:''}${faltaMed?'<i class="chip falta">Faltan medidas</i>':''}<i class="chip">${esc(p.lugar||'')}</i></span></button>`;
}
const fechaCorta = f => { const [a,m,d] = f.split('-'); return `${+d}/${+m}/${a.slice(2)}`; };
const buscar = id => db.pedidos.find(p => p.id === id);

function cambiarFase(p, fase){
  if (!fase || p.fase === fase) return;
  p.fase = fase; p.historial = [...(p.historial||[]), {fase, dia: hoy()}]; guardar();
}

/* Modal */
function abrirModal(html){ $('#modal-caja').innerHTML = html; $('#modal').hidden = false; const f = $('#modal-caja').querySelector('input,textarea,select,button'); if (f) f.focus(); }
function cerrarModal(){ $('#modal').hidden = true; $('#modal-caja').innerHTML = ''; pintarTaller(); }
$('#modal').addEventListener('mousedown', ev => { if (ev.target.id === 'modal') cerrarModal(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modal').hidden) cerrarModal(); });

const campo = (k, etiq, v, tipo='text') => `<label class="fld"><span>${esc(etiq)}</span><input data-k="${esc(k)}" type="${tipo}" value="${esc(v ?? '')}"></label>`;

function abrirPedido(p){
  const i = FASES.findIndex(f => f[0] === p.fase);
  const wa = enlaceAviso(p);
  abrirModal(`<div class="m-cab"><div><h2>${esc(p.nombre || 'Pedido nuevo')}</h2><p class="nota">${esc(p.trabajo||'')} · ${esc(p.modelo||'')}${p.ejemplo?' · pedido de ejemplo':''}</p></div><button class="btn-ghost m-cerrar" data-acc="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="fases"><button class="btn-ghost" data-acc="fase-ant" ${i<=0?'disabled':''}>‹ ${esc(i>0?FASES[i-1][1]:'')}</button><span class="fase-act">${esc(nombreFase(p.fase))}</span><button class="btn-ghost" data-acc="fase-sig" ${i>=FASES.length-1?'disabled':''}>${esc(i<FASES.length-1?FASES[i+1][1]:'')} ›</button></div>
    <div class="acciones">${p.telefono?`<a class="btn" href="${wa}" target="_blank" rel="noopener">Avisar por WhatsApp</a>
      <a class="btn-ghost" style="display:inline-flex;align-items:center;text-decoration:none" href="tel:+34${esc(p.telefono)}">Llamar · ${esc(p.telefono)}</a>`:''}</div>
    <div class="seccion"><h3>Cliente y vehículo</h3><div class="grid2">
      ${campo('nombre','Nombre',p.nombre)}${campo('telefono','Teléfono',p.telefono,'tel')}
      ${campo('vehiculo','Vehículo',p.vehiculo)}${campo('modelo','Marca y modelo',p.modelo)}
      ${campo('lugar','Dónde está',p.lugar)}${campo('cuando','Para cuándo (cliente)',p.cuando)}</div></div>
    <div class="seccion"><h3>Trabajo</h3><div class="grid2">
      ${campo('trabajo','Trabajo',p.trabajo)}${campo('colores','Colores',p.colores)}
      ${campo('estructura','Estructura',p.estructura)}${campo('montaje','Montaje',p.montaje)}
      ${campo('carril','Carril según el cliente (cm)',p.carril)}${campo('fecha','Fecha comprometida',p.fecha,'date')}</div></div>
    <div class="seccion"><h3>Hoja de medidas</h3><div class="grid2">
      ${db.ajustes.medidas.map(m => `<label class="fld"><span>${esc(m)}</span><input data-m="${esc(m)}" inputmode="decimal" value="${esc((p.medidas||{})[m] ?? '')}"></label>`).join('')}</div>
      <p class="nota">Las medidas de la hoja se cambian en Ajustes.</p></div>
    <div class="seccion"><label class="fld"><span>Notas del taller</span><textarea data-k="notas">${esc(p.notas)}</textarea></label></div>
    <div class="seccion"><h3>Historial</h3><ul class="hist">${(p.historial||[]).map(h => `<li>${esc(fechaCorta(h.dia))} · ${esc(nombreFase(h.fase))}</li>`).join('')}</ul></div>
    <div class="acciones"><button class="btn" data-acc="guardar">Guardar</button><button class="btn-ghost" data-acc="archivar">Archivar</button><button class="btn-ghost btn-peligro" data-acc="borrar">Borrar</button></div>`);
  $('#modal-caja').dataset.id = p.id;
}
function leerFormulario(p){
  $('#modal-caja').querySelectorAll('[data-k]').forEach(el => p[el.dataset.k] = el.value.trim());
  p.telefono = (p.telefono||'').replace(/\D/g,'').replace(/^34(?=\d{9}$)/,'');
  p.medidas = p.medidas || {};
  $('#modal-caja').querySelectorAll('[data-m]').forEach(el => p.medidas[el.dataset.m] = el.value.trim());
}
function enlaceAviso(p){
  const t = (db.ajustes.avisos[p.fase] || db.ajustes.avisos.otro)
    .replace(/\{nombre\}/g, p.nombre||'').replace(/\{trabajo\}/g, (p.trabajo||'pedido').toLowerCase()).replace(/\{lugar\}/g, p.lugar||'tu camping');
  return `https://wa.me/34${encodeURIComponent(p.telefono||'')}?text=${encodeURIComponent(t)}`;
}

function abrirPegar(){
  abrirModal(`<div class="m-cab"><h2>Pegar pedido de WhatsApp</h2><button class="btn-ghost" data-acc="cerrar" aria-label="Cerrar">✕</button></div>
    <p>Copia el mensaje entero que te ha llegado del cliente (o solo la línea que empieza por <b>PTD1-</b>) y pégalo aquí.</p>
    <label class="fld"><span>Mensaje</span><textarea id="pegado" rows="6"></textarea></label><p class="error" id="peg-err"></p>
    <div class="acciones"><button class="btn" data-acc="importar">Añadir al tablero</button></div>`);
}
function importar(){
  const o = decodificar($('#pegado').value);
  if (!o || !o.nombre) { $('#peg-err').textContent = 'No encuentro el código del pedido en ese texto. Tiene que llevar «PTD1-».'; return; }
  const dup = db.pedidos.find(p => p.telefono === o.telefono && p.trabajo === o.trabajo && !p.archivado);
  if (dup) { $('#peg-err').textContent = `Este pedido ya está en el tablero (${dup.nombre}, ${nombreFase(dup.fase)}).`; return; }
  const p = {...o, id: nuevoId(), fase:'nuevo', fecha:'', medidas: {}, notas:'', creado: hoy(), historial:[{fase:'nuevo', dia: hoy()}]};
  if (/^\d+$/.test(o.carril||'')) p.medidas[db.ajustes.medidas[0]] = '';
  db.pedidos.push(p); guardar(); aviso(`Pedido de ${p.nombre} añadido`); abrirPedido(p);
}
function nuevoAMano(){
  const p = {id: nuevoId(), nombre:'', telefono:'', vehiculo:'Caravana', modelo:'', trabajo:'', carril:'', estructura:'', colores:'', montaje:'', lugar:'', cuando:'',
    fase:'nuevo', fecha:'', medidas:{}, notas:'', creado: hoy(), historial:[{fase:'nuevo', dia: hoy()}], nuevo: true};
  db.pedidos.push(p); abrirPedido(p);
}

function abrirAjustes(){
  const a = db.ajustes;
  abrirModal(`<div class="m-cab"><h2>Ajustes del taller</h2><button class="btn-ghost" data-acc="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="grid2"><label class="fld"><span>WhatsApp del taller (con 34 delante)</span><input id="aj-wa" value="${esc(a.whatsapp)}" inputmode="tel"></label>
    <label class="fld"><span>PIN del taller</span><input id="aj-pin" value="${esc(a.pin)}" inputmode="numeric" maxlength="8"></label></div>
    <p class="nota">El PIN solo evita que un cliente entre por error. No es seguridad de verdad: los pedidos viven en este navegador.</p>
    <div class="seccion"><label class="fld"><span>Medidas de la hoja de taller (una por línea)</span><textarea id="aj-med" rows="5">${esc(a.medidas.join('\n'))}</textarea></label></div>
    <div class="seccion"><h3>Mensajes de aviso</h3><p class="nota">Puedes usar {nombre}, {trabajo} y {lugar}.</p>
      ${Object.entries(a.avisos).map(([k,v]) => `<label class="fld" style="margin-top:10px"><span>${esc(k==='otro'?'Resto de fases':nombreFase(k))}</span><textarea data-av="${esc(k)}" rows="2">${esc(v)}</textarea></label>`).join('')}</div>
    <div class="acciones"><button class="btn" data-acc="guardar-ajustes">Guardar ajustes</button></div>
    <div class="seccion"><h3>Copia de seguridad</h3><p class="nota">Los pedidos se guardan solo en este navegador. Copia este texto y guárdalo (en tus notas o en un correo a ti mismo). Para restaurar, pega una copia y pulsa Restaurar.</p>
      <label class="fld"><span>Datos</span><textarea id="aj-copia" rows="5"></textarea></label>
      <div class="acciones"><button class="btn-ghost" data-acc="copiar">Copiar todo</button><button class="btn-ghost" data-acc="restaurar">Restaurar desde lo pegado</button></div><p class="error" id="aj-err"></p></div>`);
  $('#aj-copia').value = JSON.stringify(db);
}

/* Confirmación dentro de la página (sin confirm) */
function confirmar(texto, si){
  abrirModal(`<h2>${esc(texto)}</h2><p class="nota">No se puede deshacer.</p><div class="acciones"><button class="btn" id="si">Sí, borrar</button><button class="btn-ghost" data-acc="cerrar">Cancelar</button></div>`);
  $('#si').onclick = () => { si(); cerrarModal(); };
}

T.addEventListener('click', ev => {
  if (ev.target.closest('#pin-ok')) return entrar();
  const t = ev.target.closest('.tarjeta'); if (t) return abrirPedido(buscar(t.dataset.id));
  const a = ev.target.closest('[data-acc]'); if (!a) return;
  ({pegar: abrirPegar, nuevo: nuevoAMano, ajustes: abrirAjustes,
    'borrar-ejemplos': () => confirmar('¿Quitar los pedidos de ejemplo?', () => { db.pedidos = db.pedidos.filter(p => !p.ejemplo); guardar(); })})[a.dataset.acc]?.();
});
T.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'pin') { ev.preventDefault(); entrar(); } });
T.addEventListener('input', ev => { if (ev.target.id === 'busca') { filtro = ev.target.value; const pos = ev.target.selectionStart; pintarTaller(); const b = $('#busca'); b.focus(); b.setSelectionRange(pos,pos); } });
function entrar(){ if ($('#pin').value === db.ajustes.pin) { dentro = true; pintarTaller(); } else $('#pin-err').textContent = 'PIN incorrecto.'; }

$('#modal-caja').addEventListener('click', ev => {
  const a = ev.target.closest('[data-acc]'); if (!a) return;
  const p = buscar($('#modal-caja').dataset.id);
  const acc = a.dataset.acc;
  if (acc === 'cerrar') { if (p && p.nuevo && !p.nombre) db.pedidos = db.pedidos.filter(x => x !== p); return cerrarModal(); }
  if (acc === 'importar') return importar();
  if (acc === 'guardar' && p) { leerFormulario(p); if (!p.nombre) { aviso('Pon al menos el nombre'); return; } delete p.nuevo; guardar(); aviso('Guardado'); return cerrarModal(); }
  if ((acc === 'fase-sig' || acc === 'fase-ant') && p) {
    leerFormulario(p); delete p.nuevo; const i = FASES.findIndex(f => f[0] === p.fase);
    cambiarFase(p, FASES[i + (acc === 'fase-sig' ? 1 : -1)]?.[0]); aviso(`Ahora: ${nombreFase(p.fase)}`); return abrirPedido(p);
  }
  if (acc === 'archivar' && p) { p.archivado = true; guardar(); aviso('Archivado'); return cerrarModal(); }
  if (acc === 'borrar' && p) return confirmar(`¿Borrar el pedido de ${p.nombre || 'este cliente'}?`, () => { db.pedidos = db.pedidos.filter(x => x !== p); guardar(); });
  if (acc === 'guardar-ajustes') {
    const wa = $('#aj-wa').value.replace(/\D/g,''), pin = $('#aj-pin').value.trim();
    if (!/^34\d{9}$/.test(wa)) { aviso('El WhatsApp tiene que ser 34 y 9 cifras'); return; }
    if (pin.length < 4) { aviso('El PIN tiene que tener al menos 4 cifras'); return; }
    Object.assign(db.ajustes, {whatsapp: wa, pin, medidas: $('#aj-med').value.split('\n').map(s => s.trim()).filter(Boolean)});
    $('#modal-caja').querySelectorAll('[data-av]').forEach(el => db.ajustes.avisos[el.dataset.av] = el.value);
    guardar(); aviso('Ajustes guardados'); return cerrarModal();
  }
  if (acc === 'copiar') { navigator.clipboard?.writeText($('#aj-copia').value).then(() => aviso('Copiado'), () => { $('#aj-copia').select(); aviso('Selecciónalo y cópialo a mano'); }); return; }
  if (acc === 'restaurar') {
    try { const o = JSON.parse($('#aj-copia').value); if (!Array.isArray(o.pedidos)) throw 0; db = {pedidos: o.pedidos, ajustes: Object.assign(structuredClone(AJUSTES_BASE), o.ajustes)}; guardar(); aviso('Copia restaurada'); cerrarModal(); }
    catch { $('#aj-err').textContent = 'Ese texto no es una copia válida de Puntada.'; }
  }
});

/* Arrastrar tarjetas entre columnas (ordenador). En el móvil se usan los botones de fase. */
let arrastrando = null;
T.addEventListener('dragstart', ev => { const t = ev.target.closest('.tarjeta'); if (t) { arrastrando = t.dataset.id; ev.dataTransfer.effectAllowed = 'move'; } });
T.addEventListener('dragover', ev => { const c = ev.target.closest('.col'); if (c && arrastrando) { ev.preventDefault(); T.querySelectorAll('.sobre').forEach(x => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); } });
T.addEventListener('drop', ev => { const c = ev.target.closest('.col'); if (c && arrastrando) { ev.preventDefault(); const p = buscar(arrastrando); cambiarFase(p, c.dataset.col); aviso(`${p.nombre}: ${nombreFase(p.fase)}`); } arrastrando = null; pintarTaller(); });
T.addEventListener('dragend', () => { arrastrando = null; T.querySelectorAll('.sobre').forEach(x => x.classList.remove('sobre')); });

/* ---------- Portada: la foto se "destapa", se cose el borde y se inclina con el ratón (solo ordenador) ---------- */
{
  const fig = $('#hero3d'), cost = fig && fig.querySelector('.costura');
  const ok = matchMedia('(hover:hover) and (min-width:861px) and (prefers-reduced-motion:no-preference)').matches;
  if (fig && ok) {
    document.body.classList.add('anima');
    setTimeout(() => cost.classList.add('cosida'), 2800);
    const zona = fig.closest('.hero');
    zona.addEventListener('pointermove', ev => {
      const r = fig.getBoundingClientRect();
      const x = (ev.clientX - (r.left + r.width/2)) / r.width, y = (ev.clientY - (r.top + r.height/2)) / r.height;
      fig.style.transform = `rotateY(${(x*8).toFixed(2)}deg) rotateX(${(-y*6).toFixed(2)}deg)`;
    });
    zona.addEventListener('pointerleave', () => fig.style.transform = '');
  } else if (cost) cost.classList.add('cosida');
}

/* ---------- Rutas: inicio · presupuesto · taller ---------- */
function ruta(){
  const h = location.hash.slice(1);
  const v = h === 'presupuesto' ? 'presupuesto' : h === 'taller' ? 'taller' : 'inicio';
  document.querySelectorAll('.vista').forEach(el => el.hidden = el.id !== 'v-' + v);
  document.title = v === 'taller' ? 'Puntada · Taller' : v === 'presupuesto' ? 'Pide presupuesto · Avancés Campus' : 'Avancés para caravana a medida en Barcelona | Avancés Campus';
  if (v === 'presupuesto') { if (paso >= PREGUNTAS.length && !resp.nombre) paso = 0; pintarPaso(); }
  if (v === 'taller') pintarTaller();
  scrollTo(0,0);
}
addEventListener('hashchange', ruta);
ruta();
}
