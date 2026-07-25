class Tank {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.team = options.team || 'enemy'; // 'player', 'ally', 'enemy'
    this.hp = CONFIG.TANK_HP;
    this.alive = true;

    // Physics state
    this.speed = 0;
    this.targetSpeed = 0;
    this.hullAngle = options.angle || 0;
    this.targetHullAngle = this.hullAngle;
    this.turretAngle = 0;
    this.targetTurretAngle = 0;
    this.barrelElevation = 0.18; // radians up
    this.targetBarrelElevation = 0.18;

    // Stability
    this.stability = 1.0; // 0=shaky, 1=steady
    this.shootDispersion = 0;

    // Reload
    this.reloadTimer = 0;
    this.canShoot = true;

    // Build mesh
    this._build(options.position || BABYLON.Vector3.Zero());
  }

  _build(pos) {
    const scene = this.scene;

    // Color scheme
    const isPlayer = this.team === 'player';
    const isAlly = this.team === 'ally';
    const hullColor = isPlayer
      ? new BABYLON.Color3(0.15, 0.45, 0.15)
      : isAlly
        ? new BABYLON.Color3(0.1, 0.5, 0.3)
        : new BABYLON.Color3(0.55, 0.12, 0.08);
    const turretColor = isPlayer
      ? new BABYLON.Color3(0.12, 0.38, 0.12)
      : isAlly
        ? new BABYLON.Color3(0.08, 0.42, 0.25)
        : new BABYLON.Color3(0.45, 0.1, 0.06);

    // Root transform (world position + hull rotation)
    this.root = new BABYLON.TransformNode('tank_root', scene);
    this.root.position = pos.clone();
    this.root.position.y = Terrain.getHeight(pos.x, pos.z) + 0.6;

    // Hull
    this.hullMesh = BABYLON.MeshBuilder.CreateBox('hull', {
      width: 3.2, height: 1.0, depth: 4.5
    }, scene);
    this.hullMesh.parent = this.root;
    this.hullMesh.position.y = 0.1;

    const hullMat = new BABYLON.StandardMaterial('hullMat_' + this.team, scene);
    hullMat.diffuseColor = hullColor;
    hullMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    this.hullMesh.material = hullMat;
    this.hullMesh.convertToFlatShadedMesh();

    // Left track
    this.trackL = BABYLON.MeshBuilder.CreateBox('trackL', {
      width: 0.6, height: 0.7, depth: 4.8
    }, scene);
    this.trackL.position.set(-1.9, -0.2, 0);
    this.trackL.parent = this.root;
    const trackMat = new BABYLON.StandardMaterial('trackMat', scene);
    trackMat.diffuseColor = new BABYLON.Color3(0.18, 0.18, 0.18);
    trackMat.specularColor = BABYLON.Color3.Black();
    this.trackL.material = trackMat;

    // Right track
    this.trackR = this.trackL.clone('trackR');
    this.trackR.position.set(1.9, -0.2, 0);
    this.trackR.parent = this.root;

    // Turret pivot
    this.turretPivot = new BABYLON.TransformNode('turret_pivot', scene);
    this.turretPivot.parent = this.root;
    this.turretPivot.position.y = 0.65;

    // Turret body
    this.turretMesh = BABYLON.MeshBuilder.CreateBox('turret', {
      width: 2.0, height: 0.7, depth: 2.4
    }, scene);
    this.turretMesh.parent = this.turretPivot;
    this.turretMesh.position.y = 0.15;

    const turMat = new BABYLON.StandardMaterial('turMat_' + this.team, scene);
    turMat.diffuseColor = turretColor;
    turMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    this.turretMesh.material = turMat;
    this.turretMesh.convertToFlatShadedMesh();

    // Barrel pivot (for elevation)
    this.barrelPivot = new BABYLON.TransformNode('barrel_pivot', scene);
    this.barrelPivot.parent = this.turretPivot;
    this.barrelPivot.position.set(0, 0.35, 0.2);

    // Barrel
    this.barrelMesh = BABYLON.MeshBuilder.CreateCylinder('barrel', {
      height: 2.8, diameter: 0.28, tessellation: 8
    }, scene);
    this.barrelMesh.rotation.x = Math.PI / 2;
    this.barrelMesh.position.z = 1.4;
    this.barrelMesh.parent = this.barrelPivot;
    const barrelMat = new BABYLON.StandardMaterial('barrelMat', scene);
    barrelMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
    barrelMat.specularColor = BABYLON.Color3.Black();
    this.barrelMesh.material = barrelMat;

    // Health bar above tank (for AI tanks)
    if (this.team !== 'player') {
      this._buildHealthBar(scene);
    }

    // Direction arrow — triangle pointing forward (+Z)
    const arrow = BABYLON.MeshBuilder.CreateCylinder('arrow', {
      height: 0.12, diameterTop: 0, diameterBottom: 1.4, tessellation: 3
    }, scene);
    arrow.rotation.y = Math.PI; // point toward +Z
    arrow.position.set(0, 0.66, 2.0);
    arrow.parent = this.root;
    arrow.isPickable = false;
    const arrowMat = new BABYLON.StandardMaterial('arrowMat_' + this.team, scene);
    arrowMat.diffuseColor = this.team === 'enemy'
      ? new BABYLON.Color3(1, 0.15, 0.15)
      : new BABYLON.Color3(0.15, 1, 0.3);
    arrowMat.emissiveColor = arrowMat.diffuseColor.scale(0.6);
    arrowMat.disableLighting = false;
    arrow.material = arrowMat;

    // Collision marker on hullMesh for projectile detection
    this.hullMesh.metadata = { tank: this };
  }

  _buildHealthBar(scene) {
    const plane = BABYLON.MeshBuilder.CreatePlane('hpPlane', { width: 3, height: 0.4 }, scene);
    plane.parent = this.root;
    plane.position.y = 3.5;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const dynTex = new BABYLON.DynamicTexture('hpTex', { width: 128, height: 20 }, scene);
    const mat = new BABYLON.StandardMaterial('hpMat', scene);
    mat.diffuseTexture = dynTex;
    mat.emissiveTexture = dynTex;
    mat.disableLighting = true;
    mat.useAlphaFromDiffuseTexture = true;
    plane.material = mat;

    this._hpTex = dynTex;
    this._hpPlane = plane;
    this._redrawHealthBar();
  }

  _redrawHealthBar() {
    if (!this._hpTex) return;
    const ctx = this._hpTex.getContext();
    const w = 128, h = 20;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, w, h);
    const pct = Math.max(0, this.hp / CONFIG.TANK_HP);
    ctx.fillStyle = pct > 0.5 ? '#5dfc6a' : pct > 0.25 ? '#ffd700' : '#ff4444';
    ctx.fillRect(0, 0, w * pct, h);
    this._hpTex.update();
  }

  getBarrelTip() {
    const fwd = new BABYLON.Vector3(0, 0, 1);
    const worldMatrix = this.barrelMesh.getWorldMatrix();
    const tip = BABYLON.Vector3.TransformCoordinates(
      new BABYLON.Vector3(0, 0, 2.8),
      worldMatrix
    );
    // Adjust for barrel elevation
    const elevDir = new BABYLON.Vector3(
      -Math.sin(this.barrelElevation) * Math.sin(this.hullAngle + this.turretAngle),
      Math.sin(this.barrelElevation),
      -Math.sin(this.barrelElevation) * Math.cos(this.hullAngle + this.turretAngle)
    );
    return this.root.position.add(
      new BABYLON.Vector3(
        Math.sin(this.hullAngle + this.turretAngle) * 3.5,
        1.1 + Math.sin(this.barrelElevation) * 1.5,
        Math.cos(this.hullAngle + this.turretAngle) * 3.5
      )
    );
  }

  getShootDirection() {
    const worldAngle = this.hullAngle + this.turretAngle;
    const dispersion = this.shootDispersion;
    const dx = (Math.random() - 0.5) * dispersion;
    const dz = (Math.random() - 0.5) * dispersion;
    return new BABYLON.Vector3(
      Math.sin(worldAngle) + dx,
      Math.sin(this.barrelElevation),
      Math.cos(worldAngle) + dz
    ).normalize();
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHealthBar();
    this._updateBodyColor();
    this._onHit(amount);
    if (this.hp <= 0) this.die();
  }

  _updateBodyColor() {
    const pct = Math.max(0, this.hp / CONFIG.TANK_HP); // 1.0 = full, 0.0 = dead
    const dmg = 1 - pct; // 0.0 = full, 1.0 = dead
    const isFriendly = this.team === 'player' || this.team === 'ally';

    let hullColor, turretColor;
    if (isFriendly) {
      // Full HP: bright green; low HP: very dark green (nearly black-green)
      const g = 0.45 - dmg * 0.38; // 0.45 → 0.07
      const rb = 0.15 - dmg * 0.13; // 0.15 → 0.02
      hullColor   = new BABYLON.Color3(rb, g, rb);
      turretColor = new BABYLON.Color3(rb * 0.8, g * 0.85, rb * 0.8);
    } else {
      // Full HP: mid red; high damage: deep dark red
      const r = 0.55 - dmg * 0.38; // 0.55 → 0.17
      const gb = 0.12 - dmg * 0.10; // 0.12 → 0.02
      hullColor   = new BABYLON.Color3(r, gb, gb);
      turretColor = new BABYLON.Color3(r * 0.82, gb * 0.85, gb * 0.85);
    }

    if (this.hullMesh && this.hullMesh.material)   this.hullMesh.material.diffuseColor   = hullColor;
    if (this.turretMesh && this.turretMesh.material) this.turretMesh.material.diffuseColor = turretColor;
  }

  _onHit(amount) {
    const scene = this.scene;
    const pos = this.root.position;

    // 1. Flash hull red, then restore to current damage color
    const meshes = [this.hullMesh, this.turretMesh];
    meshes.forEach(m => m.material.diffuseColor = new BABYLON.Color3(1, 0.1, 0.1));
    setTimeout(() => { this._updateBodyColor(); }, 180);

    // 2. Metal sparks
    for (let i = 0; i < 12; i++) {
      const spark = BABYLON.MeshBuilder.CreateSphere('spark', { diameter: 0.12 }, scene);
      spark.position.set(pos.x, pos.y + 1.5, pos.z);
      const mat = new BABYLON.StandardMaterial('sparkMat', scene);
      mat.diffuseColor = new BABYLON.Color3(1, 0.6 + Math.random() * 0.4, 0);
      mat.emissiveColor = new BABYLON.Color3(1, 0.5, 0);
      spark.material = mat;
      const vx = (Math.random() - 0.5) * 14;
      const vy = 4 + Math.random() * 8;
      const vz = (Math.random() - 0.5) * 14;
      let age = 0;
      const obs = scene.onBeforeRenderObservable.add(() => {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        age += dt;
        spark.position.x += vx * dt;
        spark.position.y += (vy - 18 * age) * dt;
        spark.position.z += vz * dt;
        mat.alpha = Math.max(0, 1 - age * 2.5);
        if (age > 0.5) { scene.onBeforeRenderObservable.remove(obs); spark.dispose(); }
      });
    }

    // 3. Floating damage number
    const plane = BABYLON.MeshBuilder.CreatePlane('dmgNum', { width: 2.5, height: 1.2 }, scene);
    plane.position.set(pos.x, pos.y + 4.5, pos.z);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    const tex = new BABYLON.DynamicTexture('dmgTex', { width: 128, height: 64 }, scene);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 42px Arial';
    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.strokeText('-' + Math.round(amount), 64, 48);
    ctx.fillText('-' + Math.round(amount), 64, 48);
    tex.update();
    const mat2 = new BABYLON.StandardMaterial('dmgMat', scene);
    mat2.diffuseTexture = tex;
    mat2.emissiveTexture = tex;
    mat2.useAlphaFromDiffuseTexture = true;
    mat2.disableLighting = true;
    mat2.backFaceCulling = false;
    plane.material = mat2;
    let age2 = 0;
    const obs2 = scene.onBeforeRenderObservable.add(() => {
      age2 += scene.getEngine().getDeltaTime() / 1000;
      plane.position.y += 2.5 * scene.getEngine().getDeltaTime() / 1000;
      mat2.alpha = Math.max(0, 1 - age2 * 1.4);
      if (age2 > 0.8) { scene.onBeforeRenderObservable.remove(obs2); plane.dispose(); tex.dispose(); }
    });
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    // Explosion effect will be triggered by game.js
    this.root.setEnabled(false);
  }

  update(dt, input) {
    if (!this.alive) return;

    // Inertia - speed
    const accel = input.throttle > 0 ? CONFIG.TANK_ACCEL : CONFIG.TANK_BRAKE;
    this.targetSpeed = input.throttle * CONFIG.TANK_MAX_SPEED;
    this.speed += (this.targetSpeed - this.speed) * accel * dt * 60;

    // Apply slope factor
    const terrainNormal = Terrain.getNormal(this.root.position.x, this.root.position.z);
    const slopeDot = BABYLON.Vector3.Dot(terrainNormal, BABYLON.Vector3.Up());
    const slopedSpeed = this.speed * (0.5 + slopeDot * 0.5);

    // Hull turn — direct, no inertia
    this.hullAngle += input.steer * CONFIG.TANK_TURN_RATE * dt * 60;
    this.targetHullAngle = this.hullAngle;

    // Turret turn — direct, no inertia
    this.turretAngle += input.turretSteer * CONFIG.TURRET_TURN_RATE * dt * 60;
    this.targetTurretAngle = this.turretAngle;

    // Barrel elevation
    if (input.elevation !== undefined) {
      this.targetBarrelElevation = Math.max(0.05, Math.min(0.6, input.elevation));
    }
    this.barrelElevation += (this.targetBarrelElevation - this.barrelElevation) * 0.08 * dt * 60;

    // Move
    this.root.position.x += Math.sin(this.hullAngle) * slopedSpeed * dt;
    this.root.position.z += Math.cos(this.hullAngle) * slopedSpeed * dt;

    // Clamp to terrain bounds
    const half = CONFIG.TERRAIN_SIZE * 0.48;
    this.root.position.x = Math.max(-half, Math.min(half, this.root.position.x));
    this.root.position.z = Math.max(-half, Math.min(half, this.root.position.z));

    // Snap to terrain height
    const th = Terrain.getHeight(this.root.position.x, this.root.position.z);
    this.root.position.y = th + 0.6;

    // Tilt to terrain normal
    const normal = terrainNormal;
    this.root.rotation.x += ((-normal.z * 0.6) - this.root.rotation.x) * 0.1 * dt * 60;
    this.root.rotation.z += ((normal.x * 0.6) - this.root.rotation.z) * 0.1 * dt * 60;

    // Apply hull rotation
    this.root.rotation.y = this.hullAngle;

    // Apply turret rotation (relative)
    this.turretPivot.rotation.y = this.turretAngle;

    // Apply barrel elevation
    this.barrelPivot.rotation.x = -this.barrelElevation;

    // Track UV scroll (simulate rolling)
    if (this.trackL.material) {
      if (!this._uvOffset) this._uvOffset = 0;
      this._uvOffset += slopedSpeed * dt * 0.15;
      this.trackL.material.uvOffset = new BABYLON.Vector2(0, this._uvOffset);
      this.trackR.material.uvOffset = new BABYLON.Vector2(0, this._uvOffset);
    }

    // Stability: moving = less stable
    const absSpeed = Math.abs(this.speed);
    const targetStab = 1.0 - absSpeed / CONFIG.TANK_MAX_SPEED * 0.7;
    this.stability += (targetStab - this.stability) * 0.02 * dt * 60;
    this.shootDispersion = (1 - this.stability) * 0.12;

    // Reload timer
    if (!this.canShoot) {
      this.reloadTimer -= dt * 1000;
      if (this.reloadTimer <= 0) {
        this.canShoot = true;
        if (this.team === 'player') {
          Audio.playReload();
          UI.onReloaded();
        }
      }
    }

    // Low-HP black smoke
    if (this.hp / CONFIG.TANK_HP < 0.3) {
      if (!this._smokeTimer) this._smokeTimer = 0;
      this._smokeTimer -= dt;
      if (this._smokeTimer <= 0) {
        this._smokeTimer = 0.18;
        this._spawnBlackSmoke();
      }
    }
  }

  _spawnBlackSmoke() {
    const scene = this.scene;
    const pos = this.root.position;
    const sphere = BABYLON.MeshBuilder.CreateSphere('bsmoke', { diameter: 0.6 + Math.random() * 0.5 }, scene);
    sphere.position.set(
      pos.x + (Math.random() - 0.5) * 1.2,
      pos.y + 1.8,
      pos.z + (Math.random() - 0.5) * 1.2
    );
    sphere.isPickable = false;
    const mat = new BABYLON.StandardMaterial('bsmokeMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    mat.alpha = 0.7;
    mat.backFaceCulling = false;
    sphere.material = mat;
    let age = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt2 = scene.getEngine().getDeltaTime() / 1000;
      age += dt2;
      sphere.position.y += 2.0 * dt2;
      sphere.position.x += (Math.random() - 0.5) * 0.3 * dt2;
      sphere.scaling.scaleInPlace(1 + 0.018);
      mat.alpha = Math.max(0, 0.7 - age * 1.0);
      if (age > 0.7) { scene.onBeforeRenderObservable.remove(obs); sphere.dispose(); }
    });
  }

  shoot() {
    if (!this.canShoot || !this.alive) return null;
    this.canShoot = false;
    this.reloadTimer = CONFIG.RELOAD_TIME;
    Audio.playShoot();
    return {
      position: this.getBarrelTip(),
      direction: this.getShootDirection(),
      shooter: this
    };
  }

  dispose() {
    this.root.dispose();
  }
}
