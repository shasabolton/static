// Configuration
const w = 500;
const h = 500;
const gridSize = 10;
const cellW = w / gridSize;
const cellH = h / gridSize;
const particleRadius = 4;
const electronCharge = -1;
const protonCharge = 1;
const electronMass = 1;
const protonMass = 1;
const coulombK = 5000;
const softening = 20;
const maxDt = 0.05;
const wallRestitution = 0; // 0 = fully inelastic (stop at wall)

// State
let grid = [];
let protons = [];
let electrons = [];
let freeBodies = [];
let playing = false;
let canvas, ctx;

// Cell types: 'copper' | 'insulator' | 'air' | 'free_copper'
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
  freeBodies = [];
}

function getCell(ci, cj) {
  if (ci < 0 || ci >= gridSize || cj < 0 || cj >= gridSize) return null;
  return grid[cj][ci];
}

function isCopper(ci, cj) {
  const c = getCell(ci, cj);
  return c === 'copper';
}

function isInsulator(ci, cj) {
  return getCell(ci, cj) === 'insulator';
}

function getBodyAtPoint(x, y) {
  for (const body of freeBodies) {
    for (const cell of body.cells) {
      const left = body.centerX + cell.offsetX;
      const top = body.centerY + cell.offsetY;
      if (x >= left && x < left + cellW && y >= top && y < top + cellH) {
        return { body, cell };
      }
    }
  }
  return null;
}

// Check if grid cell (ci,cj) is copper (fixed or part of a body - but bodies move off grid)
function isCopperAtGrid(ci, cj) {
  return getCell(ci, cj) === 'copper';
}

function isCopperOrFreeCopper(ci, cj) {
  const c = getCell(ci, cj);
  return c === 'copper' || c === 'free_copper';
}

function addElectronsToCell(ci, cj) {
  if (!isCopperOrFreeCopper(ci, cj)) return;
  const margin = particleRadius * 2;
  const ex = ci * cellW + margin + Math.random() * (cellW - 2 * margin);
  const ey = cj * cellH + margin + Math.random() * (cellH - 2 * margin);
  electrons.push({
    x: ex, y: ey, vx: 0, vy: 0,
    charge: electronCharge, mass: electronMass,
    cellI: ci, cellJ: cj, radius: particleRadius,
    body: null
  });
}

function placeMaterial(ci, cj, material) {
  const prev = grid[cj][ci];

  if (material === 'electron') {
    addElectronsToCell(ci, cj);
    return;
  }

  if (prev === material) return;

  if ((material === 'copper' || material === 'free_copper') && (prev === 'copper' || prev === 'free_copper')) {
    return;
  }

  if (prev === 'copper' || prev === 'free_copper') {
    protons = protons.filter(p => !(p.cellI === ci && p.cellJ === cj));
    electrons = electrons.filter(e => !(e.cellI === ci && e.cellJ === cj));
  }

  grid[cj][ci] = material;

  if (material === 'copper' || material === 'free_copper') {
    const cx = ci * cellW + cellW / 2;
    const cy = cj * cellH + cellH / 2;
    protons.push({
      x: cx, y: cy, charge: protonCharge, mass: protonMass,
      cellI: ci, cellJ: cj, fixed: material === 'copper'
    });
    const margin = particleRadius * 2;
    const ex = ci * cellW + margin + Math.random() * (cellW - 2 * margin);
    const ey = cj * cellH + margin + Math.random() * (cellH - 2 * margin);
    electrons.push({
      x: ex, y: ey, vx: 0, vy: 0,
      charge: electronCharge, mass: electronMass,
      cellI: ci, cellJ: cj, radius: particleRadius,
      body: null
    });
  }
}

