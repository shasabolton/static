// Configuration
const w = 500;
const h = 500;
const gridSize = 10;
const cellW = w / gridSize;
const cellH = h / gridSize;
const particleRadius = 4;
const electronCharge = -1;
const protonCharge = 4; // 4x electron
const electronMass = 1;
const protonMass = 2;
const coulombK = 5000;
const softening = 20;
const maxDt = 0.05;

// State
let grid = [];
let protons = [];
let electrons = [];
let playing = false;
let canvas, ctx;
let selectedMaterial = 'air';

// Cell types: 'copper' | 'insulator' | 'air'
function initGrid() {
  grid = [];
  for (let j = 0; j < gridSize; j++) {
    const row = [];
    for (let i = 0; i < gridSize; i++) {
      row.push('air');
    }
    grid.push(row);
  }
  protons = [];
  electrons = [];
}

// Get cell at grid coordinates
function getCell(ci, cj) {
  if (ci < 0 || ci >= gridSize || cj < 0 || cj >= gridSize) return null;
  return grid[cj][ci];
}

// Check if cell is copper
function isCopper(ci, cj) {
  const c = getCell(ci, cj);
  return c === 'copper';
}

// Add 4 electrons to a copper cell
function addElectronsToCell(ci, cj) {
  if (!isCopper(ci, cj)) return;
  const margin = particleRadius * 2;
  for (let k = 0; k < 4; k++) {
    const ex = ci * cellW + margin + Math.random() * (cellW - 2 * margin);
    const ey = cj * cellH + margin + Math.random() * (cellH - 2 * margin);
    electrons.push({
      x: ex, y: ey,
      vx: 0, vy: 0,
      charge: electronCharge,
      mass: electronMass,
      cellI: ci, cellJ: cj,
      radius: particleRadius
    });
  }
}

// Place material at cell, update particles
function placeMaterial(ci, cj, material) {
  const prev = grid[cj][ci];

  if (material === 'electron') {
    addElectronsToCell(ci, cj);
    return;
  }

  if (prev === material) return;

  // Remove particles from this cell if it was copper
  if (prev === 'copper') {
    protons = protons.filter(p => !(p.cellI === ci && p.cellJ === cj));
    electrons = electrons.filter(e => !(e.cellI === ci && e.cellJ === cj));
  }

  grid[cj][ci] = material;

  if (material === 'copper') {
    const cx = ci * cellW + cellW / 2;
    const cy = cj * cellH + cellH / 2;
    protons.push({
      x: cx, y: cy,
      charge: protonCharge,
      mass: protonMass,
      cellI: ci, cellJ: cj
    });
    for (let k = 0; k < 4; k++) {
      const margin = particleRadius * 2;
      const ex = ci * cellW + margin + Math.random() * (cellW - 2 * margin);
      const ey = cj * cellH + margin + Math.random() * (cellH - 2 * margin);
      electrons.push({
        x: ex, y: ey,
        vx: 0, vy: 0,
        charge: electronCharge,
        mass: electronMass,
        cellI: ci, cellJ: cj,
        radius: particleRadius
      });
    }
  }
}

// Coulomb force between two points
function coulombForce(ax, ay, aq, bx, by, bq) {
  let dx = bx - ax;
  let dy = by - ay;
  const r = Math.sqrt(dx * dx + dy * dy + softening * softening);
  const f = (coulombK * aq * bq) / (r * r);
  return {
    fx: -(f * dx) / r,
    fy: -(f * dy) / r
  };
}

// Bounce electron off wall or allow through to adjacent copper
// When crossing into copper: only update cell ref, position stays (smooth movement)
function handleElectronBoundary(e) {
  const left = e.cellI * cellW;
  const right = (e.cellI + 1) * cellW;
  const top = e.cellJ * cellH;
  const bottom = (e.cellJ + 1) * cellH;
  const margin = particleRadius;

  // Left wall
  if (e.x < left + margin) {
    if (isCopper(e.cellI - 1, e.cellJ)) {
      e.cellI--;
    } else {
      e.x = left + margin + (left + margin - e.x);
      e.vx = -e.vx;
    }
  }
  // Right wall
  if (e.x > right - margin) {
    if (isCopper(e.cellI + 1, e.cellJ)) {
      e.cellI++;
    } else {
      e.x = right - margin - (e.x - (right - margin));
      e.vx = -e.vx;
    }
  }
  // Top wall
  if (e.y < top + margin) {
    if (isCopper(e.cellI, e.cellJ - 1)) {
      e.cellJ--;
    } else {
      e.y = top + margin + (top + margin - e.y);
      e.vy = -e.vy;
    }
  }
  // Bottom wall
  if (e.y > bottom - margin) {
    if (isCopper(e.cellI, e.cellJ + 1)) {
      e.cellJ++;
    } else {
      e.y = bottom - margin - (e.y - (bottom - margin));
      e.vy = -e.vy;
    }
  }
}

// Update physics
function update(dt) {
  if (!playing) return;

  // Compute force on each electron
  for (let i = 0; i < electrons.length; i++) {
    const e = electrons[i];
    let fx = 0, fy = 0;

    for (const p of protons) {
      const f = coulombForce(e.x, e.y, e.charge, p.x, p.y, p.charge);
      fx += f.fx;
      fy += f.fy;
    }
    for (let j = 0; j < electrons.length; j++) {
      if (i === j) continue;
      const o = electrons[j];
      const f = coulombForce(e.x, e.y, e.charge, o.x, o.y, o.charge);
      fx += f.fx;
      fy += f.fy;
    }

    e.vx += (fx / e.mass) * dt;
    e.vy += (fy / e.mass) * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    handleElectronBoundary(e);
  }
}

// Draw
function draw() {
  // Cell backgrounds
  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      if (grid[j][i] === 'copper') {
        ctx.fillStyle = '#b87333';
      } else if (grid[j][i] === 'insulator') {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#000000';
      }
      ctx.fillRect(i * cellW, j * cellH, cellW, cellH);
    }
  }

  // Grid lines
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellW, 0);
    ctx.lineTo(i * cellW, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellH);
    ctx.lineTo(w, i * cellH);
    ctx.stroke();
  }

  // Protons
  for (const p of protons) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#4488ff';
    ctx.fill();
  }

  // Electrons
  for (const e of electrons) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.fill();
  }
}

// Canvas click -> place material
function handleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const ci = Math.floor(x / cellW);
  const cj = Math.floor(y / cellH);
  if (ci >= 0 && ci < gridSize && cj >= 0 && cj < gridSize) {
    placeMaterial(ci, cj, selectedMaterial);
  }
}

// Animation loop
let lastTime = 0;
function loop(now) {
  if (lastTime === 0) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, maxDt);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function setup() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  initGrid();

  document.getElementById('material').addEventListener('change', (e) => {
    selectedMaterial = e.target.value;
  });

  canvas.addEventListener('click', handleClick);

  document.getElementById('playPause').addEventListener('click', () => {
    playing = !playing;
    document.getElementById('playPause').textContent = playing ? 'Pause' : 'Play';
  });

  document.getElementById('reset').addEventListener('click', () => {
    initGrid();
  });

  requestAnimationFrame(loop);
}

setup();
