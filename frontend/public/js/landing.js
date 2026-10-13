// ============================================
// landing.js — Portada del cliente (barra, accesos, footer, ganador)
// Lee los datos de js/site-config.js
// ============================================
(function () {
  const C = window.SITE || {};
  const waLink = 'https://wa.me/' + (C.whatsappSoporte || '') + '?text=' + encodeURIComponent(C.mensajeSoporte || '');

  const ICON = {
    wa: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.18 2.095 3.195 5.076 4.483.709.3 1.263.489 1.694.626.712.226 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    fb: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    ig: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
  };

  let n = 0;
  function corona() {
    n++;
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lpG${n}" x1="0" y1="0" x2="100" y2="100"><stop offset="0%" stop-color="#FFF0B3"/><stop offset="50%" stop-color="#D4AF37"/><stop offset="100%" stop-color="#8A6708"/></linearGradient>
        <linearGradient id="lpE${n}" x1="0" y1="0" x2="100" y2="100"><stop offset="0%" stop-color="#00FF9D"/><stop offset="100%" stop-color="#006633"/></linearGradient>
      </defs>
      <path d="M20 35L35 52L50 20L65 52L80 35L88 75H12L20 35Z" stroke="url(#lpG${n})" stroke-width="3.5" stroke-linejoin="round" fill="rgba(212,175,55,0.08)"/>
      <path d="M50 48C45 42 38 48 44 54C38 60 45 66 50 60C55 66 62 60 56 54C62 48 55 42 50 48Z" fill="url(#lpE${n})" stroke="#00FF9D" stroke-width="1.5"/>
      <circle cx="50" cy="54" r="3" fill="#FFF"/><circle cx="20" cy="35" r="3" fill="#00FF9D"/>
      <circle cx="50" cy="20" r="4" fill="#FFF6D6"/><circle cx="80" cy="35" r="3" fill="#00FF9D"/>
    </svg>`;
  }

  const marca = (extra) => `
    <a class="lp-brand" href="index.html" ${extra || ''}>
      <span class="lp-logo">${corona()}</span>
      <span class="lp-brand-name">SORTEOS EL GANADOR<small>CO</small></span>
    </a>`;

  // ── Parte superior: barra + bienvenida + accesos ──
  const top = document.getElementById('lp-top');
  if (top) top.innerHTML = `
    <div class="lp-top"><div class="lp-wrap">
      <nav class="lp-nav">
        ${marca()}
        <a class="lp-nav-wa" href="${waLink}" target="_blank" rel="noopener">${ICON.wa}<span>Soporte WhatsApp</span></a>
      </nav>
    </div></div>
    <div class="lp-wrap">
      <section class="lp-welcome">
        <span class="lp-pill">Sorteos oficiales</span>
        <h1>Bienvenido a <span>Sorteos El Ganador Co</span></h1>
        <p>Elige tu sorteo, compra tus boletas en minutos y recíbelas directo en tu WhatsApp. ¡Mucha suerte!</p>
      </section>
      <div class="lp-actions">
        <a class="lp-act" href="#selector-eventos" data-go="sorteos"><span class="lp-act-ico">🎟️</span>Sorteo activo<small>Comprar boletas</small></a>
        <a class="lp-act" href="consulta.html"><span class="lp-act-ico">🔎</span>Ver mi boleta<small>Consulta con tu número</small></a>
        <a class="lp-act live" href="#" id="lp-live"><span class="lp-act-ico">📺</span><span><i class="lp-dot"></i>Sorteo en vivo</span><small>YouTube y Facebook</small></a>
        <a class="lp-act" href="#lp-ganador" id="lp-go-ganador"><span class="lp-act-ico">🏆</span>Boleta ganadora<small>Resultado del sorteo</small></a>
      </div>
    </div>`;

  // ── Parte inferior: cómo participar + ganador + footer ──
  const g = C.ganador || {};
  const hayGanador = !!(g.numero && String(g.numero).trim());
  const bottom = document.getElementById('lp-bottom');
  if (bottom) bottom.innerHTML = `
    <div class="lp-wrap">
      <section class="lp-how" id="lp-how">
        <h2 class="lp-title">¿Cómo participar?</h2>
        <p class="lp-sub">Es muy fácil, solo 3 pasos</p>
        <div class="lp-steps">
          <div class="lp-step"><b>1</b><p>Elige tu sorteo y tus números</p><span>Escoge cantidad o tu número favorito</span></div>
          <div class="lp-step"><b>2</b><p>Paga y sube tu comprobante</p><span>Nequi, Bancolombia o transferencia</span></div>
          <div class="lp-step"><b>3</b><p>Recibe tu boleta por WhatsApp</p><span>Te llega en minutos, ¡a esperar el sorteo!</span></div>
        </div>
      </section>
      <section class="lp-ganador" id="lp-ganador" ${hayGanador ? '' : 'style="display:none"'}>
        <h2>🏆 Boleta ganadora</h2>
        <div class="num">${hayGanador ? escapeHtml(g.numero) : ''}</div>
        <p>${escapeHtml([g.sorteo, g.premio, g.fecha].filter(Boolean).join(' · '))}</p>
      </section>
    </div>
    <footer class="lp-footer"><div class="lp-wrap">
      ${marca()}
      <p>Sorteos transparentes y confiables. Síguenos y escríbenos por nuestros canales oficiales.</p>
      <div class="lp-social">
        <a class="wa" href="${waLink}" target="_blank" rel="noopener" aria-label="WhatsApp soporte">${ICON.wa}</a>
        <a href="${C.instagram || '#'}" data-red="Instagram" ${C.instagram ? 'target="_blank" rel="noopener"' : ''} aria-label="Instagram">${ICON.ig}</a>
        <a href="${C.facebook || '#'}" data-red="Facebook" ${C.facebook ? 'target="_blank" rel="noopener"' : ''} aria-label="Facebook">${ICON.fb}</a>
        <a href="${C.youtube || '#'}" data-red="YouTube" ${C.youtube ? 'target="_blank" rel="noopener"' : ''} aria-label="YouTube">${ICON.yt}</a>
      </div>
      <div class="lp-copy">© ${new Date().getFullYear()} Sorteos El Ganador Co. Todos los derechos reservados.</div>
    </div></footer>
    <div class="lp-toast" id="lp-toast"></div>`;

  function escapeHtml(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let tt;
  function aviso(msg) {
    const el = document.getElementById('lp-toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3200);
  }

  document.addEventListener('click', (e) => {
    const live = e.target.closest('#lp-live');
    if (live) {
      e.preventDefault();
      const url = C.envivo && C.envivo.url;
      if (url) window.open(url, '_blank', 'noopener');
      else aviso('📺 Aún no hay transmisión en vivo. La anunciaremos en nuestras redes.');
      return;
    }
    const gan = e.target.closest('#lp-go-ganador');
    if (gan) {
      e.preventDefault();
      if (hayGanador) document.getElementById('lp-ganador').scrollIntoView({ behavior: 'smooth', block: 'center' });
      else aviso('🏆 La boleta ganadora se publicará aquí cuando termine el sorteo.');
      return;
    }
    const go = e.target.closest('[data-go="sorteos"]');
    if (go) {
      e.preventDefault();
      const t = document.getElementById('selector-eventos');
      const f = document.getElementById('flujo-compra');
      const el = (t && t.style.display !== 'none') ? t : f;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const red = e.target.closest('a[data-red]');
    if (red && red.getAttribute('href') === '#') {
      e.preventDefault();
      aviso('Pronto compartiremos nuestro canal oficial de ' + red.dataset.red + '.');
    }
  });
})();