// Find connected components of free_copper cells
function findFreeCopperBodies() {
  const visited = [];
  for (let j = 0; j < gridSize; j++) {
    visited.push([]);
    for (let i = 0; i < gridSize; i++) {
      visited[j].push(false);
    }
  }

  const bodies = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function flood(ci, cj, cells) {
    if (ci < 0 || ci >= gridSize || cj < 0 || cj >= gridSize) return;
    if (visited[cj][ci] || getCell(ci, cj) !== 'free_copper') return;
    visited[cj][ci] = true;
    cells.push({ ci, cj });
    for (const [di, dj] of dirs) {
      flood(ci + di, cj + dj, cells);
    }
  }

  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      if (getCell(i, j) === 'free_copper' && !visited[j][i]) {
        const cells = [];
        flood(i, j, cells);
        if (cells.length > 0) {
          let cx = 0, cy = 0;
          for (const c of cells) {
            cx += c.ci * cellW + cellW / 2;
            cy += c.cj * cellH + cellH / 2;
          }
          cx /= cells.length;
          cy /= cells.length;

          const body = {
            centerX: cx, centerY: cy, vx: 0, vy: 0,
            mass: cells.length * protonMass,
            cells: [],
            protons: [],
            electrons: []
          };

          for (const c of cells) {
            const offsetX = (c.ci * cellW + cellW / 2) - cx;
            const offsetY = (c.cj * cellH + cellH / 2) - cy;
            body.cells.push({
              ci: c.ci, cj: c.cj,
              offsetX: c.ci * cellW - body.centerX,
              offsetY: c.cj * cellH - body.centerY
            });
          }

          const bodyProtons = protons.filter(p => p.cellI !== undefined && !p.fixed &&
            cells.some(c => c.ci === p.cellI && c.cj === p.cellJ));
          const bodyElectrons = electrons.filter(e => e.body === null &&
            cells.some(c => c.ci === e.cellI && c.cj === e.cellJ));

          for (const p of bodyProtons) {
            const cell = body.cells.find(c => c.ci === p.cellI && c.cj === p.cellJ);
            body.protons.push({
              ...p,
              offsetX: p.x - body.centerX,
              offsetY: p.y - body.centerY
            });
          }
          protons = protons.filter(p => !bodyProtons.includes(p));

          for (const e of bodyElectrons) {
            e.body = body;
            e.localCellI = e.cellI;
            e.localCellJ = e.cellJ;
            body.electrons.push(e);
          }
          electrons = electrons.filter(e => !bodyElectrons.includes(e));

          freeBodies.push(body);
        }
      }
    }
  }

  grid.forEach((row, j) => row.forEach((cell, i) => {
    if (cell === 'free_copper') grid[j][i] = 'air';
  }));
}

function coulombForce(ax, ay, aq, bx, by, bq) {
  const dx = bx - ax;
  const dy = by - ay;
  const rActualSq = dx * dx + dy * dy;
  const rSoftSq = rActualSq + softening * softening;
  const f = (coulombK * aq * bq) / rSoftSq;
  if (rActualSq < 1e-10) return { fx: 0, fy: 0 };
  const rDir = Math.sqrt(rActualSq);
  return { fx: -(f * dx) / rDir, fy: -(f * dy) / rDir };
}

function wallBounce(e, normalX, normalY) {
  const vn = e.vx * normalX + e.vy * normalY;
  if (vn >= 0) return;
  e.vx -= (1 + wallRestitution) * vn * normalX;
  e.vy -= (1 + wallRestitution) * vn * normalY;
}

function handleElectronBoundary(e) {
  if (e.body) {
    handleBodyElectronBoundary(e);
    return;
  }

  const left = e.cellI * cellW;
  const right = (e.cellI + 1) * cellW;
  const top = e.cellJ * cellH;
  const bottom = (e.cellJ + 1) * cellH;
  const margin = particleRadius;

  if (e.x < left + margin) {
    if (isCopperAtGrid(e.cellI - 1, e.cellJ)) {
      e.cellI--;
    } else {
      const hit = getBodyAtPoint(left - 1, e.y) || getBodyNearFixedCopperEdge(left, right, top, bottom, 'left');
      if (hit) transferElectronToBody(e, hit);
      else {
        e.x = left + margin + (left + margin - e.x);
        wallBounce(e, 1, 0);
      }
    }
  }
  if (e.x > right - margin) {
    if (isCopperAtGrid(e.cellI + 1, e.cellJ)) {
      e.cellI++;
    } else {
      const hit = getBodyAtPoint(right + 1, e.y) || getBodyNearFixedCopperEdge(left, right, top, bottom, 'right');
      if (hit) transferElectronToBody(e, hit);
      else {
        e.x = right - margin - (e.x - (right - margin));
        wallBounce(e, -1, 0);
      }
    }
  }
  if (e.y < top + margin) {
    if (isCopperAtGrid(e.cellI, e.cellJ - 1)) {
      e.cellJ--;
    } else {
      const hit = getBodyAtPoint(e.x, top - 1) || getBodyNearFixedCopperEdge(left, right, top, bottom, 'top');
      if (hit) transferElectronToBody(e, hit);
      else {
        e.y = top + margin + (top + margin - e.y);
        wallBounce(e, 0, 1);
      }
    }
  }
  if (e.y > bottom - margin) {
    if (isCopperAtGrid(e.cellI, e.cellJ + 1)) {
      e.cellJ++;
    } else {
      const hit = getBodyAtPoint(e.x, bottom + 1) || getBodyNearFixedCopperEdge(left, right, top, bottom, 'bottom');
      if (hit) transferElectronToBody(e, hit);
      else {
        e.y = bottom - margin - (e.y - (bottom - margin));
        wallBounce(e, 0, -1);
      }
    }
  }
}

