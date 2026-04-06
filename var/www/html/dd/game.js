(function () {
'use strict';

// ── Shaders ───────────────────────────────────────────────────────────────────

BABYLON.Effect.ShadersStore['toonWaterVertexShader'] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float time;
uniform vec4 rip0;
uniform vec4 rip1;
uniform vec4 rip2;
varying vec2 vUV;
varying float vH;
varying vec3 vWP;

float doRipple(vec4 r, vec3 p) {
  float d  = length(p.xz - r.xz);
  float a  = r.w;
  float on = step(0.001, a) * step(a, 4.0);
  return sin(d * 4.0 - a * 12.0) * exp(-d * 0.45) * exp(-a * 1.1) * 0.20 * on;
}

void main(void) {
  float w = sin(position.x * 0.5  + time * 1.5) * 0.18
          + cos(position.z * 0.7  + time * 1.2) * 0.12
          + sin((position.x + position.z) * 0.3 + time * 2.2) * 0.06;
  w += doRipple(rip0, position) + doRipple(rip1, position) + doRipple(rip2, position);
  vH  = w;
  vUV = uv;
  vec3 dp = position + vec3(0.0, w, 0.0);
  vWP     = (world * vec4(dp, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(dp, 1.0);
}`;

BABYLON.Effect.ShadersStore['toonWaterFragmentShader'] = `
precision mediump float;
varying vec2 vUV;
varying float vH;
varying vec3 vWP;
uniform float time;

void main(void) {
  float h = (vH + 0.36) / 0.72;
  float s = floor(h * 4.0) * 0.25;

  vec3 c0 = vec3(0.02, 0.10, 0.46);
  vec3 c1 = vec3(0.04, 0.24, 0.66);
  vec3 c2 = vec3(0.09, 0.44, 0.84);
  vec3 c3 = vec3(0.48, 0.78, 0.96);

  vec3 col;
  if      (s < 0.26) col = c0;
  else if (s < 0.51) col = c1;
  else if (s < 0.76) col = c2;
  else               col = c3;

  float foam = sin(vUV.x * 38.0 + time * 1.8) * cos(vUV.y * 31.0 + time * 1.4);
  if (foam > 0.82 && h > 0.58) col = c3;

  float dist = length(vWP.xz);
  float fog  = clamp((dist - 22.0) * 0.013, 0.0, 1.0);
  col = mix(col, vec3(0.40, 0.66, 0.88), fog * 0.60);

  gl_FragColor = vec4(col, 0.91);
}`;

// ── Device detection ──────────────────────────────────────────────────────────

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const HINT_TEXT = IS_TOUCH ? '向上滑动投石 ↑' : '向上拖动投石 ↑';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRAVITY    = 9.8;
const BOUNCE_DAMP  = 0.52;   // vertical energy on bounce
const HORIZ_DAMP   = 0.76;   // horizontal speed on bounce
const MIN_SKIP_SPD = 2.8;    // m/s — slower than this sinks
const MAX_SKIP_ANG = 28;     // degrees — steeper than this sinks

// ── Game state ────────────────────────────────────────────────────────────────

let best       = 0;
let phase      = 'idle';   // 'idle' | 'flying' | 'sinking'
let skips      = 0;
let activeRings = [];

// Up to 3 simultaneous water-ripple uniforms for the vertex shader
const ripU = [
  { p: new BABYLON.Vector3(0, 0, 0), age: -1 },
  { p: new BABYLON.Vector3(0, 0, 0), age: -1 },
  { p: new BABYLON.Vector3(0, 0, 0), age: -1 },
];
let ripNext = 0;

let wind  = { x: 0, z: 0 };
let sv    = {
  pos: new BABYLON.Vector3(0, 1, 0),
  vel: new BABYLON.Vector3(0, 0, 0),
};
let touch         = { on: false, x0: 0, y0: 0, xc: 0, yc: 0, t0: 0 };
let stoneSpinVel  = 0;     // current spin speed (rad/s), decays on water entry
let releaseHeight = 1.10;   // metres above water — adjusted via the gauge
let gaugeActive   = false;  // true while the height gauge knob is being dragged

// ── Stability ball state ───────────────────────────────────────────────────
let stabT       = 0;                  // time accumulator driving dot motion
let stabFrozen  = false;              // true once player releases the throw
let stabDot     = { x: 0, y: 0 };    // current dot position (normalised ±1 space)
// Phase offsets — randomised on each reset so the pattern is never the same
let stabPhase   = { ax: 0, bx: 1.7, ay: 0.8, by: 2.3 };

let gameT = 0;
let lastT = performance.now();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const mainCanvas = document.getElementById('c');
const wcEl       = document.getElementById('wc');
const wcx        = wcEl.getContext('2d');
const swEl       = document.getElementById('swc');
const swx        = swEl.getContext('2d');
const scEl       = document.getElementById('sc');
const scx        = scEl.getContext('2d');

function resizeSW() {
  swEl.width  = window.innerWidth;
  swEl.height = window.innerHeight;
}
resizeSW();
window.addEventListener('resize', resizeSW);

// ── Engine + Scene ────────────────────────────────────────────────────────────

const engine = new BABYLON.Engine(mainCanvas, true, { antialias: true, stencil: true });
engine.setHardwareScalingLevel(window.devicePixelRatio > 2 ? 1.5 : 1);

const scene = new BABYLON.Scene(engine);
scene.clearColor  = new BABYLON.Color4(0.14, 0.28, 0.60, 1);
scene.fogMode     = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity  = 0.006;
scene.fogColor    = new BABYLON.Color3(0.60, 0.78, 0.94);

// ── Camera ────────────────────────────────────────────────────────────────────

const cam = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 1.6, -6), scene);
cam.setTarget(new BABYLON.Vector3(0, 0.55, 50));
cam.fov  = 1.15;
cam.minZ = 0.1;
cam.maxZ = 300;
cam.detachControl();   // disable built-in mouse/keyboard input — camera is driven programmatically

// ── Lighting ──────────────────────────────────────────────────────────────────

// Global ambient so no surface is fully black
scene.ambientColor = new BABYLON.Color3(0.18, 0.22, 0.28);

// Key light — warm sun from upper-left-front
const sun = new BABYLON.DirectionalLight('sun',
  new BABYLON.Vector3(-0.5, -1.5, 1).normalize(), scene);
sun.diffuse   = new BABYLON.Color3(1.0, 0.95, 0.78);
sun.specular  = new BABYLON.Color3(0.6,  0.55, 0.4);
sun.intensity = 1.5;

// Fill light — cool, soft, from the right to lift shadow side
const fill = new BABYLON.DirectionalLight('fill',
  new BABYLON.Vector3(1.2, -0.4, 0.6).normalize(), scene);
fill.diffuse   = new BABYLON.Color3(0.35, 0.55, 0.80);
fill.specular  = new BABYLON.Color3(0.05, 0.05, 0.10);
fill.intensity = 0.55;

// Rim/back light — gives silhouette pop from behind
const rim = new BABYLON.DirectionalLight('rim',
  new BABYLON.Vector3(0.1, -0.2, -1).normalize(), scene);
rim.diffuse   = new BABYLON.Color3(0.20, 0.38, 0.55);
rim.specular  = new BABYLON.Color3(0.0,  0.0,  0.0);
rim.intensity = 0.30;

// Sky hemispheric — subtle colour-cast from sky vs ground
const skyLight = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0, 1, 0), scene);
skyLight.diffuse      = new BABYLON.Color3(0.50, 0.72, 0.95);
skyLight.groundColor  = new BABYLON.Color3(0.32, 0.55, 0.25);
skyLight.intensity    = 0.55;

// ── Sky dome with vertical gradient ───────────────────────────────────────────

const skyDome = BABYLON.MeshBuilder.CreateSphere('sd',
  { diameter: 450, sideOrientation: BABYLON.Mesh.BACKSIDE, segments: 8 }, scene);
skyDome.isPickable = false;

// Gradient painted onto a DynamicTexture:
// sphere UV V=0 = zenith (top), V=0.5 = horizon → gradient goes dark→pale
const _skyTex = new BABYLON.DynamicTexture('skyGrad', { width: 2, height: 256 }, scene, false);
(function () {
  const ctx  = _skyTex.getContext();
  const g    = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#0c2250');   // deep navy zenith
  g.addColorStop(0.22, '#174ea0');   // rich mid blue
  g.addColorStop(0.47, '#3a88cc');   // vibrant sky near horizon
  g.addColorStop(0.54, '#e8d498');   // warm golden horizon line
  g.addColorStop(0.62, '#5898c8');   // sky below horizon glow
  g.addColorStop(1.00, '#78aed6');   // bottom (below water surface)
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  _skyTex.update();
})();
const sdMat = new BABYLON.StandardMaterial('sdm', scene);
sdMat.emissiveTexture  = _skyTex;
sdMat.disableLighting  = true;
sdMat.backFaceCulling  = false;
skyDome.material = sdMat;

// ── Clouds ────────────────────────────────────────────────────────────────────

function makeCloud(cx, cy, cz, s) {
  const mat = new BABYLON.StandardMaterial('clm_' + cx + '_' + cz, scene);
  mat.emissiveColor   = new BABYLON.Color3(0.97, 0.98, 1.0);
  mat.disableLighting = true;
  // Main body + flanking puffs + depth puffs (9 blobs for fluffy silhouette)
  [
    [0,          0,          0,       s     ],
    [-s*0.58,   -s*0.08,     0,       s*0.72],
    [ s*0.58,   -s*0.10,     0,       s*0.72],
    [-s*0.24,    s*0.24,     0,       s*0.60],
    [ s*0.22,    s*0.22,     0,       s*0.60],
    [0,         -s*0.06,     s*0.38,  s*0.52],
    [0,         -s*0.06,    -s*0.38,  s*0.52],
    [ s*0.40,    s*0.10,     s*0.26,  s*0.46],
    [-s*0.38,    s*0.12,    -s*0.22,  s*0.46],
  ].forEach(([ox, oy, oz, d], i) => {
    const m = BABYLON.MeshBuilder.CreateSphere('cl_' + cx + '_' + i,
      { diameter: d, segments: 5 }, scene);
    m.position.set(cx + ox, cy + oy, cz + oz);
    m.isPickable = false;
    m.material   = mat;
  });
}
makeCloud(-48, 42,  90, 7);
makeCloud( 32, 46, 118, 9);
makeCloud(-80, 38, 148, 6);
makeCloud( 72, 44, 108, 7.5);
makeCloud(  4, 50, 180, 12);
makeCloud(-22, 40,  76, 5.5);
makeCloud( 54, 41, 155, 8);
makeCloud(-58, 48, 215, 13);
makeCloud( 28, 38,  65, 5);

// ── Water ─────────────────────────────────────────────────────────────────────

const waterMesh = BABYLON.MeshBuilder.CreateGround('water',
  { width: 280, height: 280, subdivisions: 64 }, scene);
waterMesh.isPickable = false;

const waterMat = new BABYLON.ShaderMaterial('wm', scene,
  { vertex: 'toonWater', fragment: 'toonWater' },
  {
    attributes: ['position', 'uv'],
    uniforms:   ['worldViewProjection', 'world', 'time', 'rip0', 'rip1', 'rip2'],
  });
waterMat.backFaceCulling = false;
waterMat.alpha = 0.91;
waterMesh.material = waterMat;

// ── Shore & ground ────────────────────────────────────────────────────────────

const shore = BABYLON.MeshBuilder.CreateGround('sh', { width: 70, height: 22 }, scene);
shore.position.set(0, -0.05, -13);
const shMat = new BABYLON.StandardMaterial('shm', scene);
shMat.diffuseColor  = new BABYLON.Color3(0.42, 0.35, 0.22);
shMat.specularColor = BABYLON.Color3.Black();
shore.material = shMat;

const grass = BABYLON.MeshBuilder.CreateGround('gr', { width: 70, height: 22 }, scene);
grass.position.set(0, -0.02, -24);
const grMat = new BABYLON.StandardMaterial('grm', scene);
grMat.diffuseColor  = new BABYLON.Color3(0.28, 0.62, 0.22);
grMat.specularColor = BABYLON.Color3.Black();
grass.material = grMat;

// ── Far shore bank ────────────────────────────────────────────────────────────

const farBank = BABYLON.MeshBuilder.CreateGround('fb', { width: 240, height: 18 }, scene);
farBank.position.set(0, -0.04, 26);
const fbMat = new BABYLON.StandardMaterial('fbm', scene);
fbMat.diffuseColor  = new BABYLON.Color3(0.29, 0.56, 0.19);
fbMat.specularColor = BABYLON.Color3.Black();
farBank.material = fbMat;

// ── Mid-ground tree line ──────────────────────────────────────────────────────

(function buildTreeLine() {
  // Deterministic noise from index
  function sr(n) { return Math.abs(Math.sin(n * 91.3 + 173.1) % 1); }

  const trunkMat = new BABYLON.StandardMaterial('tlTrunk', scene);
  trunkMat.diffuseColor  = new BABYLON.Color3(0.28, 0.18, 0.09);
  trunkMat.specularColor = BABYLON.Color3.Black();

  const cMats = [
    [0.12, 0.38, 0.09],
    [0.17, 0.50, 0.13],
    [0.22, 0.58, 0.17],
  ].map(([r, g, b], i) => {
    const m = new BABYLON.StandardMaterial('tlC' + i, scene);
    m.diffuseColor  = new BABYLON.Color3(r, g, b);
    m.specularColor = new BABYLON.Color3(0.03, 0.07, 0.02);
    return m;
  });

  // Mid row — individual trees with visible trunks (z = 19–28)
  for (let i = 0; i < 22; i++) {
    const x = -84 + i * 8 + sr(i) * 4 - 2;
    const z = 19 + sr(i + 7) * 9;
    const h = 4.5 + sr(i + 3) * 5.5;
    const d = 3.5 + sr(i + 5) * 3.5;

    const trunk = BABYLON.MeshBuilder.CreateCylinder('mtt' + i,
      { diameter: 0.35 + sr(i + 1) * 0.25, height: h, tessellation: 5 }, scene);
    trunk.position.set(x, h / 2 - 0.3, z);
    trunk.isPickable = false;
    trunk.material   = trunkMat;

    const top = BABYLON.MeshBuilder.CreateSphere('mtc' + i,
      { diameter: d, segments: 6 }, scene);
    top.scaling.set(1, 1.15 + sr(i + 2) * 0.5, 1);
    top.position.set(x + sr(i + 8) * 0.6 - 0.3, h + d * 0.28, z + sr(i + 9) * 0.6 - 0.3);
    top.isPickable = false;
    top.material   = cMats[i % 3];
  }

  // Far row — dense canopy only, fills horizon (z = 34–50)
  for (let i = 0; i < 40; i++) {
    const x = -92 + i * 4.8 + sr(i + 20) * 3 - 1.5;
    const z = 34 + sr(i + 22) * 14;
    const d = 5 + sr(i + 24) * 6;
    const h = 3 + sr(i + 26) * 5;

    const top = BABYLON.MeshBuilder.CreateSphere('ftc' + i,
      { diameter: d, segments: 5 }, scene);
    top.scaling.set(1, 0.88 + sr(i + 23) * 0.55, 1);
    top.position.set(x, h + d * 0.30, z);
    top.isPickable = false;
    top.material   = cMats[i % 3];
  }
})();


// ── Horizon strip ─────────────────────────────────────────────────────────────
// A thin warm-coloured band sitting at the base of the tree line — gives a
// clear visual "ground meets sky" demarcation line when looking forward.

const horizonStrip = BABYLON.MeshBuilder.CreateGround('hz',
  { width: 320, height: 4 }, scene);
horizonStrip.position.set(0, 0.12, 17);
horizonStrip.isPickable = false;
const hzMat = new BABYLON.StandardMaterial('hzm', scene);
hzMat.diffuseColor   = new BABYLON.Color3(0.82, 0.72, 0.48);  // warm golden haze
hzMat.emissiveColor  = new BABYLON.Color3(0.28, 0.20, 0.08);  // subtle self-glow
hzMat.specularColor  = BABYLON.Color3.Black();
horizonStrip.material = hzMat;

// ── Birds ─────────────────────────────────────────────────────────────────────

const _birdMat = new BABYLON.StandardMaterial('birdMat', scene);
_birdMat.diffuseColor  = new BABYLON.Color3(0.06, 0.06, 0.07);
_birdMat.specularColor = BABYLON.Color3.Black();
_birdMat.emissiveColor = new BABYLON.Color3(0.04, 0.04, 0.05);

const birds     = [];
let   birdTimer = 8 + Math.random() * 14;

function spawnBird() {
  const left  = Math.random() > 0.5;
  const y     = 22 + Math.random() * 28;
  const z     = 28 + Math.random() * 90;
  const speed = (5 + Math.random() * 9) * (left ? 1 : -1);
  const sc    = 0.6 + Math.random() * 0.8;

  const body = BABYLON.MeshBuilder.CreateBox('bbd',
    { width: 0.38 * sc, height: 0.07 * sc, depth: 0.09 * sc }, scene);
  const wL = BABYLON.MeshBuilder.CreateBox('bwL',
    { width: 1.05 * sc, height: 0.04 * sc, depth: 0.26 * sc }, scene);
  const wR = BABYLON.MeshBuilder.CreateBox('bwR',
    { width: 1.05 * sc, height: 0.04 * sc, depth: 0.26 * sc }, scene);

  wL.parent = body;
  wR.parent = body;
  wL.position.x = -0.70 * sc;
  wR.position.x =  0.70 * sc;

  body.position.set(left ? -130 : 130, y, z);
  body.rotation.y = left ? 0 : Math.PI;
  [body, wL, wR].forEach(m => { m.material = _birdMat; m.isPickable = false; });

  birds.push({ body, wL, wR, vel: speed, phase: Math.random() * Math.PI * 2 });
}

function updateBirds(dt) {
  birdTimer -= dt;
  if (birdTimer <= 0) {
    spawnBird();
    birdTimer = 10 + Math.random() * 18;
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.body.position.x += b.vel * dt;
    b.phase += dt * 3.8;
    const wa = Math.sin(b.phase) * 0.35;
    b.wL.rotation.z = -wa;
    b.wR.rotation.z =  wa;
    if (Math.abs(b.body.position.x) > 140) {
      b.wL.dispose();
      b.wR.dispose();
      b.body.dispose();
      birds.splice(i, 1);
    }
  }
}

// ── Stone mesh (irregular river-pebble shape) ─────────────────────────────────

function createIrregularStone(scene) {
  // Flat pebble: truly flat top & bottom faces, rounded edge only,
  // naturally irregular (non-circular) smooth outline.
  //
  // Cross-section profile (r–y plane):
  //   flat top face  → y = +edgeR, r from 0 → R-edgeR
  //   rounded edge   → semicircle of radius edgeR centred at (R-edgeR, 0)
  //   flat bot face  → y = -edgeR, r from R-edgeR → 0
  const N     = 24;      // angular divisions around the outline
  const M     = 10;      // rings across the edge arc (top-rim → bottom-rim)
  const R     = 0.132;   // average perimeter radius
  const edgeR = 0.020;   // edge-rounding radius = half total thickness (~40 mm)

  // Smooth irregular perimeter — only low-frequency Fourier terms
  function pebbleR(a) {
    return R
      + Math.sin(a * 2 + 0.7) * 0.014   // gentle elongation
      + Math.cos(a * 3 - 1.1) * 0.009   // one flatter side
      + Math.sin(a * 5 + 2.3) * 0.004;  // small natural wiggles
  }

  const positions = [];
  const uvs       = [];
  const indices   = [];

  const uvScale = R * 2.5;   // UV planar projection scale

  function addV(x, y, z) {
    const i = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(0.5 + x / uvScale, 0.5 + z / uvScale);   // planar XZ → [0,1]
    return i;
  }

  // Top centre vertex
  const topC = addV(0, edgeR, 0);

  // M rings sweeping θ from +90° (top face rim) to −90° (bottom face rim)
  // At θ = ±90°  →  y = ±edgeR, r-offset = 0   (joins flat face)
  // At θ =   0°  →  y =      0, r-offset = edgeR (widest equator)
  const rings = [];
  for (let m = 0; m < M; m++) {
    const theta = Math.PI / 2 - (m / (M - 1)) * Math.PI;
    const ey = edgeR * Math.sin(theta);
    const er = edgeR * Math.cos(theta);
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a  = (i / N) * Math.PI * 2;
      const rc = pebbleR(a) - edgeR;          // radius to edge-arc centre
      ring.push(addV(Math.cos(a) * (rc + er), ey, Math.sin(a) * (rc + er)));
    }
    rings.push(ring);
  }

  // Bottom centre vertex
  const botC = addV(0, -edgeR, 0);

  // Top flat face fan — CCW from above so normal points +Y
  for (let i = 0; i < N; i++)
    indices.push(topC, rings[0][i], rings[0][(i + 1) % N]);

  // Edge quads — CCW from outside so normals point outward
  for (let m = 0; m < M - 1; m++) {
    for (let i = 0; i < N; i++) {
      const j  = (i + 1) % N;
      const a0 = rings[m][i],     a1 = rings[m][j];
      const b0 = rings[m + 1][i], b1 = rings[m + 1][j];
      indices.push(a0, b1, b0, a0, a1, b1);
    }
  }

  // Bottom flat face fan — CCW from below so normal points −Y
  for (let i = 0; i < N; i++)
    indices.push(botC, rings[M - 1][(i + 1) % N], rings[M - 1][i]);

  // Compute smooth normals (auto-averaged per shared vertex)
  const nrm = new Float32Array(positions.length);
  BABYLON.VertexData.ComputeNormals(positions, indices, nrm);

  const vd = new BABYLON.VertexData();
  vd.positions = new Float32Array(positions);
  vd.normals   = nrm;
  vd.uvs       = new Float32Array(uvs);
  vd.indices   = indices;

  const mesh = new BABYLON.Mesh('stone', scene);
  vd.applyToMesh(mesh, false);
  return mesh;
}

const stoneMesh = createIrregularStone(scene);
stoneMesh.isPickable    = false;
stoneMesh.renderOutline = true;
stoneMesh.outlineColor  = new BABYLON.Color3(0.08, 0.08, 0.10);
stoneMesh.outlineWidth  = 0.014;

// ── Procedural stone texture ──────────────────────────────────────────────────
const _stoneTex = new BABYLON.DynamicTexture('stoneTex', { width: 256, height: 256 }, scene, true);
(function () {
  const ctx = _stoneTex.getContext();
  const S = 256;

  // Base — cool blue-gray
  ctx.fillStyle = '#7e8290';
  ctx.fillRect(0, 0, S, S);

  // Radial highlight: pale center (wet stone gloss), darker rim
  const glo = ctx.createRadialGradient(118, 110, 8, 128, 128, 138);
  glo.addColorStop(0,    'rgba(220,222,228,0.55)');
  glo.addColorStop(0.45, 'rgba(180,182,190,0.22)');
  glo.addColorStop(1,    'rgba(50,52,58,0.35)');
  ctx.fillStyle = glo;
  ctx.fillRect(0, 0, S, S);

  // Mineral grain — deterministic speckle noise
  let _s = 0;
  const rnd = () => { _s++; return Math.abs(Math.sin(_s * 127.1 + 311.7) % 1); };
  for (let i = 0; i < 700; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.7 + rnd() * 2.8;
    const v = Math.floor(rnd() * 160 + 55);
    const a = 0.07 + rnd() * 0.20;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${a})`;
    ctx.fill();
  }

  // A few subtle tan mineral streaks
  for (let k = 0; k < 4; k++) {
    const x0 = 40 + rnd() * 176, y0 = 40 + rnd() * 176;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(
      x0 + (rnd() - 0.5) * 70, y0 + (rnd() - 0.5) * 70,
      x0 + (rnd() - 0.5) * 70, y0 + (rnd() - 0.5) * 70,
      x0 + (rnd() - 0.5) * 90, y0 + (rnd() - 0.5) * 90
    );
    ctx.strokeStyle = `rgba(160,138,100,${0.06 + rnd() * 0.10})`;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.stroke();
  }

  _stoneTex.update();
})();

const stMat = new BABYLON.StandardMaterial('stm', scene);
stMat.diffuseTexture  = _stoneTex;
stMat.specularColor   = new BABYLON.Color3(0.50, 0.50, 0.55);
stMat.specularPower   = 52;
stMat.ambientColor    = new BABYLON.Color3(0.30, 0.30, 0.32);
stMat.backFaceCulling = false;   // edge faces always visible from any angle
stoneMesh.material = stMat;

const STONE_PALETTES = [
  new BABYLON.Color3(0.72, 0.50, 0.48),  // dark red
  new BABYLON.Color3(0.62, 0.62, 0.66),  // dark gray
  new BABYLON.Color3(0.48, 0.64, 0.52),  // dark green
  new BABYLON.Color3(0.72, 0.60, 0.38),  // dark ochre/yellow
  new BABYLON.Color3(0.46, 0.56, 0.72),  // dark blue-gray
  new BABYLON.Color3(0.62, 0.50, 0.68),  // dark purple
  new BABYLON.Color3(0.66, 0.50, 0.40),  // warm brown
];

// Spin state: accumulated Y-rotation angle for self-spin axis
let stoneSpinAngle = 0;

// ── Splash particle texture (built from canvas) ───────────────────────────────

const _tc  = document.createElement('canvas');
_tc.width  = _tc.height = 32;
const _tx  = _tc.getContext('2d');
const _tg  = _tx.createRadialGradient(16, 16, 1, 16, 16, 16);
_tg.addColorStop(0,    'rgba(255,255,255,1)');
_tg.addColorStop(0.65, 'rgba(200,235,255,0.8)');
_tg.addColorStop(1,    'rgba(120,200,255,0)');
_tx.fillStyle = _tg;
_tx.beginPath();
_tx.arc(16, 16, 16, 0, Math.PI * 2);
_tx.fill();
const SPLASH_URL = _tc.toDataURL();

// ── Physics helpers ───────────────────────────────────────────────────────────

// Must match the vertex shader wave formula exactly so collision is accurate.
function waveH(x, z, t) {
  return Math.sin(x * 0.5 + t * 1.5) * 0.18
       + Math.cos(z * 0.7 + t * 1.2) * 0.12
       + Math.sin((x + z) * 0.3 + t * 2.2) * 0.06;
}

function genWind() {
  const spd = 1.5 + Math.random() * 4.5;
  const ang = Math.random() * Math.PI * 2;
  wind.x = Math.cos(ang) * spd;
  wind.z = Math.sin(ang) * spd;
}

function resetStone() {
  sv.pos.set(0.22, releaseHeight, -4.8);
  sv.vel.set(0, 0, 0);
  stoneSpinVel              = 0;
  stoneSpinAngle            = 0;
  stoneMesh.isVisible       = true;
  stoneMesh.position.copyFrom(sv.pos);
  stoneMesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, 0.12);
  phase = 'idle';
  skips = 0;
  document.getElementById('skip-num').textContent = '0';
  document.getElementById('res').style.display    = 'none';
  document.getElementById('hint').style.opacity   = '1';
  document.getElementById('hint').textContent     = HINT_TEXT;
  stMat.diffuseColor = STONE_PALETTES[Math.floor(Math.random() * STONE_PALETTES.length)].clone();
  genWind();
  resetStabPhases();
}
resetStone();

