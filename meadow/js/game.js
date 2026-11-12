import * as THREE from 'three';
import * as D from './data.js';
import * as A from './art.js';
import * as UI from './ui.js';

// ================= 공용 상태 =================
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const G = {
  mode: 'town', isTouch, time: 0, timeScale: 1, hitStop: 0,
  input: { mx: 0, my: 0, lookDX: 0, lookDY: 0, lmb: false, rmb: false, q: false, dashT: false, jumpT: false, useT: false, keys: {} },
  save: null, run: null, P: null, S: null,
  enemies: [], projectiles: [], eprojs: [], zones: [], teles: [], loot: [], parts: [], fx: [],
  obstacles: [], aim: { aiming: false, until: 0, charge: 0, draw: 0, target: null }, boss: null,
};
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ================= 저장 =================
const SAVE_KEY = 'meadow_expedition_v1';
function newSave() {
  const classes = {};
  for (const c of D.CLASS_IDS) classes[c] = { lv: 1, xp: 0, equip: { weapon: null, armor: null, trinket: null } };
  return { classes, cls: 'warrior', stash: [], mats: 0, killed: {}, settings: { sens: 1, shake: true, assist: 1, gfx: 'auto' }, nextId: 1 };
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.classes) return Object.assign(newSave(), s); } catch (e) { /* 저장소 없음 */ }
  return newSave();
}
export function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 무시 */ } }

// ================= 렌더러 =================
const canvas = document.getElementById('game');
const lowGfx = () => G.save.settings.gfx === 'low' || (G.save.settings.gfx === 'auto' && isTouch);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch });
renderer.autoClear = false;
const scene = new THREE.Scene();
const fog = new THREE.Fog(A.PALETTE.skyHorizon, 50, 230); scene.fog = fog;
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600); camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene(); const vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
scene.add(new THREE.HemisphereLight(0xfff6e0, 0x8fbf7a, 1.1));
const sun = new THREE.DirectionalLight(0xffe2b0, 1.6); sun.position.set(30, 50, 20); scene.add(sun);
vmScene.add(new THREE.HemisphereLight(0xfff6e0, 0x8fbf7a, 1.2)); const vsun = new THREE.DirectionalLight(0xffe2b0, 1.4); vsun.position.set(1, 2, 1); vmScene.add(vsun);
let sky, grass, world;
function buildWorld() {
  if (world) { scene.remove(world, sky, grass); }
  sky = A.makeSky(); scene.add(sky);
  world = A.makeWorld(scene, D.ARENA_R, lowGfx() ? 'low' : 'high');
  grass = A.makeGrass(lowGfx() ? 2500 : 7000, D.ARENA_R + 18, fog); scene.add(grass);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowGfx() ? 1.5 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ================= 스탯 =================
const has = id => G.run && id in G.run.cards;
export const cv = id => { if (!G.run || !(id in G.run.cards)) return 0; const c = D.CARD_BY_ID[id]; return c.L ? 1 : c.v[G.run.cards[id]]; };
export function itemPower(it) {
  const rm = D.RARITY_MULT[it.r], e = 1 + 0.1 * it.enh;
  if (it.slot === 'weapon') return { atk: 0.10 * rm * e };
  if (it.slot === 'armor') return { hp: Math.round(20 * rm * e) };
  return {};
}
function uniqOn(id) { return G.run && G.run.uniq.has(id); }
function computeStats() {
  const cls = G.run.cls, cd = D.CLASSES[cls], lv = G.save.classes[cls].lv;
  const S = { hpMax: cd.hp, atk: 1, crit: 0.05, critDmg: 0, move: 1, qcd: 1, cdAll: 1, dashCd: 2, dr: 1, leech: 0, regen: 0, pickup: 2.5, luck: 0, cardsense: 0 };
  const eq = G.save.classes[cls].equip, slots = { weapon: eq.weapon, armor: eq.armor, trinket: eq.trinket };
  for (const [s, id] of Object.entries(G.run.bagEq)) { const it = G.run.bag.find(i => i.id === id); if (it) slots[s] = it; }
  let hpFlat = 0, atkG = 0, af = { atk: 0, hp: 0, crit: 0, critDmg: 0, move: 0, cdr: 0, leech: 0, dr: 0 };
  G.run.uniq = new Set();
  for (const it of Object.values(slots).filter(Boolean)) {
    const p = itemPower(it); hpFlat += p.hp || 0; atkG += p.atk || 0;
    for (const a of it.aff) af[a.k] += a.v;
    if (it.u) G.run.uniq.add(it.u);
  }
  S.hpMax = (cd.hp * (1 + 0.06 * (lv - 1)) + hpFlat) * (1 + af.hp + cv('k_tough')) * (has('kL_glass') ? 0.6 : 1);
  S.atk = (1 + 0.04 * (lv - 1)) * (1 + atkG) * (1 + af.atk + cv('k_train')) * (has('kL_glass') ? 1.6 : 1);
  S.crit += af.crit + cv('k_sharp'); S.critDmg += af.critDmg + cv('k_cruel');
  S.move = (1 + af.move + cv('k_run') + cv('a_wind') + (has('kL_wind') ? 0.25 : 0));
  S.cdAll = (1 - af.cdr) * (has('kL_time') ? 0.7 : 1);
  S.qcd = S.cdAll * (1 - cv('k_cast'));
  S.dashCd = Math.max(0.5, (2 - cv('k_dash') - cv('a_roll'))) * S.cdAll;
  S.dr = (1 - af.dr) * (1 - cv('k_armor'));
  S.leech = af.leech; S.regen = cv('k_regen'); S.pickup = 2.5 + cv('k_magnet');
  S.luck = cv('k_luck'); S.cardsense = cv('k_cardsense');
  const ratio = G.P ? G.P.hp / G.S.hpMax : 1;
  G.S = S; if (G.P) G.P.hp = Math.min(S.hpMax, S.hpMax * ratio);
}
function qCooldown() {
  const cls = G.run.cls; let base = D.CLASSES[cls].qcd;
  if (cls === 'warrior') { base -= cv('w_will'); if (has('wL_drum')) base *= 0.5; }
  if (cls === 'cleric') base -= cv('c_quick');
  if (cls === 'mage' && has('mL_stop')) base += 4;
  return Math.max(2, base * G.S.qcd);
}

// ================= 아이템 =================
export function newItem({ slot, cls, r, u, bossKey } = {}) {
  const id = G.save.nextId++;
  slot = slot || pick(['weapon', 'weapon', 'armor', 'trinket']);
  if (slot === 'weapon') cls = cls || (Math.random() < 0.7 && G.run ? G.run.cls : pick(D.CLASS_IDS));
  const lines = Math.min(4, (r === 4 ? 3 : r) + (slot === 'trinket' ? 1 : 0));
  const keys = Object.keys(D.AFFIXES).sort(() => Math.random() - 0.5).slice(0, lines);
  const aff = keys.map(k => { const a = D.AFFIXES[k]; return { k, v: +(rnd(a.min, a.max)).toFixed(3) }; });
  if (r === 4 && !u) {
    const pool = Object.entries(D.UNIQUES).filter(([k, x]) => !x.boss && x.slot === slot && (!x.cls || x.cls === cls));
    if (pool.length) u = pick(pool)[0];
  }
  const base = slot === 'weapon' ? D.WEAPON_NAMES[cls] : slot === 'armor' ? pick(D.ARMOR_NAMES) : pick(D.TRINKET_NAMES);
  const name = u ? D.UNIQUES[u].name : `${D.RARITY_PREFIX[r]} ${base}`;
  return { id, slot, cls: slot === 'weapon' ? cls : null, r, aff, enh: 0, u: u || null, name };
}
function rollRarity(minR = 0, extra = 0) {
  const p = [...D.RARITY_ODDS];
  const shift = Math.min(0.5, 0.02 * ((G.run ? G.run.floor : 1) - 1) + G.S.luck + extra);
  p[0] -= shift; p[2] += shift * 10 / 15; p[3] += shift * 4 / 15; p[4] += shift * 1 / 15;
  let x = Math.random(), r = 0; for (; r < 4; r++) { if ((x -= p[r]) < 0) break; }
  return Math.max(minR, Math.min(4, r));
}
function dropItem(pos, opt = {}) {
  let r = rollRarity(opt.minR || 0);
  if (opt.boss && has('kL_gold')) r = Math.min(4, r + 1);
  let it;
  if (opt.boss && r === 4 && Math.random() < 0.5) {
    const ent = Object.entries(D.UNIQUES).find(([, x]) => x.boss === opt.boss);
    if (ent) it = newItem({ slot: ent[1].slot, r: 4, u: ent[0] });
  }
  it = it || newItem({ r });
  const mesh = A.lootBeam(new THREE.Color(D.RARITY_COLORS[it.r]).getHex());
  mesh.position.set(pos.x + rnd(-1, 1), 0, pos.z + rnd(-1, 1)); scene.add(mesh);
  G.loot.push({ item: it, mesh, pos: mesh.position });
}

// ================= 런 =================
function makeRun(cls) {
  const run = {
    cls, floor: 1, wave: 0, waves: 2, phase: 'fight', cards: {}, bag: [], bagEq: {}, mats: 0, kills: 0,
    legends: 0, rerollBonus: 0, rerollFloor: 1, pending: 0, spawnQueue: [], chest: null, portal: null,
    finalKey: chooseFinal(), midKey: pick(['queen', 'gate']), uniq: new Set(), startedAt: performance.now(),
  };
  run.bagEquip = () => Object.values(run.bagEq).map(id => run.bag.find(i => i.id === id)).filter(Boolean);
  return run;
}
function chooseFinal() {
  const k = G.save.killed;
  const unlocked = D.FINAL_ORDER.filter(b => !D.BOSSES[b].unlockAfter || k[D.BOSSES[b].unlockAfter]);
  if (G.save.pickFinal && unlocked.includes(G.save.pickFinal) && D.FINAL_ORDER.every(b => k[b])) return G.save.pickFinal;
  return pick(unlocked);
}
export function startRun() {
  G.save.cls = G.save.cls || 'warrior'; writeSave();
  clearArena(true);
  G.run = makeRun(G.save.cls); G.P = null; computeStats();
  G.P = newPlayer(); computeStats();
  setViewModel(G.run.cls);
  G.mode = 'run'; UI.enterRun(); startFloor(1);
  UI.lockPointer();
}
function newPlayer() {
  return { pos: new THREE.Vector3(0, 0, 15), vy: 0, yaw: 0, pitch: 0, hp: G.S.hpMax, mana: 100,
    cd: { lmb: 0, rmb: 0, q: 0, dash: 0, bash: 0 }, dashCharges: has('aL_dance') ? 2 : 1, dashT: 0, dashDir: new THREE.Vector3(),
    invuln: 0, buff: {}, blocking: false, giant: 0, combo: 0, lastSwing: -9, charging: false, charge: 0, drawing: false, draw: 0,
    bolts: 0, statics: 0, angelUsed: false, escapeCd: 0, shellCd: 0, comboT: null, comboN: 0, swingAnim: 0, castAnim: 0, onGround: true, dashedAt: -9, reflex: false, stormT: 0, regenAcc: 0 };
}
function clearArena(all) {
  for (const e of [...G.enemies]) removeEnemy(e);
  for (const arr of [G.projectiles, G.eprojs, G.zones, G.teles, G.parts, G.fx]) { for (const x of arr) x.mesh && scene.remove(x.mesh); arr.length = 0; }
  UI.blur(false);
  for (const o of G.obstacles) scene.remove(o.mesh); G.obstacles.length = 0;
  if (G.run) { if (G.run.chest) scene.remove(G.run.chest.mesh); if (G.run.portal) scene.remove(G.run.portal); G.run.chest = null; G.run.portal = null; G.run.pending = 0; }
  if (all) { for (const l of G.loot) scene.remove(l.mesh); G.loot.length = 0; }
  if (G.boss) { G.boss = null; UI.bossBar(null); }
}
function startFloor(f) {
  const run = G.run; run.floor = f; run.rerollFloor = 1; run.phase = 'fight';
  clearArena(false);
  for (const l of G.loot) scene.remove(l.mesh); G.loot.length = 0;
  const final = f === 6;
  const room = final ? { name: '고목의 공터', obs: [] } : pick(D.ROOMS);
  run.room = room;
  for (const [x, z, r, kind] of room.obs) {
    const mesh = A.makeObstacle(kind, r); mesh.position.set(x, 0, z); scene.add(mesh);
    G.obstacles.push({ x, z, r, h: kind === 'pillar' ? 4 : kind === 'wall' ? 2.4 : r * 1.3, mesh });
  }
  const P = G.P; P.pos.set(0, 0, 15); P.yaw = 0; P.pitch = 0; P.vy = 0;
  if (final) { run.waves = 1; run.wave = 0; spawnBoss(run.finalKey); UI.banner(`최종 보스 — ${D.BOSSES[run.finalKey].name}`); return; }
  run.waves = f <= 2 ? 2 : 3; run.wave = 0;
  UI.banner(`${f}층 — ${room.name}`);
  nextWave();
}
function nextWave() {
  const run = G.run; run.wave++;
  if (run.floor === 3 && run.wave === 3) { spawnBoss(run.midKey); UI.banner(`중간 보스 — ${D.BOSSES[run.midKey].name}`); return; }
  const normalWaves = run.floor === 3 ? 2 : run.waves;
  const total = 6 + 2 * run.floor;
  const n = Math.round(total / normalWaves);
  const pool = Object.entries(D.MONSTERS).filter(([, m]) => m.floor <= run.floor);
  let count = 0; const elites = run.floor >= 3 ? (Math.random() < 0.5 ? 1 : 0) + (run.wave === 1 ? 1 : 0) : 0; let eliteLeft = elites;
  while (count < n) {
    const [key, m] = pick(pool.concat(pool.filter(([, x]) => x.floor === run.floor)));
    const g = m.group || 1;
    for (let i = 0; i < g; i++) queueSpawn(key, eliteLeft > 0 && g === 1 && Math.random() < 0.5 ? (eliteLeft--, pick(D.ELITE_AFFIXES).id) : null, i * 0.15);
    count += g;
  }
}
function queueSpawn(key, affix, delay = 0) {
  const run = G.run; run.pending++;
  let p; for (let k = 0; k < 30; k++) {
    const a = Math.random() * Math.PI * 2, r = rnd(4, D.ARENA_R - 3);
    p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (d2(p, G.P.pos) > 10 && !G.obstacles.some(o => d2(p, o) < o.r + 1.5)) break;
  }
  const tele = A.telegraphCircle(0.9, 0xb07de0); tele.position.x = p.x; tele.position.z = p.z; scene.add(tele);
  G.teles.push({ mesh: tele, t: 0, total: 0.9 + delay, onDone: () => { run.pending--; spawnEnemy(key, p, affix); } });
}
function waveCleared() {
  const run = G.run;
  if (run.phase !== 'fight') return;
  const lastWave = run.wave >= run.waves;
  if (run.floor === 6) return; // 최종 보스는 victory 처리
  offerCards(false, () => {
    if (!lastWave) { nextWave(); return; }
    gainXp(30);
    run.phase = 'chest';
    const ch = A.makeChest(); ch.position.set(0, 0, 0); scene.add(ch);
    run.chest = { mesh: ch, opened: false, pos: ch.position };
    UI.banner('보상 상자가 나타났다');
  });
}
function openChest() {
  const run = G.run; if (!run.chest || run.chest.opened) return;
  run.chest.opened = true; run.chest.mesh.userData.lid.rotation.x = -1.2;
  sfx('chest');
  dropItem(run.chest.pos, { minR: 0 });
  const mats = Math.round(rnd(10, 20) * (1 + cv('k_treasure'))); run.mats += mats; UI.toast(`재료 +${mats}`);
  offerCards(true, () => {
    run.phase = 'portal';
    const p = A.makePortal(); p.position.x = 0; p.position.z = -6; scene.add(p); run.portal = p;
    UI.banner('포털이 열렸다');
  });
}
function enterPortal() { sfx('portal'); startFloor(G.run.floor + 1); }

// ================= 카드 =================
function rollTier(minTier, legendMult) {
  const odds = [...D.CARD_TIER_ODDS[Math.min(5, G.run.floor - 1)]];
  const s = G.S.cardsense; odds[0] -= s; odds[1] += s;
  odds[3] *= legendMult; odds[0] -= odds[3] * (legendMult - 1) / legendMult;
  let x = Math.random(), t = 0; for (; t < 3; t++) { if ((x -= odds[t]) < 0) break; }
  return Math.max(minTier, t);
}
function legendEligible(c) {
  if (c.id in G.run.cards || G.run.legends >= 2) return false;
  if (c.cls === 'common') return true;
  return Object.keys(G.run.cards).filter(id => { const x = D.CARD_BY_ID[id]; return !x.L && x.cls === c.cls && x.fam === c.fam; }).length >= 2;
}
function rollChoices(isChest) {
  const run = G.run, star = has('kL_star');
  const slots = star ? [run.cls, run.cls, 'common', 'common'] : [run.cls, run.cls, 'common'];
  const out = [];
  for (const pool of slots) {
    let tier = rollTier(isChest ? 1 : 0, star ? 2 : 1), card = null;
    if (tier === 3) {
      const leg = D.CARDS.filter(c => c.L && c.cls === pool && legendEligible(c) && !out.some(o => o.card === c));
      if (leg.length) card = pick(leg); else tier = 2;
    }
    if (!card) {
      const cands = D.CARDS.filter(c => !c.L && c.cls === pool && !out.some(o => o.card === c) && !(c.id in run.cards && run.cards[c.id] >= 2));
      if (!cands.length) continue;
      card = pick(cands);
    }
    const owned = card.id in run.cards;
    out.push({ card, tier: card.L ? 3 : owned ? run.cards[card.id] + 1 : tier, upgrade: owned });
  }
  return out;
}
function offerCards(isChest, after) {
  G.mode = 'cards'; UI.unlockPointer();
  const show = () => UI.showCards(rollChoices(isChest), choice => {
    const { card, tier } = choice;
    G.run.cards[card.id] = card.L ? 3 : tier;
    if (card.L) G.run.legends++;
    if (card.id === 'k_reroll') G.run.rerollBonus += [1, 2, 3][tier] - (choice.upgrade ? [1, 2, 3][tier - 1] : 0);
    if (card.id === 'aL_dance') G.P.dashCharges = 2;
    computeStats(); sfx('card');
    G.mode = 'run'; UI.hideCards(); UI.lockPointer(); after();
  }, G.run.rerollFloor + G.run.rerollBonus, () => {
    if (G.run.rerollFloor > 0) G.run.rerollFloor--; else if (G.run.rerollBonus > 0) G.run.rerollBonus--; else return;
    show();
  }, isChest);
  show();
}

// ================= 적 =================
function spawnEnemy(key, pos, affix, opt = {}) {
  const def = D.MONSTERS[key], f = G.run.floor, scale = 1 + 0.15 * (f - 1);
  const model = A.makeMonster(key, def); scene.add(model);
  const e = { key, def, model, pos: pos.clone(), yaw: 0, hp: def.hp * scale * (opt.hpMult || 1), atk: def.atk * scale, speed: def.speed,
    r: def.r, h: def.h, t: 0, atkT: rnd(0.5, 1.5), wind: 0, state: def.type === 'ambush' ? 'hidden' : 'move', st: {}, flash: 0,
    elite: !!affix, affix, bar: A.hpBar(), vy: 0, id: Math.random() };
  if (affix) { e.hp *= 2.5; e.r *= 1.3; e.h *= 1.3; model.scale.setScalar(1.3); A.setOutlineColor(model, 0xf0b030); if (affix === 'fast') e.speed *= 1.4; }
  if (opt.mini) { model.scale.setScalar(0.7); e.r *= 0.7; e.h *= 0.7; }
  e.maxHp = e.hp;
  if (def.type === 'ambush') { for (const c of model.children) if (!c.userData.isBush) c.visible = false; }
  scene.add(e.bar); model.position.copy(e.pos);
  G.enemies.push(e); return e;
}
function removeEnemy(e) {
  scene.remove(e.model); scene.remove(e.bar);
  if (e.line) { scene.remove(e.line); e.line = null; } if (e.laser) { scene.remove(e.laser); e.laser = null; }
  const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
}
function enemyForward(e) { return tmpV2.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)); }

