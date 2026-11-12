// 판 진행·로비·네트워크 동기화·메인 루프
import * as THREE from 'three';
import * as D from './data.js';
import * as A from './art.js';
import * as UI from './ui.js';
import * as N from './net.js';
import { G, scene, camera, vmScene, vmCam, renderer, resize, isHost, isClient, rnd, pick, clamp, d2, fx, applyFx, P3, nextId, sfx, writeSave, loadSave, freePoints, lowGfx,
  getShake, decayShake, updateVisuals, clearVisuals, burst, isTouch } from './core.js';
import { genWorld, buildWorld, clearWorld, updateWorldVisual, regionAt, tierAtPos } from './world.js';
import * as S from './sim.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let sky, grass, vm = null, vmKey = '';

// ================= 아이템 (각자 자기 기기에서 만든다) =================
export function newItem({ slot, cls, r, u, look } = {}) {
  const id = G.save.nextId++;
  slot = slot || pick(['weapon', 'weapon', 'armor', 'trinket']);
  if (slot === 'weapon') cls = cls || (Math.random() < 0.7 && G.me ? G.me.cls : pick(D.CLASS_IDS));
  const lines = Math.min(4, (r === 4 ? 3 : r) + (slot === 'trinket' ? 1 : 0));
  const keys = Object.keys(D.AFFIXES).sort(() => Math.random() - 0.5).slice(0, lines);
  const aff = keys.map(k => { const a = D.AFFIXES[k]; return { k, v: +(rnd(a.min, a.max)).toFixed(3) }; });
  if (r === 4 && !u) { const pool = Object.entries(D.UNIQUES).filter(([, x]) => !x.boss && x.slot === slot && (!x.cls || x.cls === cls)); if (pool.length) u = pick(pool)[0]; }
  look = look ?? Math.floor(Math.random() * 3);
  const base = slot === 'weapon' ? D.WEAPON_LOOKS[cls][look] : slot === 'armor' ? D.ARMOR_NAMES[look] : pick(D.TRINKET_NAMES);
  const name = u ? D.UNIQUES[u].name : `${D.RARITY_PREFIX[r]} ${base}`;
  return { id, slot, cls: slot === 'weapon' ? cls : null, r, aff, enh: 0, u: u || null, name, look };
}
function rollRarity(minR = 0, tier = 1) {
  const p = [...D.RARITY_ODDS];
  const shift = Math.min(0.5, 0.025 * (tier - 1) + (G.me?.S?.luck || 0));
  p[0] -= shift; p[2] += shift * 10 / 15; p[3] += shift * 4 / 15; p[4] += shift * 1 / 15;
  let x = Math.random(), r = 0; for (; r < 4; r++) { if ((x -= p[r]) < 0) break; }
  return Math.max(minR, Math.min(4, r));
}
function makeLocalLoot(pos, o = {}) {
  let r = rollRarity(o.minR || 0, o.tier || 1);
  if (o.boss && S.hasA(G.me, 'kL_gold')) r = Math.min(4, r + 1);
  let it;
  if (o.boss && r === 4 && Math.random() < 0.5) { const ent = Object.entries(D.UNIQUES).find(([, x]) => x.boss === o.boss); if (ent) it = newItem({ slot: ent[1].slot, r: 4, u: ent[0] }); }
  it = it || newItem({ r });
  const mesh = A.lootBeam(new THREE.Color(D.RARITY_COLORS[it.r]).getHex());
  mesh.position.set(pos[0] + rnd(-1.2, 1.2), 0, pos[2] + rnd(-1.2, 1.2)); scene.add(mesh);
  G.loot.push({ item: it, mesh, pos: mesh.position });
}
function dropFor(a, pos, o = {}) {
  if (a.kind === 'local') makeLocalLoot(P3(pos), o);
  else if (a.kind === 'remote') G.net.room.send(a.peer, { t: 'drop', p: P3(pos), o });
}

// ================= 판 시작 =================
function partyScale() { return 0.55 + 0.45 * G.actors.length; }
function scaleFor(tier) { const r = G.run; return { hpMult: (1 + 0.3 * (tier - 1)) * (1 + 0.12 * r.danger) * partyScale(), atkMult: (1 + 0.2 * (tier - 1)) * (1 + 0.1 * r.danger) }; }
function localActor(id) {
  const s = G.save, c = s.classes[s.cls];
  const a = S.makeActor({ id, kind: 'local', name: s.name, cls: s.cls, lv: c.lv, pts: { ...c.pts }, equip: { ...c.equip } });
  a.bag = []; S.computeStats(a); a.hp = a.S.hpMax; return a;
}
function botActor(id, cls, lv, slot) {
  const a = S.makeActor({ id, kind: 'bot', name: D.BOT_NAMES[(id * 7) % D.BOT_NAMES.length], cls, lv, slot });
  S.botAutoStats(a); S.computeStats(a); a.hp = a.S.hpMax; return a;
}
function pickBotClasses(taken, n) { const order = ['cleric', 'warrior', 'archer', 'mage']; const out = []; for (const c of order) if (!taken.includes(c) && out.length < n) out.push(c); while (out.length < n) out.push(pick(order)); return out; }

// 방장(또는 혼자): 판 만들기
export function startSolo() { startHostRun([]); }
function startHostRun(clients) {
  const seed = Math.floor(Math.random() * 1e9);
  const killed = G.save.killed, unlocked = D.FINAL_ORDER.filter(b => !D.BOSSES[b].unlockAfter || killed[D.BOSSES[b].unlockAfter]);
  const finalKey = G.save.pickFinal && D.FINAL_ORDER.every(b => killed[b]) ? G.save.pickFinal : pick(unlocked);
  const cfg = { seed, midKey: pick(['queen', 'gate']), finalKey, actors: [] };
  cfg.actors.push({ id: 1, kind: 'human', name: G.save.name, cls: G.save.cls, lv: G.save.classes[G.save.cls].lv, look: lookOf(G.save.classes[G.save.cls].equip) });
  clients.forEach((c, i) => { c.actorId = 2 + i; cfg.actors.push({ id: c.actorId, kind: 'human', name: c.name, cls: c.cls, lv: c.lv, look: c.look, peer: c.peer }); });
  const nb = Math.max(0, Math.min(G.save.bots, D.PARTY_MAX - cfg.actors.length));
  const lv = Math.round(cfg.actors.reduce((s, x) => s + x.lv, 0) / cfg.actors.length);
  pickBotClasses(cfg.actors.map(x => x.cls), nb).forEach((cls, i) => cfg.actors.push({ id: 10 + i, kind: 'bot', name: D.BOT_NAMES[i], cls, lv, slot: i }));
  if (G.net) for (const c of clients) G.net.room.send(c.peer, { t: 'start', cfg: { ...cfg, actors: cfg.actors.map(({ peer, ...x }) => x) }, you: c.actorId });
  beginRun(cfg, 1);
  // 참가자 정보 연결
  for (const c of clients) { const a = G.actors.find(x => x.id === c.actorId); a.peer = c.peer; if (c.stats) applyRemoteStats(a, c.stats); }
}
const lookOf = eq => ({ w: eq.weapon ? { look: eq.weapon.look ?? 0, r: eq.weapon.r } : null, a: eq.armor ? { look: eq.armor.look ?? 0, r: eq.armor.r } : null });

