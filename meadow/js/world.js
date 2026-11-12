// 오픈 월드: 같은 시드면 모든 플레이어가 똑같은 맵을 만든다
import * as THREE from 'three';
import * as A from './art.js';
import * as D from './data.js';
import { G, scene, mulberry32, d2 } from './core.js';

export const regionAt = (x, z) => Math.floor(((Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / D.REGIONS.length));
export const tierAtPos = (x, z) => D.tierAt(Math.hypot(x, z));
export const regionName = (x, z) => Math.hypot(x, z) < 18 ? '풍차 마을' : D.REGIONS[regionAt(x, z)].name;

export function genWorld(seed) {
  const R = mulberry32(seed), rr = (a, b) => a + R() * (b - a);
  const W = { seed, obstacles: [], camps: [], props: [], chests: [], flowers: [], trees: [] };
  const final = { x: 0, z: -104 };
  let ma = rr(0, Math.PI * 2); while (Math.abs(Math.atan2(Math.sin(ma + Math.PI / 2), Math.cos(ma + Math.PI / 2))) < 1.1) ma = rr(0, Math.PI * 2);
  const mid = { x: Math.cos(ma) * 66, z: Math.sin(ma) * 66 };
  W.lairs = { final, mid };
  const busy = []; // 서로 겹치지 않게 피할 자리 [x,z,r]
  busy.push([0, 0, 15], [final.x, final.z, 26], [mid.x, mid.z, 21]);
  const free = (x, z, r) => Math.hypot(x, z) < D.WORLD_R - 4 && busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + r);
  // 거점
  const dists = [34, 46, 58, 72, 86, 98];
  for (let i = 0; i < dists.length; i++) {
    for (let k = 0; k < 60; k++) {
      const a = i / dists.length * Math.PI * 2 + rr(-0.5, 0.5), x = Math.cos(a) * dists[i], z = Math.sin(a) * dists[i];
      if (free(x, z, 14) && W.camps.every(c => Math.hypot(c.x - x, c.z - z) > 30)) { W.camps.push({ id: i, x, z, tier: D.tierAt(dists[i]) }); busy.push([x, z, 13]); break; }
    }
  }
  // 기믹과 상자
  const place = (kind, n, r, pref, extra = {}) => {
    for (let i = 0; i < n; i++) for (let k = 0; k < 40; k++) {
      const a = rr(0, Math.PI * 2), d = rr(22, D.WORLD_R - 8), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (pref != null && regionAt(x, z) !== pref && R() < 0.65) continue;
      if (free(x, z, r + 1.5)) { W.props.push({ id: W.props.length, kind, x, z, r, ...extra }); busy.push([x, z, r + 1]); break; }
    }
  };
  place('pad', 10, 1.6); place('boom', 8, 0.8, 2); place('boom', 8, 0.8); place('crystal', 5, 1, 4); place('crystal', 5, 1, 1);
  place('spring', 5, 2.8); place('thorn', 7, 3, 0); place('thorn', 5, 3, 2);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 40; k++) { const a = rr(0, 6.28), d = rr(28, D.WORLD_R - 8), x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, 2)) { W.chests.push({ id: i, x, z, tier: D.tierAt(d) }); busy.push([x, z, 2]); break; } }
  // 마을
  W.obstacles.push({ x: 0, z: -7, r: 2.6, h: 9, kind: 'windmill' }, { x: 7, z: 3, r: 2, h: 2.6, kind: 'tent', c: 0xe8c86a }, { x: -7, z: 4, r: 2, h: 2.6, kind: 'tent', c: 0x8fb8e0 }, { x: 2, z: 9, r: 2, h: 2.6, kind: 'tent', c: 0xe08a7a });
  // 숲·바위·지역 장식
  const ob = (x, z, r, h, kind) => { if (free(x, z, r)) { W.obstacles.push({ x, z, r, h, kind }); busy.push([x, z, r * 0.6]); } };
  for (let f = 0; f < 30; f++) {
    const a = rr(0, 6.28), d = rr(24, D.WORLD_R - 6), cx = Math.cos(a) * d, cz = Math.sin(a) * d, n = 3 + Math.floor(R() * 6);
    for (let i = 0; i < n; i++) ob(cx + rr(-8, 8), cz + rr(-8, 8), 0.7, 4, 'tree');
  }
  for (let i = 0; i < 55; i++) { const a = rr(0, 6.28), d = rr(20, D.WORLD_R - 4); ob(Math.cos(a) * d, Math.sin(a) * d, rr(0.8, 2.2), 2, 'rock'); }
  const regional = [[1, 'pillar', 40, 0.9, 4], [1, 'wall', 16, 1.1, 2.4], [2, 'giantshroom', 26, 1.4, 4], [4, 'crystal', 26, 1.2, 3]];
  for (const [reg, kind, n, r, h] of regional) for (let i = 0; i < n * 3 && W.obstacles.filter(o => o.kind === kind).length < n; i++) {
    const a = (reg + R()) * Math.PI * 2 / D.REGIONS.length, d = rr(22, D.WORLD_R - 6); ob(Math.cos(a) * d, Math.sin(a) * d, r, h, kind);
  }
  for (let i = 0; i < 1100; i++) { const a = (R() < 0.6 ? R() * Math.PI * 2 / D.REGIONS.length : R() * Math.PI * 2), d = rr(10, D.WORLD_R); W.flowers.push([Math.cos(a) * d, Math.sin(a) * d]); }
  return W;
}

