// Configuration
const w = 500;
const h = 500;
const particleRadius = 4;
const latticeSpacing = 8 * particleRadius;
const positiveMassFactor = 2;
const baseMass = 1;
const baseCharge = 1;
const coulombK = 5000;
const softening = 20;
const maxDt = 0.05; // cap to avoid huge jumps when tab was inactive

// State
let particles = [];
let rigidBodies = [];
let playing = true;
let canvas, ctx;

// Create a lattice rigid body. lw, lh = width/height in particles (e.g. 2x2 = 4 particles)
function createLatticeBody(lw, lh, charge, centerX, centerY) {
  const massPerParticle = charge > 0 ? baseMass * positiveMassFactor : baseMass;
  const body = {
    centerX, centerY,
    vx: 0, vy: 0,
    angle: 0,
    angularVelocity: 0,
    mass: 0,
    I: 0,
    particles: []
  };

  let totalMass = 0;
  let totalI = 0;

  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const localX = (i - (lw - 1) / 2) * latticeSpacing;
      const localY = (j - (lh - 1) / 2) * latticeSpacing;
      const p = {
        x: centerX + localX,
        y: centerY + localY,
        vx: 0, vy: 0,
        mass: massPerParticle,
        charge,
        radius: particleRadius,
        body,
        localX, localY
      };
      body.particles.push(p);
      particles.push(p);
      totalMass += massPerParticle;
      totalI += massPerParticle * (localX * localX + localY * localY);
    }
  }
  body.mass = totalMass;
  body.I = totalI;
  body.particles.forEach(p => { p.body = body; });

  rigidBodies.push(body);
  return body;
}

// Update particle position/velocity from rigid body state
function syncLatticeParticles(body) {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  for (const p of body.particles) {
    const rx = cos * p.localX - sin * p.localY;
    const ry = sin * p.localX + cos * p.localY;
    p.x = body.centerX + rx;
    p.y = body.centerY + ry;
    p.vx = body.vx - body.angularVelocity * ry;
    p.vy = body.vy + body.angularVelocity * rx;
  }
}

// Initialize: two 2x2 positive lattices, 8 free negative particles
function initParticles() {
  particles = [];
  rigidBodies = [];

  createLatticeBody(2, 2, baseCharge, 150, 250);
  createLatticeBody(2, 2, baseCharge, 350, 250);

  // 8 free negative particles, even spread
  const cols = 4, rows = 2;
  const cellW = w / cols, cellH = h / rows;
  for (let i = 0; i < 8; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    particles.push({
      x: (col + 0.5) * cellW,
      y: (row + 0.5) * cellH,
      vx: 0, vy: 0,
      mass: baseMass,
      charge: -baseCharge,
      radius: particleRadius
    });
  }

  rigidBodies.forEach(syncLatticeParticles);
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
  const f = (coulombK * pi.charge * pj.charge) / (r * r);
  const fx = -(f * dx) / r;
  const fy = -(f * dy) / r;
  return { fx, fy };
}

// Update: forces -> velocity -> position, torus wrap
function update(dt) {
  // Compute force on each particle
  const forces = particles.map(pi => {
    let fx = 0, fy = 0;
    for (let j = 0; j < particles.length; j++) {
      if (pi === particles[j]) continue;
      const f = coulombForce(pi, particles[j]);
      fx += f.fx;
      fy += f.fy;
    }
    return { fx, fy };
  });

  // Update free particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.body) continue; // lattice particles handled by rigid body

    const { fx, fy } = forces[i];
    p.vx += (fx / p.mass) * dt;
    p.vy += (fy / p.mass) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < 0) p.x += w;
    if (p.x >= w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y >= h) p.y -= h;
  }

  // Update rigid bodies: sum F and torque, integrate, sync particles
  for (const body of rigidBodies) {
    let fx = 0, fy = 0;
    let torque = 0;

    for (let i = 0; i < particles.length; i++) {
      if (particles[i].body !== body) continue;
      const f = forces[i];
      fx += f.fx;
      fy += f.fy;
      const cos = Math.cos(body.angle);
      const sin = Math.sin(body.angle);
      const rx = cos * particles[i].localX - sin * particles[i].localY;
      const ry = sin * particles[i].localX + cos * particles[i].localY;
      torque += rx * f.fy - ry * f.fx;
    }

    body.vx += (fx / body.mass) * dt;
    body.vy += (fy / body.mass) * dt;
    body.angularVelocity += (torque / body.I) * dt;
    body.centerX += body.vx * dt;
    body.centerY += body.vy * dt;
    body.angle += body.angularVelocity * dt;

    if (body.centerX < 0) body.centerX += w;
    if (body.centerX >= w) body.centerX -= w;
    if (body.centerY < 0) body.centerY += h;
    if (body.centerY >= h) body.centerY -= h;

    syncLatticeParticles(body);
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
let lastTime = 0;
function loop(now) {
  if (lastTime === 0) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, maxDt);
  lastTime = now;
  if (playing) update(dt);
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

  requestAnimationFrame(loop);
}

setup();
