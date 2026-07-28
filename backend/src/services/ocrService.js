const Tesseract = require('tesseract.js');

async function extraerDatosComprobante(imagenUrl) {
  try {
    const { data: { text } } = await Tesseract.recognize(imagenUrl, 'spa', {
      logger: () => {},
    });

    const textoLimpio = text.replace(/\s+/g, ' ').trim();

    return {
      referencia_pago:   extraerReferencia(textoLimpio),
      nombre_titular:    extraerTitular(textoLimpio),
      monto_declarado:   extraerMonto(textoLimpio),
      banco_origen:      extraerBanco(textoLimpio),
      fecha_transaccion: extraerFecha(textoLimpio),
    };
  } catch (err) {
    console.error('OCR error:', err.message);
    return {
      referencia_pago:   null,
      nombre_titular:    null,
      monto_declarado:   null,
      banco_origen:      null,
      fecha_transaccion: null,
    };
  }
}

function extraerReferencia(texto) {
  const patrones = [
    /(?:referencia|ref\.?|aprobaci[oó]n|c[oó]digo|id\s*transacci[oó]n)[:\s#]*([A-Z0-9]{6,20})/i,
    /(?:No\.?|NUM\.?|#)\s*([0-9]{6,18})/i,
    /\b([0-9]{8,18})\b/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extraerTitular(texto) {
  const patrones = [
    /(?:de|desde|remitente|pagado por|enviado por)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i,
    /(?:titular|cliente)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extraerMonto(texto) {
  const patrones = [
    /\$\s*([\d.,]+)/,
    /(?:valor|monto|total)[:\s]*\$?\s*([\d.,]+)/i,
    /COP\s*([\d.,]+)/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) {
      const num = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(num) && num > 100 && num < 100000000) return num;
    }
  }
  return null;
}

function extraerBanco(texto) {
  const t = texto.toLowerCase();
  if (t.includes('nequi'))       return 'Nequi';
  if (t.includes('bancolombia')) return 'Bancolombia';
  if (t.includes('daviplata'))   return 'Daviplata';
  if (t.includes('davivienda'))  return 'Davivienda';
  if (t.includes('bbva'))        return 'BBVA';
  if (t.includes('av villas'))   return 'AV Villas';
  if (t.includes('bogot'))       return 'Banco de Bogotá';
  if (t.includes('occidente'))   return 'Banco de Occidente';
  if (t.includes('pse'))         return 'PSE';
  return null;
}

function extraerFecha(texto) {
  const patrones = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

module.exports = { extraerDatosComprobante };