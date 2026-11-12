// 공용 상태·렌더러·저장·시각 효과(방장이 만든 효과를 참가자에게도 똑같이 보여준다)
import * as THREE from 'three';
import * as A from './art.js';
import * as D from './data.js';
import * as UI from './ui.js';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const G = {
  mode: 'town', isTouch, time: 0, timeScale: 1, hitStop: 0, net: null, save: null, run: null, world: null, me: null,
  input: { mx: 0, my: 0, lookDX: 0, lookDY: 0, lmb: false, rmb: false, q: false, dashT: false, jumpT: false, useT: false, jumpHeld: false, keys: {} },
  actors: [], enemies: [], props: [], projectiles: [], eprojs: [], zones: [], teles: [], loot: [], parts: [], fx: [], obstacles: [], camps: [], chests: [],
  vfx: { proj: new Map(), tele: new Map(), zone: new Map() },
  aim: { aiming: false, until: 0, charge: 0, draw: 0, target: null, swinging: false },
};
export const isHost = () => !G.net || G.net.role === 'host';
export const isClient = () => G.net && G.net.role === 'client';

// ---------- 유틸 ----------
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let uid = 1; export const nextId = () => uid++;

// ---------- 저장 ----------
const SAVE_KEY = 'meadow_expedition_v1';
export function newSave() {
  const classes = {};
  for (const c of D.CLASS_IDS) classes[c] = { lv: 1, xp: 0, pts: { atk: 0, vit: 0, agi: 0, crt: 0, spr: 0 }, equip: { weapon: null, armor: null, trinket: null } };
  return { classes, cls: 'warrior', stash: [], mats: 0, killed: {}, name: '원정대원' + Math.floor(1000 + Math.random() * 9000), bots: 3,
    settings: { sens: 1, shake: true, assist: 1, gfx: 'auto' }, nextId: 1 };
}
export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.classes) { const n = newSave(); for (const c of D.CLASS_IDS) s.classes[c] = Object.assign(n.classes[c], s.classes[c]); return Object.assign(n, s); }
  } catch (e) { /* 저장소 없음 */ }
  return newSave();
}
export function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 무시 */ } }
export const freePoints = c => D.POINTS_PER_LEVEL * (c.lv - 1) - D.STAT_IDS.reduce((s, k) => s + (c.pts[k] || 0), 0);

// ---------- 렌더러 ----------
export const canvas = document.getElementById('game');
export const lowGfx = () => G.save && (G.save.settings.gfx === 'low' || (G.save.settings.gfx === 'auto' && isTouch));
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch });
renderer.autoClear = false;
export const scene = new THREE.Scene();
export const fog = new THREE.Fog(A.PALETTE.skyHorizon, 45, 190); scene.fog = fog;
export const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700); camera.rotation.order = 'YXZ';
export const vmScene = new THREE.Scene(); export const vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
scene.add(new THREE.HemisphereLight(0xfff6e0, 0x8fbf7a, 1.1));
const sun = new THREE.DirectionalLight(0xffe2b0, 1.6); sun.position.set(30, 50, 20); scene.add(sun);
vmScene.add(new THREE.HemisphereLight(0xfff6e0, 0x8fbf7a, 1.2)); const vsun = new THREE.DirectionalLight(0xffe2b0, 1.4); vsun.position.set(1, 2, 1); vmScene.add(vsun);
export function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowGfx() ? 1.3 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  if (lowGfx()) { fog.near = 35; fog.far = 140; } else { fog.near = 45; fog.far = 190; }
}
addEventListener('resize', resize);
// 그래픽 메모리가 바닥나 화면이 꺼지면 되살린다
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); G.ctxLost = true; });
canvas.addEventListener('webglcontextrestored', () => { G.ctxLost = false; resize(); });

