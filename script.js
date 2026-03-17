// Configuration
const n = 10;
const w = 500;
const h = 500;
const positiveMassFactor = 2;
const baseMass = 1;
const baseCharge = 1;
const coulombK = 5000;
const softening = 20;
const dt = 0.016;

// State
let particles = [];
let playing = true;
let canvas, ctx;

// Initialize particles: even spread, equal +/- , positive heavier
function initParticles() {
  particles = [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const halfPos = n / 2;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col + 0.5) * cellW;
    const y = (row + 0.5) * cellH;
    const charge = i < halfPos ? baseCharge : -baseCharge;
    const mass = charge > 0 ? baseMass * positiveMassFactor : baseMass;

    particles.push({
      x, y,
      vx: 0, vy: 0,
      mass,
      charge,
      radius: 4
    });
  }
}

// Torus distance (shortest path wraps around)
function torusDist(ax, ay, bx, by) {
  let dx = bx - ax;
  let dy = by - ay;
  if (dx > w / 2) dx -= w;
  if (dx < -w / 2) dx += w;
  if (dy > h / 2) dy -= h;
  if (dy < -h / 2) dy += h;
  return { dx, dy, r: Math.sqrt(dx * dx + dy * dy + softening * softening) };
}

// Coulomb force on particle i from particle j
function coulombForce(pi, pj) {
  const { dx, dy, r } = torusDist(pi.x, pi.y, pj.x, pj.y);
  const r3 = r * r * r;
  const f = (coulombK * pi.charge * pj.charge) / (r * r);
  const fx = (f * dx) / r;
  const fy = (f * dy) / r;
  return { fx, fy };
}

// Update: forces -> velocity -> position, torus wrap
function update() {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    let fx = 0, fy = 0;

    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue;
      const f = coulombForce(p, particles[j]);
      fx += f.fx;
      fy += f.fy;
    }

    const ax = fx / p.mass;
    const ay = fy / p.mass;
    p.vx += ax * dt;
    p.vy += ay * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Torus boundary
    if (p.x < 0) p.x += w;
    if (p.x >= w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y >= h) p.y -= h;
  }
}

// Draw particles
function draw() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);

  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.charge > 0 ? '#4488ff' : '#ff4444';
    ctx.fill();
  }
}

// Animation loop
function loop() {
  if (playing) update();
  draw();
  requestAnimationFrame(loop);
}

// Setup
function setup() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  initParticles();

  document.getElementById('playPause').addEventListener('click', () => {
    playing = !playing;
    document.getElementById('playPause').textContent = playing ? 'Pause' : 'Play';
  });

  document.getElementById('reset').addEventListener('click', () => {
    initParticles();
  });

  loop();
}

setup();
