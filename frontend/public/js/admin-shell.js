document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bgCanvas');
  const context = canvas?.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canvas && context && !reduceMotion) {
    const particles = [];
    const particleCount = window.matchMedia('(max-width: 700px)').matches ? 12 : 24;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedY = -(Math.random() * 0.5 + 0.2);
        this.opacity = Math.random() * 0.5 + 0.2;
      }
      update() {
        this.y += this.speedY;
        if (this.y < 0) { this.reset(); this.y = canvas.height; }
      }
      draw() {
        context.fillStyle = `rgba(212,175,55,${this.opacity})`;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
      }
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    for (let i = 0; i < particleCount; i++) particles.push(new Particle());
    let animationFrame = 0;
    function animate() {
      animationFrame = 0;
      if (document.visibilityState !== 'visible') return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(particle => { particle.update(); particle.draw(); });
      animationFrame = window.requestAnimationFrame(animate);
    }
    const updateAnimation = () => {
      if (document.visibilityState === 'visible' && !animationFrame) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', updateAnimation);
    updateAnimation();
  }

  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('btn-hamburguesa');
  const closeMenu = () => {
    sidebar?.classList.remove('abierta');
    overlay?.classList.remove('abierta');
  };
  toggle?.addEventListener('click', () => {
    sidebar?.classList.add('abierta');
    overlay?.classList.add('abierta');
  });
  overlay?.addEventListener('click', closeMenu);

  document.querySelectorAll('[data-focus-unlock]').forEach(input => {
    input.addEventListener('focus', () => input.removeAttribute('readonly'), { once: true });
  });

  const modales = [...document.querySelectorAll('.modal-overlay')];
  const syncModalScroll = () => {
    const abierto = modales.some(modal => modal.style.display !== 'none' && modal.style.display !== '');
    document.body.classList.toggle('modal-abierto', abierto);
  };
  modales.forEach(modal => new MutationObserver(syncModalScroll).observe(modal, {
    attributes: true,
    attributeFilter: ['style'],
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') modales.forEach(modal => { modal.style.display = 'none'; });
  });

  const navItems = [...document.querySelectorAll('.nav-item[data-modulo]')];
  const modules = [...document.querySelectorAll('.modulo[data-modulo]')];
  navItems.forEach(button => button.addEventListener('click', () => {
    const moduleName = button.dataset.modulo;
    navItems.forEach(item => item.classList.toggle('activo', item === button));
    modules.forEach(module => module.classList.toggle('activo', module.dataset.modulo === moduleName));
    modales.forEach(modal => { modal.style.display = 'none'; });
    closeMenu();
    window.scrollTo(0, 0);
  }));
});
