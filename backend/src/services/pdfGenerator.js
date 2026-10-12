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
  publicId,        // opcional: nombre del archivo en Cloudinary (ej. 'boletas/<sorteo>/Boleta_123456')
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 24 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const url = await cloudinary.subirBuffer(buffer, publicId || `hojas/${ventaId}`);
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
  fuenteResultado,
  ventaId,
  publicId,          // opcional: nombre del archivo en Cloudinary (ej. 'boletas/<sorteo>/Boleta_123456')
}) {
  let imagenBuffer = null;
  if (imagenPremioUrl) {
    try {
      const imgRes = await fetch(imagenPremioUrl);
      if (imgRes.ok) imagenBuffer = Buffer.from(await imgRes.arrayBuffer());
    } catch (e) { console.error('No se pudo descargar la imagen de premiación:', e.message); }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const url = await cloudinary.subirBuffer(buffer, publicId || `boletas/${ventaId}`);
        resolve({ pdfUrl: url });
      } catch (err) { reject(err); }
    });

    cartones.forEach((carton, idx) => {
      if (idx > 0) doc.addPage();
      dibujarBoletaConImagen(doc, {
        carton, imagenBuffer, sorteoNombre, fechaSorteoTexto, precioBoleta, whatsappContacto, fuenteResultado,
      });
    });

    doc.end();
  });
}

function dibujarBoletaConImagen(doc, { carton, imagenBuffer, sorteoNombre, fechaSorteoTexto, precioBoleta, whatsappContacto, fuenteResultado }) {
  const ROJO      = '#7A1414';
  const ROJO_OSC  = '#4A0C0C';
  const DORADO    = '#FFD558';
  const DORADO_OSC= '#C99A2E';
  const NEGRO     = '#161616';
  const CREMA     = '#FFF8EC';

  const pageW = doc.page.width, pageH = doc.page.height;
  const margen = 18;
  const cardX = margen, cardY = margen;
  const cardW = pageW - margen * 2, cardH = pageH - margen * 2;

  // ── Marco exterior tipo tarjeta, rojo con esquinas redondeadas ──
  doc.roundedRect(cardX, cardY, cardW, cardH, 16).lineWidth(3).stroke(ROJO);
  doc.roundedRect(cardX + 4, cardY + 4, cardW - 8, cardH - 8, 12).lineWidth(1).stroke(DORADO);

  const padInterno = 14;
  const talonH = 42;
  const innerX = cardX + padInterno;
  const innerY = cardY + padInterno;
  const innerW = cardW - padInterno * 2;
  const innerH = cardH - padInterno * 2 - talonH;

  // División horizontal: imagen a la izquierda (55%), info a la derecha (45%)
  const imgPanelW = innerW * 0.55;
  const infoPanelW = innerW - imgPanelW - 14;
  const infoPanelX = innerX + imgPanelW + 14;

  // ── Panel imagen: fondo negro + imagen COMPLETA sin recortar (fit, no cover) ──
  doc.roundedRect(innerX, innerY, imgPanelW, innerH, 10).fill(NEGRO);
  if (imagenBuffer) {
    doc.save();
    doc.roundedRect(innerX, innerY, imgPanelW, innerH, 10).clip();
    doc.image(imagenBuffer, innerX, innerY, {
      fit: [imgPanelW, innerH],
      align: 'center',
      valign: 'center',
    });
    doc.restore();
  } else {
    doc.fillColor(DORADO).fontSize(22).font('Helvetica-Bold')
      .text(sorteoNombre || 'SORTEO', innerX + 20, innerY + innerH / 2 - 30, { width: imgPanelW - 40, align: 'center' });
  }

  // ── Panel derecho: info estructurada ──
  let y = innerY;

  // Encabezado del sorteo
  doc.roundedRect(infoPanelX, y, infoPanelW, 34, 6).fill(ROJO_OSC);
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
    .text((sorteoNombre || 'SORTEO').toUpperCase(), infoPanelX + 8, y + 10, { width: infoPanelW - 16, align: 'center' });
  y += 42;

  // Caja dorada: TU NÚMERO DE LA SUERTE
  const cajaNumH = 92;
  doc.roundedRect(infoPanelX, y, infoPanelW, cajaNumH, 8)
    .fill(DORADO);
  doc.roundedRect(infoPanelX + 4, y + 4, infoPanelW - 8, cajaNumH - 8, 6)
    .lineWidth(1).stroke(DORADO_OSC);
  doc.fillColor(ROJO_OSC).fontSize(9).font('Helvetica-Bold')
    .text('TU NÚMERO DE LA SUERTE', infoPanelX, y + 10, { width: infoPanelW, align: 'center' });

  const numerosTexto = (carton.numeros || []).join(' - ');
  const numFontSize = numerosTexto.length > 8 ? 22 : 34;
  doc.fillColor(NEGRO).fontSize(numFontSize).font('Helvetica-Bold')
    .text(numerosTexto, infoPanelX + 6, y + 38, { width: infoPanelW - 12, align: 'center' });
  y += cajaNumH + 12;

  // Filas de datos
  const filas = [
    ['Fecha del sorteo', fechaSorteoTexto || '-'],
    ['Valor de la boleta', precioBoleta ? `$${Number(precioBoleta).toLocaleString('es-CO')}` : '-'],
  ];
  if (fuenteResultado) filas.push(['Cómo se define el ganador', fuenteResultado]);

  filas.forEach(([label, valor]) => {
    doc.roundedRect(infoPanelX, y, infoPanelW, 34, 6).fill(CREMA);
    doc.fillColor(ROJO_OSC).fontSize(7).font('Helvetica-Bold')
      .text(label.toUpperCase(), infoPanelX + 10, y + 5, { width: infoPanelW - 20 });
    doc.fillColor(NEGRO).fontSize(9.5).font('Helvetica')
      .text(valor, infoPanelX + 10, y + 16, { width: infoPanelW - 20 });
    y += 40;
  });

  // WhatsApp de contacto
  if (whatsappContacto) {
    doc.roundedRect(infoPanelX, y, infoPanelW, 30, 6).fill('#1D9E5F');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
      .text(`WhatsApp: ${whatsappContacto}`, infoPanelX, y + 9, { width: infoPanelW, align: 'center' });
    y += 38;
  }

  // ── Franja inferior tipo "talón de boleta" (línea punteada + código) ──
  const talonY = innerY + innerH + 14;
  doc.dash(3, { space: 3 }).moveTo(cardX + 10, talonY).lineTo(cardX + cardW - 10, talonY).stroke(DORADO_OSC);
  doc.undash();
  doc.fillColor(ROJO_OSC).fontSize(8).font('Helvetica-Bold')
    .text(`N° DE BOLETA: ${carton.codigo_unico}`, cardX, talonY + 8, { width: cardW, align: 'center' });
  doc.fillColor('#999').fontSize(6).font('Helvetica')
    .text('Boleta válida una vez realizado el pago', cardX, talonY + 20, { width: cardW, align: 'center' });
}

module.exports = { generarCartonPDF, generarHojaCartonesPDF, generarBoletasConImagenPremio };