function beginRun(cfg, youId) {
  resetRunState();
  const W = genWorld(cfg.seed); buildWorld(W);
  G.run = { cfg, danger: 0, dangerT: 0, t: 0, campsCleared: 0, midDead: false, midSpawned: false, finalSpawned: false, phase: 'explore', roamT: 3, xp: 0, mats: 0, xpSeen: 0, matsSeen: 0,
    rerollFloor: 1, rerollBonus: 0, cardTier: 1, kills: 0, startedAt: performance.now(), portal: null, cardQ: [] };
  for (const x of cfg.actors) {
    let a;
    if (x.id === youId) a = localActor(x.id);
    else if (isClient()) { a = S.makeActor({ id: x.id, kind: 'proxy', name: x.name, cls: x.cls, lv: x.lv }); a.S = { hpMax: 100 }; a.hp = 100; }
    else if (x.kind === 'bot') a = botActor(x.id, x.cls, x.lv, x.slot);
    else { a = S.makeActor({ id: x.id, kind: 'remote', name: x.name, cls: x.cls, lv: x.lv }); S.computeStats(a); a.hp = a.S.hpMax; }
    const k = G.actors.length, ang = k * Math.PI / 2;
    a.pos.set(Math.sin(ang) * 2.5, 0, 6 + Math.cos(ang) * 2.5); a.yaw = 0;
    if (a.kind !== 'local') { a.model = A.makeAvatar(a.cls, x.look?.w ? { look: x.look.w.look, r: x.look.w.r } : null, x.look?.a ? { look: x.look.a.look, r: x.look.a.r } : null); scene.add(a.model); }
    a.look = x.look;
    G.actors.push(a);
  }
  G.me = G.actors.find(a => a.id === youId);
  setViewModel(true);
  G.mode = 'run'; UI.enterRun(); UI.lockPointer();
  UI.banner('풍차 마을 — 원정 시작', 2.5);
  setTimeout(() => G.run && UI.toast('거점 3곳을 정화하고 중간 보스를 쓰러뜨리면 최종 보스의 봉인이 풀린다'), 2600);
}
function resetRunState() {
  for (const e of [...G.enemies]) S.removeEnemy(e);
  for (const a of G.actors) if (a.model) scene.remove(a.model);
  for (const l of G.loot) scene.remove(l.mesh);
  for (const arr of [G.actors, G.enemies, G.projectiles, G.eprojs, G.zones, G.teles, G.loot]) arr.length = 0;
  clearVisuals(); clearWorld(); UI.bossBar(null); UI.blur(false);
  if (G.run?.portal) scene.remove(G.run.portal);
  G.run = null; G.me = null;
}

