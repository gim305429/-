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
    m.userData.outline = ol; ol.userData.isOutline = true; ol.userData.of = m;
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

// ---------- 끝없이 이어지는 풀 (카메라 주변 타일을 감싸 돈다) ----------
export function makeGrass(count, tile, fog) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, 1, 0], 3));
  const tint = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, null, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    e.set(0, Math.random() * Math.PI, 0); q.setFromEuler(e);
    const s = 0.28 + Math.random() * 0.42;
    m4.compose(new THREE.Vector3((Math.random() - 0.5) * tile, 0, (Math.random() - 0.5) * tile), q, new THREE.Vector3(0.8 + Math.random() * 0.8, s, 1));
    mesh.setMatrixAt(i, m4); tint[i] = Math.random();
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  mesh.material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, tile: { value: tile }, base: { value: new THREE.Color(0x88c278) }, tip: { value: new THREE.Color(0xc8e88e) },
      fogC: { value: new THREE.Color(fog.color) }, fogN: { value: fog.near }, fogF: { value: fog.far } },
    vertexShader: `
      uniform float time; uniform vec3 cam; uniform float tile; attribute float aTint; varying float vH; varying float vT; varying float vD;
      void main(){
        vec4 ip = instanceMatrix * vec4(position, 1.0);
        vec2 base = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float hT = tile * 0.5;
        vec2 rel = mod(base - cam.xz + hT, tile) - hT;
        vec2 shift = rel + cam.xz - base;
        vec4 wp = vec4(ip.x + shift.x, ip.y, ip.z + shift.y, 1.0);
        float fade = 1.0 - smoothstep(hT * 0.6, hT, length(rel));
        wp.y *= fade;
        float h = position.y; vH = h; vT = aTint;
        float sway = (sin(time*1.7 + wp.x*0.35 + wp.z*0.22) * 0.5 + 0.7) * 0.22 * h * fade;
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
  mesh.userData.tick = (t, cam) => { mesh.material.uniforms.time.value = t; if (cam) mesh.material.uniforms.cam.value.copy(cam.position); };
  return mesh;
}

// ---------- 월드 소품 ----------
export function makeGround(R, regionTints) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CircleGeometry(R + 120, 64), toonMat(PALETTE.grass)); base.rotation.x = -Math.PI / 2; g.add(base);
  regionTints.forEach((c, i) => { // 지역마다 풀빛을 살짝 다르게
    const a0 = (i / regionTints.length) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.RingGeometry(18, R + 10, 24, 1, a0, Math.PI * 2 / regionTints.length), toonMat(c));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.005; g.add(m);
  });
  return g;
}
export function makeTree(x, z, s = 1, kind = 0) {
  const g = group();
  addPart(g, G.cyl(0.25, 0.4, 3, 7), 0x8a6a4a, [0, 1.5, 0]);
  const leaf = [0x6fae5c, 0x7cba62, 0x5f9e52][kind % 3];
  addPart(g, G.sph(1.8, 10, 8), leaf, [0, 3.8, 0], { ow: 0.06 });
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
  } else if (kind === 'giantshroom') {
    addPart(g, G.cyl(r * 0.35, r * 0.45, r * 2.4, 10), 0xf2e6cf, [0, r * 1.2, 0], { ow: 0.05 });
    addPart(g, G.hemi(r * 1.4), [0xd9614c, 0xa36bd1, 0xe08a4a][Math.floor(Math.random() * 3)], [0, r * 2.2, 0], { scale: [1, 0.6, 1], ow: 0.06 });
  } else if (kind === 'crystal') {
    for (let i = 0; i < 4; i++) addPart(g, G.cone(r * 0.35, r * (2 + Math.random() * 2), 5), 0x9fd8f0, [Math.cos(i * 1.7) * r * 0.4, r, Math.sin(i * 1.7) * r * 0.4], { rot: [Math.random() * 0.4 - 0.2, 0, Math.random() * 0.4 - 0.2], mat: { emissive: 0x1a5a70 }, ow: 0.04 });
  } else {
    addPart(g, new THREE.DodecahedronGeometry(r, 0), 0xb9b0a0, [0, r * 0.55, 0], { ow: 0.06, scale: [1, 0.75, 1] });
    addPart(g, G.sph(r * 0.4, 8, 6), PALETTE.moss, [r * 0.3, r * 1.0, 0.1], { outline: false });
  }
  return g;
}
export function makeCliffRing(R) {
  const g = group();
  const n = 60;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, rr = R + 6 + Math.random() * 6, h = 10 + Math.random() * 14, w = 6 + Math.random() * 5;
    addPart(g, G.cyl(w * 0.7, w, h, 7), [0xc9c0ad, 0xbdb39d, 0xd3cab6][i % 3], [Math.cos(a) * rr, h / 2, Math.sin(a) * rr], { ow: 0.2 });
    addPart(g, G.cyl(w * 0.72, w * 0.72, 1.2, 7), PALETTE.moss, [Math.cos(a) * rr, h + 0.4, Math.sin(a) * rr], { outline: false });
  }
  return g;
}
export function makeCastle() {
  const g = group();
  addPart(g, G.cyl(26, 34, 26, 9), 0xc9c0ad, [0, 13, 0], { ow: 0.3 });
  addPart(g, G.cyl(26.5, 26.5, 2, 9), PALETTE.moss, [0, 26.5, 0], { outline: false });
  for (const [x, y, z, r, h] of [[0, 32, 0, 6, 12], [-6, 30, 2, 3.2, 9], [6, 30, -1, 3.2, 10], [2, 36, -3, 2.2, 14]]) {
    addPart(g, G.cyl(r, r, h, 8), 0xe8e0d0, [x, y, z], { ow: 0.15 });
    addPart(g, G.cone(r * 1.25, h * 0.6, 8), 0x7d8fb3, [x, y + h / 2 + h * 0.3, z], { ow: 0.15 });
  }
  return g;
}
export function makeWindmill() {
  const g = group();
  addPart(g, G.cyl(1.6, 2.4, 8, 10), 0xf1e8d6, [0, 4, 0], { ow: 0.06 });
  addPart(g, G.cone(2.3, 2.6, 10), 0xc0614a, [0, 9.3, 0], { ow: 0.06 });
  addPart(g, G.box(0.9, 1.6, 0.2), 0x8a6a4a, [0, 0.8, 2.3]);
  const blades = group(); blades.position.set(0, 7.2, 2.3);
  for (let i = 0; i < 4; i++) { const b = addPart(blades, G.box(0.9, 5.2, 0.12), 0xe8dcc0, [0, 2.6, 0], { ow: 0.04 }); const piv = new THREE.Group(); piv.add(b, b.userData.outline); piv.rotation.z = i * Math.PI / 2; blades.add(piv); }
  addPart(blades, G.sph(0.4, 8, 6), 0x8a6a4a, [0, 0, 0.1]);
  g.add(blades); g.userData.blades = blades;
  return g;
}
export function makeTent(color) {
  const g = group();
  addPart(g, G.cone(2.2, 2.6, 4), color, [0, 1.3, 0], { rot: [0, Math.PI / 4, 0], ow: 0.05 });
  addPart(g, G.box(0.7, 1.2, 0.1), 0x3a3226, [0, 0.6, 1.2], { outline: false });
  return g;
}
export function makeCampfire() {
  const g = group();
  for (let i = 0; i < 4; i++) addPart(g, G.cyl(0.1, 0.1, 1.1, 6), 0x7a5232, [0, 0.12, 0], { rot: [Math.PI / 2, i * Math.PI / 4, 0], ow: 0.02 });
  const f1 = new THREE.Mesh(G.cone(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  const f2 = new THREE.Mesh(G.cone(0.2, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  f1.position.y = 0.5; f2.position.y = 0.45; g.add(f1, f2); g.userData.flame = [f1, f2];
  for (let i = 0; i < 8; i++) addPart(g, G.sph(0.18, 6, 5), 0x9a9286, [Math.cos(i * 0.785) * 0.75, 0.1, Math.sin(i * 0.785) * 0.75], { outline: false });
  return g;
}
// 몬스터 거점: 선돌 고리와 깃발. 정화하면 깃발이 금색으로 바뀐다
export function makeCamp() {
  const g = group();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, h = 2 + Math.random() * 1.6; addPart(g, G.box(0.9, h, 0.6), 0xb7ae9c, [Math.cos(a) * 9, h / 2, Math.sin(a) * 9], { rot: [0, -a, (Math.random() - 0.5) * 0.2], ow: 0.04 }); }
  addPart(g, G.cyl(0.08, 0.08, 5, 6), 0x5a3a20, [0, 2.5, 0], { ow: 0.02 });
  const flag = addPart(g, G.box(1.6, 1.0, 0.05), 0x9a2f2f, [0.82, 4.4, 0], { ow: 0.02 });
  g.userData.flag = flag;
  const fire = makeCampfire(); fire.position.set(2.2, 0, 1.4); g.add(fire); g.userData.fire = fire;
  return g;
}
export function makeLair(final) {
  const g = group();
  const n = final ? 12 : 9, R = final ? 21 : 17;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, h = final ? 7 + (i % 3) * 2 : 4 + (i % 2) * 2;
    addPart(g, G.box(1.6, h, 1.6), final ? 0x9a8f80 : PALETTE.stone, [Math.cos(a) * R, h / 2, Math.sin(a) * R], { rot: [0, -a, 0], ow: 0.06 });
    if (i % 2 === 0) addPart(g, G.box(1.8, 0.6, 1.8), PALETTE.moss, [Math.cos(a) * R, h + 0.2, Math.sin(a) * R], { rot: [0, -a, 0], outline: false });
  }
  return g;
}
export function makeBarrier(r) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xb07de0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  m.position.y = 7; g.add(m);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: 0xd8b0ff }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  g.userData.wall = m; return g;
}
// 기믹: 상승 기류
export function makeJumpPad() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.6, 32), new THREE.MeshBasicMaterial({ color: 0xe8fff0, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.05; g.add(base);
  const sp = new THREE.Group(); g.add(sp);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(G.cone(0.12, 0.6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); const a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 1.1, 0.4 + i * 0.35, Math.sin(a) * 1.1); sp.add(c); }
  g.userData.spin = sp; return g;
}
// 기믹: 폭발 버섯
export function makeBoomShroom() {
  const g = group();
  addPart(g, G.cyl(0.22, 0.3, 0.6), 0xf2e6cf, [0, 0.3, 0]);
  const cap = addPart(g, G.sph(0.65, 12, 10), 0xff8a3a, [0, 0.9, 0], { scale: [1, 0.75, 1], mat: { emissive: 0x5a2000 } });
  for (const [x, y, z] of [[0.35, 1.2, 0.3], [-0.4, 1.1, 0.2], [0, 1.3, -0.35], [0.1, 1.0, 0.55]]) addPart(g, G.sph(0.09, 6, 5), 0xfff3a0, [x, y, z], { outline: false, mat: { emissive: 0x806020 } });
  g.userData.cap = cap; return g;
}
// 기믹: 번개 수정
export function makeLCrystal() {
  const g = group();
  addPart(g, G.cyl(0.9, 1.1, 0.5, 8), 0x9a9286, [0, 0.25, 0], { ow: 0.04 });
  const c = addPart(g, new THREE.OctahedronGeometry(0.8), 0x8fd8ff, [0, 2.0, 0], { scale: [0.7, 1.6, 0.7], mat: { emissive: 0x2a7aa8 }, ow: 0.04 });
  g.userData.core = c; return g;
}
// 기믹: 치유의 샘
export function makeSpring() {
  const g = group();
  const w = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.85 }));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.06; g.add(w); g.userData.water = w;
  for (let i = 0; i < 12; i++) addPart(g, G.sph(0.4, 7, 5), 0xc9c0ad, [Math.cos(i * 0.52) * 2.9, 0.12, Math.sin(i * 0.52) * 2.9], { scale: [1, 0.5, 1], ow: 0.02 });
  return g;
}
// 기믹: 가시 덤불
export function makeThornBush(r) {
  const g = group();
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, d = Math.random() * r * 0.7; addPart(g, G.sph(0.6 + Math.random() * 0.5, 7, 5), 0x4a6a3a, [Math.cos(a) * d, 0.4, Math.sin(a) * d], { ow: 0.03 }); }
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = Math.random() * r * 0.8; addPart(g, G.cone(0.07, 0.6, 4), 0x2e3a22, [Math.cos(a) * d, 0.7, Math.sin(a) * d], { rot: [Math.random() - 0.5, 0, Math.random() - 0.5], outline: false }); }
  return g;
}
export function makeFlowers(points) {
  const geo = G.sph(0.09, 5, 4);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), points.length);
  const m4 = new THREE.Matrix4(), cols = [0xffffff, 0xffe066, 0xf6a6c8, 0xb8a6ff];
  points.forEach(([x, z], i) => { m4.makeTranslation(x, 0.3, z); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, new THREE.Color(cols[i % 4])); });
  return mesh;
}

// ---------- 무기 디자인 (종류 look 0~2, 등급 r 0~4) ----------
const METAL = [0xc8ced4, 0xc8ced4, 0xd6dde4, 0xdcd6ee, 0xf0c060];
function gemMat(r) { const c = new THREE.Color(D_RC[r]); return { emissive: r >= 2 ? c.clone().multiplyScalar(r >= 3 ? 0.6 : 0.35).getHex() : 0x000000 }; }
const D_RC = [0xf4f1e8, 0x7ccf6a, 0x5fa8e8, 0xb07de0, 0xf0a040];
// 검(손잡이 원점, 날은 +y)
function makeSword(look, r) {
  const g = group();
  const metal = METAL[r];
  if (look === 0) addPart(g, G.box(0.06, 0.9, 0.016), metal, [0, 0.55, 0], { ow: 0.008 });
  else if (look === 1) { addPart(g, G.box(0.11, 0.78, 0.02), metal, [0, 0.49, 0], { ow: 0.008 }); addPart(g, G.cone(0.055, 0.12, 4), metal, [0, 0.94, 0], { scale: [1, 1, 0.3], ow: 0.006 }); }
  else for (let i = 0; i < 5; i++) addPart(g, G.box(0.065, 0.19, 0.016), metal, [Math.sin(i * 0.22) * 0.12, 0.17 + i * 0.17, 0], { rot: [0, 0, -i * 0.12], ow: 0.006 });
  addPart(g, G.box(look === 2 ? 0.16 : 0.24, 0.045, 0.05), r === 4 ? 0xf0c060 : 0xa07a40, [0, 0.08, 0], { ow: 0.006 });
  addPart(g, G.cyl(0.022, 0.022, 0.16, 6), 0x5a3a20, [0, -0.02, 0], { ow: 0.006 });
  addPart(g, G.sph(0.035, 8, 6), D_RC[r], [0, -0.11, 0], { outline: false, mat: gemMat(r) });
  return g;
}
// 방패(앞면 +z)
function makeShield(look, r) {
  const g = group();
  const wood = [0x8a5a32, 0x7a5a8a, 0x9a6a3a][look], rim = METAL[r];
  if (look === 0) { addPart(g, G.cyl(0.26, 0.26, 0.05, 20), wood, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ow: 0.01 }); addPart(g, G.tor(0.26, 0.02), rim, [0, 0, 0.02], { outline: false }); }
  else if (look === 1) { addPart(g, G.box(0.3, 0.3, 0.05), wood, [0, 0.06, 0], { rot: [0, 0, Math.PI / 4], scale: [1, 1.5, 1], ow: 0.01 }); addPart(g, G.box(0.04, 0.5, 0.06), rim, [0, 0.02, 0.01], { outline: false }); }
  else { addPart(g, G.cyl(0.17, 0.17, 0.05, 16), rim, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ow: 0.01 }); addPart(g, G.cone(0.05, 0.12, 6), rim, [0, 0, 0.07], { rot: [Math.PI / 2, 0, 0], outline: false }); }
  addPart(g, G.sph(0.05, 8, 6), D_RC[r], [0, look === 1 ? 0.12 : 0.02, 0.035], { outline: false, mat: gemMat(r) });
  return g;
}
// 지팡이(손잡이 원점, 끝은 +y, userData.tip 은 마법이 나오는 자리)
function makeStaff(cls, look, r) {
  const g = group();
  const wood = cls === 'mage' ? [0x6a4a2e, 0x2e2a3a, 0x4a3a5a][look] : [0x8a6a4a, 0xd6dde4, 0xf4f1e8][look];
  const len = cls === 'cleric' && look === 1 ? 0.7 : 1.25;
  if (cls === 'mage' && look === 0) for (let i = 0; i < 4; i++) addPart(g, G.cyl(0.026, 0.032, len / 4 + 0.02, 6), wood, [Math.sin(i * 1.9) * 0.02, -0.3 + i * len / 4 + len / 8, 0], { rot: [0, 0, Math.sin(i * 1.3) * 0.12], ow: 0.006 });
  else addPart(g, G.cyl(0.025, 0.03, len, 7), wood, [0, len / 2 - 0.3, 0], { ow: 0.006 });
  const top = len - 0.3, tip = new THREE.Object3D(); tip.position.set(0, top + 0.1, 0); g.add(tip); g.userData.tip = tip;
  const gem = D_RC[r];
  if (cls === 'mage') {
    if (look === 0) { for (let i = 0; i < 3; i++) addPart(g, G.cone(0.02, 0.14, 4), wood, [Math.cos(i * 2.1) * 0.06, top + 0.04, Math.sin(i * 2.1) * 0.06], { rot: [Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5], outline: false }); addPart(g, G.sph(0.06, 10, 8), gem, [0, top + 0.08, 0], { outline: false, mat: gemMat(Math.max(r, 2)) }); }
    else if (look === 1) addPart(g, new THREE.OctahedronGeometry(0.07), gem, [0, top + 0.12, 0], { scale: [0.8, 1.8, 0.8], mat: gemMat(Math.max(r, 2)), ow: 0.006 });
    else { addPart(g, G.tor(0.09, 0.012), r === 4 ? 0xf0c060 : 0xb8c0c8, [0, top + 0.1, 0], { outline: false }); const rune = addPart(g, new THREE.OctahedronGeometry(0.04), gem, [0, top + 0.1, 0], { outline: false, mat: gemMat(Math.max(r, 2)) }); g.userData.spin = rune; }
  } else {
    if (look === 0) { addPart(g, G.tor(0.08, 0.014), r === 4 ? 0xf0c060 : 0xd4b04a, [0, top + 0.1, 0], { outline: false }); addPart(g, G.sph(0.045, 10, 8), gem, [0, top + 0.1, 0], { outline: false, mat: gemMat(Math.max(r, 1)) }); }
    else if (look === 1) { addPart(g, G.sph(0.08, 10, 8), METAL[r], [0, top + 0.06, 0], { ow: 0.006 }); for (let i = 0; i < 5; i++) addPart(g, G.cone(0.02, 0.08, 4), 0xd4b04a, [Math.cos(i * 1.26) * 0.07, top + 0.13, Math.sin(i * 1.26) * 0.07], { outline: false }); addPart(g, G.sph(0.03, 8, 6), gem, [0, top + 0.15, 0], { outline: false, mat: gemMat(Math.max(r, 1)) }); }
    else { for (const s of [-1, 1]) addPart(g, G.cone(0.05, 0.22, 4), 0xffffff, [s * 0.09, top + 0.05, 0], { rot: [0, 0, s * 1.1], scale: [1, 1, 0.3], ow: 0.006 }); addPart(g, new THREE.OctahedronGeometry(0.05), gem, [0, top + 0.12, 0], { outline: false, mat: gemMat(Math.max(r, 1)) }); }
  }
  return g;
}
// 활: 바깥 그룹 기준 시위 끝점 ±y, 활대는 앞(−z)으로 휜다. userData.string 을 −y 로 옮기면 당겨진다
function makeBow(look, r) {
  const outer = group(), inner = group(); outer.add(inner); inner.userData = outer.userData;
  const R = [0.32, 0.46, 0.36][look], wood = [0x7a5232, 0x8a6a4a, 0x5a3a2a][look];
  addPart(inner, G.tor(R, 0.016, Math.PI), wood, [0, 0, 0], { ow: 0.006 });
  if (look === 2) for (const s of [-1, 1]) addPart(inner, G.cone(0.02, 0.1, 4), wood, [s * R, -0.03, 0], { rot: [0, 0, s * 2.6], outline: false });
  addPart(inner, G.sph(0.03, 8, 6), D_RC[r], [0, R, 0.02], { outline: false, mat: gemMat(r) });
  if (r >= 3) addPart(inner, G.tor(0.035, 0.008), r === 4 ? 0xf0c060 : 0xb07de0, [0, R, 0], { rot: [Math.PI / 2, 0, 0], outline: false });
  outer.userData.R = R;
  const str = new THREE.Mesh(G.cyl(0.004, 0.004, R * 2, 4), new THREE.MeshBasicMaterial({ color: 0xf4efe4 }));
  str.rotation.z = Math.PI / 2; inner.add(str); outer.userData.string = str;
  inner.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
  inner.position.z = R; // 손잡이(활대 가운데)가 바깥 그룹 원점에 오도록
  return outer;
}
export function makeWeapon(cls, item) {
  const look = item ? (item.look ?? 0) : 0, r = item ? item.r : 0;
  if (cls === 'warrior') return { main: makeSword(look, r), off: makeShield(look, r) };
  if (cls === 'archer') return { main: makeBow(look, r) };
  return { main: makeStaff(cls, look, r) };
}
const SLEEVES = [0x8a6a4a, 0x9aa3ad, null];
const CLASS_TINT = { warrior: 0xc0614a, cleric: 0xeee8f6, mage: 0x5b3f8a, archer: 0x5f8a4a };
function sleeveColor(cls, armor) { const v = armor ? SLEEVES[armor.look ?? 0] : null; return v ?? CLASS_TINT[cls]; }

// ---------- 1인칭 손과 무기 ----------
const SKIN = 0xf1c7a0;
export function makeViewModel(cls, weapon, armor) {
  const g = group();
  const L = group(), R = group(); g.add(L, R);
  const sl = sleeveColor(cls, armor), trim = armor ? D_RC[armor.r] : 0xd8cfbf;
  const hand = p => {
    addPart(p, G.cyl(0.07, 0.085, 0.45, 8), sl, [0, -0.05, 0.12], { rot: [Math.PI / 2, 0, 0], ow: 0.01 });
    addPart(p, G.cyl(0.088, 0.088, 0.05, 8), trim, [0, -0.05, -0.08], { rot: [Math.PI / 2, 0, 0], outline: false });
    addPart(p, G.box(0.11, 0.06, 0.13), SKIN, [0, -0.05, -0.15], { ow: 0.01 });
  };
  hand(L); hand(R);
  const w = makeWeapon(cls, weapon);
  const U = g.userData;
  if (cls === 'warrior') {
    w.main.position.set(0, -0.02, -0.18); w.main.rotation.set(-1.0, 0, 0.55); w.main.scale.setScalar(0.78); R.add(w.main); U.blade = w.main;
    w.off.position.set(0.02, 0.05, -0.2); w.off.rotation.set(0, 0.55, 0.12); w.off.scale.setScalar(0.85); L.add(w.off);
    L.position.set(-0.42, -0.34, -0.55); R.position.set(0.34, -0.3, -0.5);
  } else if (cls === 'archer') {
    // 활은 왼손, 화살은 활(시위)에 붙어 함께 당겨진다
    w.main.position.set(0, 0, -0.16); L.add(w.main); U.bow = w.main; U.string = w.main.userData.string;
    const Rb = w.main.userData.R, arrow = group(); w.main.add(arrow);
    addPart(arrow, G.cyl(0.008, 0.008, 0.62, 5), 0xc89a5a, [0, 0, Rb - 0.31], { rot: [Math.PI / 2, 0, 0], ow: 0.004 });
    addPart(arrow, G.cone(0.02, 0.06, 4), 0xdfe5ea, [0, 0, Rb - 0.64], { rot: [-Math.PI / 2, 0, 0], ow: 0.004 });
    for (const s of [-1, 1]) addPart(arrow, G.box(0.002, 0.03, 0.07), 0xe85a4a, [0, s * 0.012, Rb - 0.04], { outline: false });
    U.arrow = arrow; U.bowR = Rb;
    L.position.set(-0.3, -0.24, -0.6); R.position.set(0.3, -0.45, -0.42);
  } else {
    // 지팡이는 오른손에 비스듬히 세워 들고, 마법은 지팡이 끝에서 나간다
    w.main.position.set(0, -0.05, -0.16); w.main.rotation.set(-0.6, 0, 0.22); w.main.scale.setScalar(0.8); R.add(w.main); U.staff = w.main; U.tip = w.main.userData.tip;
    const glow = new THREE.Mesh(G.sph(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: cls === 'mage' ? 0xbfa8ff : 0xfff3a0, transparent: true, opacity: 0.0, depthWrite: false }));
    const halo = new THREE.Mesh(G.sph(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: cls === 'mage' ? 0xffd08a : 0xfff8d0, transparent: true, opacity: 0.0, depthWrite: false }));
    glow.add(halo); U.tip.add(glow); U.orb = glow; U.halo = halo;
    const hglow = new THREE.Mesh(G.sph(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.0, depthWrite: false }));
    hglow.position.set(0, 0, -0.25); L.add(hglow); U.glow = hglow;
    L.position.set(-0.34, -0.36, -0.5); R.position.set(0.28, -0.3, -0.5);
  }
  L.scale.setScalar(0.62); R.scale.setScalar(0.62);
  U.L = L; U.R = R; U.base = { L: L.position.clone(), R: R.position.clone() };
  return g;
}

// ---------- 3인칭 동료 모습 ----------
export function makeAvatar(cls, weapon, armor) {
  const g = group();
  const body = CLASS_TINT[cls], sl = sleeveColor(cls, armor);
  const legL = addPart(g, G.box(0.18, 0.7, 0.2), 0x4a3f36, [-0.13, 0.35, 0]);
  const legR = addPart(g, G.box(0.18, 0.7, 0.2), 0x4a3f36, [0.13, 0.35, 0]);
  addPart(g, G.cyl(0.26, 0.3, 0.75, 10), sl, [0, 1.07, 0], { ow: 0.02 });
  addPart(g, G.cone(0.42, 0.9, 10), body, [0, 1.0, -0.06], { scale: [1, 1, 0.6], ow: 0.02 });
  addPart(g, G.sph(0.22, 12, 10), SKIN, [0, 1.62, 0], { ow: 0.02 });
  addPart(g, G.hemi(0.24), cls === 'mage' ? 0x3d2a5e : cls === 'cleric' ? 0xf4f1e8 : 0x6a4a2e, [0, 1.65, -0.02], { ow: 0.02 });
  if (cls === 'mage') addPart(g, G.cone(0.26, 0.5, 10), 0x3d2a5e, [0, 1.95, -0.02], { ow: 0.02 });
  for (const x of [-0.08, 0.08]) addPart(g, G.sph(0.03, 6, 5), 0x2a2230, [x, 1.64, 0.2], { outline: false });
  const armR = new THREE.Group(), armL = new THREE.Group(); armR.position.set(0.34, 1.35, 0); armL.position.set(-0.34, 1.35, 0); g.add(armR, armL);
  const a1 = group(); armR.add(a1); addPart(a1, G.box(0.13, 0.55, 0.13), sl, [0, -0.25, 0]); a1.userData = g.userData;
  const a2 = group(); armL.add(a2); addPart(a2, G.box(0.13, 0.55, 0.13), sl, [0, -0.25, 0]); a2.userData = g.userData;
  const w = makeWeapon(cls, weapon);
  const s = 1.25;
  w.main.scale.setScalar(s);
  if (cls === 'archer') { w.main.position.set(0, -0.52, 0.12); armL.add(w.main); }
  else { w.main.position.set(0, -0.52, 0.05); w.main.rotation.x = cls === 'warrior' ? 1.2 : 0.2; armR.add(w.main); }
  if (w.off) { w.off.scale.setScalar(s); w.off.position.set(-0.05, -0.4, 0.15); armL.add(w.off); }
  g.userData.armR = armR; g.userData.armL = armL; g.userData.legs = [legL, legR];
  return bakeGroup(g);
}

// ---------- 몬스터 ----------
const EYE = 0x2a2230;
function eyes(g, y, z, sep = 0.12, s = 0.06, c = EYE) {
  addPart(g, G.sph(s, 8, 6), c, [-sep, y, z], { outline: false });
  addPart(g, G.sph(s, 8, 6), c, [sep, y, z], { outline: false });
}
const monTpl = new Map();
export function makeMonster(key, d) {
  if (!monTpl.has(key)) monTpl.set(key, bakeGroup(buildMonster(key, d), null, true));
  return instantiate(monTpl.get(key));
}
function buildMonster(key, d) {
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
      // 방패는 따로 움직인다(돌진 자세), 머리 위 느낌표는 돌진 전조
      const sh = group(); sh.position.set(-0.25, 1.0, 0.42); g.add(sh);
      addPart(sh, G.box(0.7, 0.9, 0.1), key === 'shadow' ? 0x5a4f7a : 0x8a6a4a, [0, 0, 0]);
      addPart(sh, G.box(0.12, 0.6, 0.04), key === 'shadow' ? 0xc59bff : 0xd6c49a, [0, 0, 0.06], { outline: false });
      addPart(g, G.box(0.06, 0.9, 0.12), 0xd6dbe0, [0.42, 1.0, 0.3]);
      const alert = new THREE.Group(); alert.position.set(0, 2.35, 0); alert.visible = false; g.add(alert);
      const am = new THREE.MeshBasicMaterial({ color: 0xffd23a, depthTest: false }); am.userData.keep = true;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), am); bar.position.y = 0.18; bar.renderOrder = 11;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), am); dot.position.y = -0.14; dot.renderOrder = 11;
      alert.add(bar, dot);
      g.userData.shield = sh; g.userData.alert = alert;
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

// ---------- 효과 ----------
// 여러 번 쓰는 도형은 하나만 만들어 같이 쓴다 (keep = 지우지 않음)
const SH = {}; const shared = (k, mk) => SH[k] || (SH[k] = (g => (g.userData.keep = true, g))(mk()));
export function telegraphCircle(r, color = PALETTE.danger) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(shared('circ', () => new THREE.CircleGeometry(1, 32)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
  const ring = new THREE.Mesh(shared('ring93', () => new THREE.RingGeometry(0.93, 1, 40)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  fill.rotation.x = ring.rotation.x = -Math.PI / 2; g.add(fill, ring); g.scale.setScalar(r); g.position.y = 0.04;
  g.userData.fill = fill; return g;
}
export function telegraphLine(len, w, color = PALETTE.danger) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.geometry.translate(0, -len / 2, 0); // 그룹의 +z(rot 방향)로 뻗는다
  const g = new THREE.Group(); g.add(m); g.position.y = 0.05; return g;
}
export function orb(r, color, glow = true) {
  const unit = shared('sph1', () => G.sph(1, 10, 8));
  const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color })); m.scale.setScalar(r);
  if (glow) { const h = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false })); h.scale.setScalar(1.8); m.add(h); }
  return m;
}
let arrowTpl = null;
export function arrowMesh() {
  if (!arrowTpl) { const g = group();
    addPart(g, G.cyl(0.02, 0.02, 0.8, 5), 0xc89a5a, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ow: 0.008 });
    addPart(g, G.cone(0.05, 0.12, 4), 0xdfe5ea, [0, 0, 0.45], { rot: [Math.PI / 2, 0, 0], ow: 0.008 });
    arrowTpl = bakeGroup(g, null, true); }
  return instantiate(arrowTpl);
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
  const m = new THREE.Mesh(shared('ring85', () => new THREE.RingGeometry(0.85, 1, 40)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.08; m.scale.setScalar(r); return m;
}
export function cloud(r, color, op = 0.35) {
  const m = new THREE.Mesh(shared('sph14', () => G.sph(1, 14, 8)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
  m.scale.set(r, r * 0.35, r); return m;
}
const BAR_BG = new THREE.MeshBasicMaterial({ color: 0x2a2230, depthTest: false, transparent: true }), BAR_FG = new THREE.MeshBasicMaterial({ color: 0xe8736c, depthTest: false, transparent: true });
BAR_BG.userData.keep = BAR_FG.userData.keep = true;
export function hpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(shared('barbg', () => new THREE.PlaneGeometry(1, 0.1)), BAR_BG);
  const fg = new THREE.Mesh(shared('barfg', () => new THREE.PlaneGeometry(1, 0.1).translate(0.5, 0, 0)), BAR_FG);
  fg.position.x = -0.5; fg.position.z = 0.001;
  bg.renderOrder = fg.renderOrder = 10; g.add(bg, fg); g.userData.fg = fg; g.visible = false;
  return g;
}
export function setOutlineColor(model, hex) { for (const m of model.userData.omats) { if (m.vertexColors) { m.vertexColors = false; m.needsUpdate = true; } m.color.setHex(hex); } }
const FLASH = new THREE.Color(0xffffff).multiplyScalar(0.6), TMP_C = new THREE.Color();
// 같은 상태면 다시 계산하지 않는다
export function flash(model, on) {
  const key = on ? 'f' : 'n'; if (model.userData.fk === key) return; model.userData.fk = key;
  for (const m of model.userData.mats) { if (!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(on ? FLASH : m.userData.e0); }
}
export function tint(model, hex, k) {
  const key = hex + ':' + Math.round(k * 20); if (model.userData.fk === key) return; model.userData.fk = key;
  TMP_C.setHex(hex);
  for (const m of model.userData.mats) { if (!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(m.userData.e0).lerp(TMP_C, k); }
}
// 화면에서 뺀 물체의 도형·재질을 그래픽 메모리에서 지운다 (같이 쓰는 것은 남긴다)
export function dispose(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse(o => {
    if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if (!m.userData.keep) m.dispose();
  });
}

// ---------- 묶어 그리기 (최적화) ----------
// 같은 덩어리의 부품들을 정점 색으로 칠한 하나의 도형으로 합친다 → 그리는 횟수가 부품 수만큼 줄어든다
const mergeable = (m, anyEm) => m && m.isMesh && !m.isInstancedMesh && !m.userData.isOutline && m.material.isMeshToonMaterial && !m.material.transparent && !m.material.map && !m.material.vertexColors && (anyEm || m.material.emissive.getHex() === 0) && m.visible;
function mergeGeos(list, matOf) {
  let n = 0; const parts = [];
  for (const m of list) { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(matOf(m)); parts.push([g, m.material.color]); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of parts) {
    const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += k; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere(); geo.userData.keep = true; return geo;
}
function mergedPair(body, line, matOf, emissive = 0) {
  const out = [];
  if (body.length) out.push(new THREE.Mesh(mergeGeos(body, matOf), toonMat(0xffffff, { vertexColors: true, emissive })));
  if (line.length) { const ol = new THREE.Mesh(mergeGeos(line, matOf), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })); ol.userData.isOutline = true; out.push(ol); }
  return out;
}
// 모델 안쪽 정리: 움직이는 부품(userData 로 가리키는 것)은 그대로 두고 나머지를 합친다
export function bakeGroup(g, keep, tpl = false) {
  if (!keep) { keep = new Set(); const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && v.isObject3D) keep.add(v); };
    g.traverse(o => { for (const k in o.userData) if (k !== 'mats' && k !== 'omats' && k !== 'of' && k !== 'outline') walk(o.userData[k]); }); }
  const body = [], line = [];
  for (const c of [...g.children]) {
    if (!c.isMesh) { bakeGroup(c, keep, tpl); continue; }
    if (!keep.has(c) && mergeable(c)) body.push(c);
  }
  const bodySet = new Set(body);
  for (const c of g.children) if (c.userData.isOutline && bodySet.has(c.userData.of)) line.push(c);
  for (const c of [...body, ...line]) { c.updateMatrix(); g.remove(c); }
  const merged = mergedPair(body, line, m => m.matrix);
  for (let i = merged.length - 1; i >= 0; i--) { merged[i].parent = g; g.children.unshift(merged[i]); }
  for (const c of [...body, ...line]) c.geometry.dispose();
  if (tpl) g.traverse(o => { if (o.geometry) o.geometry.userData.keep = true; }); // 틀의 도형은 찍어낸 모델들이 같이 쓴다
  return g;
}
// 원본(틀)에서 새 모델을 찍어낸다: 도형은 같이 쓰고 재질만 따로 (번쩍임·색 바꾸기는 개체마다)
function instantiate(tpl) {
  const map = new Map();
  const copy = o => {
    const n = o.isMesh ? new THREE.Mesh(o.geometry, o.material.userData.keep ? o.material : o.material.clone()) : new THREE.Group();
    n.position.copy(o.position); n.quaternion.copy(o.quaternion); n.scale.copy(o.scale); n.visible = o.visible; n.renderOrder = o.renderOrder; map.set(o, n);
    for (const c of o.children) n.add(copy(c)); return n;
  };
  const g = copy(tpl);
  const mp = v => Array.isArray(v) ? v.map(mp) : (v && v.isObject3D ? map.get(v) : v);
  for (const [o, n] of map) for (const k in o.userData) if (k !== 'mats' && k !== 'omats') n.userData[k] = mp(o.userData[k]);
  g.userData.mats = []; g.userData.omats = []; g.userData.olines = [];
  for (const n of map.values()) if (n.isMesh) {
    if (n.userData.isOutline) { g.userData.omats.push(n.material); g.userData.olines.push(n); }
    else if (n.material.emissive) g.userData.mats.push(n.material);
  }
  return g;
}
// 움직이지 않는 지형 소품을 구역(cell m)별로 합친다. 합칠 수 없는 부품은 그대로 옮겨 둔다
export function bakeStatic(objs, cell = 40) {
  const tmp = new THREE.Group(); for (const o of objs) tmp.add(o); tmp.updateMatrixWorld(true);
  const out = new THREE.Group(), buckets = new Map(), keepers = [], wp = new THREE.Vector3();
  tmp.traverse(m => {
    if (!m.isMesh) return;
    if (mergeable(m, true)) { m.getWorldPosition(wp); const em = m.material.emissive.getHex(), k = Math.floor(wp.x / cell) + ',' + Math.floor(wp.z / cell) + ',' + em; if (!buckets.has(k)) buckets.set(k, { body: [], line: [], em }); buckets.get(k).body.push(m); }
    else if (!(m.userData.isOutline && mergeable(m.userData.of, true))) keepers.push(m);
  });
  for (const b of buckets.values()) { for (const m of b.body) if (m.userData.outline) b.line.push(m.userData.outline); out.add(...mergedPair(b.body, b.line, m => m.matrixWorld, b.em)); }
  for (const m of keepers) out.attach(m);
  tmp.traverse(m => { if (m.isMesh && m.parent !== out && m.geometry) m.geometry.dispose(); });
  return out;
}
// 작은 조각 효과: 상자 하나를 수백 번 한 번에 그린다
export function makeParticles(max) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); m.count = 0; m.frustumCulled = false;
  m.geometry.userData.keep = true; m.material.userData.keep = true; return m;
}