export function hitEnemy(e, base, o = {}) {
  if (!e || e.dead) return 0;
  if (e.state === 'hidden') { revealVine(e); }
  if (e.boss && e.invuln) { UI.dmgWorld(e.pos, e.h, '막힘', '#c9d6e0'); return 0; }
  const P = G.P, run = G.run;
  let d = base * (o.raw ? 1 : G.S.atk), crit = false;
  if (!o.raw) {
    if (e.hp >= e.maxHp) d *= 1 + cv('k_ambush');
    if (e.elite || e.def?.big || e.boss) d *= 1 + cv('k_giant');
    if (o.kind === 'melee' && e.hp / e.maxHp < 0.25) d *= 1 + cv('w_exec');
    if (run.cls === 'archer' && d2(P.pos, e.pos) > 10) d *= 1 + cv('a_range');
    if (P.buff.react > 0) d *= 1 + cv('k_react');
    if (has('k_combo')) { if (P.comboT === e) P.comboN = Math.min(5, P.comboN + 1); else { P.comboT = e; P.comboN = 0; } d *= 1 + P.comboN * cv('k_combo'); }
    let cc = G.S.crit + (run.cls === 'archer' && G.input.rmb ? cv('a_focus') : 0);
    if (!o.noCrit && Math.random() < cc) { crit = true; d *= 1.5 + G.S.critDmg; }
    if (o.head) { d *= 2 + cv('a_eye'); if (has('a_mark')) e.st.mark = { v: cv('a_mark'), t: 4 }; }
  }
  let mod = 1 + (e.st.mark?.t > 0 ? e.st.mark.v : 0) + (e.st.intim?.t > 0 ? e.st.intim.v : 0);
  d *= mod;
  // 방어 판정
  const dir = o.dir ? tmpV.copy(o.dir).setY(0).normalize() : tmpV.copy(e.pos).sub(P.pos).setY(0).normalize();
  const fw = enemyForward(e); const facing = -(fw.x * dir.x + fw.z * dir.z); // >0 이면 앞에서 맞음
  if (e.def?.front && facing > 0.3) d *= e.def.front;
  if (e.def?.backCrystal) d *= facing < -0.3 ? 2 : 0.5;
  if (e.affix === 'tough') d *= 0.7;
  if (e.boss) d *= bossDamageMod(e, o, facing);
  d = Math.max(1, Math.round(d));
  e.hp -= d; e.flash = 0.1; e.lastHit = G.time;
  UI.dmgWorld(o.point || e.pos, o.point ? 0 : e.h, d, crit || o.head ? '#ffd24a' : '#ffffff', crit || o.head);
  if (o.kind === 'melee') { G.hitStop = 0.05; vibrate(15); }
  const leech = G.S.leech + (has('kL_vamp') ? 0.06 : 0) + (o.kind === 'melee' ? cv('w_leech') : 0);
  if (leech > 0) heal(d * leech, 'leech');
  if (e.hp <= 0) killEnemy(e, o);
  return d;
}
function killEnemy(e, o) {
  if (e.dead) return; e.dead = true;
  const run = G.run; run.kills++;
  if (e.boss) { bossDied(e); return; }
  gainXp(e.def.xp * (e.elite ? 3 : 1));
  run.mats += Math.floor(rnd(1, 4)) + (Math.random() < cv('k_collect') ? 1 : 0);
  if (has('k_kill')) heal(cv('k_kill'));
  if (uniqOn('u_star')) G.P.cd.q = Math.max(0, G.P.cd.q - 1);
  burst(e.pos, e.def.color, 12, e.h * 0.5);
  if (e.def.poisonOnDeath) addZone(e.pos, 1.6, 2, 'poison', { dps: 5, side: 'enemy' });
  if (o.fire && has('m_chain')) explode(e.pos, 2.5, cv('m_chain'), { raw: false, color: 0xff8a3a });
  if (e.affix === 'split') for (let i = 0; i < 2; i++) spawnEnemy(e.key, e.pos.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))), null, { mini: true, hpMult: 0.3 });
  const dropP = e.elite ? 0.5 : e.def.big ? 0.3 : 0.12;
  if (Math.random() < dropP) dropItem(e.pos);
  sfx('kill');
  removeEnemy(e);
}
function revealVine(e) {
  e.state = 'move'; for (const c of e.model.children) c.visible = !c.userData.isBush; sfx('pop');
}
function enemyCanAct(e) { return !(e.st.stun > 0 || e.st.freeze > 0); }
function updateEnemy(e, dt) {
  const P = G.P, def = e.def;
  for (const k of ['stun', 'freeze', 'root']) if (e.st[k] > 0) e.st[k] -= dt;
  for (const k of ['mark', 'intim', 'slow', 'burn']) if (e.st[k]) { e.st[k].t -= dt; if (e.st[k].t <= 0) delete e.st[k]; }
  if (e.st.burn) { e.st.burnAcc = (e.st.burnAcc || 0) + dt; if (e.st.burnAcc > 0.5) { e.st.burnAcc = 0; hitEnemy(e, e.st.burn.dps * 0.5, { raw: true, noCrit: true }); if (e.dead) return; } }
  if (e.flash > 0) { e.flash -= dt; A.flash(e.model, e.flash > 0); }
  else if (e.st.freeze > 0) A.tint(e.model, 0x8fd8ff, 0.6); else if (e.wind > 0) A.tint(e.model, 0xff4a3a, 0.5 * (1 - e.wind / (e.windMax || 1))); else A.flash(e.model, false);
  if (e.affix === 'burning') { e.burnT = (e.burnT || 0) - dt; if (e.burnT <= 0) { e.burnT = 0.6; addZone(e.pos, 1, 3, 'fire', { dps: 6, side: 'enemy' }); } }
  if (e.boss) { updateBoss(e, dt); return; }
  const toP = tmpV.copy(P.pos).sub(e.pos).setY(0); const dist = toP.length(); toP.normalize();
  const slowM = e.st.slow ? 1 - e.st.slow.v : 1;
  let move = null; e.t += dt; e.atkT -= dt;
  if (!enemyCanAct(e)) { e.wind = 0; return finishEnemy(e, dt); }
  if (e.state === 'hidden') { if (dist < 3.5) revealVine(e); return finishEnemy(e, dt); }
  e.yaw = Math.atan2(toP.x, toP.z);
  const reach = 1.1 + e.r;
  switch (def.type) {
    case 'rush': case 'ambush': case 'shield': {
      if (def.teleport) { e.tp = (e.tp ?? 4) - dt; if (e.tp <= 0 && dist > 3) { e.tp = 4; burst(e.pos, 0x6a5a9a, 10, 1); const back = tmpV2.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(2.2); e.pos.copy(P.pos).add(back); burst(e.pos, 0x6a5a9a, 10, 1); } }
      if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) { if (dist < reach + 0.6) enemyHitPlayer(e, e.atk); e.atkT = 1.2; } break; }
      if (dist < reach && e.atkT <= 0) { e.wind = e.windMax = 0.4; break; }
      if (def.flank && dist > 5) { const side = e.id > 0.5 ? 1 : -1; move = tmpV2.set(P.pos.x - toP.z * 4 * side - e.pos.x, 0, P.pos.z + toP.x * 4 * side - e.pos.z).normalize(); }
      else if (dist > reach * 0.8) move = toP.clone();
      break;
    }
    case 'flyer': {
      e.vy = 1.6 + Math.sin(e.t * 4 + e.id * 9) * 0.3;
      if (e.model.userData.wings) { const w = Math.sin(e.t * 22) * 0.6; e.model.userData.wings[0].rotation.z = Math.PI / 2 + w; e.model.userData.wings[1].rotation.z = -Math.PI / 2 - w; }
      if (e.state === 'back') { e.backT -= dt; move = toP.clone().multiplyScalar(-1); if (e.backT <= 0) e.state = 'move'; break; }
      if (dist < 1.1 && e.atkT <= 0) { enemyHitPlayer(e, e.atk); e.atkT = 1; e.state = 'back'; e.backT = 0.8; break; }
      move = toP.clone(); break;
    }
    case 'shooter': {
      const keep = def.keep;
      if (dist < keep - 2) move = toP.clone().multiplyScalar(-1); else if (dist > keep + 2) move = toP.clone();
      if (e.wind > 0) { e.wind -= dt; if (e.line) { e.line.position.set(e.pos.x, 0.05, e.pos.z); e.line.rotation.y = Math.atan2(toP.x, toP.z); }
        if (e.wind <= 0) { if (e.line) { scene.remove(e.line); e.line = null; } shootAtPlayer(e, def.telegraph ? 18 : 11, def.telegraph ? 0xd9c08a : 0xf2a6c8); e.atkT = def.telegraph ? 2.5 : 2; } break; }
      if (e.atkT <= 0 && dist < 24) { e.wind = e.windMax = def.telegraph ? 0.5 : 0.25; if (def.telegraph) { e.line = A.telegraphLine(dist + 2, 0.25); scene.add(e.line); } }
      break;
    }
    case 'bomber': {
      move = toP.clone();
      if (dist < e.r + 0.9) { explode(e.pos, 2, 0, { enemySide: true, dmg: e.atk, color: 0xd9c08a }); e.dead = true; gainXp(def.xp); removeEnemy(e); return; }
      e.model.rotation.x += dt * 8; break;
    }
    case 'tank': {
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.model.userData.arms) for (const a of e.model.userData.arms) a.rotation.x = -2.6 * (1 - e.wind / e.windMax);
        if (e.wind <= 0) {
          if (e.model.userData.arms) for (const a of e.model.userData.arms) a.rotation.x = 0;
          const fw = enemyForward(e), hitP = e.pos.clone().addScaledVector(fw, 1.6);
          ringFx(hitP, 2.5, 0xb9b0a0); shake(0.3);
          if (d2(hitP, P.pos) < 2.5 && P.pos.y < 0.8) enemyHitPlayer(e, e.atk);
          e.atkT = 2;
        }
        break;
      }
      if (dist < 3 && e.atkT <= 0) { e.wind = e.windMax = 1.0; break; }
      move = toP.clone(); break;
    }
    case 'support': {
      if (dist < def.keep - 1.5) move = toP.clone().multiplyScalar(-1); else if (dist > def.keep + 2) move = toP.clone();
      e.healT = (e.healT ?? 3) - dt;
      if (e.healT <= 0) { e.healT = 3; ringFx(e.pos, 6, 0x7cff7c); for (const o of G.enemies) if (o !== e && !o.boss && d2(o.pos, e.pos) < 6) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.1); } }
      break;
    }
  }
  if (move && !(e.st.root > 0)) { e.pos.addScaledVector(move.normalize(), e.speed * slowM * dt); }
  finishEnemy(e, dt);
}
function finishEnemy(e, dt) {
  // 겹침 방지
  for (const o of G.enemies) { if (o === e || o.boss) continue; const dd = d2(o.pos, e.pos), m = o.r + e.r; if (dd < m && dd > 0.001) { tmpV.copy(e.pos).sub(o.pos).setY(0).normalize().multiplyScalar((m - dd) * 0.5); e.pos.add(tmpV); } }
  pushOut(e.pos, e.r);
  const y = e.def.type === 'flyer' ? e.vy : 0;
  e.model.position.set(e.pos.x, y, e.pos.z); e.model.rotation.y = e.yaw;
  if (e.def.type !== 'bomber' && e.def.type !== 'flyer') e.model.position.y = Math.abs(Math.sin(e.t * 8)) * 0.05;
  const showBar = e.hp < e.maxHp; e.bar.visible = showBar;
  if (showBar) { e.bar.position.set(e.pos.x, y + e.h + 0.45, e.pos.z); e.bar.quaternion.copy(camera.quaternion); e.bar.scale.setScalar(e.elite ? 1.4 : 1); e.bar.userData.fg.scale.x = Math.max(0, e.hp / e.maxHp); }
}
function enemyHitPlayer(e, dmg) {
  const dealt = takeDamage(dmg, { src: e, melee: true });
  if (e.affix === 'vamp' && dealt > 0) e.hp = Math.min(e.maxHp, e.hp + dealt * 0.3);
}
function shootAtPlayer(e, speed, color) {
  const from = e.pos.clone().setY(e.h * 0.7);
  const to = G.P.pos.clone().setY(1.0);
  const v = to.sub(from).normalize().multiplyScalar(speed);
  const mesh = A.orb(0.15, color); mesh.position.copy(from); scene.add(mesh);
  G.eprojs.push({ pos: mesh.position, vel: v, r: 0.2, dmg: e.atk, mesh, life: 4, src: e });
}

