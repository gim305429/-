// 시뮬레이션: 플레이어·봇·몬스터·보스·기믹. 피해 계산은 방장만 한다.
import * as THREE from 'three';
import * as D from './data.js';
import * as A from './art.js';
import { G, scene, isHost, rnd, pick, clamp, d2, fx, burst, ringFx, beamFx, shake, P3, nextId, sfx } from './core.js';

export const hooks = {}; // run.js 가 채운다: kill(e, by), bossKilled(e), drop(actor, pos, opt), xp(n), down(a)
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmpV = V3(), tmpV2 = V3();

// ================= 카드·능력치 =================
export const hasA = (a, id) => !!a && id in a.cards;
export const cvA = (a, id) => { if (!a || !(id in a.cards)) return 0; const c = D.CARD_BY_ID[id]; return c.L ? 1 : c.v[a.cards[id]]; };
const tr = (a, k, n) => a.traits.has(k + n);
export function emptyInput() { return { mx: 0, my: 0, lmb: false, rmb: false, q: false, dashT: false, jumpT: false, useT: false }; }
export function makeActor(o) {
  return { id: o.id, kind: o.kind, name: o.name, cls: o.cls, lv: o.lv || 1, pts: o.pts || { atk: 0, vit: 0, agi: 0, crt: 0, spr: 0 }, equip: o.equip || {}, cards: o.cards || {},
    legends: 0, uniq: new Set(), traits: new Set(), S: null, pos: V3(o.x || 0, 0, o.z || 0), vy: 0, yaw: o.yaw || 0, pitch: 0, hp: 1, mana: 100,
    cd: { lmb: 0, rmb: 0, q: 0, dash: 0, bash: 0 }, qMax: 1, rmbMax: 1, dashCharges: 1, dashT: 0, dashDir: V3(), invuln: 0, buff: {}, blocking: false, giant: 0,
    combo: 0, lastSwing: -9, charging: false, charge: 0, drawing: false, draw: 0, bolts: 0, statics: 0, angelUsed: false, undyingUsed: false, escapeCd: 0, shellCd: 0,
    comboT: null, comboN: 0, swingAnim: 0, castAnim: 0, onGround: true, reflex: false, stormT: 0, state: 'ok', downT: 0, reviveP: 0, input: emptyInput(), choosing: false,
    bagEq: {}, bag: null, model: null, healGlow: 0, padT: 0, wish: null, bot: o.kind === 'bot' ? { t: 0, hold: 0, slot: o.slot || 0 } : null, kills: 0 };
}
export function computeStats(a) {
  const cd = D.CLASSES[a.cls], p = a.pts;
  a.traits = new Set(); for (const k of D.STAT_IDS) { if (p[k] >= 10) a.traits.add(k + 1); if (p[k] >= 20) a.traits.add(k + 2); }
  const slots = { weapon: a.equip.weapon, armor: a.equip.armor, trinket: a.equip.trinket };
  if (a.bag) for (const [s, id] of Object.entries(a.bagEq)) { const it = a.bag.find(i => i.id === id); if (it) slots[s] = it; }
  let hpFlat = 0, atkG = 0; const af = { atk: 0, hp: 0, crit: 0, critDmg: 0, move: 0, cdr: 0, leech: 0, dr: 0 };
  a.uniq = new Set();
  for (const it of Object.values(slots).filter(Boolean)) {
    const pw = itemPower(it); hpFlat += pw.hp || 0; atkG += pw.atk || 0;
    for (const x of it.aff) af[x.k] += x.v;
    if (it.u) a.uniq.add(it.u);
  }
  const S = {};
  S.hpMax = (cd.hp * (1 + 0.06 * (a.lv - 1)) + hpFlat) * (1 + af.hp + cvA(a, 'k_tough') + 0.04 * p.vit) * (hasA(a, 'kL_glass') ? 0.6 : 1);
  S.atk = (1 + 0.04 * (a.lv - 1)) * (1 + atkG) * (1 + af.atk + cvA(a, 'k_train') + 0.02 * p.atk) * (hasA(a, 'kL_glass') ? 1.6 : 1) * (a.kind === 'bot' ? 1.15 : 1);
  S.crit = 0.05 + af.crit + cvA(a, 'k_sharp') + 0.01 * p.crt; S.critDmg = af.critDmg + cvA(a, 'k_cruel') + 0.03 * p.crt;
  S.move = 1 + af.move + cvA(a, 'k_run') + cvA(a, 'a_wind') + (hasA(a, 'kL_wind') ? 0.25 : 0) + 0.01 * p.agi;
  S.cdAll = (1 - af.cdr) * (hasA(a, 'kL_time') ? 0.7 : 1) * (1 - 0.015 * p.spr);
  S.qcd = S.cdAll * (1 - cvA(a, 'k_cast'));
  S.dashCd = Math.max(0.5, (2 - cvA(a, 'k_dash') - cvA(a, 'a_roll')) * (1 - 0.02 * p.agi)) * S.cdAll;
  S.dashMax = (hasA(a, 'aL_dance') ? 2 : 1) + (tr(a, 'agi', 2) ? 1 : 0);
  S.dr = (1 - af.dr) * (1 - cvA(a, 'k_armor'));
  S.leech = af.leech; S.regen = cvA(a, 'k_regen'); S.pickup = 2.5 + cvA(a, 'k_magnet'); S.healMult = 1 + 0.03 * p.spr;
  S.luck = cvA(a, 'k_luck'); S.cardsense = cvA(a, 'k_cardsense');
  const ratio = a.S ? a.hp / a.S.hpMax : 1;
  a.S = S; a.hp = Math.min(S.hpMax, S.hpMax * ratio);
  if (a.dashCharges > S.dashMax) a.dashCharges = S.dashMax;
}
export function itemPower(it) {
  const rm = D.RARITY_MULT[it.r], e = 1 + 0.1 * it.enh;
  if (it.slot === 'weapon') return { atk: 0.10 * rm * e };
  if (it.slot === 'armor') return { hp: Math.round(20 * rm * e) };
  return {};
}
function qCooldown(a) {
  let base = D.CLASSES[a.cls].qcd;
  if (a.cls === 'warrior') { base -= cvA(a, 'w_will'); if (hasA(a, 'wL_drum')) base *= 0.5; }
  if (a.cls === 'cleric') base -= cvA(a, 'c_quick');
  if (a.cls === 'mage' && hasA(a, 'mL_stop')) base += 4;
  return Math.max(2, base * a.S.qcd);
}

// ================= 위치·조준 =================
export const eyeOf = a => V3(a.pos.x, a.pos.y + 1.6, a.pos.z);
export const dirOf = a => V3(0, 0, -1).applyEuler(new THREE.Euler(a.pitch, a.yaw, 0, 'YXZ'));
export const fwdOf = a => V3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
const rightOf = a => V3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
// 손에 든 무기에서 투사체가 나가되 조준점으로 모인다
function muzzle(a, side = 0.25, down = 0.15) { return eyeOf(a).addScaledVector(rightOf(a), side).add(V3(0, -down, 0)).addScaledVector(fwdOf(a), 0.6); }
function aimed(a, from, speed, spread = 0) {
  const tgt = eyeOf(a).addScaledVector(dirOf(a), 40);
  const d = tgt.sub(from).normalize(); if (spread) d.applyAxisAngle(V3(0, 1, 0), spread); return d.multiplyScalar(speed);
}
function groundAim(a, maxD = 25) {
  const o = eyeOf(a), d = dirOf(a); let t = d.y < -0.02 ? -o.y / d.y : maxD; t = Math.min(t, maxD);
  const p = o.addScaledVector(d, t); p.y = 0; return p;
}
export function pushOut(pos, r) {
  for (const o of G.obstacles) { const dd = d2(pos, o), m = o.r + r; if (dd < m && pos.y < o.h) { const k = dd < 0.001 ? 1 : (m - dd) / dd; pos.x += (pos.x - o.x) * k; pos.z += (pos.z - o.z) * k; } }
  const l = Math.hypot(pos.x, pos.z), lim = D.WORLD_R - r; if (l > lim) { pos.x *= lim / l; pos.z *= lim / l; }
  if (G.world && !G.world.seal) { const f = G.world.W.lairs.final, dd = Math.hypot(pos.x - f.x, pos.z - f.z); if (dd < 21.5 + r && dd > 19) { const k = (21.5 + r - dd) / dd; pos.x += (pos.x - f.x) * k; pos.z += (pos.z - f.z) * k; } }
}
export const alive = a => a.state === 'ok';
export const humans = () => G.actors.filter(a => a.kind !== 'bot');

