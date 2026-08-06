const Weather = (() => {
  // ─── Presets ─────────────────────────────────────────────────────────────────
  // sky / fog are [R,G,B]; sunI = sun intensity; ambI = ambient intensity
  const PRESETS = {
    noon:    { label:'正午晴天',  icon:'☀️',  sky:[0.45,0.72,0.92], fog:[0.70,0.83,0.95], fogStart:180, fogEnd:290, sun:[1.00,0.97,0.88], sunI:1.10, amb:[0.70,0.85,1.00], ambI:0.50, rain:false, rainRate:0    },
    dusk:    { label:'傍晚黄昏',  icon:'🌅',  sky:[0.68,0.35,0.15], fog:[0.72,0.40,0.20], fogStart:100, fogEnd:220, sun:[1.00,0.50,0.20], sunI:0.65, amb:[0.80,0.55,0.40], ambI:0.38, rain:false, rainRate:0    },
    rain:    { label:'雨天',      icon:'🌧️',  sky:[0.28,0.30,0.36], fog:[0.36,0.38,0.44], fogStart:70,  fogEnd:180, sun:[0.70,0.74,0.82], sunI:0.38, amb:[0.60,0.65,0.75], ambI:0.55, rain:true,  rainRate:2500 },
    fog:     { label:'浓雾',      icon:'🌫️',  sky:[0.65,0.67,0.72], fog:[0.67,0.69,0.73], fogStart:25,  fogEnd:110, sun:[0.85,0.87,0.92], sunI:0.45, amb:[0.78,0.80,0.85], ambI:0.65, rain:false, rainRate:0    },
    rainFog: { label:'阴雨迷雾',  icon:'⛈️',  sky:[0.22,0.24,0.30], fog:[0.28,0.30,0.36], fogStart:20,  fogEnd:85,  sun:[0.55,0.58,0.65], sunI:0.28, amb:[0.55,0.58,0.68], ambI:0.58, rain:true,  rainRate:3500 },
    duskFog: { label:'傍晚迷雾',  icon:'🌆',  sky:[0.55,0.28,0.15], fog:[0.60,0.32,0.18], fogStart:40,  fogEnd:130, sun:[1.00,0.40,0.12], sunI:0.55, amb:[0.75,0.50,0.38], ambI:0.42, rain:false, rainRate:0    },
  };
  const PRESET_KEYS = Object.keys(PRESETS);

  // ─── State ────────────────────────────────────────────────────────────────────
  let _scene, _sun, _ambient;
  let _rainSystem = null;
  let _rainEmitter = null;
  let _labelEl = null;
  let _from = null;
  let _to   = null;
  let _t    = 1.0;                 // 0 → transition start, 1 → complete
  const TRANS_DURATION = 4.0;      // seconds
  let _visibilityFactor = 1.0;     // exposed for minimap

  // ─── Math helpers ────────────────────────────────────────────────────────────
  function _l(a, b, t) { return a + (b - a) * t; }
  function _l3(a, b, t) { return [_l(a[0],b[0],t), _l(a[1],b[1],t), _l(a[2],b[2],t)]; }

  // ─── Scene application ───────────────────────────────────────────────────────
  function _apply(p) {
    _scene.clearColor        = new BABYLON.Color4(p.sky[0], p.sky[1], p.sky[2], 1);
    _scene.fogColor          = new BABYLON.Color3(p.fog[0], p.fog[1], p.fog[2]);
    _scene.fogStart          = p.fogStart;
    _scene.fogEnd            = p.fogEnd;
    _sun.diffuse             = new BABYLON.Color3(p.sun[0], p.sun[1], p.sun[2]);
    _sun.intensity           = p.sunI;
    _ambient.diffuse         = new BABYLON.Color3(p.amb[0], p.amb[1], p.amb[2]);
    _ambient.intensity       = p.ambI;
  }

  function _applyLerp(a, b, t) {
    const sky = _l3(a.sky, b.sky, t);
    const fog = _l3(a.fog, b.fog, t);
    const sun = _l3(a.sun, b.sun, t);
    const amb = _l3(a.amb, b.amb, t);
    _scene.clearColor  = new BABYLON.Color4(sky[0], sky[1], sky[2], 1);
    _scene.fogColor    = new BABYLON.Color3(fog[0], fog[1], fog[2]);
    _scene.fogStart    = _l(a.fogStart, b.fogStart, t);
    _scene.fogEnd      = _l(a.fogEnd,   b.fogEnd,   t);
    _sun.diffuse       = new BABYLON.Color3(sun[0], sun[1], sun[2]);
    _sun.intensity     = _l(a.sunI, b.sunI, t);
    _ambient.diffuse   = new BABYLON.Color3(amb[0], amb[1], amb[2]);
    _ambient.intensity = _l(a.ambI, b.ambI, t);
  }

  // ─── Rain particles ──────────────────────────────────────────────────────────
  function _buildRain() {
    // Raindrop texture: narrow vertical streak with fade gradient
    const tex = new BABYLON.DynamicTexture('rainTex', { width: 4, height: 32 }, _scene, false);
    const c2d = tex.getContext();
    const grad = c2d.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0,   'rgba(200,220,255,0)');
    grad.addColorStop(0.2, 'rgba(200,220,255,0.85)');
    grad.addColorStop(0.8, 'rgba(180,210,255,0.70)');
    grad.addColorStop(1,   'rgba(180,210,255,0)');
    c2d.fillStyle = grad;
    c2d.fillRect(0, 0, 4, 32);
    tex.update();

    _rainEmitter = new BABYLON.TransformNode('rainEmitter', _scene);

    const ps = new BABYLON.ParticleSystem('rainPS', 4000, _scene);
    ps.particleTexture = tex;
    ps.emitter        = _rainEmitter;
    // Spawn in a flat slab 60×60 above the player
    ps.minEmitBox = new BABYLON.Vector3(-30, 0, -30);
    ps.maxEmitBox = new BABYLON.Vector3( 30, 0,  30);
    // Fall mostly downward with a tiny wind lean
    ps.direction1 = new BABYLON.Vector3(-0.3, -1, -0.3);
    ps.direction2 = new BABYLON.Vector3( 0.3, -1,  0.3);
    ps.minEmitPower = 28;
    ps.maxEmitPower = 36;
    ps.gravity      = new BABYLON.Vector3(-1.5, -15, 0);
    // Short lifetime → covers ~18 m of vertical fall
    ps.minLifeTime = 0.45;
    ps.maxLifeTime = 0.65;
    // Narrow in X, elongated in Y for streak look
    ps.minSize  = 0.12;
    ps.maxSize  = 0.18;
    ps.minScaleX = 0.25;
    ps.maxScaleX = 0.40;
    ps.minScaleY = 3.0;
    ps.maxScaleY = 5.0;
    ps.color1    = new BABYLON.Color4(0.82, 0.90, 1.0, 0.80);
    ps.color2    = new BABYLON.Color4(0.72, 0.84, 1.0, 0.60);
    ps.colorDead = new BABYLON.Color4(0.60, 0.75, 1.0, 0.00);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.emitRate  = 0;   // driven from update()
    ps.updateSpeed = 0.016;
    ps.start();
    _rainSystem = ps;
  }

  // ─── Label UI ────────────────────────────────────────────────────────────────
  function _buildLabel() {
    _labelEl = document.createElement('div');
    Object.assign(_labelEl.style, {
      position:   'fixed',
      top:        '14px',
      left:       '50%',
      transform:  'translateX(-50%)',
      color:      'rgba(255,255,255,0.92)',
      font:       'bold 14px/1 Arial',
      textShadow: '0 1px 6px rgba(0,0,0,0.9)',
      background: 'rgba(0,0,0,0.30)',
      padding:    '5px 14px',
      borderRadius: '20px',
      pointerEvents: 'none',
      transition: 'opacity 1s',
      opacity:    '0',
      zIndex:     '900',
    });
    document.body.appendChild(_labelEl);
  }

  function _showLabel(preset) {
    _labelEl.textContent = preset.icon + '  ' + preset.label;
    _labelEl.style.opacity = '1';
    clearTimeout(_labelEl._hideTimer);
    _labelEl._hideTimer = setTimeout(() => { _labelEl.style.opacity = '0'; }, 3200);
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────
  function _scheduleNext() {
    const delay = (30 + Math.random() * 30) * 1000;
    setTimeout(() => {
      // Pick a different preset
      let nextKey;
      const currentKey = PRESET_KEYS.find(k => PRESETS[k] === _to);
      do { nextKey = PRESET_KEYS[Math.floor(Math.random() * PRESET_KEYS.length)]; }
      while (nextKey === currentKey);

      _from = _to;
      _to   = PRESETS[nextKey];
      _t    = 0;
      _showLabel(_to);
      _scheduleNext();
    }, delay);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  function init(scene, sun, ambient) {
    _scene   = scene;
    _sun     = sun;
    _ambient = ambient;

    _buildRain();
    _buildLabel();

    // Random initial preset
    const startKey = PRESET_KEYS[Math.floor(Math.random() * PRESET_KEYS.length)];
    _from = PRESETS[startKey];
    _to   = _from;
    _t    = 1.0;
    _apply(_to);
    _visibilityFactor = Math.min(1, (_to.fogEnd - _to.fogStart) / 200);
    _showLabel(_to);
    _scheduleNext();
  }

  function update(dt, playerPos) {
    // Rain emitter follows the player
    if (_rainEmitter && playerPos) {
      _rainEmitter.position.set(playerPos.x, playerPos.y + 22, playerPos.z);
    }

    // Colour / fog transition
    if (_t < 1.0) {
      _t = Math.min(1.0, _t + dt / TRANS_DURATION);
      _applyLerp(_from, _to, _t);
    }

    // Rain rate (lerp between from/to)
    if (_rainSystem) {
      const rFrom = _from.rain ? _from.rainRate : 0;
      const rTo   = _to.rain   ? _to.rainRate   : 0;
      _rainSystem.emitRate = Math.round(_l(rFrom, rTo, _t));
    }

    // Visibility factor for minimap: 1=clear, lower=fog
    // Use fogEnd as proxy for max sight distance (noon fogEnd=290 is the reference max).
    _visibilityFactor = Math.max(0.15, Math.min(1.0, _scene.fogEnd / 290));
  }

  function getVisibilityFactor() { return _visibilityFactor; }

  return { init, update, getVisibilityFactor };
})();
