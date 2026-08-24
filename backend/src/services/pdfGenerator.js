const PDFDocument = require('pdfkit');
const cloudinary  = require('./cloudinary');

const LETRAS = ['B', 'I', 'N', 'G', 'O'];
const COLORES = {
  header:    '#7F77DD',
  headerTxt: '#FFFFFF',
  libre:     '#F0997B',
  bordes:    '#CECBF6',
  fondo:     '#FAFAFA',
};

async function generarCartonPDF({ codigo, numeros, sorteo_id }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 520], margin: 30 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const url = await cloudinary.subirBuffer(buffer, `cartones/${sorteo_id}/${codigo}`);
        resolve({ pdfUrl: url });
      } catch (err) {
        reject(err);
      }
    });

    // ── Encabezado ──────────────────────────────────────────────
    doc.rect(30, 30, 340, 50).fill(COLORES.header);
    doc.fillColor(COLORES.headerTxt).fontSize(24).font('Helvetica-Bold')
      .text('BINGO', 30, 42, { width: 340, align: 'center' });

    // Código único
    doc.rect(30, 88, 340, 24).fill('#EEEDFE');
    doc.fillColor('#3C3489').fontSize(11).font('Helvetica')
      .text(`Código: ${codigo}`, 30, 94, { width: 340, align: 'center' });

    // ── Cabecera de columnas B-I-N-G-O ──────────────────────────
    const startX = 30, startY = 120, cellW = 68, cellH = 60;
    LETRAS.forEach((letra, col) => {
      const x = startX + col * cellW;
      doc.rect(x, startY, cellW, 34).fill(COLORES.header);
      doc.fillColor(COLORES.headerTxt).fontSize(18).font('Helvetica-Bold')
        .text(letra, x, startY + 8, { width: cellW, align: 'center' });
    });

    // ── Celdas de números ────────────────────────────────────────
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const x = startX + col * cellW;
        const y = startY + 34 + row * cellH;
        const valor = numeros[row][col];
        const esLibre = valor === null;

        doc.rect(x, y, cellW, cellH)
          .fill(esLibre ? COLORES.libre : COLORES.fondo)
          .stroke(COLORES.bordes);

        if (esLibre) {
          doc.fillColor('#712B13').fontSize(10).font('Helvetica-Bold')
            .text('LIBRE', x, y + cellH / 2 - 6, { width: cellW, align: 'center' });
        } else {
          doc.fillColor('#2C2C2A').fontSize(20).font('Helvetica-Bold')
            .text(String(valor), x, y + cellH / 2 - 12, { width: cellW, align: 'center' });
        }
      }
    }

    // ── Pie ──────────────────────────────────────────────────────
    doc.fillColor('#888780').fontSize(9).font('Helvetica')
      .text('Conserva este cartón — es tu boleta oficial del sorteo',
        30, 460, { width: 340, align: 'center' });

    doc.end();
  });
}

// ============================================
// Hoja con varios cartones — estilo naranja/negro
// (2 columnas x 3 filas = 6 cartones por página)
// ============================================

const NARANJA      = '#F07B1D';
const NARANJA_OSC   = '#C4590A';
const NEGRO         = '#1A1A1A';
const CODIGO_BG     = '#FFE9CF';

const COLS_POR_PAG = 2;
const FILAS_POR_PAG = 3;
const POR_PAGINA = COLS_POR_PAG * FILAS_POR_PAG;

async function generarHojaCartonesPDF({
  cartones,        // [{ codigo_unico, numeros, tipo_boleta }]
  tipoBoleta = 'bingo',   // 'bingo' | 'rifa' — todas las boletas de una venta comparten modalidad
  modalidadNombre,
  fuenteResultado,
  sorteoNombre,
  fechaSorteoTexto,
  ventaId,
  whatsappContacto,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 24 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const url = await cloudinary.subirBuffer(buffer, `hojas/${ventaId}`);
        resolve({ pdfUrl: url });
      } catch (err) { reject(err); }
    });

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableW = (pageW - 20) / COLS_POR_PAG;
    const cellW = tableW / 5;
    const cellH = 30;

    cartones.forEach((carton, idx) => {
      const posEnPagina = idx % POR_PAGINA;

      if (idx > 0 && posEnPagina === 0) doc.addPage();
      if (posEnPagina === 0) {
        dibujarEncabezadoPagina(doc, sorteoNombre, fechaSorteoTexto, whatsappContacto, modalidadNombre);
      }

      const col = posEnPagina % COLS_POR_PAG;
      const fila = Math.floor(posEnPagina / COLS_POR_PAG);

      const x = doc.page.margins.left + col * (tableW + 20);
      const y = 110 + fila * 210;

      if (tipoBoleta === 'rifa') {
        dibujarBoletaRifa(doc, { x, y, tableW, carton, fuenteResultado });
      } else {
        dibujarTabla(doc, { x, y, tableW, cellW, cellH, carton });
      }
    });

    doc.end();
  });
}

