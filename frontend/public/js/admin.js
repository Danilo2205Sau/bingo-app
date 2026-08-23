// ============================================
// admin.js — Lógica del panel de administración
// ============================================

let tokenAdmin   = null;
let ventaModal   = null;

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

  document.getElementById('btn-crear-sorteo').addEventListener('click', crearSorteo);

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

let todosLosSorteos = [];

async function cargarDatos() {
  await Promise.all([cargarMetricas(), cargarPendientes(), cargarSorteos()]);
}

// ── Gestión de sorteos ──────────────────────────────────────────
async function cargarSorteos() {
  const lista = document.getElementById('sorteos-lista');
  try {
    todosLosSorteos = await Api.getSorteos(tokenAdmin);

    if (!todosLosSorteos.length) {
      lista.innerHTML = '<div class="empty-pagos">Aún no has creado ningún sorteo</div>';
    } else {
      lista.innerHTML = todosLosSorteos.map(s => `
        <div class="sorteo-item">
          <div class="sorteo-item-top">
            <strong>${s.nombre}</strong>
            <span class="badge ${badgeClaseEstado(s.estado)}">${s.estado}</span>
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:8px">
            ${s.cartones_generados}/${s.total_cartones} cartones generados · ${formatCOP(s.precio_boleta)} c/u
          </div>
          <div class="sorteo-item-acciones">
            ${s.estado !== 'activo' ? `<button class="activar" onclick="cambiarEstado('${s.id}','activo')">Activar</button>` : ''}
            ${s.estado === 'activo' ? `<button class="cerrar" onclick="cambiarEstado('${s.id}','cerrado')">Cerrar ventas</button>` : ''}
            ${s.estado === 'cerrado' ? `<button onclick="cambiarEstado('${s.id}','finalizado')">Marcar finalizado</button>` : ''}
            <button onclick="aumentarLimiteCartones('${s.id}', ${s.total_cartones})">✏ Aumentar límite</button>
          </div>
        </div>
      `).join('');
    }

    poblarSelectCartones();
  } catch (err) {
    lista.innerHTML = `<div class="empty-pagos" style="color:#D85A30">Error cargando sorteos: ${err.message}</div>`;
  }
}

function badgeClaseEstado(estado) {
  return {
    activo: 'badge-approved',
    borrador: 'badge-borrador',
    cerrado: 'badge-cerrado',
    finalizado: 'badge-finalizado',
  }[estado] || 'badge-borrador';
}