// ================= 거점·둥지·봉인 (방장) =================
function hostWorld(dt, wdt) {
  const run = G.run, W = G.world.W;
  run.t += dt; run.dangerT += dt;
  if (run.dangerT >= D.DANGER_EVERY) { run.dangerT = 0; run.danger++; fx('banner', { text: `초원이 거칠어진다 — 위험도 ${run.danger}`, dur: 2 }); }
  const near = (p, r) => G.actors.some(a => S.alive(a) && d2(a.pos, p) < r);
  for (const c of G.camps) {
    if (c.state === 'idle' && near(c, 14)) { c.state = 'active'; c.waves = c.tier <= 2 ? 2 : 3; c.wave = 0; fx('banner', { text: `${D.REGIONS[regionAt(c.x, c.z)].name} 거점 — 몬스터가 몰려온다!`, dur: 2 }); campWave(c); }
    if (c.state === 'active' && c.pending === 0 && !c.waitT && !G.enemies.some(e => e.camp === c.id)) {
      if (c.wave < c.waves) { offerAll(c.tier, false); c.waitT = 3; }
      else { c.state = 'cleared'; run.campsCleared++; offerAll(c.tier, false); spawnChest(c.x, c.z, c.tier); fx('banner', { text: `거점 정화! (${run.campsCleared}/${D.SEAL_CAMPS})`, dur: 2 }); rewardAll(40, 15); checkSeal(); }
    }
    if (c.waitT > 0) { c.waitT -= dt; if (c.waitT <= 0) { c.waitT = 0; campWave(c); } }
  }
  if (!run.midSpawned && near(W.lairs.mid, 15)) { run.midSpawned = true; const t = tierAtPos(W.lairs.mid.x, W.lairs.mid.z); run.mid = S.spawnBoss(run.cfg.midKey, V3(W.lairs.mid.x, 0, W.lairs.mid.z), scaleFor(t).hpMult * 0.8); run.mid.tier = t; }
  if (G.world.seal && !run.finalSpawned && near(W.lairs.final, 15)) { run.finalSpawned = true; run.final = S.spawnBoss(run.cfg.finalKey, V3(W.lairs.final.x, 0, W.lairs.final.z), scaleFor(5).hpMult * 0.7); run.final.tier = 5; }
  // 떠도는 무리
  run.roamT -= dt;
  if (run.roamT <= 0) {
    run.roamT = 4;
    const groups = new Set(G.enemies.filter(e => e.roam).map(e => e.group)).size;
    if (groups < 10 + run.danger) for (let k = 0; k < 20; k++) {
      const ang = Math.random() * Math.PI * 2, r = rnd(26, D.WORLD_R - 6), p = V3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      if (G.actors.some(a => d2(a.pos, p) < 38) || G.camps.some(c => d2(c, p) < 16) || d2(W.lairs.final, p) < 26 || d2(W.lairs.mid, p) < 22) continue;
      const tier = tierAtPos(p.x, p.z), pool = D.REGIONS[regionAt(p.x, p.z)].pool.filter(k2 => D.MONSTERS[k2].floor <= tier + 1), key = pick(pool), m = D.MONSTERS[key];
      const n = m.group || (2 + Math.floor(Math.random() * 3)), gid = nextId(), sc = scaleFor(tier);
      for (let i = 0; i < n; i++) S.spawnEnemy(key, p.clone().add(V3(rnd(-3, 3), 0, rnd(-3, 3))), { ...sc, roam: true, home: p, aggro: 14, affix: tier >= 3 && Math.random() < 0.12 ? pick(D.ELITE_AFFIXES).id : null }).group = gid;
      break;
    }
  }
  // 멀리 있는 몬스터는 쉰다
  for (const e of [...G.enemies]) { if (e.dead) continue; const near2 = e.boss || e.camp != null || G.actors.some(a => d2(a.pos, e.pos) < 70); if (near2) S.updateEnemy(e, wdt); }
  // 쓰러짐
  for (const a of G.actors) if (a.state === 'down') { a.downT -= dt; if (a.downT <= 0) { a.state = 'dead'; fx('banner', { text: `${a.name} 전사…`, dur: 1.5 }); } }
  const hs = S.humans();
  if (run.phase !== 'over' && hs.every(a => a.state !== 'ok') && (hs.every(a => a.state === 'dead') || !G.actors.some(a => a.kind === 'bot' && S.alive(a)))) endAll(false);
  // 보스 막대
  const boss = G.enemies.find(e => e.boss && d2(e.pos, G.me.pos) < 40);
  UI.bossBar(boss ? boss.def.name : null, boss ? boss.hp / boss.maxHp : 0);
}
function campWave(c) {
  c.wave++;
  const n = 4 + 2 * c.tier + 2 * (G.actors.length - 1), sc = scaleFor(c.tier);
  const pool = D.REGIONS[regionAt(c.x, c.z)].pool.filter(k => D.MONSTERS[k].floor <= c.tier + 1);
  let count = 0, elites = c.tier >= 3 ? 1 + (Math.random() < 0.5 ? 1 : 0) : (c.tier === 2 && Math.random() < 0.4 ? 1 : 0);
  while (count < n) {
    const key = pick(pool), m = D.MONSTERS[key], g = m.group || 1;
    for (let i = 0; i < g; i++) {
      const ang = Math.random() * Math.PI * 2, p = V3(c.x + Math.cos(ang) * rnd(5, 11), 0, c.z + Math.sin(ang) * rnd(5, 11)), id = nextId();
      const affix = elites > 0 && g === 1 && Math.random() < 0.5 ? (elites--, pick(D.ELITE_AFFIXES).id) : null;
      c.pending++; fx('t+', { id, k: 'c', p: P3(p), r: 0.9, c: 0xb07de0, dur: 0.9 });
      G.teles.push({ id, t: -i * 0.12, total: 0.9, onDone: () => { c.pending--; if (c.state === 'active') S.spawnEnemy(key, p, { ...sc, affix, camp: c.id, aggro: 45 }); } });
    }
    count += g;
  }
}
function checkSeal() {
  const run = G.run;
  if (!G.world.seal && run.campsCleared >= D.SEAL_CAMPS && run.midDead) { G.world.seal = true; fx('banner', { text: '봉인이 풀렸다 — 북쪽 고대 유적으로!', dur: 3 }); fx('sfx', { k: 'portal' }); }
}
function spawnChest(x, z, tier) {
  const m = A.makeChest(); m.position.set(x, 0, z + 2); scene.add(m);
  const id = 100 + G.chests.length; G.chests.push({ id, x, z: z + 2, tier, pos: m.position, mesh: m, opened: false, seen: true, camp: true });
  if (G.net) G.net.room.broadcast({ t: 'chest', id, x, z: z + 2, tier });
}
function openChest(ch) {
  if (ch.opened) return; ch.opened = true; fx('sfx', { k: 'chest', p: P3(ch.pos) });
  for (const a of S.humans()) { dropFor(a, ch.pos, { minR: 0, tier: ch.tier }); }
  rewardAll(0, Math.round(rnd(10, 20) * (1 + 0.3 * (ch.tier - 1))));
  offerAll(ch.tier, true);
}
// 경험치·재료는 모두 함께 받는다
function rewardAll(xp, mats) { G.run.xp += xp; G.run.mats += mats; }
function onEnemyKilled(e, by) {
  const run = G.run; run.kills++;
  const tier = e.camp != null ? G.camps.find(c => c.id === e.camp)?.tier || 1 : tierAtPos(e.pos.x, e.pos.z);
  rewardAll(Math.round(e.def.xp * (e.elite ? 3 : 1) * (1 + 0.15 * (tier - 1))), 1 + Math.floor(Math.random() * 3));
  const dropP = e.elite ? 0.5 : e.def.big ? 0.3 : 0.1;
  for (const a of S.humans()) if (Math.random() < dropP) dropFor(a, e.pos, { tier });
}
function onBossKilled(e) {
  const run = G.run;
  burst(e.pos, e.def.color, 40, 2); fx('sfx', { k: 'victory' });
  S.removeEnemy(e);
  rewardAll(e.def.xp * 2, 40);
  for (const a of S.humans()) { dropFor(a, e.pos, { minR: e.def.mid ? 1 : 2, boss: e.key, tier: e.tier }); if (!e.def.mid) dropFor(a, e.pos, { minR: 2, boss: e.key, tier: 5 }); }
  if (e.def.mid) { run.midDead = true; fx('banner', { text: `${e.def.name} 처치!`, dur: 2 }); offerAll(e.tier, true); checkSeal(); }
  else {
    run.phase = 'victory'; fx('banner', { text: '승리! 장비를 줍고 포털로', dur: 3 });
    for (const x of [...G.enemies]) S.removeEnemy(x);
    run.finalKilled = e.key; spawnPortal(e.center.x, e.center.z + 6);
    if (G.net) G.net.room.broadcast({ t: 'portal', x: e.center.x, z: e.center.z + 6, boss: e.key });
  }
}
function spawnPortal(x, z) { const p = A.makePortal(); p.position.set(x, 1.7, z); scene.add(p); G.run.portal = p; }
S.hooks.kill = (e, by) => onEnemyKilled(e, by);
S.hooks.bossKilled = e => onBossKilled(e);
S.hooks.down = () => {};
S.hooks.summon = (key, p) => { const sc = scaleFor(4); S.spawnEnemy(key, p, { ...sc, aggro: 40, camp: -1 }); };