// ================= 피해·회복 =================
export function heal(a, amt, src) {
  if (!a || a.state !== 'ok') return;
  if (hasA(a, 'kL_vamp') && src !== 'leech') amt *= 0.5;
  if (src !== 'leech') amt *= a.S.healMult;
  a.hp = Math.min(a.S.hpMax, a.hp + amt);
}
export function takeDamage(a, amount, o = {}) {
  if (!isHost() || a.state !== 'ok' || a.choosing) return 0;
  if (a.invuln > 0 || (a.dashT > 0 && hasA(a, 'aL_dance'))) return 0;
  if (a.uniq.has('b_shell') && a.shellCd <= 0) { a.shellCd = 5; fx('toast', { to: a.id, text: '수정 보호막이 막았다' }); return 0; }
  const srcPos = o.src ? o.src.pos : o.pos;
  let front = false;
  if (srcPos) { const dx = srcPos.x - a.pos.x, dz = srcPos.z - a.pos.z, l = Math.hypot(dx, dz) || 1; front = (-Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz) / l > 0.3; }
  let d = amount;
  if (a.cls === 'warrior' && a.input.rmb && front) {
    const blocked = d * Math.min(0.97, 0.8 + cvA(a, 'w_sturdy')); d -= blocked; fx('sfx', { k: 'block', p: P3(a.pos) });
    if (o.src && !o.src.dead && hasA(a, 'w_reflect')) hitEnemy(o.src, blocked * cvA(a, 'w_reflect'), { by: a, raw: true, noCrit: true });
    if (hasA(a, 'w_riposte')) a.buff.riposte = 1;
    if (hasA(a, 'wL_giant')) a.giant += blocked;
    if (a.uniq.has('u_shock')) explode(a.pos, 3, 20, { by: a, color: 0xd6c49a });
  }
  if (front && a.uniq.has('b_crest')) d *= 0.8;
  d *= a.S.dr;
  if (a.hp / a.S.hpMax < 0.3) d *= 1 - cvA(a, 'w_unyield');
  if (a.hp / a.S.hpMax < 0.5 && tr(a, 'vit', 1)) d *= 0.9;
  if (a.buff.shout > 0) d *= 0.7;
  if (a.buff.carmor > 0) d *= 1 - cvA(a, 'c_armor');
  if (a.buff.mice > 0) d *= 1 - cvA(a, 'm_ice');
  if (inZone(a.pos, 'sanct')) d *= 0.8;
  d = Math.max(0, Math.round(d));
  if (d <= 0) return 0;
  a.hp -= d; fx('hurt', { to: a.id }); shake(0.25, a.id);
  if (o.melee && o.src && !o.src.boss && !o.src.dead) {
    if (hasA(a, 'k_thorns')) hitEnemy(o.src, cvA(a, 'k_thorns'), { by: a, raw: true, noCrit: true });
    if (a.uniq.has('b_vine')) o.src.st.root = 2;
  }
  if (a.uniq.has('b_spore')) addZone(a.pos, 2, 3, 'poison', { dps: 8, side: 'player', by: a });
  if (a.hp > 0 && a.hp / a.S.hpMax < 0.3 && hasA(a, 'k_escape') && a.escapeCd <= 0) { a.invuln = 2; a.escapeCd = cvA(a, 'k_escape'); fx('toast', { to: a.id, text: '위기 탈출!' }); }
  if (a.hp <= 0) {
    if (hasA(a, 'cL_angel') && !a.angelUsed) { a.angelUsed = true; a.hp = a.S.hpMax; a.invuln = 3; fx('toast', { to: a.id, text: '수호 천사가 되살렸다' }); }
    else if (tr(a, 'vit', 2) && !a.undyingUsed) { a.undyingUsed = true; a.hp = 1; a.invuln = 1; fx('toast', { to: a.id, text: '불사!' }); }
    else { a.hp = 0; a.state = 'down'; a.downT = 25; a.reviveP = 0; fx('banner', { text: `${a.name} 쓰러짐!`, dur: 1.5 }); hooks.down && hooks.down(a); }
  }
  return d;
}
const inZone = (p, kind) => G.zones.some(z => z.kind === kind && d2(z.pos, p) < z.r);

export function hitEnemy(e, base, o = {}) {
  if (!e || e.dead || !isHost()) return 0;
  if (e.state === 'hidden') revealVine(e);
  if (e.boss && e.invuln) { fx('dmg', { p: P3(e.pos.clone().setY(e.h)), v: '막힘', c: '#c9d6e0', to: o.by?.id }); return 0; }
  const a = o.by;
  let d = base * (o.raw || !a ? 1 : a.S.atk), crit = false;
  if (a && !o.raw) {
    if (e.hp >= e.maxHp) d *= 1 + cvA(a, 'k_ambush');
    if (e.elite || e.def?.big || e.boss) d *= (1 + cvA(a, 'k_giant')) * (tr(a, 'atk', 2) ? 1.15 : 1);
    if (o.kind === 'melee' && e.hp / e.maxHp < 0.25) d *= 1 + cvA(a, 'w_exec');
    if (a.cls === 'archer' && d2(a.pos, e.pos) > 10) d *= 1 + cvA(a, 'a_range');
    if (a.buff.react > 0) d *= 1 + cvA(a, 'k_react');
    if (a.buff.kill > 0) d *= 1.15;
    if (hasA(a, 'k_combo')) { if (a.comboT === e) a.comboN = Math.min(5, a.comboN + 1); else { a.comboT = e; a.comboN = 0; } d *= 1 + a.comboN * cvA(a, 'k_combo'); }
    const cc = a.S.crit + (a.cls === 'archer' && a.input.rmb ? cvA(a, 'a_focus') : 0) + (a.buff.crt > 0 ? 0.1 : 0);
    if (!o.noCrit && Math.random() < cc) { crit = true; d *= 1.5 + a.S.critDmg; if (tr(a, 'crt', 1)) a.buff.crt = 3; }
    if (o.head) { d *= 2 + cvA(a, 'a_eye'); if (hasA(a, 'a_mark')) e.st.mark = { v: cvA(a, 'a_mark'), t: 4 }; }
  }
  d *= 1 + (e.st.mark?.t > 0 ? e.st.mark.v : 0) + (e.st.intim?.t > 0 ? e.st.intim.v : 0);
  const from = a ? a.pos : e.pos;
  const dir = o.dir ? tmpV.copy(o.dir).setY(0).normalize() : tmpV.copy(e.pos).sub(from).setY(0).normalize();
  const fw = tmpV2.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)), facing = -(fw.x * dir.x + fw.z * dir.z);
  if (e.def?.front && facing > 0.3) d *= e.def.front;
  if (e.def?.backCrystal) d *= facing < -0.3 ? 2 : 0.5;
  if (e.affix === 'tough') d *= 0.7;
  if (e.boss) d *= bossDamageMod(e, o, facing);
  d = Math.max(1, Math.round(d));
  if (crit && a && tr(a, 'crt', 2) && !e.boss && e.hp - d < e.maxHp * 0.3) d = Math.ceil(e.hp);
  e.hp -= d; e.flash = 0.1; e.lastHitBy = a;
  if (e.boss) e.aggroT = 8;
  else if (a && (!e.target || e.target.state !== 'ok')) e.target = a;
  fx('dmg', { p: P3(o.point || e.pos.clone().setY((e.def?.type === 'flyer' ? e.vy : 0) + e.h)), v: d, c: crit || o.head ? '#ffd24a' : '#ffffff', b: crit || o.head, to: a?.id });
  if (o.kind === 'melee') G.hitStop = Math.max(G.hitStop, 0.04);
  if (a) { const leech = a.S.leech + (hasA(a, 'kL_vamp') ? 0.06 : 0) + (o.kind === 'melee' ? cvA(a, 'w_leech') : 0); if (leech > 0) heal(a, d * leech, 'leech'); }
  if (e.hp <= 0) killEnemy(e, o);
  return d;
}