// ---------- 소리 ----------
let actx = null;
export function sfx(kind) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const T = { hit: [220, 0.06, 'square'], kill: [160, 0.12, 'triangle'], hurt: [110, 0.15, 'sawtooth'], block: [520, 0.08, 'square'], card: [660, 0.15, 'sine'], chest: [440, 0.25, 'triangle'],
      levelup: [880, 0.35, 'sine'], pick: [740, 0.1, 'sine'], boss: [90, 0.6, 'sawtooth'], victory: [660, 0.6, 'triangle'], death: [80, 0.8, 'sawtooth'], portal: [520, 0.4, 'sine'], pop: [300, 0.08, 'square'],
      break: [900, 0.2, 'triangle'], shoot: [480, 0.05, 'triangle'], cast: [360, 0.12, 'sine'], boom: [70, 0.4, 'sawtooth'], zap: [1200, 0.15, 'square'], jump: [300, 0.3, 'sine'], warn: [640, 0.25, 'square'], charge: [180, 0.3, 'sawtooth'] }[kind];
    if (!T) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = T[2]; o.frequency.setValueAtTime(T[0], actx.currentTime);
    if (['levelup', 'victory', 'card', 'jump'].includes(kind)) o.frequency.exponentialRampToValueAtTime(T[0] * 2, actx.currentTime + T[1]);
    else o.frequency.exponentialRampToValueAtTime(Math.max(40, T[0] * 0.5), actx.currentTime + T[1]);
    g.gain.setValueAtTime(0.07, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + T[1]);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + T[1]);
  } catch (e) { /* 소리 없음 */ }
}
export function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 무시 */ } }

// ---------- 시각 효과 (방장 → 모두) ----------
const V = v => new THREE.Vector3(v[0], v[1], v[2]);
export const P3 = v => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
export function fx(kind, d) { applyFx(kind, d); if (G.net && G.net.role === 'host') G.net.fxq.push([kind, d]); }
let shakeAmt = 0;
export const getShake = () => shakeAmt; export const decayShake = dt => { shakeAmt = Math.max(0, shakeAmt - dt * 1.5); };
export function applyFx(kind, d) {
  switch (kind) {
    case 'burst': for (let i = 0; i < d.n; i++) spawnPart(new THREE.Vector3(d.p[0], d.p[1] + (d.y || 0.5), d.p[2]), new THREE.Vector3(rnd(-3, 3), rnd(1, 5), rnd(-3, 3)), d.c, rnd(0.3, 0.7)); break;
    case 'ring': { const m = A.ringPulse(0.3, d.c); m.position.x = d.p[0]; m.position.z = d.p[2]; scene.add(m); G.fx.push({ mesh: m, t: 0, dur: 0.35, tick(f, dt) { f.t += dt; m.scale.setScalar(0.3 + (d.r - 0.3) * f.t / f.dur); m.material.opacity = 0.8 * (1 - f.t / f.dur); return f.t < f.dur; } }); break; }
    case 'beam': { const a = V(d.a), b = V(d.b), len = a.distanceTo(b), w = d.w || 0.08; const geo = new THREE.CylinderGeometry(w, w, len, 6); geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.9 })); m.position.copy(a); m.lookAt(b); scene.add(m);
      const dur = d.d || 0.15; G.fx.push({ mesh: m, t: 0, tick(f, dt) { f.t += dt; m.material.opacity = 0.9 * (1 - f.t / dur); return f.t < dur; } }); break; }
    case 'dmg': if (d.to == null || (G.me && d.to === G.me.id)) UI.dmgWorld(V(d.p), d.v, d.c, d.b); break;
    case 'shake': if (d.to == null || (G.me && d.to === G.me.id)) { if (G.save.settings.shake) shakeAmt = Math.max(shakeAmt, d.a); } break;
    case 'hurt': if (G.me && d.to === G.me.id) { UI.hurt(); vibrate(40); sfx('hurt'); } break;
    case 'sfx': if (!d.p || !G.me || Math.hypot(d.p[0] - G.me.pos.x, d.p[2] - G.me.pos.z) < 45) sfx(d.k); break;
    case 'banner': UI.banner(d.text, d.dur); break;
    case 'toast': if (d.to == null || (G.me && d.to === G.me.id)) UI.toast(d.text); break;
    case 'p+': { // 투사체 모양
      let mesh;
      if (d.ty === 'arrow') mesh = A.arrowMesh(); else mesh = A.orb(d.s || 0.12, d.c || 0xfff3a0);
      mesh.position.copy(V(d.p)); scene.add(mesh); const vel = V(d.v); mesh.lookAt(mesh.position.clone().add(vel));
      G.vfx.proj.set(d.id, { mesh, vel, grav: d.g || 0, life: d.l || 3, driven: isHost() }); break;
    }
    case 'p-': { const v = G.vfx.proj.get(d.id); if (v) { A.dispose(v.mesh); G.vfx.proj.delete(d.id); } break; }
    case 't+': {
      const mesh = d.k === 'l' ? A.telegraphLine(d.len, d.w, d.c) : A.telegraphCircle(d.r, d.c);
      mesh.position.set(d.p[0], 0.04, d.p[2]); if (d.rot != null) mesh.rotation.y = d.rot; scene.add(mesh);
      G.vfx.tele.set(d.id, { mesh, t: 0, dur: d.dur || 1 }); break;
    }
    case 't-': { const v = G.vfx.tele.get(d.id); if (v) { A.dispose(v.mesh); G.vfx.tele.delete(d.id); } break; }
    case 'z+': {
      const colors = { poison: 0x8fd04a, fire: 0xff7a3a, spore: 0x9ad04a, sanct: 0xfff3a0, ice: 0x9fe6ff, rain: 0xd9c08a, trap: 0xc9a46a };
      const mesh = d.k === 'spore' ? A.cloud(d.r, colors[d.k], 0.35) : A.telegraphCircle(d.r, colors[d.k]);
      mesh.position.set(d.p[0], d.k === 'spore' ? 0.6 : 0.03, d.p[2]);
      if (mesh.userData.fill) mesh.userData.fill.material.opacity = d.k === 'sanct' ? 0.18 : 0.3;
      scene.add(mesh); G.vfx.zone.set(d.id, { mesh, k: d.k, r: d.r, follow: d.f, p: V(d.p) }); break;
    }
    case 'z-': { const v = G.vfx.zone.get(d.id); if (v) { A.dispose(v.mesh); G.vfx.zone.delete(d.id); } break; }
  }
}
// 조각 효과는 상자 하나를 여러 번 그린다 (조각마다 새로 만들지 않음)
const PART_MAX = 700, partMesh = A.makeParticles(PART_MAX); scene.add(partMesh);
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3(), _pc = new THREE.Color();
export function spawnPart(pos, vel, color, life, size = 0.08) {
  if (G.parts.length >= PART_MAX) G.parts.shift();
  G.parts.push({ pos, vel, life, size, color });
}
// 효과 지름길
export const burst = (p, c, n = 10, y = 0.5) => fx('burst', { p: P3(p), c, n, y });
export const ringFx = (p, r, c) => fx('ring', { p: P3(p), r, c });
export const beamFx = (a, b, c, d, w) => fx('beam', { a: P3(a), b: P3(b), c, d, w });
export const shake = (a, to) => fx('shake', { a, to });

