const Minimap = (() => {
  let _canvas = null;
  let _ctx = null;
  const SIZE = 160;
  const WORLD_RADIUS = 200;

  function init() {
    _canvas = document.getElementById('minimap');
    _canvas.width = SIZE;
    _canvas.height = SIZE;
    _ctx = _canvas.getContext('2d');
  }

  // Player-up rotating minimap:
  //   rx = dx*cos(h) - dz*sin(h)
  //   ry = -(dx*sin(h) + dz*cos(h))
  // Proof: enemy at (sin(h)*d, cos(h)*d) world → rx=0, ry=-d → canvas UP ✓
  function _worldToMap(wx, wz, cx, cz, h) {
    const scale = SIZE / (WORLD_RADIUS * 2);
    const dx = wx - cx;
    const dz = wz - cz;
    const rx =  dx * Math.cos(h) - dz * Math.sin(h);
    const ry = -(dx * Math.sin(h) + dz * Math.cos(h));
    return { x: rx * scale + SIZE / 2, y: ry * scale + SIZE / 2 };
  }

  function update(playerTank, allTanks) {
    if (!_ctx || !playerTank) return;
    const cx = playerTank.root.position.x;
    const cz = playerTank.root.position.z;
    const h  = playerTank.hullAngle;

    _ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    _ctx.fillStyle = 'rgba(20, 28, 20, 0.85)';
    _ctx.beginPath();
    _ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    _ctx.fill();

    // Clip to circle
    _ctx.save();
    _ctx.beginPath();
    _ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    _ctx.clip();

    // Draw tanks
    for (const tank of allTanks) {
      if (!tank.alive) continue;
      const mp = _worldToMap(tank.root.position.x, tank.root.position.z, cx, cz, h);

      if (mp.x < 0 || mp.x > SIZE || mp.y < 0 || mp.y > SIZE) continue;

      if (tank.team === 'player') {
        const ta = tank.turretAngle;

        // Turret FOV sector (red)
        // In player-up frame, turret direction = (-sin(ta), -cos(ta))
        // Derived from: north-up empirical dir (sin(h-ta), cos(h-ta)) → player-up transform
        const coneR = 22;
        const halfFOV = Math.PI * 35 / 180;
        const tArc = Math.atan2(-Math.cos(ta), Math.sin(ta));
        _ctx.save();
        _ctx.beginPath();
        _ctx.moveTo(mp.x, mp.y);
        _ctx.arc(mp.x, mp.y, coneR, tArc - halfFOV, tArc + halfFOV);
        _ctx.closePath();
        _ctx.fillStyle = 'rgba(255,80,80,0.28)';
        _ctx.fill();
        _ctx.strokeStyle = 'rgba(255,120,120,0.9)';
        _ctx.lineWidth = 1.2;
        _ctx.stroke();
        _ctx.restore();

        // Hull arrow — always points UP (player forward = top of minimap)
        _ctx.save();
        _ctx.fillStyle = '#5dfc6a';
        _ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        _ctx.lineWidth = 0.8;
        _ctx.beginPath();
        _ctx.moveTo(mp.x,       mp.y - 8);   // tip (UP)
        _ctx.lineTo(mp.x + 4.5, mp.y + 5);
        _ctx.lineTo(mp.x,       mp.y + 2.5);
        _ctx.lineTo(mp.x - 4.5, mp.y + 5);
        _ctx.closePath();
        _ctx.fill();
        _ctx.stroke();
        _ctx.restore();
      } else if (tank.team === 'ally') {
        _ctx.fillStyle = '#88ffaa';
        _ctx.beginPath();
        _ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
        _ctx.fill();
      } else if (tank.team === 'enemy') {
        const dist = Math.sqrt(
          (tank.root.position.x - cx) ** 2 + (tank.root.position.z - cz) ** 2
        );
        if (dist < CONFIG.ENGAGE_RANGE * 0.9) {
          _ctx.fillStyle = '#ff4444';
          _ctx.beginPath();
          _ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
          _ctx.fill();
        }
      }
    }

    _ctx.restore();

    // Border
    _ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    _ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    _ctx.stroke();

    // Forward indicator (top = player facing direction)
    _ctx.fillStyle = 'rgba(255,255,255,0.5)';
    _ctx.font = 'bold 10px Arial';
    _ctx.textAlign = 'center';
    _ctx.fillText('▲', SIZE / 2, 13);
  }

  return { init, update };
})();