// ================= 적 =================
export function spawnEnemy(key, pos, o = {}) {
  const def = D.MONSTERS[key];
  const model = A.makeMonster(key, def); scene.add(model);
  const e = { id: o.id || nextId(), key, def, model, pos: pos.clone(), yaw: Math.random() * 6, hp: def.hp * (o.hpMult || 1), atk: def.atk * (o.atkMult || 1), speed: def.speed,
    r: def.r, h: def.h, t: 0, atkT: rnd(0.5, 1.5), wind: 0, state: def.type === 'ambush' ? 'hidden' : 'move', st: {}, flash: 0,
    elite: !!o.affix, affix: o.affix, bar: A.hpBar(), vy: 0, camp: o.camp ?? null, home: o.home || pos.clone(), roam: !!o.roam, aggro: o.aggro || 14, target: null, tgtT: 0 };
  if (o.affix) { e.hp *= 2.5; e.r *= 1.3; e.h *= 1.3; model.scale.setScalar(1.3); A.setOutlineColor(model, 0xf0b030); if (o.affix === 'fast') e.speed *= 1.4; }
  if (o.mini) { model.scale.setScalar(0.7); e.r *= 0.7; e.h *= 0.7; }
  e.maxHp = e.hp;
  if (def.type === 'ambush') for (const c of model.children) if (!c.userData.isBush) c.visible = false;
  scene.add(e.bar); model.position.copy(e.pos);
  G.enemies.push(e); return e;
}
export function removeEnemy(e) {
  scene.remove(e.model); scene.remove(e.bar);
  if (e.laserMesh) scene.remove(e.laserMesh);
  if (e.lineId) { fx('t-', { id: e.lineId }); e.lineId = null; }
  const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
}
function killEnemy(e, o) {
  if (e.dead) return; e.dead = true;
  const by = o.by;
  if (by) { by.kills++; if (tr(by, 'atk', 1)) by.buff.kill = 3; if (hasA(by, 'k_kill')) heal(by, cvA(by, 'k_kill')); if (by.uniq.has('u_star')) by.cd.q = Math.max(0, by.cd.q - 1); }
  if (e.boss) { hooks.bossKilled(e); return; }
  burst(e.pos, e.def.color, 12, e.h * 0.5); fx('sfx', { k: 'kill', p: P3(e.pos) });
  if (e.def.poisonOnDeath) addZone(e.pos, 1.6, 2, 'poison', { dps: 5, side: 'enemy' });
  if (o.fire && by && hasA(by, 'm_chain')) explode(e.pos, 2.5, cvA(by, 'm_chain'), { by, color: 0xff8a3a });
  if (e.affix === 'split') for (let i = 0; i < 2; i++) spawnEnemy(e.key, e.pos.clone().add(V3(rnd(-1, 1), 0, rnd(-1, 1))), { mini: true, hpMult: e.maxHp / e.def.hp * 0.3 / 2.5, atkMult: e.atk / e.def.atk, camp: e.camp, aggro: 40 });
  hooks.kill(e, by);
  removeEnemy(e);
}
function revealVine(e) { e.state = 'move'; for (const c of e.model.children) c.visible = !c.userData.isBush; fx('sfx', { k: 'pop', p: P3(e.pos) }); }
const enemyCanAct = e => !(e.st.stun > 0 || e.st.freeze > 0);
function pickTarget(e, range) {
  if (e.taunt && e.taunt.t > 0 && alive(e.taunt.a)) return e.taunt.a;
  let best = null, bd = range;
  for (const a of G.actors) { if (!alive(a) || a.choosing) continue; const dd = d2(a.pos, e.pos); if (dd < bd) { bd = dd; best = a; } }
  return best;
}
export function updateEnemy(e, dt) {
  for (const k of ['stun', 'freeze', 'root']) if (e.st[k] > 0) e.st[k] -= dt;
  for (const k of ['mark', 'intim', 'slow', 'burn']) if (e.st[k]) { e.st[k].t -= dt; if (e.st[k].t <= 0) delete e.st[k]; }
  if (e.taunt) { e.taunt.t -= dt; if (e.taunt.t <= 0) e.taunt = null; }
  if (e.st.burn) { e.st.burnAcc = (e.st.burnAcc || 0) + dt; if (e.st.burnAcc > 0.5) { e.st.burnAcc = 0; hitEnemy(e, e.st.burn.dps * 0.5, { raw: true, noCrit: true, by: e.st.burn.by }); if (e.dead) return; } }
  if (e.flash > 0) e.flash -= dt;
  if (e.affix === 'burning') { e.burnT = (e.burnT || 0) - dt; if (e.burnT <= 0) { e.burnT = 0.6; addZone(e.pos, 1, 3, 'fire', { dps: 6, side: 'enemy' }); } }
  if (e.boss) { updateBoss(e, dt); return; }
  e.t += dt; e.atkT -= dt; e.tgtT -= dt;
  if (e.tgtT <= 0 || !e.target || !alive(e.target) || e.target.choosing) { e.tgtT = 1; const t = pickTarget(e, e.target ? e.aggro + 8 : e.aggro); e.target = t; }
  const P = e.target;
  if (!enemyCanAct(e)) { e.wind = 0; return finishEnemy(e, dt); }
  if (e.state === 'hidden') { if (P && d2(P.pos, e.pos) < 3.5) revealVine(e); return finishEnemy(e, dt); }
  const slowM = (e.st.slow ? 1 - e.st.slow.v : 1) * (inThorn(e.pos) ? 0.6 : 1);
  let move = null;
  if (!P) { // 돌아다니기
    if (e.roam) { const hd = d2(e.home, e.pos); if (hd > 6 || !e.wander || e.t > e.wanderT) { e.wander = e.home.clone().add(V3(rnd(-6, 6), 0, rnd(-6, 6))); e.wanderT = e.t + rnd(3, 6); }
      const to = tmpV.copy(e.wander).sub(e.pos).setY(0); if (to.length() > 0.5) { move = to.normalize().clone(); e.yaw = Math.atan2(move.x, move.z); } }
    if (move) e.pos.addScaledVector(move, e.speed * 0.4 * dt);
    if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt);
    return finishEnemy(e, dt);
  }
  if (e.roam && d2(e.home, e.pos) > 34) { e.target = null; e.tgtT = 4; return finishEnemy(e, dt); }
  const toP = tmpV.copy(P.pos).sub(e.pos).setY(0); const dist = toP.length(); toP.normalize();
  e.yaw = Math.atan2(toP.x, toP.z);
  const reach = 1.1 + e.r, def = e.def;
  switch (def.type) {
    case 'rush': case 'ambush': case 'shield': {
      if (def.teleport) { e.tp = (e.tp ?? 4) - dt; if (e.tp <= 0 && dist > 3) { e.tp = 4; burst(e.pos, 0x6a5a9a, 10, 1); e.pos.copy(P.pos).addScaledVector(fwdOf(P), -2.2); burst(e.pos, 0x6a5a9a, 10, 1); } }
      if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) { if (d2(P.pos, e.pos) < reach + 0.6) enemyHit(e, P); e.atkT = 1.2; } break; }
      if (dist < reach && e.atkT <= 0) { e.wind = e.windMax = 0.4; break; }
      if (def.flank && dist > 5) { const side = e.id % 2 ? 1 : -1; move = V3(P.pos.x - toP.z * 4 * side - e.pos.x, 0, P.pos.z + toP.x * 4 * side - e.pos.z).normalize(); }
      else if (dist > reach * 0.8) move = toP.clone();
      break;
    }
    case 'flyer': {
      e.vy = 1.6 + Math.sin(e.t * 4 + e.id) * 0.3;
      if (e.state === 'back') { e.backT -= dt; move = toP.clone().multiplyScalar(-1); if (e.backT <= 0) e.state = 'move'; break; }
      if (dist < 1.1 && e.atkT <= 0) { enemyHit(e, P); e.atkT = 1; e.state = 'back'; e.backT = 0.8; break; }
      move = toP.clone(); break;
    }
    case 'shooter': {
      const keep = def.keep;
      if (dist < keep - 2) move = toP.clone().multiplyScalar(-1); else if (dist > keep + 2) move = toP.clone();
      if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) { if (e.lineId) { fx('t-', { id: e.lineId }); e.lineId = null; } shootAt(e, P, def.telegraph ? 18 : 11, def.telegraph ? 0xd9c08a : 0xf2a6c8); e.atkT = def.telegraph ? 2.5 : 2; } break; }
      if (e.atkT <= 0 && dist < 26) { e.wind = e.windMax = def.telegraph ? 0.5 : 0.25; if (def.telegraph) { e.lineId = nextId(); fx('t+', { id: e.lineId, k: 'l', p: P3(e.pos), len: dist + 2, w: 0.25, rot: Math.atan2(toP.x, toP.z), dur: 0.5 }); } }
      break;
    }
    case 'bomber': {
      move = toP.clone();
      if (dist < e.r + 0.9) { explode(e.pos, 2, 0, { enemySide: true, dmg: e.atk, color: 0xd9c08a }); e.dead = true; hooks.kill(e, null); removeEnemy(e); return; }
      e.spinX = (e.spinX || 0) + dt * 8; break;
    }
    case 'tank': {
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) {
          const hitP = e.pos.clone().addScaledVector(V3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), 1.6);
          ringFx(hitP, 2.5, 0xb9b0a0); shake(0.3, P.id);
          for (const a of G.actors) if (alive(a) && d2(hitP, a.pos) < 2.5 && a.pos.y < 0.8) enemyHit(e, a);
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
      if (e.healT <= 0) { e.healT = 3; ringFx(e.pos, 6, 0x7cff7c); for (const o of G.enemies) if (o !== e && !o.boss && d2(o.pos, e.pos) < 6) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.1); }
      break;
    }
  }
  if (move && !(e.st.root > 0)) e.pos.addScaledVector(move.normalize(), e.speed * slowM * dt);
  finishEnemy(e, dt);
}
function finishEnemy(e, dt) {
  for (const o of G.enemies) { if (o === e || o.boss) continue; const dd = d2(o.pos, e.pos), m = o.r + e.r; if (dd < m && dd > 0.001) { tmpV.copy(e.pos).sub(o.pos).setY(0).normalize().multiplyScalar((m - dd) * 0.5); e.pos.add(tmpV); } }
  pushOut(e.pos, e.r);
  enemyVisual(e);
}
// 몬스터 모습 갱신 (방장·참가자 공통)
export function enemyVisual(e, cam) {
  const y = e.def.type === 'flyer' ? e.vy : 0;
  e.model.position.set(e.pos.x, y, e.pos.z); e.model.rotation.y = e.yaw;
  if (e.def.type === 'bomber') e.model.rotation.x = e.spinX || 0;
  else if (e.def.type !== 'flyer') e.model.position.y = Math.abs(Math.sin((e.t || G.time) * 8)) * 0.05;
  if (e.model.userData.wings) { const w = Math.sin(G.time * 22 + e.id) * 0.6; e.model.userData.wings[0].rotation.z = Math.PI / 2 + w; e.model.userData.wings[1].rotation.z = -Math.PI / 2 - w; }
  if (e.model.userData.arms) for (const a of e.model.userData.arms) a.rotation.x = e.wind > 0 ? -2.6 * (1 - e.wind / (e.windMax || 1)) : 0;
  if (e.flash > 0) A.flash(e.model, true);
  else if (e.st.freeze > 0 || e.frozen) A.tint(e.model, 0x8fd8ff, 0.6);
  else if (e.wind > 0) A.tint(e.model, 0xff4a3a, 0.5 * (1 - e.wind / (e.windMax || 1)));
  else A.flash(e.model, false);
  const showBar = e.hp < e.maxHp; e.bar.visible = showBar;
  if (showBar && G.camQ) { e.bar.position.set(e.pos.x, y + e.h + 0.45, e.pos.z); e.bar.quaternion.copy(G.camQ); e.bar.scale.setScalar(e.elite ? 1.4 : 1); e.bar.userData.fg.scale.x = Math.max(0, e.hp / e.maxHp); }
}
function enemyHit(e, a) { const dealt = takeDamage(a, e.atk, { src: e, melee: true }); if (e.affix === 'vamp' && dealt > 0) e.hp = Math.min(e.maxHp, e.hp + dealt * 0.3); }
function shootAt(e, a, speed, color) {
  const from = e.pos.clone().setY(e.h * 0.7), to = a.pos.clone().setY(a.pos.y + 1.0);
  enemyProj(from, to.sub(from).normalize().multiplyScalar(speed), e.atk, color, e);
}
function enemyProj(from, vel, dmg, color, src, size = 0.15) {
  const id = nextId(); fx('p+', { id, ty: 'orb', p: P3(from), v: P3(vel), s: size, c: color, l: 4 });
  G.eprojs.push({ id, pos: from.clone(), vel, r: 0.2, dmg, life: 4, src });
}
const inThorn = p => G.props.some(x => x.kind === 'thorn' && d2(x.pos, p) < x.r);