// ================= 카드 =================
function offerAll(tier, chest) {
  for (const a of G.actors) {
    if (a.kind === 'bot') botPick(a, tier, chest);
    else if (a.kind === 'remote') G.net.room.send(a.peer, { t: 'cards', tier, chest });
    else if (a.kind === 'local') queueCards(tier, chest);
  }
}
function rollTier(a, tier, minTier, legendMult) {
  const odds = [...D.CARD_TIER_ODDS[Math.min(5, tier - 1)]];
  const s = a.S.cardsense; odds[0] -= s; odds[1] += s;
  odds[3] *= legendMult; odds[0] -= odds[3] * (legendMult - 1) / legendMult;
  let x = Math.random(), t = 0; for (; t < 3; t++) { if ((x -= odds[t]) < 0) break; }
  return Math.max(minTier, t);
}
function legendOk(a, c) {
  if (c.id in a.cards || a.legends >= 2) return false;
  if (c.cls === 'common') return true;
  return Object.keys(a.cards).filter(id => { const x = D.CARD_BY_ID[id]; return !x.L && x.cls === c.cls && x.fam === c.fam; }).length >= 2;
}
function rollChoices(a, tier, chest) {
  const star = S.hasA(a, 'kL_star'), slots = star ? [a.cls, a.cls, 'common', 'common'] : [a.cls, a.cls, 'common'], out = [];
  for (const pool of slots) {
    let t = rollTier(a, tier, chest ? 1 : 0, star ? 2 : 1), card = null;
    if (t === 3) { const leg = D.CARDS.filter(c => c.L && c.cls === pool && legendOk(a, c) && !out.some(o => o.card === c)); if (leg.length) card = pick(leg); else t = 2; }
    if (!card) { const cands = D.CARDS.filter(c => !c.L && c.cls === pool && !out.some(o => o.card === c) && !(c.id in a.cards && a.cards[c.id] >= 2)); if (!cands.length) continue; card = pick(cands); }
    const owned = card.id in a.cards;
    out.push({ card, tier: card.L ? 3 : owned ? a.cards[card.id] + 1 : t, upgrade: owned });
  }
  return out;
}
function applyCard(a, { card, tier }) {
  a.cards[card.id] = card.L ? 3 : tier; if (card.L) a.legends++;
  if (card.id === 'k_reroll' && a === G.me) G.run.rerollBonus += 1;
  S.computeStats(a);
}
function botPick(a, tier, chest) { const ch = rollChoices(a, tier, chest); if (ch.length) applyCard(a, pick(ch)); }
function queueCards(tier, chest) { G.run.cardQ.push({ tier, chest }); if (!G.me.choosing) nextCards(); }
function nextCards() {
  const q = G.run.cardQ.shift(); if (!q) return;
  const me = G.me; me.choosing = true; UI.unlockPointer();
  const show = () => UI.showCards(rollChoices(me, q.tier, q.chest), ch => {
    applyCard(me, ch); sfx('card'); syncStats();
    me.choosing = false; UI.hideCards();
    if (G.run.cardQ.length) nextCards(); else UI.lockPointer();
  }, G.run.rerollFloor + G.run.rerollBonus, () => { if (G.run.rerollFloor > 0) G.run.rerollFloor--; else if (G.run.rerollBonus > 0) G.run.rerollBonus--; else return; show(); }, q.chest);
  show();
}

// ================= 경험치·레벨 (각자) =================
function gainXp(x) {
  const c = G.save.classes[G.me.cls];
  if (c.lv >= D.LEVEL_CAP) return;
  c.xp += x;
  while (c.lv < D.LEVEL_CAP && c.xp >= D.xpForLevel(c.lv)) { c.xp -= D.xpForLevel(c.lv); c.lv++; UI.banner(`레벨 업! Lv.${c.lv} · 능력치 +${D.POINTS_PER_LEVEL}`, 2); sfx('levelup'); G.me.lv = c.lv; S.computeStats(G.me); syncStats(); }
  if (c.lv >= D.LEVEL_CAP) c.xp = 0;
}
export function applyPoints() { // UI 에서 능력치를 찍은 뒤 호출
  if (!G.me) return; const c = G.save.classes[G.me.cls]; G.me.pts = { ...c.pts }; S.computeStats(G.me); syncStats(); writeSave();
}
export function refreshGear() { if (!G.me) return; S.computeStats(G.me); setViewModel(); syncStats(); }
function effectiveGear(a) { const s = { ...a.equip }; for (const [k, id] of Object.entries(a.bagEq)) { const it = a.bag.find(i => i.id === id); if (it) s[k] = it; } return s; }
function syncStats() {
  if (!isClient() || !G.me) return;
  G.net.conn.send({ t: 'stats', st: { cards: G.me.cards, pts: G.me.pts, lv: G.me.lv, equip: effectiveGear(G.me), legends: G.me.legends } });
}
function applyRemoteStats(a, st) { a.cards = st.cards; a.pts = st.pts; a.lv = st.lv; a.equip = st.equip; a.legends = st.legends || 0; S.computeStats(a); }

// ================= 판 끝 =================
function endAll(win) {
  if (G.run.phase === 'over') return; G.run.phase = 'over';
  if (G.net) G.net.room.broadcast({ t: 'end', win, boss: G.run.finalKilled || null });
  endLocal(win, G.run.finalKilled);
}
function endLocal(win, bossKey, hostLeft) {
  const run = G.run; if (!run || G.mode === 'result') return;
  if (win && bossKey) { const first = !G.save.killed[bossKey]; G.save.killed[bossKey] = true; const next = D.FINAL_ORDER.find(b => D.BOSSES[b].unlockAfter === bossKey); if (first && next) UI.toast(`새 최종 보스 해금: ${D.BOSSES[next].name}`); }
  G.mode = 'result'; UI.unlockPointer();
  const keepAll = win || hostLeft, mats = keepAll ? run.mats : Math.floor(run.mats * 0.5);
  UI.showResult({ win: keepAll, hostLeft, cls: G.me.cls, region: G.camps.filter(c => c.state === 'cleared').length, kills: run.kills, mats, bag: G.me.bag, sec: Math.round((performance.now() - run.startedAt) / 1000) }, keep => {
    const s = G.save, items = keepAll ? G.me.bag : (keep ? [keep] : []);
    for (const it of items) { if (s.stash.length < 60) s.stash.push(it); else s.mats += D.SALVAGE[it.r]; }
    s.mats += mats; writeSave();
    leaveNet(); resetRunState(); buildWorld(genWorld(12345)); setViewModel(true);
    G.mode = 'town'; UI.showTown();
  });
}
export function quitRun() {
  if (!G.run) return;
  if (isClient()) { leaveNet(); endLocal(false); return; }
  G.me.state = 'dead';
  if (!G.net || S.humans().every(a => a.state !== 'ok')) endAll(false); else endLocal(false);
}

