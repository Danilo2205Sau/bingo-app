// ============================================
// bingo-bg.js — Genera el fondo animado del hero
// (bolas de bingo cayendo + destellos dorados)
// ============================================

(function () {
  const hero = document.getElementById('hero-section');
  if (!hero) return;

  // Respeta si el usuario prefiere menos movimiento
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('div');
  canvas.id = 'bingo-bg-canvas';
  hero.prepend(canvas);

  const NUM_BALLS  = 14;
  const NUM_SPARKS = 22;
  const colores    = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const letras     = ['B', 'I', 'N', 'G', 'O'];

  for (let i = 0; i < NUM_BALLS; i++) {
    const ball = document.createElement('div');
    const size = 22 + Math.random() * 22; // 22–44px
    ball.className = `bingo-ball ${colores[i % colores.length]}`;
    ball.textContent = letras[Math.floor(Math.random() * letras.length)] +
      (1 + Math.floor(Math.random() * 15));
    ball.style.setProperty('--size', `${size}px`);
    ball.style.left = `${Math.random() * 100}%`;
    ball.style.animationDuration = `${9 + Math.random() * 8}s, ${3 + Math.random() * 3}s`;
    ball.style.animationDelay = `${-Math.random() * 14}s, ${-Math.random() * 4}s`;
    canvas.appendChild(ball);
  }

  for (let i = 0; i < NUM_SPARKS; i++) {
    const spark = document.createElement('div');
    const size = 3 + Math.random() * 5;
    spark.className = 'bingo-spark';
    spark.style.setProperty('--size', `${size}px`);
    spark.style.left = `${Math.random() * 100}%`;
    spark.style.top = `${Math.random() * 100}%`;
    spark.style.animationDuration = `${1.5 + Math.random() * 2.5}s`;
    spark.style.animationDelay = `${-Math.random() * 4}s`;
    canvas.appendChild(spark);
  }
})();