// ================= 보스 =================
export function spawnBoss(key, center, mult) {
  const def = D.BOSSES[key], model = A.makeBoss(key); scene.add(model);
  const e = { id: nextId(), key, def, boss: true, model, pos: center.clone().add(V3(0, 0, key === 'thorn' ? 0 : -4)), center: center.clone(), yaw: 0, hp: def.hp * mult, maxHp: def.hp * mult,
    atk: 20, r: def.r, h: def.h, st: {}, flash: 0, bar: new THREE.Group(), t: 0, pat: 2.5, phase: 1, state: 'idle', minions: 0, aggroT: 0 };
  model.position.copy(e.pos); G.enemies.push(e); scene.add(e.bar);
  fx('sfx', { k: 'boss' }); fx('banner', { text: def.name, dur: 2.5 });
  return e;
}
function bossDamageMod(e, o, facing) {
  if (e.key === 'gate' && e.state !== 'stunned' && facing > 0.3) return 0.3;
  const pt = o.point;
  if (e.key === 'thorn' && e.phase === 2 && pt) for (const k of e.model.userData.knots) { k.getWorldPosition(tmpV2); if (tmpV2.distanceTo(pt) < 1.0) { burst(tmpV2, 0xffe36b, 6, 0); return 2; } }
  if (e.key === 'turtleking') {
    if (e.phase === 2 && pt) for (const c of e.model.userData.crystals) { if (!c.visible) continue; c.getWorldPosition(tmpV2); if (tmpV2.distanceTo(pt) < 1.4) {
      c.userData.hp = (c.userData.hp ?? 150) - 30; burst(tmpV2, 0x9ff0ff, 6, 0);
      if (c.userData.hp <= 0) { c.visible = false; c.userData.outline.visible = false; fx('sfx', { k: 'break' });
        if (e.model.userData.crystals.every(x => !x.visible)) { e.state = 'stunned'; e.stunT = 5; fx('banner', { text: '수정이 모두 깨졌다! 5초 기절', dur: 2 }); } }
      return 2; } }
    if (e.state === 'stunned') return 1.5;
  }
  return 1;
}
const bpt = (e, b) => b * (e.phase === 2 ? 0.77 : 1);
function groundStrike(p, r, t, dmg, kind, after) {
  const id = nextId(); fx('t+', { id, k: 'c', p: P3(p), r, dur: t });
  G.teles.push({ id, t: 0, total: t, onDone: () => {
    burst(p, kind === 'shard' ? 0x9ff0ff : kind === 'spike' ? 0x6a4a2e : 0xd9614c, 10, 0.3);
    for (const a of G.actors) if (alive(a) && d2(p, a.pos) < r && a.pos.y < 1.2) takeDamage(a, dmg, { pos: p });
    after && after();
  } });
}
function shockwave(c, maxR, dur, dmg) {
  const m = A.ringPulse(0.5, 0xd6c49a); m.position.x = c.x; m.position.z = c.z; scene.add(m); shake(0.3);
  ringFx(c, maxR, 0xd6c49a);
  const hit = new Set();
  G.fx.push({ mesh: m, t: 0, dur, tick(f, dt) { f.t += dt; const r = 0.5 + (maxR - 0.5) * (f.t / dur); m.scale.setScalar(r); m.material.opacity = 0.9 * (1 - f.t / dur);
    for (const a of G.actors) if (alive(a) && !hit.has(a) && Math.abs(d2(c, a.pos) - r) < 0.7 && a.pos.y < 0.35) { hit.add(a); takeDamage(a, dmg, { pos: c }); }
    return f.t < dur; } });
}
function updateBoss(e, dt) {
  e.t += dt; e.pat -= dt; e.aggroT -= dt;
  let P = null, pd = 1e9;
  for (const a of G.actors) { if (!alive(a) || a.choosing) continue; const dd = d2(a.pos, e.center); if (dd < 24 && d2(a.pos, e.pos) < pd) { pd = d2(a.pos, e.pos); P = a; } }
  if (!P) { // 아무도 없으면 제자리로 돌아가 회복
    const back = tmpV.copy(e.center).sub(e.pos).setY(0); if (back.length() > 1 && e.key !== 'thorn') e.pos.addScaledVector(back.normalize(), 3 * dt);
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt); if (e.laserMesh) { scene.remove(e.laserMesh); e.laserMesh = null; e.laserA = null; } e.state = e.state === 'stunned' ? 'stunned' : 'idle'; e.invuln = e.key === 'queen' && e.state === 'burrow';
    return finishBoss(e);
  }
  const toP = tmpV.copy(P.pos).sub(e.pos).setY(0), dist = toP.length(); toP.normalize();
  if (e.phase === 1 && e.hp / e.maxHp < 0.4) {
    e.phase = 2; fx('banner', { text: `${e.def.name}이(가) 분노했다`, dur: 2 });
    if (e.key === 'thorn') for (const k of e.model.userData.knots) { k.visible = true; k.userData.outline.visible = true; }
    if (e.key === 'turtleking') for (const c of e.model.userData.crystals) c.material.emissive.setHex(0x40d8f0);
  }
  if (e.stunT > 0) { e.stunT -= dt; e.model.rotation.z = Math.sin(e.t * 10) * 0.05; if (e.stunT <= 0) { e.state = 'idle'; e.model.rotation.z = 0; } return finishBoss(e); }
  if (!enemyCanAct(e)) return finishBoss(e);
  const K = e.key;
  if (K === 'thorn') {
    e.yaw = Math.atan2(toP.x, toP.z) * 0.15;
    if (e.pat <= 0) {
      const ch = ['roots', 'seeds']; if (e.hp / e.maxHp < 0.5 && e.minions < 10) ch.push('summon');
      const c = pick(ch); e.pat = bpt(e, 2.4);
      if (c === 'roots') { const targets = G.actors.filter(a => alive(a) && d2(a.pos, e.center) < 24); for (const a of targets) for (let i = 0; i < 2; i++) groundStrike(i === 0 ? a.pos.clone() : a.pos.clone().add(V3(rnd(-4, 4), 0, rnd(-4, 4))), 1.6, 1.0, 25, 'spike'); }
      if (c === 'seeds') { const from = e.pos.clone().setY(3.5), base = Math.atan2(toP.x, toP.z); for (let i = -3; i <= 3; i++) { const a = base + i * 0.13; const v = V3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(10); v.y = (1.0 - 3.5) / (dist / 10 + 0.01); enemyProj(from, v, 10, 0x8a6a3a, null, 0.22); } }
      if (c === 'summon') { for (let i = 0; i < 4; i++) hooks.summon('mushroom', e.pos.clone().add(V3(rnd(-5, 5), 0, rnd(3, 7)))); e.minions += 4; }
    }
  } else if (K === 'queen') {
    if (e.state === 'burrow') {
      e.bt -= dt; e.modelY = -3.5 * clamp(1 - e.bt / 0.6, 0, 1);
      if (e.bt <= 0 && !e.tele) { e.tele = true; const p = P.pos.clone(); e.hidden = true; groundStrike(p, 2.5, 1.2, 30, 'emerge', () => { e.pos.copy(p); e.state = 'idle'; e.invuln = false; e.tele = false; e.hidden = false; e.modelY = 0; }); }
      return finishBoss(e);
    }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 7) e.pos.addScaledVector(toP, 1.5 * dt); else if (dist < 4) e.pos.addScaledVector(toP, -1.5 * dt);
    if (e.pat <= 0) {
      const c = pick(['spore', 'spore', 'summon', 'burrow']); e.pat = bpt(e, 3);
      if (c === 'spore') { const p = P.pos.clone(), id = nextId(); fx('t+', { id, k: 'c', p: P3(p), r: 3, c: 0x9ad04a, dur: 0.8 }); G.teles.push({ id, t: 0, total: 0.8, onDone: () => addZone(p, 3, 5, 'spore', { dps: 5, side: 'enemy', blur: true }) }); }
      if (c === 'summon' && G.enemies.length < 40) for (let i = 0; i < 6; i++) hooks.summon('mushroom', e.pos.clone().add(V3(rnd(-4, 4), 0, rnd(-4, 4))));
      if (c === 'burrow') { e.state = 'burrow'; e.bt = 0.6; e.invuln = true; e.tele = false; }
    }
  } else if (K === 'gate') {
    if (e.state === 'charge') {
      e.pos.addScaledVector(e.cdir, 18 * dt);
      for (const a of G.actors) if (alive(a) && !e.chit.has(a) && d2(e.pos, a.pos) < e.r + 0.8) { e.chit.add(a); takeDamage(a, 25, { src: e, melee: true }); }
      const hitWall = d2(e.pos, e.center) > 18 || G.obstacles.some(o => d2(o, e.pos) < o.r + e.r);
      e.ct -= dt;
      if (hitWall || e.ct <= 0) { e.state = 'stunned'; e.stunT = hitWall ? 2.5 : 0.8; shake(0.4); if (hitWall) fx('banner', { text: '수문장이 기절했다 — 등을 노려라', dur: 1.5 }); }
      return finishBoss(e);
    }
    if (e.state === 'windup') { e.wt -= dt; if (e.wt <= 0) { fx('t-', { id: e.lineId }); e.state = 'charge'; e.chit = new Set(); e.ct = 2.2; } return finishBoss(e); }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 4) e.pos.addScaledVector(toP, 2.2 * dt);
    if (e.pat <= 0) {
      e.pat = bpt(e, 3.2);
      if (Math.random() < 0.55) { e.state = 'windup'; e.wt = 1.0; e.cdir = toP.clone(); e.lineId = nextId(); fx('t+', { id: e.lineId, k: 'l', p: P3(e.pos), len: 40, w: e.r * 2, rot: Math.atan2(toP.x, toP.z), dur: 1 }); }
      else { const c = e.pos.clone(); G.teles.push({ id: null, t: 0, total: 0.8, onDone: () => shockwave(c, 14, 1.2, 20) }); e.modelY = 0.6; }
    }
  } else if (K === 'turtleking') {
    if (e.state === 'spin') {
      e.pos.addScaledVector(e.cdir, 16 * dt); e.spinY = (e.spinY || 0) + dt * 18;
      for (const a of G.actors) if (alive(a) && !e.chit.has(a) && d2(e.pos, a.pos) < e.r + 0.7) { e.chit.add(a); takeDamage(a, 30, { src: e, melee: true }); }
      e.ct -= dt;
      if (d2(e.pos, e.center) > 17 || e.ct <= 0) { e.state = 'idle'; e.invuln = false; shake(0.4); }
      return finishBoss(e);
    }
    if (e.state === 'windup') { e.wt -= dt; if (e.wt <= 0) { fx('t-', { id: e.lineId }); e.state = 'spin'; e.invuln = true; e.chit = new Set(); e.ct = 2.4; } return finishBoss(e); }
    if (e.state === 'laser') {
      e.laserA += dt * (Math.PI * 2 / 4) * (e.phase === 2 ? 1.3 : 1); e.lt -= dt;
      for (const a of G.actors) {
        if (!alive(a)) continue; const dd = d2(a.pos, e.pos), ang = Math.atan2(a.pos.x - e.pos.x, a.pos.z - e.pos.z), diff = Math.atan2(Math.sin(ang - e.laserA), Math.cos(ang - e.laserA));
        if (Math.abs(diff) < Math.atan2(0.6, Math.max(dd, 1)) && dd < 20 && a.pos.y < 0.55 && !(a.laserHit > G.time)) { takeDamage(a, 20, { src: e }); a.laserHit = G.time + 0.6; }
      }
      if (e.lt <= 0) { e.laserA = null; e.state = 'idle'; }
      return finishBoss(e);
    }
    e.yaw = Math.atan2(toP.x, toP.z);
    if (dist > 6) e.pos.addScaledVector(toP, 1.4 * dt);
    if (e.pat <= 0) {
      const c = pick(['laser', 'spin', 'shards']); e.pat = bpt(e, 3.4);
      if (c === 'laser') { e.state = 'laser'; e.lt = 4; e.laserA = e.yaw + Math.PI; fx('banner', { text: '광선! 점프로 넘어라', dur: 1.2 }); }
      if (c === 'spin') { e.state = 'windup'; e.wt = 0.8; e.cdir = toP.clone(); e.lineId = nextId(); fx('t+', { id: e.lineId, k: 'l', p: P3(e.pos), len: 40, w: e.r * 2, rot: Math.atan2(toP.x, toP.z), dur: 0.8 }); }
      if (c === 'shards') for (const a of G.actors.filter(x => alive(x) && d2(x.pos, e.center) < 24)) for (let i = 0; i < 3; i++) groundStrike(a.pos.clone().add(V3(rnd(-4, 4), 0, rnd(-4, 4))), 1.8, 1.2, 15, 'shard');
    }
  }
  finishBoss(e);
}
function finishBoss(e) {
  pushOut(e.pos, e.r);
  if (e.modelY > 0 && e.state !== 'burrow') e.modelY = Math.max(0, e.modelY - 0.05);
  bossVisual(e);
}
export function bossVisual(e) {
  const m = e.model;
  m.position.set(e.pos.x, e.modelY || 0, e.pos.z); m.visible = !e.hidden;
  m.rotation.y = e.state === 'spin' ? (e.spinY || 0) : e.yaw;
  if (e.laserA != null) {
    if (!e.laserMesh) { const geo = new THREE.BoxGeometry(0.35, 0.35, 20); geo.translate(0, 0, 10); e.laserMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9ff0ff })); scene.add(e.laserMesh); }
    e.laserMesh.position.set(e.pos.x, 0.45, e.pos.z); e.laserMesh.rotation.y = e.laserA;
  } else if (e.laserMesh) { scene.remove(e.laserMesh); e.laserMesh = null; }
  if (e.flash > 0) A.flash(m, true); else A.flash(m, false);
}