// ================= 로비·네트워크 =================
export async function hostLobby() {
  try {
    UI.lobbyStatus('방을 만드는 중…');
    const net = { role: 'host', clients: new Map(), fxq: [], sendT: 0 };
    net.room = await N.hostRoom({
      onJoin: id => { net.clients.set(id, { peer: id, name: '참가자', cls: 'warrior', lv: 1 }); pushLobby(); },
      onMsg: (id, m) => hostMsg(id, m),
      onLeave: id => { net.clients.delete(id); const a = G.actors.find(x => x.peer === id); if (a && G.mode === 'run') { a.kind = 'bot'; a.bot = { t: 0, hold: 0, slot: 3 }; a.name += ' (봇)'; fx('banner', { text: `참가자가 나가 봇이 이어받는다`, dur: 2 }); } pushLobby(); },
    });
    G.net = net; G.mode = 'lobby'; pushLobby();
  } catch (e) { UI.lobbyStatus(`방을 만들지 못했어요: ${e.message || e}`); G.net = null; }
}
function pushLobby() {
  const net = G.net; if (!net || G.mode !== 'lobby') return;
  const st = { code: net.room.code, host: true, players: [{ name: G.save.name, cls: G.save.cls, lv: G.save.classes[G.save.cls].lv, host: true }, ...[...net.clients.values()].map(c => ({ name: c.name, cls: c.cls, lv: c.lv }))], bots: G.save.bots };
  net.room.broadcast({ t: 'lobby', st: { ...st, host: false } }); UI.showLobby(st);
}
export function lobbyChanged() { if (G.net?.role === 'host') pushLobby(); else if (G.net?.role === 'client') sendHello(); }
export function lobbyStart() { if (G.net?.role !== 'host') return; startHostRun([...G.net.clients.values()].slice(0, D.PARTY_MAX - 1)); }
export async function joinLobby(code) {
  try {
    UI.lobbyStatus('방에 연결하는 중…');
    const net = { role: 'client', fxq: [], sendT: 0 };
    net.conn = await N.joinRoom(code, { onMsg: m => clientMsg(m), onClose: () => { if (G.mode === 'run') { UI.banner('방장이 나갔다', 2); endLocal(false, null, true); } else { UI.lobbyStatus('방이 닫혔어요'); G.net = null; G.mode = 'town'; UI.showTown(); } } });
    G.net = net; G.mode = 'lobby'; sendHello();
  } catch (e) { UI.lobbyStatus(`참가하지 못했어요: ${e.message || e}`); G.net = null; }
}
function sendHello() { const s = G.save, c = s.classes[s.cls]; G.net.conn.send({ t: 'hello', name: s.name, cls: s.cls, lv: c.lv, look: lookOf(c.equip), stats: { cards: {}, pts: c.pts, lv: c.lv, equip: c.equip } }); }
export function leaveNet() { if (!G.net) return; try { (G.net.room || G.net.conn).close(); } catch (e) { } G.net = null; }
function hostMsg(id, m) {
  const net = G.net, c = net.clients.get(id);
  if (m.t === 'hello' && c) { Object.assign(c, { name: m.name, cls: m.cls, lv: m.lv, look: m.look, stats: m.stats }); pushLobby(); return; }
  const a = G.actors.find(x => x.peer === id); if (!a || !G.run) return;
  if (m.t === 'i') {
    a.pos.set(m.p[0], m.p[1], m.p[2]); a.yaw = m.y; a.pitch = m.pi;
    a.input.lmb = !!(m.b & 1); a.input.rmb = !!(m.b & 2); a.input.q = !!(m.b & 4); a.choosing = !!(m.b & 8);
    if (m.ev?.includes('d')) a.input.dashT = true;
  } else if (m.t === 'stats') applyRemoteStats(a, m.st);
  else if (m.t === 'use') {
    if (m.k === 'chest') { const ch = G.chests.find(x => x.id === m.id); if (ch && d2(ch.pos, a.pos) < 4) openChest(ch); }
    if (m.k === 'portal' && G.run.phase === 'victory') endAll(true);
  }
}
function clientMsg(m) {
  if (m.t === 'lobby') { if (G.mode === 'lobby') UI.showLobby(m.st); return; }
  if (m.t === 'start') { beginRun(m.cfg, m.you); return; }
  if (!G.run) return;
  if (m.t === 's') applySnapshot(m);
  else if (m.t === 'f') for (const [k, d] of m.l) applyFx(k, d);
  else if (m.t === 'cards') queueCards(m.tier, m.chest);
  else if (m.t === 'drop') makeLocalLoot(m.p, m.o);
  else if (m.t === 'chest') { const mm = A.makeChest(); mm.position.set(m.x, 0, m.z); scene.add(mm); G.chests.push({ id: m.id, x: m.x, z: m.z, tier: m.tier, pos: mm.position, mesh: mm, opened: false, seen: true, camp: true }); }
  else if (m.t === 'portal') spawnPortal(m.x, m.z);
  else if (m.t === 'end') endLocal(m.win, m.boss);
}
// ---- 상태 보내기 (방장 → 참가자) ----
const EF = e => (e.elite ? 1 : 0) | (e.wind > 0 ? 2 : 0) | (e.st.freeze > 0 ? 4 : 0) | (e.state === 'hidden' ? 8 : 0) | (e.flash > 0 ? 16 : 0);
function snapshot() {
  const r2 = v => Math.round(v * 100) / 100;
  return { t: 's',
    a: G.actors.map(a => [a.id, r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r2(a.yaw), r2(a.pitch), Math.round(a.hp), Math.round(a.S.hpMax), a.state, Math.round(a.mana), (a.input.rmb ? 1 : 0) | (a.charging ? 2 : 0) | (a.drawing ? 4 : 0) | (a.swingAnim > 0 ? 8 : 0) | (a.castAnim > 0 ? 16 : 0), a.name]),
    e: G.enemies.filter(e => !e.boss).map(e => [e.id, e.key, r2(e.pos.x), r2(e.pos.z), r2(e.yaw), Math.round(e.hp / e.maxHp * 1000), EF(e), r2(e.vy || 0), e.affix ? 1 : 0]),
    b: G.enemies.filter(e => e.boss).map(e => [e.id, e.key, r2(e.pos.x), r2(e.pos.z), r2(e.yaw), Math.round(e.hp), Math.round(e.maxHp), e.phase, (e.invuln ? 1 : 0) | (e.hidden ? 2 : 0) | (e.state === 'spin' ? 4 : 0) | (e.flash > 0 ? 8 : 0), r2(e.modelY || 0), e.laserA == null ? null : r2(e.laserA),
      e.key === 'turtleking' ? e.model.userData.crystals.map(c => c.visible ? 1 : 0).join('') : '', r2(e.spinY || 0)]),
    p: G.props.map(p => [p.active ? 1 : 0, p.cd > 0 ? 1 : 0, Math.round(p.charge * 100), p.fuse > 0 ? 1 : 0]),
    c: G.camps.map(c => c.state[0]).join(''), ch: G.chests.map(c => c.opened ? 1 : 0).join(''),
    w: { seal: G.world.seal, danger: G.run.danger, xp: G.run.xp, mats: G.run.mats, cc: G.run.campsCleared, md: G.run.midDead, ph: G.run.phase } };
}
// ---- 상태 받기 (참가자) ----
function applySnapshot(m) {
  const run = G.run;
  for (const r of m.a) {
    const a = G.actors.find(x => x.id === r[0]); if (!a) continue;
    a.hp = r[6]; if (a.S) a.S.hpMax = r[7]; a.state = r[8]; a.mana = r[9];
    if (a === G.me) continue;
    a.tpos = V3(r[1], r[2], r[3]); a.yaw = r[4]; a.pitch = r[5]; a.flags = r[10]; a.name = r[11];
  }
  const seen = new Set();
  for (const r of m.e) {
    seen.add(r[0]); let e = G.enemies.find(x => x.id === r[0]);
    if (!e) { e = S.spawnEnemy(r[1], V3(r[2], 0, r[3]), { id: r[0], affix: r[8] ? 'tough' : null }); e.client = true; }
    e.tpos = V3(r[2], 0, r[3]); e.yaw = r[4]; e.hp = r[5] / 1000 * e.maxHp; e.vy = r[7];
    e.wind = r[6] & 2 ? 0.25 : 0; e.windMax = 0.5; e.frozen = !!(r[6] & 4); e.flash = r[6] & 16 ? 0.05 : 0;
    const hidden = !!(r[6] & 8); if (hidden !== (e.state === 'hidden')) { e.state = hidden ? 'hidden' : 'move'; for (const ch of e.model.children) ch.visible = hidden ? !!ch.userData.isBush : !ch.userData.isBush; }
  }
  for (const r of m.b) {
    seen.add(r[0]); let e = G.enemies.find(x => x.id === r[0]);
    if (!e) { e = S.spawnBoss(r[1], V3(r[2], 0, r[3]), 1); G.enemies.pop(); e.id = r[0]; G.enemies.push(e); e.client = true; }
    e.tpos = V3(r[2], 0, r[3]); e.yaw = r[4]; e.hp = r[5]; e.maxHp = r[6];
    if (r[7] === 2 && e.phase !== 2) { e.phase = 2; if (e.key === 'thorn') for (const k of e.model.userData.knots) { k.visible = true; k.userData.outline.visible = true; } }
    e.invuln = !!(r[8] & 1); e.hidden = !!(r[8] & 2); e.state = r[8] & 4 ? 'spin' : 'idle'; e.flash = r[8] & 8 ? 0.05 : 0; e.modelY = r[9]; e.laserA = r[10]; e.spinY = r[12];
    if (r[11]) e.model.userData.crystals.forEach((c, i) => { c.visible = r[11][i] === '1'; c.userData.outline.visible = c.visible; });
  }
  for (const e of [...G.enemies]) if (!seen.has(e.id)) S.removeEnemy(e);
  m.p.forEach((r, i) => { const p = G.props[i]; if (!p) return; p.active = !!r[0]; p.cd = r[1] ? 1 : 0; p.charge = r[2] / 100; p.fuse = r[3] ? 0.3 : 0; });
  [...m.c].forEach((ch, i) => { if (G.camps[i]) G.camps[i].state = ch === 'c' ? 'cleared' : ch === 'a' ? 'active' : 'idle'; });
  [...m.ch].forEach((ch, i) => { if (G.chests[i]) G.chests[i].opened = ch === '1'; });
  G.world.seal = m.w.seal; run.danger = m.w.danger; run.campsCleared = m.w.cc; run.midDead = m.w.md; run.phase = m.w.ph;
  run.xp = m.w.xp; run.mats = m.w.mats;
  const boss = G.enemies.find(e => e.boss && d2(e.pos, G.me.pos) < 40);
  UI.bossBar(boss ? boss.def.name : null, boss ? boss.hp / boss.maxHp : 0);
}

