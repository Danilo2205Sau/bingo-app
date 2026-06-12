// ============================================
// admin.js — Lógica del panel de administración
// ============================================

let tokenAdmin   = null;
let ventaModal   = null;   // venta actualmente abierta en el modal

// ── Inicializar ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Si hay token guardado en sessionStorage, entrar directo
  const tokenGuardado = sessionStorage.getItem('admin_token');
  const nombreGuardado = sessionStorage.getItem('admin_nombre');
  if (tokenGuardado) {
    tokenAdmin = tokenGuardado;
    entrarAlPanel(nombreGuardado);
  }
  inicializarEventos();
});

function inicializarEventos() {

  // Login
  document.getElementById('btn-login').addEventListener('click', hacerLogin);
  document.getElementById('login-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hacerLogin();
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.clear();
    tokenAdmin = null;
    document.getElementById('pantalla-dashboard').style.display = 'none';
    document.getElementById('pantalla-login').style.display     = 'flex';
  });

  // Recargar datos
  document.getElementById('btn-recargar').addEventListener('click', cargarDatos);

  // Toggle form nuevo sorteo
  document.getElementById('btn-toggle-form').addEventListener('click', () => {
    const form = document.getElementById('form-sorteo');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-cancelar-form').addEventListener('click', () => {
    document.getElementById('form-sorteo').style.display = 'none';
  });

  // Crear sorteo
  document.getElementById('btn-crear-sorteo').addEventListener('click', crearSorteo);

  // Modal cerrar
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) cerrarModal();
  });

  // Aprobar / rechazar desde modal
  document.getElementById('modal-aprobar').addEventListener('click', () => {
    if (ventaModal) aprobarVenta(ventaModal);
  });

  document.getElementById('modal-rechazar').addEventListener('click', () => {
    const notas = prompt('Motivo del rechazo (opcional):') || '';
    if (ventaModal) rechazarVenta(ventaModal, notas);
  });
}

// ── Login ────────────────────────────────────────────────────────
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

// ── Cargar todos los datos ───────────────────────────────────────
async function cargarDatos() {
  await Promise.all([cargarMetricas(), cargarPendientes()]);
}

async function cargarMetricas() {
  try {
    const data = await Api.getDashboard(tokenAdmin);
    document.getElementById('m-boletas').textContent     = data.boletas_vendidas;
    document.getElementById('m-dinero').textContent      = formatCOP(data.dinero_recaudado);
    document.getElementById('m-compradores').textContent = data.compradores_unicos;
    document.getElementById('m-pendientes').textContent  = data.pagos_pendientes;

    // Sorteo activo
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

// ── Acciones de pagos ────────────────────────────────────────────
async function aprobarVenta(id) {
  if (!confirm('¿Aprobar este pago y enviar el cartón por WhatsApp?')) return;
  try {
    await Api.aprobarVenta(id, tokenAdmin);
    cerrarModal();
    mostrarToast('✓ Venta aprobada. Cartón enviado por WhatsApp.', 'success');
    // Quitar fila de la lista
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

// ── Crear sorteo ─────────────────────────────────────────────────
async function crearSorteo() {
  const datos = {
    nombre:            document.getElementById('s-nombre').value.trim(),
    premio_descripcion: document.getElementById('s-premio').value.trim(),
    fecha_sorteo:      document.getElementById('s-fecha').value,
    precio_boleta:     parseFloat(document.getElementById('s-precio').value),
    total_cartones:    parseInt(document.getElementById('s-total').value),
  };

  if (!datos.nombre || !datos.fecha_sorteo || !datos.precio_boleta || !datos.total_cartones)
    return mostrarToast('Completa todos los campos del sorteo', 'error');

  try {
    await Api.crearSorteo(datos, tokenAdmin);
    mostrarToast('✓ Sorteo creado exitosamente', 'success');
    document.getElementById('form-sorteo').style.display = 'none';
    // Limpiar form
    ['s-nombre','s-premio','s-fecha','s-precio','s-total']
      .forEach(id => document.getElementById(id).value = '');
    cargarMetricas();
  } catch (err) {
    mostrarToast(err.message, 'error');
  }
}

// ── Modal comprobante ────────────────────────────────────────────
async function verComprobante(id) {
  // Buscar en el DOM los datos que ya tenemos
  const fila = document.getElementById(`pago-${id}`);
  if (!fila) return;

  const nombre  = fila.querySelector('strong').textContent;
  const detalle = fila.querySelectorAll('span')[0].textContent;

  ventaModal = id;
  document.getElementById('modal-titulo').textContent  = nombre;
  document.getElementById('modal-detalle').textContent = detalle;

  // Intentar cargar imagen del comprobante vía la API de ventas
  try {
    const venta = await Api.getVenta(id);
    if (venta.comprobante_url) {
      document.getElementById('modal-img').src     = venta.comprobante_url;
      document.getElementById('modal-img').style.display = 'block';
    } else {
      document.getElementById('modal-img').style.display = 'none';
    }
  } catch {
    document.getElementById('modal-img').style.display = 'none';
  }

  document.getElementById('modal').style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
  ventaModal = null;
}

// ── Helpers ──────────────────────────────────────────────────────
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