function transferElectronToBody(e, hit) {
  if (!hit || !hit.body) return;
  const { body, cell } = hit;
  e.body = body;
  e.cellI = undefined;
  e.cellJ = undefined;
  e.localCellI = cell.ci;
  e.localCellJ = cell.cj;
  body.electrons.push(e);
  electrons = electrons.filter(x => x !== e);
}

function handleBodyElectronBoundary(e) {
  const body = e.body;
  if (!body) return;
  const margin = particleRadius;

  let bodyLeft = Infinity, bodyRight = -Infinity, bodyTop = Infinity, bodyBottom = -Infinity;
  for (const cell of body.cells) {
    const left = body.centerX + cell.offsetX;
    const top = body.centerY + cell.offsetY;
    bodyLeft = Math.min(bodyLeft, left);
    bodyRight = Math.max(bodyRight, left + cellW);
    bodyTop = Math.min(bodyTop, top);
    bodyBottom = Math.max(bodyBottom, top + cellH);
  }

  for (const cell of body.cells) {
    const left = body.centerX + cell.offsetX;
    const right = left + cellW;
    const top = body.centerY + cell.offsetY;
    const bottom = top + cellH;
    if (e.x >= left + margin && e.x <= right - margin && e.y >= top + margin && e.y <= bottom - margin) {
      e.localCellI = cell.ci;
      e.localCellJ = cell.cj;
      return;
    }
  }

  if (e.x < bodyLeft + margin) {
    const hit = getBodyAtPoint(bodyLeft - 1, e.y);
    if (hit) { transferElectronToBody(e, hit); return; }
    const near = getFixedCopperNearEdge(bodyLeft, bodyRight, bodyTop, bodyBottom, 'left', e.y);
    if (near) { transferElectronToFixed(e, near.ci, near.cj); return; }
    e.x = bodyLeft + margin + (bodyLeft + margin - e.x);
    wallBounce(e, 1, 0);
    return;
  }
  if (e.x > bodyRight - margin) {
    const hit = getBodyAtPoint(bodyRight + 1, e.y);
    if (hit) { transferElectronToBody(e, hit); return; }
    const near = getFixedCopperNearEdge(bodyLeft, bodyRight, bodyTop, bodyBottom, 'right', e.y);
    if (near) { transferElectronToFixed(e, near.ci, near.cj); return; }
    e.x = bodyRight - margin - (e.x - (bodyRight - margin));
    wallBounce(e, -1, 0);
    return;
  }
  if (e.y < bodyTop + margin) {
    const hit = getBodyAtPoint(e.x, bodyTop - 1);
    if (hit) { transferElectronToBody(e, hit); return; }
    const near = getFixedCopperNearEdge(bodyLeft, bodyRight, bodyTop, bodyBottom, 'top', e.x);
    if (near) { transferElectronToFixed(e, near.ci, near.cj); return; }
    e.y = bodyTop + margin + (bodyTop + margin - e.y);
    wallBounce(e, 0, 1);
    return;
  }
  if (e.y > bodyBottom - margin) {
    const hit = getBodyAtPoint(e.x, bodyBottom + 1);
    if (hit) { transferElectronToBody(e, hit); return; }
    const near = getFixedCopperNearEdge(bodyLeft, bodyRight, bodyTop, bodyBottom, 'bottom', e.x);
    if (near) { transferElectronToFixed(e, near.ci, near.cj); return; }
    e.y = bodyBottom - margin - (e.y - (bodyBottom - margin));
    wallBounce(e, 0, -1);
  }
}

