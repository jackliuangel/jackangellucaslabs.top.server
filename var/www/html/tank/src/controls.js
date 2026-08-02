const Controls = (() => {
  const _state = {
    throttle: 0,        // -1 to 1
    steer: 0,           // -1 to 1 (hull turn rate)
    turretSteer: 0,     // -1 to 1
    turretVertical: 0,  // -1 to 1  (right joy up/down → range adjust)
    targetDist: 60,     // desired aim distance in world units
    shoot: false
  };

  const _keys = {};

  function init() {
    // Keyboard
    window.addEventListener('keydown', e => {
      _keys[e.code] = true;
      if (e.code === 'Space') { _state.shoot = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      _keys[e.code] = false;
      if (e.code === 'Space') _state.shoot = false;
    });

    // Joysticks
    const leftJoy = nipplejs.create({
      zone: document.getElementById('left-zone'),
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: 'rgba(255,255,255,0.5)',
      size: 120
    });

    const rightJoy = nipplejs.create({
      zone: document.getElementById('right-zone'),
      mode: 'static',
      position: { right: '80px', bottom: '80px' },
      color: 'rgba(255,255,255,0.5)',
      size: 120
    });

    // Left joystick → hull movement (same as WASD)
    leftJoy.on('move', (e, data) => {
      const angle = data.angle.radian;
      const force = Math.min(data.force, 1);
      _state.throttle = Math.sin(angle) * force;
      _state.steer = Math.cos(angle) * force;
    });
    leftJoy.on('end', () => {
      _state.throttle = 0;
      _state.steer = 0;
    });

    // Range buttons (touch + mouse, continuous while held)
    let _nearInterval = null, _farInterval = null;
    function startNear() { _state.targetDist = Math.max(15, _state.targetDist - 5); _updateRangeDisplay(); }
    function startFar()  { _state.targetDist = Math.min(120, _state.targetDist + 5); _updateRangeDisplay(); }

    const nearBtn = document.getElementById('range-near');
    const farBtn  = document.getElementById('range-far');

    nearBtn.addEventListener('touchstart', e => { e.preventDefault(); startNear(); _nearInterval = setInterval(() => { startNear(); }, 120); });
    nearBtn.addEventListener('touchend',   e => { e.preventDefault(); clearInterval(_nearInterval); });
    nearBtn.addEventListener('mousedown',  () => { startNear(); _nearInterval = setInterval(() => { startNear(); }, 120); });
    nearBtn.addEventListener('mouseup',    () => clearInterval(_nearInterval));
    nearBtn.addEventListener('mouseleave', () => clearInterval(_nearInterval));

    farBtn.addEventListener('touchstart',  e => { e.preventDefault(); startFar();  _farInterval  = setInterval(() => { startFar(); },  120); });
    farBtn.addEventListener('touchend',    e => { e.preventDefault(); clearInterval(_farInterval); });
    farBtn.addEventListener('mousedown',   () => { startFar();  _farInterval  = setInterval(() => { startFar(); },  120); });
    farBtn.addEventListener('mouseup',     () => clearInterval(_farInterval));
    farBtn.addEventListener('mouseleave',  () => clearInterval(_farInterval));

    // Right joystick → turret rotation (left/right) + range adjust (up/down), same as arrow keys
    rightJoy.on('move', (e, data) => {
      const angle = data.angle.radian;
      const force = Math.min(data.force, 1);
      _state.turretSteer = Math.cos(angle) * force;
      _state.turretVertical = Math.sin(angle) * force; // positive = up = farther
    });
    rightJoy.on('end', () => {
      _state.turretSteer = 0;
      _state.turretVertical = 0;
    });

    // Fire button
    // touchend/mouseup do NOT reset _state.shoot — getInput() consumes it once per frame.
    // Without this, a fast tap on iPad fires touchend before the next render frame,
    // clearing the flag before getInput() ever reads it.
    document.getElementById('fire-btn').addEventListener('touchstart', e => {
      e.preventDefault();
      _state.shoot = true;
    });
    document.getElementById('fire-btn').addEventListener('mousedown', () => {
      _state.shoot = true;
    });
  }

  function _updateRangeDisplay() {
    const el = document.getElementById('range-display');
    if (el) el.textContent = Math.round(_state.targetDist) + 'm';
  }

  // Ballistic elevation to hit a target at `dist` metres on flat ground
  // Range formula: d = v²·sin(2θ)/g  =>  sin(2θ) = g·d/v²  =>  θ = asin(g·d/v²)/2
  function _calcElevation(dist) {
    const v = CONFIG.SHELL_SPEED;
    const g = -CONFIG.SHELL_GRAVITY; // positive magnitude
    const maxRange = (v * v) / g;    // ~151m at current settings
    if (dist >= maxRange) return Math.PI / 4; // 45° = max range
    const inner = (g * dist) / (v * v);       // sin(2θ) = g·d/v²
    return 0.5 * Math.asin(inner);            // θ = asin(...)/2
  }

  function getInput(tank) {
    let throttle = _state.throttle;
    let steer = _state.steer;
    let turretSteer = _state.turretSteer;

    // WASD = hull movement
    if (_keys['KeyW'])     throttle =  1;
    if (_keys['KeyS'])     throttle = -1;
    if (_keys['KeyA'])     steer = -1;
    if (_keys['KeyD'])     steer =  1;
    // QE or ArrowLeft/Right = turret rotation
    if (_keys['KeyQ'] || _keys['ArrowLeft'])  turretSteer = -1;
    if (_keys['KeyE'] || _keys['ArrowRight']) turretSteer =  1;
    // ArrowUp/Down or right-joystick vertical = range adjust (farther / nearer)
    if (_keys['ArrowUp'])   { _state.targetDist = Math.min(120, _state.targetDist + 1.2); _updateRangeDisplay(); }
    if (_keys['ArrowDown']) { _state.targetDist = Math.max(15,  _state.targetDist - 1.2); _updateRangeDisplay(); }
    if (_state.turretVertical !== 0) {
      _state.targetDist = Math.min(120, Math.max(15, _state.targetDist + _state.turretVertical * 1.2));
      _updateRangeDisplay();
    }

    const elevation = _calcElevation(_state.targetDist);

    const shootNow = _state.shoot;
    _state.shoot = false; // consume

    return { throttle, steer, turretSteer, elevation, targetDist: _state.targetDist, shoot: shootNow };
  }

  return { init, getInput };
})();
