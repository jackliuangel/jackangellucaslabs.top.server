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

  function _worldToMap(wx, wz, centerX, centerZ) {
    const scale = SIZE / (WORLD_RADIUS * 2);
    const mx = (wx - centerX) * scale + SIZE / 2;
    const mz = (wz - centerZ) * scale + SIZE / 2;
    return { x: mx, y: mz };
  }

  function update(playerTank, allTanks) {
    if (!_ctx || !playerTank) return;
    const cx = playerTank.root.position.x;
    const cz = playerTank.root.position.z;

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
      const mp = _worldToMap(tank.root.position.x, tank.root.position.z, cx, cz);

      if (mp.x < 0 || mp.x > SIZE || mp.y < 0 || mp.y > SIZE) continue;

      if (tank.team === 'player') {
        // Green arrow with hull direction
        _ctx.save();
        _ctx.translate(mp.x, mp.y);
        _ctx.rotate(tank.hullAngle);
        _ctx.fillStyle = '#5dfc6a';
        _ctx.beginPath();
        _ctx.moveTo(0, -7);
        _ctx.lineTo(4, 5);
        _ctx.lineTo(0, 2);
        _ctx.lineTo(-4, 5);
        _ctx.closePath();
        _ctx.fill();
        _ctx.restore();
      } else if (tank.team === 'ally') {
        _ctx.fillStyle = '#88ffaa';
        _ctx.beginPath();
        _ctx.arc(mp.x, mp.y, 4, 0, Math.PI * 2);
        _ctx.fill();
      } else if (tank.team === 'enemy') {
        // Only show if player can roughly see them (simple distance + not behind big hill)
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

    // Compass N
    _ctx.fillStyle = 'rgba(255,255,255,0.6)';
    _ctx.font = 'bold 10px Arial';
    _ctx.textAlign = 'center';
    _ctx.fillText('N', SIZE / 2, 13);
  }

  return { init, update };
})();
