// ============================================
// compra.js — Flujo de compra del comprador
// ============================================

// ── Estado local ────────────────────────────────────────────────
let sorteoActivo   = null;
let cantidadActual = 2;
let metodoPago     = 'nequi';
let archivoActual  = null;

// Datos de las cuentas de pago — el admin los configura aquí
const CUENTAS_PAGO = {
  nequi:         { numero: '310 000 0000', titular: 'Nombre del titular' },
  bancolombia:   { numero: '123-456789-00', titular: 'Nombre del titular' },
  transferencia: { numero: '0000000000', titular: 'Banco — Nombre del titular' },
};

// ── Inicializar ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await cargarSorteo();
  inicializarEventos();
});

async function cargarSorteo() {
  try {
    sorteoActivo = await Api.getSorteoActivo();

    // Hero
    document.getElementById('sorteo-nombre').textContent  = sorteoActivo.nombre;
    document.getElementById('sorteo-estado').textContent  = '🔥 Sorteo activo';
    document.getElementById('sorteo-premio').textContent  =
      sorteoActivo.premio_descripcion || '¡Gran Premio!';
    document.getElementById('sorteo-fecha').textContent   =
      formatFecha(sorteoActivo.fecha_sorteo);

    const disponibles = sorteoActivo.total_cartones - sorteoActivo.cartones_vendidos;
    document.getElementById('boletas-restantes').textContent = `${disponibles} restantes`;

    // Precios en botones de cantidad
    const precio = parseFloat(sorteoActivo.precio_boleta);
    const precios = { 1: precio, 2: precio * 2, 5: precio * 5, 10: precio * 10 };
    Object.entries(precios).forEach(([qty, total]) => {
      const el = document.getElementById(`price-${qty}`);
      if (el) el.textContent = formatCOP(total);
      const btn = document.querySelector(`[data-qty="${qty}"]`);
      if (btn) btn.dataset.precio = total;
    });

    actualizarTotal();
  } catch (err) {
    document.getElementById('sorteo-estado').textContent = 'Sin sorteos activos';
    document.getElementById('btn-comprar').disabled = true;
    console.error(err);
  }
}

// ── Eventos ─────────────────────────────────────────────────────
function inicializarEventos() {

  // Botones de cantidad
  document.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cantidadActual = parseInt(btn.dataset.qty);
      actualizarTotal();
    });
  });

  // Botones de método de pago
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      metodoPago = btn.dataset.metodo;
      actualizarInfoPago();
    });
  });

  // Upload comprobante
  document.getElementById('comprobante').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    archivoActual = file;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('preview-img').src = ev.target.result;
        document.getElementById('preview-wrap').style.display = 'block';
        document.getElementById('upload-zone').style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById('preview-wrap').style.display = 'block';
      document.getElementById('preview-img').src = '';
      document.querySelector('.preview-wrap p')?.remove();
      const p = document.createElement('p');
      p.textContent = `📄 ${file.name}`;
      p.style.cssText = 'font-size:14px;color:#444;margin:8px 0';
      document.getElementById('preview-wrap').prepend(p);
      document.getElementById('upload-zone').style.display = 'none';
    }
  });

  // Quitar archivo
  document.getElementById('btn-remove-file').addEventListener('click', () => {
    archivoActual = null;
    document.getElementById('comprobante').value = '';
    document.getElementById('preview-wrap').style.display = 'none';
    document.getElementById('upload-zone').style.display = 'block';
  });

  // Botón comprar
  document.getElementById('btn-comprar').addEventListener('click', procesarCompra);
}

// ── Helpers UI ──────────────────────────────────────────────────
function actualizarTotal() {
  if (!sorteoActivo) return;
  const total = parseFloat(sorteoActivo.precio_boleta) * cantidadActual;
  document.getElementById('total-display').textContent = formatCOP(total);
  document.getElementById('total-hint').textContent    = formatCOP(total);
}

function actualizarInfoPago() {
  const cuenta = CUENTAS_PAGO[metodoPago];
  document.getElementById('pago-titulo').textContent         =
    metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1);
  document.getElementById('pago-numero').textContent         = cuenta.numero;
  document.getElementById('pago-nombre-titular').textContent = cuenta.titular;
}

// ── Procesar compra ─────────────────────────────────────────────
async function procesarCompra() {
  const nombre         = document.getElementById('nombre').value.trim();
  const telefono       = document.getElementById('telefono').value.trim();
  const referencia     = document.getElementById('referencia').value.trim();
  const nombreTitular  = document.getElementById('nombre-titular').value.trim();
  const montoDeclarado = document.getElementById('monto-declarado').value.trim();

  if (!nombre)
    return mostrarError('Ingresa tu nombre completo');
  if (!telefono || telefono.length < 10)
    return mostrarError('Ingresa un número de WhatsApp válido (10 dígitos)');
  if (!referencia)
    return mostrarError('Ingresa el número de referencia de tu transferencia');
  if (!nombreTitular)
    return mostrarError('Ingresa el nombre del titular que realizó el pago');
  if (!archivoActual)
    return mostrarError('Debes subir el comprobante de pago');
  if (!sorteoActivo)    return mostrarError('No hay sorteo activo');

  const btn = document.getElementById('btn-comprar');
  btn.disabled     = true;
  btn.textContent  = 'Procesando...';

  try {
    const formData = new FormData();
    formData.append('nombre',          nombre);
    formData.append('telefono',        telefono);
    formData.append('cantidad',        cantidadActual);
    formData.append('metodo_pago',     metodoPago);
    formData.append('sorteo_id',       sorteoActivo.id);
    formData.append('referencia_pago', referencia);
    formData.append('nombre_titular',  nombreTitular);
    formData.append('monto_declarado', montoDeclarado || '0');
    formData.append('comprobante',     archivoActual);

    const resultado = await Api.crearVenta(formData);

    // Mostrar éxito
    document.getElementById('success-msg').style.display = 'block';
    document.getElementById('success-id').textContent =
      `ID de compra: ${resultado.venta_id}`;

    // Ocultar formulario
    document.querySelectorAll('.card').forEach(c => c.style.display = 'none');
    document.querySelector('.total-bar').style.display = 'none';
    btn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    mostrarError(err.message);
    btn.disabled    = false;
    btn.textContent = 'Comprar ahora';
  }
}

function mostrarError(msg) {
  // Eliminar error previo
  document.getElementById('error-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'error-toast';
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #712B13; color: #fff; padding: 12px 20px;
    border-radius: 10px; font-size: 14px; z-index: 999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2); max-width: 90vw; text-align: center;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
