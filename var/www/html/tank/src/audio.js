const Audio = (() => {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let enabled = false;

  let _engineLoopSrc = null;
  let _engineLoopGain = null;
  let _engineFilter = null;

  function _buildEngineLoop() {
    // 2-second looping noise buffer, filtered to a deep rumble
    const seconds = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // Very narrow low-pass: only deep rumble passes through
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 80;
    lp.Q.value = 2.0;

    // Second stage for extra warmth
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 60;
    lp2.Q.value = 1.0;

    const g = ctx.createGain();
    g.gain.value = 0; // start silent, ramp up on movement

    src.connect(lp);
    lp.connect(lp2);
    lp2.connect(g);
    g.connect(ctx.destination);
    src.start();

    _engineLoopSrc = src;
    _engineLoopGain = g;
    _engineFilter = lp;
  }

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      _buildEngineLoop();
      enabled = true;
    } catch(e) {
      console.warn('Audio unavailable', e);
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setEngineSpeed(speed) {
    if (!enabled || !_engineLoopGain) return;
    const absSpeed = Math.abs(speed);
    // Silent when still, soft deep rumble when moving
    const vol = absSpeed < 0.5 ? 0 : 0.04 + (absSpeed / CONFIG.TANK_MAX_SPEED) * 0.08;
    _engineLoopGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.3);
    // Slightly open the filter at higher speed
    _engineFilter.frequency.setTargetAtTime(60 + absSpeed * 4, ctx.currentTime, 0.2);
  }

  function _burst(freq, duration, type = 'sine', volume = 0.3) {
    if (!enabled) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(volume, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  }

  function _noise(duration, volume = 0.3) {
    if (!enabled) return;
    try {
      const bufSize = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      src.connect(g); g.connect(ctx.destination);
      src.start();
    } catch(e) {}
  }

  function playShoot() {
    if (!enabled) return;
    // Sharp crack: very short high-volume noise burst (the muzzle blast)
    _noiseShaped(0.08, 1.0, 0.0);
    // Low boom tail that fades
    _burst(55, 0.9, 'sine', 0.7);
    _burst(30, 1.1, 'sine', 0.5);
    // High-freq crack component
    _noiseShaped(0.04, 0.6, 0.01);
  }

  function playExplosion() {
    if (!enabled) return;
    // Big low thud
    _burst(35 + Math.random() * 15, 1.2, 'sine', 0.9);
    _burst(25, 1.5, 'sine', 0.7);
    // Rumble noise
    _noiseShaped(0.15, 1.0, 0.0);
    _noiseShaped(0.8, 0.55, 0.05);
    // Debris high freq
    setTimeout(() => _noiseShaped(0.25, 0.3, 0.0), 120);
  }

  // Noise burst with attack delay: instant peak then exponential decay
  function _noiseShaped(duration, volume, attackDelay) {
    if (!enabled) return;
    try {
      const bufSize = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

      // Low-pass filter to make it boomier
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.8;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t = ctx.currentTime + attackDelay;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    } catch(e) {}
  }

  function playMetalHit(intensity = 0.5) {
    if (!enabled) return;
    _burst(600 + Math.random() * 400, 0.12, 'square', intensity * 0.3);
  }

  function playReload() {
    if (!enabled) return;
    _burst(800, 0.06, 'square', 0.2);
    setTimeout(() => _burst(1000, 0.06, 'square', 0.15), 80);
  }

  // 童年秘技提示音：清脆的 "ding"（钟铃般的高音 + 泛音，快速衰减）
  function playDing() {
    if (!enabled) return;
    resume(); // 键盘输入属于用户手势，确保 AudioContext 已运行
    _burst(1567.98, 0.9, 'sine', 0.32);  // G6 主音
    _burst(2093.00, 0.7, 'sine', 0.16);  // C7 泛音
    _burst(2637.02, 0.5, 'sine', 0.08);  // E7 高泛音
  }

  return { init, resume, setEngineSpeed, playShoot, playExplosion, playMetalHit, playReload, playDing };
})();
