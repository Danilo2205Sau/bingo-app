// ============================================
// admin.js — Lógica del panel de administración
// ============================================

let tokenAdmin   = null;
let ventaModal   = null;
let todosLosEventos = [];

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

  // Consultar boletas
  document.getElementById('btn-buscar-boletas').addEventListener('click', buscarBoletas);
  document.getElementById('boletas-sorteo-select').addEventListener('change', buscarBoletas);
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
            <strong>${s.nombre} ${mod.tipo_boleta === 'rifa' ? '🎟️' : '🎱'}</strong>
            <span class="badge ${badgeClaseEstado(s.estado)}">${s.estado}</span>
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:8px">
            ${mod.nombre || 'Sin modalidad'} · ${mod.boletas_vendidas || 0}/${mod.total_boletas || 0} vendidas · ${formatCOP(mod.precio_boleta || 0)} c/u
            ${mod.permite_elegir_numero ? ' · elige número' : ''}
          </div>
          <div class="sorteo-item-acciones">
            ${s.estado !== 'activo' ? `<button class="activar" onclick="cambiarEstado('${s.id}','activo')">Activar</button>` : ''}
            ${s.estado === 'activo' ? `<button class="cerrar" onclick="cambiarEstado('${s.id}','cerrado')">Cerrar ventas</button>` : ''}
            ${s.estado === 'cerrado' ? `<button onclick="cambiarEstado('${s.id}','finalizado')">Marcar finalizado</button>` : ''}
            <button onclick="abrirModalEditar('${s.id}')">✏ Editar</button>
            <button class="btn-eliminar-evento" onclick="eliminarEvento('${s.id}')">🗑 Eliminar</button>
          </div>
        </div>
      `}).join('');
    }

    poblarSelectCartones();
    poblarSelectBoletas();
  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">Error cargando eventos: ${err.message}</div>`;
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
    return `<option value="${mod.id || ''}" data-sorteo-id="${s.id}">${s.nombre} — ${mod.nombre || ''} (${s.estado})</option>`;
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
    `<option value="${s.id}">${s.nombre} (${s.estado})</option>`
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
            <span class="num">${numerosTexto}</span>
            <span style="color:#888"> · ${b.codigo_unico}</span>
          </div>
          <div style="text-align:right">
            ${b.vendido
              ? `<div>${b.comprador_nombre || '—'} <span class="vendido">(${b.estado_pago || 'vendido'})</span></div>
                 <div style="color:#888">${b.comprador_telefono || ''}</div>`
              : `<span class="libre">Disponible</span>`}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    resultado.innerHTML = `<div class="empty-pagos" style="color:#D85A30">${err.message}</div>`;
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
        const pct = mod.total_boletas ? Math.round((mod.boletas_vendidas / mod.total_boletas) * 100) : 0;
        return `
          <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:0.5px solid rgba(0,0,0,.06)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:15px">${sorteo.nombre}</strong>
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
    const ventas = await Api.getVentasPendientes(tokenAdmin);

    if (!ventas.length) {
      lista.innerHTML = '<div class="empty-pagos">✅ No hay pagos pendientes</div>';
      return;
    }

    lista.innerHTML = ventas.map(v => `
      <div class="pago-item" id="pago-${v.id}">
        <div class="avatar">${iniciales(v.comprador_nombre)}</div>
        <div class="pago-meta">
          <strong>${v.comprador_nombre}</strong>
          <span>${v.cantidad} boleta(s) · ${formatMetodo(v.metodo_pago)} · ${tiempoRelativo(v.creado_en)}</span>
          <span style="display:block;color:#3C3489;font-weight:500">${formatCOP(v.total_pagado)}</span>
        </div>
        <div class="pago-acciones">
          <button class="btn-action" onclick="verComprobante('${v.id}')" style="padding:6px 10px;font-size:12px">
            👁 Ver
          </button>
          <button class="btn-aprobar" onclick="aprobarVenta('${v.id}')">
            ✓
          </button>
          <button class="btn-rechazar" onclick="rechazarVenta('${v.id}','')">
            ✕
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">Error cargando pagos: ${err.message}</div>`;
  }
}

async function aprobarVenta(id) {
  if (!confirm('¿Aprobar este pago y enviar la boleta por WhatsApp?')) return;
  try {
    await Api.aprobarVenta(id, tokenAdmin);
    cerrarModal();
    mostrarToast('✓ Venta aprobada. Boleta asignada correctamente.', 'success');
    document.getElementById(`pago-${id}`)?.remove();
    if (!document.querySelectorAll('.pago-item').length) {
      document.getElementById('pagos-lista').innerHTML =
        '<div class="empty-pagos">✅ No hay pagos pendientes</div>';
    }
    cargarMetricas();
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
    document.getElementById(`pago-${id}`)?.remove();
    cargarMetricas();
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
  img.style.display = 'none';
  img.src = '';
  document.getElementById('modal-validacion')?.remove();

  try {
    const token = sessionStorage.getItem('admin_token');
    const res = await fetch(`${API_URL}/admin/ventas-pendientes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ventas = await res.json();
    const v = ventas.find(venta => venta.id === id);
    if (!v) return;

    document.getElementById('modal-titulo').textContent  = v.comprador_nombre;
    document.getElementById('modal-detalle').textContent =
      `${v.cantidad} boleta(s) · ${formatMetodo(v.metodo_pago)} · ${formatCOP(v.total_pagado)}`;

    if (v.comprobante_url) {
      img.src = v.comprobante_url;
      img.style.display = 'block';
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
                ${f.valor}
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
            ✓ Verifica la referencia <strong>${v.referencia_pago || '—'}</strong>
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
  ventaModal = null;
}

function iniciales(nombre) {
  return nombre.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
}

function formatMetodo(m) {
  return { nequi: 'Nequi', bancolombia: 'Bancolombia', transferencia: 'Transferencia' }[m] || m;
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
  const colores = { success:'#085041', error:'#712B13', warning:'#633806' };
  const t = document.createElement('div');
  t.id = 'toast-admin';
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${colores[tipo]};color:#fff;padding:12px 20px;
    border-radius:10px;font-size:14px;z-index:200;
    box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:90vw;text-align:center`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