function transferElectronToFixed(e, ci, cj) {
  if (!isCopperAtGrid(ci, cj)) return;
  if (!e.body) return;
  e.body.electrons = e.body.electrons.filter(x => x !== e);
  e.body = null;
  e.cellI = ci;
  e.cellJ = cj;
  const margin = particleRadius * 2;
  e.x = Math.max(ci * cellW + margin, Math.min((ci + 1) * cellW - margin, e.x));
  e.y = Math.max(cj * cellH + margin, Math.min((cj + 1) * cellH - margin, e.y));
  electrons.push(e);
}

function bodyOverlapsInsulator(body) {
  for (const cell of body.cells) {
    const left = body.centerX + cell.offsetX;
    const top = body.centerY + cell.offsetY;
    const ci0 = Math.max(0, Math.floor(left / cellW));
    const ci1 = Math.min(gridSize - 1, Math.floor((left + cellW - 1) / cellW));
    const cj0 = Math.max(0, Math.floor(top / cellH));
    const cj1 = Math.min(gridSize - 1, Math.floor((top + cellH - 1) / cellH));
    for (let gi = ci0; gi <= ci1; gi++) {
      for (let gj = cj0; gj <= cj1; gj++) {
        if (isInsulator(gi, gj)) return true;
      }
    }
  }
  return false;
}

function getBodyAABB(body) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const cell of body.cells) {
    const l = body.centerX + cell.offsetX;
    const t = body.centerY + cell.offsetY;
    left = Math.min(left, l);
    right = Math.max(right, l + cellW);
    top = Math.min(top, t);
    bottom = Math.max(bottom, t + cellH);
  }
  return { left, right, top, bottom };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

const transferGap = cellW / 10;

function getCopperOverlap(body) {
  const bodyBox = getBodyAABB(body);
  let bestPush = null;
  let bestLen = 0;
  for (const cell of body.cells) {
    const left = body.centerX + cell.offsetX;
    const top = body.centerY + cell.offsetY;
    const ci0 = Math.max(0, Math.floor(left / cellW));
    const ci1 = Math.min(gridSize - 1, Math.floor((left + cellW - 1) / cellW));
    const cj0 = Math.max(0, Math.floor(top / cellH));
    const cj1 = Math.min(gridSize - 1, Math.floor((top + cellH - 1) / cellH));
    for (let gi = ci0; gi <= ci1; gi++) {
      for (let gj = cj0; gj <= cj1; gj++) {
        if (!isCopperAtGrid(gi, gj)) continue;
        const cellBox = { left: gi * cellW, right: (gi + 1) * cellW, top: gj * cellH, bottom: (gj + 1) * cellH };
        if (!rectsOverlap(bodyBox, cellBox)) continue;
        const overlapX = Math.min(bodyBox.right - cellBox.left, cellBox.right - bodyBox.left);
        const overlapY = Math.min(bodyBox.bottom - cellBox.top, cellBox.bottom - bodyBox.top);
        const cellCx = (gi + 0.5) * cellW;
        const cellCy = (gj + 0.5) * cellH;
        const bodyCx = (bodyBox.left + bodyBox.right) / 2;
        const bodyCy = (bodyBox.top + bodyBox.bottom) / 2;
        const dx = bodyCx - cellCx;
        const dy = bodyCy - cellCy;
        let pushX = 0, pushY = 0;
        if (overlapX < overlapY) {
          pushX = dx > 0 ? overlapX : -overlapX;
        } else {
          pushY = dy > 0 ? overlapY : -overlapY;
        }
        const len = Math.sqrt(pushX * pushX + pushY * pushY);
        if (len > bestLen) {
          bestLen = len;
          bestPush = { pushX, pushY };
        }
      }
    }
  }
  return bestPush;
}

function getFixedCopperNearEdge(bodyLeft, bodyRight, bodyTop, bodyBottom, edge, coord) {
  let gi, gj;
  if (edge === 'left') {
    gi = Math.floor(bodyLeft / cellW) - 1;
    gj = Math.floor(coord / cellH);
  } else if (edge === 'right') {
    gi = Math.floor(bodyRight / cellW);
    gj = Math.floor(coord / cellH);
  } else if (edge === 'top') {
    gi = Math.floor(coord / cellW);
    gj = Math.floor(bodyTop / cellH) - 1;
  } else {
    gi = Math.floor(coord / cellW);
    gj = Math.floor(bodyBottom / cellH);
  }
  if (gi < 0 || gi >= gridSize || gj < 0 || gj >= gridSize) return null;
  if (!isCopperAtGrid(gi, gj)) return null;
  const cLeft = gi * cellW, cRight = (gi + 1) * cellW, cTop = gj * cellH, cBottom = (gj + 1) * cellH;
  let gap = 0;
  if (edge === 'left') { gap = bodyLeft - cRight; }
  else if (edge === 'right') { gap = cLeft - bodyRight; }
  else if (edge === 'top') { gap = bodyTop - cBottom; }
  else { gap = cTop - bodyBottom; }
  if (gap <= 0 || gap >= transferGap) return null;
  return { ci: gi, cj: gj };
}