function shake() {
  const i = 0.06;
  cam.position.x += (Math.random() - 0.5) * i;
  cam.position.y += (Math.random() - 0.5) * i * 0.5;
}

// ── Screen-space projection ───────────────────────────────────────────────────

// Cache to avoid allocating a new Viewport every frame.
let _vpCache = null;
function worldToScreen(worldPos) {
  if (!_vpCache) {
    _vpCache = new BABYLON.Viewport(0, 0, engine.getRenderWidth(), engine.getRenderHeight());
  }
  _vpCache.width  = engine.getRenderWidth();
  _vpCache.height = engine.getRenderHeight();
  const sp = BABYLON.Vector3.Project(
    worldPos,
    BABYLON.Matrix.Identity(),
    scene.getTransformMatrix(),
    _vpCache
  );
  return (sp.z > 0 && sp.z < 1) ? sp : null;
}

// Polyfill for canvas roundRect (not available in all browsers/WebViews)
function rrect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// ── Height gauge geometry (shared by draw + hit-test) ────────────────────────

function gaugeBounds() {
  const H    = mainCanvas.clientHeight;
  const gTop = H * 0.12;
  const gBot = H * 0.72;
  return { gx: 28, gTop, gBot, gH: gBot - gTop, hitW: 56 };
}

// Is a client-coordinate point inside the gauge hit area?
function inGaugeZone(cx, cy) {
  const { gx, gTop, gBot, hitW } = gaugeBounds();
  return cx >= 0 && cx <= hitW && cy >= gTop - 20 && cy <= gBot + 20;
}