// ================= 보스 =================
function spawnBoss(key) {
  const def = D.BOSSES[key], model = A.makeBoss(key); scene.add(model);
  const pos = key === 'thorn' ? new THREE.Vector3(0, 0, -6) : new THREE.Vector3(0, 0, -8);
  const e = { key, def, boss: true, model, pos, yaw: 0, hp: def.hp, maxHp: def.hp, atk: 20, r: def.r, h: def.h, st: {}, flash: 0, bar: new THREE.Group(),
    t: 0, pat: 2.5, phase: 1, state: 'idle', minions: 0, id: Math.random() };
  model.position.copy(pos); G.enemies.push(e); G.boss = e; scene.add(e.bar);
  UI.bossBar(def.name, 1);
  sfx('boss');
}
function bossDamageMod(e, o, facing) {
  if (e.key === 'gate' && e.state !== 'stunned' && facing > 0.3) return 0.3;
  const pt = o.point;
  if (e.key === 'thorn' && e.phase === 2 && pt) {
    for (const k of e.model.userData.knots) { k.getWorldPosition(tmpV2); if (tmpV2.distanceTo(pt) < 1.0) { burst(tmpV2, 0xffe36b, 6, 0); return 2; } }
  }
  if (e.key === 'turtleking') {
    if (e.phase === 2 && pt) {
      for (const c of e.model.userData.crystals) { if (!c.visible) continue; c.getWorldPosition(tmpV2); if (tmpV2.distanceTo(pt) < 1.4) {
        c.userData.hp = (c.userData.hp ?? 150) - 30; burst(tmpV2, 0x9ff0ff, 6, 0);
        if (c.userData.hp <= 0) { c.visible = false; c.userData.outline.visible = false; sfx('break');
          if (e.model.userData.crystals.every(x => !x.visible)) { e.state = 'stunned'; e.stunT = 5; UI.banner('수정이 모두 깨졌다! 5초 기절'); } }
        return 2; } }
    }
    if (e.state === 'stunned') return 1.5;
  }
  return 1;
}
function bossPatternTimer(e, base) { return base * (e.phase === 2 ? 0.77 : 1); }
function updateBoss(e, dt) {
  const P = G.P, toP = tmpV.copy(P.pos).sub(e.pos).setY(0), dist = toP.length(); toP.normalize();
  e.t += dt; e.pat -= dt;
  if (e.phase === 1 && e.hp / e.maxHp < 0.4) {
    e.phase = 2; UI.banner(`${e.def.name}이(가) 분노했다`);
    if (e.key === 'thorn') for (const k of e.model.userData.knots) { k.visible = true; k.userData.outline.visible = true; }
    if (e.key === 'turtleking') for (const c of e.model.userData.crystals) c.material.emissive.setHex(0x40d8f0);
  }
  if (e.stunT > 0) { e.stunT -= dt; e.model.rotation.z = Math.sin(e.t * 10) * 0.05; if (e.stunT <= 0) { e.state = 'idle'; e.model.rotation.z = 0; } finishBoss(e); return; }
  if (!enemyCanAct(e)) { finishBoss(e); return; }
  const K = e.key;
  if (K === 'thorn') {
    e.yaw = Math.atan2(toP.x, toP.z) * 0.15;
    if (e.pat <= 0) {
      const choices = ['roots', 'seeds']; if (e.hp / e.maxHp < 0.5 && e.minions < 8) choices.push('summon');
      const c = pick(choices); e.pat = bossPatternTimer(e, 2.4);
      if (c === 'roots') { for (let i = 0; i < 3; i++) { const p = i === 0 ? P.pos.clone() : P.pos.clone().add(new THREE.Vector3(rnd(-4, 4), 0, rnd(-4, 4))); groundStrike(p, 1.6, 1.0, 25, 'spike'); } }
      if (c === 'seeds') { const from = e.pos.clone().setY(3.5); const base = Math.atan2(toP.x, toP.z); for (let i = -3; i <= 3; i++) { const a = base + i * 0.13; const v = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(10); v.y = (1.0 - 3.5) / (dist / 10 + 0.01); const m = A.orb(0.22, 0x8a6a3a); m.position.copy(from); scene.add(m); G.eprojs.push({ pos: m.position, vel: v, r: 0.3, dmg: 10, mesh: m, life: 4 }); } }
      if (c === 'summon') { for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; queueSpawn('mushroom', null, i * 0.1); e.minions++; } }
    }
  } else if (K === 'queen') {
    if (e.state === 'burrow') {
      e.bt -= dt; e.model.position.y = -3.5 * clamp(1 - e.bt / 0.6, 0, 1) * (e.bt > 0 ? 1 : 0);
      if (e.bt <= 0 && !e.tele) { e.tele = true; const p = P.pos.clone(); groundStrike(p, 2.5, 1.2, 30, 'emerge', () => { e.pos.copy(p); e.state = 'idle'; e.invuln = false; e.tele = false; e.model.visible = true; e.model.position.y = 0; }); e.model.visible = false; }
      finishBoss(e); return;
    }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 7) e.pos.addScaledVector(toP, 1.5 * dt); else if (dist < 4) e.pos.addScaledVector(toP, -1.5 * dt);
    if (e.pat <= 0) {
      const c = pick(['spore', 'spore', 'summon', 'burrow']); e.pat = bossPatternTimer(e, 3);
      if (c === 'spore') { const p = P.pos.clone(); const tc = A.telegraphCircle(3, 0x9ad04a); tc.position.set(p.x, 0.04, p.z); scene.add(tc); G.teles.push({ mesh: tc, t: 0, total: 0.8, onDone: () => addZone(p, 3, 5, 'spore', { dps: 5, side: 'enemy', blur: true }) }); }
      if (c === 'summon' && G.enemies.length < 12) for (let i = 0; i < 6; i++) queueSpawn('mushroom', null, i * 0.08);
      if (c === 'burrow') { e.state = 'burrow'; e.bt = 0.6; e.invuln = true; e.tele = false; }
    }
  } else if (K === 'gate') {
    if (e.state === 'charge') {
      e.pos.addScaledVector(e.cdir, 18 * dt);
      if (!e.chit && d2(e.pos, P.pos) < e.r + 0.8) { e.chit = true; takeDamage(25, { src: e, melee: true }); }
      const hitWall = e.pos.length() > D.ARENA_R - e.r - 0.3 || G.obstacles.some(o => d2(o, e.pos) < o.r + e.r);
      e.ct -= dt;
      if (hitWall || e.ct <= 0) { e.state = 'stunned'; e.stunT = hitWall ? 2.5 : 0.8; shake(0.4); if (hitWall) UI.banner('수문장이 기절했다 — 등을 노려라'); }
      finishBoss(e); return;
    }
    if (e.state === 'windup') { e.wt -= dt; if (e.wt <= 0) { scene.remove(e.line); e.line = null; e.state = 'charge'; e.chit = false; e.ct = 2.2; } finishBoss(e); return; }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 4) e.pos.addScaledVector(toP, 2.2 * dt);
    if (e.pat <= 0) {
      e.pat = bossPatternTimer(e, 3.2);
      if (Math.random() < 0.55) { e.state = 'windup'; e.wt = 1.0; e.cdir = toP.clone(); e.line = A.telegraphLine(40, e.r * 2); e.line.position.set(e.pos.x, 0.05, e.pos.z); e.line.rotation.y = Math.atan2(toP.x, toP.z); scene.add(e.line); }
      else { const c = e.pos.clone(); G.teles.push({ mesh: null, t: 0, total: 0.8, onDone: () => shockwave(c, 14, 1.2, 20) }); e.model.position.y = 0.6; }
    }
  } else if (K === 'turtleking') {
    if (e.state === 'spin') {
      e.pos.addScaledVector(e.cdir, 16 * dt); e.model.rotation.y += dt * 18;
      if (!e.chit && d2(e.pos, P.pos) < e.r + 0.7) { e.chit = true; takeDamage(30, { src: e, melee: true }); }
      e.ct -= dt;
      if (e.pos.length() > D.ARENA_R - e.r - 0.3 || e.ct <= 0) { e.state = 'idle'; e.invuln = false; shake(0.4); }
      finishBoss(e, true); return;
    }
    if (e.state === 'windup') { e.wt -= dt; if (e.wt <= 0) { scene.remove(e.line); e.line = null; e.state = 'spin'; e.invuln = true; e.chit = false; e.ct = 2.4; } finishBoss(e); return; }
    if (e.state === 'laser') {
      e.la += dt * (Math.PI * 2 / 4) * (e.phase === 2 ? 1.3 : 1); e.lt -= dt;
      e.laser.position.set(e.pos.x, 0.45, e.pos.z); e.laser.rotation.y = e.la;
      const ang = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z); let diff = Math.atan2(Math.sin(ang - e.la), Math.cos(ang - e.la));
      if (Math.abs(diff) < Math.atan2(0.6, Math.max(dist, 1)) && dist < 20 && P.pos.y < 0.55 && (e.lhit || 0) <= 0) { takeDamage(20, { src: e }); e.lhit = 0.6; }
      e.lhit = (e.lhit || 0) - dt;
      if (e.lt <= 0) { scene.remove(e.laser); e.laser = null; e.state = 'idle'; }
      finishBoss(e); return;
    }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 6) e.pos.addScaledVector(toP, 1.4 * dt);
    if (e.pat <= 0) {
      const c = pick(['laser', 'spin', 'shards']); e.pat = bossPatternTimer(e, 3.4);
      if (c === 'laser') { e.state = 'laser'; e.lt = 4; e.la = e.yaw + Math.PI; const geo = new THREE.BoxGeometry(0.35, 0.35, 20); geo.translate(0, 0, 10); e.laser = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9ff0ff })); scene.add(e.laser); UI.banner('광선! 점프로 넘어라', 1.2); }
      if (c === 'spin') { e.state = 'windup'; e.wt = 0.8; e.cdir = toP.clone(); e.line = A.telegraphLine(40, e.r * 2); e.line.position.set(e.pos.x, 0.05, e.pos.z); e.line.rotation.y = Math.atan2(toP.x, toP.z); scene.add(e.line); }
      if (c === 'shards') for (let i = 0; i < 5; i++) groundStrike(P.pos.clone().add(new THREE.Vector3(rnd(-5, 5), 0, rnd(-5, 5))), 1.8, 1.2, 15, 'shard');
    }
  }
  finishBoss(e);
}
function finishBoss(e, spinning) {
  pushOut(e.pos, e.r);
  e.model.position.x = e.pos.x; e.model.position.z = e.pos.z;
  if (!spinning) e.model.rotation.y = e.yaw;
  if (e.model.position.y > 0 && e.state !== 'burrow') e.model.position.y = Math.max(0, e.model.position.y - 0.05);
  UI.bossBar(e.def.name, e.hp / e.maxHp);
}
function bossDied(e) {
  const run = G.run; gainXp(e.def.xp);
  burst(e.pos, e.def.color, 40, 2);
  if (e.laser) scene.remove(e.laser); if (e.line) scene.remove(e.line);
  removeEnemy(e); G.boss = null; UI.bossBar(null);
  for (const x of [...G.enemies]) removeEnemy(x);
  sfx('victory');
  if (e.def.mid) {
    dropItem(e.pos, { minR: 1, boss: e.key });
    waveCleared();
  } else {
    const first = !G.save.killed[e.key]; G.save.killed[e.key] = true;
    dropItem(e.pos, { minR: 2, boss: e.key }); dropItem(e.pos, { minR: 2, boss: e.key });
    const next = D.FINAL_ORDER.find(b => D.BOSSES[b].unlockAfter === e.key);
    if (first && next) UI.toast(`새 최종 보스 해금: ${D.BOSSES[next].name}`);
    run.phase = 'victory'; UI.banner('승리! 장비를 줍고 포털로', 3);
    const p = A.makePortal(); p.position.set(0, 1.7, 8); scene.add(p); run.portal = p;
  }
}
function groundStrike(p, r, t, dmg, kind, after) {
  const tc = A.telegraphCircle(r); tc.position.set(p.x, 0.04, p.z); scene.add(tc);
  G.teles.push({ mesh: tc, t: 0, total: t, onDone: () => {
    burst(p, kind === 'shard' ? 0x9ff0ff : kind === 'spike' ? 0x6a4a2e : 0xd9614c, 10, 0.3);
    if (d2(p, G.P.pos) < r && G.P.pos.y < 1.2) takeDamage(dmg, { src: null, pos: p });
    after && after();
  } });
}
function shockwave(c, maxR, dur, dmg) {
  const m = A.ringPulse(0.5, 0xd6c49a); m.position.x = c.x; m.position.z = c.z; scene.add(m); shake(0.3);
  G.fx.push({ mesh: m, t: 0, dur, hit: false, tick(fx, dt) { fx.t += dt; const r = 0.5 + (maxR - 0.5) * (fx.t / dur); m.scale.setScalar(r); m.material.opacity = 0.9 * (1 - fx.t / dur);
    const pd = d2(c, G.P.pos); if (!fx.hit && Math.abs(pd - r) < 0.7 && G.P.pos.y < 0.35) { fx.hit = true; takeDamage(dmg, { src: null, pos: c }); }
    return fx.t < dur; } });
}

