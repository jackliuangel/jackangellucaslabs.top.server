const CameraSystem = (() => {
  let _camera = null;
  let _camYaw = 0;

  function init(scene, canvas) {
    _camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 30, -30), scene);
    _camera.minZ = 0.5;
    _camera.maxZ = 600;
    return _camera;
  }

  function update(tank) {
    if (!_camera || !tank) return;
    // Lag camera yaw toward turret world angle
    const turretWorldAngle = tank.hullAngle + tank.turretAngle;
    _camYaw += (turretWorldAngle - _camYaw) * CONFIG.CAM_LAG * 2;

    const dist = CONFIG.CAM_DIST;
    const height = CONFIG.CAM_HEIGHT;
    const tx = tank.root.position.x;
    const ty = tank.root.position.y;
    const tz = tank.root.position.z;

    const camX = tx - Math.sin(_camYaw) * dist;
    const camZ = tz - Math.cos(_camYaw) * dist;
    const camY = ty + height;

    _camera.position.x += (camX - _camera.position.x) * 0.08;
    _camera.position.y += (camY - _camera.position.y) * 0.08;
    _camera.position.z += (camZ - _camera.position.z) * 0.08;

    _camera.setTarget(new BABYLON.Vector3(tx, ty + 2, tz));
  }

  return { init, update };
})();
