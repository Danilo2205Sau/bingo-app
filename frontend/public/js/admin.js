// ============================================
// admin.js — Lógica del panel de administración
// ============================================

let tokenAdmin   = null;
let ventaModal   = null;
let todosLosEventos = [];
let pendientesOffset = 0;
let pendientesTotal = 0;
let pendientesCache = [];
const PENDIENTES_POR_PAGINA = 50;

document.addEventListener('DOMContentLoaded', () => {
  const tokenGuardado  = sessionStorage.getItem('admin_token');
  const nombreGuardado = sessionStorage.getItem('admin_nombre');
  if (tokenGuardado) {
    tokenAdmin = tokenGuardado;
    entrarAlPanel(nombreGuardado);
  }
  inicializarEventos();
});

function inicializarEventos() {
  document.addEventListener('click', manejarAccionDelegada);

  document.getElementById('btn-login').addEventListener('click', hacerLogin);
  document.getElementById('login-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hacerLogin();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.clear();
    tokenAdmin = null;
    document.getElementById('pantalla-dashboard').style.display = 'none';
    document.getElementById('pantalla-login').style.display     = 'flex';
  });

  document.getElementById('btn-recargar').addEventListener('click', cargarDatos);
  document.getElementById('btn-pagos-anterior').addEventListener('click', () => cambiarPaginaPendientes(-1));
  document.getElementById('btn-pagos-siguiente').addEventListener('click', () => cambiarPaginaPendientes(1));

  document.getElementById('btn-toggle-form').addEventListener('click', () => {
    const form = document.getElementById('form-sorteo');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-cancelar-form').addEventListener('click', () => {
    document.getElementById('form-sorteo').style.display = 'none';
  });

  document.getElementById('btn-crear-sorteo').addEventListener('click', crearEvento);

  document.getElementById('s-tipo-boleta').addEventListener('change', (e) => {
    document.getElementById('s-rifa-extra').style.display =
      e.target.value === 'rifa' ? 'block' : 'none';
    const nombreModalidad = document.getElementById('s-modalidad-nombre');
    if (!nombreModalidad.value || nombreModalidad.dataset.auto !== 'false') {
      nombreModalidad.value = e.target.value === 'rifa' ? 'Boleta Rifa' : 'Cartón Bingo';
      nombreModalidad.dataset.auto = 'true';
    }
  });
  document.getElementById('s-modalidad-nombre').addEventListener('input', (e) => {
    e.target.dataset.auto = 'false';
  });

  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) cerrarModal();
  });

  document.getElementById('modal-aprobar').addEventListener('click', () => {
    if (ventaModal) aprobarVenta(ventaModal);
  });

  document.getElementById('modal-rechazar').addEventListener('click', () => {
    const notas = prompt('Motivo del rechazo (opcional):') || '';
    if (ventaModal) rechazarVenta(ventaModal, notas);
  });

  document.getElementById('btn-generar-cartones').addEventListener('click', generarCartones);
  document.getElementById('cartones-sorteo-select').addEventListener('change', actualizarProgresoCartones);
  document.getElementById('cartones-pdf-input').addEventListener('change', subirCartonPDF);

  // Editar evento (modal)
  document.getElementById('modal-editar-close').addEventListener('click', cerrarModalEditar);
  document.getElementById('btn-cancelar-edicion').addEventListener('click', cerrarModalEditar);
  document.getElementById('modal-editar').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-editar')) cerrarModalEditar();
  });
  document.getElementById('btn-guardar-edicion').addEventListener('click', guardarEdicionEvento);
  document.getElementById('btn-aumentar-boletas').addEventListener('click', aumentarBoletasDesdeModal);
  document.getElementById('btn-guardar-elegir').addEventListener('click', guardarPermiteElegir);

  // Consultar boletas
  document.getElementById('btn-buscar-boletas').addEventListener('click', buscarBoletas);
  document.getElementById('boletas-sorteo-select').addEventListener('change', buscarBoletas);

  document.getElementById('btn-extraer-boletas').addEventListener('click', extraerBoletas);

  document.getElementById('btn-toggle-extraidas').addEventListener('click', () => {
    panelExtraidasAbierto = !panelExtraidasAbierto;
    document.getElementById('extraidas-panel').style.display = panelExtraidasAbierto ? 'block' : 'none';
    if (panelExtraidasAbierto) cargarBoletasExtraidas();
  });

  document.getElementById('extraidas-buscar').addEventListener('input', renderExtraidas);
}

function manejarAccionDelegada(event) {
  const boton = event.target.closest('[data-admin-action]');
  if (!boton) return;

  const id = boton.dataset.id;
  switch (boton.dataset.adminAction) {
    case 'aprobar-extraida': return aprobarVentaExtraida(id);
    case 'rechazar-extraida': return rechazarVentaExtraida(id);
    case 'cambiar-estado': return cambiarEstado(id, boton.dataset.estado);
    case 'editar-evento': return abrirModalEditar(id);
    case 'eliminar-evento': return eliminarEvento(id);
    case 'ver-comprobante': return verComprobante(id);
    case 'aprobar-venta': return aprobarVenta(id);
    case 'rechazar-venta': {
      const notas = prompt('Motivo del rechazo (opcional):') || '';
      return rechazarVenta(id, notas);
    }
  }
}

