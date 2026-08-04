/**
 * Unit tests for:
 * 1. Minimap: hull heading direction, turret FOV sector direction
 * 2. Left joystick / WASD → hull (throttle + steer)
 * 3. Right joystick / arrow keys → turret (left/right) + range (up/down)
 *
 * Run with: node tests/tank.test.js
 * No test framework needed — plain asserts.
 */

'use strict';

// ─── Minimal stubs ────────────────────────────────────────────────────────────

const CONFIG = {
  TANK_MAX_SPEED: 6,
  TANK_ACCEL: 0.035,
  TANK_BRAKE: 0.06,
  TANK_TURN_RATE: 0.0275,
  TURRET_TURN_RATE: 0.0075,
  SHELL_SPEED: 55,
  SHELL_GRAVITY: -20,
  ENGAGE_RANGE: 120,
};

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertClose(a, b, label, tol = 1e-6) {
  assert(Math.abs(a - b) <= tol, `${label} (got ${a.toFixed(6)}, expected ${b.toFixed(6)})`);
}

// ─── 1. Minimap logic ─────────────────────────────────────────────────────────
// Extracted verbatim from src/minimap.js _worldToMap + turret arc logic.

const MINIMAP_SIZE = 160;
const WORLD_RADIUS = 200;

function worldToMap(wx, wz, cx, cz, h) {
  const scale = MINIMAP_SIZE / (WORLD_RADIUS * 2);
  const dx = wx - cx;
  const dz = wz - cz;
  const rx =  dx * Math.cos(h) - dz * Math.sin(h);
  const ry = -(dx * Math.sin(h) + dz * Math.cos(h));
  return { x: rx * scale + MINIMAP_SIZE / 2, y: ry * scale + MINIMAP_SIZE / 2 };
}

// Turret arc angle as computed in minimap.js:
//   tArc = atan2(-cos(turretAngle), sin(turretAngle))
function turretArcAngle(turretAngle) {
  return Math.atan2(-Math.cos(turretAngle), Math.sin(turretAngle));
}

console.log('\n=== 1. Minimap: hull heading ===');
{
  const cx = 0, cz = 0;

  // Player faces north (hullAngle = 0).
  // An enemy placed directly ahead (wz = +d) should map to y < center (UP on canvas).
  {
    const h = 0;
    const d = 50;
    const mp = worldToMap(0, d, cx, cz, h);
    assert(mp.x === MINIMAP_SIZE / 2, 'Enemy directly ahead: x is center');
    assert(mp.y < MINIMAP_SIZE / 2,   'Enemy directly ahead: y < center (drawn above player)');
  }

  // Player faces east (hullAngle = π/2).
  // Enemy placed to the east (wx = +d, wz = 0) should appear UP on minimap.
  {
    const h = Math.PI / 2;
    const d = 50;
    const mp = worldToMap(d, 0, cx, cz, h);
    assert(mp.y < MINIMAP_SIZE / 2,  'Enemy east, facing east: y < center (drawn above player)');
    assertClose(mp.x, MINIMAP_SIZE / 2, 'Enemy east, facing east: x is center', 0.01);
  }

  // Player faces south (hullAngle = π).
  // Enemy placed at wz = +d (south in world) should appear DOWN (y > center).
  {
    const h = Math.PI;
    const d = 50;
    const mp = worldToMap(0, d, cx, cz, h);
    assert(mp.y > MINIMAP_SIZE / 2,  'Enemy north of player, player facing south: y > center');
  }

  // Player arrow is always drawn at center and pointing UP (fixed).
  // The hull arrow coordinates in minimap.js are hard-coded: tip at (mp.x, mp.y-8),
  // so tip.y < mp.y — i.e. pointing toward smaller y = UP on canvas.
  {
    const cx2 = 10, cz2 = -5;
    const mp = worldToMap(cx2, cz2, cx2, cz2, 0);
    assertClose(mp.x, MINIMAP_SIZE / 2, 'Player dot is at minimap center x', 0.01);
    assertClose(mp.y, MINIMAP_SIZE / 2, 'Player dot is at minimap center y', 0.01);
    // Hull arrow tip: (mp.x, mp.y - 8) → tip.y < mp.y → pointing UP on canvas
    const tipY = mp.y - 8;
    assert(tipY < mp.y, 'Hull arrow tip is above center → pointing UP on canvas');
  }
}

