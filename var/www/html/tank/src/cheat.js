/**
 * 童年彩蛋 / Konami cheat: ↑↑↓↓←→←→AB  →  键盘为 W W S S A D A D A B
 *
 * 一次性输入秘技后，秘技模式「永久生效」（直到本局游戏结束）：
 * 1. 依次按下 W W S S A D A D A B → 播放 "ding" 提示音，秘技模式开启。
 * 2. 此后每次底盘操作（W/A/S/D 或左摇杆）都会触发瞬移：
 *    - 玩家坦克被随机传送到「第一辆存活敌方坦克」90 米半径内的位置；
 *    - 车头自动对准目标、炮塔每帧持续锁定，弹道仰角按真实地形精确求解；
 *    - 目标敌坦被冻结、散布强制归零、装填直接完成——每次开火必中；
 *    - 锁定期间玩家仍可自由操控底盘（炮塔会自动补偿瞄准）。
 * 3. 目标被摧毁后自动切换到下一辆存活敌坦继续锁定，全程无需重新输入秘技。
 */
const Cheat = (() => {
  const CODE = ['KeyW', 'KeyW', 'KeyS', 'KeyS', 'KeyA', 'KeyD', 'KeyA', 'KeyD', 'KeyA', 'KeyB'];

  const MIN_RADIUS = 25;        // 不贴脸出生；同时避开游戏最低仰角(0.05rad)的限制
  const MAX_RADIUS = 90;        // 需求：第一辆敌方坦克 90m 半径内
  const SPAWN_CLEAR = 8;        // 与其它坦克保持的最小间距
  const FREEZE_TARGET = true;   // 方案1：冻结目标，炮弹飞行期间敌坦不会躲开

  let _scene = null;
  let _player = null;
  let _enemies = [];
  let _tanks = [];

  let _buf = [];        // 按键序列缓冲
  let _active = false;  // 秘技模式：输入秘技后永久开启
  let _locked = null;   // 当前锁定的目标敌坦

  function init(scene, playerTank, enemyTanks, allTanks) {
    _scene = scene;
    _player = playerTank;
    _enemies = enemyTanks;
    _tanks = allTanks;
    window.addEventListener('keydown', _onKey, true);
    Controls.setHullInputHook(_onHullInput);
  }

  // ── 秘技输入 ──────────────────────────────────────────────────────────────
  function _onKey(e) {
    if (e.repeat) return;
    _buf.push(e.code);
    while (_buf.length > 0 && !_isPrefix(_buf)) _buf.shift(); // 只保留 CODE 的前缀后缀
    if (_buf.length === CODE.length) {
      _buf = [];
      _active = true; // 永久生效
      Audio.resume();
      Audio.playDing();
      console.log('%c[Cheat] ↑↑↓↓←→←→AB 秘技已永久开启 — 每次底盘操作都会瞬移到敌方坦克身边', 'color:#ffd700;font-weight:bold');
    }
  }

  function _isPrefix(arr) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== CODE[i]) return false;
    }
    return true;
  }

  function _onHullInput() {
    if (!_active) return;
    _teleport(); // 秘技模式下，每次底盘操作都瞬移
  }

  // ── 瞬移 ──────────────────────────────────────────────────────────────────
  function _teleport() {
    if (!_player || !_player.alive) return;
    // 第一辆敌方坦克；若已阵亡则退而求其次找第一辆存活的
    const target = _enemies.find(t => t.alive);
    if (!target) return; // 没有敌方坦克可锁定

    const spot = _pickSpot(target);
    if (!spot) return;

    // 若此前锁定的是另一辆坦克，解除其冻结
    if (_locked && _locked !== target && _locked.frozen) _locked.frozen = false;

    _player.root.position.set(spot.x, Terrain.getHeight(spot.x, spot.z) + 0.6, spot.z);
    _player.speed = 0;
    _player.targetSpeed = 0;

    _faceAndAim(target); // 车头对准 + 炮塔归零 + 弹道解算

    // 保证「按下 fire 即可命中」：直接装填完毕、散布归零
    _player.canShoot = true;
    _player.reloadTimer = 0;
    _player.stability = 1;
    _player.shootDispersion = 0;

    if (FREEZE_TARGET) target.frozen = true;
    _locked = target;

    console.log('%c[Cheat] 已瞬移并锁定目标 — 炮塔自动瞄准，开火必中', 'color:#ffd700');
  }

  // ── 瞄准 ──────────────────────────────────────────────────────────────────
  // 瞬移时：车头对准目标、炮塔归零，再解算弹道仰角
  function _faceAndAim(target) {
    const p = _player.root.position;
    const tp = target.root.position;
    const desired = Math.atan2(tp.x - p.x, tp.z - p.z);
    _player.hullAngle = desired;
    _player.targetHullAngle = desired;
    _player.turretAngle = 0;
    _player.targetTurretAngle = 0;
    _aimBarrel(target);
  }

  // 锁定帧：只旋转炮塔补偿（保留玩家对底盘的操控），并重新解算仰角
  function _trackTarget(target) {
    const p = _player.root.position;
    const tp = target.root.position;
    const desired = Math.atan2(tp.x - p.x, tp.z - p.z);
    let rel = desired - _player.hullAngle;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    _player.turretAngle = rel;
    _player.targetTurretAngle = rel;
    _aimBarrel(target);
  }

  function _aimBarrel(target) {
    const tp = target.root.position;
    const dist = Math.hypot(tp.x - _player.root.position.x, tp.z - _player.root.position.z);
    Controls.setTargetDist(dist); // 同步射程 UI，避免 getInput() 每帧改掉仰角
    const elev = _findElevation(_player, tp);
    _player.barrelElevation = elev;
    _player.targetBarrelElevation = elev;
  }

  // 在真实地形上用二分法求弹道仰角，使落点 ≈ 目标 xz
  function _findElevation(tank, targetPos) {
    const worldAngle = tank.hullAngle + tank.turretAngle;
    const tip = tank.getBarrelTip();
    const targetDist = Math.hypot(targetPos.x - tip.x, targetPos.z - tip.z);
    let lo = 0.05, hi = 0.6; // 与 tank.update 的仰角钳制范围一致
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const land = _simulate(tip, worldAngle, mid);
      if (!land) { hi = mid; continue; }
      const err = Math.hypot(land.x - targetPos.x, land.z - targetPos.z);
      if (err < 1.0) return mid;
      const fromTank = Math.hypot(land.x - tip.x, land.z - tip.z);
      if (fromTank < targetDist) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // 与 projectile.js 完全一致的弹道模拟（初速 55、重力 -20、真实地形高度）
  function _simulate(tip, worldAngle, elev) {
    const dir = new BABYLON.Vector3(Math.sin(worldAngle), Math.sin(elev), Math.cos(worldAngle)).normalize();
    const vel = dir.scale(CONFIG.SHELL_SPEED);
    const pos = tip.clone();
    const dt = 0.05;
    for (let i = 0; i < 120; i++) {
      vel.y += CONFIG.SHELL_GRAVITY * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
      if (pos.y <= Terrain.getHeight(pos.x, pos.z)) return pos;
    }
    return null;
  }

  // ── 每帧锁定（永久生效，直到目标被摧毁或游戏结束） ──────────────────────
  function update(playerTank) {
    if (!_active || !playerTank.alive) return;

    // 目标死亡 → 自动切换到下一辆存活敌坦，继续锁定
    if (!_locked || !_locked.alive) {
      const next = _enemies.find(t => t.alive);
      if (!next) return; // 敌方全灭
      _locked = next;
      if (FREEZE_TARGET) next.frozen = true;
    }

    _trackTarget(_locked);
    playerTank.shootDispersion = 0;
    playerTank.stability = 1;
  }

  // ── 出生点选择 ────────────────────────────────────────────────────────────
  function _pickSpot(target) {
    const t = target.root.position;
    const half = CONFIG.TERRAIN_SIZE * 0.48;
    let fallback = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
      const x = t.x + Math.sin(angle) * radius;
      const z = t.z + Math.cos(angle) * radius;
      if (Math.abs(x) > half || Math.abs(z) > half) continue; // 地图边界内
      if (!fallback) fallback = { x, z };
      if (!_clearOfTanks(x, z)) continue;
      if (!_clearOfObstacles(x, z)) continue;
      if (!_hasLOS(x, z, t.x, t.z)) continue;
      return { x, z };
    }
    return fallback;
  }

  function _clearOfTanks(x, z) {
    for (const tank of _tanks) {
      if (tank === _player || !tank.alive) continue;
      if (Math.hypot(tank.root.position.x - x, tank.root.position.z - z) < SPAWN_CLEAR) return false;
    }
    return true;
  }

  function _clearOfObstacles(x, z) {
    for (const item of Destructibles.getAll()) {
      if (!item.alive) continue;
      if (Math.hypot(item.position.x - x, item.position.z - z) < item.radius + 2.5) return false;
    }
    return true;
  }

  // 简单视线检查：弹道弧线全程高于直线，直线畅通即可认为能命中
  function _hasLOS(x0, z0, x1, z1) {
    const y0 = Terrain.getHeight(x0, z0) + 2.5; // 炮口高度近似
    const y1 = Terrain.getHeight(x1, z1) + 1.2; // 目标车身高度近似
    const STEPS = 12;
    for (let i = 1; i < STEPS; i++) {
      const t = i / STEPS;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (Terrain.getHeight(x, z) + 0.6 > y0 + (y1 - y0) * t) return false;
    }
    return true;
  }

  return { init, update };
})();
