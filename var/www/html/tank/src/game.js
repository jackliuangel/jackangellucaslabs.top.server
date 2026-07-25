(() => {
  // --- Lobby ---
  let _allyCount = 3;
  let _enemyCount = 3;
  const MIN_COUNT = 1, MAX_COUNT = 8;

  const allyDisplay = document.getElementById('ally-count-display');
  const enemyDisplay = document.getElementById('enemy-count-display');

  document.querySelectorAll('.cnt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const delta = parseInt(btn.dataset.delta);
      if (target === 'ally') {
        _allyCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, _allyCount + delta));
        allyDisplay.textContent = _allyCount;
      } else {
        _enemyCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, _enemyCount + delta));
        enemyDisplay.textContent = _enemyCount;
      }
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('lobby').classList.add('hidden');
    _startGame(_allyCount, _enemyCount);
  });

  // --- Game ---
  function _startGame(allyTotal, enemyTotal) {
    const canvas = document.getElementById('gameCanvas');
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.45, 0.72, 0.92, 1);
    scene.gravity = new BABYLON.Vector3(0, -9.8, 0);
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogColor = new BABYLON.Color3(0.7, 0.83, 0.95);
    scene.fogStart = 180;
    scene.fogEnd = 290;

    // Lighting
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.6, -1, -0.4), scene);
    sun.intensity = 1.1;
    sun.diffuse = new BABYLON.Color3(1, 0.97, 0.88);

    const ambient = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0, 1, 0), scene);
    ambient.intensity = 0.5;
    ambient.diffuse = new BABYLON.Color3(0.7, 0.85, 1.0);
    ambient.groundColor = new BABYLON.Color3(0.45, 0.4, 0.3);

    // Systems init
    Terrain.create(scene);
    Destructibles.populate(scene);
    Projectiles.init(scene);
    Audio.init();
    Minimap.init();
    Controls.init();

    const camera = CameraSystem.init(scene, canvas);
    UI.init(scene);

    // Spawn player
    const playerTank = new Tank(scene, {
      team: 'player',
      position: new BABYLON.Vector3(0, 0, -30),
      angle: 0
    });

    // Spawn allies (allyTotal includes the player, so allies = allyTotal - 1)
    const allyTanks = [];
    const allySlots = allyTotal - 1;
    for (let i = 0; i < allySlots; i++) {
      const spread = (i - (allySlots - 1) / 2) * 14;
      allyTanks.push(new Tank(scene, {
        team: 'ally',
        position: new BABYLON.Vector3(spread, 0, -18),
        angle: (i % 2 === 0 ? 0.3 : -0.3)
      }));
    }

    // Spawn enemies
    const enemyTanks = [];
    for (let i = 0; i < enemyTotal; i++) {
      const spread = (i - (enemyTotal - 1) / 2) * 16;
      enemyTanks.push(new Tank(scene, {
        team: 'enemy',
        position: new BABYLON.Vector3(spread, 0, 65),
        angle: Math.PI + (i % 2 === 0 ? 0.3 : -0.3)
      }));
    }

    const allTanks = [playerTank, ...allyTanks, ...enemyTanks];
    const allyAIs = allyTanks.map(t => new TankAI(t, 'ally'));
    const enemyAIs = enemyTanks.map(t => new TankAI(t, 'enemy'));

    let gameOver = false;
    let tutorialDismissed = false;

    setTimeout(() => {
      if (!tutorialDismissed) { tutorialDismissed = true; UI.hideTutorial(); }
    }, 4000);
    ['keydown', 'touchstart', 'mousedown'].forEach(ev => {
      window.addEventListener(ev, () => {
        if (!tutorialDismissed) { tutorialDismissed = true; UI.hideTutorial(); Audio.resume(); }
      }, { once: true });
    });

    scene.registerBeforeRender(() => {
      if (gameOver) return;

      const dt = engine.getDeltaTime() / 1000;

      const input = Controls.getInput(playerTank);

      if (input.shoot) {
        const shotData = playerTank.shoot();
        if (shotData) Projectiles.fire(shotData);
      }

      playerTank.update(dt, input);
      Audio.setEngineSpeed(playerTank.speed);

      for (const ai of allyAIs) ai.update(dt, playerTank, allTanks);
      for (const ai of enemyAIs) ai.update(dt, playerTank, allTanks);

      // Tank-tank collision separation (XZ plane, circular approximation)
      const MIN_TANK_SEP = 5.5;
      for (let i = 0; i < allTanks.length; i++) {
        for (let j = i + 1; j < allTanks.length; j++) {
          const a = allTanks[i], b = allTanks[j];
          if (!a.alive || !b.alive) continue;
          const dx = b.root.position.x - a.root.position.x;
          const dz = b.root.position.z - a.root.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < MIN_TANK_SEP && dist > 0.01) {
            const push = (MIN_TANK_SEP - dist) * 0.5;
            const nx = dx / dist, nz = dz / dist;
            a.root.position.x -= nx * push;
            a.root.position.z -= nz * push;
            b.root.position.x += nx * push;
            b.root.position.z += nz * push;
          }
        }
      }

      Projectiles.update(dt, allTanks, scene);
      CameraSystem.update(playerTank);

      UI.updateHealth(playerTank.hp);
      UI.updateReload(playerTank.reloadTimer, playerTank.canShoot);
      UI.updateCrosshair(playerTank.stability);
      UI.updateLandingMarker(playerTank, input.targetDist, enemyTanks);

      const aliveAllies = [playerTank, ...allyTanks].filter(t => t.alive).length;
      const aliveEnemies = enemyTanks.filter(t => t.alive).length;
      UI.updateScore(aliveAllies, aliveEnemies);

      Minimap.update(playerTank, allTanks);

      if (!playerTank.alive) {
        gameOver = true;
        setTimeout(() => UI.showResult(false, Projectiles.getStats()), 800);
      } else if (aliveEnemies === 0) {
        gameOver = true;
        setTimeout(() => UI.showResult(true, Projectiles.getStats()), 800);
      }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', () => engine.resize());
  }
})();
