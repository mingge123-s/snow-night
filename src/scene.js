import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applySnow, makeSnowMaterial } from './snowcover.js';
import { NOISE } from './glsl.js';
import { addProps } from './props.js';
import { addTrees } from './trees.js';
import { CABIN, LAMP, PATH, DOOR_LOCAL, WORLD, terrainHeight, pathDist, cabinToWorld, createTerrainTexture, createOcclusionTexture, createGround, fbm2 } from './terrain.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function woodTexture(rng, base, vertical, boards) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const a = 0.03 + rng() * 0.09;
      g.strokeStyle = rng() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,220,170,${a * 0.6})`;
      g.lineWidth = 0.5 + rng() * 1.5;
      g.beginPath();
      const p = rng() * w, q = rng() * h, len = 40 + rng() * 220;
      if (vertical) { g.moveTo(p, q); g.lineTo(p + (rng() - 0.5) * 3, q + len); } else { g.moveTo(q, p); g.lineTo(q + len, p + (rng() - 0.5) * 3); }
      g.stroke();
    }
    if (boards) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < boards; i++) {
        const p = (i / boards) * w;
        if (vertical) g.fillRect(p, 0, 3, h); else g.fillRect(0, p, w, 3);
      }
    }
  });
}

function windowTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.55, w * 0.75);
    gr.addColorStop(0, '#fff0c4'); gr.addColorStop(0.45, '#ffb65c'); gr.addColorStop(1, '#b85a1c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,50,20,0.35)';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w * 0.3, h * 0.1, w * 0.16, h); g.lineTo(0, h); g.fill();
    g.beginPath(); g.moveTo(w, 0); g.quadraticCurveTo(w * 0.7, h * 0.1, w * 0.84, h); g.lineTo(w, h); g.fill();
    g.fillStyle = 'rgba(40,20,10,0.5)'; g.fillRect(w * 0.3, h * 0.7, w * 0.4, h * 0.3);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function placeTrees(rng) {
  const trees = [
    { x: 2.6, z: -9.5, s: 11.5 }, { x: -11.5, z: -3.5, s: 9.5 }, { x: -9.5, z: -10.5, s: 13 },
    { x: 8.5, z: -6.5, s: 8.5 }, { x: -1.5, z: -12.5, s: 12 }, { x: 13.6, z: -3.2, s: 10 },
    { x: -15, z: 2.5, s: 8 }, { x: 14.5, z: -12, s: 12.5 },
  ];
  let guard = 0;
  while (trees.length < 380 && guard++ < 20000) {
    const r = 10 + 84 * Math.pow(rng(), 1.5), a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -1.5 && Math.hypot(x - 2, z - 8) < 24) continue;
    if (Math.hypot(x - CABIN.x, z - CABIN.z) < 6.8 || Math.hypot(x - LAMP.x, z - LAMP.z) < 5 || pathDist(x, z) < 4.5) continue;
    if (fbm2(x * 0.05 + 5, z * 0.05 + 9, 2) < 0.4 && r > 22) continue;
    const s = 6 + rng() * 8;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.s + s) * 0.17)) continue;
    trees.push({ x, z, s });
  }
  return trees;
}

export function buildScene(scene, U, quality) {
  const rng = mulberry32(20261112);
  const root = new THREE.Group();
  scene.add(root);

  // ---------- terrain ----------
  const trees = placeTrees(rng);
  U.uTerrain.value = createTerrainTexture(trees);
  U.uOcc.value = createOcclusionTexture(trees);
  root.add(createGround(U));

  // ---------- trees ----------
  addTrees({ root, trees, U, rng, quality });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---------- distant ridge ----------
  {
    const geo = new THREE.CylinderGeometry(WORLD * 0.497, WORLD * 0.497, 1, 160, 1, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, p.getY(i) > 0 ? 9 + 16 * fbm2(Math.cos(a) * 3 + 11, Math.sin(a) * 3 + 4, 4) : -4);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2428, roughness: 1, side: THREE.BackSide });
    root.add(new THREE.Mesh(geo, mat));
  }

  // ---------- far mountains ----------
  const mountU = { uHazeCol: { value: new THREE.Color() }, uHaze: { value: 0 } };
  {
    const SEG = 320, ROWS = 14, R = 430, pos = [], col = [], idx = [];
    const peak = (a) => {
      const x = Math.cos(a), z = Math.sin(a);
      const ridged = 1 - Math.abs(fbm2(x * 2.6 + 31, z * 2.6 + 17, 5) * 2 - 1);
      const big = fbm2(x * 1.1 + 3, z * 1.1 + 8, 3);
      const toward = 0.5 + 0.5 * (x * -0.5 + z * -0.86); // tallest behind the cabin
      return 20 + (48 + 100 * toward * toward) * Math.pow(ridged, 1.5) * (0.4 + 1.0 * big);
    };
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, hgt = peak(a);
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;
        const n = fbm2(Math.cos(a) * 9 + t * 3, Math.sin(a) * 9 - t * 2, 4) - 0.5;
        const r = R - 150 * (1 - t) + n * 46 * (1 - t), y = -12 + (hgt + 12) * Math.pow(t, 1.15) + n * 30 * t * (1 - t);
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        const snow = smooth(0.34, 0.62, t + n * 1.5 + (hgt - 60) * 0.004);
        const rock = 0.5 + n;
        col.push(0.035 + 0.02 * rock + 0.72 * snow, 0.045 + 0.022 * rock + 0.76 * snow, 0.06 + 0.02 * rock + 0.8 * snow);
        if (i < SEG && j < ROWS) { const k = i * (ROWS + 1) + j; idx.push(k, k + 1, k + ROWS + 1, k + 1, k + ROWS + 2, k + ROWS + 1); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, fog: false });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, mountU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol; uniform float uHaze;')
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, uHaze);');
    };
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -5;
    root.add(m);
  }

  const snowMat = makeSnowMaterial(U);
  const snowParts = []; // { mesh, max, base(y), k }

  // ---------- cabin ----------
  const cabin = new THREE.Group();
  cabin.position.set(CABIN.x, terrainHeight(CABIN.x, CABIN.z) - 0.08, CABIN.z);
  cabin.rotation.y = CABIN.rot;
  root.add(cabin);
  const W = CABIN.w, D = CABIN.d, BASE = 0.35, ROWS = 9, LOG = 0.3, WALL = BASE + ROWS * LOG;
  const PITCH = THREE.MathUtils.degToRad(40), OVER = 0.6, RIDGE = (D / 2) * Math.tan(PITCH);
  {
    const stone = applySnow(new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.95 }), U);
    const f = new THREE.Mesh(new THREE.BoxGeometry(W + 0.25, BASE + 0.3, D + 0.25), stone);
    f.position.y = (BASE - 0.3) / 2; f.castShadow = f.receiveShadow = true; cabin.add(f);

    const logTex = woodTexture(rng, '#5b3d27', true, 0);
    logTex.wrapS = logTex.wrapT = THREE.RepeatWrapping; logTex.repeat.set(1, 3);
    const logMat = applySnow(new THREE.MeshStandardMaterial({ map: logTex, color: 0xb89a80, roughness: 0.85 }), U);
    const logGeo = new THREE.CylinderGeometry(LOG * 0.54, LOG * 0.54, 1, 12);
    logGeo.rotateZ(Math.PI / 2);
    const logs = new THREE.InstancedMesh(logGeo, logMat, ROWS * 4);
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      const y = BASE + LOG / 2 + r * LOG;
      for (const s of [1, -1]) {
        q.identity(); v3.set(0, y, (s * D) / 2); sc.set(W + 0.55, 1, 1);
        logs.setMatrixAt(n++, m4.compose(v3, q, sc));
        q.setFromEuler(e.set(0, Math.PI / 2, 0)); v3.set((s * W) / 2, y + LOG / 2 - (r === ROWS - 1 ? LOG / 2 : 0), 0); sc.set(D + 0.55, 1, 1);
        logs.setMatrixAt(n++, m4.compose(v3, q, sc));
      }
    }
    logs.castShadow = logs.receiveShadow = true; cabin.add(logs);

    const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, WALL - BASE, D - 0.12), new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 }));
    inner.position.y = BASE + (WALL - BASE) / 2; inner.castShadow = true; cabin.add(inner);

    // gables
    const plank = woodTexture(rng, '#4a3222', true, 10);
    plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(0.5, 0.5);
    const gableMat = new THREE.MeshStandardMaterial({ map: plank, color: 0xa08a78, roughness: 0.9, side: THREE.DoubleSide });
    const shape = new THREE.Shape();
    shape.moveTo(-D / 2 - 0.1, 0); shape.lineTo(D / 2 + 0.1, 0); shape.lineTo(0, RIDGE + 0.08); shape.closePath();
    for (const s of [1, -1]) {
      const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), gableMat);
      g.rotation.y = Math.PI / 2; g.position.set((s * (W - 0.1)) / 2, WALL - 0.05, 0);
      g.castShadow = true; cabin.add(g);
    }

    // roof + snow slabs
    const roofMat = applySnow(new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.9 }), U, { bias: 0.4 });
    const slope = (D / 2 + OVER) / Math.cos(PITCH), RW = W + 1.1;
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, WALL + RIDGE + 0.02, 0);
      pivot.rotation.x = s * PITCH;
      cabin.add(pivot);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.12, slope), roofMat);
      slab.position.set(0, 0.05, (s * slope) / 2);
      slab.castShadow = slab.receiveShadow = true; pivot.add(slab);
      const snow = new THREE.Mesh(new RoundedBoxGeometry(RW + 0.16, 1, slope + 0.5, 5, 0.46), snowMat);
      snow.castShadow = snow.receiveShadow = true;
      pivot.add(snow);
      snowParts.push({ mesh: snow, max: 0.6, k: 0.95, set: (t) => { snow.scale.y = t; snow.position.set(0, 0.1 + t * 0.42, (s * (slope - 0.1)) / 2); } });
    }
    // ridge snow
    const ridge = new THREE.Mesh(new RoundedBoxGeometry(RW + 0.1, 1, 1.1, 5, 0.48), snowMat);
    ridge.castShadow = true; cabin.add(ridge);
    snowParts.push({ mesh: ridge, max: 0.6, k: 0.95, set: (t) => { ridge.scale.y = t * 1.15; ridge.position.set(0, WALL + RIDGE - 0.1 + t * 0.5, 0); } });

    // chimney
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.7, 0.62), stone);
    chim.position.set(-1.9, WALL + RIDGE + 0.15, -0.75); chim.castShadow = true; cabin.add(chim);
    const chimCap = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1, 0.78, 4, 0.36), snowMat);
    cabin.add(chimCap);
    snowParts.push({ mesh: chimCap, max: 0.32, k: 0.7, set: (t) => { chimCap.scale.y = t; chimCap.position.set(-1.9, WALL + RIDGE + 1.0 + t * 0.42, -0.75); } });

    // door
    const doorMat = applySnow(new THREE.MeshStandardMaterial({ map: woodTexture(rng, '#3a2618', true, 5), color: 0x9a8474, roughness: 0.8 }), U);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.0, 0.1), doorMat);
    door.position.set(DOOR_LOCAL[0], BASE + 1.0, D / 2 + LOG * 0.5); door.castShadow = true; cabin.add(door);
    const frameMat = applySnow(new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 }), U, { bias: 0.3 });
    const addFrame = (grp, w, h, t = 0.09, depth = 0.16) => {
      for (const [x, y, sx, sy] of [[0, h / 2 + t / 2, w + 2 * t, t], [0, -h / 2 - t / 2, w + 2 * t + 0.1, t * 1.2], [-w / 2 - t / 2, 0, t, h], [w / 2 + t / 2, 0, t, h]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, depth), frameMat);
        b.position.set(x, y, 0); b.castShadow = true; grp.add(b);
      }
    };
    const df = new THREE.Group(); df.position.copy(door.position); addFrame(df, 0.98, 2.0, 0.1, 0.2); cabin.add(df);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.9, roughness: 0.35 }));
    knob.position.set(DOOR_LOCAL[0] + 0.36, BASE + 0.98, D / 2 + LOG * 0.5 + 0.08); cabin.add(knob);
  }

  // windows
  const paneMat = new THREE.MeshBasicMaterial({ map: windowTexture(), color: new THREE.Color(2.4, 1.9, 1.3), fog: false });
  const frameMat2 = applySnow(new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 }), U, { bias: 0.4 });
  const addWindow = (x, y, z, rotY, w, h) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; cabin.add(g);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paneMat); pane.position.z = 0.02; g.add(pane);
    const t = 0.08;
    for (const [px, py, sx, sy, sz] of [[0, h / 2 + t / 2, w + 2 * t, t, 0.14], [0, -h / 2 - t / 2, w + 2 * t + 0.16, t * 1.3, 0.26], [-w / 2 - t / 2, 0, t, h, 0.14], [w / 2 + t / 2, 0, t, h, 0.14], [0, 0, 0.045, h, 0.07], [0, 0, w, 0.045, 0.07]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat2); b.position.set(px, py, sz / 2 - 0.02); b.castShadow = true; g.add(b);
    }
    const sill = new THREE.Mesh(new RoundedBoxGeometry(w + 0.36, 1, 0.34, 3, 0.16), snowMat); g.add(sill);
    snowParts.push({ mesh: sill, max: 0.16, k: 0.45, set: (tt) => { sill.scale.y = tt; sill.position.set(0, -h / 2 - 0.03 + tt * 0.4, 0.13); } });
    return g;
  };
  const winLocal = new THREE.Vector3(-1.35, BASE + 1.45, D / 2 + LOG * 0.5);
  addWindow(winLocal.x, winLocal.y, winLocal.z, 0, 1.35, 1.1);
  addWindow(W / 2 + LOG * 0.5, BASE + 1.45, 0.2, Math.PI / 2, 1.05, 1.0);

  const winLight = new THREE.SpotLight(0xffa860, 60, 18, 1.0, 1, 2);
  winLight.position.set(winLocal.x, winLocal.y + 0.1, winLocal.z + 0.25);
  winLight.target.position.set(winLocal.x - 0.6, -0.5, winLocal.z + 4.2);
  cabin.add(winLight, winLight.target);
  const sideLight = new THREE.SpotLight(0xffa860, 30, 12, 1.0, 1, 2);
  sideLight.position.set(W / 2 + 0.45, BASE + 1.5, 0.2);
  sideLight.target.position.set(W / 2 + 4, -0.5, 0.6);
  cabin.add(sideLight, sideLight.target);
  cabin.updateMatrixWorld(true);
  U.uWinPos.value.copy(winLocal).add(new THREE.Vector3(0, 0, 0.3)).applyMatrix4(cabin.matrixWorld);

  // ---------- street lamp ----------
  const lamp = new THREE.Group();
  const lampY = terrainHeight(LAMP.x, LAMP.z);
  lamp.position.set(LAMP.x, lampY - 0.1, LAMP.z);
  root.add(lamp);
  const H = LAMP.h;
  const iron = applySnow(new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.55, metalness: 0.6 }), U, { bias: 0.5 });
  const addIron = (geo, x, y, z) => { const m = new THREE.Mesh(geo, iron); m.position.set(x, y, z); m.castShadow = true; lamp.add(m); return m; };
  addIron(new THREE.CylinderGeometry(0.045, 0.07, H, 12), 0, H / 2, 0);
  addIron(new THREE.CylinderGeometry(0.11, 0.15, 0.7, 12), 0, 0.35, 0);
  addIron(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12), 0, 1.15, 0);
  addIron(new THREE.CylinderGeometry(0.17, 0.06, 0.12, 4), 0, H + 0.02, 0).rotation.y = Math.PI / 4;
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addIron(new THREE.BoxGeometry(0.018, 0.4, 0.018), x * 0.118, H + 0.27, z * 0.118);
  addIron(new THREE.ConeGeometry(0.27, 0.2, 4), 0, H + 0.56, 0).rotation.y = Math.PI / 4;
  addIron(new THREE.SphereGeometry(0.035, 8, 8), 0, H + 0.69, 0);
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.3, 1.5), fog: false });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.22), glassMat);
  glass.position.set(0, H + 0.27, 0); lamp.add(glass);
  const lampCap = new THREE.Mesh(new RoundedBoxGeometry(0.46, 1, 0.46, 4, 0.22), snowMat); lamp.add(lampCap);
  snowParts.push({ mesh: lampCap, max: 0.2, k: 0.5, set: (t) => { lampCap.scale.y = t; lampCap.position.set(0, H + 0.5 + t * 0.4, 0); } });

  const lampPos = new THREE.Vector3(LAMP.x, lampY - 0.1 + H + 0.25, LAMP.z);
  U.uLampPos.value.copy(lampPos);
  const lampColor = new THREE.Color(0xffb46a);
  const spot = new THREE.SpotLight(lampColor, 100, 45, 1.32, 0.85, 2);
  spot.position.set(0, H + 0.2, 0); spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(quality.shadow, quality.shadow);
  spot.shadow.camera.near = 0.4; spot.shadow.camera.far = 40; spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.03;
  lamp.add(spot, spot.target);
  const lampFill = new THREE.PointLight(lampColor, 10, 30, 2);
  lampFill.position.set(0, H + 0.3, 0); lamp.add(lampFill);

  const glowTex = glowTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lampColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  halo.position.set(0, H + 0.27, 0); halo.scale.setScalar(3); lamp.add(halo);

  const coneH = H + 0.3;
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: lampColor.clone() }, uInt: { value: 0.2 }, uH: { value: coneH }, uTime: U.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mv = viewMatrix * wp; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vY = position.y; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uInt; uniform float uH; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      ${NOISE}
      void main(){
        float d = uH * 0.5 - vY;
        float rim = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
        float fall = 1.0 / (0.25 + d * d * 0.42);
        float ground = smoothstep(0.0, 1.4, uH - d);
        float n = 0.75 + 0.5 * vnoise(vW * 1.4 + vec3(uTime * 0.25, -uTime * 0.5, 0.0));
        gl_FragColor = vec4(uColor * uInt * rim * fall * ground * n, 1.0);
      }`,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(coneH * 1.45, coneH, 56, 1, true), coneMat);
  cone.position.set(0, coneH / 2, 0); lamp.add(cone);

  // ---------- fence ----------
  {
    const wood = applySnow(new THREE.MeshStandardMaterial({ map: woodTexture(rng, '#4b3626', true, 0), color: 0x9a8878, roughness: 0.9 }), U, { bias: 0.45 });
    const runs = [[[-14.5, 4.6], [1.3, 6.6]], [[6.2, 7.2], [15.5, 5.2]]];
    const posts = [], railTops = [];
    for (const [[ax, az], [bx, bz]] of runs) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 1.95);
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
        posts.push({ x, z, y: terrainHeight(x, z), run: ax, last: i === n, lean: (rng() - 0.5) * 0.09 });
      }
    }
    const postGeo = new THREE.BoxGeometry(0.15, 1.5, 0.15); postGeo.translate(0, 0.45, 0);
    const pim = new THREE.InstancedMesh(postGeo, wood, posts.length);
    const capGeo = new RoundedBoxGeometry(0.3, 1, 0.3, 3, 0.15);
    const caps = new THREE.InstancedMesh(capGeo, snowMat, posts.length);
    posts.forEach((p, i) => {
      q.setFromEuler(e.set(p.lean, rng(), p.lean * 0.7)); v3.set(p.x, p.y, p.z); sc.set(1, 1, 1);
      pim.setMatrixAt(i, m4.compose(v3, q, sc));
      if (!p.last && posts[i + 1].run === p.run) {
        const nx = posts[i + 1];
        for (const hgt of [0.5, 0.92]) {
          const a = new THREE.Vector3(p.x, p.y + hgt, p.z), b = new THREE.Vector3(nx.x, nx.y + hgt + (rng() - 0.5) * 0.05, nx.z);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, a.distanceTo(b) + 0.1), wood);
          rail.position.copy(a).lerp(b, 0.5); rail.lookAt(b); rail.castShadow = rail.receiveShadow = true; root.add(rail);
          if (hgt > 0.9) railTops.push({ p: rail.position.clone(), q: rail.quaternion.clone(), len: a.distanceTo(b) - 0.12 });
        }
      }
    });
    pim.castShadow = pim.receiveShadow = true; root.add(pim);
    caps.castShadow = true; root.add(caps);
    snowParts.push({ mesh: caps, max: 0.22, k: 0.55, set: (t) => {
      posts.forEach((p, i) => { q.identity(); v3.set(p.x, p.y + 1.19 + t * 0.4, p.z); sc.set(1, t, 1); caps.setMatrixAt(i, m4.compose(v3, q, sc)); });
      caps.instanceMatrix.needsUpdate = true;
    } });
    const railSnow = new THREE.InstancedMesh(new RoundedBoxGeometry(0.13, 1, 1, 2, 0.064), snowMat, railTops.length);
    railSnow.castShadow = true; root.add(railSnow);
    snowParts.push({ mesh: railSnow, max: 0.13, k: 0.32, set: (t) => {
      railTops.forEach((r, i) => { v3.copy(r.p); v3.y += 0.05 + t * 0.4; sc.set(1, t, r.len); railSnow.setMatrixAt(i, m4.compose(v3, r.q, sc)); });
      railSnow.instanceMatrix.needsUpdate = true;
    } });
  }

  // ---------- sky ----------
  const skyU = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uStars: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(-0.42, 0.5, -0.76).normalize() }, uMoon: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Color() }, uTime: U.uTime,
    uTw: { value: 0 }, uAurora: { value: 0 }, uCloud: { value: 0 }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
    uCloudDrift: { value: new THREE.Vector2() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU, defines: { AUR_STEPS: quality.aur || 16 },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform float uStars; uniform vec3 uMoonDir; uniform float uMoon;
      uniform vec3 uSunDir; uniform vec3 uSun; uniform float uTime;
      uniform float uTw; uniform float uAurora; uniform float uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec2 uCloudDrift;
      varying vec3 vDir;
      ${NOISE}
      float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float n2(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + vec2(17.1, -9.7); a *= 0.5; } return v; }

      // Aurora: vertical curtains standing on a slowly folding line, sampled slab by slab up the ray.
      vec3 aurora(vec3 d){
        vec3 acc = vec3(0.0);
        float jit = h12(gl_FragCoord.xy + fract(uTime) * 61.0);
        float t = uTime;
        for (int i = 0; i < AUR_STEPS; i++) {
          float u = (float(i) + jit) / float(AUR_STEPS);
          float alt = 1.0 + u * 1.7;
          vec2 p = d.xz * (alt / (d.y + 0.1));
          p = vec2(p.x * 0.82 - p.y * 0.57, p.x * 0.57 + p.y * 0.82);
          float fold = n2(p * 0.33 + vec2(t * 0.012, 0.0)) * 2.4 + n2(p * 0.9 - vec2(0.0, t * 0.02)) * 0.7 + n2(p * 2.3 + vec2(t * 0.03)) * 0.16;
          float f = p.y * 0.42 + fold;
          float band = abs(fract(f * 0.62) - 0.5) * 2.0;
          float line = exp(-band * band * 55.0) + 0.35 * exp(-pow(abs(fract(f * 1.31 + 0.3) - 0.5) * 2.0, 2.0) * 60.0);
          float rays = 0.18 + 0.82 * pow(n2(vec2(p.x * 9.0 + fold * 6.0, t * 0.22 + p.y * 0.6)), 1.4);
          float patchy = smoothstep(0.3, 0.7, n2(p * 0.16 + vec2(t * 0.006, 4.0)));
          float prof = smoothstep(0.0, 0.1, u) * exp(-u * 3.4);
          vec3 col = mix(vec3(0.12, 1.0, 0.42), vec3(0.2, 0.55, 1.0), smoothstep(0.1, 0.55, u));
          col = mix(col, vec3(0.75, 0.2, 0.85), smoothstep(0.4, 1.0, u));
          acc += col * line * rays * patchy * prof;
        }
        float dist = length(d.xz) / (d.y + 0.1);
        return acc * (15.0 / float(AUR_STEPS)) * smoothstep(0.03, 0.22, d.y) * exp(-dist * 0.12);
      }

      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uTop, pow(h, 0.42));
        float sd = max(dot(d, uSunDir), 0.0);
        // twilight: orange towards the sun, a rose band above it and a mauve belt opposite
        float toward = dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
        float t2 = toward * toward;
        c += uTw * vec3(1.5, 0.52, 0.12) * exp(-h * mix(9.0, 4.2, t2)) * (0.08 + 0.92 * t2);
        c += uTw * vec3(0.75, 0.18, 0.3) * exp(-pow((h - 0.2) / 0.17, 2.0)) * (0.1 + 0.5 * t2);
        c += uTw * vec3(0.3, 0.12, 0.28) * exp(-pow((h - 0.13) / 0.1, 2.0)) * pow(1.0 - toward, 2.0);
        c += uSun * (pow(sd, 6.0) * 0.22 + pow(sd, 90.0) * 0.8 + smoothstep(0.99965, 0.9998, sd) * 30.0);
        vec3 qd = d * 190.0; vec3 id = floor(qd);
        float s = hash13(id);
        float star = step(0.9965, s) * smoothstep(0.42, 0.0, length(fract(qd) - 0.5));
        star *= 0.55 + 0.45 * sin(uTime * (1.0 + s * 3.0) + s * 60.0);
        c += vec3(0.8, 0.88, 1.0) * star * uStars * smoothstep(0.03, 0.3, d.y) * (0.5 + 3.0 * fract(s * 91.7));
        float md = dot(d, uMoonDir);
        c += uMoon * (smoothstep(0.99955, 0.9997, md) * vec3(5.0, 5.2, 5.6) + pow(max(md, 0.0), 300.0) * vec3(0.25, 0.3, 0.42) + pow(max(md, 0.0), 12.0) * vec3(0.012, 0.016, 0.03));
        if (uAurora > 0.004 && d.y > 0.02) c += aurora(d) * uAurora;
        if (uCloud > 0.01 && d.y > 0.0) {
          vec2 cp = d.xz / (d.y + 0.16);
          float n = fbm(cp * vec2(0.8, 1.7) + uCloudDrift);
          float wisp = fbm(cp * vec2(2.6, 6.0) + uCloudDrift * 2.3 + 9.0);
          float th = mix(0.8, 0.3, uCloud);
          float cl = smoothstep(th, th + 0.3, n + (wisp - 0.5) * 0.3);
          float thin = 1.0 - smoothstep(th, th + 0.42, n);
          vec3 lit = uCloudLit * (0.55 + 0.75 * pow(sd, 3.0) + 0.5 * thin);
          lit += uTw * (vec3(1.6, 0.42, 0.16) * t2 + vec3(0.5, 0.16, 0.3) * (1.0 - t2) * 0.5) * exp(-h * 2.2) * (0.5 + thin);
          vec3 cc = mix(uCloudDark, lit, 0.35 + 0.65 * thin);
          c = mix(c, cc, cl * smoothstep(0.0, 0.14, d.y) * 0.92);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.3);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.3);
  dir.castShadow = true;
  dir.shadow.mapSize.set(quality.shadow, quality.shadow);
  Object.assign(dir.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 });
  dir.shadow.bias = -0.0005; dir.shadow.normalBias = 0.06;
  scene.add(dir, dir.target);
  // broad, shadowless fills: the glowing horizon at dusk/dawn and the aurora overhead
  const glow = new THREE.DirectionalLight(0xff7a3c, 0), aurL = new THREE.DirectionalLight(0x2cff9a, 0);
  aurL.position.set(20, 60, -70);
  scene.add(glow, glow.target, aurL, aurL.target);
  scene.fog = new THREE.FogExp2(0x000000, 0.01);

  const P = (hex) => new THREE.Color(hex);
  const pal = {
    nTopC: P(0x03060f), nHorC: P(0x0b1426), nTopO: P(0x0c0f17), nHorO: P(0x1d212c),
    tTopC: P(0x1c2a5c), tHorC: P(0xb9735f), tTopO: P(0x2b3142), tHorO: P(0x5d5e6b),
    dTopC: P(0x3d76c6), dHorC: P(0xc6d9ee), dTopO: P(0x8d97a5), dHorO: P(0xc1c7cf),
    ambNC: new THREE.Color(0.30, 0.42, 0.80), ambNO: new THREE.Color(0.46, 0.50, 0.62),
    ambDC: new THREE.Color(0.55, 0.72, 1.0), ambDO: new THREE.Color(0.82, 0.88, 1.0),
    sunLow: P(0xff8a4a), sunHigh: P(0xfff0dc), moon: P(0x9bb6ff),
  };
  const cA = new THREE.Color(), cB = new THREE.Color(), top = new THREE.Color(), hor = new THREE.Color(), amb = new THREE.Color();
  const sunDir = new THREE.Vector3(), env = { dayF: 0, lampOn: 1, exposure: 1, overcast: 0, bloom: 0.4 };
  const cLit = new THREE.Color(), cDark = new THREE.Color(), AUR = new THREE.Color(0.1, 0.62, 0.36);
  const props = addProps({ root, cabin, U, rng, snowMat, snowParts, woodTexture, canvasTexture, dims: { W, D, WALL, RIDGE, OVER } });
  let lastDepth = -1, cloudT = 0;

  function update({ time, rate, haze, depth, camera, windMag, aurora = 0, cloud = 0, dt = 0, pxScale = 800 }) {
    const RISE = 7.3, SET = 17.0;
    let elev;
    if (time > RISE && time < SET) elev = Math.sin((Math.PI * (time - RISE)) / (SET - RISE)) * 27;
    else { const tn = time >= SET ? time - SET : time + 24 - SET; elev = -Math.sin((Math.PI * tn) / (24 - SET + RISE)) * 42; }
    const dayF = smooth(-7, 5, elev), tw = Math.exp(-((elev / 7) ** 2));
    const over = Math.min(1, rate / 1.8 + haze * 0.6);
    const lampOn = 1 - smooth(0.3, 0.65, dayF);

    top.copy(cA.copy(pal.nTopC).lerp(pal.nTopO, over)).lerp(cB.copy(pal.dTopC).lerp(pal.dTopO, over), dayF)
      .lerp(cA.copy(pal.tTopC).lerp(pal.tTopO, over), tw * 0.75);
    hor.copy(cA.copy(pal.nHorC).lerp(pal.nHorO, over)).lerp(cB.copy(pal.dHorC).lerp(pal.dHorO, over), dayF)
      .lerp(cA.copy(pal.tHorC).lerp(pal.tHorO, over), tw * 0.8);
    skyU.uTop.value.copy(top); skyU.uHorizon.value.copy(hor);
    skyU.uStars.value = (1 - dayF) * (1 - over) ** 2;
    skyU.uMoon.value = (1 - smooth(0, 0.4, dayF)) * (1 - over) ** 1.5;
    const clear = (1 - over) ** 2;
    const aur = aurora * (1 - smooth(0.02, 0.3, dayF)) * clear;
    skyU.uAurora.value = aur; skyU.uTw.value = tw * clear;
    skyU.uCloud.value = cloud * (1 - 0.85 * over);
    cloudT += dt * (0.004 + windMag * 0.0012);
    skyU.uCloudDrift.value.set(cloudT * 0.8, cloudT * 0.35);
    cLit.setRGB(0.05, 0.065, 0.1).lerp(cA.setRGB(0.95, 0.96, 1.0), dayF).lerp(cA.setRGB(0.95, 0.5, 0.3), tw * 0.8);
    cDark.copy(top).multiplyScalar(0.55).lerp(cA.setRGB(0.42, 0.47, 0.56), dayF).lerp(cA.setRGB(0.16, 0.11, 0.18), tw * 0.8);
    skyU.uCloudLit.value.copy(cLit); skyU.uCloudDark.value.copy(cDark);
    U.uSkyRef.value.copy(hor).lerp(top, 0.45).multiplyScalar(0.9).add(cA.copy(AUR).multiplyScalar(aur * 0.9));
    sky.position.copy(camera.position);

    amb.copy(cA.copy(pal.ambNC).lerp(pal.ambNO, over)).lerp(cB.copy(pal.ambDC).lerp(pal.ambDO, over), dayF);
    amb.add(cA.copy(AUR).multiplyScalar(aur * 0.2));
    const ambI = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.16, 0.26, over), THREE.MathUtils.lerp(1.5, 2.3, over), dayF) + aur * 0.03;
    hemi.color.copy(amb); hemi.groundColor.copy(amb).multiplyScalar(0.55); hemi.intensity = ambI;

    const dayT = (time - RISE) / (SET - RISE), az = THREE.MathUtils.degToRad(40 - 183 * Math.min(1.25, Math.max(-0.25, dayT))), el = THREE.MathUtils.degToRad(Math.max(elev, 0.5));
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const sunI = 4.2 * smooth(-1, 9, elev) * (1 - 0.92 * over);
    const moonI = 0.42 * (1 - smooth(0, 0.35, dayF)) * (1 - 0.9 * over);
    if (sunI >= moonI) {
      dir.color.copy(pal.sunLow).lerp(pal.sunHigh, smooth(2, 20, elev)); dir.intensity = sunI;
      dir.position.copy(sunDir).multiplyScalar(90);
    } else {
      dir.color.copy(pal.moon); dir.intensity = moonI;
      dir.position.copy(skyU.uMoonDir.value).multiplyScalar(90);
    }
    skyU.uSunDir.value.copy(sunDir);
    glow.position.set(sunDir.x, 0.16, sunDir.z).normalize().multiplyScalar(90);
    glow.intensity = 1.25 * tw * clear; aurL.intensity = 0.16 * aur;
    skyU.uSun.value.copy(pal.sunLow).lerp(pal.sunHigh, smooth(2, 20, elev)).multiplyScalar(smooth(-3, 4, elev) * (1 - over) ** 1.5);
    U.uDirCol.value.copy(dir.color).multiplyScalar(dir.intensity); U.uSunDir.value.copy(dir.position).normalize();

    const blow = smooth(6, 20, windMag) * smooth(0.0, 0.1, depth);
    const fogD = 0.0035 + haze * 0.022 + Math.min(rate, 8) * 0.0027 + blow * 0.008;
    scene.fog.density = fogD;
    scene.fog.color.copy(hor).lerp(amb, 0.0);
    mountU.uHazeCol.value.copy(hor).lerp(top, 0.25);
    mountU.uHaze.value = 1 - 0.9 * Math.exp(-((fogD * 150) ** 2));
    props.update({ depth, lampOn, ambient: amb, ambI, dirCol: U.uDirCol.value, pxScale });

    spot.intensity = 110 * lampOn; lampFill.intensity = 9 * lampOn;
    glassMat.color.setRGB(0.25 + 5 * lampOn, 0.2 + 3.3 * lampOn, 0.15 + 1.5 * lampOn);
    const air = Math.min(1, fogD * 22);
    halo.material.opacity = lampOn * (0.25 + 0.6 * air); halo.scale.setScalar(2.2 + 3.2 * air);
    coneMat.uniforms.uInt.value = lampOn * (0.03 + 0.42 * air);
    U.uLampCol.value.copy(lampColor).multiplyScalar(spot.intensity);
    const winOn = 0.3 + 0.7 * lampOn;
    winLight.intensity = 60 * winOn; sideLight.intensity = 30 * winOn;
    paneMat.color.setRGB(2.6 * winOn, 2.0 * winOn, 1.35 * winOn);
    U.uWinCol.value.set(1.0, 0.66, 0.38).multiplyScalar(winLight.intensity);

    if (Math.abs(depth - lastDepth) > 0.002) {
      lastDepth = depth;
      for (const p of snowParts) {
        const t = Math.min(p.max, depth * p.k);
        p.mesh.visible = t > 0.012;
        if (p.mesh.visible) p.set(t);
      }
    }
    Object.assign(env, { dayF, lampOn, overcast: over, exposure: THREE.MathUtils.lerp(1.2, 0.62, dayF), bloom: THREE.MathUtils.lerp(0.5, 0.1, dayF), fogD });
    env.fogColor = scene.fog.color; env.ambient = amb; env.ambI = ambI;
    return env;
  }

  return { update, lampPos, env };
}