// Convert a client Y to a release height value
function yToHeight(clientY) {
  const { gTop, gBot, gH } = gaugeBounds();
  const frac = 1 - Math.min(Math.max(clientY - gTop, 0), gH) / gH;
  return Math.round((0.92 + frac * 1.08) * 100) / 100;   // 0.92 – 2.00 m, 2 dp
}

// ── Ripple rings (expanding torus meshes on water surface) ────────────────────

function addRings(pos) {
  for (let i = 0; i < 3; i++) {
    const ring = BABYLON.MeshBuilder.CreateTorus('rg',
      { diameter: 0.25, thickness: 0.04, tessellation: 22 }, scene);
    ring.position.set(pos.x, 0.03, pos.z);
    ring.isPickable = false;

    const mat = new BABYLON.StandardMaterial('rgm' + Date.now() + i, scene);
    mat.diffuseColor  = new BABYLON.Color3(0.75, 0.93, 1.0);
    mat.emissiveColor = new BABYLON.Color3(0.25, 0.55, 0.72);
    mat.alpha         = 0.58;
    mat.backFaceCulling = false;
    ring.material = mat;

    activeRings.push({ mesh: ring, age: -i * 0.24, max: 2.8 });
  }
}

// ── Audio (Web Audio API — synthesised water-skip sounds) ────────────────────