// ================= 기믹 =================
export function hitProp(p, by) {
  if (!isHost()) return;
  if (p.kind === 'boom' && p.active && !(p.fuse > 0)) { p.fuse = 0.6; fx('sfx', { k: 'pop', p: P3(p.pos) }); }
  if (p.kind === 'crystal' && p.cd <= 0) {
    p.cd = 6; fx('sfx', { k: 'zap', p: P3(p.pos) });
    const from = p.pos.clone().setY(2.2), hit = [];
    for (const e of [...G.enemies].sort((a, b) => d2(a.pos, p.pos) - d2(b.pos, p.pos))) { if (hit.length >= 5 || d2(e.pos, p.pos) > 12) break; hit.push(e); }
    for (const e of hit) { beamFx(from, e.pos.clone().setY(1), 0xbfe0ff, 0.25, 0.1); e.st.stun = Math.max(e.st.stun || 0, 0.6); hitEnemy(e, 40 * (1 + 0.3 * (p.tier || 1)), { by, raw: true, noCrit: true }); }
  }
}
export function updateProps(dt) {
  for (const p of G.props) {
    if (p.cd > 0) p.cd -= dt;
    if (p.kind === 'boom') {
      if (p.fuse > 0) { p.fuse -= dt; if (p.fuse <= 0) { p.active = false; p.respawn = 30; explode(p.pos, 4.5, 60, { raw: true, color: 0xff8a3a, noCrit: true }); shake(0.4); fx('sfx', { k: 'boom', p: P3(p.pos) }); } }
      if (!p.active) { p.respawn -= dt; if (p.respawn <= 0) p.active = true; }
    }
    if (p.kind === 'spring') {
      let used = false;
      for (const a of G.actors) if (alive(a) && p.charge > 0 && d2(a.pos, p.pos) < p.r && a.hp < a.S.hpMax) { heal(a, a.S.hpMax * 0.06 * dt); used = true; }
      p.charge = clamp(p.charge + (used ? -0.07 : 0.015) * dt, 0, 1);
    }
  }
}

// ================= 투사체·영역 =================
export function fireProj(o) {
  const id = nextId();
  fx('p+', { id, ty: o.ty || 'orb', p: P3(o.pos), v: P3(o.vel), g: o.grav || 0, s: o.size, c: o.color, l: o.life || 2.5 });
  G.projectiles.push({ id, pos: o.pos.clone(), vel: o.vel.clone(), r: o.r || 0.25, life: o.life || 2.5, pierce: o.pierce || 0, hits: new Set(), grav: o.grav || 0, by: o.by, onHit: o.onHit, onEnd: o.onEnd, explodeGround: o.explodeGround });
}
const hittableProps = () => G.props.filter(p => (p.kind === 'boom' && p.active) || p.kind === 'crystal');
export function updateProjectiles(dt, wdt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.life -= dt; p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt);
    let dead = p.life <= 0;
    if (p.pos.y <= 0.05) { dead = true; if (p.explodeGround) p.onEnd?.(p.pos.clone()); }
    for (const o of G.obstacles) if (d2(p.pos, o) < o.r + p.r * 0.5 && p.pos.y < o.h) { dead = true; p.onEnd?.(p.pos.clone()); break; }
    if (!dead) for (const pr of hittableProps()) if (d2(p.pos, pr.pos) < pr.r + p.r && p.pos.y < pr.h) { hitProp(pr, p.by); dead = true; p.onEnd?.(p.pos.clone()); break; }
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
    const vis = G.vfx.proj.get(p.id); if (vis) { vis.mesh.position.copy(p.pos); vis.mesh.lookAt(tmpV.copy(p.pos).add(p.vel)); }
    if (dead) { fx('p-', { id: p.id }); G.projectiles.splice(i, 1); }
  }
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const p = G.eprojs[i]; p.life -= wdt; p.pos.addScaledVector(p.vel, wdt);
    let dead = p.life <= 0 || p.pos.y < 0;
    for (const o of G.obstacles) if (d2(p.pos, o) < o.r && p.pos.y < o.h) dead = true;
    if (!dead) for (const a of G.actors) { if (!alive(a)) continue; if (p.pos.distanceTo(tmpV.copy(a.pos).setY(a.pos.y + 1.0)) < p.r + 0.5) { takeDamage(a, p.dmg, { src: p.src && !p.src.dead ? p.src : null, pos: p.pos }); dead = true; break; } }
    const vis = G.vfx.proj.get(p.id); if (vis) vis.mesh.position.copy(p.pos);
    if (dead) { fx('p-', { id: p.id }); G.eprojs.splice(i, 1); }
  }
}
export function explode(pos, r, dmg, o = {}) {
  ringFx(pos, r, o.color || 0xff8a3a); burst(pos, o.color || 0xff8a3a, 10, 0.5);
  if (o.enemySide) { for (const a of G.actors) if (alive(a) && d2(pos, a.pos) < r) takeDamage(a, o.dmg, { pos }); return; }
  for (const e of [...G.enemies]) if (d2(pos, e.pos) < r + e.r && e !== o.skip) hitEnemy(e, dmg, { by: o.by, kind: 'aoe', raw: o.raw, fire: o.fire, point: e.boss ? pos.clone().setY(1) : null, noCrit: o.noCrit });
  for (const p of hittableProps()) if (p.kind === 'boom' && d2(pos, p.pos) < r) hitProp(p, o.by);
}
export function addZone(pos, r, dur, kind, o = {}) {
  const id = nextId(); fx('z+', { id, k: kind, p: P3(pos), r, f: o.follow ? o.follow.id : null });
  const z = { id, pos: pos.clone(), r, t: dur, kind, acc: 0, ...o }; G.zones.push(z); return z;
}
export function updateZones(dt, wdt) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i]; z.t -= z.side === 'enemy' ? wdt : dt; z.acc += dt;
    if (z.follow) z.pos.copy(z.follow.pos);
    const tick = z.acc >= 0.5; if (tick) z.acc = 0;
    if (z.side === 'enemy') { for (const a of G.actors) if (alive(a) && d2(z.pos, a.pos) < z.r && tick && z.dps) takeDamage(a, z.dps * 0.5, { pos: z.pos }); }
    else {
      for (const e of [...G.enemies]) {
        if (d2(z.pos, e.pos) > z.r + e.r) continue;
        if (z.kind === 'ice') e.st.slow = { v: cvA(z.by, 'm_cold') || 0.5, t: 0.6 };
        if (z.kind === 'trap' && !z.used && !e.boss) { e.st.root = z.root; z.used = true; z.t = 0; }
        if (tick && z.dps) hitEnemy(e, z.dps * 0.5, { by: z.by, raw: z.raw, noCrit: true, kind: 'aoe' });
      }
      if (z.kind === 'sanct' && tick) for (const a of G.actors) if (alive(a) && d2(z.pos, a.pos) < z.r) heal(a, 8 * 0.5);
    }
    if (z.t <= 0) { fx('z-', { id: z.id }); G.zones.splice(i, 1); }
  }
}
export function updateTeles(wdt) {
  for (let i = G.teles.length - 1; i >= 0; i--) { const t = G.teles[i]; t.t += wdt; if (t.t >= t.total) { if (t.id) fx('t-', { id: t.id }); G.teles.splice(i, 1); t.onDone(); } }
}
export function nearestEnemy(pos, maxD, excl) { let b = null, bd = maxD; for (const e of G.enemies) { if (excl && excl.has(e)) continue; const dd = d2(e.pos, pos); if (dd < bd && e.state !== 'hidden') { bd = dd; b = e; } } return b; }