function getBodyNearFixedCopperEdge(cellLeft, cellRight, cellTop, cellBottom, edge) {
  for (const body of freeBodies) {
    const b = getBodyAABB(body);
    let gap = 0;
    if (edge === 'left') { gap = cellLeft - b.right; if (gap <= 0 || gap >= transferGap) continue; }
    else if (edge === 'right') { gap = b.left - cellRight; if (gap <= 0 || gap >= transferGap) continue; }
    else if (edge === 'top') { gap = cellTop - b.bottom; if (gap <= 0 || gap >= transferGap) continue; }
    else if (edge === 'bottom') { gap = b.top - cellBottom; if (gap <= 0 || gap >= transferGap) continue; }
    return { body, cell: body.cells[0] };
  }
  return null;
}

function getBodyBodyOverlap(bodyA, bodyB) {
  const a = getBodyAABB(bodyA);
  const b = getBodyAABB(bodyB);
  if (!rectsOverlap(a, b)) return null;
  const overlapX = Math.min(a.right - b.left, b.right - a.left);
  const overlapY = Math.min(a.bottom - b.top, b.bottom - a.top);
  const acx = (a.left + a.right) / 2;
  const acy = (a.top + a.bottom) / 2;
  const bcx = (b.left + b.right) / 2;
  const bcy = (b.top + b.bottom) / 2;
  const dx = acx - bcx;
  const dy = acy - bcy;
  let pushAX = 0, pushAY = 0;
  if (overlapX < overlapY) {
    pushAX = dx > 0 ? overlapX / 2 : -overlapX / 2;
    pushAY = 0;
  } else {
    pushAX = 0;
    pushAY = dy > 0 ? overlapY / 2 : -overlapY / 2;
  }
  return { pushAX, pushAY, pushBX: -pushAX, pushBY: -pushAY };
}