// ================= 플레이어 피해·회복 =================
export function takeDamage(amount, o = {}) {
  const P = G.P; if (G.mode !== 'run' || P.dead) return 0;
  if (P.invuln > 0 || (P.dashT > 0 && has('aL_dance'))) return 0;
  if (uniqOn('b_shell') && P.shellCd <= 0) { P.shellCd = 5; UI.toast('수정 보호막이 막았다'); sfx('block'); return 0; }
  const srcPos = o.src ? o.src.pos : o.pos;
  let front = false;
  if (srcPos) { const dx = srcPos.x - P.pos.x, dz = srcPos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; front = (-Math.sin(P.yaw) * dx - Math.cos(P.yaw) * dz) / l > 0.3; }
  let d = amount;
  if (G.run.cls === 'warrior' && P.blocking && front) {
    const blocked = d * Math.min(0.97, 0.8 + cv('w_sturdy')); d -= blocked; sfx('block');
    if (o.src && has('w_reflect')) hitEnemy(o.src, blocked * cv('w_reflect'), { raw: true, noCrit: true });
    if (has('w_riposte')) P.buff.riposte = 1;
    if (has('wL_giant')) P.giant += blocked;
    if (uniqOn('u_shock')) explode(P.pos, 3, 20, { color: 0xd6c49a });
  }
  if (front && uniqOn('b_crest')) d *= 0.8;
  d *= G.S.dr;
  if (P.hp / G.S.hpMax < 0.3) d *= 1 - cv('w_unyield');
  if (P.buff.shout > 0) d *= 0.7;
  if (P.buff.carmor > 0) d *= 1 - cv('c_armor');
  if (P.buff.mice > 0) d *= 1 - cv('m_ice');
  if (inSanctuary()) d *= 0.8;
  d = Math.max(0, Math.round(d));
  if (d <= 0) return 0;
  P.hp -= d; UI.hurt(); shake(0.25); vibrate(40); sfx('hurt');
  if (o.melee && o.src && !o.src.boss) {
    if (has('k_thorns')) hitEnemy(o.src, cv('k_thorns'), { raw: true, noCrit: true });
    if (uniqOn('b_vine')) o.src.st.root = 2;
  }
  if (uniqOn('b_spore')) addZone(P.pos, 2, 3, 'poison', { dps: 8, side: 'player' });
  if (P.hp > 0 && P.hp / G.S.hpMax < 0.3 && has('k_escape') && P.escapeCd <= 0) { P.invuln = 2; P.escapeCd = cv('k_escape'); UI.toast('위기 탈출!'); }
  if (P.hp <= 0) {
    if (has('cL_angel') && !P.angelUsed) { P.angelUsed = true; P.hp = G.S.hpMax; P.invuln = 3; UI.banner('수호 천사가 되살렸다'); sfx('levelup'); }
    else die();
  }
  return d;
}
export function heal(a, src) {
  const P = G.P; if (!P || P.dead) return;
  if (has('kL_vamp') && src !== 'leech') a *= 0.5;
  P.hp = Math.min(G.S.hpMax, P.hp + a);
}
function inSanctuary() { return G.zones.some(z => z.kind === 'sanct' && d2(z.pos, G.P.pos) < z.r); }