// ================= 플레이어 행동 =================
// mode: 'full' = 이 기기에서 움직이고 효과도 계산, 'remote' = 방장이 참가자의 효과만 계산, 'client' = 참가자 기기에서 내 움직임만
export function updateActor(a, dt, mode) {
  const move = mode !== 'remote', eff = mode !== 'client', I = a.input, S = a.S;
  for (const k in a.cd) a.cd[k] = Math.max(0, a.cd[k] - dt);
  for (const k in a.buff) a.buff[k] = Math.max(0, a.buff[k] - dt);
  a.invuln = Math.max(0, a.invuln - dt); a.escapeCd = Math.max(0, a.escapeCd - dt); a.shellCd = Math.max(0, a.shellCd - dt); a.padT = Math.max(0, a.padT - dt);
  a.swingAnim = Math.max(0, a.swingAnim - dt * 4); a.castAnim = Math.max(0, a.castAnim - dt * 5); a.healGlow = Math.max(0, a.healGlow - dt);
  if (a.state !== 'ok') { a.charging = a.drawing = false; if (move) { a.vy -= 18 * dt; a.pos.y = Math.max(0, a.pos.y + a.vy * dt); } return; }
  if (eff) {
    if (S.regen > 0) heal(a, S.hpMax * S.regen * dt);
    if (a.buff.med > 0) heal(a, S.hpMax * 0.01 * dt);
  }
  if (a.cls === 'cleric') a.mana = Math.min(100, a.mana + 6 * (1 + cvA(a, 'c_grace')) * dt);
  if (a.choosing) { I.lmb = I.rmb = I.q = false; I.mx = I.my = 0; }
  // 이동
  if (move) {
    let mv;
    if (a.wish) mv = a.wish.clone(); else { mv = V3(I.mx, 0, -I.my); if (mv.lengthSq() > 1) mv.normalize(); mv.applyAxisAngle(V3(0, 1, 0), a.yaw); }
    let speed = D.CLASSES[a.cls].speed * S.move * (a.buff.gale > 0 ? 1.3 : 1);
    if (a.cls === 'warrior' && I.rmb) speed *= cvA(a, 'w_wall') || 0.5;
    if (a.cls === 'archer' && I.rmb) speed *= 0.5;
    if (inZone(a.pos, 'sanct')) speed *= 1 + cvA(a, 'c_haste');
    if (inThorn(a.pos) && a.onGround) speed *= 0.6;
    const gliding = a.kind === 'local' && !a.onGround && a.vy < 0 && G.input.jumpHeld;
    if (gliding) speed *= 1.5;
    if (a.dashT > 0) { a.pos.addScaledVector(a.dashDir, 6 / 0.18 * dt); }
    else a.pos.addScaledVector(mv, speed * dt);
    if (I.jumpT && a.onGround) { a.vy = 6.5; a.onGround = false; }
    a.vy -= 18 * dt; if (gliding) a.vy = Math.max(a.vy, -2.2);
    a.pos.y += a.vy * dt;
    if (a.pos.y <= 0) { a.pos.y = 0; a.vy = 0; a.onGround = true; }
    for (const p of G.props) if (p.kind === 'pad' && a.padT <= 0 && a.pos.y < 0.5 && d2(p.pos, a.pos) < p.r) { a.vy = 17; a.onGround = false; a.padT = 1; if (a.kind === 'local') sfx('jump'); }
    a.wishDir = mv;
  }
  // 대시
  if (a.dashT > 0) {
    a.dashT -= dt;
    if (eff) {
      if (hasA(a, 'kL_wind')) for (const e of G.enemies) if (!a.windHit.has(e) && d2(e.pos, a.pos) < e.r + 0.8) { a.windHit.add(e); hitEnemy(e, 30, { by: a, raw: true }); }
      if (a.bashing) for (const e of G.enemies) if (!a.windHit.has(e) && d2(e.pos, a.pos) < e.r + 1.0) { a.windHit.add(e); hitEnemy(e, cvA(a, 'w_bash'), { by: a, kind: 'melee' }); }
    }
    if (a.dashT <= 0) { a.bashing = false; if (eff && a.uniq.has('u_cloak')) a.invuln = Math.max(a.invuln, 1); }
  }
  if (I.dashT && a.dashT <= 0 && (a.cd.dash <= 0 || (S.dashMax > 1 && a.dashCharges > 0))) {
    if (eff && hasA(a, 'a_trap')) addZone(a.pos, 1.0, 8, 'trap', { side: 'player', root: cvA(a, 'a_trap'), by: a });
    const mv = a.wishDir && a.wishDir.lengthSq() > 0.01 ? a.wishDir.clone().normalize() : fwdOf(a);
    a.dashDir.copy(mv); a.dashT = 0.18; a.windHit = new Set();
    if (S.dashMax > 1) { a.dashCharges--; if (a.dashCharges <= 0) a.cd.dash = S.dashCd; } else a.cd.dash = S.dashCd;
    if (hasA(a, 'a_reflex')) a.reflex = true; if (hasA(a, 'k_react')) a.buff.react = 1.0; if (tr(a, 'agi', 1)) a.buff.gale = 1;
  }
  if (a.cd.dash <= 0 && a.dashCharges < S.dashMax) a.dashCharges = S.dashMax;
  if (move) {
    pushOut(a.pos, 0.4);
    for (const b of G.enemies) if (b.boss && !b.hidden) { const dd = d2(b.pos, a.pos), m = b.r + 0.4; if (dd < m) { tmpV.copy(a.pos).sub(b.pos).setY(0).normalize().multiplyScalar(m - dd); a.pos.add(tmpV); } }
  }
  ({ warrior: updWarrior, cleric: updCleric, mage: updMage, archer: updArcher })[a.cls](a, dt, move, eff);
  if (I.q && a.cd.q <= 0) useQ(a, eff);
  // 쓰러진 동료 살리기 (방장 계산)
  if (eff) for (const o of G.actors) if (o.state === 'down' && d2(o.pos, a.pos) < 2.5) { o.reviveP += dt; if (o.reviveP >= 3) { o.state = 'ok'; o.hp = o.S.hpMax * 0.35; o.invuln = 2; fx('banner', { text: `${o.name} 부활!`, dur: 1.2 }); } }
  I.dashT = I.jumpT = false;
}
function updWarrior(a, dt, move, eff) {
  const I = a.input;
  const was = a.blocking; a.blocking = I.rmb;
  if (eff && was && !a.blocking && hasA(a, 'wL_giant') && a.giant > 0) {
    const f = fwdOf(a); for (const e of [...G.enemies]) { const to = tmpV.copy(e.pos).sub(a.pos).setY(0); if (to.length() < 6 + e.r && to.normalize().dot(f) > 0.5) hitEnemy(e, a.giant * 2, { by: a, raw: true }); }
    ringFx(a.pos.clone().addScaledVector(f, 2), 3, 0xffd58a); a.giant = 0;
  }
  if (I.lmb && a.blocking && hasA(a, 'w_bash') && a.cd.bash <= 0 && a.dashT <= 0) { a.cd.bash = 1; a.dashDir.copy(fwdOf(a)); a.dashT = 0.12; a.bashing = true; a.windHit = new Set(); return; }
  if (I.lmb && !a.blocking && a.cd.lmb <= 0) {
    a.combo = G.time - a.lastSwing < 1.2 ? a.combo + 1 : 1; a.lastSwing = G.time;
    const spin = hasA(a, 'w_spin') && a.combo % 3 === 0;
    a.cd.lmb = 0.6 / (1 + (a.buff.rage > 0 ? cvA(a, 'w_rage') : 0)); a.swingAnim = spin ? 1.5 : 1;
    if (!eff) return;
    const arc = (spin ? 360 : (cvA(a, 'w_wide') || 90)) * Math.PI / 180;
    let dmg = 22 * (1 + cvA(a, 'w_sharp')) * (spin ? cvA(a, 'w_spin') : 1);
    if (a.buff.riposte > 0) { dmg *= 1 + cvA(a, 'w_riposte'); a.buff.riposte = 0; }
    const f = fwdOf(a); let any = false;
    for (const e of [...G.enemies]) {
      const to = tmpV.copy(e.pos).sub(a.pos).setY(0), dist = to.length();
      if (dist > 2.5 + e.r) continue;
      if (to.normalize().angleTo(f) > arc / 2 && dist > e.r + 0.3) continue;
      hitEnemy(e, dmg, { by: a, kind: 'melee', point: e.boss ? eyeOf(a).addScaledVector(dirOf(a), Math.max(0.5, dist - e.r * 0.3)) : null }); any = true;
    }
    for (const p of hittableProps()) if (d2(p.pos, a.pos) < 2.5 + p.r) hitProp(p, a);
    if (hasA(a, 'wL_wave')) fireProj({ by: a, pos: eyeOf(a).add(V3(0, -0.4, 0)), vel: f.clone().multiplyScalar(24), color: 0xe8f4ff, size: 0.3, r: 0.8, life: 8 / 24, pierce: 99, onHit: (e, pt) => hitEnemy(e, dmg * 0.6, { by: a, point: pt }) });
    if (any) fx('sfx', { k: 'hit', p: P3(a.pos) });
  }
}
function healTargetOf(a) {
  if (a.bot) return a.bot.healTarget || a;
  // 조준한 아군이 있으면 그 아군, 없으면 자신
  const o = eyeOf(a), d = dirOf(a); let best = null, ba = 0.12;
  for (const x of G.actors) { if (x === a || !alive(x)) continue; const to = x.pos.clone().setY(x.pos.y + 1).sub(o); if (to.length() > 15) continue; const ang = to.normalize().angleTo(d); if (ang < ba) { ba = ang; best = x; } }
  return best || a;
}
function updCleric(a, dt, move, eff) {
  const I = a.input;
  if (I.lmb && a.cd.lmb <= 0) {
    a.cd.lmb = 0.5 * (1 - cvA(a, 'c_swift')); a.castAnim = 1; a.bolts++;
    if (!eff) return;
    fx('sfx', { k: 'shoot', p: P3(a.pos) });
    const from = muzzle(a, 0.12, -0.07);
    if (hasA(a, 'cL_sun') && a.bolts % 5 === 0) {
      const o = eyeOf(a), d = dirOf(a), end = o.clone().addScaledVector(d, 30);
      beamFx(from, end, 0xfff3a0, 0.3, 0.35);
      for (const e of [...G.enemies]) { const c = tmpV.copy(e.pos).setY(e.h * 0.5); const t = clamp(tmpV2.copy(c).sub(o).dot(d), 0, 30); if (o.clone().addScaledVector(d, t).distanceTo(c) < e.r + 0.8) hitEnemy(e, 80, { by: a, point: o.clone().addScaledVector(d, t) }); }
    } else {
      const n = 1 + cvA(a, 'c_multi');
      for (let i = 0; i < n; i++) fireProj({ by: a, pos: from, vel: aimed(a, from, 22, (i - (n - 1) / 2) * 0.12), color: 0xfff3a0, size: 0.13, pierce: cvA(a, 'c_pierce'),
        onHit: (e, pt, head, v) => { hitEnemy(e, 14 * (1 + cvA(a, 'c_pure')), { by: a, point: pt, dir: v }); if (hasA(a, 'c_mark')) e.st.mark = { v: cvA(a, 'c_mark'), t: 3 }; if (a.uniq.has('u_life')) heal(a, 2); } });
    }
  }
  if (I.rmb && a.cd.rmb <= 0) {
    if (!eff) { a.cd.rmb = a.rmbMax = 0.4 * a.S.cdAll; a.healGlow = 0.6; a.castAnim = 1; return; }
    const cost = cvA(a, 'c_thrift') || 25, tgt = healTargetOf(a);
    if (a.mana >= cost && tgt.hp < tgt.S.hpMax) {
      a.mana -= cost; a.cd.rmb = a.rmbMax = 0.4 * a.S.cdAll; a.castAnim = 1; a.healGlow = 0.6;
      if (!eff) return;
      const amt = 30 * (1 + cvA(a, 'c_deep')); heal(tgt, amt); fx('sfx', { k: 'cast', p: P3(a.pos) }); ringFx(tgt.pos, 1.5, 0xfff3a0);
      if (tgt !== a) beamFx(muzzle(a, 0.12, -0.07), tgt.pos.clone().setY(tgt.pos.y + 1), 0xfff3a0, 0.25, 0.06);
      if (hasA(a, 'c_judg')) for (const e of [...G.enemies]) if (d2(e.pos, tgt.pos) < 4 + e.r) hitEnemy(e, amt * cvA(a, 'c_judg'), { by: a, raw: true });
      if (hasA(a, 'c_armor')) tgt.buff.carmor = 3;
    } else if (a.mana < cost) { a.cd.rmb = 0.3; if (eff) fx('toast', { to: a.id, text: '마나 부족' }); }
  }
}
function updMage(a, dt, move, eff) {
  const I = a.input;
  const full = 1 * (1 - cvA(a, 'm_fast')), meteorAt = 2 * (1 - cvA(a, 'm_fast'));
  if (I.lmb) { if (!a.charging) { a.charging = true; a.charge = 0; } a.charge += dt; }
  else if (a.charging) {
    a.charging = false;
    const c = a.charge; a.charge = 0;
    if (hasA(a, 'mL_meteor') && c >= meteorAt) { a.castAnim = 1.5; if (eff) { const p = groundAim(a, 30), id = nextId(); fx('t+', { id, k: 'c', p: P3(p), r: 5, c: 0xff7a3a, dur: 0.6 }); fx('sfx', { k: 'cast' }); G.teles.push({ id, t: 0, total: 0.6, onDone: () => { explode(p, 5, 120, { by: a, color: 0xff5a2a, fire: true }); shake(0.5); } }); } }
    else if (c >= full) { a.castAnim = 1.5; if (eff) castFireball(a); }
    else if (a.cd.lmb <= 0) { a.cd.lmb = 0.35 * (1 - cvA(a, 'm_rapid')); a.castAnim = 1; if (eff) castBolt(a); }
  }
  if (I.rmb && a.cd.rmb <= 0) {
    a.cd.rmb = a.rmbMax = Math.max(1, 5 - cvA(a, 'm_blink')) * a.S.cdAll;
    if (eff) { burst(a.pos, 0x8a6bd1, 10, 1); fx('sfx', { k: 'cast', p: P3(a.pos) }); if (hasA(a, 'm_ice')) a.buff.mice = 2; }
    if (move) { const f = fwdOf(a); for (let i = 0; i < 12; i++) { const nx = a.pos.clone().addScaledVector(f, 0.5); if (G.obstacles.some(o => d2(nx, o) < o.r + 0.4)) break; a.pos.copy(nx); } pushOut(a.pos, 0.4); }
  }
  if (eff && hasA(a, 'mL_storm')) { a.stormT -= dt; if (a.stormT <= 0) { a.stormT = 1; const t = nearestEnemy(a.pos, 6); if (t) { beamFx(muzzle(a, 0.12, -0.07), t.pos.clone().setY(t.h * 0.6), 0xbfe0ff, 0.12); hitEnemy(t, 12 * (1 + cvA(a, 'm_over')) * 0.5, { by: a, noCrit: true }); } } }
}
function castBolt(a) {
  a.bolts++; fx('sfx', { k: 'shoot', p: P3(a.pos) });
  const dmg = 12 * (1 + cvA(a, 'm_over')), from = muzzle(a, 0.12, -0.07);
  fireProj({ by: a, pos: from, vel: aimed(a, from, 26), color: 0xbfa8ff, size: 0.12,
    onHit: (e, pt, head, v) => {
      hitEnemy(e, dmg, { by: a, point: pt, dir: v });
      if (Math.random() < cvA(a, 'm_shock')) e.st.stun = Math.max(e.st.stun || 0, 1);
      let src = e; const hit = new Set([e]);
      for (let k = 0; k < cvA(a, 'm_arc'); k++) { const n = nearestEnemy(src.pos, 6, hit); if (!n) break; hit.add(n); beamFx(src.pos.clone().setY(1), n.pos.clone().setY(1), 0xbfe0ff, 0.12); hitEnemy(n, dmg * 0.5, { by: a, noCrit: true }); src = n; }
    } });
  if (hasA(a, 'm_static')) { a.statics++; if (a.statics % 3 === 0) explode(a.pos, 3, cvA(a, 'm_static'), { by: a, raw: true, color: 0xbfe0ff, noCrit: true }); }
}
function castFireball(a) {
  fx('sfx', { k: 'cast', p: P3(a.pos) });
  const dmg = 45 * (1 + cvA(a, 'm_focus')), rad = 3 * (1 + cvA(a, 'm_big')), from = muzzle(a, 0.12, -0.07);
  const boom = (pt, direct) => {
    explode(pt, rad, dmg * 0.5, { by: a, color: 0xff7a3a, fire: true, skip: direct });
    if (hasA(a, 'm_burn')) for (const e of G.enemies) if (d2(e.pos, pt) < rad + e.r) e.st.burn = { dps: cvA(a, 'm_burn'), t: 3, by: a };
    if (a.uniq.has('u_phoenix')) for (let i = 0; i < 3; i++) { const ang = i / 3 * 6.28; fireProj({ by: a, pos: pt.clone().setY(1), vel: V3(Math.cos(ang) * 8, 3, Math.sin(ang) * 8), grav: 12, color: 0xffa040, size: 0.15, explodeGround: true, onHit: (e2, p2) => explode(p2, 1.5, 15, { by: a, fire: true }), onEnd: p2 => explode(p2, 1.5, 15, { by: a, fire: true }) }); }
  };
  fireProj({ by: a, pos: from, vel: aimed(a, from, 18), color: 0xff8a3a, size: 0.28, r: 0.35, explodeGround: true,
    onHit: (e, pt, head, v) => { hitEnemy(e, dmg * 0.5, { by: a, point: pt, dir: v, fire: true }); boom(pt, e); }, onEnd: pt => boom(pt) });
}
function updArcher(a, dt, move, eff) {
  const I = a.input, full = 1.2 * (1 - cvA(a, 'a_hand'));
  if (I.lmb && a.cd.lmb <= 0) { if (!a.drawing) { a.drawing = true; a.draw = 0; } a.draw = Math.min(full, a.draw + dt); }
  else if (a.drawing) {
    a.drawing = false; const frac = a.draw / full, isFull = frac >= 0.999; a.draw = 0; a.cd.lmb = 0.15; a.castAnim = 1;
    if (!eff) return;
    let dmg = 10 + 30 * frac; if (isFull) dmg *= 1 + cvA(a, 'a_bow');
    if (a.reflex) { dmg *= 1 + cvA(a, 'a_reflex'); a.reflex = false; }
    const wind = isFull && a.uniq.has('u_windbow'), speed = (28 + 22 * frac) * (wind ? 2 : 1);
    const angles = hasA(a, 'aL_storm') ? [-0.16, -0.08, 0, 0.08, 0.16] : hasA(a, 'a_tri') ? [-0.08, 0, 0.08] : [0];
    const from = muzzle(a, -0.05, 0.05);
    for (const ang of angles) {
      const sd = ang !== 0 && !hasA(a, 'aL_storm') ? dmg * cvA(a, 'a_tri') : dmg;
      fireProj({ by: a, ty: 'arrow', pos: from, vel: aimed(a, from, speed, ang), grav: 4, r: 0.22, pierce: wind ? 99 : cvA(a, 'a_pierce'),
        onHit: (e, pt, head, v) => { hitEnemy(e, sd, { by: a, point: pt, head, dir: v }); if (isFull && hasA(a, 'a_blast')) explode(pt, cvA(a, 'a_blast'), sd * 0.5, { by: a, raw: true, color: 0xd9c08a, skip: e, noCrit: true }); },
        onEnd: pt => { if (isFull && hasA(a, 'a_blast')) explode(pt, cvA(a, 'a_blast'), sd * 0.5, { by: a, raw: true, color: 0xd9c08a, noCrit: true }); } });
    }
    fx('sfx', { k: 'shoot', p: P3(a.pos) });
  }
}
function useQ(a, eff) {
  a.cd.q = a.qMax = qCooldown(a); a.castAnim = 1.2;
  if (tr(a, 'spr', 1)) a.buff.med = 3;
  if (tr(a, 'spr', 2)) { a.cd.dash = 0; a.dashCharges = a.S.dashMax; }
  if (!eff) return;
  if (a.cls === 'warrior') {
    ringFx(a.pos, 8, 0xffd58a); shake(0.2, a.id); fx('sfx', { k: 'boss', p: P3(a.pos) });
    for (const e of G.enemies) if (d2(e.pos, a.pos) < 8 + e.r) { e.st.stun = Math.max(e.st.stun || 0, (e.boss ? 0.6 : 2) + cvA(a, 'w_roar')); e.taunt = { a, t: 4 }; e.target = a; if (hasA(a, 'w_intim')) e.st.intim = { v: cvA(a, 'w_intim'), t: 5 }; }
    a.buff.shout = 5; if (hasA(a, 'w_rage')) a.buff.rage = 6; if (hasA(a, 'wL_drum')) heal(a, a.S.hpMax * 0.15);
  } else if (a.cls === 'cleric') {
    addZone(a.pos, 5 + cvA(a, 'c_wide'), 6 + cvA(a, 'c_long'), 'sanct', { side: 'player', dps: cvA(a, 'c_holy'), raw: true, by: a, follow: hasA(a, 'cL_walk') ? a : null }); fx('sfx', { k: 'cast', p: P3(a.pos) });
  } else if (a.cls === 'mage') {
    ringFx(a.pos, 6, 0x9fe6ff); fx('sfx', { k: 'cast', p: P3(a.pos) });
    for (const e of [...G.enemies]) if (d2(e.pos, a.pos) < 6 + e.r) { if (hasA(a, 'mL_stop')) e.st.freeze = e.boss ? 1 : 3; else e.st.slow = { v: cvA(a, 'm_cold') || 0.5, t: 3 }; hitEnemy(e, 20 * (1 + cvA(a, 'm_shard')), { by: a, kind: 'aoe' }); }
    if (hasA(a, 'm_perma')) addZone(a.pos, 6, cvA(a, 'm_perma'), 'ice', { side: 'player', by: a });
  } else {
    addZone(groundAim(a, 25), 4 + cvA(a, 'a_wide'), 3 + cvA(a, 'a_long'), 'rain', { side: 'player', dps: 15, by: a }); fx('sfx', { k: 'shoot', p: P3(a.pos) });
  }
}
export function updateRain(dt) { // 화살비 연출 (모두)
  for (const v of G.vfx.zone.values()) if (v.k === 'rain' && Math.random() < 0.8) { const ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * v.r; G.parts.push({ mesh: (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), new THREE.MeshBasicMaterial({ color: 0xc89a5a })); m.position.set(v.p.x + Math.cos(ang) * rr, 6, v.p.z + Math.sin(ang) * rr); scene.add(m); return m; })(), vel: V3(0, -22, 0), life: 0.4 }); }
}