export function updateVisuals(dt) {
  let n = 0;
  for (let i = 0; i < G.parts.length; i++) {
    const p = G.parts[i]; p.life -= dt; p.vel.y -= 12 * dt; p.pos.addScaledVector(p.vel, dt);
    if (p.life <= 0 || p.pos.y < 0) continue;
    G.parts[n] = p; _ps.setScalar(p.size); _pm.compose(p.pos, _pq, _ps); partMesh.setMatrixAt(n, _pm); partMesh.setColorAt(n, _pc.setHex(p.color)); n++;
  }
  G.parts.length = n; partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; partMesh.instanceColor.needsUpdate = true;
  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; if (!f.tick(f, dt)) { A.dispose(f.mesh); G.fx.splice(i, 1); } }
  for (const [id, v] of G.vfx.proj) { if (v.driven) continue; v.life -= dt; v.vel.y -= v.grav * dt; v.mesh.position.addScaledVector(v.vel, dt); if (v.grav) v.mesh.lookAt(v.mesh.position.clone().add(v.vel)); if (v.life <= 0 || v.mesh.position.y < -0.5) { A.dispose(v.mesh); G.vfx.proj.delete(id); } }
  for (const [id, v] of G.vfx.tele) { v.t += dt; if (v.mesh.userData.fill) v.mesh.userData.fill.material.opacity = 0.15 + 0.4 * Math.min(1, v.t / v.dur); if (v.t > v.dur + 3) { A.dispose(v.mesh); G.vfx.tele.delete(id); } }
  for (const v of G.vfx.zone.values()) if (v.follow != null) { const a = G.actors.find(x => x.id === v.follow); if (a) { v.mesh.position.x = a.pos.x; v.mesh.position.z = a.pos.z; v.p.copy(a.pos); } }
}
export function clearVisuals() {
  for (const m of [G.vfx.proj, G.vfx.tele, G.vfx.zone]) { for (const v of m.values()) A.dispose(v.mesh); m.clear(); }
  for (const x of G.fx) A.dispose(x.mesh); G.fx.length = 0; G.parts.length = 0; partMesh.count = 0;
}
