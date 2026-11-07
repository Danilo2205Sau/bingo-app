// ============================================
// compra.js — Flujo de compra del comprador
// ============================================

// ── Estado local ────────────────────────────────────────────────
let eventosActivos   = [];
let sorteoActivo     = null;   // evento elegido
let modalidadActiva  = null;   // modalidad elegida (dentro del evento)
let cantidadActual   = 2;
let metodoPago       = 'nequi';
let archivoActual    = null;
let numerosDisponibles = [];   // [{id, codigo_unico, numeros}]
let numerosElegidos    = [];   // ids de cartones seleccionados por el comprador
const MAX_CARTONES_POR_COMPRA = 10;
let clavePrivadaCompra = null;
let huellaCompraActual = null;
let tokenReservaCompra = null;
let huellaBoletasReservadas = null;
const CLAVE_STORAGE_COMPRA = 'bingo-compra-idempotency';
try { clavePrivadaCompra = sessionStorage.getItem(CLAVE_STORAGE_COMPRA); } catch (_) { /* almacenamiento no disponible */ }

// Datos de las cuentas de pago — el admin los configura aquí
const CUENTAS_PAGO = {
  nequi:         { numero: '310 000 0000', titular: 'Nombre del titular' },
  bancolombia:   { numero: '123-456789-00', titular: 'Nombre del titular' },
  transferencia: { numero: '0000000000', titular: 'Banco — Nombre del titular' },
};

// ── Inicializar ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await cargarEventosActivos();
  inicializarEventos();
});

async function cargarEventosActivos() {
  try {
    eventosActivos = await Api.getSorteosActivos();
  } catch (err) {
    eventosActivos = [];
    console.error(err);
  }

  if (!eventosActivos.length) {
    document.getElementById('selector-eventos').style.display = 'block';
    document.getElementById('eventos-grid').innerHTML =
      '<p class="lp-vacio">No hay sorteos activos en este momento. ¡Vuelve pronto!</p>';
    return;
  }

  if (eventosActivos.length === 1) {
    seleccionarEvento(eventosActivos[0].id);
    return;
  }

  mostrarSelectorEventos();
}

function mostrarSelectorEventos() {
  document.getElementById('hero-section').style.display = 'none';
  document.getElementById('flujo-compra').style.display = 'none';
  document.getElementById('selector-eventos').style.display = 'block';

  document.body.classList.remove('vista-compra');
  const grid = document.getElementById('eventos-grid');
  grid.classList.toggle('uno', eventosActivos.length === 1);
  grid.innerHTML = eventosActivos.map(ev => {
    const mod = (ev.modalidades && ev.modalidades[0]) || {};
    const total = mod.total_boletas || 0;
    const vendidas = mod.boletas_vendidas || 0;
    const disponibles = Math.max(total - vendidas, 0);
    const pct = total ? Math.min(100, Math.round((vendidas / total) * 100)) : 0;
    return `
      <article class="lp-card" onclick="seleccionarEvento('${ev.id}')">
        <div class="lp-card-img">
          ${ev.imagen_premio_url ? `<img src="${escapeHTML(ev.imagen_premio_url)}" alt="${escapeHTML(ev.nombre)}" loading="lazy" />` : `<span class="lp-noimg">🏆</span>`}
          <span class="lp-tag">${mod.tipo_boleta === 'rifa' ? '🎟️ Rifa' : '🎱 Bingo'}</span>
          <span class="lp-tag disp">${disponibles} disponibles</span>
        </div>
        <div class="lp-card-body">
          <h3>${escapeHTML(ev.nombre)}</h3>
          <p class="prem">${escapeHTML(ev.premio_descripcion || mod.nombre || '')}</p>
          <div class="lp-meta"><span>📅 ${formatFecha(ev.fecha_sorteo)}</span><span class="lp-price">${formatCOP(mod.precio_boleta || 0)} <small>c/u</small></span></div>
          <div class="lp-bar"><i style="width:${pct}%"></i></div>
          <div class="lp-meta"><span>${pct}% vendido</span></div>
          <div class="lp-cta">Quiero mis boletas →</div>
        </div>
      </article>
    `;
  }).join('');
}