function dibujarEncabezadoPagina(doc, sorteoNombre, fechaTexto, whatsappContacto, modalidadNombre) {
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x0 = doc.page.margins.left;

  doc.rect(x0, 24, pageW, 46).fill(NEGRO);
  doc.fillColor(NARANJA).fontSize(18).font('Helvetica-Bold')
    .text('BINGO GANADOR CO', x0, 34, { width: pageW, align: 'center' });
  const subtitulo = [sorteoNombre, modalidadNombre, fechaTexto].filter(Boolean).join(' — ');
  doc.fillColor('#fff').fontSize(10).font('Helvetica')
    .text(subtitulo, x0, 54, { width: pageW, align: 'center' });

  if (whatsappContacto) {
    doc.fillColor('#7A1414').fontSize(8).font('Helvetica-Bold')
      .text(
        `SI TIENE UN CARTÓN/BOLETA GANADORA, ENVÍE LA PALABRA "MÍO" AL WHATSAPP ${whatsappContacto} (NO LLAMAR, NO AUDIOS)`,
        x0, 76, { width: pageW, align: 'center' }
      );
  }
}

// ── Boleta de rifa/sorteo: número(s) grandes, sin grid de bingo ────
function dibujarBoletaRifa(doc, { x, y, tableW, carton, fuenteResultado }) {
  const { codigo_unico, numeros } = carton;
  const alto = 176;

  doc.rect(x, y, tableW, alto).stroke('#CCCCCC');

  doc.rect(x, y, tableW, 16).fill(NARANJA_OSC);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
    .text(`BOLETA ${codigo_unico}`, x, y + 4, { width: tableW, align: 'center' });

  const numerosTexto = (numeros || []).join('  -  ');
  doc.fillColor(NEGRO).fontSize(numeros && numeros.length > 1 ? 26 : 34).font('Helvetica-Bold')
    .text(numerosTexto, x + 10, y + 50, { width: tableW - 20, align: 'center' });

  doc.fillColor(NARANJA_OSC).fontSize(7).font('Helvetica-Bold')
    .text('SU NÚMERO DE LA SUERTE', x, y + 100, { width: tableW, align: 'center' });

  if (fuenteResultado) {
    doc.fillColor('#555').fontSize(6).font('Helvetica')
      .text(fuenteResultado, x + 10, y + 120, { width: tableW - 20, align: 'center' });
  }

  doc.fillColor(NARANJA_OSC).fontSize(6).font('Helvetica-Bold')
    .text(`CÓDIGO: ${codigo_unico}`, x, y + alto - 16, { width: tableW, align: 'center' });
}

function dibujarTabla(doc, { x, y, tableW, cellW, cellH, carton }) {
  const { codigo_unico, numeros } = carton;

  doc.rect(x, y, tableW, 16).fill(NARANJA_OSC);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
    .text(`CARTÓN ${codigo_unico}`, x, y + 4, { width: tableW, align: 'center' });

  const headerY = y + 16;
  LETRAS.forEach((letra, col) => {
    const cx = x + col * cellW;
    doc.rect(cx, headerY, cellW, 20).fill(NARANJA).stroke(NEGRO);
    doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
      .text(letra, cx, headerY + 4, { width: cellW, align: 'center' });
  });

  const gridY = headerY + 20;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = x + col * cellW;
      const cy = gridY + row * cellH;
      const valor = numeros[row][col];
      const esCodigo = valor === null;

      doc.rect(cx, cy, cellW, cellH)
        .fill(esCodigo ? CODIGO_BG : '#FFFFFF')
        .stroke('#CCCCCC');

      if (esCodigo) {
        doc.fillColor(NARANJA_OSC).fontSize(6).font('Helvetica-Bold')
          .text('CÓDIGO', cx, cy + 8, { width: cellW, align: 'center' });
        doc.fillColor(NEGRO).fontSize(7).font('Helvetica-Bold')
          .text(codigo_unico, cx + 2, cy + 18, { width: cellW - 4, align: 'center' });
      } else {
        doc.fillColor(NEGRO).fontSize(14).font('Helvetica-Bold')
          .text(String(valor), cx, cy + cellH / 2 - 8, { width: cellW, align: 'center' });
      }
    }
  }
}

// ============================================
// Boleta con imagen de premiación (estilo "stub" profesional)
// Panel izquierdo: la imagen que subió el admin
// Panel derecho: número de la boleta del comprador
// ============================================