const _audioCtx = (typeof AudioContext !== 'undefined')
  ? new AudioContext()
  : (typeof webkitAudioContext !== 'undefined' ? new webkitAudioContext() : null);

// Play a short water-plop/skip sound.
// `big`  – true for final sink (lower, longer); false for a skip bounce
// `dist` – approximate world-space distance from camera (attenuates volume)
function playSkipSound(big, dist) {
  if (!_audioCtx) return;
  if (_audioCtx.state === 'suspended') _audioCtx.resume();

  const now = _audioCtx.currentTime;
  // Volume falls off with distance (reference = 1 m, max = 12 m)
  const vol = Math.max(0.04, 0.9 / (1 + dist * 0.18)) * (big ? 1.0 : 0.72);

  const gain = _audioCtx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (big ? 0.55 : 0.28));
  gain.connect(_audioCtx.destination);

  // Low "plop" body — pitched lower for big sink
  const osc = _audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(big ? 280 : 420 + Math.random() * 80, now);
  osc.frequency.exponentialRampToValueAtTime(big ? 80 : 120, now + (big ? 0.45 : 0.22));
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + (big ? 0.55 : 0.30));

  // Bright "click" transient (filtered noise)
  const buf  = _audioCtx.createBuffer(1, _audioCtx.sampleRate * 0.06, _audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  const src  = _audioCtx.createBufferSource();
  src.buffer = buf;
  const bpf  = _audioCtx.createBiquadFilter();
  bpf.type            = 'bandpass';
  bpf.frequency.value = big ? 600 : 1200;
  bpf.Q.value         = 2.5;
  const clickGain = _audioCtx.createGain();
  clickGain.gain.setValueAtTime(vol * (big ? 0.6 : 0.9), now);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  src.connect(bpf);
  bpf.connect(clickGain);
  clickGain.connect(_audioCtx.destination);
  src.start(now);
}

// ── Splash (particles + rings + shader ripple) ────────────────────────────────