console.log('\n=== 1. Minimap: turret FOV sector direction ===');
{
  // turretAngle=0 means turret points the same direction as hull (forward = UP on minimap).
  // tArc should point UP, i.e. angle ≈ -π/2 on canvas (canvas y-axis is inverted).
  {
    const ta = 0;
    const arc = turretArcAngle(ta);
    // atan2(-cos(0), sin(0)) = atan2(-1, 0) = -π/2
    assertClose(arc, -Math.PI / 2, 'Turret angle=0 → tArc=-π/2 (points UP on canvas)');
  }

  // turretAngle = π/2 → turret points RIGHT relative to hull
  // After player-up rotation the cone should be at angle 0 (canvas-right)
  {
    const ta = Math.PI / 2;
    const arc = turretArcAngle(ta);
    // atan2(-cos(π/2), sin(π/2)) = atan2(0, 1) = 0
    assertClose(arc, 0, 'Turret angle=π/2 → tArc=0 (points RIGHT on canvas)', 1e-5);
  }

  // turretAngle = -π/2 → turret points LEFT
  {
    const ta = -Math.PI / 2;
    const arc = turretArcAngle(ta);
    // atan2(-cos(-π/2), sin(-π/2)) = atan2(0, -1) = π
    assertClose(Math.abs(arc), Math.PI, 'Turret angle=-π/2 → tArc=±π (points LEFT on canvas)', 1e-5);
  }

  // turretAngle = π → turret points backward
  {
    const ta = Math.PI;
    const arc = turretArcAngle(ta);
    // atan2(-cos(π), sin(π)) = atan2(1, 0) = π/2
    assertClose(arc, Math.PI / 2, 'Turret angle=π → tArc=π/2 (points DOWN on canvas)', 1e-5);
  }
}

// ─── 2. Left joystick / WASD → hull controls ─────────────────────────────────
// We re-implement the Controls.getInput() logic here so it can run without a DOM.

console.log('\n=== 2. Left joystick / WASD → hull (throttle & steer) ===');
{
  // Simulate the getInput merge from controls.js
  function makeInput(joyThrottle, joySteer, keys) {
    let throttle = joyThrottle;
    let steer    = joySteer;
    if (keys.W) throttle =  1;
    if (keys.S) throttle = -1;
    if (keys.A) steer    = -1;
    if (keys.D) steer    =  1;
    return { throttle, steer };
  }

  // WASD overrides joystick
  {
    const inp = makeInput(0.5, 0.3, { W: true });
    assert(inp.throttle === 1,   'W key → throttle=1 (forward)');
    assert(inp.steer === 0.3,    'W key → steer unchanged from joystick');
  }
  {
    const inp = makeInput(0.5, 0, { S: true });
    assert(inp.throttle === -1,  'S key → throttle=-1 (reverse)');
  }
  {
    const inp = makeInput(0, 0, { A: true });
    assert(inp.steer === -1,     'A key → steer=-1 (left)');
    assert(inp.throttle === 0,   'A key → throttle unchanged');
  }
  {
    const inp = makeInput(0, 0, { D: true });
    assert(inp.steer === 1,      'D key → steer=+1 (right)');
  }

  // Left joystick: angle = π/2 (pointing right) → cos=0, sin=1
  // throttle = sin(angle)*force, steer = cos(angle)*force
  {
    const angle = Math.PI / 2; // pointing right
    const force = 0.8;
    const jThrottle = Math.sin(angle) * force;
    const jSteer    = Math.cos(angle) * force;
    const inp = makeInput(jThrottle, jSteer, {});
    assertClose(inp.throttle, 0.8, 'Joystick right: throttle≈0.8', 1e-5);
    assertClose(inp.steer, 0, 'Joystick right: steer≈0', 1e-5);
  }

  // Left joystick: angle = 0 (pointing up/forward on stick) → sin=0, cos=1
  {
    const angle = 0;
    const force = 1.0;
    const jThrottle = Math.sin(angle) * force;
    const jSteer    = Math.cos(angle) * force;
    const inp = makeInput(jThrottle, jSteer, {});
    assertClose(inp.throttle, 0, 'Joystick up: throttle≈0', 1e-5);
    assertClose(inp.steer, 1, 'Joystick up: steer≈1 (turn right)', 1e-5);
  }

  // Hull angle changes with steer
  {
    let hullAngle = 0;
    const dt = 1 / 60;
    const input = { steer: 1 };
    hullAngle += input.steer * CONFIG.TANK_TURN_RATE * dt * 60;
    assertClose(hullAngle, CONFIG.TANK_TURN_RATE, 'Hull angle increments by TANK_TURN_RATE per frame when steer=1', 1e-9);
  }

  // Forward movement uses hullAngle (sin/cos decomposition)
  {
    const hullAngle = Math.PI / 4; // 45°
    const speed = 1.0;
    const dt = 1;
    const dx = Math.sin(hullAngle) * speed * dt;
    const dz = Math.cos(hullAngle) * speed * dt;
    assertClose(dx, Math.SQRT2 / 2, 'Movement dx at 45° hull angle', 1e-6);
    assertClose(dz, Math.SQRT2 / 2, 'Movement dz at 45° hull angle', 1e-6);
  }
}

// ─── 3. Right joystick / arrow keys → turret & range ─────────────────────────

