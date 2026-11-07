document.addEventListener('DOMContentLoaded', () => {
  const boton = document.getElementById('btn-buscar');
  const entrada = document.getElementById('busqueda');
  boton.addEventListener('click', buscar);
  entrada.addEventListener('keydown', event => {
    if (event.key === 'Enter') buscar();
  });

  async function buscar() {
    const codigo = entrada.value.trim();
    if (!codigo) return;

    boton.disabled = true;
    boton.textContent = 'Buscando...';
    document.getElementById('resultado').replaceChildren();
    try {
      const data = await Api.consultarBoleta(codigo);
      renderResultados(Array.isArray(data.resultados) ? data.resultados : []);
    } catch {
      document.getElementById('resultado').innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <p><strong>No encontramos ninguna boleta</strong></p>
          <p style="font-size:13px;margin-top:6px">Verifica el código de consulta e inténtalo de nuevo.</p>
        </div>`;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Buscar boleta';
    }
  }
});

function renderResultados(cartones) {
  const contenedor = document.getElementById('resultado');
  contenedor.replaceChildren();
  if (!cartones.length) {
    contenedor.innerHTML = '<div class="empty-state"><div class="icon">🎴</div><p>No hay boletas con ese dato</p></div>';
    return;
  }

  const resumen = document.createElement('p');
  resumen.style.cssText = 'font-size:13px;color:#888;margin:8px 0 12px';
  resumen.textContent = `${cartones.length} boleta(s) encontrada(s)`;
  contenedor.appendChild(resumen);

  cartones.forEach(carton => {
    const aprobado = carton.estado_pago === 'aprobado';
    const badge = aprobado
      ? '<span class="badge badge-approved">✓ Aprobado</span>'
      : '<span class="badge badge-pending">⏳ Pendiente</span>';
    let gridHTML = '';
    if (Array.isArray(carton.numeros) && carton.numeros.length === 5 &&
        carton.numeros.every(fila => Array.isArray(fila) && fila.length === 5)) {
      const letras = ['B', 'I', 'N', 'G', 'O'];
      gridHTML = `<div class="letras">${letras.map(letra => `<div class="letra">${letra}</div>`).join('')}</div><div class="carton-grid">`;
      carton.numeros.forEach(fila => fila.forEach(valor => {
        gridHTML += valor === null
          ? '<div class="celda libre">LIBRE</div>'
          : `<div class="celda">${escapeHTML(valor)}</div>`;
      }));
      gridHTML += '</div>';
    }

    const pdfUrl = safePdfUrl(carton.pdf_url);
    const card = document.createElement('div');
    card.className = 'carton-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="carton-codigo">${escapeHTML(carton.codigo_unico)}</div>
          <div class="carton-sorteo">${escapeHTML(carton.sorteo)} · ${escapeHTML(formatFecha(carton.fecha_sorteo))}</div>
        </div>
        ${badge}
      </div>
      ${gridHTML}
      ${pdfUrl ? `<a href="${escapeHTML(pdfUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pdf">📄 Descargar PDF del cartón</a>` : ''}
    `;
    contenedor.appendChild(card);
  });
}

function safePdfUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' ? url.href : '';
  } catch {
    return '';
  }
}

function escapeHTML(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}
