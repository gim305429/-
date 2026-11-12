// 그래픽 담당. 모든 모델은 이름(key)으로 만든다.
// 나중에 힉스필드 3D(GLB)로 바꿀 때는 assets/manifest.json 에 같은 이름으로 파일을 넣고 이 파일의 makeModel 만 고치면 된다.
import * as THREE from 'three';

export const PALETTE = {
  skyTop: 0x8ec5e8, skyHorizon: 0xf6e7c8, grass: 0x9fd18b, grassDark: 0x6faf6a,
  stone: 0xd9cfc1, moss: 0x7fa36b, gold: 0xffd58a, danger: 0xe8736c, outline: 0x3a3226,
};

const gradTex = (() => {
  const d = new Uint8Array([70, 160, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export const toonMat = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradTex, ...extra });
const darken = (hex, k = 0.45) => new THREE.Color(hex).multiplyScalar(k).getHex();

// 외곽선: 같은 도형을 살짝 키워 뒷면만 어둡게 그린다 (셀 셰이딩 윤곽선)
function addPart(g, geo, color, pos = [0, 0, 0], o = {}) {
  const mat = toonMat(color, o.mat || {});
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) m.scale.set(...o.scale);
  g.add(m); g.userData.mats.push(mat);
  if (o.outline !== false) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const s = new THREE.Vector3(); geo.boundingBox.getSize(s);
    const t = o.ow ?? 0.035;
    const om = new THREE.MeshBasicMaterial({ color: o.oc ?? darken(color), side: THREE.BackSide });
    const ol = new THREE.Mesh(geo, om);
    ol.position.copy(m.position); ol.rotation.copy(m.rotation);
    ol.scale.set(1 + 2 * t / Math.max(s.x, 0.01), 1 + 2 * t / Math.max(s.y, 0.01), 1 + 2 * t / Math.max(s.z, 0.01)).multiply(m.scale);
    g.add(ol); g.userData.omats.push(om);
    m.userData.outline = ol;
  }
  return m;
}
const group = () => { const g = new THREE.Group(); g.userData.mats = []; g.userData.omats = []; return g; };

const G = {
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  hemi: r => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 10) => new THREE.ConeGeometry(r, h, s),
  tor: (r, t, a = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, 24, a),
};