// ================= 경험치 =================
function gainXp(x) {
  const c = G.save.classes[G.run.cls];
  if (c.lv >= D.LEVEL_CAP) return;
  c.xp += x;
  while (c.lv < D.LEVEL_CAP && c.xp >= D.xpForLevel(c.lv)) { c.xp -= D.xpForLevel(c.lv); c.lv++; UI.banner(`레벨 업! Lv.${c.lv}`, 1.5); sfx('levelup'); computeStats(); }
  if (c.lv >= D.LEVEL_CAP) c.xp = 0;
}

// ================= 판 종료 =================
function die() {
  const P = G.P; P.dead = true; sfx('death');
  G.mode = 'result'; UI.unlockPointer();
  const bag = G.run.bag;
  UI.showResult({ win: false, run: G.run, bag, mats: Math.floor(G.run.mats * 0.5) }, keep => finishRun(false, keep));
}
function victory() {
  G.mode = 'result'; UI.unlockPointer();
  UI.showResult({ win: true, run: G.run, bag: G.run.bag, mats: G.run.mats }, () => finishRun(true));
}
function finishRun(win, keepItem) {
  const s = G.save, run = G.run;
  const items = win ? run.bag : (keepItem ? [keepItem] : []);
  for (const it of items) {
    if (s.stash.length < 40) s.stash.push(it); else s.mats += D.SALVAGE[it.r];
  }
  s.mats += win ? run.mats : Math.floor(run.mats * 0.5);
  writeSave();
  clearArena(true); G.run = null; G.P = null;
  G.mode = 'town'; UI.showTown();
}

// ================= 영역 효과 =================
function addZone(pos, r, dur, kind, o = {}) {
  const colors = { poison: 0x8fd04a, fire: 0xff7a3a, spore: 0x9ad04a, sanct: 0xfff3a0, ice: 0x9fe6ff, rain: 0xd9c08a, trap: 0xc9a46a };
  const mesh = kind === 'spore' ? A.cloud(r, colors[kind], 0.35) : A.telegraphCircle(r, colors[kind]);
  mesh.position.set(pos.x, kind === 'spore' ? 0.6 : 0.03, pos.z);
  if (mesh.userData.fill) mesh.userData.fill.material.opacity = kind === 'sanct' ? 0.18 : 0.3;
  scene.add(mesh);
  const z = { pos: pos.clone(), r, t: dur, kind, mesh, acc: 0, ...o }; G.zones.push(z); return z;
}
function updateZones(dt, wdt) {
  const P = G.P; let blur = false;
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i]; z.t -= z.side === 'enemy' ? wdt : dt; z.acc += dt;
    if (z.follow) { z.pos.copy(P.pos); z.mesh.position.x = P.pos.x; z.mesh.position.z = P.pos.z; }
    const tick = z.acc >= 0.5; if (tick) z.acc = 0;
    if (z.side === 'enemy') {
      const inside = d2(z.pos, P.pos) < z.r;
      if (inside && z.blur) blur = true;
      if (inside && tick && z.dps) takeDamage(z.dps * 0.5, { pos: z.pos });
    } else {
      for (const e of [...G.enemies]) {
        if (d2(z.pos, e.pos) > z.r + e.r) continue;
        if (z.kind === 'ice') e.st.slow = { v: cv('m_cold') || 0.5, t: 0.6 };
        if (z.kind === 'trap' && !z.used && !e.boss) { e.st.root = z.root; z.used = true; z.t = 0; }
        if (tick && z.dps) hitEnemy(e, z.dps * 0.5, { raw: z.raw, noCrit: true, kind: 'aoe' });
      }
      if (z.kind === 'sanct' && tick && d2(z.pos, P.pos) < z.r) heal(8 * 0.5);
      if (z.kind === 'rain') for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * z.r; spawnPart(new THREE.Vector3(z.pos.x + Math.cos(a) * rr, 6, z.pos.z + Math.sin(a) * rr), new THREE.Vector3(0, -22, 0), 0xc89a5a, 0.3, 0.06); }
    }
    if (z.t <= 0) { scene.remove(z.mesh); G.zones.splice(i, 1); }
  }
  UI.blur(blur);
}

// ================= 투사체 =================
function fireProj(o) {
  const mesh = o.mesh || A.orb(o.size || 0.12, o.color || 0xfff3a0);
  mesh.position.copy(o.pos); scene.add(mesh);
  if (o.vel && mesh.isGroup !== false) mesh.lookAt(tmpV.copy(o.pos).add(o.vel));
  const p = { pos: mesh.position, vel: o.vel, r: o.r || 0.25, mesh, life: o.life || 2.5, pierce: o.pierce || 0, hits: new Set(), grav: o.grav || 0, onHit: o.onHit, onEnd: o.onEnd, explodeGround: o.explodeGround };
  G.projectiles.push(p); return p;
}
function updateProjectiles(dt, wdt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.life -= dt; p.vel.y -= p.grav * dt;
    p.pos.addScaledVector(p.vel, dt); if (p.grav) p.mesh.lookAt(tmpV.copy(p.pos).add(p.vel));
    let dead = p.life <= 0;
    if (p.pos.y <= 0.05) { dead = true; if (p.explodeGround) p.onEnd?.(p.pos.clone()); }
    for (const o of G.obstacles) if (d2(p.pos, o) < o.r + p.r * 0.5 && p.pos.y < o.h) { dead = true; p.onEnd?.(p.pos.clone()); break; }
    if (!dead) for (const e of [...G.enemies]) {
      if (p.hits.has(e) || e.dead) continue;
      const yy = e.def.type === 'flyer' ? e.vy : 0;
      if (d2(p.pos, e.pos) < e.r + p.r && p.pos.y > yy - 0.3 && p.pos.y < yy + e.h + 0.2) {
        p.hits.add(e);
        const head = !e.boss && e.def.type !== 'flyer' && p.pos.y > yy + e.h * 0.72;
        p.onHit(e, p.pos.clone(), head, p.vel.clone());
        if (p.pierce-- <= 0) { dead = true; p.onEnd?.(p.pos.clone()); break; }
      }
    }
    if (dead) { scene.remove(p.mesh); G.projectiles.splice(i, 1); }
  }
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const p = G.eprojs[i]; p.life -= wdt; p.pos.addScaledVector(p.vel, wdt);
    let dead = p.life <= 0 || p.pos.y < 0;
    for (const o of G.obstacles) if (d2(p.pos, o) < o.r && p.pos.y < o.h) dead = true;
    const pc = tmpV.copy(G.P.pos).setY(G.P.pos.y + 1.0);
    if (!dead && p.pos.distanceTo(pc) < p.r + 0.5) { takeDamage(p.dmg, { src: p.src, pos: p.src ? null : p.pos }); dead = true; }
    if (dead) { scene.remove(p.mesh); G.eprojs.splice(i, 1); }
  }
}
function explode(pos, r, dmg, o = {}) {
  ringFx(pos, r, o.color || 0xff8a3a); burst(pos, o.color || 0xff8a3a, 10, 0.5);
  if (o.enemySide) { if (d2(pos, G.P.pos) < r) takeDamage(o.dmg, { pos }); return; }
  for (const e of [...G.enemies]) if (d2(pos, e.pos) < r + e.r && e !== o.skip) hitEnemy(e, dmg, { kind: 'aoe', raw: o.raw, fire: o.fire, point: e.boss ? pos.clone().setY(1) : null, noCrit: o.noCrit });
}

