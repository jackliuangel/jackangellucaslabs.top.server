const UI = (() => {
  let _healthBar = null;
  let _healthText = null;
  let _reloadArc = null;
  let _fireBtn = null;
  let _allyScore = null;
  let _enemyScore = null;
  let _overlay = null;
  let _overlayTitle = null;
  let _overlaySub = null;
  let _crosshair = null;
  let _landingMarker = null;
  let _distLabel = null;

  function init(scene) {
    _healthBar = document.getElementById('health-bar');
    _healthText = document.getElementById('health-text');
    _reloadArc = document.getElementById('reload-arc');
    _fireBtn = document.getElementById('fire-btn');
    _allyScore = document.getElementById('ally-score');
    _enemyScore = document.getElementById('enemy-score');
    _overlay = document.getElementById('overlay');
    _overlayTitle = document.getElementById('overlay-title');
    _overlaySub = document.getElementById('overlay-sub');
    _crosshair = document.getElementById('crosshair');
    _distLabel = document.getElementById('range-display');

    document.getElementById('restart-btn').addEventListener('click', () => {
      location.reload();
    });

    // Landing marker: outer ring + inner dot
    _landingMarker = new BABYLON.TransformNode('landingRoot', scene);

    const ring = BABYLON.MeshBuilder.CreateTorus('landingRing', {
      diameter: 3.0, thickness: 0.25, tessellation: 24
    }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.parent = _landingMarker;
    ring.isPickable = false;
    const ringMat = new BABYLON.StandardMaterial('ringMat', scene);
    ringMat.diffuseColor = new BABYLON.Color3(0.1, 1, 0.1);
    ringMat.emissiveColor = new BABYLON.Color3(0, 0.9, 0.1);
    ringMat.alpha = 0.9;
    ring.material = ringMat;

    const dot = BABYLON.MeshBuilder.CreateDisc('landingDot', { radius: 0.35, tessellation: 12 }, scene);
    dot.rotation.x = Math.PI / 2;
    dot.parent = _landingMarker;
    dot.isPickable = false;
    const dotMat = new BABYLON.StandardMaterial('dotMat', scene);
    dotMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
    dotMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0);
    dotMat.alpha = 1.0;
    dot.material = dotMat;

    _landingMarker._ring = ring;
    _landingMarker._ringMat = ringMat;
  }

  function updateHealth(hp) {
    const pct = Math.max(0, hp / CONFIG.TANK_HP);
    _healthBar.style.width = (pct * 100) + '%';
    _healthBar.style.background = pct > 0.5
      ? 'linear-gradient(90deg,#5dfc6a,#2ecc40)'
      : pct > 0.25
        ? 'linear-gradient(90deg,#ffd700,#e6ac00)'
        : 'linear-gradient(90deg,#ff4444,#cc0000)';
    _healthText.textContent = Math.ceil(hp);
  }

  function updateReload(reloadTimer, canShoot) {
    const pct = canShoot ? 1 : Math.max(0, 1 - reloadTimer / CONFIG.RELOAD_TIME);
    const circumference = 113.1;
    _reloadArc.style.strokeDashoffset = circumference * (1 - pct);
    _reloadArc.style.stroke = canShoot ? '#5dfc6a' : '#f0a500';
    if (canShoot) {
      _fireBtn.classList.remove('disabled');
    } else {
      _fireBtn.classList.add('disabled');
    }
  }

  function updateCrosshair(stability) {
    const spread = (1 - stability) * 24 + 6;
    const lines = _crosshair.querySelectorAll('.ch-line');
    lines[0].style.top = (20 - spread) + 'px';     // top
    lines[1].style.bottom = (20 - spread) + 'px';  // bot
    lines[2].style.left = (20 - spread) + 'px';    // left
    lines[3].style.right = (20 - spread) + 'px';   // right
  }

  function updateLandingMarker(playerTank, targetDist, enemyTanks) {
    if (!_landingMarker) return;
    const pt = Projectiles.predictLandingPoint(playerTank);
    if (pt) {
      _landingMarker.position.copyFrom(pt);
      _landingMarker.position.y += 0.1;
      _landingMarker.getChildMeshes().forEach(m => m.isVisible = true);

      const dist = BABYLON.Vector3.Distance(playerTank.root.position, pt);
      const outOfRange = dist > CONFIG.ENGAGE_RANGE * 0.9;

      // Check if any enemy is within blast radius of landing point
      const willHit = enemyTanks && enemyTanks.some(t =>
        t.alive && BABYLON.Vector3.Distance(pt, t.root.position) < CONFIG.EXPLOSION_RADIUS
      );

      const rm = _landingMarker._ringMat;
      if (rm) {
        if (willHit) {
          // Orange/red flash: about to hit an enemy
          const flash = 0.5 + 0.5 * Math.sin(Date.now() / 80);
          rm.diffuseColor = new BABYLON.Color3(1, 0.3 + flash * 0.3, 0);
          rm.emissiveColor = new BABYLON.Color3(1, 0.2 + flash * 0.4, 0);
        } else if (outOfRange) {
          rm.diffuseColor = new BABYLON.Color3(1, 0.15, 0.15);
          rm.emissiveColor = new BABYLON.Color3(0.8, 0, 0);
        } else {
          rm.diffuseColor = new BABYLON.Color3(0.1, 1, 0.1);
          rm.emissiveColor = new BABYLON.Color3(0, 0.9, 0.1);
        }
      }

      const pulse = willHit
        ? 1 + Math.sin(Date.now() / 80) * 0.25   // fast big pulse when on target
        : 1 + Math.sin(Date.now() / 200) * 0.10;
      const s = (1 + (1 - playerTank.stability) * 1.5) * pulse;
      _landingMarker.scaling.setAll(s);

      if (_distLabel) {
        _distLabel.textContent = Math.round(dist) + 'm';
        _distLabel.style.color = willHit ? '#ffaa00' : outOfRange ? '#ff6666' : '#aaffaa';
      }
    } else {
      _landingMarker.getChildMeshes().forEach(m => m.isVisible = false);
      if (_distLabel) _distLabel.textContent = '';
    }
  }

  function updateScore(allyCount, enemyCount) {
    _allyScore.textContent = '● ' + allyCount;
    _enemyScore.textContent = '● ' + enemyCount;
  }

  function showResult(win, stats) {
    _overlayTitle.textContent = win ? '🏆 胜利！' : '💥 阵亡！';
    _overlayTitle.style.color = win ? '#5dfc6a' : '#ff4444';

    let sub = win ? '所有敌方坦克已被摧毁' : '你的坦克被击毁了';

    if (stats) {
      sub += `<br><br>`;
      sub += `<span style="color:#ffdd66">累计伤害：${Math.round(stats.totalDamage)} HP</span><br>`;
      if (stats.lastShotKills > 0) {
        sub += `<span style="color:#ff8844">击杀数：${stats.lastShotKills} 台敌方坦克</span>`;
      } else {
        sub += `<span style="color:#ffaa44">未击毁任何敌方坦克</span>`;
      }
    }

    _overlaySub.innerHTML = sub;
    _overlay.classList.add('show');
  }

  function onReloaded() {
    // Flash the fire button briefly
    _fireBtn.style.background = 'rgba(93,252,106,0.8)';
    setTimeout(() => { _fireBtn.style.background = ''; }, 300);
  }

  function hideTutorial() {
    const tut = document.getElementById('tutorial');
    tut.style.transition = 'opacity 0.6s';
    tut.style.opacity = '0';
    setTimeout(() => tut.style.display = 'none', 700);
  }

  return { init, updateHealth, updateReload, updateCrosshair, updateLandingMarker, updateScore, showResult, onReloaded, hideTutorial };
})();