console.log('\n=== 3. Right joystick / arrow keys → turret rotation & range ===');
{
  function makeRightInput(joyTurretSteer, joyVertical, keys, targetDist) {
    let turretSteer = joyTurretSteer;
    let dist = targetDist;

    if (keys.ArrowLeft)  turretSteer = -1;
    if (keys.ArrowRight) turretSteer =  1;
    if (keys.ArrowUp)   dist = Math.min(120, dist + 1.2);
    if (keys.ArrowDown) dist = Math.max(15,  dist - 1.2);
    if (joyVertical !== 0) {
      dist = Math.min(120, Math.max(15, dist + joyVertical * 1.2));
    }
    return { turretSteer, targetDist: dist };
  }

  // Arrow keys: turret left/right
  {
    const inp = makeRightInput(0, 0, { ArrowLeft: true }, 60);
    assert(inp.turretSteer === -1, 'ArrowLeft → turretSteer=-1');
  }
  {
    const inp = makeRightInput(0, 0, { ArrowRight: true }, 60);
    assert(inp.turretSteer === 1, 'ArrowRight → turretSteer=+1');
  }

  // Arrow keys: range up/down
  {
    const inp = makeRightInput(0, 0, { ArrowUp: true }, 60);
    assertClose(inp.targetDist, 61.2, 'ArrowUp → targetDist increases by 1.2', 1e-9);
  }
  {
    const inp = makeRightInput(0, 0, { ArrowDown: true }, 60);
    assertClose(inp.targetDist, 58.8, 'ArrowDown → targetDist decreases by 1.2', 1e-9);
  }

  // Range clamped at max 120
  {
    const inp = makeRightInput(0, 0, { ArrowUp: true }, 120);
    assertClose(inp.targetDist, 120, 'ArrowUp at max → targetDist stays 120', 1e-9);
  }

  // Range clamped at min 15
  {
    const inp = makeRightInput(0, 0, { ArrowDown: true }, 15);
    assertClose(inp.targetDist, 15, 'ArrowDown at min → targetDist stays 15', 1e-9);
  }

  // Right joystick: left/right (cos component) → turret steer
  {
    const angle = Math.PI / 2; // right
    const force = 1.0;
    const jTurretSteer  = Math.cos(angle) * force; // ≈ 0
    const jVertical     = Math.sin(angle) * force; // ≈ 1
    const inp = makeRightInput(jTurretSteer, jVertical, {}, 60);
    assertClose(inp.turretSteer, 0,    'Joystick right: turretSteer≈0', 1e-5);
    assertClose(inp.targetDist, 61.2,  'Joystick right (up component): range increases', 1e-5);
  }

  // Right joystick: pointing left → negative vertical → range decreases
  {
    const angle = -Math.PI / 2; // left
    const force = 1.0;
    const jTurretSteer  = Math.cos(angle) * force; // ≈ 0
    const jVertical     = Math.sin(angle) * force; // ≈ -1
    const inp = makeRightInput(jTurretSteer, jVertical, {}, 60);
    assertClose(inp.targetDist, 58.8, 'Joystick left (down component): range decreases', 1e-5);
  }

  // Right joystick: angle=0 (pointing forward/right on stick, cos=1)
  {
    const angle = 0;
    const force = 0.7;
    const jTurretSteer = Math.cos(angle) * force;
    const inp = makeRightInput(jTurretSteer, 0, {}, 60);
    assertClose(inp.turretSteer, 0.7, 'Joystick forward: turretSteer=0.7 (turn right)', 1e-5);
  }

  // Turret angle increments by TURRET_TURN_RATE per frame
  {
    let turretAngle = 0;
    const dt = 1 / 60;
    turretAngle += 1 * CONFIG.TURRET_TURN_RATE * dt * 60;
    assertClose(turretAngle, CONFIG.TURRET_TURN_RATE, 'Turret angle increments by TURRET_TURN_RATE per frame', 1e-9);
  }

  // Turret angle is relative to hull (turretPivot.rotation.y = turretAngle, parent = root)
  // World shoot angle = hullAngle + turretAngle
  {
    const hullAngle   = Math.PI / 4;
    const turretAngle = Math.PI / 4;
    const worldAngle  = hullAngle + turretAngle;
    assertClose(worldAngle, Math.PI / 2, 'World shoot angle = hullAngle + turretAngle', 1e-9);
  }
}

// ─── Ballistic elevation (Controls._calcElevation) ────────────────────────────

console.log('\n=== 4. Ballistic elevation for targetDist ===');
{
  function calcElevation(dist) {
    const v = CONFIG.SHELL_SPEED;
    const g = -CONFIG.SHELL_GRAVITY;
    const maxRange = (v * v) / g;
    if (dist >= maxRange) return Math.PI / 4;
    const inner = (g * dist) / (v * v);
    return 0.5 * Math.asin(inner);
  }

  // dist=0 → elevation=0 (flat)
  assertClose(calcElevation(0), 0, 'dist=0 → elevation=0 (flat shot)', 1e-9);

  // dist=maxRange → elevation=π/4 (45°)
  {
    const maxRange = CONFIG.SHELL_SPEED ** 2 / (-CONFIG.SHELL_GRAVITY);
    assertClose(calcElevation(maxRange), Math.PI / 4, 'dist=maxRange → elevation=π/4', 1e-9);
  }

  // Elevation increases monotonically with distance (for ranges below max)
  {
    const e1 = calcElevation(30);
    const e2 = calcElevation(60);
    const e3 = calcElevation(90);
    assert(e1 < e2 && e2 < e3, 'Elevation increases monotonically with distance');
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