// ================= 내 캐릭터 상호작용 =================
function interact(pressed) {
  const me = G.me; let prompt = null;
  if (me.state !== 'ok') { UI.prompt(me.state === 'down' ? `쓰러짐 — 동료가 곁에 오면 살아난다 (${Math.ceil(me.downT || 0)}초)` : null); return; }
  let near = null, nd = me.S.pickup; for (const l of G.loot) { const dd = d2(l.pos, me.pos); if (dd < nd) { nd = dd; near = l; } }
  for (const l of [...G.loot]) if (d2(l.pos, me.pos) < 1.0) pickupLoot(l);
  const ch = G.chests.find(c => !c.opened && d2(c.pos, me.pos) < 2.6);
  if (near && G.loot.includes(near)) { prompt = `줍기: ${near.item.name}`; if (pressed) pickupLoot(near); }
  else if (ch) { prompt = '상자 열기'; if (pressed) { if (isClient()) G.net.conn.send({ t: 'use', k: 'chest', id: ch.id }); else openChest(ch); } }
  else if (G.run.portal && d2(G.run.portal.position, me.pos) < 2.4) { prompt = '마을로 돌아가기'; if (pressed) { if (isClient()) G.net.conn.send({ t: 'use', k: 'portal' }); else endAll(true); } }
  for (const c of G.chests) if (!c.seen && d2(c.pos, me.pos) < 25) c.seen = true;
  UI.prompt(prompt);
}
function pickupLoot(l) {
  if (G.me.bag.length >= 20) { UI.toast('원정 가방이 가득 찼다'); return; }
  G.me.bag.push(l.item); scene.remove(l.mesh); G.loot.splice(G.loot.indexOf(l), 1);
  UI.toast(`<span style="color:${D.RARITY_COLORS[l.item.r]}">${l.item.name}</span> 획득`); sfx('pick');
}
export function bagEquip(it, on) { const me = G.me; if (on) me.bagEq[it.slot] = it.id; else delete me.bagEq[it.slot]; refreshGear(); }

// ================= 1인칭 손 =================
function setViewModel(force) {
  const me = G.me, cls = me ? me.cls : G.save.cls, gear = me ? effectiveGear(me) : G.save.classes[cls].equip;
  const key = `${cls}|${gear.weapon?.look}|${gear.weapon?.r}|${gear.armor?.look}|${gear.armor?.r}`;
  if (!force && key === vmKey) return; vmKey = key;
  if (vm) vmScene.remove(vm); vm = A.makeViewModel(cls, gear.weapon, gear.armor); vmScene.add(vm);
}
const lerp = (a, b, k) => a + (b - a) * k;
// 1인칭 활 자세용: 어깨 위치와 기본 방향
const VM_Q = { one: new THREE.Quaternion(), idleL: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 1.1, 0.35)), cant: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, -0.55)),
  shL: new THREE.Vector3(-0.38, -0.55, -0.05), shR: new THREE.Vector3(0.32, -0.55, 0.05), fwd: new THREE.Vector3(0, 0, -1) };