async function hacerLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    const data = await Api.loginAdmin(email, password);
    tokenAdmin = data.token;
    sessionStorage.setItem('admin_token',  data.token);
    sessionStorage.setItem('admin_nombre', data.admin.nombre);
    entrarAlPanel(data.admin.nombre);
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Ingresar';
  }
}

function entrarAlPanel(nombre) {
  document.getElementById('pantalla-login').style.display     = 'none';
  document.getElementById('pantalla-dashboard').style.display = 'block';
  document.getElementById('admin-nombre').textContent         = nombre || '';
  cargarDatos();
}

async function cargarDatos() {
  await Promise.all([cargarMetricas(), cargarPendientes(), cargarEventos()]);
}

let todasLasExtraidas = [];
let panelExtraidasAbierto = false;

function poblarSelectExtraer() {
  const select = document.getElementById('extraer-sorteo-select');
  if (!select) return;
  if (!todosLosEventos.length) {
    select.innerHTML = '<option value="">No hay eventos creados aún</option>';
    return;
  }
  select.innerHTML = todosLosEventos.map(s => {
    const mod = (s.modalidades && s.modalidades[0]) || {};
    const disponibles = (mod.total_boletas || 0) - (mod.boletas_vendidas || 0);
    return `<option value="${escapeHTML(mod.id || '')}" data-sorteo-id="${escapeHTML(s.id)}">${escapeHTML(s.nombre)} — ${escapeHTML(mod.nombre || '')} (${disponibles} disp.)</option>`;
  }).join('');
}

async function extraerBoletas() {
  const select = document.getElementById('extraer-sorteo-select');
  const modalidadId = select.value;
  const sorteoId = select.selectedOptions[0]?.dataset.sorteoId;
  const cantidad = parseInt(document.getElementById('extraer-cantidad').value);
  const telefono = document.getElementById('extraer-telefono').value.trim();
  const nombre = document.getElementById('extraer-nombre').value.trim();
  const msgEl = document.getElementById('extraer-mensaje');

  if (!modalidadId || !sorteoId) return mostrarToast('Selecciona un evento', 'error');
  if (!cantidad || cantidad < 1) return mostrarToast('Ingresa una cantidad válida', 'error');
  if (!telefono || telefono.length < 10) return mostrarToast('Ingresa un teléfono válido (10 dígitos)', 'error');

  const btn = document.getElementById('btn-extraer-boletas');
  btn.disabled = true;
  btn.textContent = 'Extrayendo...';
  msgEl.textContent = '';

  try {
    const data = await Api.extraerBoletas({ sorteo_id: sorteoId, modalidad_id: modalidadId, cantidad, telefono, nombre }, tokenAdmin);
    msgEl.style.color = '#085041';
    msgEl.textContent = `✓ ${data.message}`;
    document.getElementById('extraer-cantidad').value = '';
    document.getElementById('extraer-telefono').value = '';
    document.getElementById('extraer-nombre').value = '';
    cargarDatos();
  } catch (err) {
    msgEl.style.color = '#712B13';
    msgEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Extraer boletas';
  }
}

async function cargarBoletasExtraidas() {
  const lista = document.getElementById('extraidas-lista');
  lista.innerHTML = '<div class="empty-pagos">Cargando...</div>';
  try {
    todasLasExtraidas = await Api.getBoletasExtraidas(tokenAdmin);
    renderExtraidas();
  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">${escapeHTML(err.message)}</div>`;
  }
}

