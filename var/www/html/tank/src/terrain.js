const Terrain = (() => {
  let _mesh = null;
  let _simplex = null;

  function _noise(x, z) {
    return _simplex.noise2D(x, z);
  }

  function getHeight(x, z) {
    if (!_simplex) return 0;
    const s = CONFIG.TERRAIN_SCALE;
    const h = CONFIG.TERRAIN_HEIGHT;
    return (
      _noise(x * s, z * s) * h * 0.6 +
      _noise(x * s * 0.4, z * s * 0.4) * h * 0.4 +
      _noise(x * s * 4, z * s * 4) * h * 0.08
    );
  }

  function getNormal(x, z) {
    const d = 0.5;
    const hL = getHeight(x - d, z);
    const hR = getHeight(x + d, z);
    const hD = getHeight(x, z - d);
    const hU = getHeight(x, z + d);
    const n = new BABYLON.Vector3(hL - hR, 2 * d, hD - hU);
    n.normalize();
    return n;
  }

  function create(scene) {
    _simplex = new SimplexNoise();

    const size = CONFIG.TERRAIN_SIZE;
    const segs = CONFIG.TERRAIN_SEGS;

    const ground = BABYLON.MeshBuilder.CreateGround('terrain', {
      width: size, height: size,
      subdivisions: segs,
      updatable: false
    }, scene);

    const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const colors = [];

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const h = getHeight(x, z);
      positions[i + 1] = h;

      // Color by height
      const t = (h + CONFIG.TERRAIN_HEIGHT) / (CONFIG.TERRAIN_HEIGHT * 2);
      if (t < 0.25) {
        colors.push(0.78, 0.65, 0.40, 1); // sand (low edges)
      } else if (t < 0.85) {
        colors.push(0.50, 0.63, 0.22, 1); // grass (most of map)
      } else {
        colors.push(0.60, 0.52, 0.38, 1); // light rock (only hilltops)
      }
    }

    ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, true);
    ground.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors);

    ground.convertToFlatShadedMesh();

    const mat = new BABYLON.StandardMaterial('terrainMat', scene);
    mat.vertexColorsEnabled = true;
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = mat;

    ground.checkCollisions = true;
    ground.isPickable = true;
    ground.metadata = { isTerrain: true };

    _mesh = ground;
    return ground;
  }

  return { create, getHeight, getNormal };
})();
