class TankAI {
  constructor(tank, team) {
    this.tank = tank;
    this.team = team; // 'ally' or 'enemy'
    this.state = 'ESCORT'; // ESCORT | ENGAGE | REGROUP
    this.target = null;
    this.shootTimer = 1500 + Math.random() * 1500;
    this.lostTargetTimer = 0;
    this.escortOffset = new BABYLON.Vector3(
      (Math.random() - 0.5) * CONFIG.ESCORT_FORM_OFFSET * 2,
      0,
      (Math.random() - 0.5) * CONFIG.ESCORT_FORM_OFFSET * 2
    );
  }

  _canSee(other, allTanks) {
    const dist = BABYLON.Vector3.Distance(this.tank.root.position, other.root.position);
    if (dist > CONFIG.ENGAGE_RANGE) return false;

    // Simple occlusion: check if terrain blocks line of sight (sample mid-point)
    const myPos = this.tank.root.position;
    const theirPos = other.root.position;
    const mid = myPos.add(theirPos).scale(0.5);
    const terrainAtMid = Terrain.getHeight(mid.x, mid.z) + 2;
    if (mid.y < terrainAtMid && myPos.y < terrainAtMid && theirPos.y < terrainAtMid) return false;

    return true;
  }

  _steerToward(targetPos, input) {
    const myPos = this.tank.root.position;
    const desired = Math.atan2(
      targetPos.x - myPos.x,
      targetPos.z - myPos.z
    );
    let diff = desired - this.tank.hullAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.steer = Math.sign(diff) * Math.min(1, Math.abs(diff) * 1.5);
    input.throttle = Math.max(0.3, Math.min(1, BABYLON.Vector3.Distance(myPos, targetPos) / 20));
  }

  _aimAt(targetPos, input) {
    const myPos = this.tank.root.position;
    const desired = Math.atan2(
      targetPos.x - myPos.x,
      targetPos.z - myPos.z
    );
    const worldTurretAngle = this.tank.hullAngle + this.tank.turretAngle;
    let diff = desired - worldTurretAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.turretSteer = Math.sign(diff) * Math.min(1, Math.abs(diff) * 2);

    // Elevation based on distance - same ballistic formula as player
    const dist = BABYLON.Vector3.Distance(myPos, targetPos);
    const _v = CONFIG.SHELL_SPEED;
    const _g = -CONFIG.SHELL_GRAVITY;
    const maxRange = (_v * _v) / _g;
    if (dist >= maxRange) {
      input.elevation = Math.PI / 4;
    } else {
      input.elevation = 0.5 * Math.asin((_g * dist) / (_v * _v));
    }
  }

  update(dt, playerTank, allTanks) {
    if (!this.tank.alive) return;

    const input = { throttle: 0, steer: 0, turretSteer: 0, elevation: this.tank.barrelElevation, shoot: false };

    const enemies = allTanks.filter(t =>
      t.alive && (this.team === 'ally' ? t.team === 'enemy' : t.team !== 'enemy')
    );

    const anchor = (this.team === 'ally') ? playerTank : null;
    const distToAnchor = anchor
      ? BABYLON.Vector3.Distance(this.tank.root.position, anchor.root.position)
      : 0;

    // State transitions
    if (this.state === 'ESCORT' || this.state === 'REGROUP') {
      // Scan for enemies
      for (const e of enemies) {
        if (this._canSee(e, allTanks)) {
          this.target = e;
          this.state = 'ENGAGE';
          this.lostTargetTimer = 0;
          break;
        }
      }
    }

    if (this.state === 'ENGAGE') {
      if (!this.target || !this.target.alive) {
        this.state = 'ESCORT';
        this.target = null;
      } else if (!this._canSee(this.target, allTanks)) {
        this.lostTargetTimer += dt * 1000;
        if (this.lostTargetTimer > 3000) {
          this.state = 'ESCORT';
          this.target = null;
          this.lostTargetTimer = 0;
        }
      } else {
        this.lostTargetTimer = 0;
      }
    }

    if (this.team === 'ally' && distToAnchor > CONFIG.REGROUP_RADIUS && this.state !== 'ENGAGE') {
      this.state = 'REGROUP';
    } else if (this.team === 'ally' && distToAnchor < CONFIG.ESCORT_RADIUS && this.state === 'REGROUP') {
      this.state = 'ESCORT';
    }

    // Enemy AI: always try to engage nearest target
    if (this.team === 'enemy' && this.state !== 'ENGAGE') {
      let nearest = null, nearDist = Infinity;
      for (const e of enemies) {
        const d = BABYLON.Vector3.Distance(this.tank.root.position, e.root.position);
        if (d < nearDist) { nearDist = d; nearest = e; }
      }
      if (nearest) { this.target = nearest; this.state = 'ENGAGE'; }
    }

    // Execute state
    if (this.state === 'ESCORT' && anchor) {
      const dest = anchor.root.position.add(this.escortOffset);
      const distToDest = BABYLON.Vector3.Distance(this.tank.root.position, dest);
      if (distToDest > 8) {
        this._steerToward(dest, input);
      }
      // Turret slowly scans
      input.turretSteer = 0.15;

    } else if (this.state === 'REGROUP' && anchor) {
      this._steerToward(anchor.root.position, input);
      input.throttle = 1;

    } else if (this.state === 'ENGAGE' && this.target) {
      const tPos = this.target.root.position;
      const dist = BABYLON.Vector3.Distance(this.tank.root.position, tPos);

      // Move: maintain optimal range
      if (dist > 80) {
        this._steerToward(tPos, input);
        input.throttle = 0.7;
      } else if (dist < 35) {
        // Too close, back off
        const away = this.tank.root.position.subtract(tPos).normalize();
        const awayTarget = this.tank.root.position.add(away.scale(30));
        this._steerToward(awayTarget, input);
        input.throttle = 0.5;
      } else {
        // Strafe
        input.throttle = 0.3;
        input.steer = Math.sin(Date.now() / 2000) * 0.6;
      }

      // Aim turret
      this._aimAt(tPos, input);

      // Shoot when roughly aimed
      const worldTurretAngle = this.tank.hullAngle + this.tank.turretAngle;
      const desiredAngle = Math.atan2(tPos.x - this.tank.root.position.x, tPos.z - this.tank.root.position.z);
      let aimDiff = Math.abs(desiredAngle - worldTurretAngle);
      while (aimDiff > Math.PI) aimDiff = Math.abs(aimDiff - Math.PI * 2);

      this.shootTimer -= dt * 1000;
      if (this.shootTimer <= 0 && aimDiff < 0.15 && this.tank.canShoot) {
        input.shoot = true;
        this.shootTimer = CONFIG.AI_SHOOT_INTERVAL_MIN +
          Math.random() * (CONFIG.AI_SHOOT_INTERVAL_MAX - CONFIG.AI_SHOOT_INTERVAL_MIN);
      }
    }

    this.tank.update(dt, input);

    if (input.shoot) {
      const shotData = this.tank.shoot();
      if (shotData) Projectiles.fire(shotData);
    }
  }
}