async function seleccionarEvento(id) {
  sorteoActivo = eventosActivos.find(e => e.id === id);
  if (!sorteoActivo) return;
  modalidadActiva = (sorteoActivo.modalidades && sorteoActivo.modalidades[0]) || null;
  numerosElegidos = [];

  document.body.classList.add('vista-compra');
  document.getElementById('selector-eventos').style.display = 'none';
  document.getElementById('hero-section').style.display = 'block';
  document.getElementById('flujo-compra').style.display = 'block';

  document.getElementById('sorteo-nombre').textContent  = sorteoActivo.nombre;
  document.getElementById('sorteo-estado').textContent  = '🔥 Sorteo activo';
  document.getElementById('sorteo-premio').textContent  =
    sorteoActivo.premio_descripcion || '¡Gran Premio!';
  document.getElementById('sorteo-fecha').textContent   =
    formatFecha(sorteoActivo.fecha_sorteo);

  const imgEl = document.getElementById('sorteo-imagen-premio');
  if (sorteoActivo.imagen_premio_url) {
    imgEl.src = sorteoActivo.imagen_premio_url;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  const disponibles = (modalidadActiva?.total_boletas || 0) - (modalidadActiva?.boletas_vendidas || 0);
  document.getElementById('boletas-restantes').textContent = `${disponibles} restantes`;

  const precio = parseFloat(modalidadActiva?.precio_boleta || 0);
  const precios = { 1: precio, 2: precio * 2, 5: precio * 5, 10: precio * 10 };
  Object.entries(precios).forEach(([qty, total]) => {
    const el = document.getElementById(`price-${qty}`);
    if (el) el.textContent = formatCOP(total);
    const btn = document.querySelector(`[data-qty="${qty}"]`);
    if (btn) btn.dataset.precio = total;
  });

  if (modalidadActiva?.permite_elegir_numero) {
    document.getElementById('paso-cantidad').style.display = 'none';
    document.getElementById('paso-elegir-numero').style.display = 'block';
    await cargarNumerosDisponibles();
  } else {
    document.getElementById('paso-cantidad').style.display = 'block';
    document.getElementById('paso-elegir-numero').style.display = 'none';
    cantidadActual = parseInt(document.querySelector('.qty-btn.active')?.dataset.qty || 2);
  }

  actualizarTotal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function cargarNumerosDisponibles() {
  const grid = document.getElementById('numeros-grid');
  grid.innerHTML = '<p style="color:#888;font-size:13px">Cargando números disponibles...</p>';
  try {
    numerosDisponibles = await Api.getNumerosDisponibles(modalidadActiva.id);
    renderNumerosGrid();
  } catch (err) {
    grid.innerHTML = `<p style="color:#712B13;font-size:13px">${err.message}</p>`;
  }
}

function renderNumerosGrid() {
  const grid = document.getElementById('numeros-grid');
  if (!numerosDisponibles.length) {
    grid.innerHTML = '<p style="color:#888;font-size:13px">No quedan números disponibles</p>';
    return;
  }
  grid.innerHTML = numerosDisponibles.map(c => {
    const texto = Array.isArray(c.numeros) ? c.numeros.join('-') : c.codigo_unico;
    const elegido = numerosElegidos.includes(c.id);
    return `
      <button type="button" class="qty-btn ${elegido ? 'active' : ''}" style="padding:10px 4px;font-size:13px"
        onclick="toggleNumero('${c.id}')">${texto}</button>
    `;
  }).join('');
  actualizarEstadoNumeros();
}

function toggleNumero(id) {
  const idx = numerosElegidos.indexOf(id);
  if (idx >= 0) {
    numerosElegidos.splice(idx, 1);
  } else {
    if (numerosElegidos.length >= MAX_CARTONES_POR_COMPRA) {
      return mostrarError(`Puedes seleccionar hasta ${MAX_CARTONES_POR_COMPRA} boletas por compra`);
    }
    numerosElegidos.push(id);
  }
  cantidadActual = numerosElegidos.length;
  renderNumerosGrid();
  actualizarTotal();
}

function actualizarEstadoNumeros() {
  const el = document.getElementById('numeros-estado');
  el.textContent = numerosElegidos.length
    ? `${numerosElegidos.length} número(s) seleccionado(s)`
    : 'Selecciona al menos un número para continuar';
}

// ── Eventos ─────────────────────────────────────────────────────
function inicializarEventos() {

  document.getElementById('btn-cambiar-evento').addEventListener('click', () => {
    sorteoActivo = null;
    modalidadActiva = null;
    numerosElegidos = [];
    mostrarSelectorEventos();
  });

  // Botones de cantidad
  document.querySelectorAll('.qty-btn[data-qty]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.qty-btn[data-qty]').forEach(b => b.classList.remove('active'));
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
  if (!modalidadActiva) return;
  const total = parseFloat(modalidadActiva.precio_boleta) * (cantidadActual || 0);
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

  if (!sorteoActivo || !modalidadActiva) return mostrarError('Elige un sorteo primero');
  if (!nombre)
    return mostrarError('Ingresa tu nombre completo');
  if (!telefono || telefono.length < 10)
    return mostrarError('Ingresa un número de WhatsApp válido (10 dígitos)');
  if (!archivoActual)
    return mostrarError('Debes subir el comprobante de pago');
  if (modalidadActiva.permite_elegir_numero && !numerosElegidos.length)
    return mostrarError('Elige al menos un número');
  if (!cantidadActual || cantidadActual < 1)
    return mostrarError('Elige la cantidad de boletas');

  const huellaCompra = JSON.stringify([
    nombre, telefono, cantidadActual, metodoPago, sorteoActivo.id, modalidadActiva.id,
    [...numerosElegidos].sort(),
  ]);
  if (huellaCompra !== huellaCompraActual) {
    if (huellaCompraActual !== null || !clavePrivadaCompra) {
      clavePrivadaCompra = generarClavePrivada();
      guardarClavePrivadaCompra();
    }
    huellaCompraActual = huellaCompra;
  }

  const btn = document.getElementById('btn-comprar');
  btn.disabled     = true;
  btn.textContent  = 'Procesando...';

  try {
    // Si el comprador eligió números específicos, reservarlos primero
    let reservationToken = null;
    if (modalidadActiva.permite_elegir_numero) {
      const huellaBoletas = JSON.stringify([...numerosElegidos].sort());
      if (!tokenReservaCompra || huellaBoletas !== huellaBoletasReservadas) {
        const reserva = await Api.reservarNumeros(modalidadActiva.id, numerosElegidos);
        tokenReservaCompra = reserva.reservation_token;
        huellaBoletasReservadas = huellaBoletas;
      }
      reservationToken = tokenReservaCompra;
    }

    const formData = new FormData();
    formData.append('nombre',          nombre);
    formData.append('telefono',        telefono);
    formData.append('cantidad',        cantidadActual);
    formData.append('metodo_pago',     metodoPago);
    formData.append('sorteo_id',       sorteoActivo.id);
    formData.append('modalidad_id',    modalidadActiva.id);
    formData.append('idempotency_key', clavePrivadaCompra);
    formData.append('comprobante',     archivoActual);
    if (modalidadActiva.permite_elegir_numero) {
      formData.append('carton_ids', JSON.stringify(numerosElegidos));
      formData.append('reservation_token', reservationToken);
    }

    const resultado = await Api.crearVenta(formData);

    // Mostrar éxito
    document.getElementById('success-msg').style.display = 'block';
    const successId = document.getElementById('success-id');
    successId.textContent = `ID de compra: ${resultado.venta_id}\nCódigo privado de consulta: ${resultado.codigo_consulta}`;
    successId.style.whiteSpace = 'pre-wrap';
    clavePrivadaCompra = null;
    huellaCompraActual = null;
    try { sessionStorage.removeItem(CLAVE_STORAGE_COMPRA); } catch (_) { /* almacenamiento no disponible */ }
    tokenReservaCompra = null;
    huellaBoletasReservadas = null;

    // Ocultar formulario
    document.querySelectorAll('.card').forEach(c => c.style.display = 'none');
    document.querySelector('.total-bar').style.display = 'none';
    btn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    if (err.message.includes('Esta clave ya se usó con otros datos de compra')) {
      clavePrivadaCompra = generarClavePrivada();
      huellaCompraActual = huellaCompra;
      guardarClavePrivadaCompra();
      mostrarError('Los datos cambiaron desde el intento anterior. Vuelve a presionar Comprar para registrar este nuevo intento.');
    } else {
      mostrarError(err.message);
    }
    // Si la reserva o la venta fallaron, refrescamos los números por si alguno ya no está libre
    if (modalidadActiva?.permite_elegir_numero && /reserva|disponible|boletas|selección/i.test(err.message)) {
      numerosElegidos = [];
      tokenReservaCompra = null;
      huellaBoletasReservadas = null;
      cargarNumerosDisponibles();
    }
    btn.disabled    = false;
    btn.textContent = 'Comprar ahora';
  }
}

function generarClavePrivada() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function guardarClavePrivadaCompra() {
  if (!clavePrivadaCompra) return;
  try { sessionStorage.setItem(CLAVE_STORAGE_COMPRA, clavePrivadaCompra); } catch (_) { /* almacenamiento no disponible */ }
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

function escapeHTML(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}
