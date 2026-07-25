const Projectiles = (() => {
  const _shells = [];
  let _scene = null;
  let _particleTex = null;

  const stats = {
    totalDamage: 0,
    killsThisShot: 0,
    lastShotKills: 0,
    lastShotDamage: 0,
  };

  function init(scene) {
    _scene = scene;
  }

  function getStats() { return stats; }

  function _getParticleTex(scene) {
    if (_particleTex) return _particleTex;
    const tex = new BABYLON.DynamicTexture('ptex', { width: 32, height: 32 }, scene, false);
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    _particleTex = tex;
    return tex;
  }

  function _burst(emitter, scene, opts) {
    const ps = new BABYLON.ParticleSystem('ps', opts.capacity, scene);
    ps.particleTexture = _getParticleTex(scene);
    ps.emitter = emitter instanceof BABYLON.Vector3 ? emitter.clone() : emitter;
    ps.color1 = opts.color1;
    ps.color2 = opts.color2;
    ps.colorDead = opts.colorDead || new BABYLON.Color4(0, 0, 0, 0);
    ps.minSize = opts.minSize;
    ps.maxSize = opts.maxSize;
    ps.minLifeTime = opts.minLife;
    ps.maxLifeTime = opts.maxLife;
    ps.emitRate = opts.emitRate;
    ps.blendMode = opts.blend !== undefined ? opts.blend : BABYLON.ParticleSystem.BLENDMODE_ONEONE;
    ps.gravity = opts.gravity || BABYLON.Vector3.Zero();
    ps.direction1 = opts.dir1;
    ps.direction2 = opts.dir2;
    ps.minEmitPower = opts.minPower;
    ps.maxEmitPower = opts.maxPower;
    if (opts.minAngular !== undefined) {
      ps.minAngularSpeed = opts.minAngular;
      ps.maxAngularSpeed = opts.maxAngular;
    }
    ps.updateSpeed = 0.01;
    if (opts.duration) {
      ps.targetStopDuration = opts.duration;
      ps.disposeOnStop = true;
    }
    ps.start();
    return ps;
  }

  function _spawnMuzzleFlash(pos, scene) {
    _burst(pos, scene, {
      capacity: 40,
      color1: new BABYLON.Color4(1, 0.9, 0.3, 1),
      color2: new BABYLON.Color4(1, 0.5, 0.1, 1),
      colorDead: new BABYLON.Color4(0.5, 0.2, 0, 0),
      minSize: 0.2, maxSize: 0.9,
      minLife: 0.05, maxLife: 0.2,
      emitRate: 300,
      gravity: new BABYLON.Vector3(0, 2, 0),
      dir1: new BABYLON.Vector3(-3, 1, -3),
      dir2: new BABYLON.Vector3(3, 5, 3),
      minPower: 2, maxPower: 6,
      duration: 0.08,
    });
  }

  function _spawnExplosion(pos, scene) {
    // Fireball core
    _burst(pos, scene, {
      capacity: 200,
      color1: new BABYLON.Color4(1, 0.85, 0.1, 1),
      color2: new BABYLON.Color4(1, 0.3, 0.02, 1),
      colorDead: new BABYLON.Color4(0.15, 0, 0, 0),
      minSize: 1.2, maxSize: 4.0,
      minLife: 0.2, maxLife: 0.5,
      emitRate: 700,
      gravity: new BABYLON.Vector3(0, 4, 0),
      dir1: new BABYLON.Vector3(-6, 4, -6),
      dir2: new BABYLON.Vector3(6, 12, 6),
      minPower: 3, maxPower: 9,
      duration: 0.12,
    });

    // Rising black smoke (initial burst)
    _burst(pos, scene, {
      capacity: 160,
      color1: new BABYLON.Color4(0.28, 0.24, 0.22, 1.0),
      color2: new BABYLON.Color4(0.1, 0.09, 0.08, 0.8),
      colorDead: new BABYLON.Color4(0, 0, 0, 0),
      minSize: 4.0, maxSize: 9.0,
      minLife: 3.0, maxLife: 6.0,
      emitRate: 120,
      blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
      gravity: new BABYLON.Vector3(0, -0.3, 0),
      dir1: new BABYLON.Vector3(-2.0, 8, -2.0),
      dir2: new BABYLON.Vector3(2.0, 16, 2.0),
      minPower: 1.5, maxPower: 4,
      minAngular: -Math.PI, maxAngular: Math.PI,
      duration: 0.5,
    });

    // Lingering smoke column
    _burst(pos, scene, {
      capacity: 120,
      color1: new BABYLON.Color4(0.22, 0.2, 0.18, 0.85),
      color2: new BABYLON.Color4(0.45, 0.42, 0.38, 0.6),
      colorDead: new BABYLON.Color4(0, 0, 0, 0),
      minSize: 3.5, maxSize: 7.5,
      minLife: 4.0, maxLife: 8.0,
      emitRate: 25,
      blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
      gravity: new BABYLON.Vector3(0, -0.2, 0),
      dir1: new BABYLON.Vector3(-0.8, 10, -0.8),
      dir2: new BABYLON.Vector3(0.8, 18, 0.8),
      minPower: 0.8, maxPower: 2,
      minAngular: -Math.PI, maxAngular: Math.PI,
      duration: 3.5,
    });

    // Flying sparks / embers
    _burst(pos, scene, {
      capacity: 150,
      color1: new BABYLON.Color4(1, 1, 0.7, 1),
      color2: new BABYLON.Color4(1, 0.45, 0, 1),
      colorDead: new BABYLON.Color4(0.5, 0.1, 0, 0),
      minSize: 0.08, maxSize: 0.35,
      minLife: 0.6, maxLife: 1.8,
      emitRate: 500,
      gravity: new BABYLON.Vector3(0, -12, 0),
      dir1: new BABYLON.Vector3(-12, 8, -12),
      dir2: new BABYLON.Vector3(12, 22, 12),
      minPower: 6, maxPower: 16,
      duration: 0.1,
    });

    // Ground dust ring — radial low-angle spray
    _burst(pos, scene, {
      capacity: 200,
      color1: new BABYLON.Color4(0.78, 0.68, 0.52, 1.0),
      color2: new BABYLON.Color4(0.60, 0.52, 0.40, 0.8),
      colorDead: new BABYLON.Color4(0.3, 0.25, 0.18, 0),
      minSize: 2.0, maxSize: 5.5,
      minLife: 1.2, maxLife: 2.8,
      emitRate: 800,
      blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
      gravity: new BABYLON.Vector3(0, -1.5, 0),
      dir1: new BABYLON.Vector3(-10, 0.2, -10),
      dir2: new BABYLON.Vector3(10, 1.5, 10),
      minPower: 4, maxPower: 10,
      minAngular: -Math.PI, maxAngular: Math.PI,
      duration: 0.08,
    });
  }

  function _spawnGroundDust(pos, scene) {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const size = 0.5 + Math.random() * 1.75;
      const sphere = BABYLON.MeshBuilder.CreateSphere('gdust', { diameter: size, segments: 4 }, scene);
      sphere.position.set(
        pos.x + (Math.random() - 0.5) * 1.5,
        pos.y + 0.3,
        pos.z + (Math.random() - 0.5) * 1.5
      );
      sphere.isPickable = false;

      const mat = new BABYLON.StandardMaterial('gdustMat', scene);
      mat.diffuseColor = new BABYLON.Color3(
        0.60 + Math.random() * 0.20,
        0.50 + Math.random() * 0.15,
        0.28 + Math.random() * 0.10
      );
      mat.alpha = 0.85;
      mat.backFaceCulling = false;
      sphere.material = mat;

      const angle = Math.random() * Math.PI * 2;
      const hspeed = 2.5 + Math.random() * 7;
      const vx = Math.cos(angle) * hspeed;
      const vz = Math.sin(angle) * hspeed;
      const vy = 1 + Math.random() * 4;
      const maxAge = 0.8 + Math.random() * 1.4;
      let age = 0;

      const obs = scene.onBeforeRenderObservable.add(() => {
        const dt2 = scene.getEngine().getDeltaTime() / 1000;
        age += dt2;
        sphere.position.x += vx * dt2;
        sphere.position.y += (vy - 10 * age) * dt2;
        sphere.position.z += vz * dt2;
        sphere.scaling.scaleInPlace(1 + dt2 * 1.8);
        mat.alpha = Math.max(0, (1 - age / maxAge) * 0.85);
        if (age >= maxAge) {
          scene.onBeforeRenderObservable.remove(obs);
          sphere.dispose();
        }
      });
    }
  }

  function _createTrail(mesh, scene) {
    return _burst(mesh, scene, {
      capacity: 80,
      color1: new BABYLON.Color4(0.85, 0.75, 0.65, 0.7),
      color2: new BABYLON.Color4(0.55, 0.52, 0.5, 0.5),
      colorDead: new BABYLON.Color4(0, 0, 0, 0),
      minSize: 0.25, maxSize: 0.65,
      minLife: 0.3, maxLife: 0.9,
      emitRate: 55,
      blend: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
      gravity: new BABYLON.Vector3(0, 0.8, 0),
      dir1: new BABYLON.Vector3(-0.3, 0.2, -0.3),
      dir2: new BABYLON.Vector3(0.3, 1.2, 0.3),
      minPower: 0.1, maxPower: 0.4,
    });
  }

  function fire(options) {
    const { position, direction, shooter } = options;
    const scene = _scene;

    _spawnMuzzleFlash(position, scene);

    const mesh = BABYLON.MeshBuilder.CreateSphere('shell', { diameter: 1.2 }, scene);
    mesh.position = position.clone();
    const mat = new BABYLON.StandardMaterial('shellMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    mat.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    mesh.material = mat;

    const vel = direction.scale(CONFIG.SHELL_SPEED);
    const trail = _createTrail(mesh, scene);

    const shell = { mesh, vel, shooter, alive: true, age: 0, trail };
    _shells.push(shell);
    return shell;
  }

  function predictLandingPoint(tank) {
    const pos = tank.getBarrelTip().clone();
    const dir = tank.getShootDirection();
    const vel = dir.scale(CONFIG.SHELL_SPEED);
    const dt = 0.05;
    const maxSteps = 80;

    for (let i = 0; i < maxSteps; i++) {
      vel.y += CONFIG.SHELL_GRAVITY * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
      const th = Terrain.getHeight(pos.x, pos.z);
      if (pos.y <= th) {
        return new BABYLON.Vector3(pos.x, th + 0.05, pos.z);
      }
    }
    return null;
  }

  function update(dt, tanks, scene) {
    for (let i = _shells.length - 1; i >= 0; i--) {
      const s = _shells[i];
      if (!s.alive) { _shells.splice(i, 1); continue; }

      s.age += dt;
      if (s.age > 8) {
        if (s.trail) { s.trail.stop(); s.trail.disposeOnStop = true; }
        s.mesh.dispose();
        _shells.splice(i, 1);
        continue;
      }

      s.vel.y += CONFIG.SHELL_GRAVITY * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;

      const th = Terrain.getHeight(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y <= th) {
        _explode(s, tanks, scene, s.shooter, true);
        _shells.splice(i, 1);
        continue;
      }

      const dest = Destructibles.checkHit(s.mesh.position, 1.2);
      if (dest) {
        Destructibles.destroy(dest, scene);
        _explode(s, tanks, scene, s.shooter, true);
        _shells.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const tank of tanks) {
        if (!tank.alive) continue;
        if (tank === s.shooter) continue;
        if (s.shooter && s.shooter.team !== 'enemy' && tank.team !== 'enemy') continue;

        const dist = BABYLON.Vector3.Distance(s.mesh.position, tank.root.position);
        if (dist < 2.2) {
          _dealDamage(tank, CONFIG.SHELL_DAMAGE, s.shooter);
          _explode(s, tanks, scene, s.shooter);
          hit = true;
          break;
        }
      }
      if (hit) { _shells.splice(i, 1); }
    }
  }

  function _dealDamage(tank, amount, shooter) {
    if (!tank.alive) return;
    const hpBefore = tank.hp;
    tank.takeDamage(amount);
    if (shooter && shooter.team === 'player' && tank.team === 'enemy') {
      stats.totalDamage += Math.min(hpBefore, amount);
      if (!tank.alive) stats.lastShotKills++;
    }
  }

  function _explode(shell, tanks, scene, shooter, hitGround) {
    const pos = shell.mesh.position.clone();
    // Clamp to terrain surface so particles don't spawn underground
    const surfaceY = Terrain.getHeight(pos.x, pos.z);
    if (pos.y < surfaceY) pos.y = surfaceY;
    shell.alive = false;

    if (shell.trail) {
      shell.trail.emitter = pos;
      shell.trail.stop();
      shell.trail.disposeOnStop = true;
    }

    shell.mesh.dispose();
    _spawnExplosion(pos, scene);
    if (hitGround) _spawnGroundDust(pos, scene);
    Audio.playExplosion();

    const isPlayerShell = shooter && shooter.team === 'player';

    for (const tank of tanks) {
      if (!tank.alive) continue;
      const dist = BABYLON.Vector3.Distance(pos, tank.root.position);
      if (dist < CONFIG.EXPLOSION_RADIUS) {
        const force = (CONFIG.EXPLOSION_RADIUS - dist) / CONFIG.EXPLOSION_RADIUS;
        const dir = tank.root.position.subtract(pos).normalize();
        tank.speed += dir.x * force * 4;
        if (dist > 2.2) {
          const isFriendly = shooter && shooter.team !== 'enemy' && tank.team !== 'enemy';
          if (!isFriendly) {
            const blastDmg = Math.floor(CONFIG.SHELL_DAMAGE * force * force);
            if (blastDmg > 0) _dealDamage(tank, blastDmg, shooter);
          }
        }
      }
    }
  }

  return { init, fire, update, predictLandingPoint, getStats };
})();