// ================= 봇 =================
export function botThink(a, dt) {
  const I = a.input, B = a.bot; I.mx = I.my = 0; a.wish = null; I.q = false;
  if (a.state !== 'ok') { I.lmb = I.rmb = false; return; }
  B.t -= dt;
  const leader = G.actors.find(x => x.kind !== 'bot' && x.state === 'ok') || G.actors.find(x => x.kind !== 'bot') || a;
  const goTo = (p, stop) => { const to = V3(p.x - a.pos.x, 0, p.z - a.pos.z), l = to.length(); if (l > stop) { a.wish = to.normalize(); if (l > 4 && a.cd.dash <= 0 && Math.random() < dt * 0.3) I.dashT = true; } return l; };
  const down = G.actors.find(x => x !== a && x.state === 'down' && d2(x.pos, a.pos) < 45);
  if (down) { I.lmb = I.rmb = false; goTo(down.pos, 1.2); a.yaw = Math.atan2(-(down.pos.x - a.pos.x), -(down.pos.z - a.pos.z)); return; }
  // 목표: 지도자 근처에서 동료를 노리는 적 우선
  let tgt = null, best = 1e9;
  for (const e of G.enemies) { if (e.state === 'hidden' || e.hidden) continue; const dl = d2(e.pos, leader.pos), da = d2(e.pos, a.pos); if (dl > 28 && da > 18) continue; const sc = da + (e.target && e.target.kind !== 'bot' ? -6 : 0) + (e.boss ? -4 : 0); if (sc < best) { best = sc; tgt = e; } }
  if (!tgt) {
    I.lmb = I.rmb = false; a.charging = false; a.drawing = false;
    const ang = leader.yaw + Math.PI + (B.slot - 1) * 0.9, spot = V3(leader.pos.x + Math.sin(ang) * 3.5, 0, leader.pos.z + Math.cos(ang) * 3.5);
    if (goTo(spot, 1.5) > 25 && leader !== a) { a.pos.copy(spot); } // 너무 멀어지면 따라 붙는다
    a.yaw = leader.yaw; a.pitch = 0;
    if (a.cls === 'cleric') botHeal(a);
    return;
  }
  const ty = (tgt.def?.type === 'flyer' ? tgt.vy : 0) + tgt.h * 0.55, eye = eyeOf(a), to = V3(tgt.pos.x - eye.x, ty - eye.y, tgt.pos.z - eye.z);
  a.yaw = Math.atan2(-to.x, -to.z) + rnd(-0.03, 0.03); a.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
  const dist = d2(tgt.pos, a.pos), keep = { warrior: 1.6 + tgt.r, cleric: 9, mage: 10, archer: 13 }[a.cls];
  const side = Math.sin(G.time * 0.7 + B.slot * 2) > 0 ? 1 : -1;
  if (dist > keep + 2.5) goTo(tgt.pos, keep);
  else if (dist < keep - 2.5 && a.cls !== 'warrior') a.wish = V3(a.pos.x - tgt.pos.x, 0, a.pos.z - tgt.pos.z).normalize();
  else if (a.cls !== 'warrior') a.wish = V3(-(tgt.pos.z - a.pos.z), 0, tgt.pos.x - a.pos.x).normalize().multiplyScalar(side * 0.6);
  const near = r => G.enemies.filter(e => d2(e.pos, a.pos) < r).length;
  const cluster = G.enemies.filter(e => d2(e.pos, tgt.pos) < 3.5).length;
  if (a.cls === 'warrior') {
    I.rmb = a.hp < a.S.hpMax * 0.35 && G.enemies.some(e => e.wind > 0 && d2(e.pos, a.pos) < 4);
    I.lmb = !I.rmb && dist < 2.6 + tgt.r;
    if (near(6) >= 2 && a.cd.q <= 0) I.q = true;
  } else if (a.cls === 'cleric') {
    I.lmb = dist < 24 && B.t <= 0 ? !I.lmb : I.lmb; if (B.t <= 0) B.t = 0.12;
    if (!botHeal(a)) I.rmb = false;
    if (a.cd.q <= 0 && (G.actors.filter(x => alive(x) && x.hp < x.S.hpMax * 0.6 && d2(x.pos, a.pos) < 6).length >= 2 || near(5) >= 3)) I.q = true;
  } else if (a.cls === 'mage') {
    const wantFire = cluster >= 3 || tgt.elite || tgt.boss;
    if (wantFire) { I.lmb = !(a.charging && a.charge >= 1.05 * (1 - cvA(a, 'm_fast'))); }
    else { I.lmb = B.t <= 0 ? !I.lmb && a.cd.lmb <= 0 : I.lmb; if (B.t <= 0) B.t = 0.1; }
    I.rmb = a.hp < a.S.hpMax * 0.4 && near(3) > 0 && a.cd.rmb <= 0;
    if (I.rmb) a.yaw += Math.PI;
    if (near(5) >= 2 && a.cd.q <= 0) I.q = true;
  } else {
    I.lmb = !(a.drawing && a.draw >= 1.2 * (1 - cvA(a, 'a_hand')) - 0.01) && dist < 40;
    if (cluster >= 3 && a.cd.q <= 0) I.q = true;
  }
}
function botHeal(a) {
  const hurt = G.actors.filter(x => alive(x) && x.hp < x.S.hpMax * 0.65 && d2(x.pos, a.pos) < 12).sort((x, y) => x.hp / x.S.hpMax - y.hp / y.S.hpMax)[0];
  if (hurt && a.mana >= (cvA(a, 'c_thrift') || 25) && a.cd.rmb <= 0) { a.bot.healTarget = hurt; a.input.rmb = true; return true; }
  a.input.rmb = false; return false;
}
export function botAutoStats(a) {
  const pref = D.BOT_STAT_PREF[a.cls], total = D.POINTS_PER_LEVEL * (a.lv - 1), keys = Object.entries(pref);
  const sum = keys.reduce((s, [, w]) => s + w, 0); a.pts = { atk: 0, vit: 0, agi: 0, crt: 0, spr: 0 };
  let left = total; for (const [k, w] of keys) { const n = Math.floor(total * w / sum); a.pts[k] = n; left -= n; } a.pts[keys[0][0]] += left;
}