// ================= 파티클·연출 =================
function spawnPart(pos, vel, color, life, size = 0.08) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color }));
  m.position.copy(pos); scene.add(m); G.parts.push({ mesh: m, vel, life });
}
function burst(pos, color, n, y = 0.5) { for (let i = 0; i < n; i++) spawnPart(new THREE.Vector3(pos.x, (pos.y || 0) + y, pos.z), new THREE.Vector3(rnd(-3, 3), rnd(1, 5), rnd(-3, 3)), color, rnd(0.3, 0.7)); }
function ringFx(pos, r, color) { const m = A.ringPulse(0.3, color); m.position.x = pos.x; m.position.z = pos.z; scene.add(m); G.fx.push({ mesh: m, t: 0, dur: 0.35, tick(fx, dt) { fx.t += dt; m.scale.setScalar(0.3 + (r - 0.3) * fx.t / fx.dur); m.material.opacity = 0.8 * (1 - fx.t / fx.dur); return fx.t < fx.dur; } }); }
function beamFx(from, to, color, dur = 0.15, w = 0.08) {
  const len = from.distanceTo(to); const geo = new THREE.CylinderGeometry(w, w, len, 6); geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })); m.position.copy(from); m.lookAt(to); scene.add(m);
  G.fx.push({ mesh: m, t: 0, dur, tick(fx, dt) { fx.t += dt; m.material.opacity = 0.9 * (1 - fx.t / fx.dur); return fx.t < fx.dur; } });
}
let shakeAmt = 0;
function shake(a) { if (G.save.settings.shake) shakeAmt = Math.max(shakeAmt, a); }
function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 무시 */ } }

// ================= 소리 (Web Audio 합성) =================
let actx = null;
export function sfx(kind) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const T = { hit: [220, 0.06, 'square'], kill: [160, 0.12, 'triangle'], hurt: [110, 0.15, 'sawtooth'], block: [520, 0.08, 'square'], card: [660, 0.15, 'sine'], chest: [440, 0.25, 'triangle'],
      levelup: [880, 0.35, 'sine'], pick: [740, 0.1, 'sine'], boss: [90, 0.6, 'sawtooth'], victory: [660, 0.6, 'triangle'], death: [80, 0.8, 'sawtooth'], portal: [520, 0.4, 'sine'], pop: [300, 0.08, 'square'], break: [900, 0.2, 'triangle'], shoot: [480, 0.05, 'triangle'], cast: [360, 0.12, 'sine'] }[kind];
    if (!T) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = T[2]; o.frequency.setValueAtTime(T[0], actx.currentTime);
    if (kind === 'levelup' || kind === 'victory' || kind === 'card') o.frequency.exponentialRampToValueAtTime(T[0] * 2, actx.currentTime + T[1]);
    else o.frequency.exponentialRampToValueAtTime(Math.max(40, T[0] * 0.5), actx.currentTime + T[1]);
    g.gain.setValueAtTime(0.08, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + T[1]);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + T[1]);
  } catch (e) { /* 소리 없음 */ }
}

// ================= 충돌 =================
function pushOut(pos, r) {
  for (const o of G.obstacles) { const dd = d2(pos, o), m = o.r + r; if (dd < m) { const k = dd < 0.001 ? 1 : (m - dd) / dd; pos.x += (pos.x - o.x) * k; pos.z += (pos.z - o.z) * k; } }
  const l = Math.hypot(pos.x, pos.z), lim = D.ARENA_R - r; if (l > lim) { pos.x *= lim / l; pos.z *= lim / l; }
}

// ================= 플레이어 =================
let vm = null;
function setViewModel(cls) { if (vm) vmScene.remove(vm); vm = A.makeViewModel(cls); vmScene.add(vm); }
function aimDir() { return new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation); }
function eyePos() { return new THREE.Vector3(G.P.pos.x, G.P.pos.y + 1.6, G.P.pos.z); }
function groundAim(maxD = 25) {
  const o = eyePos(), d = aimDir();
  let t = d.y < -0.02 ? -o.y / d.y : maxD; t = Math.min(t, maxD);
  const p = o.addScaledVector(d, t); p.y = 0; return p;
}
function hfwd() { return new THREE.Vector3(-Math.sin(G.P.yaw), 0, -Math.cos(G.P.yaw)); }

