const Destructibles = (() => {
  const _list = [];

  function _makeTree(scene, x, z) {
    const h = Terrain.getHeight(x, z);
    const root = new BABYLON.TransformNode('tree', scene);
    root.position.set(x, h, z);

    const trunkH = 1.5 + Math.random() * 1.5;
    const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk', {
      height: trunkH, diameterTop: 0.3, diameterBottom: 0.5, tessellation: 5
    }, scene);
    trunk.position.y = trunkH / 2;
    trunk.parent = root;

    const foliageLayers = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < foliageLayers; i++) {
      const r = 1.8 - i * 0.4 + Math.random() * 0.4;
      const cone = BABYLON.MeshBuilder.CreateCylinder('foliage', {
        height: r * 1.6, diameterTop: 0, diameterBottom: r * 2, tessellation: 6
      }, scene);
      cone.position.y = trunkH + i * (r * 0.5);
      cone.parent = root;
      const mat = new BABYLON.StandardMaterial('foliageMat', scene);
      const g = 0.45 + Math.random() * 0.25;
      mat.diffuseColor = new BABYLON.Color3(0.15 + Math.random() * 0.1, g, 0.1);
      mat.specularColor = BABYLON.Color3.Black();
      cone.material = mat;
    }

    const trunkMat = new BABYLON.StandardMaterial('trunkMat', scene);
    trunkMat.diffuseColor = new BABYLON.Color3(0.45, 0.3, 0.15);
    trunkMat.specularColor = BABYLON.Color3.Black();
    trunk.material = trunkMat;

    trunk.convertToFlatShadedMesh && trunk.convertToFlatShadedMesh();

    const item = {
      root, trunk, alive: true,
      type: 'tree',
      position: new BABYLON.Vector3(x, h, z),
      radius: 1.0
    };
    _list.push(item);
    return item;
  }

  function _makeRock(scene, x, z) {
    const h = Terrain.getHeight(x, z);
    const s = 1.5 + Math.random() * 2.5;
    const rock = BABYLON.MeshBuilder.CreatePolyhedron('rock', {
      type: 1, size: s * 0.5
    }, scene);
    rock.position.set(x, h + s * 0.3, z);
    rock.rotation.y = Math.random() * Math.PI * 2;

    const mat = new BABYLON.StandardMaterial('rockMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.5 + Math.random() * 0.2, 0.48, 0.44);
    mat.specularColor = BABYLON.Color3.Black();
    rock.material = mat;
    rock.convertToFlatShadedMesh && rock.convertToFlatShadedMesh();

    const item = {
      root: rock, alive: true,
      type: 'rock',
      position: new BABYLON.Vector3(x, h, z),
      radius: s * 0.6,
      isObstacle: true
    };
    rock.metadata = { isObstacle: true };
    _list.push(item);
    return item;
  }

  function populate(scene) {
    const half = CONFIG.TERRAIN_SIZE * 0.46;
    const TREES = 80, ROCKS = 30;

    for (let i = 0; i < TREES; i++) {
      const x = (Math.random() - 0.5) * half * 2;
      const z = (Math.random() - 0.5) * half * 2;
      if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;
      _makeTree(scene, x, z);
    }

    for (let i = 0; i < ROCKS; i++) {
      const x = (Math.random() - 0.5) * half * 2;
      const z = (Math.random() - 0.5) * half * 2;
      if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;
      _makeRock(scene, x, z);
    }
  }

  function checkHit(pos, radius) {
    for (const item of _list) {
      if (!item.alive) continue;
      const d = BABYLON.Vector3.Distance(pos, item.position);
      if (d < radius + item.radius) return item;
    }
    return null;
  }

  function destroy(item, scene) {
    if (!item.alive) return;
    item.alive = false;

    if (item.type === 'tree') {
      // Tip the tree over
      const root = item.root;
      let angle = 0;
      const fallDir = Math.random() * Math.PI * 2;
      const iv = setInterval(() => {
        angle += 0.08;
        root.rotation.x = Math.sin(fallDir) * Math.min(angle, Math.PI / 2);
        root.rotation.z = Math.cos(fallDir) * Math.min(angle, Math.PI / 2);
        if (angle >= Math.PI / 2) {
          clearInterval(iv);
          setTimeout(() => root.getChildMeshes().forEach(m => m.dispose()), 3000);
        }
      }, 16);
    } else {
      setTimeout(() => item.root.dispose(), 100);
    }
  }

  function getAll() { return _list; }

  return { populate, checkHit, destroy, getAll };
})();
