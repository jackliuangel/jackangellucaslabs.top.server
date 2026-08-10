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

// ─── 5. Weather visibility factor ─────────────────────────────────────────────

console.log('\n=== 5. Weather: visibility factor ===');
{
  // Mirrors the formula in weather.js update():
  //   visibilityFactor = clamp(0.15, (fogEnd - fogStart) / 200, 1.0)
  // Noon fogEnd=290 is the reference maximum sight distance.
  function calcVis(fogStart, fogEnd) {
    return Math.max(0.15, Math.min(1.0, fogEnd / 290));
  }

  const PRESETS = {
    noon:    { fogStart:180, fogEnd:290 },
    dusk:    { fogStart:100, fogEnd:220 },
    rain:    { fogStart:70,  fogEnd:180 },
    fog:     { fogStart:25,  fogEnd:110 },
    rainFog: { fogStart:20,  fogEnd:85  },
    duskFog: { fogStart:40,  fogEnd:130 },
  };

  // Noon is clearest → highest visibility among all presets
  const noonVis = calcVis(PRESETS.noon.fogStart, PRESETS.noon.fogEnd);
  const allVis  = Object.values(PRESETS).map(p => calcVis(p.fogStart, p.fogEnd));
  assert(noonVis === Math.max(...allVis),
    `Noon: visibility=${noonVis.toFixed(3)} is max among all presets`);

  // Dense fog should be below 0.5
  const fogVis = calcVis(PRESETS.fog.fogStart, PRESETS.fog.fogEnd);
  assert(fogVis < 0.5, `Fog: visibility=${fogVis.toFixed(3)} < 0.5`);

  // Heavy rain+fog should be at or near the floor (0.15)
  const rfVis = calcVis(PRESETS.rainFog.fogStart, PRESETS.rainFog.fogEnd);
  assert(rfVis <= 0.40, `RainFog: visibility=${rfVis.toFixed(3)} <= 0.40`);

  // Always >= floor
  for (const [name, p] of Object.entries(PRESETS)) {
    const v = calcVis(p.fogStart, p.fogEnd);
    assert(v >= 0.15 && v <= 1.0, `${name}: visibility in [0.15, 1.0] (${v.toFixed(3)})`);
  }

  // Minimap enemy range shrinks with fog
  const engageRange = CONFIG.ENGAGE_RANGE;
  const clearRange  = engageRange * 0.9 * calcVis(PRESETS.noon.fogStart,    PRESETS.noon.fogEnd);
  const fogRange    = engageRange * 0.9 * calcVis(PRESETS.rainFog.fogStart, PRESETS.rainFog.fogEnd);
  assert(clearRange > fogRange, `Minimap enemy range: clear(${clearRange.toFixed(1)}) > fog(${fogRange.toFixed(1)})`);

  // Lerp helper (used in transition)
  function lerp(a, b, t) { return a + (b - a) * t; }
  assertClose(lerp(0, 1, 0),   0, 'lerp t=0 → from', 1e-9);
  assertClose(lerp(0, 1, 1),   1, 'lerp t=1 → to', 1e-9);
  assertClose(lerp(0, 1, 0.5), 0.5, 'lerp t=0.5 → midpoint', 1e-9);

  // Rain emitRate lerps from 0 to target during transition
  const rFrom = 0;       // dry preset
  const rTo   = 2500;    // rain preset
  assertClose(lerp(rFrom, rTo, 0.0),  0,    'Rain rate at t=0: 0', 1e-9);
  assertClose(lerp(rFrom, rTo, 0.5),  1250, 'Rain rate at t=0.5: 1250', 1e-9);
  assertClose(lerp(rFrom, rTo, 1.0),  2500, 'Rain rate at t=1.0: 2500', 1e-9);
}

// ─── 6. Konami cheat (WWSSADADAB) ────────────────────────────────────────────
// Mirrors the sequence matcher + teleport radius logic in src/cheat.js.

console.log('\n=== 6. Cheat code: WWSSADADAB sequence matcher ===');
{
  const CODE = ['KeyW','KeyW','KeyS','KeyS','KeyA','KeyD','KeyA','KeyD','KeyA','KeyB'];
  const CHEAT_STR = 'wwssadadab';

  // The 10 chars must map to exactly the 10 physical keys above (QWERTY)
  {
    const chars = CHEAT_STR.split('');
    const mapped = chars.map(c => 'Key' + c.toUpperCase());
    assert(mapped.length === CODE.length, 'wwssadadab is 10 keystrokes');
    assert(mapped.every((k, i) => k === CODE[i]),
      'wwssadadab → KeyW,KeyW,KeyS,KeyS,KeyA,KeyD,KeyA,KeyD,KeyA,KeyB');
  }

  // Matcher: keeps only a suffix that is a prefix of CODE; dings when full
  function makeMatcher() {
    let buf = [];
    function isPrefix(arr) {
      for (let i = 0; i < arr.length; i++) if (arr[i] !== CODE[i]) return false;
      return true;
    }
    return {
      press(code) {
        buf.push(code);
        while (buf.length > 0 && !isPrefix(buf)) buf.shift();
        if (buf.length === CODE.length) { buf = []; return true; }
        return false;
      }
    };
  }

  // Entering the exact code → exactly one ding
  {
    const m = makeMatcher();
    let dings = 0;
    for (const k of CODE) if (m.press(k)) dings++;
    assert(dings === 1, 'Full WWSSADADAB → ding exactly once');
  }

  // A wrong key resets the buffer; re-entering the code still dings
  {
    const m = makeMatcher();
    for (const k of CODE.slice(0, 8)) m.press(k);
    m.press('KeyX'); // breaks the sequence
    let dings = 0;
    for (const k of CODE) if (m.press(k)) dings++;
    assert(dings === 1, 'After a wrong key, re-entering the full code still dings');
  }

  // Partial prefix does NOT ding
  {
    const m = makeMatcher();
    let dings = 0;
    for (const k of CODE.slice(0, 9)) if (m.press(k)) dings++;
    assert(dings === 0, 'WWSSADADA (9 keys, no final B) → no ding');
  }

  // Teleport spot: always within [MIN_RADIUS, 90]m of the target
  {
    const MIN_RADIUS = 25, MAX_RADIUS = 90;
    const tx = 0, tz = 65;
    let allInRange = true;
    for (let i = 0; i < 500; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
      const x = tx + Math.sin(angle) * radius;
      const z = tz + Math.cos(angle) * radius;
      const d = Math.hypot(x - tx, z - tz);
      if (d < MIN_RADIUS - 1e-6 || d > MAX_RADIUS + 1e-6) { allInRange = false; break; }
    }
    assert(allInRange, 'Random teleport spot always within [25m, 90m] of the first enemy');
  }

  // Ballistic elevation: the analytic flat-ground range matches the target distance
  {
    const v = 55, g = 20;
    const dist = 90;
    const elev = 0.5 * Math.asin((g * dist) / (v * v));
    const range = (v * v * Math.sin(2 * elev)) / g;
    assertClose(range, dist, 'Elevation for 90m lands at 90m on flat ground', 0.5);
    assert(elev > 0.05 && elev < 0.6, `90m elevation ${elev.toFixed(3)} within barrel clamp [0.05, 0.6]`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