const qTo = d => new THREE.Quaternion().setFromUnitVectors(VM_Q.fwd, d.normalize());
function updateViewModel(dt) {
  if (!vm || !G.me) return;
  const a = G.me, u = vm.userData, b = u.base, t = G.time, I = G.input;
  const moving = Math.abs(I.mx) + Math.abs(I.my) > 0.1 && a.onGround;
  const bob = moving ? Math.sin(t * 9) * 0.015 : Math.sin(t * 1.5) * 0.004;
  u.L.position.copy(b.L).add(V3(0, bob, 0)); u.R.position.copy(b.R).add(V3(0, -bob, 0));
  u.L.rotation.set(0, 0, 0); u.R.rotation.set(0, 0, 0);
  vm.position.y = a.state !== 'ok' ? -0.4 : a.dashT > 0 ? -0.05 : 0;
  if (a.cls === 'warrior') {
    const s = a.swingAnim, k = Math.sin(s * Math.PI);
    u.blade.rotation.set(-1.0 - k * 0.9, k * 1.4, 0.55 - k * 0.8); u.R.position.x -= k * 0.35;
    if (a.input.rmb) u.L.position.set(-0.16, -0.16, -0.45);
  } else if (a.cls === 'archer') {
    // 평소: 활을 왼쪽 아래에 비스듬히 든다 → 공격: 왼팔을 뻗어 활을 눕히고, 오른팔로 시위를 당긴다
    const full = 1.2 * (1 - S.cvA(a, 'a_hand')), f = a.drawing ? Math.min(1, a.draw / full) : 0;
    a.bowPose = lerp(a.bowPose || 0, a.drawing || I.rmb ? 1 : 0, Math.min(1, dt * 12));
    const k = a.bowPose, pull = f * 0.26 * k;
    const hand = V3(lerp(b.L.x, -0.21, k), lerp(b.L.y, -0.13, k) + bob, lerp(b.L.z, -0.8, k) - a.castAnim * 0.03);
    u.L.position.copy(hand);
    u.L.quaternion.copy(VM_Q.idleL).slerp(qTo(hand.clone().sub(VM_Q.shL)), k);
    u.bow.quaternion.copy(VM_Q.one).slerp(u.L.quaternion.clone().invert().multiply(VM_Q.cant), k);
    u.string.position.y = -pull; u.arrow.position.z = pull;
    u.arrow.visible = k > 0.5 && (a.cd.lmb <= 0.05 || a.drawing);
    // 오른손은 시위 끝(화살 오늬)을 잡는다
    vm.updateMatrixWorld(true);
    const nock = vm.worldToLocal(u.bow.localToWorld(V3(0, 0, u.bowR)));
    const qr = qTo(nock.clone().sub(VM_Q.shR));
    const rp = nock.sub(V3(0, -0.05, -0.15).multiplyScalar(0.62).applyQuaternion(qr));
    u.R.position.set(lerp(b.R.x, rp.x, k), lerp(b.R.y - bob, rp.y, k), lerp(b.R.z, rp.z, k));
    u.R.quaternion.copy(VM_Q.one).slerp(qr, k);
  } else {
    // 지팡이 끝에서 마법을 모은다
    const isMage = a.cls === 'mage', full = 1 * (1 - S.cvA(a, 'm_fast'));
    const c = isMage && a.charging ? Math.min(1.6, a.charge / full) : 0;
    u.R.position.z -= a.castAnim * 0.12; u.R.position.y += a.castAnim * 0.03;
    u.staff.rotation.x = -0.6 - a.castAnim * 0.35 - c * 0.15;
    if (isMage) {
      u.orb.material.opacity = 0.35 + Math.min(1, c) * 0.6; u.halo.material.opacity = 0.15 + Math.min(1, c) * 0.35;
      u.orb.scale.setScalar(1 + c * 1.6 + Math.sin(t * 20) * 0.06 * c);
      u.orb.material.color.setHex(c >= 1 ? 0xff7a2a : c > 0 ? 0xffb060 : 0xbfa8ff);
      if (a.charging) u.L.position.add(V3(0.08, 0.06, -0.06));
    } else {
      u.orb.material.opacity = 0.25 + a.castAnim * 0.5; u.halo.material.opacity = 0.1 + a.castAnim * 0.3; u.orb.scale.setScalar(1 + a.castAnim);
      u.glow.material.opacity = a.healGlow + (a.input.rmb ? 0.35 : 0);
      if (a.input.rmb) u.L.position.add(V3(0.12, 0.1, -0.06));
    }
    if (u.staff.userData.spin) u.staff.userData.spin.rotation.y += dt * 3;
  }
}
// 다른 사람·봇의 모습
function updateAvatars(dt) {
  for (const a of G.actors) {
    if (!a.model || a === G.me) continue;
    if (a.tpos) a.pos.lerp(a.tpos, Math.min(1, dt * 12));
    const m = a.model, u = m.userData, spd = a.prevPos ? a.prevPos.distanceTo(a.pos) / Math.max(dt, 1e-3) : 0; a.prevPos = a.pos.clone();
    m.position.copy(a.pos); m.rotation.y = a.yaw + Math.PI;
    if (a.state !== 'ok') { m.rotation.x = -1.3; m.position.y = 0.3; continue; } m.rotation.x = 0;
    const w = spd > 0.5 ? Math.sin(G.time * 10) * 0.5 : 0; u.legs[0].rotation.x = w; u.legs[1].rotation.x = -w;
    const fl = a.flags ?? ((a.input.rmb ? 1 : 0) | (a.charging ? 2 : 0) | (a.drawing ? 4 : 0) | (a.swingAnim > 0 ? 8 : 0) | (a.castAnim > 0 ? 16 : 0));
    u.armR.rotation.x = fl & 8 ? -2.2 + Math.sin(G.time * 20) * 0.6 : fl & (2 | 16) ? -1.3 : -w * 0.6;
    u.armL.rotation.x = fl & (4 | 1) ? -1.5 : w * 0.6;
  }
}

// ================= 조준 표시 =================
function updateAim(dt) {
  const me = G.me, I = me.input;
  const active = I.lmb || I.rmb || I.q || me.charging || me.drawing;
  if (active) { G.aim.aiming = true; G.aim.until = 0.4; } else if (G.aim.aiming) { G.aim.until -= dt; if (G.aim.until <= 0) G.aim.aiming = false; }
  G.aim.charge = me.cls === 'mage' && me.charging ? Math.min(1, me.charge / (1 * (1 - S.cvA(me, 'm_fast')))) : 0;
  G.aim.draw = me.cls === 'archer' && me.drawing ? me.draw / (1.2 * (1 - S.cvA(me, 'a_hand'))) : 0;
  G.aim.swinging = me.cls === 'warrior' && me.swingAnim > 0;
  G.aim.target = null;
  if (me.cls === 'archer' && (me.drawing || I.rmb)) {
    const t = findTarget(10);
    if (t) {
      const y0 = t.def?.type === 'flyer' ? t.vy : 0, sc = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, ok: p.z < 1 }; };
      const top = sc(V3(t.pos.x, y0 + t.h, t.pos.z)), bot = sc(V3(t.pos.x, y0, t.pos.z)), head = sc(V3(t.pos.x, y0 + t.h + 0.35, t.pos.z));
      if (top.ok) G.aim.target = { top, bot, head, w: Math.abs(bot.y - top.y) * 0.7 + 20, weak: !t.boss && t.def?.type !== 'flyer' };
    }
  }
}
function findTarget(maxDeg) {
  const o = S.eyeOf(G.me), d = S.dirOf(G.me); let best = null, ba = maxDeg * Math.PI / 180;
  for (const e of G.enemies) { if (e.state === 'hidden' || e.hidden) continue; const p = V3(e.pos.x, (e.def?.type === 'flyer' ? e.vy : 0) + e.h * 0.6, e.pos.z).sub(o), dist = p.length(); if (dist > 45) continue; const ang = p.normalize().angleTo(d); if (ang < ba) { ba = ang; best = e; } }
  return best;
}
function aimAssist(dt) {
  const s = G.save.settings.assist; if (!G.isTouch || !s || !G.aim.aiming) return;
  const t = findTarget(8); if (!t) return;
  const me = G.me, tp = V3(t.pos.x, (t.def?.type === 'flyer' ? t.vy : 0) + t.h * 0.6, t.pos.z).sub(S.eyeOf(me));
  const wy = Math.atan2(-tp.x, -tp.z), wp = Math.atan2(tp.y, Math.hypot(tp.x, tp.z)), k = Math.min(1, dt * (s === 2 ? 6 : 3));
  me.yaw += Math.atan2(Math.sin(wy - me.yaw), Math.cos(wy - me.yaw)) * k; me.pitch += (wp - me.pitch) * k;
}