let root = null;
export function buildWorld(W) {
  clearWorld();
  root = new THREE.Group(); scene.add(root);
  root.add(A.makeGround(D.WORLD_R, D.REGIONS.map(r => r.tint)));
  const stat = [A.makeCliffRing(D.WORLD_R)]; // 움직이지 않는 것들은 마지막에 묶어서 그린다
  const castle = A.makeCastle(); castle.position.set(40, 0, -200); stat.push(castle);
  root.add(A.makeFlowers(W.flowers));
  const fire = A.bakeGroup(A.makeCampfire()); fire.position.set(0, 0, 2); root.add(fire);
  G.world = { W, anim: [fire], seal: false, barrier: null };
  for (const o of W.obstacles) {
    let m;
    if (o.kind === 'tree') m = A.makeTree(o.x, o.z, 0.9 + (Math.abs(o.x * 13 + o.z * 7) % 10) / 20, Math.floor(Math.abs(o.x + o.z)) % 3);
    else if (o.kind === 'windmill') { m = A.makeWindmill(); m.position.set(o.x, 0, o.z); G.world.anim.push(m); }
    else if (o.kind === 'tent') { m = A.makeTent(o.c); m.position.set(o.x, 0, o.z); }
    else { m = A.makeObstacle(o.kind, o.r); m.position.set(o.x, 0, o.z); }
    if (o.kind === 'windmill') root.add(A.bakeGroup(m)); else stat.push(m);
    G.obstacles.push({ x: o.x, z: o.z, r: o.kind === 'tree' ? 0.6 : o.r, h: o.h, kind: o.kind });
  }
  G.camps = W.camps.map(c => { const m = A.bakeGroup(A.makeCamp()); m.position.set(c.x, 0, c.z); root.add(m); G.world.anim.push(m.userData.fire); return { ...c, mesh: m, state: 'idle', wave: 0, waves: 0, pending: 0 }; });
  for (const [k, l] of Object.entries(W.lairs)) { const m = A.makeLair(k === 'final'); m.position.set(l.x, 0, l.z); stat.push(m); }
  const bar = A.makeBarrier(21); bar.position.set(W.lairs.final.x, 0, W.lairs.final.z); root.add(bar); G.world.barrier = bar;
  G.props = W.props.map(p => {
    const mk = { pad: A.makeJumpPad, boom: A.makeBoomShroom, crystal: A.makeLCrystal, spring: A.makeSpring, thorn: () => A.makeThornBush(p.r) }[p.kind];
    const m = p.kind === 'thorn' ? mk() : A.bakeGroup(mk()); m.position.set(p.x, 0, p.z); if (p.kind === 'thorn') stat.push(m); else root.add(m);
    return { ...p, pos: new THREE.Vector3(p.x, 0, p.z), mesh: m, cd: 0, charge: 1, active: true, h: p.kind === 'crystal' ? 3 : 1.4 };
  });
  root.add(A.bakeStatic(stat));
  G.chests = W.chests.map(c => { const m = A.bakeGroup(A.makeChest()); m.position.set(c.x, 0, c.z); m.rotation.y = c.x; root.add(m); return { ...c, pos: m.position, mesh: m, opened: false, seen: false }; });
}
export const addToWorld = o => root.add(o); // 판 도중 생기는 물체(거점 상자 등)도 판이 끝나면 같이 치운다
export function clearWorld() {
  if (root) A.dispose(root); root = null;
  G.obstacles.length = 0; G.props.length = 0; G.camps.length = 0; G.chests.length = 0; G.world = null;
}

// 상태에 맞춰 소품 모습 갱신 (방장·참가자 공통)
export function updateWorldVisual(dt, t) {
  const w = G.world; if (!w) return;
  for (const a of w.anim) {
    if (a.userData.blades) a.userData.blades.rotation.z += dt * 0.6;
    if (a.userData.flame) { const s = 1 + Math.sin(t * 13 + a.position.x) * 0.15; a.userData.flame[0].scale.set(1, s, 1); a.userData.flame[1].scale.set(1, 2 - s, 1); }
  }
  for (const p of G.props) {
    const u = p.mesh.userData;
    if (p.kind === 'pad') u.spin.rotation.y += dt * 3;
    if (p.kind === 'boom') { p.mesh.visible = p.active; if (p.active) p.mesh.scale.setScalar(p.fuse > 0 ? 1 + Math.sin(t * 40) * 0.12 : 1); }
    if (p.kind === 'crystal') { u.core.rotation.y += dt; u.core.material.emissive.setHex(p.cd > 0 ? 0x0a2030 : 0x2a7aa8); }
    if (p.kind === 'spring') u.water.material.opacity = 0.3 + 0.55 * p.charge;
  }
  for (const c of G.camps) c.mesh.userData.flag.material.color.setHex(c.state === 'cleared' ? 0xf0c040 : c.state === 'active' ? 0xd94040 : 0x9a2f2f);
  if (w.barrier) { w.barrier.visible = !w.seal; w.barrier.userData.wall.material.opacity = 0.2 + Math.sin(t * 2) * 0.06; }
  for (const c of G.chests) { c.mesh.userData.lid.rotation.x = c.opened ? -1.2 : 0; }
}
