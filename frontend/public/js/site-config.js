// ============================================
// site-config.js — Datos editables de la portada
// Edita SOLO este archivo para cambiar enlaces, en vivo y boleta ganadora.
// Si un enlace queda vacío (''), ese botón/ícono se oculta o muestra aviso.
// ============================================
window.SITE = {
  nombre: 'SORTEOS EL GANADOR CO',

  // Soporte por WhatsApp (solo números, con indicativo de país)
  whatsappSoporte: '573205066364',
  mensajeSoporte: 'Hola, necesito ayuda para comprar mi boleta en Sorteos El Ganador Co.',

  // Redes oficiales (pega aquí el enlace completo, ej: 'https://www.instagram.com/tu_usuario')
  instagram: '',
  facebook:  '',
  youtube:   '',

  // Sorteo en vivo: cuando haya transmisión, pega el enlace del directo
  // (YouTube o Facebook). Vacío = el botón avisa que aún no hay transmisión.
  envivo: { url: '', plataforma: 'YouTube / Facebook' },

  // Boleta ganadora: llena estos datos cuando termine el sorteo.
  // Si 'numero' está vacío, la sección no se muestra.
  ganador: { numero: '', sorteo: '', premio: '', fecha: '' }
};