function updatePlayer(dt) {
  const P = G.P, I = G.input, S = G.S, cls = G.run.cls;
  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  for (const k in P.buff) P.buff[k] = Math.max(0, P.buff[k] - dt);
  P.invuln = Math.max(0, P.invuln - dt); P.escapeCd = Math.max(0, P.escapeCd - dt); P.shellCd = Math.max(0, P.shellCd - dt);
  if (S.regen > 0) heal(S.hpMax * S.regen * dt);
  if (cls === 'cleric') P.mana = Math.min(100, P.mana + 6 * (1 + cv('c_grace')) * dt);
  // 시점
  const sens = 0.0022 * G.save.settings.sens * (cls === 'archer' && I.rmb ? 0.5 : 1);
  P.yaw -= I.lookDX * sens; P.pitch = clamp(P.pitch - I.lookDY * sens, -1.45, 1.45); I.lookDX = I.lookDY = 0;
  aimAssist(dt);
  // 이동
  let mv = new THREE.Vector3(I.mx, 0, -I.my);
  if (mv.lengthSq() > 1) mv.normalize();
  mv.applyAxisAngle(new THREE.Vector3(0, 1, 0), P.yaw);
  let speed = D.CLASSES[cls].speed * S.move;
  if (cls === 'warrior' && P.blocking) speed *= cv('w_wall') || 0.5;
  if (cls === 'archer' && I.rmb) speed *= 0.5;
  if (inSanctuary()) speed *= 1 + cv('c_haste');
  if (P.dashT > 0) {
    P.dashT -= dt; P.pos.addScaledVector(P.dashDir, 6 / 0.18 * dt);
    if (has('kL_wind')) for (const e of G.enemies) if (!P.windHit.has(e) && d2(e.pos, P.pos) < e.r + 0.8) { P.windHit.add(e); hitEnemy(e, 30, { raw: true }); }
    if (P.bashing) for (const e of G.enemies) if (!P.windHit.has(e) && d2(e.pos, P.pos) < e.r + 1.0) { P.windHit.add(e); hitEnemy(e, cv('w_bash'), { kind: 'melee' }); }
    if (P.dashT <= 0) { P.bashing = false; if (uniqOn('u_cloak')) P.invuln = Math.max(P.invuln, 1); }
  } else P.pos.addScaledVector(mv, speed * dt);
  // 점프
  if (I.jumpT && P.onGround) { P.vy = 6.5; P.onGround = false; }
  P.vy -= 18 * dt; P.pos.y += P.vy * dt;
  if (P.pos.y <= 0) { P.pos.y = 0; P.vy = 0; P.onGround = true; }
  // 대시
  if (I.dashT && P.dashT <= 0) {
    const charges = has('aL_dance') ? 2 : 1;
    if (P.cd.dash <= 0 || (charges === 2 && P.dashCharges > 0)) {
      if (has('a_trap')) addZone(P.pos, 1.0, 8, 'trap', { side: 'player', root: cv('a_trap') });
      P.dashDir.copy(mv.lengthSq() > 0.01 ? mv.normalize() : hfwd()); P.dashT = 0.18; P.windHit = new Set();
      if (charges === 2) { P.dashCharges--; if (P.dashCharges <= 0) { P.cd.dash = S.dashCd; } } else P.cd.dash = S.dashCd;
      if (has('a_reflex')) P.reflex = true; if (has('k_react')) P.buff.react = 1.0;
    }
  }
  if (has('aL_dance') && P.cd.dash <= 0 && P.dashCharges < 2) P.dashCharges = 2;
  pushOut(P.pos, 0.4);
  if (G.boss) { const b = G.boss, dd = d2(b.pos, P.pos), m = b.r + 0.4; if (dd < m) { tmpV.copy(P.pos).sub(b.pos).setY(0).normalize().multiplyScalar(m - dd); P.pos.add(tmpV); } }
  // 능력
  ({ warrior: updWarrior, cleric: updCleric, mage: updMage, archer: updArcher })[cls](dt);
  if (I.q && P.cd.q <= 0) useQ();
  // 상호작용
  interact(I.useT);
  I.dashT = I.jumpT = I.useT = false;
}
function aimAssist(dt) {
  const P = G.P, s = G.save.settings.assist; if (!G.isTouch || !s || !G.aim.aiming) return;
  const t = findTarget(8); if (!t) return;
  const tp = tmpV.copy(t.pos).setY((t.def?.type === 'flyer' ? t.vy : 0) + t.h * 0.6).sub(eyePos());
  const wantYaw = Math.atan2(-tp.x, -tp.z), wantPitch = Math.atan2(tp.y, Math.hypot(tp.x, tp.z));
  const k = Math.min(1, dt * (s === 2 ? 6 : 3));
  P.yaw += Math.atan2(Math.sin(wantYaw - P.yaw), Math.cos(wantYaw - P.yaw)) * k; P.pitch += (wantPitch - P.pitch) * k;
}
function findTarget(maxDeg) {
  const o = eyePos(), d = aimDir(); let best = null, bestA = maxDeg * Math.PI / 180;
  for (const e of G.enemies) { if (e.state === 'hidden') continue;
    const p = tmpV2.copy(e.pos).setY((e.def?.type === 'flyer' ? e.vy : 0) + e.h * 0.6).sub(o); const dist = p.length(); if (dist > 40) continue;
    const a = p.normalize().angleTo(d); if (a < bestA) { bestA = a; best = e; } }
  return best;
}
// ---- 전사 ----
function updWarrior(dt) {
  const P = G.P, I = G.input;
  const wasBlocking = P.blocking; P.blocking = I.rmb;
  if (wasBlocking && !P.blocking && has('wL_giant') && P.giant > 0) {
    const f = hfwd(); for (const e of [...G.enemies]) { const to = tmpV.copy(e.pos).sub(P.pos).setY(0); if (to.length() < 6 + e.r && to.normalize().dot(f) > 0.5) hitEnemy(e, P.giant * 2, { raw: true }); }
    ringFx(P.pos.clone().addScaledVector(f, 2), 3, 0xffd58a); P.giant = 0;
  }
  if (I.lmb && P.blocking && has('w_bash') && P.cd.bash <= 0 && P.dashT <= 0) { P.cd.bash = 1; P.dashDir.copy(hfwd()); P.dashT = 0.12; P.bashing = true; P.windHit = new Set(); return; }
  if (I.lmb && !P.blocking && P.cd.lmb <= 0) {
    const now = G.time; P.combo = now - P.lastSwing < 1.2 ? P.combo + 1 : 1; P.lastSwing = now;
    const spin = has('w_spin') && P.combo % 3 === 0;
    const arc = (spin ? 360 : (cv('w_wide') || 90)) * Math.PI / 180;
    let dmg = 22 * (1 + cv('w_sharp')) * (spin ? cv('w_spin') : 1);
    if (P.buff.riposte > 0) { dmg *= 1 + cv('w_riposte'); P.buff.riposte = 0; }
    const f = hfwd(); let any = false;
    for (const e of [...G.enemies]) {
      const to = tmpV.copy(e.pos).sub(P.pos).setY(0); const dist = to.length();
      if (dist > 2.5 + e.r) continue;
      if (to.normalize().angleTo(f) > arc / 2 && dist > e.r + 0.3) continue;
      const pt = eyePos().addScaledVector(aimDir(), Math.max(0.5, dist - e.r * 0.3));
      hitEnemy(e, dmg, { kind: 'melee', point: e.boss ? pt : null }); any = true;
    }
    if (has('wL_wave')) fireProj({ pos: eyePos().add(new THREE.Vector3(0, -0.4, 0)), vel: f.clone().multiplyScalar(24), color: 0xe8f4ff, size: 0.3, r: 0.8, life: 8 / 24, pierce: 99, onHit: (e, pt) => hitEnemy(e, dmg * 0.6, { point: pt }) });
    if (any) sfx('hit');
    P.cd.lmb = 0.6 / (1 + (P.buff.rage > 0 ? cv('w_rage') : 0)); P.swingAnim = spin ? 1.5 : 1;
  }
}
// ---- 성직자 ----
function updCleric(dt) {
  const P = G.P, I = G.input;
  if (I.lmb && P.cd.lmb <= 0) {
    P.cd.lmb = 0.5 * (1 - cv('c_swift')); P.castAnim = 1; P.bolts++; sfx('shoot');
    if (has('cL_sun') && P.bolts % 5 === 0) {
      const o = eyePos(), d = aimDir(), end = o.clone().addScaledVector(d, 30);
      beamFx(o.clone().add(new THREE.Vector3(0, -0.3, 0)), end, 0xfff3a0, 0.3, 0.35);
      for (const e of [...G.enemies]) { const c = tmpV.copy(e.pos).setY(e.h * 0.5); const t = clamp(tmpV2.copy(c).sub(o).dot(d), 0, 30); if (o.clone().addScaledVector(d, t).distanceTo(c) < e.r + 0.8) hitEnemy(e, 80, { point: o.clone().addScaledVector(d, t) }); }
    } else {
      const n = 1 + cv('c_multi');
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.12; const d = aimDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
        fireProj({ pos: eyePos().add(new THREE.Vector3(0, -0.15, 0)), vel: d.multiplyScalar(22), color: 0xfff3a0, size: 0.13, pierce: cv('c_pierce'),
          onHit: (e, pt, head, v) => { hitEnemy(e, 14 * (1 + cv('c_pure')), { point: pt, dir: v }); if (has('c_mark')) e.st.mark = { v: cv('c_mark'), t: 3 }; if (uniqOn('u_life')) heal(2); } });
      }
    }
  }
  if (I.rmb && P.cd.rmb <= 0) {
    const cost = cv('c_thrift') || 25;
    if (P.mana >= cost && P.hp < G.S.hpMax) {
      P.mana -= cost; P.cd.rmb = P.rmbMax = 0.4 * G.S.cdAll; const amt = 30 * (1 + cv('c_deep')); heal(amt); P.castAnim = 1; sfx('cast'); P.healGlow = 0.6;
      ringFx(P.pos, 1.5, 0xfff3a0);
      if (has('c_judg')) for (const e of [...G.enemies]) if (d2(e.pos, P.pos) < 4 + e.r) hitEnemy(e, amt * cv('c_judg'), { raw: true });
      if (has('c_armor')) P.buff.carmor = 3;
    } else if (P.mana < cost) { P.cd.rmb = 0.3; UI.toast('마나 부족'); }
  }
}
// ---- 마법사 ----
function updMage(dt) {
  const P = G.P, I = G.input;
  const chargeFull = 1 * (1 - cv('m_fast')), meteorAt = 2 * (1 - cv('m_fast'));
  if (I.lmb) { if (!P.charging) { P.charging = true; P.charge = 0; } P.charge += dt; }
  else if (P.charging) {
    P.charging = false;
    if (has('mL_meteor') && P.charge >= meteorAt) {
      const p = groundAim(30); const tc = A.telegraphCircle(5, 0xff7a3a); tc.position.set(p.x, 0.04, p.z); scene.add(tc); sfx('cast');
      G.teles.push({ mesh: tc, t: 0, total: 0.6, onDone: () => { explode(p, 5, 120, { color: 0xff5a2a, fire: true }); shake(0.5); } });
    } else if (P.charge >= chargeFull) castFireball();
    else if (P.cd.lmb <= 0) castBolt();
    P.charge = 0;
  }
  if (I.rmb && P.cd.rmb <= 0) {
    P.cd.rmb = P.rmbMax = Math.max(1, (5 - cv('m_blink'))) * G.S.cdAll; const f = hfwd(); burst(P.pos, 0x8a6bd1, 10, 1);
    for (let i = 0; i < 12; i++) { const nx = P.pos.clone().addScaledVector(f, 0.5); if (G.obstacles.some(o => d2(nx, o) < o.r + 0.4)) break; P.pos.copy(nx); }
    pushOut(P.pos, 0.4); burst(P.pos, 0x8a6bd1, 10, 1); sfx('cast');
    if (has('m_ice')) P.buff.mice = 2;
  }
  if (has('mL_storm')) { P.stormT -= dt; if (P.stormT <= 0) { P.stormT = 1; const t = nearestEnemy(P.pos, 6); if (t) { beamFx(eyePos().add(new THREE.Vector3(0, -0.3, 0)), t.pos.clone().setY(t.h * 0.6), 0xbfe0ff, 0.12); hitEnemy(t, 12 * (1 + cv('m_over')) * 0.5, { noCrit: true }); } } }
}
function castBolt() {
  const P = G.P; P.cd.lmb = 0.35 * (1 - cv('m_rapid')); P.castAnim = 1; P.bolts++; sfx('shoot');
  const dmg = 12 * (1 + cv('m_over'));
  fireProj({ pos: eyePos().add(new THREE.Vector3(0, -0.15, 0)), vel: aimDir().multiplyScalar(26), color: 0xbfa8ff, size: 0.12,
    onHit: (e, pt, head, v) => {
      hitEnemy(e, dmg, { point: pt, dir: v });
      if (Math.random() < cv('m_shock')) e.st.stun = Math.max(e.st.stun || 0, 1);
      let from = e, hit = new Set([e]);
      for (let k = 0; k < cv('m_arc'); k++) { const n = nearestEnemy(from.pos, 6, hit); if (!n) break; hit.add(n); beamFx(from.pos.clone().setY(1), n.pos.clone().setY(1), 0xbfe0ff, 0.12); hitEnemy(n, dmg * 0.5, { noCrit: true }); from = n; }
    } });
  if (has('m_static')) { P.statics++; if (P.statics % 3 === 0) explode(P.pos, 3, cv('m_static'), { raw: true, color: 0xbfe0ff, noCrit: true }); }
}
function castFireball() {
  const P = G.P; P.castAnim = 1.5; sfx('cast');
  const dmg = 45 * (1 + cv('m_focus')), rad = 3 * (1 + cv('m_big'));
  const boom = (pt, direct) => {
    explode(pt, rad, dmg * 0.5, { color: 0xff7a3a, fire: true, skip: direct });
    for (const e of G.enemies) if (has('m_burn') && d2(e.pos, pt) < rad + e.r) e.st.burn = { dps: cv('m_burn'), t: 3 };
    if (uniqOn('u_phoenix')) for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; fireProj({ pos: pt.clone().setY(1), vel: new THREE.Vector3(Math.cos(a) * 8, 3, Math.sin(a) * 8), grav: 12, color: 0xffa040, size: 0.15, explodeGround: true, onHit: (e2, p2) => explode(p2, 1.5, 15, { fire: true }), onEnd: p2 => explode(p2, 1.5, 15, { fire: true }) }); }
  };
  fireProj({ pos: eyePos().add(new THREE.Vector3(0.1, -0.15, 0)), vel: aimDir().multiplyScalar(18), color: 0xff8a3a, size: 0.28, r: 0.35, explodeGround: true,
    onHit: (e, pt, head, v) => { hitEnemy(e, dmg * 0.5, { point: pt, dir: v, fire: true }); boom(pt, e); }, onEnd: pt => boom(pt) });
}
function nearestEnemy(pos, maxD, excl) { let b = null, bd = maxD; for (const e of G.enemies) { if (excl && excl.has(e)) continue; const dd = d2(e.pos, pos); if (dd < bd && e.state !== 'hidden') { bd = dd; b = e; } } return b; }
// ---- 궁수 ----
function updArcher(dt) {
  const P = G.P, I = G.input;
  const full = 1.2 * (1 - cv('a_hand'));
  if (I.lmb && P.cd.lmb <= 0) { if (!P.drawing) { P.drawing = true; P.draw = 0; } P.draw = Math.min(full, P.draw + dt); }
  else if (P.drawing) {
    P.drawing = false; const frac = P.draw / full, isFull = frac >= 0.999;
    let dmg = 10 + 30 * frac; if (isFull) dmg *= 1 + cv('a_bow');
    if (P.reflex) { dmg *= 1 + cv('a_reflex'); P.reflex = false; }
    const wind = isFull && uniqOn('u_windbow');
    const speed = (28 + 22 * frac) * (wind ? 2 : 1);
    const angles = has('aL_storm') ? [-0.16, -0.08, 0, 0.08, 0.16] : has('a_tri') ? [-0.08, 0, 0.08] : [0];
    for (const a of angles) {
      const side = a !== 0, d = aimDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const sd = side && !has('aL_storm') ? dmg * cv('a_tri') : dmg;
      fireProj({ mesh: A.arrowMesh(), pos: eyePos().add(new THREE.Vector3(0, -0.1, 0)), vel: d.multiplyScalar(speed), grav: 4, r: 0.22, pierce: wind ? 99 : cv('a_pierce'),
        onHit: (e, pt, head, v) => { hitEnemy(e, sd, { point: pt, head, dir: v }); if (isFull && has('a_blast')) explode(pt, cv('a_blast'), sd * 0.5, { raw: true, color: 0xd9c08a, skip: e, noCrit: true }); },
        onEnd: pt => { if (isFull && has('a_blast')) explode(pt, cv('a_blast'), sd * 0.5, { raw: true, color: 0xd9c08a, noCrit: true }); } });
    }
    sfx('shoot'); P.cd.lmb = 0.15; P.draw = 0;
  }
}
// ---- Q ----
function useQ() {
  const P = G.P, cls = G.run.cls; P.cd.q = P.qMax = qCooldown(); P.castAnim = 1.2;
  if (cls === 'warrior') {
    ringFx(P.pos, 8, 0xffd58a); shake(0.2); sfx('boss');
    for (const e of G.enemies) if (d2(e.pos, P.pos) < 8 + e.r) { e.st.stun = Math.max(e.st.stun || 0, (e.boss ? 0.6 : 2) + cv('w_roar')); if (has('w_intim')) e.st.intim = { v: cv('w_intim'), t: 5 }; }
    P.buff.shout = 5; if (has('w_rage')) P.buff.rage = 6; if (has('wL_drum')) heal(G.S.hpMax * 0.15);
  } else if (cls === 'cleric') {
    const z = addZone(P.pos, 5 + cv('c_wide'), 6 + cv('c_long'), 'sanct', { side: 'player', dps: cv('c_holy'), raw: true });
    if (has('cL_walk')) z.follow = true; sfx('cast');
  } else if (cls === 'mage') {
    ringFx(P.pos, 6, 0x9fe6ff); sfx('cast');
    for (const e of [...G.enemies]) if (d2(e.pos, P.pos) < 6 + e.r) {
      if (has('mL_stop')) e.st.freeze = e.boss ? 1 : 3; else e.st.slow = { v: cv('m_cold') || 0.5, t: 3 };
      hitEnemy(e, 20 * (1 + cv('m_shard')), { kind: 'aoe' });
    }
    if (has('m_perma')) addZone(P.pos, 6, cv('m_perma'), 'ice', { side: 'player' });
  } else {
    const p = groundAim(25); sfx('shoot');
    addZone(p, 4 + cv('a_wide'), 3 + cv('a_long'), 'rain', { side: 'player', dps: 15 });
  }
}
// ---- 상호작용 ----
function interact(pressed) {
  const P = G.P, run = G.run; let prompt = null;
  let near = null, nd = G.S.pickup; for (const l of G.loot) { const dd = d2(l.pos, P.pos); if (dd < nd) { nd = dd; near = l; } }
  for (const l of [...G.loot]) if (d2(l.pos, P.pos) < 1.0) pickupLoot(l);
  if (near && G.loot.includes(near)) { prompt = `줍기: ${near.item.name}`; if (pressed) pickupLoot(near); }
  else if (run.chest && !run.chest.opened && d2(run.chest.pos, P.pos) < 2.5) { prompt = '상자 열기'; if (pressed) openChest(); }
  else if (run.portal && d2(run.portal.position, P.pos) < 2.2) { if (run.phase === 'victory') { prompt = '마을로 돌아가기'; if (pressed) victory(); } else { prompt = '다음 층으로'; if (pressed) enterPortal(); } }
  UI.prompt(prompt);
}
function pickupLoot(l) {
  if (G.run.bag.length >= 20) { UI.toast('원정 가방이 가득 찼다'); return; }
  G.run.bag.push(l.item); scene.remove(l.mesh); G.loot.splice(G.loot.indexOf(l), 1);
  UI.toast(`<span style="color:${D.RARITY_COLORS[l.item.r]}">${l.item.name}</span> 획득`); sfx('pick');
}

