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

module.exports = { generarCartonPDF };