// ================= 메인 루프 =================
let last = performance.now(), inT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.time += dt;
  if (G.run && G.me && !(G.mode === 'pause' && !G.net)) runFrame(dt); // 혼자일 때만 진짜 멈춤
  updateVisuals(dt); S.updateRain(dt); updateWorldVisual(dt, G.time);
  if (sky) sky.userData.tick(G.time); if (grass) grass.userData.tick(G.time, camera);
  // 카메라
  const me = G.me;
  if (me && G.run) {
    if (me.state === 'dead') { const f = G.actors.find(a => a.state === 'ok') || me; camera.position.set(f.pos.x - Math.sin(G.time * 0.2) * 6, 4, f.pos.z - Math.cos(G.time * 0.2) * 6); camera.lookAt(f.pos.x, 1.2, f.pos.z); }
    else { camera.position.set(me.pos.x, me.pos.y + (me.state === 'down' ? 0.5 : 1.6), me.pos.z); camera.rotation.set(me.pitch, me.yaw, me.state === 'down' ? 0.3 : 0); }
    const sh = getShake(); if (sh > 0) { camera.position.x += rnd(-1, 1) * sh * 0.15; camera.position.y += rnd(-1, 1) * sh * 0.15; decayShake(dt); }
    const wantFov = (G.isTouch ? 80 : 75) - (me.cls === 'archer' && me.input.rmb ? 30 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
  } else { camera.position.set(Math.sin(G.time * 0.04) * 22, 6, 18 + Math.cos(G.time * 0.04) * 10); camera.lookAt(0, 4, -6); }
  G.camQ = camera.quaternion;
  renderer.clear(); renderer.render(scene, camera);
  if (G.run && G.me && G.me.state !== 'dead') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
  UI.hud(G, camera);
}
function runFrame(dt) {
  const me = G.me, I = G.input;
  // 내 입력 → 내 캐릭터
  if (G.mode === 'run' && !me.choosing) {
    const sens = 0.0022 * G.save.settings.sens * (me.cls === 'archer' && I.rmb ? 0.5 : 1);
    me.yaw -= I.lookDX * sens; me.pitch = clamp(me.pitch - I.lookDY * sens, -1.45, 1.45);
    Object.assign(me.input, { mx: I.mx, my: I.my, lmb: I.lmb, rmb: I.rmb, q: I.q, dashT: me.input.dashT || I.dashT, jumpT: I.jumpT });
  } else Object.assign(me.input, { mx: 0, my: 0, lmb: false, rmb: false, q: false });
  I.lookDX = I.lookDY = 0;
  const dashEv = me.input.dashT;
  aimAssist(dt);
  if (isClient()) {
    S.updateActor(me, dt, 'client');
    for (const e of G.enemies) { if (e.tpos) e.pos.lerp(e.tpos, Math.min(1, dt * 12)); e.t = (e.t || 0) + dt; if (e.boss) S.bossVisual(e); else S.enemyVisual(e); }
    inT -= dt; if (inT <= 0 || dashEv) { inT = 0.05; G.net.conn.send({ t: 'i', p: P3(me.pos), y: +me.yaw.toFixed(3), pi: +me.pitch.toFixed(3), b: (me.input.lmb ? 1 : 0) | (me.input.rmb ? 2 : 0) | (me.input.q ? 4 : 0) | (me.choosing ? 8 : 0), ev: dashEv ? ['d'] : [] }); }
    // 보상 반영
    if (G.run.xp > G.run.xpSeen) { gainXp(G.run.xp - G.run.xpSeen); G.run.xpSeen = G.run.xp; }
  } else {
    G.timeScale = me.cls === 'archer' && S.hasA(me, 'aL_breath') && me.input.rmb ? 0.5 : 1;
    let wdt = dt * G.timeScale; if (G.hitStop > 0) { G.hitStop -= dt; wdt = 0; }
    for (const a of G.actors) {
      if (a.kind === 'bot') { S.botThink(a, dt); S.updateActor(a, dt, 'full'); }
      else if (a.kind === 'remote') S.updateActor(a, dt, 'remote');
      else S.updateActor(a, dt, 'full');
    }
    S.updateProjectiles(dt, wdt); S.updateZones(dt, wdt); S.updateTeles(wdt); S.updateProps(dt);
    hostWorld(dt, wdt);
    if (G.run && G.run.xp > G.run.xpSeen) { gainXp(G.run.xp - G.run.xpSeen); G.run.xpSeen = G.run.xp; }
    if (G.net && G.run) {
      if (G.net.fxq.length) { G.net.room.broadcast({ t: 'f', l: G.net.fxq }); G.net.fxq = []; }
      G.net.sendT -= dt; if (G.net.sendT <= 0) { G.net.sendT = 1 / 15; G.net.room.broadcast(snapshot()); }
    }
  }
  if (!G.run) return;
  I.dashT = I.jumpT = false;
  interact(I.useT); I.useT = false;
  updateAvatars(dt);
  for (const l of G.loot) { l.mesh.userData.gem.rotation.y += dt * 2; l.mesh.userData.gem.position.y = 0.6 + Math.sin(G.time * 3) * 0.1; }
  if (G.run.portal) G.run.portal.rotation.y += dt;
  updateAim(dt); updateViewModel(dt); setViewModel();
}

// ================= 시작 =================
export const api = { startSolo, hostLobby, joinLobby, lobbyStart, lobbyChanged, leaveNet: () => { leaveNet(); G.mode = 'town'; UI.showTown(); }, quitRun, writeSave, newItem, itemPower: S.itemPower, applyPoints, bagEquip, refreshGear,
  computeStats: () => G.me && refreshGear(), rebuildWorld: () => { buildScenery(); resize(); }, statsOf: a => a.S };
function buildScenery() {
  if (sky) scene.remove(sky); if (grass) scene.remove(grass);
  sky = A.makeSky(); scene.add(sky);
  grass = A.makeGrass(lowGfx() ? 2600 : 7500, lowGfx() ? 44 : 60, scene.fog); scene.add(grass);
}
function boot() {
  G.save = loadSave();
  buildScenery(); resize();
  if (!G.world) { const W = genWorld(12345); buildWorld(W); }
  UI.init(G, api);
  const room = new URLSearchParams(location.search).get('room');
  UI.showTown(); if (room) UI.openJoin(room);
  setViewModel(true);
  requestAnimationFrame(frame);
  // 방장이 다른 탭으로 가도 게임이 멈추지 않게 (보이지 않을 땐 그리지 않고 진행만)
  try { const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'])));
    w.onmessage = () => { if (document.hidden && G.net?.role === 'host' && G.run && G.me) { G.time += 0.05; runFrame(0.05); } }; } catch (e) { }
  window.__G = G; window.__api = api; window.__S = S; // 테스트·디버그용
}
boot();