async function cambiarEstado(id, estado) {
  const confirmaciones = {
    activo: '¿Activar este sorteo? Se mostrará a los compradores en la página pública.',
    cerrado: '¿Cerrar las ventas de este sorteo? Ya no se podrán comprar más boletas.',
    finalizado: '¿Marcar este sorteo como finalizado?',
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

async function aumentarLimiteCartones(id, totalActual) {
  const input = prompt(`Límite actual: ${totalActual} cartones.\n¿Cuál es el nuevo total? (debe ser mayor a ${totalActual})`, totalActual);
  if (input === null) return; // canceló el prompt

  const nuevoTotal = parseInt(input);
  if (!Number.isInteger(nuevoTotal) || nuevoTotal < 1)
    return mostrarToast('Ingresa un número válido', 'error');
  if (nuevoTotal <= totalActual)
    return mostrarToast(`El nuevo total debe ser mayor a ${totalActual}`, 'error');

  try {
    await Api.actualizarTotalCartones(id, nuevoTotal, tokenAdmin);
    mostrarToast(`✓ Límite aumentado a ${nuevoTotal} cartones`, 'success');
    cargarDatos();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ── Cartones ─────────────────────────────────────────────────────
function poblarSelectCartones() {
  const select = document.getElementById('cartones-sorteo-select');
  const seleccionPrevia = select.value;

  if (!todosLosSorteos.length) {
    select.innerHTML = '<option value="">No hay sorteos creados aún</option>';
    document.getElementById('cartones-progreso').textContent = '';
    return;
  }

  select.innerHTML = todosLosSorteos.map(s =>
    `<option value="${s.id}">${s.nombre} (${s.estado})</option>`
  ).join('');

  if (seleccionPrevia && todosLosSorteos.some(s => s.id === seleccionPrevia)) {
    select.value = seleccionPrevia;
  }

  actualizarProgresoCartones();
}

function actualizarProgresoCartones() {
  const select = document.getElementById('cartones-sorteo-select');
  const sorteo = todosLosSorteos.find(s => s.id === select.value);
  const progreso = document.getElementById('cartones-progreso');
  if (!sorteo) { progreso.textContent = ''; return; }

  const restantes = sorteo.total_cartones - sorteo.cartones_generados;
  progreso.textContent = restantes > 0
    ? `${sorteo.cartones_generados}/${sorteo.total_cartones} generados · puedes generar ${restantes} más`
    : `${sorteo.cartones_generados}/${sorteo.total_cartones} generados · ya no puedes generar más para este sorteo`;
}

async function generarCartones() {
  const sorteoId  = document.getElementById('cartones-sorteo-select').value;
  const cantidad  = parseInt(document.getElementById('cartones-cantidad').value);
  const mensajeEl = document.getElementById('cartones-mensaje');

  if (!sorteoId) return mostrarToast('Primero crea o selecciona un sorteo', 'error');
  if (!cantidad || cantidad < 1) return mostrarToast('Ingresa una cantidad válida', 'error');

  const btn = document.getElementById('btn-generar-cartones');
  btn.disabled = true;
  btn.textContent = 'Generando...';
  mensajeEl.textContent = '';

  try {
    const data = await Api.generarCartones(sorteoId, cantidad, tokenAdmin);
    mensajeEl.style.color = '#085041';
    mensajeEl.textContent = `✓ ${data.message}`;
    document.getElementById('cartones-cantidad').value = '';
    await cargarSorteos();
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
  const sorteoId = document.getElementById('cartones-sorteo-select').value;
  const mensajeEl = document.getElementById('cartones-mensaje');
  if (!archivo) return;

  if (!sorteoId) {
    mostrarToast('Primero selecciona un sorteo', 'error');
    e.target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('sorteo_id', sorteoId);
  formData.append('pdf', archivo);

  mensajeEl.style.color = '#5F5E5A';
  mensajeEl.textContent = 'Subiendo PDF...';

  try {
    const data = await Api.subirCarton(formData, tokenAdmin);
    mensajeEl.style.color = '#085041';
    mensajeEl.textContent = `✓ Cartón subido: ${data.codigo_unico}`;
    await cargarSorteos();
  } catch (err) {
    mensajeEl.style.color = '#712B13';
    mensajeEl.textContent = err.message;
  } finally {
    e.target.value = '';
  }
}

async function cargarMetricas() {
  try {
    const data = await Api.getDashboard(tokenAdmin);
    document.getElementById('m-boletas').textContent     = data.boletas_vendidas;
    document.getElementById('m-dinero').textContent      = formatCOP(data.dinero_recaudado);
    document.getElementById('m-compradores').textContent = data.compradores_unicos;
    document.getElementById('m-pendientes').textContent  = data.pagos_pendientes;

    try {
      const sorteo = await Api.getSorteoActivo();
      const pct = Math.round((sorteo.cartones_vendidos / sorteo.total_cartones) * 100);
      document.getElementById('sorteo-info').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:15px">${sorteo.nombre}</strong>
          <span class="badge badge-approved">Activo</span>
        </div>
        <div class="progress-wrap">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="progress-meta">
          <span>${sorteo.cartones_vendidos} / ${sorteo.total_cartones} boletas</span>
          <span>${formatFecha(sorteo.fecha_sorteo)}</span>
        </div>
      `;
    } catch {
      document.getElementById('sorteo-info').innerHTML =
        '<p style="color:#888;font-size:14px">No hay sorteo activo. Crea uno.</p>';
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
  if (!confirm('¿Aprobar este pago y enviar el cartón por WhatsApp?')) return;
  try {
    await Api.aprobarVenta(id, tokenAdmin);
    cerrarModal();
    mostrarToast('✓ Venta aprobada. Cartón asignado correctamente.', 'success');
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

async function crearSorteo() {
  const datos = {
    nombre:             document.getElementById('s-nombre').value.trim(),
    premio_descripcion: document.getElementById('s-premio').value.trim(),
    fecha_sorteo:       document.getElementById('s-fecha').value,
    precio_boleta:      parseFloat(document.getElementById('s-precio').value),
    total_cartones:     parseInt(document.getElementById('s-total').value),
  };

  if (!datos.nombre || !datos.fecha_sorteo || !datos.precio_boleta || !datos.total_cartones)
    return mostrarToast('Completa todos los campos del sorteo', 'error');

  try {
    await Api.crearSorteo(datos, tokenAdmin);
    mostrarToast('✓ Sorteo creado exitosamente', 'success');
    document.getElementById('form-sorteo').style.display = 'none';
    ['s-nombre','s-premio','s-fecha','s-precio','s-total']
      .forEach(id => document.getElementById(id).value = '');
    cargarMetricas();
  } catch (err) {
    mostrarToast(err.message, 'error');
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