function splash(pos, big) {
  // Particle burst
  const ps = new BABYLON.ParticleSystem('sp', big ? 150 : 90, scene);
  ps.particleTexture  = new BABYLON.Texture(SPLASH_URL, scene);
  ps.emitter          = pos.clone();
  ps.minEmitBox       = new BABYLON.Vector3(-0.06, 0, -0.06);
  ps.maxEmitBox       = new BABYLON.Vector3( 0.06, 0,  0.06);
  ps.direction1       = new BABYLON.Vector3(-1, big ? 7.0 : 4.5, -1);
  ps.direction2       = new BABYLON.Vector3( 1, big ? 9.0 : 6.5,  1);
  ps.minLifeTime      = 0.35;
  ps.maxLifeTime      = big ? 0.95 : 0.75;
  ps.minSize          = big ? 0.07 : 0.04;
  ps.maxSize          = big ? 0.16 : 0.10;
  ps.minEmitPower     = big ? 3.0  : 1.8;
  ps.maxEmitPower     = big ? 5.5  : 3.5;
  ps.updateSpeed      = 0.016;
  ps.gravity          = new BABYLON.Vector3(0, -13, 0);
  ps.color1           = new BABYLON.Color4(0.72, 0.92, 1.0, 1.0);
  ps.color2           = new BABYLON.Color4(0.90, 0.97, 1.0, 0.85);
  ps.colorDead        = new BABYLON.Color4(0.80, 0.95, 1.0, 0.0);
  ps.blendMode        = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  ps.start();
  setTimeout(() => { ps.stop(); setTimeout(() => ps.dispose(), 1200); }, 80);

  // Register ripple in shader uniforms
  const ru  = ripU[ripNext % 3];
  ru.p.copyFrom(pos);
  ru.age = 0.001;
  ripNext++;

  // Expanding ring meshes
  addRings(pos);

  // Distance-attenuated water sound
  const dx   = pos.x - cam.position.x;
  const dz   = pos.z - cam.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  playSkipSound(big, dist);

  if (big) shake();
}

// ── Stone spin helper ─────────────────────────────────────────────────────────
// Combines a flat-disc spin (around local Y) with a precession tilt (wobble).
// spinAngle: accumulated rotation around the pebble's flat axis (radians)
// precAmt:   tilt angle from vertical (radians, small value = slight wobble)
// precPhase: slowly rotating phase of the precession wobble
function spinQuaternion(spinAngle, precAmt, precPhase) {
  // 1) spin around world Y
  const qs = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, spinAngle);
  // 2) tilt the spin-axis itself (precession): rotate around a horizontal axis
  //    that slowly revolves around Y
  const tiltAxis = new BABYLON.Vector3(Math.cos(precPhase), 0, Math.sin(precPhase));
  const qt = BABYLON.Quaternion.RotationAxis(tiltAxis, precAmt);
  // Compose: first tilt, then spin
  return qt.multiply(qs);
}

// ── Physics update ────────────────────────────────────────────────────────────

function updatePhysics(dt) {

  // ── Sinking: stone decelerates in water then submerges ───────────────────
  if (phase === 'sinking') {
    // Heavy water resistance kills horizontal speed quickly
    const drag = Math.exp(-5 * dt);
    sv.vel.x *= drag;
    sv.vel.z *= drag;
    // Slowly pull stone downward (buoyancy lost)
    sv.vel.y  = Math.max(sv.vel.y - 3 * dt, -0.8);
    sv.pos.addInPlace(sv.vel.scale(dt));

    // Spin decays with the same drag factor
    stoneSpinVel  *= Math.exp(-4 * dt);
    stoneSpinAngle += dt * stoneSpinVel;
    const sinkPrec = Math.min(stoneSpinVel / 10, 1) * 0.12;
    stoneMesh.rotationQuaternion = spinQuaternion(stoneSpinAngle, sinkPrec, gameT * 1.6);
    stoneMesh.position.copyFrom(sv.pos);

    // Hide once the stone has sunk well below the surface
    if (sv.pos.y < -0.5) stoneMesh.isVisible = false;
    return;
  }

  if (phase !== 'flying') return;

  sv.vel.y -= GRAVITY * dt;
  sv.vel.x += wind.x  * dt * 0.38;
  sv.vel.z += wind.z  * dt * 0.38;
  sv.pos.addInPlace(sv.vel.scale(dt));

  const wh  = waveH(sv.pos.x, sv.pos.z, gameT);
  if (sv.pos.y <= wh) {
    const spd = sv.vel.length();
    const hs  = Math.sqrt(sv.vel.x ** 2 + sv.vel.z ** 2);
    const ang = Math.abs(Math.atan2(Math.abs(sv.vel.y), hs)) * 180 / Math.PI;

    if (ang < MAX_SKIP_ANG && spd > MIN_SKIP_SPD && skips < 22) {
      // ── skip ──
      sv.pos.y  = wh + 0.02;
      sv.vel.y  = Math.abs(sv.vel.y) * BOUNCE_DAMP;
      sv.vel.x *= HORIZ_DAMP;
      sv.vel.z *= HORIZ_DAMP;
      skips++;
      document.getElementById('skip-num').textContent = skips;
      splash(new BABYLON.Vector3(sv.pos.x, wh, sv.pos.z), false);
    } else {
      // ── sink ──
      sv.pos.y     = wh;
      phase        = 'sinking';
      stoneSpinVel = 10 + sv.vel.length() * 0.5;  // carry current spin into water
      splash(new BABYLON.Vector3(sv.pos.x, wh, sv.pos.z), true);
      showResult();
      setTimeout(resetStone, 2800);
    }
  }

  // Out of bounds — sink silently
  if (sv.pos.z > 160 || sv.pos.z < -25 || Math.abs(sv.pos.x) > 90) {
    phase        = 'sinking';
    stoneSpinVel = sv.vel.length() * 0.5;
    showResult();
    setTimeout(resetStone, 2200);
  }

  // Self-spin: speed proportional to velocity (faster throw = faster spin)
  stoneSpinVel   = 12 + sv.vel.length() * 0.8;
  stoneSpinAngle += dt * stoneSpinVel;
  // Precession wobble: small tilt that rotates around the spin axis
  const precAmt  = 0.18 + (1 - Math.min(sv.vel.length() / 16, 1)) * 0.10;
  stoneMesh.rotationQuaternion = spinQuaternion(stoneSpinAngle, precAmt, gameT * 2.2);
  stoneMesh.position.copyFrom(sv.pos);
}

// ── Throw ─────────────────────────────────────────────────────────────────────
//
//  Three independent parameters the player controls via a single drag:
//
//  1. 力度  (power)          ← swipe speed/length
//  2. 水平角度 (horiz angle)  ← drag direction (left/right from straight-up)
//  3. 出手高度 (height)       ← where on the screen the drag STARTS
//                              (low on screen = low = best for skipping)

// Returns power + angle from a drag gesture (height is now a separate control)
function calcThrowParams(x0, y0, x1, y1, ms) {
  const dx  = x1 - x0;
  const dy  = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const dur   = Math.max(ms, 55);
  const pxps  = len / (dur / 1000);
  const power = Math.min(pxps * 0.023, 24);
  const angle = Math.atan2(dx, -dy);   // 0 = straight forward
  return { power, angle, len };
}

function doThrow(x0, y0, x1, y1, ms) {
  if (phase !== 'idle') return;
  const { power, angle, len } = calcThrowParams(x0, y0, x1, y1, ms);
  if (len < 40) return;

  // ── Freeze stability dot and read its position ────────────────────────────
  stabDot    = getStabDot(stabT);
  stabFrozen = true;

  const dist     = Math.sqrt(stabDot.x ** 2 + stabDot.y ** 2);
  const stability = Math.max(0, 1 - dist / STAB_MAX_R);   // 1 = perfect

  // X component of dot → lateral angle wobble  (±0.30 rad ≈ ±17° at worst)
  const angleOffset  = (stabDot.x / STAB_MAX_R) * 0.30;
  // Y component → power loss  (up to −35% at worst)
  const powerFactor  = 1 - (Math.abs(stabDot.y) / STAB_MAX_R) * 0.35;
  // Distance → general quality factor  (60%–100% of intended power)
  const qualityMult  = 0.60 + stability * 0.40;

  const adjAngle = angle + angleOffset;
  const adjPower = power * powerFactor * qualityMult;
  const fwd      = Math.max(Math.cos(adjAngle) * adjPower, 0.5);

  sv.pos.set(0, releaseHeight, -4.8);
  sv.vel.set(
    Math.sin(adjAngle) * adjPower,
    -adjPower * 0.05,
    fwd
  );
  phase = 'flying';
  document.getElementById('hint').style.opacity = '0';
  document.getElementById('res').style.display  = 'none';
}