// ---------- 하늘 ----------
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(PALETTE.skyTop) }, hor: { value: new THREE.Color(PALETTE.skyHorizon) }, time: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 hor; uniform float time; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*n(p); p*=2.0; a*=0.5; } return v; }
      void main(){
        float y = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(hor, top, pow(y, 0.55));
        vec2 uv = vDir.xz / (vDir.y + 0.25) * 2.6 + vec2(time*0.01, 0.0);
        float cl = smoothstep(0.6, 0.78, fbm(uv));
        cl = floor(cl * 3.0) / 3.0; // 구름도 계단식 음영
        c = mix(c, vec3(1.0, 0.99, 0.96), cl * smoothstep(0.02, 0.25, vDir.y) * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  m.userData.tick = t => { mat.uniforms.time.value = t; };
  return m;
}

// ---------- 바람에 흔들리는 풀 ----------
export function makeGrass(count, radius, fog) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, 1, 0], 3));
  const tint = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, null, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    e.set(0, Math.random() * Math.PI, 0); q.setFromEuler(e);
    const s = 0.28 + Math.random() * 0.4;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(0.8 + Math.random() * 0.8, s, 1));
    mesh.setMatrixAt(i, m4); tint[i] = Math.random();
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  mesh.material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, base: { value: new THREE.Color(0x88c278) }, tip: { value: new THREE.Color(0xc8e88e) },
      fogC: { value: new THREE.Color(fog.color) }, fogN: { value: fog.near }, fogF: { value: fog.far } },
    vertexShader: `
      uniform float time; attribute float aTint; varying float vH; varying float vT; varying float vD;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = position.y; vH = h; vT = aTint;
        float sway = (sin(time*1.7 + wp.x*0.35 + wp.z*0.22) * 0.5 + 0.7) * 0.22 * h;
        wp.x += sway; wp.z += sway * 0.35;
        vec4 mv = viewMatrix * wp; vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 base; uniform vec3 tip; uniform vec3 fogC; uniform float fogN; uniform float fogF;
      varying float vH; varying float vT; varying float vD;
      void main(){
        float k = floor(vH * 3.0) / 3.0;
        vec3 c = mix(base, tip, k) * (0.9 + vT * 0.2);
        c = mix(c, fogC, smoothstep(fogN, fogF, vD));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  mesh.frustumCulled = false;
  mesh.userData.tick = t => { mesh.material.uniforms.time.value = t; };
  return mesh;
}

// ---------- 배경 (풀밭, 먼 산, 성, 나무, 유적 벽) ----------
export function makeWorld(scene, arenaR, quality) {
  const root = new THREE.Group(); scene.add(root);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), toonMat(PALETTE.grass));
  ground.rotation.x = -Math.PI / 2; root.add(ground);
  // 돌바닥 조각
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * (arenaR - 3);
    const t = new THREE.Mesh(new THREE.CircleGeometry(0.8 + Math.random() * 1.6, 7), toonMat(0xcfc6a8));
    t.rotation.x = -Math.PI / 2; t.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r); root.add(t);
  }
  // 경기장 둘레의 무너진 유적 벽 (틈 사이로 바깥 초원이 보이게)
  const ring = group(); root.add(ring);
  const segs = 22;
  for (let i = 0; i < segs; i++) {
    if (i % 4 === 1) continue;
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * (arenaR + 1.2), z = Math.sin(a) * (arenaR + 1.2);
    const tall = (i % 5 === 0);
    const h = tall ? 5.5 : 1.2 + Math.random() * 2.2;
    const w = addPart(ring, G.box(5.2, h, 1.1), PALETTE.stone, [x, h / 2, z], { ow: 0.06 });
    w.rotation.y = -a + Math.PI / 2; w.userData.outline.rotation.y = w.rotation.y;
    if (tall) { // 아치
      const top = addPart(ring, G.box(5.2, 0.9, 1.3), 0xe3dacb, [x, h + 0.4, z], { ow: 0.06 });
      top.rotation.y = w.rotation.y; top.userData.outline.rotation.y = w.rotation.y;
      const moss = addPart(ring, G.box(5.3, 0.35, 1.35), PALETTE.moss, [x, h + 0.95, z], { outline: false });
      moss.rotation.y = w.rotation.y;
    }
  }
  // 나무
  const trees = quality === 'low' ? 14 : 26;
  for (let i = 0; i < trees; i++) {
    const a = Math.random() * Math.PI * 2, r = arenaR + 6 + Math.random() * 30;
    root.add(makeTree(Math.cos(a) * r, Math.sin(a) * r, 0.8 + Math.random() * 0.8));
  }
  // 먼 언덕과 절벽 위의 성
  const hills = [[-120, -80, 50, 0x9cc792], [60, -140, 70, 0x8fbf9a], [140, 20, 55, 0xa6cf96], [-100, 110, 60, 0x9cc792], [40, 150, 45, 0xa6cf96]];
  for (const [x, z, r, c] of hills) {
    const h = new THREE.Mesh(G.sph(r, 20, 12), toonMat(c)); h.scale.y = 0.35; h.position.set(x, -r * 0.08, z); root.add(h);
  }
  const cliff = group(); root.add(cliff);
  addPart(cliff, G.cyl(26, 34, 26, 9), 0xc9c0ad, [0, 13, 0], { ow: 0.3 });
  addPart(cliff, G.cyl(26.5, 26.5, 2, 9), PALETTE.moss, [0, 26.5, 0], { outline: false });
  const castle = [[0, 32, 0, 6, 12], [-6, 30, 2, 3.2, 9], [6, 30, -1, 3.2, 10], [2, 36, -3, 2.2, 14]];
  for (const [x, y, z, r, h] of castle) {
    addPart(cliff, G.cyl(r, r, h, 8), 0xe8e0d0, [x, y, z], { ow: 0.15 });
    addPart(cliff, G.cone(r * 1.25, h * 0.6, 8), 0x7d8fb3, [x, y + h / 2 + h * 0.3, z], { ow: 0.15 });
  }
  cliff.position.set(55, 0, -105);
  return root;
}

export function makeTree(x, z, s = 1) {
  const g = group();
  addPart(g, G.cyl(0.25, 0.4, 3, 7), 0x8a6a4a, [0, 1.5, 0]);
  addPart(g, G.sph(1.8, 10, 8), 0x6fae5c, [0, 3.8, 0], { ow: 0.06 });
  addPart(g, G.sph(1.3, 10, 8), 0x86c46a, [0.9, 4.6, 0.3], { ow: 0.06 });
  addPart(g, G.sph(1.2, 10, 8), 0x5f9e52, [-0.9, 4.3, -0.4], { ow: 0.06 });
  g.position.set(x, 0, z); g.scale.setScalar(s);
  return g;
}

export function makeObstacle(kind, r) {
  const g = group();
  if (kind === 'pillar') {
    const h = 3 + Math.random() * 3;
    addPart(g, G.cyl(r * 0.8, r, h, 10), PALETTE.stone, [0, h / 2, 0], { ow: 0.05 });
    addPart(g, G.cyl(r * 1.05, r * 1.05, 0.4, 10), 0xe7dfd0, [0, h + 0.2, 0], { ow: 0.05 });
    addPart(g, G.cyl(r * 0.82, r * 0.82, 0.5, 10), PALETTE.moss, [0, h * 0.35, 0], { outline: false });
  } else if (kind === 'wall') {
    addPart(g, G.box(r * 2.1, 2.2, 0.9), PALETTE.stone, [0, 1.1, 0], { ow: 0.05 });
    addPart(g, G.box(r * 2.2, 0.3, 1.0), PALETTE.moss, [0, 2.3, 0], { outline: false });
  } else {
    addPart(g, new THREE.DodecahedronGeometry(r, 0), 0xb9b0a0, [0, r * 0.55, 0], { ow: 0.06, scale: [1, 0.75, 1] });
    addPart(g, G.sph(r * 0.4, 8, 6), PALETTE.moss, [r * 0.3, r * 1.0, 0.1], { outline: false });
  }
  return g;
}

// ---------- 몬스터 ----------
const EYE = 0x2a2230;
function eyes(g, y, z, sep = 0.12, s = 0.06, c = EYE) {
  addPart(g, G.sph(s, 8, 6), c, [-sep, y, z], { outline: false });
  addPart(g, G.sph(s, 8, 6), c, [sep, y, z], { outline: false });
}
export function makeMonster(key, d) {
  const g = group();
  const c = d.color;
  switch (key) {
    case 'mushroom': {
      addPart(g, G.cyl(0.22, 0.28, 0.5), 0xf2e6cf, [0, 0.25, 0]);
      addPart(g, G.hemi(0.48), c, [0, 0.45, 0], { scale: [1, 0.8, 1] });
      for (const [x, z] of [[0.2, 0.2], [-0.25, 0.05], [0.05, -0.28]]) addPart(g, G.sph(0.07, 6, 5), 0xffffff, [x, 0.75, z], { outline: false });
      eyes(g, 0.33, 0.24, 0.09, 0.05); break;
    }
    case 'bat': {
      addPart(g, G.sph(0.22), c, [0, 0, 0]);
      const wl = addPart(g, G.cone(0.32, 0.6, 3), 0x3f3356, [-0.36, 0, 0], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.2] });
      const wr = addPart(g, G.cone(0.32, 0.6, 3), 0x3f3356, [0.36, 0, 0], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.2] });
      g.userData.wings = [wl, wr];
      eyes(g, 0.05, 0.19, 0.08, 0.04, 0xffd36b); break;
    }
    case 'vine': {
      for (let i = 0; i < 5; i++) addPart(g, G.sph(0.2 - i * 0.02, 8, 6), i % 2 ? c : 0x5fa354, [0, 0.2 + i * 0.12, -i * 0.22], { ow: 0.02 });
      addPart(g, G.sph(0.24, 10, 8), c, [0, 0.35, 0.18]);
      eyes(g, 0.42, 0.38, 0.09, 0.045, 0xf3e05a);
      const bush = group(); bush.userData.isBush = true;
      for (const [x, y, z, r] of [[0, 0.35, 0, 0.5], [0.35, 0.25, 0.1, 0.35], [-0.3, 0.25, -0.1, 0.38]]) addPart(bush, G.sph(r, 9, 7), 0x5c9a4f, [x, y, z], { ow: 0.03 });
      g.add(bush); g.userData.bush = bush; break;
    }
    case 'petal': {
      addPart(g, G.cone(0.25, 0.7, 8), 0x9fd18b, [0, 0.45, 0], { rot: [Math.PI, 0, 0] });
      addPart(g, G.sph(0.22), 0xfff0a8, [0, 0.95, 0]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addPart(g, G.sph(0.17, 8, 6), c, [Math.cos(a) * 0.27, 0.95 + Math.sin(a) * 0.27, 0], { scale: [1, 1, 0.4], ow: 0.02 }); }
      eyes(g, 0.98, 0.18, 0.07, 0.04); break;
    }
    case 'knight': case 'shadow': {
      const body = key === 'shadow' ? 0x3d3852 : c;
      addPart(g, G.cyl(0.32, 0.38, 0.9), body, [0, 0.95, 0]);
      addPart(g, G.box(0.18, 0.5, 0.18), body, [-0.15, 0.25, 0]); addPart(g, G.box(0.18, 0.5, 0.18), body, [0.15, 0.25, 0]);
      addPart(g, G.sph(0.26), key === 'shadow' ? 0x2b2740 : 0xb8c0c8, [0, 1.6, 0]);
      addPart(g, G.box(0.36, 0.06, 0.05), 0x1a1820, [0, 1.62, 0.24], { outline: false });
      if (key === 'shadow') eyes(g, 1.64, 0.25, 0.08, 0.04, 0xc59bff);
      addPart(g, G.box(0.7, 0.9, 0.1), key === 'shadow' ? 0x5a4f7a : 0x8a6a4a, [-0.25, 1.0, 0.42]);
      addPart(g, G.box(0.06, 0.9, 0.12), 0xd6dbe0, [0.42, 1.0, 0.3]);
      break;
    }
    case 'roller': {
      addPart(g, new THREE.DodecahedronGeometry(0.5, 0), c, [0, 0.5, 0], { ow: 0.04 });
      eyes(g, 0.6, 0.42, 0.13, 0.06, 0xffe08a); break;
    }
    case 'golem': {
      addPart(g, G.box(1.2, 1.2, 0.9), 0xa9a08c, [0, 1.2, 0], { ow: 0.05 });
      addPart(g, G.box(1.25, 0.35, 0.95), c, [0, 1.85, 0], { outline: false });
      addPart(g, G.box(0.7, 0.55, 0.6), 0xa9a08c, [0, 2.1, 0.05], { ow: 0.04 });
      const al = addPart(g, G.box(0.4, 1.1, 0.4), 0x9d947f, [-0.85, 1.1, 0]);
      const ar = addPart(g, G.box(0.4, 1.1, 0.4), 0x9d947f, [0.85, 1.1, 0]);
      addPart(g, G.box(0.38, 0.6, 0.38), 0x9d947f, [-0.3, 0.3, 0]); addPart(g, G.box(0.38, 0.6, 0.38), 0x9d947f, [0.3, 0.3, 0]);
      eyes(g, 2.15, 0.36, 0.15, 0.07, 0xb6ff8a);
      g.userData.arms = [al, ar]; break;
    }
    case 'shaman': {
      addPart(g, G.cyl(0.2, 0.26, 0.7), 0xf2e6cf, [0, 0.35, 0]);
      addPart(g, G.hemi(0.5), c, [0, 0.65, 0], { scale: [1, 0.9, 1] });
      addPart(g, G.cyl(0.03, 0.03, 1.3), 0x7a5a3a, [0.4, 0.65, 0.1]);
      addPart(g, G.sph(0.1), 0x9cff9c, [0.4, 1.35, 0.1], { outline: false, mat: { emissive: 0x3c8a3c } });
      eyes(g, 0.48, 0.22, 0.08, 0.045); break;
    }
    case 'rarcher': {
      addPart(g, G.cone(0.42, 1.3, 8), c, [0, 0.65, 0]);
      addPart(g, G.sph(0.25), 0x8f8063, [0, 1.45, 0]);
      addPart(g, G.box(0.3, 0.08, 0.05), 0x1a1820, [0, 1.45, 0.22], { outline: false });
      addPart(g, G.tor(0.4, 0.03, Math.PI), 0x7a5a3a, [0.35, 1.1, 0.25], { rot: [0, Math.PI / 2, Math.PI / 2] });
      break;
    }
    case 'wolf': {
      addPart(g, G.box(0.5, 0.45, 1.1), c, [0, 0.65, 0]);
      addPart(g, G.box(0.38, 0.36, 0.42), 0xd7e6ee, [0, 0.85, 0.65]);
      addPart(g, G.box(0.2, 0.16, 0.25), 0xd7e6ee, [0, 0.78, 0.92]);
      addPart(g, G.cone(0.08, 0.2, 4), c, [-0.12, 1.1, 0.6]); addPart(g, G.cone(0.08, 0.2, 4), c, [0.12, 1.1, 0.6]);
      for (const [x, z] of [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.4], [0.18, -0.4]]) addPart(g, G.box(0.12, 0.45, 0.12), c, [x, 0.22, z]);
      addPart(g, G.cone(0.1, 0.5, 5), 0xd7e6ee, [0, 0.8, -0.7], { rot: [-1.2, 0, 0] });
      eyes(g, 0.9, 0.86, 0.1, 0.035, 0x2a6aa0); break;
    }
    case 'turtle': {
      addPart(g, G.hemi(0.95), c, [0, 0.3, 0], { scale: [1, 0.7, 1.15] });
      addPart(g, G.cyl(0.95, 0.95, 0.3, 14), 0x8bb59c, [0, 0.3, 0], { scale: [1, 1, 1.15] });
      addPart(g, G.sph(0.3), 0x8bb59c, [0, 0.5, 1.15]);
      eyes(g, 0.58, 1.38, 0.12, 0.05);
      const cr = [];
      for (const [x, z] of [[0, -0.2], [-0.35, 0.15], [0.35, 0.1]]) cr.push(addPart(g, G.cone(0.18, 0.6, 5), 0x9ff0ff, [x, 1.1, z], { mat: { emissive: 0x2a8a9a } }));
      g.userData.crystals = cr;
      for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]]) addPart(g, G.cyl(0.18, 0.2, 0.35), 0x8bb59c, [x, 0.15, z]);
      break;
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ---------- 보스 ----------
export function makeBoss(key) {
  const g = group();
  switch (key) {
    case 'queen': {
      addPart(g, G.cyl(0.6, 0.8, 1.8), 0xf2e6cf, [0, 0.9, 0], { ow: 0.06 });
      addPart(g, G.hemi(1.6), 0xd9614c, [0, 1.6, 0], { scale: [1, 0.75, 1], ow: 0.06 });
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; addPart(g, G.sph(0.18, 8, 6), 0xffffff, [Math.cos(a) * 0.9, 2.5 - (i % 2) * 0.2, Math.sin(a) * 0.9], { outline: false }); }
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; addPart(g, G.cone(0.14, 0.5, 4), PALETTE.gold, [Math.cos(a) * 0.45, 3.0, Math.sin(a) * 0.45], { mat: { emissive: 0x6a4a10 } }); }
      eyes(g, 1.2, 0.7, 0.22, 0.1); break;
    }
    case 'gate': {
      addPart(g, G.cyl(0.7, 0.85, 1.8), 0x8f98a3, [0, 1.8, 0], { ow: 0.06 });
      addPart(g, G.box(0.4, 1.0, 0.4), 0x7a838e, [-0.35, 0.5, 0]); addPart(g, G.box(0.4, 1.0, 0.4), 0x7a838e, [0.35, 0.5, 0]);
      addPart(g, G.sph(0.5), 0xb8c0c8, [0, 3.0, 0], { ow: 0.05 });
      addPart(g, G.box(0.7, 0.1, 0.05), 0x1a1820, [0, 3.0, 0.48], { outline: false });
      eyes(g, 3.02, 0.5, 0.15, 0.05, 0xffb050);
      const sh = addPart(g, G.box(2.0, 2.6, 0.25), 0x9a7a4a, [0, 1.8, 0.95], { ow: 0.06 });
      addPart(g, G.box(2.1, 0.25, 0.3), 0xd6dbe0, [0, 3.0, 0.97], { outline: false });
      addPart(g, G.sph(0.25, 10, 8), PALETTE.gold, [0, 1.9, 1.12], { outline: false, mat: { emissive: 0x6a4a10 } });
      g.userData.shield = sh; break;
    }
    case 'thorn': {
      addPart(g, G.cyl(1.4, 2.2, 6.0, 12), 0x7a5a3a, [0, 3.0, 0], { ow: 0.08 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addPart(g, G.cone(0.5, 2.6, 6), 0x6a4a2e, [Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2], { rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }); }
      for (const [x, y, z, r] of [[0, 8.0, 0, 3.4], [2.4, 7.2, 0.8, 2.4], [-2.3, 7.4, -0.6, 2.5], [0.4, 9.6, -0.8, 2.0]]) addPart(g, G.sph(r, 12, 9), 0x5f9e52, [x, y, z], { ow: 0.1 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; addPart(g, G.cone(0.18, 0.9, 5), 0x4b3520, [Math.cos(a) * 1.6, 2 + (i % 3), Math.sin(a) * 1.6], { rot: [0, 0, Math.PI / 2], outline: false }); }
      eyes(g, 4.2, 1.45, 0.45, 0.16, 0xffe36b);
      addPart(g, G.box(1.0, 0.18, 0.1), 0x2a1a10, [0, 3.5, 1.5], { outline: false });
      const knots = [];
      for (const [x, y, z] of [[-1.0, 2.2, 1.35], [1.1, 3.0, 1.25], [0, 1.4, 1.75]]) {
        const k = addPart(g, G.sph(0.32, 10, 8), 0xffe36b, [x, y, z], { mat: { emissive: 0xc08a10 } });
        k.visible = false; k.userData.outline.visible = false; knots.push(k);
      }
      g.userData.knots = knots; break;
    }
    case 'turtleking': {
      addPart(g, G.hemi(2.6), 0x5d9c96, [0, 0.7, 0], { scale: [1, 0.7, 1.2], ow: 0.08 });
      addPart(g, G.cyl(2.6, 2.6, 0.6, 18), 0x8bb59c, [0, 0.7, 0], { scale: [1, 1, 1.2], ow: 0.06 });
      addPart(g, G.sph(0.9), 0x8bb59c, [0, 1.3, 3.3], { ow: 0.06 });
      eyes(g, 1.55, 4.1, 0.35, 0.13, 0x2a2230);
      for (const [x, z] of [[-1.8, 1.8], [1.8, 1.8], [-1.8, -1.8], [1.8, -1.8]]) addPart(g, G.cyl(0.5, 0.6, 0.9), 0x8bb59c, [x, 0.4, z]);
      const cr = [];
      for (const [x, z] of [[0, -0.6], [-1.0, 0.6], [1.0, 0.5]]) cr.push(addPart(g, G.cone(0.5, 1.6, 5), 0x9ff0ff, [x, 2.6, z], { mat: { emissive: 0x2a8a9a }, ow: 0.05 }));
      g.userData.crystals = cr; break;
    }
  }
  return g;
}

// ---------- 1인칭 손과 무기 ----------
const SKIN = 0xf1c7a0;
export function makeViewModel(cls) {
  const g = group();
  const L = group(), R = group(); g.add(L, R); g.userData.L = L; g.userData.R = R;
  const sleeve = { warrior: 0x8a6a4a, cleric: 0xeee8f6, mage: 0x5b3f8a, archer: 0x6b4f35 }[cls];
  const hand = (p, x) => { addPart(p, G.cyl(0.07, 0.085, 0.45, 8), sleeve, [x, -0.05, 0.12], { rot: [Math.PI / 2, 0, 0], ow: 0.01 }); addPart(p, G.box(0.11, 0.06, 0.13), SKIN, [x, -0.05, -0.15], { ow: 0.01 }); };
  if (cls === 'warrior') {
    hand(L, 0); hand(R, 0);
    const shield = group(); L.add(shield);
    addPart(shield, G.box(0.36, 0.44, 0.05), 0x8a5a32, [0, 0, 0], { ow: 0.012 });
    addPart(shield, G.box(0.4, 0.04, 0.06), 0xb8c0c8, [0, 0.22, 0], { outline: false });
    addPart(shield, G.box(0.4, 0.04, 0.06), 0xb8c0c8, [0, -0.22, 0], { outline: false });
    addPart(shield, G.sph(0.04, 8, 6), 0xd6dbe0, [0, 0, 0.03], { outline: false });
    shield.position.set(0.02, 0.05, -0.2); shield.rotation.set(0, 0.55, 0.12);
    const blade = group(); R.add(blade);
    addPart(blade, G.box(0.05, 0.7, 0.015), 0xe8eef2, [0, 0.42, 0], { ow: 0.008 });
    addPart(blade, G.box(0.2, 0.04, 0.04), 0xb08a40, [0, 0.06, 0], { ow: 0.006 });
    addPart(blade, G.cyl(0.02, 0.02, 0.14, 6), 0x5a3a20, [0, -0.04, 0], { ow: 0.006 });
    blade.position.set(0, -0.02, -0.18); blade.rotation.set(-1.0, 0, 0.55);
    L.position.set(-0.42, -0.34, -0.55); R.position.set(0.34, -0.3, -0.5);
    g.userData.blade = blade;
  } else if (cls === 'cleric') {
    hand(L, 0); hand(R, 0);
    addPart(R, G.cyl(0.02, 0.025, 1.1, 6), 0x7a5a3a, [0, 0.25, -0.18], { ow: 0.006 });
    addPart(R, G.box(0.12, 0.12, 0.12), 0xd4b04a, [0, 0.82, -0.18], { ow: 0.006 });
    addPart(R, new THREE.OctahedronGeometry(0.06), 0x8fd8ff, [0, 0.82, -0.18], { outline: false, mat: { emissive: 0x3a8ac0 } });
    const glow = new THREE.Mesh(G.sph(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.0 }));
    glow.position.set(0, 0, -0.25); L.add(glow); g.userData.glow = glow;
    L.position.set(-0.3, -0.27, -0.48); R.position.set(0.32, -0.32, -0.45);
  } else if (cls === 'mage') {
    hand(L, 0); hand(R, 0);
    const orb = new THREE.Mesh(G.sph(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: 0xbfa8ff, transparent: true, opacity: 0.95 }));
    const halo = new THREE.Mesh(G.sph(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.35, depthWrite: false }));
    orb.add(halo); orb.position.set(0, 0.08, -0.3); R.add(orb); g.userData.orb = orb;
    L.position.set(-0.3, -0.3, -0.5); R.position.set(0.3, -0.3, -0.5);
  } else {
    hand(L, 0); hand(R, 0);
    // 활: 반원(끝점 ±x, 휜 쪽 +y)을 세워서 휜 쪽이 앞(−z)을 향하게 돌린다. 시위는 두 끝점을 잇는 선.
    const bow = group(); L.add(bow);
    addPart(bow, G.tor(0.36, 0.018, Math.PI), 0x7a5232, [0, 0, 0], { ow: 0.006 });
    const str = new THREE.Mesh(G.cyl(0.004, 0.004, 0.72, 4), new THREE.MeshBasicMaterial({ color: 0xf4efe4 }));
    str.rotation.z = Math.PI / 2; bow.add(str); g.userData.string = str;
    bow.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
    bow.rotateY(0.25); bow.position.set(0, 0, 0.1);
    const arrow = group(); R.add(arrow);
    addPart(arrow, G.cyl(0.008, 0.008, 0.62, 5), 0xc89a5a, [0, 0, -0.22], { rot: [Math.PI / 2, 0, 0], ow: 0.004 });
    addPart(arrow, G.cone(0.02, 0.06, 4), 0xdfe5ea, [0, 0, -0.55], { rot: [-Math.PI / 2, 0, 0], ow: 0.004 });
    g.userData.arrow = arrow;
    L.position.set(-0.12, -0.2, -0.55); R.position.set(0.08, -0.22, -0.35);
  }
  L.scale.setScalar(0.62); R.scale.setScalar(0.62);
  g.userData.base = { L: L.position.clone(), R: R.position.clone() };
  return g;
}

// ---------- 효과 ----------
export function telegraphCircle(r, color = PALETTE.danger) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  fill.rotation.x = ring.rotation.x = -Math.PI / 2; g.add(fill, ring); g.scale.setScalar(r); g.position.y = 0.04;
  g.userData.fill = fill; return g;
}
export function telegraphLine(len, w, color = PALETTE.danger) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.geometry.translate(0, len / 2, 0);
  const g = new THREE.Group(); g.add(m); g.position.y = 0.05; return g;
}
export function orb(r, color, glow = true) {
  const m = new THREE.Mesh(G.sph(r, 10, 8), new THREE.MeshBasicMaterial({ color }));
  if (glow) { const h = new THREE.Mesh(G.sph(r * 1.8, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false })); m.add(h); }
  return m;
}
export function arrowMesh() {
  const g = group();
  addPart(g, G.cyl(0.02, 0.02, 0.8, 5), 0xc89a5a, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ow: 0.008 });
  addPart(g, G.cone(0.05, 0.12, 4), 0xdfe5ea, [0, 0, 0.45], { rot: [Math.PI / 2, 0, 0], ow: 0.008 });
  return g;
}
export function lootBeam(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(G.cyl(0.18, 0.18, 6, 10, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  beam.position.y = 3; g.add(beam);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), toonMat(color, { emissive: new THREE.Color(color).multiplyScalar(0.4) }));
  gem.position.y = 0.6; g.add(gem); g.userData.gem = gem;
  return g;
}
export function makeChest() {
  const g = group();
  addPart(g, G.box(1.2, 0.7, 0.8), 0x9a6a3a, [0, 0.35, 0], { ow: 0.04 });
  const lid = addPart(g, G.box(1.25, 0.3, 0.85), 0xb07a42, [0, 0.85, 0], { ow: 0.04 });
  addPart(g, G.box(0.2, 0.25, 0.1), PALETTE.gold, [0, 0.6, 0.42], { outline: false, mat: { emissive: 0x6a4a10 } });
  g.userData.lid = lid; return g;
}
export function makePortal() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(G.tor(1.5, 0.18), toonMat(PALETTE.gold, { emissive: 0x806020 }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0xa8e6ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  g.add(ring, disc); g.position.y = 1.7; g.userData.disc = disc; return g;
}
export function ringPulse(r, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.08; m.scale.setScalar(r); return m;
}
export function cloud(r, color, op = 0.35) {
  const m = new THREE.Mesh(G.sph(1, 14, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
  m.scale.set(r, r * 0.35, r); return m;
}
export function hpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x2a2230, depthTest: false, transparent: true }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xe8736c, depthTest: false, transparent: true }));
  fg.geometry.translate(0.5, 0, 0); fg.position.x = -0.5; fg.position.z = 0.001;
  bg.renderOrder = fg.renderOrder = 10; g.add(bg, fg); g.userData.fg = fg; g.visible = false;
  return g;
}
export function setOutlineColor(model, hex) { for (const m of model.userData.omats) m.color.setHex(hex); }
export function flash(model, on) {
  for (const m of model.userData.mats) { if (!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(on ? new THREE.Color(0xffffff).multiplyScalar(0.6) : m.userData.e0); }
}
export function tint(model, hex, k) {
  for (const m of model.userData.mats) { if (!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(m.userData.e0).lerp(new THREE.Color(hex), k); }
}