// ================= 1인칭 손 애니메이션 =================
function updateViewModel(dt) {
  if (!vm) return;
  const P = G.P, cls = G.run.cls, u = vm.userData, b = u.base, t = G.time;
  const moving = Math.abs(G.input.mx) + Math.abs(G.input.my) > 0.1 && P.onGround;
  const bob = moving ? Math.sin(t * 9) * 0.015 : 0;
  u.L.position.copy(b.L).add(new THREE.Vector3(0, bob, 0)); u.R.position.copy(b.R).add(new THREE.Vector3(0, -bob, 0));
  P.swingAnim = Math.max(0, P.swingAnim - dt * 4); P.castAnim = Math.max(0, P.castAnim - dt * 5);
  if (cls === 'warrior') {
    const s = P.swingAnim; u.blade.rotation.set(-1.0 - Math.sin(s * Math.PI) * 0.9, Math.sin(s * Math.PI) * 1.4, 0.55 - Math.sin(s * Math.PI) * 0.8);
    u.R.position.x -= Math.sin(s * Math.PI) * 0.35;
    if (P.blocking) { u.L.position.set(-0.16, -0.16, -0.45); }
  } else if (cls === 'cleric') {
    u.R.position.z -= P.castAnim * 0.08;
    P.healGlow = Math.max(0, (P.healGlow || 0) - dt); u.glow.material.opacity = (P.healGlow || 0) + (G.input.rmb ? 0.35 : 0);
    if (G.input.rmb) u.L.position.add(new THREE.Vector3(0.12, 0.1, -0.06));
  } else if (cls === 'mage') {
    const c = P.charging ? Math.min(1.5, P.charge) : 0;
    u.orb.scale.setScalar(1 + c * 1.1 + Math.sin(t * 20) * 0.05 * c); u.orb.material.color.setHex(c >= (1 - cv('m_fast')) ? 0xff7a2a : c > 0 ? 0xffb060 : 0xbfa8ff);
    u.R.position.z -= P.castAnim * 0.1; if (P.charging) u.L.position.add(new THREE.Vector3(0.05, 0.05, -0.05));
  } else {
    const f = P.drawing ? P.draw / (1.2 * (1 - cv('a_hand'))) : 0;
    u.R.position.z += f * 0.22; u.arrow.visible = P.cd.lmb <= 0.05 || P.drawing;
    u.string.position.y = -f * 0.2;
  }
  if (P.dashT > 0) vm.position.y = -0.05; else vm.position.y = 0;
}

// ================= 조준 모드 (버튼·정보창 숨김) =================
function updateAim(dt) {
  const I = G.input, P = G.P, cls = G.run.cls;
  const active = I.lmb || I.rmb || I.q || P.charging || P.drawing;
  if (active) { G.aim.aiming = true; G.aim.until = 0.4; }
  else if (G.aim.aiming) { G.aim.until -= dt; if (G.aim.until <= 0) G.aim.aiming = false; }
  G.aim.charge = cls === 'mage' && P.charging ? Math.min(1, P.charge / (1 * (1 - cv('m_fast')))) : 0;
  G.aim.draw = cls === 'archer' && P.drawing ? P.draw / (1.2 * (1 - cv('a_hand'))) : 0;
  G.aim.swinging = cls === 'warrior' && P.swingAnim > 0;
  G.aim.target = null;
  if (cls === 'archer' && (P.drawing || I.rmb)) {
    const t = findTarget(10);
    if (t) {
      const y0 = t.def?.type === 'flyer' ? t.vy : 0;
      const sc = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, ok: p.z < 1 }; };
      const top = sc(new THREE.Vector3(t.pos.x, y0 + t.h, t.pos.z)), bot = sc(new THREE.Vector3(t.pos.x, y0, t.pos.z));
      const head = sc(new THREE.Vector3(t.pos.x, y0 + t.h + 0.35, t.pos.z));
      if (top.ok) G.aim.target = { top, bot, head, w: Math.abs(bot.y - top.y) * 0.7 + 20, weak: !t.boss && t.def?.type !== 'flyer' };
    }
  }
}

// ================= 메인 루프 =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.time += dt;
  if (sky) sky.userData.tick(G.time); if (grass) grass.userData.tick(G.time);
  if (G.mode === 'run' && G.P && !G.P.dead) {
    G.timeScale = G.run.cls === 'archer' && has('aL_breath') && G.input.rmb ? 0.5 : 1;
    let wdt = dt * G.timeScale; if (G.hitStop > 0) { G.hitStop -= dt; wdt = 0; }
    updatePlayer(dt);
    for (const e of [...G.enemies]) if (!e.dead) updateEnemy(e, wdt);
    updateProjectiles(dt, wdt);
    updateZones(dt, wdt);
    for (let i = G.teles.length - 1; i >= 0; i--) { const t = G.teles[i]; t.t += wdt; if (t.mesh?.userData.fill) t.mesh.userData.fill.material.opacity = 0.15 + 0.4 * (t.t / t.total);
      if (t.t >= t.total) { if (t.mesh) scene.remove(t.mesh); G.teles.splice(i, 1); t.onDone(); } }
    const run = G.run;
    if (run && run.phase === 'fight' && run.pending === 0 && G.enemies.length === 0 && !G.boss && run.floor < 6 && G.mode === 'run') waveCleared();
    for (const l of G.loot) { l.mesh.userData.gem.rotation.y += dt * 2; l.mesh.userData.gem.position.y = 0.6 + Math.sin(G.time * 3) * 0.1; }
    if (run && run.portal) { run.portal.rotation.y += dt; }
    updateAim(dt); updateViewModel(dt);
  }
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.life -= dt; p.vel.y -= 12 * dt; p.mesh.position.addScaledVector(p.vel, dt); if (p.life <= 0 || p.mesh.position.y < 0) { scene.remove(p.mesh); G.parts.splice(i, 1); } }
  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; if (!f.tick(f, dt)) { scene.remove(f.mesh); G.fx.splice(i, 1); } }
  // 카메라
  if (G.P) {
    const P = G.P; camera.position.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
    if (shakeAmt > 0) { camera.position.x += rnd(-1, 1) * shakeAmt * 0.15; camera.position.y += rnd(-1, 1) * shakeAmt * 0.15; shakeAmt = Math.max(0, shakeAmt - dt * 1.5); }
    camera.rotation.set(P.pitch, P.yaw, 0);
    const wantFov = (G.isTouch ? 80 : 75) - (G.run && G.run.cls === 'archer' && G.input.rmb ? 30 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
  } else {
    // 마을: 천천히 돌아가는 풍경
    camera.position.set(Math.sin(G.time * 0.05) * 14, 3.2, Math.cos(G.time * 0.05) * 14); camera.lookAt(0, 2.5, 0);
  }
  renderer.clear(); renderer.render(scene, camera);
  if (G.mode === 'run' || G.mode === 'cards') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
  UI.hud(G, camera);
}

// ================= 시작 =================
export const api = {
  startRun, writeSave, newItem, itemPower, computeStats: () => G.run && computeStats(),
  quitRun: () => { if (G.run) { G.P.dead = true; die(); } },
  rebuildWorld: () => { buildWorld(); resize(); },
};
function boot() {
  G.save = loadSave();
  buildWorld(); resize();
  UI.init(G, api);
  UI.showTown();
  requestAnimationFrame(frame);
}
boot();