// ── Result panel ──────────────────────────────────────────────────────────────

function showResult() {
  if (skips > best) {
    best = skips;
    document.getElementById('best-num').textContent = best;
  }
  const msgs = ['落水了…', '不错！', '漂亮！', '太棒了！', '完美！', '传说级！'];
  const idx  = Math.min(Math.floor(skips / 3), msgs.length - 1);
  document.getElementById('res-num').textContent = skips;
  document.getElementById('res-msg').textContent = skips + '次跳跃 ' + msgs[idx];
  const r = document.getElementById('res');
  r.style.animation = 'none';
  r.style.display   = 'block';
}

// ── Stability ball ────────────────────────────────────────────────────────────
//
//  Dot moves on a Lissajous-like path (sum of two incommensurate sinusoids per
//  axis).  The frequency ratio is irrational (golden ratio / √2 / √5) so the
//  pattern never repeats within a session.  Phase offsets are re-randomised on
//  every reset so each throw feels fresh.
//
//  Normalised space: ±1.  Dot amplitude ≈ ±0.70 → anything outside is "edge".

const STAB_MAX_R = 0.70;   // max dot travel radius in normalised space

function resetStabPhases() {
  stabPhase.ax = Math.random() * Math.PI * 2;
  stabPhase.bx = Math.random() * Math.PI * 2;
  stabPhase.ay = Math.random() * Math.PI * 2;
  stabPhase.by = Math.random() * Math.PI * 2;
  stabT       = 0;
  stabFrozen  = false;
}

function getStabDot(t) {
  // Frequencies chosen to be mutually irrational
  const x = Math.sin(t * 1.000 + stabPhase.ax) * 0.42
           + Math.sin(t * 1.618 + stabPhase.bx) * 0.28;   // golden ratio
  const y = Math.sin(t * 1.414 + stabPhase.ay) * 0.42    // √2
           + Math.sin(t * 2.236 + stabPhase.by) * 0.28;   // √5
  return { x, y };
}

function drawStabilityBall() {
  const w  = scEl.width,  h  = scEl.height;
  const cx = w / 2,       cy = (h - 22) / 2;
  const r  = cx - 8;
  scx.clearRect(0, 0, w, h);

  // Sphere background
  const bg = scx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.06, cx, cy, r);
  bg.addColorStop(0, '#0e200e');
  bg.addColorStop(1, '#050d05');
  scx.beginPath();
  scx.arc(cx, cy, r, 0, Math.PI * 2);
  scx.fillStyle = bg;
  scx.fill();

  // Concentric target rings
  [0.33, 0.66, 1.0].forEach(frac => {
    scx.beginPath();
    scx.arc(cx, cy, r * frac, 0, Math.PI * 2);
    scx.strokeStyle = `rgba(60,180,60,${frac === 1.0 ? 0.0 : 0.22})`;
    scx.lineWidth   = frac === 1.0 ? 0 : 0.8;
    scx.stroke();
  });

  // Cross-hairs
  scx.strokeStyle = 'rgba(60,180,60,0.18)';
  scx.lineWidth   = 0.7;
  scx.beginPath();
  scx.moveTo(cx - r, cy); scx.lineTo(cx + r, cy);
  scx.moveTo(cx, cy - r); scx.lineTo(cx, cy + r);
  scx.stroke();

  // Centre bullseye (ideal spot)
  scx.beginPath();
  scx.arc(cx, cy, 4, 0, Math.PI * 2);
  scx.strokeStyle = 'rgba(80,220,80,0.45)';
  scx.lineWidth   = 1.2;
  scx.stroke();

  // Dot position
  const dot  = stabFrozen ? stabDot : getStabDot(stabT);
  const px   = cx + dot.x / STAB_MAX_R * r * 0.93;
  const py   = cy + dot.y / STAB_MAX_R * r * 0.93;
  const dist = Math.sqrt(dot.x ** 2 + dot.y ** 2);

  // Colour: red while moving, green↔red when frozen based on accuracy
  let dotColor;
  if (stabFrozen) {
    const quality = Math.max(0, 1 - dist / STAB_MAX_R);
    const h2 = Math.round(quality * 120);        // 0° = red, 120° = green
    dotColor = `hsl(${h2},100%,55%)`;
  } else {
    dotColor = '#ff3333';
  }

  // Trailing glow ring
  scx.beginPath();
  scx.arc(px, py, 9, 0, Math.PI * 2);
  scx.strokeStyle = dotColor.replace(')', ',0.30)').replace('hsl(', 'hsla(').replace('rgb(', 'rgba(');
  scx.lineWidth   = 2;
  scx.stroke();

  // Dot core
  scx.beginPath();
  scx.arc(px, py, 6, 0, Math.PI * 2);
  scx.fillStyle   = dotColor;
  scx.shadowColor = dotColor;
  scx.shadowBlur  = stabFrozen ? 14 : 7;
  scx.fill();
  scx.shadowBlur  = 0;

  // Outer bezel
  scx.beginPath();
  scx.arc(cx, cy, r, 0, Math.PI * 2);
  scx.strokeStyle = '#1a3a1a';
  scx.lineWidth   = 2;
  scx.stroke();

  // Label
  scx.font      = 'bold 10px Arial';
  scx.textAlign = 'center';
  scx.textBaseline = 'alphabetic';
  scx.fillStyle = '#66aa66';
  scx.fillText('稳定性', cx, cy + r + 14);

  // Stability % when frozen
  if (stabFrozen) {
    const quality = Math.max(0, 1 - dist / STAB_MAX_R);
    const pct     = Math.round(quality * 100);
    const h2      = Math.round(quality * 120);
    scx.fillStyle = `hsl(${h2},100%,60%)`;
    scx.font      = 'bold 13px Arial';
    scx.fillText(pct + '%', cx, cy + r + 26);
  }
}

// ── Wind indicator (gyroscope / attitude-indicator style) ─────────────────────

function drawWind() {
  const cw = wcEl.width;
  const ch = wcEl.height;
  const cx = cw / 2;
  const cy = (ch - 20) / 2;
  const r  = cx - 7;
  wcx.clearRect(0, 0, cw, ch);

  // Sphere background
  const bg = wcx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.07, cx, cy, r);
  bg.addColorStop(0, '#1e3255');
  bg.addColorStop(1, '#080d1e');
  wcx.beginPath();
  wcx.arc(cx, cy, r, 0, Math.PI * 2);
  wcx.fillStyle = bg;
  wcx.fill();

  // Latitude rings (ellipses give 3-D sphere illusion)
  wcx.strokeStyle = 'rgba(80,148,200,0.32)';
  wcx.lineWidth   = 0.7;
  for (let i = -2; i <= 2; i++) {
    const ly = cy + i * r * 0.30;
    const lx = Math.sqrt(Math.max(0, r * r - (ly - cy) ** 2));
    wcx.beginPath();
    wcx.ellipse(cx, ly, lx, lx * 0.22, 0, 0, Math.PI * 2);
    wcx.stroke();
  }

  // Longitude lines
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    wcx.beginPath();
    wcx.ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, Math.PI / 2, 0, Math.PI * 2);
    wcx.stroke();
  }

  // Compass labels N / E / S / W
  wcx.font          = 'bold 10px Arial';
  wcx.textAlign     = 'center';
  wcx.textBaseline  = 'middle';
  [['N', -Math.PI / 2], ['E', 0], ['S', Math.PI / 2], ['W', Math.PI]].forEach(([label, a]) => {
    wcx.fillStyle = label === 'N' ? '#ffe966' : '#88bbc8';
    wcx.fillText(label,
      cx + Math.cos(a) * (r - 13),
      cy + Math.sin(a) * (r - 13) * 0.50);
  });

  // Wind arrow
  const spd = Math.sqrt(wind.x ** 2 + wind.z ** 2);
  const ang = Math.atan2(wind.x, wind.z);
  const al  = Math.min(spd / 6, 1) * r * 0.72;
  const ax  = Math.sin(ang) * al;
  const ay  = -Math.cos(ang) * al * 0.52;   // flattened for sphere perspective

  wcx.save();
  wcx.shadowColor = '#FFD700';
  wcx.shadowBlur  = 10;
  wcx.strokeStyle = '#FFD700';
  wcx.lineWidth   = 2.5;
  wcx.lineCap     = 'round';
  wcx.beginPath();
  wcx.moveTo(cx, cy);
  wcx.lineTo(cx + ax, cy + ay);
  wcx.stroke();

  const ha = Math.atan2(ay, ax);
  wcx.beginPath();
  wcx.moveTo(cx + ax, cy + ay);
  wcx.lineTo(cx + ax - Math.cos(ha - 0.42) * 9, cy + ay - Math.sin(ha - 0.42) * 9);
  wcx.lineTo(cx + ax - Math.cos(ha + 0.42) * 9, cy + ay - Math.sin(ha + 0.42) * 9);
  wcx.closePath();
  wcx.fillStyle = '#FFD700';
  wcx.fill();
  wcx.restore();

  // Centre dot
  wcx.beginPath();
  wcx.arc(cx, cy, 3, 0, Math.PI * 2);
  wcx.fillStyle = 'white';
  wcx.fill();

  // Outer bezel ring
  wcx.beginPath();
  wcx.arc(cx, cy, r, 0, Math.PI * 2);
  wcx.strokeStyle = '#3a5572';
  wcx.lineWidth   = 2;
  wcx.stroke();

  // Glassy inner highlight
  wcx.beginPath();
  wcx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.32, 0, Math.PI * 2);
  wcx.strokeStyle = 'rgba(255,255,255,0.06)';
  wcx.lineWidth   = 1;
  wcx.stroke();

  // Speed readout below the ball
  wcx.fillStyle  = '#FFE566';
  wcx.font       = 'bold 11px Arial';
  wcx.textAlign  = 'center';
  wcx.fillText('风 ' + spd.toFixed(1) + ' m/s', cx, cy + r + 14);
}

