import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applySnow } from './snowcover.js';
import { POND, terrainHeight, snowGain, cabinToWorld } from './terrain.js';

// Yard details: snowman, bench, woodpile, sled, snow gauge, pond rocks, eave lights and chimney smoke.
export function addProps({ root, cabin, U, rng, snowMat, snowParts, woodTexture, canvasTexture, dims }) {
  const { W, D, WALL, RIDGE, OVER } = dims;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const floats = []; // things that sit on top of the snowpack and rise with it
  const add = (parent, geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (shadow) m.castShadow = m.receiveShadow = true;
    parent.add(m); return m;
  };
  const cap = (parent, geo, max, k, place) => {
    const m = new THREE.Mesh(geo, snowMat); m.castShadow = m.receiveShadow = true; parent.add(m);
    snowParts.push({ mesh: m, max, k, set: (t) => place(m, t) });
    return m;
  };
  const floating = (x, z, sink, rotY) => {
    const g = new THREE.Group(); g.position.set(x, terrainHeight(x, z), z); g.rotation.y = rotY; root.add(g);
    floats.push({ g, base: terrainHeight(x, z), gain: snowGain(x, z), sink });
    return g;
  };

  // ---------- snowman ----------
  {
    const g = floating(-3.4, 2.3, 0.72, 0.75); g.userData.needsSnow = true;
    const balls = [[0.52, 0.4], [0.38, 1.08], [0.255, 1.6]];
    for (const [r, y] of balls) {
      const b = add(g, new THREE.SphereGeometry(r, 28, 20), snowMat, 0, y, 0);
      b.scale.set(1, 0.92, 1);
    }
    const coal = std({ color: 0x050505, roughness: 0.6 });
    for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(0.03, 8, 6), coal, sx * 0.095, 1.67, 0.225, false);
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.2; add(g, new THREE.SphereGeometry(0.017, 6, 5), coal, Math.sin(a) * 0.13, 1.535 + Math.cos(a) * 0.03 - 0.03, 0.2 + Math.cos(a) * 0.03, false); }
    for (const y of [0.98, 1.14, 1.3]) add(g, new THREE.SphereGeometry(0.034, 8, 6), coal, 0, y, Math.sqrt(Math.max(0.38 ** 2 - ((y - 1.08) / 0.92) ** 2, 0)) + 0.005, false);
    const nose = add(g, new THREE.ConeGeometry(0.04, 0.26, 10), std({ color: 0xd8601a, roughness: 0.7 }), 0, 1.6, 0.36);
    nose.rotation.x = Math.PI / 2 + 0.08;
    const stick = std({ color: 0x2a1a10, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const arm = add(g, new THREE.CylinderGeometry(0.014, 0.022, 0.8, 6), stick, sx * 0.62, 1.3, 0.02);
      arm.rotation.z = -sx * (1.05 + 0.25 * sx);
      const twig = add(g, new THREE.CylinderGeometry(0.008, 0.012, 0.22, 5), stick, sx * 0.9, 1.52 + 0.06 * sx, 0.04);
      twig.rotation.z = -sx * 0.2; twig.rotation.x = 0.5;
    }
    const wool = std({ color: 0xa3201c, roughness: 0.95 });
    const scarf = add(g, new THREE.TorusGeometry(0.235, 0.062, 10, 28), wool, 0, 1.4, 0); scarf.rotation.x = Math.PI / 2; scarf.scale.set(1, 1, 0.8);
    const tail = add(g, new THREE.BoxGeometry(0.11, 0.42, 0.035), wool, 0.17, 1.2, 0.27); tail.rotation.set(-0.25, 0, -0.12);
    const felt = std({ color: 0x0b0b0e, roughness: 0.85 });
    const hat = new THREE.Group(); hat.position.set(0, 1.8, -0.01); hat.rotation.set(-0.1, 0, 0.12); g.add(hat);
    add(hat, new THREE.CylinderGeometry(0.27, 0.27, 0.025, 24), felt, 0, 0, 0);
    add(hat, new THREE.CylinderGeometry(0.17, 0.165, 0.26, 24), felt, 0, 0.14, 0);
    add(hat, new THREE.CylinderGeometry(0.168, 0.168, 0.05, 24), wool, 0, 0.05, 0, false);
    cap(hat, new RoundedBoxGeometry(0.4, 1, 0.4, 4, 0.2), 0.16, 0.4, (m, t) => { m.scale.y = t; m.position.set(0, 0.25 + t * 0.4, 0); });
  }

  // ---------- bench ----------
  {
    const x = 5.9, z = -1.35;
    const g = new THREE.Group(); g.position.set(x, terrainHeight(x, z) - 0.03, z); g.rotation.y = 0.2; root.add(g);
    const iron = applySnow(std({ color: 0x0c0d10, roughness: 0.55, metalness: 0.7 }), U, { bias: 0.3 });
    const woodTex = woodTexture(rng, '#5a3a22', false, 0);
    const wood = applySnow(std({ map: woodTex, color: 0xb09880, roughness: 0.8 }), U, { bias: 0.5 });
    for (const sx of [-0.68, 0.68]) {
      add(g, new THREE.BoxGeometry(0.05, 0.46, 0.05), iron, sx, 0.23, 0.17);
      add(g, new THREE.BoxGeometry(0.05, 0.95, 0.05), iron, sx, 0.47, -0.2).rotation.x = -0.12;
      add(g, new THREE.BoxGeometry(0.05, 0.04, 0.5), iron, sx, 0.43, 0);
      add(g, new THREE.BoxGeometry(0.05, 0.035, 0.44), iron, sx, 0.66, 0.0);
    }
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(1.56, 0.035, 0.095), wood, 0, 0.47, -0.15 + i * 0.115);
    for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(1.56, 0.1, 0.03), wood, 0, 0.62 + i * 0.13, -0.235 - i * 0.016).rotation.x = -0.12;
    cap(g, new RoundedBoxGeometry(1.62, 1, 0.5, 4, 0.24), 0.3, 0.62, (m, t) => { m.scale.y = t; m.position.set(0, 0.47 + t * 0.42, 0.03); });
    cap(g, new RoundedBoxGeometry(1.6, 1, 0.16, 3, 0.078), 0.12, 0.3, (m, t) => { m.scale.y = t; m.position.set(0, 0.94 + t * 0.4, -0.27); });
  }

  // ---------- woodpile against the gable wall ----------
  {
    const bark = applySnow(std({ map: woodTexture(rng, '#3d2a1c', false, 0), color: 0x9a8676, roughness: 0.95 }), U, { bias: 0.25 });
    const endTex = canvasTexture(128, 128, (c, w) => {
      c.fillStyle = '#c59a62'; c.fillRect(0, 0, w, w);
      for (let r = w * 0.48; r > 2; r -= 3 + Math.random() * 4) { c.strokeStyle = `rgba(90,55,25,${0.25 + Math.random() * 0.35})`; c.lineWidth = 1 + Math.random(); c.beginPath(); c.arc(w / 2 + 3, w / 2 - 2, r, 0, 7); c.stroke(); }
      c.strokeStyle = 'rgba(50,30,15,0.6)'; c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = Math.random() * 7; c.beginPath(); c.moveTo(w / 2, w / 2); c.lineTo(w / 2 + Math.cos(a) * w * 0.45, w / 2 + Math.sin(a) * w * 0.45); c.stroke(); }
    });
    const endMat = std({ map: endTex, roughness: 0.85 });
    const LEN = 0.46, R = 0.105, COLS = 8, ROWS = 5, DEEP = 2;
    const geo = new THREE.CylinderGeometry(R, R, LEN, 10); geo.rotateX(Math.PI / 2);
    const logs = new THREE.InstancedMesh(geo, [bark, endMat, endMat], COLS * ROWS * DEEP);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const x0 = W / 2 + 0.36, z0 = D / 2 - 0.42;
    let n = 0;
    for (let d = 0; d < DEEP; d++) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - (r % 2); c++) {
      const k = 0.82 + rng() * 0.34;
      p.set(x0 + (c + (r % 2) * 0.5) * R * 2.06, 0.04 + R + r * R * 1.8, z0 - d * (LEN + 0.02) + (rng() - 0.5) * 0.07);
      q.setFromEuler(e.set(0, (rng() - 0.5) * 0.08, rng() * 6.28)); s.set(k, k, 1);
      logs.setMatrixAt(n++, m4.compose(p, q, s));
    }
    logs.count = n; logs.castShadow = logs.receiveShadow = true; cabin.add(logs);
    const post = applySnow(std({ color: 0x2c1e14, roughness: 0.9 }), U, { bias: 0.3 });
    const xe = x0 + COLS * R * 2.06 - 0.05;
    for (const dz of [0.12, -LEN - 0.14]) add(cabin, new THREE.BoxGeometry(0.08, 1.25, 0.08), post, xe, 0.6, z0 + dz);
    const top = 0.04 + ROWS * R * 1.8 + 0.02;
    cap(cabin, new RoundedBoxGeometry(COLS * R * 2.06 + 0.2, 1, LEN * DEEP + 0.24, 4, 0.3), 0.34, 0.7, (m, t) => { m.scale.y = t; m.position.set(x0 + COLS * R * 1.03 - 0.1, top + t * 0.4, z0 - LEN / 2); });

    // chopping block, axe and a few split logs
    const [bx, bz] = cabinToWorld(W / 2 + 1.5, D / 2 + 1.5);
    const g = new THREE.Group(); g.position.set(bx, terrainHeight(bx, bz) - 0.04, bz); g.rotation.y = 0.6; root.add(g);
    const stump = new THREE.CylinderGeometry(0.27, 0.31, 0.5, 18);
    add(g, stump, [bark, endMat, endMat], 0, 0.25, 0);
    const axe = new THREE.Group(); axe.position.set(0.02, 0.5, 0); axe.rotation.set(0.15, 0.3, -0.72); g.add(axe);
    add(axe, new THREE.BoxGeometry(0.032, 0.72, 0.045), std({ color: 0x8a6238, roughness: 0.7 }), 0, 0.42, 0);
    add(axe, new THREE.BoxGeometry(0.05, 0.13, 0.2), std({ color: 0x5b6068, roughness: 0.35, metalness: 0.9 }), 0, 0.07, 0.05);
    const lg = new THREE.CylinderGeometry(0.09, 0.09, 0.42, 9, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2);
    for (const [lx, lz, ry] of [[0.55, 0.25, 0.4], [0.7, -0.2, 1.9], [-0.5, 0.35, 2.7], [0.42, 0.6, 1.1]]) {
      const l = add(g, lg, [bark, endMat, endMat], lx, 0.06, lz); l.rotation.set(rng() * 0.3, ry, rng() * 0.4);
    }
    cap(g, new RoundedBoxGeometry(0.62, 1, 0.62, 4, 0.3), 0.22, 0.5, (m, t) => { m.scale.set(1, t, 1); m.position.set(0, 0.49 + t * 0.4, 0); });
  }

  // ---------- sled ----------
  {
    const g = floating(-5.6, 3.5, 0.78, -0.5);
    const paint = applySnow(std({ color: 0x8c1f1a, roughness: 0.6 }), U, { bias: 0.4 });
    const wood = applySnow(std({ map: woodTexture(rng, '#7a5632', false, 0), color: 0xc8b090, roughness: 0.75 }), U, { bias: 0.5 });
    for (const sx of [-0.21, 0.21]) {
      add(g, new THREE.BoxGeometry(0.03, 0.035, 1.12), paint, sx, 0.02, 0);
      add(g, new THREE.BoxGeometry(0.03, 0.035, 0.3), paint, sx, 0.1, 0.66).rotation.x = -0.65;
      for (const sz of [-0.36, 0.3]) add(g, new THREE.BoxGeometry(0.03, 0.17, 0.035), paint, sx, 0.11, sz);
    }
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.095, 0.022, 0.98), wood, -0.165 + i * 0.11, 0.205, -0.02);
    add(g, new THREE.BoxGeometry(0.5, 0.025, 0.05), paint, 0, 0.19, 0.72);
    cap(g, new RoundedBoxGeometry(0.5, 1, 1.02, 3, 0.2), 0.1, 0.25, (m, t) => { m.scale.y = t; m.position.set(0, 0.215 + t * 0.4, -0.02); });
  }

  // ---------- snow gauge: 10 cm bands, so the growing depth can be read off ----------
  {
    const x = 1.5, z = 4.9, Hh = 1.2;
    const tex = canvasTexture(32, 480, (c, w, h) => {
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#e9e6dc' : '#c3271f'; c.fillRect(0, h - (i + 1) * (h / 12), w, h / 12); }
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(0, h - 5 * (h / 12) - 2, w, 4); c.fillRect(0, h - 10 * (h / 12) - 2, w, 4);
    });
    const pole = add(root, new THREE.CylinderGeometry(0.028, 0.028, Hh, 12), std({ map: tex, roughness: 0.6 }), x, terrainHeight(x, z) + Hh / 2, z);
    pole.rotation.z = 0.02;
    add(root, new THREE.SphereGeometry(0.04, 10, 8), std({ color: 0xc3271f, roughness: 0.5 }), x, terrainHeight(x, z) + Hh + 0.02, z);
  }

  // ---------- rocks on the pond shore ----------
  {
    const rock = applySnow(std({ color: 0x4a4c50, roughness: 0.92, flatShading: true }), U, { bias: 0.2 });
    for (let i = 0; i < 9; i++) {
      const a = 0.6 + i * 0.74 + rng() * 0.35, rr = 1.22 + rng() * 0.22;
      const x = POND.x + Math.cos(a) * POND.rx * rr, z = POND.z + Math.sin(a) * POND.rz * rr;
      if (Math.hypot(x - 3.4, z - 2.4) < 1.2) continue;
      const geo = new THREE.IcosahedronGeometry(1, 1), pp = geo.attributes.position;
      for (let j = 0; j < pp.count; j++) {
        const h = Math.sin(pp.getX(j) * 12.9 + pp.getY(j) * 78.2 + pp.getZ(j) * 37.7 + i) * 43758.5; const k = 0.8 + 0.4 * (h - Math.floor(h));
        pp.setXYZ(j, pp.getX(j) * k, pp.getY(j) * k, pp.getZ(j) * k);
      }
      geo.computeVertexNormals();
      const s = 0.2 + rng() * 0.34;
      const m = add(root, geo, rock, x, terrainHeight(x, z) + s * 0.2, z);
      m.scale.set(s * (1 + rng() * 0.5), s * 0.62, s); m.rotation.y = rng() * 6.28;
    }
  }

  // ---------- warm string lights under the front eave ----------
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  {
    const RW = W + 1.1, N = 26, SWAGS = 5, y0 = WALL - 0.56, z0 = D / 2 + OVER - 0.04;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.034, 8, 6), bulbMat, N);
    const m4 = new THREE.Matrix4(), pts = [];
    for (let i = 0; i <= N * 4; i++) {
      const u = i / (N * 4), sag = Math.abs(Math.sin(u * SWAGS * Math.PI));
      pts.push(new THREE.Vector3(-RW / 2 + 0.25 + u * (RW - 0.5), y0 - 0.14 * sag, z0));
    }
    for (let i = 0; i < N; i++) { const p = pts[i * 4 + 2]; bulbs.setMatrixAt(i, m4.makeTranslation(p.x, p.y - 0.035, p.z)); }
    cabin.add(bulbs);
    cabin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x050505 })));
  }

  // ---------- chimney smoke ----------
  const smokeU = { uTime: U.uTime, uWind: U.uWind, uCol: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uScale: { value: 800 } };
  {
    cabin.updateMatrixWorld(true);
    const top = cabin.localToWorld(new THREE.Vector3(-1.9, WALL + RIDGE + 1.05, -0.75));
    const N = 44, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([top.x, top.y, top.z], i * 3); seed[i] = (i + rng() * 0.6) / N; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const smoke = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: smokeU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec3 uWind; uniform float uScale;
        varying float vA; varying float vLife; varying float vRot;
        void main(){
          float life = fract(uTime * 0.05 + aSeed), r1 = fract(aSeed * 17.31), r2 = fract(aSeed * 91.7);
          vec3 w = vec3(uWind.x, 0.0, uWind.z); float wl = length(w);
          vec3 p = position;
          p.y += life * 6.5 / (1.0 + wl * 0.14);
          p += w * 0.42 * pow(life, 1.35) * 5.0;
          p.x += (sin(uTime * 0.5 + r1 * 40.0) * 0.5 + r1 - 0.5) * life * 1.3;
          p.z += (cos(uTime * 0.43 + r2 * 40.0) * 0.5 + r2 - 0.5) * life * 1.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = mix(0.3, 3.4, pow(life, 0.8)) * (0.8 + 0.5 * r1) * uScale / -mv.z;
          vA = smoothstep(0.0, 0.06, life) * pow(1.0 - life, 1.6) * 0.34;
          vLife = life; vRot = r2 * 6.28 + uTime * 0.1;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform vec3 uGlow; varying float vA; varying float vLife; varying float vRot;
        void main(){
          vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = mat2(c, s, -s, c) * q;
          float d = length(q * vec2(1.0, 1.25)) + 0.06 * sin(q.x * 14.0 + vRot) * sin(q.y * 11.0);
          float a = smoothstep(0.5, 0.05, d) * vA;
          gl_FragColor = vec4(uCol + uGlow * (1.0 - smoothstep(0.0, 0.25, vLife)), a);
        }`,
    }));
    smoke.frustumCulled = false; smoke.renderOrder = 5;
    root.add(smoke);
  }

  return {
    update({ depth, lampOn, ambient, ambI, dirCol, pxScale }) {
      for (const f of floats) { f.g.position.y = f.base + depth * f.gain * f.sink - 0.04; if (f.g.userData.needsSnow) f.g.visible = depth > 0.035; }
      const on = 0.12 + 0.88 * lampOn;
      bulbMat.color.setRGB(3.2 * on, 2.0 * on, 0.9 * on);
      const c = smokeU.uCol.value.copy(ambient).multiplyScalar(ambI * 0.34);
      c.r += dirCol.r * 0.07; c.g += dirCol.g * 0.07; c.b += dirCol.b * 0.07;
      smokeU.uGlow.value.setRGB(0.5, 0.26, 0.1).multiplyScalar(0.35 * on);
      smokeU.uScale.value = pxScale;
    },
  };
}
