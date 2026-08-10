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

    // 被彩蛋秘技冻结（无法移动/瞄准/开火），用于保证「按下 fire 即可命中」
    this.frozen = false;

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
    const turretColor = (isPlayer || isAlly)
      ? new BABYLON.Color3(0.72, 0.74, 0.72)
      : new BABYLON.Color3(0.52, 0.50, 0.50);

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

    // Five-pointed star on hull top to mark the vehicle front direction
    const frontStar = (() => {
      const outerR = 0.275, innerR = 0.11, thickness = 0.05;
      const positions = [], indices = [], normals = [], uvs = [];

      // 10 perimeter vertices (alternating outer/inner tips) + 1 centre, top face
      // then same again for bottom face = 22 vertices total
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI / 5) - Math.PI / 2; // start pointing up (+Z)
        const r = i % 2 === 0 ? outerR : innerR;
        pts.push([Math.sin(a) * r, Math.cos(a) * r]); // XZ plane
      }

      // Top face (y = +thickness/2)
      const yt = thickness / 2;
      positions.push(0, yt, 0); normals.push(0,1,0); uvs.push(0.5,0.5); // centre idx 0
      for (const [x, z] of pts) {
        positions.push(x, yt, z); normals.push(0,1,0); uvs.push(x/outerR*0.5+0.5, z/outerR*0.5+0.5);
      }
      for (let i = 0; i < 10; i++) {
        indices.push(0, i + 1, ((i + 1) % 10) + 1);
      }

      // Bottom face (y = -thickness/2)
      const yb = -thickness / 2;
      const base = 11;
      positions.push(0, yb, 0); normals.push(0,-1,0); uvs.push(0.5,0.5); // centre idx 11
      for (const [x, z] of pts) {
        positions.push(x, yb, z); normals.push(0,-1,0); uvs.push(x/outerR*0.5+0.5, z/outerR*0.5+0.5);
      }
      for (let i = 0; i < 10; i++) {
        indices.push(base, base + ((i + 1) % 10) + 1, base + i + 1);
      }

      // Side quads connecting top and bottom perimeter
      for (let i = 0; i < 10; i++) {
        const t0 = i + 1, t1 = ((i + 1) % 10) + 1;
        const b0 = base + i + 1, b1 = base + ((i + 1) % 10) + 1;
        const vi = positions.length / 3;
        const [x0,z0] = pts[i], [x1,z1] = pts[(i+1)%10];
        const nx = (z0+z1)*0.5, nz = -(x0+x1)*0.5; // outward normal approx
        positions.push(x0,yt,z0, x1,yt,z1, x0,yb,z0, x1,yb,z1);
        normals.push(nx,0,nz, nx,0,nz, nx,0,nz, nx,0,nz);
        uvs.push(0,1, 1,1, 0,0, 1,0);
        indices.push(vi,vi+1,vi+2, vi+1,vi+3,vi+2);
      }

      const vd = new BABYLON.VertexData();
      vd.positions = positions; vd.indices = indices;
      vd.normals   = normals;   vd.uvs = uvs;

      const m = new BABYLON.Mesh('frontStar', scene);
      vd.applyToMesh(m);
      return m;
    })();

    frontStar.position.set(0, 0.72, 2.3);
    frontStar.parent = this.root;
    frontStar.isPickable = false;
    const starMat = new BABYLON.StandardMaterial('starMat_' + this.team, scene);
    starMat.diffuseColor = new BABYLON.Color3(1, 0.95, 0.1);
    starMat.emissiveColor = new BABYLON.Color3(0.9, 0.8, 0);
    starMat.backFaceCulling = false;
    frontStar.material = starMat;

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
      // Hull: full HP bright green → near-black green at low HP
      const g = 0.45 - dmg * 0.38;
      const rb = 0.15 - dmg * 0.13;
      hullColor   = new BABYLON.Color3(rb, g, rb);
      // Turret: light grey darkening with damage
      const grey = 0.72 - dmg * 0.58;
      turretColor = new BABYLON.Color3(grey, grey, grey);
    } else {
      // Full HP: mid red; high damage: deep dark red
      const r = 0.55 - dmg * 0.38;
      const gb = 0.12 - dmg * 0.10;
      hullColor   = new BABYLON.Color3(r, gb, gb);
      // Enemy turret: dark grey tinting red with damage
      const grey = 0.40 - dmg * 0.28;
      turretColor = new BABYLON.Color3(grey + gb * 0.5, grey * 0.85, grey * 0.85);
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
    if (this.frozen) return; // 冻结：整个状态机停摆

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
    if (!this.canShoot || !this.alive || this.frozen) return null;
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