// ── Aim UI ────────────────────────────────────────────────────────────────────

function drawAimUI() {
  swx.clearRect(0, 0, swEl.width, swEl.height);
  if (phase !== 'idle') return;

  const W = swEl.width;
  const H = swEl.height;

  // ── Height gauge — always visible, independently draggable ────────────────
  const { gx, gTop, gBot, gH } = gaugeBounds();
  const hFrac = (releaseHeight - 0.92) / 1.08;
  const knobY = gBot - gH * hFrac;

  // Track background
  swx.fillStyle = 'rgba(0,0,0,0.48)';
  rrect(swx, gx - 6, gTop, 12, gH, 4);
  swx.fill();

  // Fill (green=low/good → orange → red=high)
  if (hFrac > 0) {
    const fillH = gH * hFrac;
    const gGrad = swx.createLinearGradient(0, gBot, 0, gTop);
    gGrad.addColorStop(0,   '#22ff88');
    gGrad.addColorStop(0.3, '#ffe033');
    gGrad.addColorStop(1,   '#ff4422');
    swx.fillStyle = gGrad;
    rrect(swx, gx - 4, gBot - fillH, 8, fillH, 3);
    swx.fill();
  }

  // Optimal-height tick (~0.25 m)
  const optY = gBot - gH * ((1.05 - 0.92) / 1.08);
  swx.strokeStyle = 'rgba(255,255,255,0.65)';
  swx.lineWidth   = 1.5;
  swx.beginPath();
  swx.moveTo(gx - 11, optY);
  swx.lineTo(gx + 11, optY);
  swx.stroke();
  swx.fillStyle    = 'rgba(255,255,255,0.50)';
  swx.font         = '10px Arial';
  swx.textAlign    = 'right';
  swx.textBaseline = 'middle';
  swx.fillText('最佳', gx - 13, optY);

  // Knob — larger + glowing when actively dragged
  const knobR = gaugeActive ? 11 : 8;
  swx.beginPath();
  swx.arc(gx, knobY, knobR, 0, Math.PI * 2);
  swx.fillStyle   = gaugeActive ? '#FFE566' : '#ffffff';
  swx.shadowColor = gaugeActive ? '#FFD700' : 'rgba(255,255,255,0.55)';
  swx.shadowBlur  = gaugeActive ? 14 : 8;
  swx.fill();
  swx.shadowBlur  = 0;

  // Drag-handle tick marks on knob
  swx.strokeStyle = gaugeActive ? 'rgba(0,0,0,0.5)' : 'rgba(160,160,160,0.6)';
  swx.lineWidth   = 1.5;
  [-2, 0, 2].forEach(dy2 => {
    swx.beginPath();
    swx.moveTo(gx - 4, knobY + dy2);
    swx.lineTo(gx + 4, knobY + dy2);
    swx.stroke();
  });

  // Labels
  swx.fillStyle    = 'rgba(255,255,255,0.75)';
  swx.font         = 'bold 11px Arial';
  swx.textAlign    = 'center';
  swx.textBaseline = 'alphabetic';
  swx.fillText('高度', gx, gTop - 8);
  swx.fillStyle = gaugeActive ? '#FFE566' : 'rgba(255,255,255,0.75)';
  swx.fillText(releaseHeight.toFixed(2) + ' m', gx, gBot + 18);

  // ── Throw gesture visuals — only when a non-gauge drag is active ──────────
  if (!touch.on || gaugeActive) return;

  const dx  = touch.xc - touch.x0;
  const dy  = touch.yc - touch.y0;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 40) return;

  // ── Direction arrow + power ring at drag origin ───────────────────────────
  const { power, angle } = calcThrowParams(touch.x0, touch.y0, touch.xc, touch.yc,
                                            performance.now() - touch.t0);
  const pw   = Math.min(power / 24, 1);
  const hue  = 120 - pw * 120;
  const ringR = 26 + pw * 54;

  swx.save();
  swx.strokeStyle = `hsla(${hue},100%,60%,0.70)`;
  swx.lineWidth   = 2.5;
  swx.shadowColor = `hsl(${hue},100%,55%)`;
  swx.shadowBlur  = 10;
  swx.beginPath();
  swx.arc(touch.x0, touch.y0, ringR, 0, Math.PI * 2);
  swx.stroke();

  const tipLen = ringR + 38;
  const tipX   = touch.x0 + Math.sin(angle) * tipLen;
  const tipY   = touch.y0 - Math.cos(angle) * tipLen;
  swx.strokeStyle = 'rgba(255,238,80,0.92)';
  swx.shadowColor = '#FFD700';
  swx.lineWidth   = 3;
  swx.lineCap     = 'round';
  swx.beginPath();
  swx.moveTo(touch.x0, touch.y0);
  swx.lineTo(tipX, tipY);
  swx.stroke();

  const ha = Math.atan2(tipY - touch.y0, tipX - touch.x0);
  swx.fillStyle  = '#FFD700';
  swx.shadowBlur = 6;
  swx.beginPath();
  swx.moveTo(tipX, tipY);
  swx.lineTo(tipX - Math.cos(ha - 0.42) * 13, tipY - Math.sin(ha - 0.42) * 13);
  swx.lineTo(tipX - Math.cos(ha + 0.42) * 13, tipY - Math.sin(ha + 0.42) * 13);
  swx.closePath();
  swx.fill();
  swx.restore();

  // ── Trajectory preview (simulated arc) ───────────────────────────────────
  const fwd   = Math.max(Math.cos(angle) * power, 0.5);
  const simP  = new BABYLON.Vector3(0, releaseHeight, -4.8);
  const simV  = new BABYLON.Vector3(Math.sin(angle) * power, -power * 0.05, fwd);
  const arcPts    = [];
  const bouncePts = [];
  let   simSkips  = 0;

  for (let step = 0; step < 200 && simSkips < 6; step++) {
    const dt2 = 0.05;
    simV.y -= GRAVITY * dt2;
    simV.x += wind.x * dt2 * 0.38;
    simV.z += wind.z * dt2 * 0.38;
    simP.addInPlace(simV.scale(dt2));

    const wh = waveH(simP.x, simP.z, gameT);
    if (simP.y <= wh) {
      const spd2 = simV.length();
      const hs   = Math.sqrt(simV.x ** 2 + simV.z ** 2);
      const ang2 = Math.abs(Math.atan2(Math.abs(simV.y), hs)) * 180 / Math.PI;
      bouncePts.push(simP.clone());
      if (ang2 < MAX_SKIP_ANG && spd2 > MIN_SKIP_SPD && simSkips < 6) {
        simV.y  = Math.abs(simV.y) * BOUNCE_DAMP;
        simV.x *= HORIZ_DAMP;
        simV.z *= HORIZ_DAMP;
        simP.y  = wh + 0.02;
        simSkips++;
      } else { break; }
    }
    if (step % 2 === 0) arcPts.push(simP.clone());
  }

  // Project arc to 2-D and draw
  swx.save();
  swx.strokeStyle = 'rgba(180,240,255,0.55)';
  swx.lineWidth   = 1.5;
  swx.setLineDash([4, 6]);
  swx.shadowColor = 'rgba(120,210,255,0.3)';
  swx.shadowBlur  = 4;
  let prev = null;
  arcPts.forEach(wp => {
    const sp = worldToScreen(wp);
    if (!sp) { prev = null; return; }
    if (prev) {
      swx.beginPath();
      swx.moveTo(prev.x, prev.y);
      swx.lineTo(sp.x,   sp.y);
      swx.stroke();
    }
    prev = sp;
  });

  // Bounce impact dots
  swx.setLineDash([]);
  swx.shadowColor = '#FFD700';
  bouncePts.forEach((wp, i) => {
    const sp = worldToScreen(wp);
    if (!sp) return;
    swx.beginPath();
    swx.arc(sp.x, sp.y, Math.max(6 - i, 3), 0, Math.PI * 2);
    swx.fillStyle  = `rgba(255,230,80,${0.9 - i * 0.12})`;
    swx.shadowBlur = 7;
    swx.fill();
  });
  swx.restore();

  // ── Parameter readout (bottom centre) ────────────────────────────────────
  const angDeg = Math.round(angle * 180 / Math.PI);
  const angStr = (angDeg >= 0 ? '+' : '') + angDeg + '°';
  swx.save();
  swx.font      = 'bold 13px Arial';
  swx.textAlign = 'center';
  swx.textBaseline = 'middle';
  const sy = H - 30;
  const sx = W / 2;
  swx.fillStyle = 'rgba(0,0,0,0.52)';
  swx.fillRect(sx - 185, sy - 14, 370, 28);
  swx.fillStyle = '#FFE566';
  swx.fillText(
    `力度 ${power.toFixed(1)} m/s   角度 ${angStr}   高度 ${releaseHeight.toFixed(2)} m`,
    sx, sy
  );
  swx.restore();
}

