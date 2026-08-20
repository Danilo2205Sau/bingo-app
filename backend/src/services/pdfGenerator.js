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
  cartones,        // [{ codigo_unico, numeros }]
  sorteoNombre,
  fechaSorteoTexto,
  ventaId,
  whatsappContacto, // ej: "311-784-5215"
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
      if (posEnPagina === 0) dibujarEncabezadoPagina(doc, sorteoNombre, fechaSorteoTexto, whatsappContacto);

      const col = posEnPagina % COLS_POR_PAG;
      const fila = Math.floor(posEnPagina / COLS_POR_PAG);

      const x = doc.page.margins.left + col * (tableW + 20);
      const y = 110 + fila * 210;

      dibujarTabla(doc, { x, y, tableW, cellW, cellH, carton });
    });

    doc.end();
  });
}

function dibujarEncabezadoPagina(doc, sorteoNombre, fechaTexto, whatsappContacto) {
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x0 = doc.page.margins.left;

  doc.rect(x0, 24, pageW, 46).fill(NEGRO);
  doc.fillColor(NARANJA).fontSize(18).font('Helvetica-Bold')
    .text('BINGO GANADOR CO', x0, 34, { width: pageW, align: 'center' });
  doc.fillColor('#fff').fontSize(10).font('Helvetica')
    .text(`${sorteoNombre || ''}${fechaTexto ? ' — ' + fechaTexto : ''}`, x0, 54, { width: pageW, align: 'center' });

  if (whatsappContacto) {
    doc.fillColor('#7A1414').fontSize(8).font('Helvetica-Bold')
      .text(
        `SI TIENE UN CARTÓN GANADOR, ENVÍE LA PALABRA "MÍO" AL WHATSAPP ${whatsappContacto} (NO LLAMAR, NO AUDIOS)`,
        x0, 76, { width: pageW, align: 'center' }
      );
  }
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

module.exports = { generarCartonPDF, generarHojaCartonesPDF };