function renderExtraidas() {
  const lista = document.getElementById('extraidas-lista');
  const q = (document.getElementById('extraidas-buscar').value || '').toLowerCase().trim();

  let items = todasLasExtraidas;
  if (q) {
    items = items.filter(v => {
      const numTexto = Array.isArray(v.numeros) ? v.numeros.join('-') : '';
      return (v.codigo_unico || '').toLowerCase().includes(q)
          || numTexto.toLowerCase().includes(q)
          || (v.comprador_telefono || '').includes(q);
    });
  }

  if (!items.length) {
    lista.innerHTML = `<div class="empty-pagos">${q ? 'Sin resultados' : 'Aún no has extraído boletas'}</div>`;
    return;
  }

  const estadoTexto = { pendiente: 'Pendiente de pago', aprobado: 'Pago aprobado', rechazado: 'Pago rechazado' };

  lista.innerHTML = items.map(v => {
    const numTexto = Array.isArray(v.numeros) ? v.numeros.join('-') : (v.codigo_unico || '—');
    return `
      <div class="boleta-row" style="padding:10px">
        <div>
          <span class="num">${escapeHTML(numTexto)}</span>
          <span style="color:#888"> · ${escapeHTML(v.codigo_unico || '')}</span>
          <div style="color:#888;font-size:11px">${escapeHTML(v.comprador_telefono)} · ${tiempoRelativo(v.creado_en)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge ${badgeClaseEstado(v.estado_pago === 'aprobado' ? 'activo' : v.estado_pago === 'rechazado' ? 'cerrado' : 'borrador')}">${escapeHTML(estadoTexto[v.estado_pago] || v.estado_pago)}</span>
          ${v.estado_pago === 'pendiente' ? `
            <button class="btn-aprobar" data-admin-action="aprobar-extraida" data-id="${escapeHTML(v.venta_id)}">✓</button>
            <button class="btn-rechazar" data-admin-action="rechazar-extraida" data-id="${escapeHTML(v.venta_id)}">✕</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function aprobarVentaExtraida(id) {
  if (!confirm('¿Confirmar que ya te pagaron esta boleta?')) return;
  try {
    await Api.aprobarVenta(id, tokenAdmin);
    mostrarToast('✓ Boleta marcada como pagada', 'success');
    cargarBoletasExtraidas();
    cargarMetricas();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function rechazarVentaExtraida(id) {
  if (!confirm('¿Rechazar/liberar esta boleta?')) return;
  try {
    await Api.rechazarVenta(id, '', tokenAdmin);
    mostrarToast('Boleta liberada', 'warning');
    cargarBoletasExtraidas();
    cargarMetricas();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ── Gestión de eventos ──────────────────────────────────────────
async function cargarEventos() {
  const lista = document.getElementById('sorteos-lista');
  try {
    todosLosEventos = await Api.getSorteos(tokenAdmin);

    if (!todosLosEventos.length) {
      lista.innerHTML = '<div class="empty-pagos">Aún no has creado ningún evento</div>';
    } else {
      lista.innerHTML = todosLosEventos.map(s => {
        const mod = (s.modalidades && s.modalidades[0]) || {};
        return `
        <div class="sorteo-item">
          <div class="sorteo-item-top">
            <strong>${escapeHTML(s.nombre)} ${mod.tipo_boleta === 'rifa' ? '🎟️' : '🎱'}</strong>
            <span class="badge ${badgeClaseEstado(s.estado)}">${escapeHTML(s.estado)}</span>
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:8px">
            ${escapeHTML(mod.nombre || 'Sin modalidad')} · ${mod.boletas_vendidas || 0}/${mod.total_boletas || 0} vendidas · ${formatCOP(mod.precio_boleta || 0)} c/u
            ${mod.permite_elegir_numero ? ' · elige número' : ''}
          </div>
          <div class="sorteo-item-acciones">
            ${s.estado !== 'activo' ? `<button class="activar" data-admin-action="cambiar-estado" data-id="${escapeHTML(s.id)}" data-estado="activo">Activar</button>` : ''}
            ${s.estado === 'activo' ? `<button class="cerrar" data-admin-action="cambiar-estado" data-id="${escapeHTML(s.id)}" data-estado="cerrado">Cerrar ventas</button>` : ''}
            ${s.estado === 'cerrado' ? `<button data-admin-action="cambiar-estado" data-id="${escapeHTML(s.id)}" data-estado="finalizado">Marcar finalizado</button>` : ''}
            <button data-admin-action="editar-evento" data-id="${escapeHTML(s.id)}">✏ Editar</button>
            <button class="btn-eliminar-evento" data-admin-action="eliminar-evento" data-id="${escapeHTML(s.id)}">🗑 Eliminar</button>
          </div>
        </div>
      `}).join('');
    }

    poblarSelectCartones();
    poblarSelectBoletas();
    poblarSelectExtraer();
  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">Error cargando eventos: ${escapeHTML(err.message)}</div>`;
  }
}

function badgeClaseEstado(estado) {
  return {
    activo: 'badge-approved',
    borrador: 'badge-borrador',
    cerrado: 'badge-cerrado',
    finalizado: 'badge-finalizado',
    cancelado: 'badge-cerrado',
  }[estado] || 'badge-borrador';
}

async function cambiarEstado(id, estado) {
  const confirmaciones = {
    activo: '¿Activar este evento? Se mostrará a los compradores en la página pública.',
    cerrado: '¿Cerrar las ventas de este evento? Ya no se podrán comprar más boletas.',
    finalizado: '¿Marcar este evento como finalizado?',
  };
  if (!confirm(confirmaciones[estado] || '¿Confirmar cambio de estado?')) return;

  try {
    await Api.cambiarEstadoSorteo(id, estado, tokenAdmin);
    mostrarToast('✓ Estado actualizado', 'success');
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// Eliminar con doble confirmación (si el evento está activo o tiene ventas aprobadas,
// el backend responde pidiendo confirmación explícita)
async function eliminarEvento(id) {
  if (!confirm('¿Eliminar este evento? Esta acción no se puede deshacer.')) return;

  try {
    let resultado = await Api.eliminarEvento(id, false, tokenAdmin);

    if (resultado.requiereConfirmacion) {
      const confirmarDeNuevo = confirm(
        `⚠ ${resultado.mensaje}\n\n¿Confirmas que quieres eliminarlo de todas formas?`
      );
      if (!confirmarDeNuevo) return;
      resultado = await Api.eliminarEvento(id, true, tokenAdmin);
    }

    mostrarToast('✓ Evento eliminado', 'success');
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ── Editar evento (modal) ────────────────────────────────────────
function abrirModalEditar(id) {
  const evento = todosLosEventos.find(s => s.id === id);
  if (!evento) return;
  const mod = (evento.modalidades && evento.modalidades[0]) || {};

  document.getElementById('e-id').value = evento.id;
  document.getElementById('e-nombre').value = evento.nombre || '';
  document.getElementById('e-descripcion').value = evento.descripcion || '';
  document.getElementById('e-fecha').value = evento.fecha_sorteo
    ? new Date(evento.fecha_sorteo).toISOString().slice(0, 16) : '';
  document.getElementById('e-descripcion-premio').value = evento.descripcion_premio || '';
  document.getElementById('e-imagen').value = '';
  document.getElementById('e-modalidad-nombre').textContent = mod.nombre || '—';
  document.getElementById('e-nuevo-total').value = mod.total_boletas || '';
  document.getElementById('e-nuevo-total').dataset.modalidadId = mod.id || '';
  document.getElementById('e-nuevo-total').dataset.actual = mod.total_boletas || 0;
  document.getElementById('e-aumentar-msg').textContent = '';
  document.getElementById('e-permite-elegir').checked = !!mod.permite_elegir_numero;
  document.getElementById('e-permite-elegir').dataset.modalidadId = mod.id || '';

  document.getElementById('modal-editar').style.display = 'flex';
}

function cerrarModalEditar() {
  document.getElementById('modal-editar').style.display = 'none';
}

async function guardarEdicionEvento() {
  const id = document.getElementById('e-id').value;
  const datos = {
    nombre: document.getElementById('e-nombre').value.trim(),
    descripcion: document.getElementById('e-descripcion').value.trim(),
    fecha_sorteo: document.getElementById('e-fecha').value,
    descripcion_premio: document.getElementById('e-descripcion-premio').value.trim(),
  };
  const imagen = document.getElementById('e-imagen').files[0] || null;

  try {
    await Api.editarEvento(id, datos, imagen, tokenAdmin);
    mostrarToast('✓ Evento actualizado', 'success');
    cerrarModalEditar();
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function guardarPermiteElegir() {
  const checkbox = document.getElementById('e-permite-elegir');
  const modalidadId = checkbox.dataset.modalidadId;
  if (!modalidadId) return mostrarToast('Este evento no tiene modalidad asociada', 'error');

  try {
    const res = await fetch(`${API_URL}/modalidades/${modalidadId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permite_elegir_numero: checkbox.checked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar');
    mostrarToast('✓ Preferencia guardada', 'success');
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function aumentarBoletasDesdeModal() {
  const input = document.getElementById('e-nuevo-total');
  const modalidadId = input.dataset.modalidadId;
  const actual = parseInt(input.dataset.actual);
  const nuevoTotal = parseInt(input.value);
  const msgEl = document.getElementById('e-aumentar-msg');

  if (!modalidadId) { msgEl.style.color = '#712B13'; msgEl.textContent = 'Este evento no tiene modalidad asociada'; return; }
  if (!Number.isInteger(nuevoTotal) || nuevoTotal < 1) { msgEl.style.color = '#712B13'; msgEl.textContent = 'Ingresa un número válido'; return; }
  if (nuevoTotal <= actual) { msgEl.style.color = '#712B13'; msgEl.textContent = `El nuevo total debe ser mayor a ${actual}`; return; }

  msgEl.style.color = '#5F5E5A';
  msgEl.textContent = 'Generando boletas nuevas...';

  try {
    const data = await Api.aumentarBoletas(modalidadId, nuevoTotal, tokenAdmin);
    msgEl.style.color = '#085041';
    msgEl.textContent = `✓ ${data.message}`;
    input.dataset.actual = nuevoTotal;
    cargarDatos();
  } catch (err) {
    msgEl.style.color = '#712B13';
    msgEl.textContent = err.message;
  }
}

// ── Cartones ─────────────────────────────────────────────────────
function poblarSelectCartones() {
  const select = document.getElementById('cartones-sorteo-select');
  const seleccionPrevia = select.value;

  if (!todosLosEventos.length) {
    select.innerHTML = '<option value="">No hay eventos creados aún</option>';
    document.getElementById('cartones-progreso').textContent = '';
    return;
  }

  select.innerHTML = todosLosEventos.map(s => {
    const mod = (s.modalidades && s.modalidades[0]) || {};
    return `<option value="${escapeHTML(mod.id || '')}" data-sorteo-id="${escapeHTML(s.id)}">${escapeHTML(s.nombre)} — ${escapeHTML(mod.nombre || '')} (${escapeHTML(s.estado)})</option>`;
  }).join('');

  if (seleccionPrevia && [...select.options].some(o => o.value === seleccionPrevia)) {
    select.value = seleccionPrevia;
  }

  actualizarProgresoCartones();
}

function modalidadActualCartones() {
  const select = document.getElementById('cartones-sorteo-select');
  const modalidadId = select.value;
  for (const s of todosLosEventos) {
    const mod = (s.modalidades || []).find(m => m.id === modalidadId);
    if (mod) return { evento: s, modalidad: mod };
  }
  return null;
}

function actualizarProgresoCartones() {
  const info = modalidadActualCartones();
  const progreso = document.getElementById('cartones-progreso');
  if (!info) { progreso.textContent = ''; return; }
  const { modalidad } = info;
  const restantes = modalidad.total_boletas - (modalidad.boletas_generadas ?? modalidad.total_boletas);
  progreso.textContent = `${modalidad.boletas_vendidas || 0}/${modalidad.total_boletas} vendidas · tipo: ${modalidad.tipo_boleta}`;
}

async function generarCartones() {
  const modalidadId = document.getElementById('cartones-sorteo-select').value;
  const cantidad  = parseInt(document.getElementById('cartones-cantidad').value);
  const mensajeEl = document.getElementById('cartones-mensaje');

  if (!modalidadId) return mostrarToast('Primero crea o selecciona un evento', 'error');
  if (!cantidad || cantidad < 1) return mostrarToast('Ingresa una cantidad válida', 'error');

  const btn = document.getElementById('btn-generar-cartones');
  btn.disabled = true;
  btn.textContent = 'Generando...';
  mensajeEl.textContent = '';

  try {
    const data = await Api.generarCartones(modalidadId, cantidad, tokenAdmin);
    mensajeEl.style.color = '#085041';
    mensajeEl.textContent = `✓ ${data.message}`;
    document.getElementById('cartones-cantidad').value = '';
    await cargarEventos();
  } catch (err) {
    mensajeEl.style.color = '#712B13';
    mensajeEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Generar';
  }
}

async function subirCartonPDF(e) {
  const archivo  = e.target.files[0];
  const select   = document.getElementById('cartones-sorteo-select');
  const sorteoId = select.selectedOptions[0]?.dataset.sorteoId;
  const modalidadId = select.value;
  const mensajeEl = document.getElementById('cartones-mensaje');
  if (!archivo) return;

  if (!sorteoId) {
    mostrarToast('Primero selecciona un evento', 'error');
    e.target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('sorteo_id', sorteoId);
  if (modalidadId) formData.append('modalidad_id', modalidadId);
  formData.append('pdf', archivo);

  mensajeEl.style.color = '#5F5E5A';
  mensajeEl.textContent = 'Subiendo PDF...';

  try {
    const data = await Api.subirCarton(formData, tokenAdmin);
    mensajeEl.style.color = '#085041';
    mensajeEl.textContent = `✓ Cartón subido: ${data.codigo_unico}`;
    await cargarEventos();
  } catch (err) {
    mensajeEl.style.color = '#712B13';
    mensajeEl.textContent = err.message;
  } finally {
    e.target.value = '';
  }
}

// ── Consultar boletas ────────────────────────────────────────────
function poblarSelectBoletas() {
  const select = document.getElementById('boletas-sorteo-select');
  const seleccionPrevia = select.value;

  if (!todosLosEventos.length) {
    select.innerHTML = '<option value="">No hay eventos creados aún</option>';
    return;
  }

  select.innerHTML = todosLosEventos.map(s =>
    `<option value="${escapeHTML(s.id)}">${escapeHTML(s.nombre)} (${escapeHTML(s.estado)})</option>`
  ).join('');

  if (seleccionPrevia && [...select.options].some(o => o.value === seleccionPrevia)) {
    select.value = seleccionPrevia;
  }
}

async function buscarBoletas() {
  const sorteoId = document.getElementById('boletas-sorteo-select').value;
  const numero   = document.getElementById('boletas-buscar-numero').value.trim();
  const telefono = document.getElementById('boletas-buscar-telefono').value.trim();
  const resultado = document.getElementById('boletas-resultado');

  if (!sorteoId) { resultado.innerHTML = ''; return; }

  resultado.innerHTML = '<div class="empty-pagos">Buscando...</div>';

  try {
    const data = await Api.getBoletasEvento(sorteoId, { numero, telefono }, tokenAdmin);

    if (!data.boletas.length) {
      resultado.innerHTML = '<div class="empty-pagos">Sin resultados</div>';
      return;
    }

    resultado.innerHTML = data.boletas.map(b => {
      const numerosTexto = Array.isArray(b.numeros)
        ? (b.tipo_boleta === 'rifa' ? b.numeros.join('-') : `Cartón ${b.codigo_unico}`)
        : b.codigo_unico;
      return `
        <div class="boleta-row">
          <div>
            <span class="num">${escapeHTML(numerosTexto)}</span>
            <span style="color:#888"> · ${escapeHTML(b.codigo_unico)}</span>
          </div>
          <div style="text-align:right">
            ${b.vendido
              ? `<div>${escapeHTML(b.comprador_nombre || '—')} <span class="vendido">(${escapeHTML(b.estado_pago || 'vendido')})</span></div>
                 <div style="color:#888">${escapeHTML(b.comprador_telefono || '')}</div>`
              : `<span class="libre">Disponible</span>`}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    resultado.innerHTML = `<div class="empty-pagos" style="color:#D85A30">${escapeHTML(err.message)}</div>`;
  }
}

// ── Dashboard / pagos pendientes ─────────────────────────────────
async function cargarMetricas() {
  try {
    const data = await Api.getDashboard(tokenAdmin);
    document.getElementById('m-boletas').textContent     = data.boletas_vendidas;
    document.getElementById('m-dinero').textContent      = formatCOP(data.dinero_recaudado);
    document.getElementById('m-compradores').textContent = data.compradores_unicos;
    document.getElementById('m-pendientes').textContent  = data.pagos_pendientes;

    try {
      const activos = await Api.getSorteosActivos();
      if (!activos.length) throw new Error('sin activos');

      document.getElementById('sorteo-info').innerHTML = activos.map(sorteo => {
        const mod = (sorteo.modalidades && sorteo.modalidades[0]) || {};
        const pct = mod.total_boletas
          ? Math.max(0, Math.min(100, Math.round((mod.boletas_vendidas / mod.total_boletas) * 100)))
          : 0;
        return `
          <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:0.5px solid rgba(0,0,0,.06)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:15px">${escapeHTML(sorteo.nombre)}</strong>
              <span class="badge badge-approved">Activo</span>
            </div>
            <div class="progress-wrap">
              <div class="progress-bar" style="width:${pct}%"></div>
            </div>
            <div class="progress-meta">
              <span>${mod.boletas_vendidas || 0} / ${mod.total_boletas || 0} boletas</span>
              <span>${formatFecha(sorteo.fecha_sorteo)}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch {
      document.getElementById('sorteo-info').innerHTML =
        '<p style="color:#888;font-size:14px">No hay eventos activos. Crea uno.</p>';
    }
  } catch (err) {
    console.error('Error métricas:', err);
  }
}

async function cargarPendientes() {
  const lista = document.getElementById('pagos-lista');
  try {
    const pagina = await Api.getVentasPendientes(tokenAdmin, pendientesOffset);
    pendientesTotal = pagina.total;
    if (!pagina.ventas.length && pendientesOffset > 0 && pendientesTotal > 0) {
      pendientesOffset = Math.floor((pendientesTotal - 1) / PENDIENTES_POR_PAGINA) * PENDIENTES_POR_PAGINA;
      return cargarPendientes();
    }
    pendientesCache = pagina.ventas;
    const ventas = pendientesCache;
    const inicio = pendientesTotal ? pendientesOffset + 1 : 0;
    const fin = Math.min(pendientesOffset + ventas.length, pendientesTotal);
    document.getElementById('pagos-pagina').textContent = `${inicio}-${fin} de ${pendientesTotal}`;
    document.getElementById('btn-pagos-anterior').disabled = pendientesOffset === 0;
    document.getElementById('btn-pagos-siguiente').disabled = pendientesOffset + ventas.length >= pendientesTotal;

    if (!ventas.length) {
      lista.innerHTML = '<div class="empty-pagos">✅ No hay pagos pendientes</div>';
      return;
    }

    lista.innerHTML = ventas.map(v => `
      <div class="pago-item" id="pago-${escapeHTML(v.id)}">
        <div class="avatar">${escapeHTML(iniciales(v.comprador_nombre || ''))}</div>
        <div class="pago-meta">
          <strong>${escapeHTML(v.comprador_nombre)}</strong>
          <span>${v.cantidad} boleta(s) · ${formatMetodo(v.metodo_pago)} · ${tiempoRelativo(v.creado_en)}</span>
          <span style="display:block;color:#3C3489;font-weight:500">${formatCOP(v.total_pagado)}</span>
        </div>
        <div class="pago-acciones">
          <button class="btn-action" data-admin-action="ver-comprobante" data-id="${escapeHTML(v.id)}" style="padding:6px 10px;font-size:12px">
            👁 Ver
          </button>
          <button class="btn-aprobar" data-admin-action="aprobar-venta" data-id="${escapeHTML(v.id)}">
            ✓
          </button>
          <button class="btn-rechazar" data-admin-action="rechazar-venta" data-id="${escapeHTML(v.id)}">
            ✕
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">Error cargando pagos: ${escapeHTML(err.message)}</div>`;
  }
}

function cambiarPaginaPendientes(direccion) {
  const siguienteOffset = pendientesOffset + direccion * PENDIENTES_POR_PAGINA;
  if (siguienteOffset < 0 || siguienteOffset >= pendientesTotal) return;
  pendientesOffset = siguienteOffset;
  cargarPendientes();
}

async function aprobarVenta(id) {
  if (!confirm('¿Aprobar este pago y enviar la boleta por WhatsApp?')) return;
  try {
    await Api.aprobarVenta(id, tokenAdmin);
    cerrarModal();
    mostrarToast('✓ Venta aprobada. Boleta asignada correctamente.', 'success');
    await Promise.all([cargarPendientes(), cargarMetricas()]);
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function rechazarVenta(id, notas) {
  if (!confirm('¿Rechazar este pago?')) return;
  try {
    await Api.rechazarVenta(id, notas, tokenAdmin);
    cerrarModal();
    mostrarToast('Venta rechazada.', 'warning');
    await Promise.all([cargarPendientes(), cargarMetricas()]);
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

async function crearEvento() {
  const tipoBoleta = document.getElementById('s-tipo-boleta').value;

  const datos = {
    nombre:              document.getElementById('s-nombre').value.trim(),
    descripcion:         document.getElementById('s-descripcion').value.trim(),
    fecha_sorteo:        document.getElementById('s-fecha').value,
    precio_boleta:       parseFloat(document.getElementById('s-precio').value),
    total_boletas:       parseInt(document.getElementById('s-total').value),
    descripcion_premio:  document.getElementById('s-descripcion-premio').value.trim(),
    tipo_boleta:         tipoBoleta,
    modalidad_nombre:    document.getElementById('s-modalidad-nombre').value.trim(),
    permite_elegir_numero: document.getElementById('s-permite-elegir').checked,
  };

  if (!datos.nombre || !datos.fecha_sorteo || !datos.precio_boleta || !datos.total_boletas)
    return mostrarToast('Completa nombre, fecha, precio y total de boletas', 'error');

  if (tipoBoleta === 'rifa') {
    datos.config = {
      digitos: parseInt(document.getElementById('s-rifa-digitos').value) || 3,
      cantidad_numeros: parseInt(document.getElementById('s-rifa-cantidad').value) || 1,
      modo: document.getElementById('s-rifa-modo').value,
    };
    datos.metodo_resultado = document.getElementById('s-metodo-resultado').value;
    datos.fuente_resultado = document.getElementById('s-fuente-resultado').value.trim();
  }

  const imagen = document.getElementById('s-imagen').files[0] || null;

  const btn = document.getElementById('btn-crear-sorteo');
  btn.disabled = true;
  btn.textContent = 'Creando...';

  try {
    await Api.crearEvento(datos, imagen, tokenAdmin);
    mostrarToast('✓ Evento creado exitosamente', 'success');
    document.getElementById('form-sorteo').style.display = 'none';
    ['s-nombre','s-descripcion','s-fecha','s-precio','s-total','s-descripcion-premio',
     's-modalidad-nombre','s-rifa-digitos','s-rifa-cantidad','s-fuente-resultado']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('s-imagen').value = '';
    document.getElementById('s-permite-elegir').checked = false;
    document.getElementById('s-tipo-boleta').value = 'bingo';
    document.getElementById('s-rifa-extra').style.display = 'none';
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear evento';
  }
}

async function verComprobante(id) {
  const fila = document.getElementById(`pago-${id}`);
  if (!fila) return;

  ventaModal = id;
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal-titulo').textContent  = 'Cargando...';
  document.getElementById('modal-detalle').textContent = '';
  const img = document.getElementById('modal-img');
  const pdf = document.getElementById('modal-pdf');
  img.style.display = 'none';
  img.src = '';
  pdf.style.display = 'none';
  pdf.src = 'about:blank';
  document.getElementById('modal-validacion')?.remove();

  try {
    const v = pendientesCache.find(venta => venta.id === id);
    if (!v) return;

    document.getElementById('modal-titulo').textContent  = v.comprador_nombre;
    document.getElementById('modal-detalle').textContent =
      `${v.cantidad} boleta(s) · ${formatMetodo(v.metodo_pago)} · ${formatCOP(v.total_pagado)}`;

    const comprobanteUrl = safeCloudinaryUrl(v.comprobante_url);
    if (comprobanteUrl) {
      if (v.comprobante_format === 'pdf' || /\.pdf(?:$|\?)/i.test(v.comprobante_url)) {
        pdf.src = comprobanteUrl;
        pdf.style.display = 'block';
      } else {
        img.src = comprobanteUrl;
        img.style.display = 'block';
      }
    }

    const alertaMonto = v.monto_declarado &&
      Math.abs(parseFloat(v.monto_declarado) - parseFloat(v.total_pagado)) > 100;

    const hayDatosOCR = v.referencia_pago || v.nombre_titular ||
                        v.monto_declarado || v.banco_origen;

    const estadoOCR = hayDatosOCR
      ? `<div style="background:#E1F5EE;border-radius:6px;padding:6px 10px;
                     margin-bottom:10px;font-size:11px;color:#085041">
           🤖 Datos extraídos automáticamente del comprobante
         </div>`
      : `<div style="background:#FAEEDA;border-radius:6px;padding:6px 10px;
                     margin-bottom:10px;font-size:11px;color:#633806">
           ⏳ Procesando imagen... Recarga en 30 seg para ver los datos.
         </div>`;

    const filas = [
      { label: 'Banco detectado',   valor: v.banco_origen      || '—', icon: '🏦' },
      { label: 'Referencia',        valor: v.referencia_pago   || '—', icon: '🔢' },
      { label: 'Titular remitente', valor: v.nombre_titular    || '—', icon: '👤' },
      { label: 'Monto detectado',   valor: v.monto_declarado
          ? formatCOP(v.monto_declarado) + (alertaMonto ? ' ⚠' : ' ✓')
          : '—',
        icon: '💰',
        color: alertaMonto ? '#D85A30' : v.monto_declarado ? '#1D9E75' : '',
      },
      { label: 'Fecha transacción', valor: v.fecha_transaccion || '—', icon: '📅' },
      { label: 'Monto esperado',    valor: formatCOP(v.total_pagado), icon: '🎯',
        color: '#1D9E75' },
      { label: 'Teléfono',          valor: v.comprador_telefono, icon: '📱' },
      { label: 'Método de pago',    valor: formatMetodo(v.metodo_pago), icon: '💳' },
    ];

    img.insertAdjacentHTML('afterend', `
      <div id="modal-validacion" style="
        background:#F7F6F2;border-radius:10px;padding:14px;
        margin-top:12px;border:0.5px solid #CECBF6
      ">
        <p style="font-size:13px;font-weight:500;color:#3C3489;margin-bottom:8px">
          📋 Resumen del pago
        </p>
        ${estadoOCR}
        <div style="display:grid;gap:6px">
          ${filas.map(f => `
            <div style="display:flex;justify-content:space-between;
                        align-items:center;font-size:13px;
                        padding:6px 0;border-bottom:0.5px solid #E8E6DF">
              <span style="color:#888">${f.icon} ${f.label}:</span>
              <strong style="${f.color ? `color:${f.color}` : 'color:#2C2C2A'}">
                ${escapeHTML(f.valor)}
              </strong>
            </div>
          `).join('')}
        </div>
        ${alertaMonto ? `
          <div style="background:#FAECE7;border-radius:6px;padding:8px;
                      margin-top:10px;font-size:12px;color:#712B13">
            ⚠ El monto detectado no coincide. Verifica antes de aprobar.
          </div>
        ` : hayDatosOCR ? `
          <div style="background:#E1F5EE;border-radius:6px;padding:8px;
                      margin-top:10px;font-size:12px;color:#085041">
            ✓ Verifica la referencia <strong>${escapeHTML(v.referencia_pago || '—')}</strong>
            en tu app ${formatMetodo(v.metodo_pago)} y aprueba si es correcto.
          </div>
        ` : ''}
      </div>
    `);

  } catch(err) {
    console.error('Error:', err);
  }
}
function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('modal-validacion')?.remove();
  document.getElementById('modal-pdf').src = 'about:blank';
  ventaModal = null;
}

function iniciales(nombre) {
  return String(nombre || '').split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
}

function escapeHTML(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function formatMetodo(m) {
  return { nequi: 'Nequi', bancolombia: 'Bancolombia', transferencia: 'Transferencia' }[m] || 'Otro';
}

function safeCloudinaryUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' ? url.href : '';
  } catch {
    return '';
  }
}

function tiempoRelativo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ahora mismo';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `hace ${h}h`;
  return `hace ${Math.floor(h/24)}d`;
}

function mostrarToast(msg, tipo = 'success') {
  document.getElementById('toast-admin')?.remove();
  const estilos = {
    success: { grad: 'linear-gradient(135deg,#22C97A,#17A567)', icon: '✓' },
    error:   { grad: 'linear-gradient(135deg,#EF4C54,#C4303A)', icon: '✕' },
    warning: { grad: 'linear-gradient(135deg,#F5A623,#C97D0A)', icon: '⚠' },
  };
  const e = estilos[tipo] || estilos.success;
  const t = document.createElement('div');
  t.id = 'toast-admin';
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${e.grad};color:#fff;padding:14px 22px;
    border-radius:14px;font-size:14px;font-weight:500;z-index:200;
    box-shadow:0 8px 28px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08) inset;
    max-width:90vw;text-align:center;display:flex;align-items:center;gap:10px;
    animation:toastIn .25s ease-out`;
  t.innerHTML = `<span style="font-size:16px">${e.icon}</span><span>${escapeHTML(msg)}</span>`;
  document.body.appendChild(t);

  if (!document.getElementById('toast-anim-style')) {
    const style = document.createElement('style');
    style.id = 'toast-anim-style';
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translate(-50%,10px); } to { opacity:1; transform:translate(-50%,0); } }`;
    document.head.appendChild(style);
  }

  setTimeout(() => t.remove(), 4000);
}