async function generarBoletasConImagenPremio({
  cartones,          // [{ codigo_unico, numeros }]
  imagenPremioUrl,   // URL de Cloudinary de la imagen de premiación (puede ser null)
  sorteoNombre,
  fechaSorteoTexto,
  precioBoleta,
  whatsappContacto,
  ventaId,
}) {
  let imagenBuffer = null;
  if (imagenPremioUrl) {
    try {
      const imgRes = await fetch(imagenPremioUrl);
      if (imgRes.ok) imagenBuffer = Buffer.from(await imgRes.arrayBuffer());
    } catch (e) { console.error('No se pudo descargar la imagen de premiación:', e.message); }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const url = await cloudinary.subirBuffer(buffer, `boletas/${ventaId}`);
        resolve({ pdfUrl: url });
      } catch (err) { reject(err); }
    });

    cartones.forEach((carton, idx) => {
      if (idx > 0) doc.addPage();
      dibujarBoletaConImagen(doc, {
        carton, imagenBuffer, sorteoNombre, fechaSorteoTexto, precioBoleta, whatsappContacto,
      });
    });

    doc.end();
  });
}

function dibujarBoletaConImagen(doc, { carton, imagenBuffer, sorteoNombre, fechaSorteoTexto, precioBoleta, whatsappContacto }) {
  const pageW = doc.page.width, pageH = doc.page.height;
  const stubW = 180;
  const imgW = pageW - stubW;

  // Panel izquierdo — la imagen de premiación (o un respaldo si no hay imagen)
  if (imagenBuffer) {
    doc.image(imagenBuffer, 0, 0, { width: imgW, height: pageH, cover: [imgW, pageH], align: 'center', valign: 'center' });
  } else {
    doc.rect(0, 0, imgW, pageH).fill('#7A1414');
    doc.fillColor('#FFD558').fontSize(26).font('Helvetica-Bold')
      .text(sorteoNombre || 'SORTEO', 30, pageH / 2 - 60, { width: imgW - 60, align: 'center' });
    doc.fillColor('#fff').fontSize(12).font('Helvetica')
      .text('¡Mucha suerte!', 30, pageH / 2, { width: imgW - 60, align: 'center' });
  }

  // Línea divisoria punteada
  doc.dash(4, { space: 4 }).moveTo(imgW, 0).lineTo(imgW, pageH).stroke('#ffffff');
  doc.undash();

  // Panel derecho (stub)
  doc.rect(imgW, 0, stubW, pageH).fill('#111111');

  doc.rect(imgW, 26, stubW, 44).fill('#C0392B');
  doc.fillColor('#FFD558').fontSize(11).font('Helvetica-Bold')
    .text('NÚMERO DE TU BOLETA', imgW + 8, 42, { width: stubW - 16, align: 'center' });

  doc.roundedRect(imgW + 15, 88, stubW - 30, 130, 6).fill('#ffffff');
  const numerosTexto = (carton.numeros || []).join(' - ');
  doc.fillColor('#111111').fontSize(numerosTexto.length > 8 ? 20 : 32).font('Helvetica-Bold')
    .text(numerosTexto, imgW + 20, 138, { width: stubW - 40, align: 'center' });

  doc.rect(imgW + 15, 236, stubW - 30, 24).fill('#FFD558');
  doc.fillColor('#111111').fontSize(9).font('Helvetica-Bold')
    .text('TU NÚMERO', imgW, 243, { width: stubW, align: 'center' });

  let y = 285;
  doc.fillColor('#cccccc').fontSize(7).font('Helvetica');
  doc.text(`Código: ${carton.codigo_unico}`, imgW + 10, y, { width: stubW - 20, align: 'center' }); y += 15;
  if (precioBoleta) {
    doc.text(`Valor: $${Number(precioBoleta).toLocaleString('es-CO')}`, imgW + 10, y, { width: stubW - 20, align: 'center' }); y += 15;
  }
  if (fechaSorteoTexto) {
    doc.text(fechaSorteoTexto, imgW + 10, y, { width: stubW - 20, align: 'center' });
  }

  if (whatsappContacto) {
    doc.fillColor('#4ADE80').fontSize(8).font('Helvetica-Bold')
      .text(`WhatsApp: ${whatsappContacto}`, imgW + 10, pageH - 50, { width: stubW - 20, align: 'center' });
  }
  doc.fillColor('#888888').fontSize(6).font('Helvetica')
    .text('Boleta válida una vez realizado el pago', imgW + 10, pageH - 30, { width: stubW - 20, align: 'center' });
}

module.exports = { generarCartonPDF, generarHojaCartonesPDF, generarBoletasConImagenPremio };