// ── Input — height gauge + throw gesture (routed by start position) ──────────

// Touch
mainCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  if (inGaugeZone(t.clientX, t.clientY) && phase === 'idle') {
    gaugeActive   = true;
    releaseHeight = yToHeight(t.clientY);
  } else {
    touch = { on: true, x0: t.clientX, y0: t.clientY,
              xc: t.clientX, yc: t.clientY, t0: performance.now() };
  }
}, { passive: false });

mainCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  if (gaugeActive) {
    releaseHeight = yToHeight(t.clientY);
  } else if (touch.on) {
    touch.xc = t.clientX;
    touch.yc = t.clientY;
  }
}, { passive: false });

mainCanvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (gaugeActive) {
    gaugeActive = false;
  } else if (touch.on) {
    const t = e.changedTouches[0];
    doThrow(touch.x0, touch.y0, t.clientX, t.clientY, performance.now() - touch.t0);
    touch.on = false;
    swx.clearRect(0, 0, swEl.width, swEl.height);
  }
}, { passive: false });

// Mouse (desktop)
mainCanvas.addEventListener('contextmenu', e => e.preventDefault());

mainCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (inGaugeZone(e.clientX, e.clientY) && phase === 'idle') {
    gaugeActive   = true;
    releaseHeight = yToHeight(e.clientY);
    mainCanvas.style.cursor = 'ns-resize';
  } else {
    mainCanvas.classList.add('dragging');
    touch = { on: true, x0: e.clientX, y0: e.clientY,
              xc: e.clientX, yc: e.clientY, t0: performance.now() };
  }
});

window.addEventListener('mousemove', e => {
  if (gaugeActive) {
    releaseHeight = yToHeight(e.clientY);
  } else if (touch.on) {
    touch.xc = e.clientX;
    touch.yc = e.clientY;
  } else {
    // Update cursor based on hover position
    mainCanvas.style.cursor = inGaugeZone(e.clientX, e.clientY) && phase === 'idle'
      ? 'ns-resize'
      : 'crosshair';
  }
});

window.addEventListener('mouseup', e => {
  if (gaugeActive) {
    gaugeActive             = false;
    mainCanvas.style.cursor = 'crosshair';
  } else if (touch.on) {
    mainCanvas.classList.remove('dragging');
    doThrow(touch.x0, touch.y0, e.clientX, e.clientY, performance.now() - touch.t0);
    touch.on = false;
    swx.clearRect(0, 0, swEl.width, swEl.height);
  }
});

// ── Main render loop ──────────────────────────────────────────────────────────

engine.runRenderLoop(() => {
  const now = performance.now();
  const dt  = Math.min((now - lastT) / 1000, 0.05);
  lastT  = now;
  gameT += dt;

  // Pass time + ripple data to water shader
  waterMat.setFloat('time', gameT);
  ripU.forEach((r, i) => {
    if (r.age > 0) r.age += dt;
    waterMat.setVector4('rip' + i,
      new BABYLON.Vector4(r.p.x, r.p.y, r.p.z, Math.max(r.age, 0)));
  });

  // Animate expanding ripple rings
  for (let i = activeRings.length - 1; i >= 0; i--) {
    const r = activeRings[i];
    r.age += dt;
    if (r.age <= 0) continue;
    const sc = 1 + r.age * 7.5;
    r.mesh.scaling.x = sc;
    r.mesh.scaling.z = sc;
    r.mesh.material.alpha = Math.max(0, 0.57 - r.age * 0.26);
    if (r.mesh.material.alpha <= 0.01) {
      r.mesh.dispose();
      activeRings.splice(i, 1);
    }
  }

  updatePhysics(dt);
  updateBirds(dt);

  // Stone & camera behaviour per phase
  if (phase === 'idle') {
    // Stone always tracks releaseHeight so player sees height change in real time
    sv.pos.y = releaseHeight;
    stoneMesh.position.set(sv.pos.x, releaseHeight + Math.sin(gameT * 2) * 0.018, sv.pos.z);
    if (touch.on && !gaugeActive) {
      stoneMesh.rotation.y = gameT * 1.5;
    }
    // Hint text gentle bob
    const hint = document.getElementById('hint');
    hint.style.transform = `translateX(-50%) translateY(${Math.sin(gameT * 2) * 4}px)`;

    // Camera eases back to default while idle (dt-normalised so frame-rate independent)
    const fi = 1 - Math.exp(-2.5 * dt);   // relaxation ~400 ms
    cam.target.x   += (0    - cam.target.x)   * fi;
    cam.target.y   += (0.55 - cam.target.y)   * fi;
    cam.target.z   += (50   - cam.target.z)   * fi;
    cam.position.x += (0    - cam.position.x) * fi;
    cam.position.z += (-6   - cam.position.z) * fi;
  }

  // Camera tracks the stone in flight (dt-normalised lerp — no sudden snaps)
  if (phase === 'flying' || phase === 'sinking') {
    const ft = 1 - Math.exp(-5.0 * dt);   // target follow  ~200 ms
    const fp = 1 - Math.exp(-2.5 * dt);   // position drift ~400 ms
    const tx = sv.pos.x;
    const tz = Math.max(sv.pos.z, 2);
    cam.target.x   += (tx   - cam.target.x)   * ft;
    cam.target.y   += (0.30 - cam.target.y)   * ft;
    cam.target.z   += (tz   - cam.target.z)   * ft;
    cam.position.x += (sv.pos.x * 0.55 - cam.position.x) * fp;
    const targetZ   = -6 + Math.max(sv.pos.z - 10, 0) * 0.25;
    cam.position.z += (targetZ - cam.position.z) * fp;
  }

  // Advance stability dot only while it's live (idle phase, not frozen)
  if (phase === 'idle' && !stabFrozen) stabT += dt * 2.2;

  drawStabilityBall();
  drawWind();
  drawAimUI();
  scene.render();
});

window.addEventListener('resize', () => engine.resize());
})();