function update(dt) {
  if (!playing) return;

  const allProtons = [...protons];
  for (const body of freeBodies) {
    for (const p of body.protons) {
      p.x = body.centerX + p.offsetX;
      p.y = body.centerY + p.offsetY;
      allProtons.push(p);
    }
  }

  const allElectrons = [...electrons];
  for (const body of freeBodies) {
    if (body && body.electrons) allElectrons.push(...body.electrons);
  }

  for (let i = 0; i < allElectrons.length; i++) {
    const e = allElectrons[i];
    let fx = 0, fy = 0;
    for (const p of allProtons) {
      const f = coulombForce(e.x, e.y, e.charge, p.x, p.y, p.charge);
      fx += f.fx;
      fy += f.fy;
    }
    for (let j = 0; j < allElectrons.length; j++) {
      if (i === j) continue;
      const o = allElectrons[j];
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

  for (const body of freeBodies) {
    body.centerX += body.vx * dt;
    body.centerY += body.vy * dt;

    if (bodyOverlapsInsulator(body)) {
      body.centerX -= body.vx * dt;
      body.centerY -= body.vy * dt;
      body.vx = 0;
      body.vy = 0;
    }

    body.centerX = Math.max(0, Math.min(w, body.centerX));
    body.centerY = Math.max(0, Math.min(h, body.centerY));
    if (body.centerX <= 0 || body.centerX >= w) { body.vx = 0; }
    if (body.centerY <= 0 || body.centerY >= h) { body.vy = 0; }

    for (const p of body.protons) {
      p.x = body.centerX + p.offsetX;
      p.y = body.centerY + p.offsetY;
    }
  }

  for (let iter = 0; iter < 5; iter++) {
    let anyOverlap = false;
    for (const body of freeBodies) {
      const copperPush = getCopperOverlap(body);
      if (copperPush) {
        body.centerX += copperPush.pushX;
        body.centerY += copperPush.pushY;
        const len = Math.sqrt(copperPush.pushX * copperPush.pushX + copperPush.pushY * copperPush.pushY);
        if (len > 0.001) {
          const nx = copperPush.pushX / len;
          const ny = copperPush.pushY / len;
          const vn = body.vx * nx + body.vy * ny;
          if (vn < 0) {
            body.vx -= vn * nx;
            body.vy -= vn * ny;
          }
        }
        for (const p of body.protons) {
          p.x = body.centerX + p.offsetX;
          p.y = body.centerY + p.offsetY;
        }
        anyOverlap = true;
      }
      for (const other of freeBodies) {
        if (body === other) continue;
        const overlap = getBodyBodyOverlap(body, other);
        if (overlap) {
          body.centerX += overlap.pushAX;
          body.centerY += overlap.pushAY;
          other.centerX += overlap.pushBX;
          other.centerY += overlap.pushBY;
          const len = Math.sqrt(overlap.pushAX * overlap.pushAX + overlap.pushAY * overlap.pushAY);
          if (len > 0.001) {
            const nx = overlap.pushAX / len;
            const ny = overlap.pushAY / len;
            const vnA = body.vx * nx + body.vy * ny;
            const vnB = other.vx * nx + other.vy * ny;
            const relV = vnA - vnB;
            if (relV < 0) {
              const totalM = body.mass + other.mass;
              body.vx -= (relV * other.mass / totalM) * nx;
              body.vy -= (relV * other.mass / totalM) * ny;
              other.vx += (relV * body.mass / totalM) * nx;
              other.vy += (relV * body.mass / totalM) * ny;
            }
          }
          for (const p of body.protons) {
            p.x = body.centerX + p.offsetX;
            p.y = body.centerY + p.offsetY;
          }
          for (const p of other.protons) {
            p.x = other.centerX + p.offsetX;
            p.y = other.centerY + p.offsetY;
          }
          anyOverlap = true;
        }
      }
    }
    if (!anyOverlap) break;
  }

  for (const body of freeBodies) {
    let fx = 0, fy = 0;
    for (const p of body.protons) {
      for (const op of allProtons) {
        if (body.protons.includes(op)) continue;
        const f = coulombForce(p.x, p.y, p.charge, op.x, op.y, op.charge);
        fx += f.fx;
        fy += f.fy;
      }
      for (const e of allElectrons) {
        if (body.electrons.includes(e)) continue;
        const f = coulombForce(p.x, p.y, p.charge, e.x, e.y, e.charge);
        fx += f.fx;
        fy += f.fy;
      }
    }
    body.vx += (fx / body.mass) * dt;
    body.vy += (fy / body.mass) * dt;
    for (const p of body.protons) {
      p.x = body.centerX + p.offsetX;
      p.y = body.centerY + p.offsetY;
    }
  }
}

function draw() {
  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      if (grid[j][i] === 'copper') ctx.fillStyle = '#b87333';
      else if (grid[j][i] === 'free_copper') ctx.fillStyle = '#cd7f32';
      else if (grid[j][i] === 'insulator') ctx.fillStyle = '#ffffff';
      else ctx.fillStyle = '#000000';
      ctx.fillRect(i * cellW, j * cellH, cellW, cellH);
    }
  }

  for (const body of freeBodies) {
    for (const cell of body.cells) {
      ctx.fillStyle = '#cd7f32';
      ctx.fillRect(body.centerX + cell.offsetX, body.centerY + cell.offsetY, cellW, cellH);
    }
  }

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

  for (const p of protons) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#4488ff';
    ctx.fill();
  }
  for (const body of freeBodies) {
    for (const p of body.protons) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#4488ff';
      ctx.fill();
    }
  }

  for (const e of electrons) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.fill();
  }
  for (const body of freeBodies) {
    if (!body || !body.electrons) continue;
    for (const e of body.electrons) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius || particleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.fill();
    }
  }
}

function handleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const ci = Math.floor(x / cellW);
  const cj = Math.floor(y / cellH);
  if (ci >= 0 && ci < gridSize && cj >= 0 && cj < gridSize) {
    const material = document.getElementById('material').value;
    placeMaterial(ci, cj, material);
  }
}

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

  canvas.addEventListener('click', handleClick);

  document.getElementById('playPause').addEventListener('click', () => {
    if (!playing) {
      findFreeCopperBodies();
    }
    playing = !playing;
    document.getElementById('playPause').textContent = playing ? 'Pause' : 'Play';
  });

  document.getElementById('reset').addEventListener('click', () => {
    playing = false;
    initGrid();
    document.getElementById('playPause').textContent = 'Play';
  });

  requestAnimationFrame(loop);
}

setup();
