// 화면(DOM): 마을, 로비, 카드, 결과, HUD(미니맵·나침반·파티), 입력
import * as THREE from 'three';
import * as D from './data.js';
import { regionName } from './world.js';

let G, api, cam;
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pct = v => `${Math.round(v * 100)}%`;
const CLS_ICON = { warrior: '⚔', cleric: '✚', mage: '✦', archer: '➶' };
const emblem = (cls, size = '') => `<span class="emblem ${cls} ${size}">${CLS_ICON[cls]}</span>`;
const freePts = c => D.POINTS_PER_LEVEL * (c.lv - 1) - D.STAT_IDS.reduce((s, k) => s + (c.pts[k] || 0), 0);

// ================= 아이템 =================
export function itemHTML(it, extra = '') {
  if (!it) return '<div class="item empty">비어 있음</div>';
  const p = api.itemPower(it), lines = [];
  if (p.atk) lines.push(`피해 +${pct(p.atk)}`); if (p.hp) lines.push(`체력 +${p.hp}`);
  for (const a of it.aff) { const d = D.AFFIXES[a.k]; lines.push(`${d.name} ${d.f === 'neg' ? '−' : '+'}${(a.v * 100).toFixed(1)}%`); }
  const slotName = { weapon: `무기 · ${D.CLASSES[it.cls]?.name || ''}`, armor: '갑옷', trinket: '장신구' }[it.slot];
  return `<div class="item" style="--rc:${D.RARITY_COLORS[it.r]}"><div class="iname">${it.name}${it.enh ? ` <b>+${it.enh}</b>` : ''}</div>
    <div class="islot">${D.RARITY[it.r]} · ${slotName}</div><div class="istats">${lines.join('<br>')}</div>${it.u ? `<div class="iuniq">${D.UNIQUES[it.u].d}</div>` : ''}${extra}</div>`;
}

// ================= 마을 =================
let tab = 'expedition', smithSel = null, resetArm = false, joinCode = '';
export function showTown() {
  hideAll(); $('#town').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); render();
}
export function openJoin(code) { joinCode = code.toUpperCase(); tab = 'expedition'; render(); setTimeout(() => api.joinLobby(joinCode), 50); }
function render() {
  const s = G.save, box = $('#town-body');
  $('#town-mats').textContent = s.mats; $('#town-name').textContent = s.name;
  for (const b of document.querySelectorAll('#town-nav button')) b.classList.toggle('on', b.dataset.tab === tab);
  const cpts = freePts(s.classes[s.cls]); $('#nav-pts').textContent = cpts > 0 ? cpts : ''; $('#nav-pts').classList.toggle('hidden', cpts <= 0);
  box.innerHTML = '';
  ({ expedition: renderExpedition, character: renderCharacter, gear: renderGear, smith: renderSmith, settings: renderSettings })[tab](box, s);
}
function renderExpedition(box, s) {
  box.appendChild(el('h2', null, '직업 선택'));
  const grid = el('div', 'classgrid');
  for (const id of D.CLASS_IDS) {
    const c = D.CLASSES[id], sc = s.classes[id], need = D.xpForLevel(sc.lv), fp = freePts(sc);
    const card = el('button', 'classcard' + (s.cls === id ? ' on' : ''), `
      <div class="ctop">${emblem(id, 'big')}<div><div class="cname">${c.name}</div><div class="crole">${c.role}</div></div><div class="clv">Lv.${sc.lv}</div></div>
      <div class="bar xp"><i style="width:${sc.lv >= D.LEVEL_CAP ? 100 : Math.min(100, sc.xp / need * 100)}%"></i></div>
      <div class="cskills"><span><kbd>좌</kbd>${c.lmb}</span><span><kbd>우</kbd>${c.rmb}</span><span><kbd>Q</kbd>${c.q}</span></div>
      ${fp > 0 ? `<div class="cpts">능력치 ${fp}점 남음</div>` : ''}`);
    card.onclick = () => { s.cls = id; api.writeSave(); api.lobbyChanged(); render(); };
    grid.appendChild(card);
  }
  box.appendChild(grid);
  const row = el('div', 'modes');
  const solo = el('div', 'mode', `<h3>혼자 원정</h3><p>봇 동료가 빈자리를 채운다.</p>
    <label class="bots">봇 동료 <input type="range" min="0" max="3" step="1" value="${s.bots}" id="bots"><b>${s.bots}명</b></label>`);
  const go = el('button', 'primary big', '원정 출발'); go.onclick = () => api.startSolo(); solo.appendChild(go);
  const multi = el('div', 'mode', `<h3>친구와 함께</h3><p>방을 만들어 코드나 초대 링크를 보내면 최대 4명이 함께한다. 빈자리는 봇이 채운다.</p>`);
  const host = el('button', 'primary', '방 만들기'); host.onclick = () => api.hostLobby();
  const jr = el('div', 'joinrow', `<input id="joincode" maxlength="5" placeholder="방 코드" value="${joinCode}">`);
  const jb = el('button', null, '참가'); jb.onclick = () => { joinCode = $('#joincode').value; if (joinCode.trim().length >= 4) api.joinLobby(joinCode); }; jr.appendChild(jb);
  multi.append(host, jr, el('div', 'lobbystatus', ''));
  row.append(solo, multi); box.appendChild(row);
  $('#bots').oninput = e => { s.bots = +e.target.value; e.target.nextElementSibling.textContent = `${s.bots}명`; api.writeSave(); };
  const allKilled = D.FINAL_ORDER.every(b => s.killed[b]);
  const foot = el('div', 'tfoot');
  if (allKilled) { const sel = el('select', 'bosspick'); sel.innerHTML = `<option value="">최종 보스: 랜덤</option>` + D.FINAL_ORDER.map(b => `<option value="${b}" ${s.pickFinal === b ? 'selected' : ''}>최종 보스: ${D.BOSSES[b].name}</option>`).join(''); sel.onchange = () => { s.pickFinal = sel.value || null; api.writeSave(); }; foot.appendChild(sel); }
  else foot.appendChild(el('span', 'note', `최종 보스 ${D.FINAL_ORDER.filter(b => s.killed[b]).length}/${D.FINAL_ORDER.length} 처치 · 전부 잡으면 골라서 도전`));
  foot.appendChild(el('span', 'note', G.isTouch ? '왼쪽 엄지 이동 · 오른쪽 끌어 시점 · 공격 버튼을 누른 채 끌면 조준' : 'WASD 이동 · 좌클릭 공격 · 우클릭 보조 · Q 스킬 · Shift 대시 · Space 점프(공중에서 누르고 있으면 활공) · E 상호작용 · Tab 가방 · M 지도'));
  box.appendChild(foot);
}
function renderCharacter(box, s) {
  const cls = s.cls, c = s.classes[cls], fp = freePts(c);
  box.appendChild(el('h2', null, `${D.CLASSES[cls].name} 능력치`));
  box.appendChild(el('p', 'note', `레벨마다 ${D.POINTS_PER_LEVEL}점. 한 능력치에 10점, 20점을 모으면 특성이 열린다. 판 도중에도 Tab → 능력치에서 찍을 수 있다.`));
  box.appendChild(statPanel(c, () => render()));
  const r = el('button', 'small', `능력치 초기화 · 재료 ${D.RESPEC_COST}`); r.onclick = () => { if (s.mats < D.RESPEC_COST) return toast('재료가 부족하다'); s.mats -= D.RESPEC_COST; c.pts = { atk: 0, vit: 0, agi: 0, crt: 0, spr: 0 }; api.writeSave(); render(); };
  box.appendChild(r);
  void fp;
}
function statPanel(c, after) {
  const wrap = el('div', 'stats'), fp = freePts(c);
  wrap.appendChild(el('div', 'ptsleft', `남은 점수 <b>${fp}</b>`));
  for (const k of D.STAT_IDS) {
    const st = D.STATS[k], v = c.pts[k] || 0, tr = D.TRAITS[k];
    const row = el('div', 'statrow', `<div class="sname">${st.name}<small>${st.d}</small></div>
      <div class="sbar"><i style="width:${Math.min(100, v / 20 * 100)}%"></i><em style="left:50%"></em><em style="left:100%"></em></div><div class="sval">${v}</div>`);
    const b = el('button', 'plus', '+'); b.disabled = fp <= 0; b.onclick = () => { c.pts[k] = v + 1; api.writeSave(); api.applyPoints(); after(); };
    row.appendChild(b);
    row.appendChild(el('div', 'traits', tr.map((t, i) => `<span class="${v >= (i + 1) * 10 ? 'on' : ''}"><b>${(i + 1) * 10}</b> ${t.name} — ${t.d}</span>`).join('')));
    wrap.appendChild(row);
  }
  return wrap;
}
function renderGear(box, s) {
  const cls = s.cls, eq = s.classes[cls].equip;
  box.appendChild(el('h2', null, `${D.CLASSES[cls].name} 장비`));
  const slots = el('div', 'slots');
  for (const sl of ['weapon', 'armor', 'trinket']) {
    const w = el('div', 'slot'); w.innerHTML = `<div class="slabel">${{ weapon: '무기', armor: '갑옷', trinket: '장신구' }[sl]}</div>` + itemHTML(eq[sl]);
    if (eq[sl]) { const b = el('button', 'small', '해제'); b.onclick = () => { s.stash.push(eq[sl]); eq[sl] = null; api.writeSave(); render(); }; w.appendChild(b); }
    slots.appendChild(w);
  }
  box.appendChild(slots);
  box.appendChild(el('h3', null, `창고 ${s.stash.length}/60`));
  const list = el('div', 'itemlist');
  for (const it of [...s.stash].sort((a, b) => b.r - a.r)) {
    const w = el('div', 'iwrap'); w.innerHTML = itemHTML(it);
    const ok = it.slot !== 'weapon' || it.cls === cls, b = el('button', 'small', ok ? '착용' : '다른 직업 무기'); b.disabled = !ok;
    b.onclick = () => { const old = eq[it.slot]; eq[it.slot] = it; s.stash.splice(s.stash.indexOf(it), 1); if (old) s.stash.push(old); api.writeSave(); render(); };
    w.appendChild(b); list.appendChild(w);
  }
  if (!s.stash.length) list.appendChild(el('div', 'note', '창고가 비어 있다. 원정에서 장비를 가져오자.'));
  box.appendChild(list);
}
function renderSmith(box, s) {
  const eq = s.classes[s.cls].equip;
  const all = [...Object.values(eq).filter(Boolean).map(it => ({ it, where: '착용' })), ...s.stash.map(it => ({ it, where: '창고' }))];
  if (smithSel && !all.some(x => x.it === smithSel)) smithSel = null;
  box.appendChild(el('h2', null, '대장간'));
  const wrap = el('div', 'smith'), list = el('div', 'itemlist narrow');
  for (const { it, where } of all) { const w = el('div', 'iwrap pick' + (smithSel === it ? ' on' : '')); w.innerHTML = itemHTML(it, `<div class="where">${where}</div>`); w.onclick = () => { smithSel = it; render(); }; list.appendChild(w); }
  if (!all.length) list.appendChild(el('div', 'note', '장비가 없다.'));
  const panel = el('div', 'smithpanel');
  if (smithSel) {
    const it = smithSel, gm = D.GRADE_COST_MULT[it.r];
    panel.innerHTML = itemHTML(it);
    if (it.enh < 10) { const cost = Math.round(10 * (it.enh + 1) * gm), rate = D.ENHANCE_RATE[it.enh], b = el('button', 'primary', `강화 +${it.enh + 1} · 재료 ${cost} · 성공 ${pct(rate)}`);
      b.onclick = () => { if (s.mats < cost) return toast('재료가 부족하다'); s.mats -= cost; if (Math.random() < rate) { it.enh++; toast(`강화 성공! +${it.enh}`); } else toast('강화 실패 (재료만 소모)'); api.writeSave(); render(); }; panel.appendChild(b); }
    else panel.appendChild(el('div', 'note', '최대 강화'));
    if (s.stash.includes(it)) { const b = el('button', null, `분해 → 재료 ${D.SALVAGE[it.r]}`); b.onclick = () => { s.mats += D.SALVAGE[it.r]; s.stash.splice(s.stash.indexOf(it), 1); smithSel = null; api.writeSave(); render(); }; panel.appendChild(b); }
    const rc = Math.round(30 * gm);
    it.aff.forEach((a, i) => { const b = el('button', 'small', `옵션 재설정: ${D.AFFIXES[a.k].name} · 재료 ${rc}`); b.onclick = () => {
      if (s.mats < rc) return toast('재료가 부족하다'); const keys = Object.keys(D.AFFIXES).filter(k => !it.aff.some(x => x.k === k)), k = keys[Math.floor(Math.random() * keys.length)], d = D.AFFIXES[k];
      s.mats -= rc; it.aff[i] = { k, v: +(d.min + Math.random() * (d.max - d.min)).toFixed(3) }; api.writeSave(); render(); }; panel.appendChild(b); });
  } else panel.appendChild(el('div', 'note', '왼쪽에서 장비를 고르세요.'));
  wrap.append(list, panel); box.appendChild(wrap);
}
function renderSettings(box, s) {
  const st = s.settings;
  box.appendChild(el('h2', null, '설정'));
  const f = el('div', 'settings');
  f.innerHTML = `<label>닉네임 <input id="set-name" maxlength="12" value="${s.name.replace(/"/g, '')}"></label>
    <label>시점 감도 <input type="range" min="0.3" max="2.5" step="0.1" value="${st.sens}" id="set-sens"><span>${st.sens}</span></label>
    <label>화면 흔들림 <input type="checkbox" id="set-shake" ${st.shake ? 'checked' : ''}></label>
    <label>조준 보정 (모바일) <select id="set-assist"><option value="0">끔</option><option value="1">약</option><option value="2">강</option></select></label>
    <label>그래픽 <select id="set-gfx"><option value="auto">자동</option><option value="high">높음</option><option value="low">낮음</option></select></label>`;
  box.appendChild(f);
  $('#set-assist').value = String(st.assist); $('#set-gfx').value = st.gfx;
  $('#set-name').onchange = e => { s.name = e.target.value.trim().slice(0, 12) || s.name; api.writeSave(); render(); };
  $('#set-sens').oninput = e => { st.sens = +e.target.value; e.target.nextElementSibling.textContent = st.sens; api.writeSave(); };
  $('#set-shake').onchange = e => { st.shake = e.target.checked; api.writeSave(); };
  $('#set-assist').onchange = e => { st.assist = +e.target.value; api.writeSave(); };
  $('#set-gfx').onchange = e => { st.gfx = e.target.value; api.writeSave(); api.rebuildWorld(); };
  const r = el('button', 'danger', resetArm ? '정말 초기화? 한 번 더 누르면 모든 진행이 지워진다' : '진행 초기화');
  r.onclick = () => { if (!resetArm) { resetArm = true; render(); return; } try { localStorage.clear(); } catch (e) { } location.reload(); };
  box.appendChild(r);
}

// ================= 로비 =================
export function lobbyStatus(t) { const x = document.querySelector('.lobbystatus'); if (x) x.textContent = t; }
export function showLobby(st) {
  hideAll(); const box = $('#lobby'); box.classList.remove('hidden');
  const url = `${location.origin}${location.pathname}?room=${st.code || ''}`;
  const slots = [...st.players.map(p => ({ ...p, bot: false }))];
  for (let i = slots.length; i < D.PARTY_MAX; i++) slots.push({ bot: i - st.players.length < G.save.bots || !st.host, empty: true });
  box.querySelector('.panel').innerHTML = `
    <div class="lhead"><div><div class="note">방 코드</div><div class="code">${st.code || '…'}</div></div>
      ${st.host ? `<button id="copylink">초대 링크 복사</button>` : ''}</div>
    ${st.host ? `<div class="note linktext">${url}</div>` : ''}
    <div class="lslots">${slots.map(p => p.empty ? `<div class="lslot empty">${st.host ? (p.bot ? '봇 동료' : '빈자리') : '빈자리 (봇이 채울 수 있음)'}</div>` :
      `<div class="lslot">${emblem(p.cls)}<div><b>${p.name}</b>${p.host ? ' <span class="tag">방장</span>' : ''}<div class="note">${D.CLASSES[p.cls].name} · Lv.${p.lv}</div></div></div>`).join('')}</div>
    <p class="note">직업은 마을 화면에서 고른 것으로 들어간다. 바꾸려면 나갔다가 다시 들어오면 된다.</p>
    <div class="lbtns">${st.host ? `<button id="lstart" class="primary big">원정 출발</button>` : `<div class="note">방장이 출발하길 기다리는 중…</div>`}<button id="lleave">나가기</button></div>`;
  if (st.host) { $('#copylink').onclick = () => { navigator.clipboard?.writeText(url).then(() => toast('초대 링크를 복사했다'), () => toast('복사가 막혔다 — 위 주소를 직접 보내줘')); }; $('#lstart').onclick = () => api.lobbyStart(); }
  $('#lleave').onclick = () => api.leaveNet();
}

// ================= 런 진입·포인터 =================
let lockFailed = false;
export function enterRun() { hideAll(); $('#hud').classList.remove('hidden'); if (G.isTouch) $('#touch').classList.remove('hidden'); lastCardKey = ''; }
export function lockPointer() { if (G.isTouch) return; try { const p = $('#game').requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; }); } catch (e) { lockFailed = true; } }
export function unlockPointer() { try { document.exitPointerLock(); } catch (e) { } }
const locked = () => document.pointerLockElement === $('#game');

// ================= 카드 =================
let cardPick = null;
export function showCards(choices, onPick, rerolls, onReroll, isChest) {
  const box = $('#cards'); box.classList.remove('hidden'); $('#banner').classList.remove('show'); bannerT = 0;
  const row = $('#cards-row'); row.innerHTML = '';
  $('#cards-title').textContent = isChest ? '보상 — 희귀 이상 강화 카드' : '강화 카드를 고르세요';
  choices.forEach((ch, i) => {
    const c = ch.card, color = D.TIER_COLORS[ch.tier], owned = G.me.cards[c.id];
    const b = el('button', 'card' + (c.L ? ' legend' : ''), `
      <div class="chead"><span class="ctier" style="background:${color}">${D.TIERS[ch.tier]}</span><span class="ckey">${i + 1}</span></div>
      <div class="cicon fam-${c.cls}">${c.cls === 'common' ? '◆' : CLS_ICON[c.cls]}</div>
      <div class="ctitle">${c.name}</div><div class="cfam">${c.cls === 'common' ? '공용' : D.CLASSES[c.cls].name} · ${c.fam}</div>
      <div class="cdesc">${D.cardText(c, Math.min(2, ch.tier))}</div>
      ${ch.upgrade ? `<div class="upg">등급 올리기 ${D.TIERS[owned]} → ${D.TIERS[ch.tier]}</div>` : ''}`);
    b.style.setProperty('--tc', color); b.onclick = () => onPick(ch); row.appendChild(b);
  });
  if (!choices.length) { const b = el('button', 'card', '<div class="ctitle">더 고를 카드가 없다</div>'); b.onclick = () => onPick({ card: D.CARD_BY_ID.k_train, tier: Math.min(2, (G.me.cards.k_train ?? -1) + 1) }); row.appendChild(b); }
  const rr = $('#cards-reroll'); rr.textContent = `다시 뽑기 (${rerolls})`; rr.disabled = rerolls <= 0; rr.onclick = onReroll;
  cardPick = i => { const ch = choices[i]; if (ch) onPick(ch); };
}
export function hideCards() { $('#cards').classList.add('hidden'); cardPick = null; }

// ================= 결과 =================
export function showResult(r, done) {
  hideAll(); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  const box = $('#result'); box.classList.remove('hidden'); const p = box.querySelector('.panel');
  let keep = null;
  p.innerHTML = `<h2>${r.hostLeft ? '방장이 떠났다' : r.win ? '원정 성공!' : '원정 실패…'}</h2>
    <div class="rsum">${emblem(r.cls)} 거점 ${r.region}곳 정화 · 처치 ${r.kills} · ${Math.floor(r.sec / 60)}분 ${r.sec % 60}초 · 재료 +${r.mats}${r.win ? '' : ' (50%)'}</div>
    <div class="note">${r.win ? '얻은 장비를 전부 창고로 가져간다.' : r.bag.length ? '가져갈 장비를 하나만 고르세요. 경험치는 전부 남는다.' : '가져갈 장비가 없다. 경험치는 전부 남는다.'}</div>`;
  const list = el('div', 'itemlist');
  for (const it of r.bag) { const w = el('div', 'iwrap' + (r.win ? '' : ' pick')); w.innerHTML = itemHTML(it); if (!r.win) w.onclick = () => { keep = it; for (const x of list.children) x.classList.remove('on'); w.classList.add('on'); }; list.appendChild(w); }
  p.appendChild(list);
  const b = el('button', 'primary big', '마을로'); b.onclick = () => done(keep); p.appendChild(b);
}

// ================= 가방·능력치·일시정지 =================
let bagTab = 'bag';
function openBag(t) { if (G.mode !== 'run') return; bagTab = t || bagTab; G.mode = 'bag'; unlockPointer(); $('#bag').classList.remove('hidden'); renderBag(); }
function renderBag() {
  const me = G.me, box = $('#bag-body'); box.innerHTML = '';
  for (const b of document.querySelectorAll('#bag-tabs button')) b.classList.toggle('on', b.dataset.t === bagTab);
  if (bagTab === 'bag') {
    box.appendChild(el('p', 'note', `원정 가방 ${me.bag.length}/20 · 이번 판에만 착용한다. 성공하면 창고로 들어간다.`));
    const list = el('div', 'itemlist');
    for (const it of me.bag) { const w = el('div', 'iwrap'); w.innerHTML = itemHTML(it); const on = me.bagEq[it.slot] === it.id, ok = it.slot !== 'weapon' || it.cls === me.cls;
      const b = el('button', 'small', on ? '착용 중 (해제)' : ok ? '이번 판 착용' : '다른 직업 무기'); b.disabled = !ok; b.onclick = () => { api.bagEquip(it, !on); renderBag(); }; w.appendChild(b); list.appendChild(w); }
    if (!me.bag.length) list.appendChild(el('div', 'note', '아직 주운 장비가 없다.'));
    box.appendChild(list);
  } else if (bagTab === 'stats') {
    box.appendChild(statPanel(G.save.classes[me.cls], renderBag));
  } else {
    const ids = Object.entries(me.cards);
    box.appendChild(el('div', 'bagcards', ids.length ? ids.map(([id, t]) => { const c = D.CARD_BY_ID[id]; return `<div class="mini" style="--tc:${D.TIER_COLORS[t]}"><b>${c.name}</b><small>${D.TIERS[t]} · ${D.cardText(c, Math.min(2, t))}</small></div>`; }).join('') : '<div class="note">아직 고른 카드가 없다.</div>'));
  }
}
function closeBag() { $('#bag').classList.add('hidden'); G.mode = 'run'; lockPointer(); }
function pause() { if (G.mode !== 'run') return; G.mode = 'pause'; $('#pause').classList.remove('hidden'); $('#pause-note').textContent = G.net ? '멀티 중에는 게임이 멈추지 않는다.' : '혼자 원정 중에는 게임이 멈춘다. (카드 고르기·가방은 멈추지 않는다)'; }
function resume() { $('#pause').classList.add('hidden'); G.mode = 'run'; lockPointer(); }
function toggleMap(on) { const m = $('#bigmap'); const show = on ?? m.classList.contains('hidden'); m.classList.toggle('hidden', !show); if (show) drawMap($('#bigmap canvas'), true); }

// ================= 효과 =================
function hideAll() { for (const id of ['#town', '#cards', '#result', '#bag', '#pause', '#lobby', '#bigmap']) $(id).classList.add('hidden'); }
let bannerT = 0;
export function banner(text, dur = 2) { const b = $('#banner'); b.textContent = text; b.classList.add('show'); bannerT = dur; }
export function toast(html) { const t = el('div', 'toast', html); $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200); }
let promptText = null;
export function prompt(t) { if (t === promptText) return; promptText = t; const p = $('#prompt'); p.classList.toggle('hidden', !t); if (t) p.innerHTML = G.isTouch ? t : `<kbd>E</kbd> ${t}`; $('#btn-use').classList.toggle('hidden', !t || t.startsWith('쓰러짐')); }
export function hurt() { const h = $('#hurtflash'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
export function blur(on) { $('#sporeblur').classList.toggle('on', !!on); }
export function bossBar(name, frac) { const b = $('#bossbar'); if (name == null) { b.classList.add('hidden'); return; } b.classList.remove('hidden'); $('#bossname').textContent = name; $('#bossfill').style.width = `${Math.max(0, frac) * 100}%`; }
const tv = new THREE.Vector3();
export function dmgWorld(pos, val, color, big) {
  if (!cam || $('#dmg').childElementCount > 40) return;
  tv.copy(pos).setY(pos.y + 0.2).project(cam); if (tv.z > 1) return;
  const d = el('div', 'dnum' + (big ? ' big' : ''), String(val));
  d.style.left = `${(tv.x + 1) / 2 * innerWidth + (Math.random() - 0.5) * 30}px`; d.style.top = `${(1 - tv.y) / 2 * innerHeight}px`; d.style.color = color;
  $('#dmg').appendChild(d); setTimeout(() => d.remove(), 700);
}

// ================= 미니맵·지도·나침반 =================
function markers() {
  const out = [], W = G.world?.W; if (!W) return out;
  for (const c of G.camps) out.push({ x: c.x, z: c.z, k: c.state === 'cleared' ? 'done' : 'camp', label: `거점 ${'★'.repeat(c.tier)}` });
  if (!G.run?.midDead) out.push({ x: W.lairs.mid.x, z: W.lairs.mid.z, k: 'mid', label: '중간 보스' });
  out.push({ x: W.lairs.final.x, z: W.lairs.final.z, k: G.world.seal ? 'final' : 'sealed', label: G.world.seal ? '최종 보스' : '봉인된 유적' });
  for (const ch of G.chests) if (ch.seen && !ch.opened) out.push({ x: ch.x, z: ch.z, k: 'chest', label: '보물 상자' });
  for (const p of G.props) if (p.kind === 'spring' || p.kind === 'pad') out.push({ x: p.x, z: p.z, k: p.kind, minor: true });
  if (G.run?.portal) out.push({ x: G.run.portal.position.x, z: G.run.portal.position.z, k: 'portal', label: '귀환 포털' });
  return out;
}
const MCOL = { camp: '#e8574a', done: '#e9c46a', mid: '#c084fc', final: '#ff7ab6', sealed: '#8b7aa8', chest: '#ffd166', spring: '#7cc8ff', pad: '#e8fff0', portal: '#7cf0ff' };
function drawMarker(ctx, k, x, y, s) {
  ctx.fillStyle = MCOL[k]; ctx.strokeStyle = '#0d1820'; ctx.lineWidth = 2; ctx.beginPath();
  if (k === 'camp' || k === 'done') { ctx.moveTo(x - s * 0.4, y + s); ctx.lineTo(x - s * 0.4, y - s); ctx.lineTo(x + s, y - s * 0.5); ctx.lineTo(x - s * 0.4, y); }
  else if (k === 'mid' || k === 'final' || k === 'sealed') { ctx.arc(x, y, s, 0, Math.PI * 2); }
  else if (k === 'chest') ctx.rect(x - s * 0.8, y - s * 0.6, s * 1.6, s * 1.2);
  else ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
  ctx.closePath(); ctx.stroke(); ctx.fill();
  if (k === 'mid' || k === 'final') { ctx.fillStyle = '#0d1820'; ctx.fillRect(x - s * 0.35, y - s * 0.2, s * 0.25, s * 0.25); ctx.fillRect(x + s * 0.1, y - s * 0.2, s * 0.25, s * 0.25); }
}
function drawMap(canvas, full) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, me = G.me; if (!me || !G.world) return;
  ctx.clearRect(0, 0, w, h); ctx.save();
  const R = full ? D.WORLD_R + 6 : 55, sc = (Math.min(w, h) / 2 - 4) / R;
  ctx.translate(w / 2, h / 2);
  ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1d3a33'; ctx.fillRect(-w, -h, w * 2, h * 2);
  if (!full) ctx.rotate(me.yaw);
  const cx = full ? 0 : me.pos.x, cz = full ? 0 : me.pos.z;
  const P = (x, z) => [(x - cx) * sc, (z - cz) * sc];
  // 지역 색
  D.REGIONS.forEach((r, i) => { const [ox, oy] = P(0, 0); ctx.fillStyle = ['#3d6b4b', '#4a6a45', '#365e41', '#41704f', '#3b6656'][i]; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, D.WORLD_R * sc, i / 5 * Math.PI * 2, (i + 1) / 5 * Math.PI * 2); ctx.closePath(); ctx.fill(); });
  { const [ox, oy] = P(0, 0); ctx.strokeStyle = '#0d1820'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ox, oy, D.WORLD_R * sc, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#5b8a5a'; ctx.beginPath(); ctx.arc(ox, oy, 15 * sc, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(20,40,30,.55)'; for (const o of G.obstacles) { if (o.kind !== 'tree' && o.kind !== 'rock') continue; const [x, y] = P(o.x, o.z); if (Math.abs(x) > w || Math.abs(y) > h) continue; ctx.fillRect(x - 1, y - 1, 2, 2); }
  for (const m of markers()) { const [x, y] = P(m.x, m.z); drawMarker(ctx, m.k, x, y, m.minor ? 3 : full ? 7 : 5); if (full && m.label) { ctx.save(); ctx.fillStyle = '#f5efe0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.label, x, y + 18); ctx.restore(); } }
  if (!full) for (const e of G.enemies) { if (e.state === 'hidden') continue; const [x, y] = P(e.pos.x, e.pos.z); ctx.fillStyle = e.boss ? '#ff5a8a' : '#ff6b5b'; ctx.beginPath(); ctx.arc(x, y, e.boss ? 4 : 2, 0, 6.3); ctx.fill(); }
  for (const a of G.actors) { if (a === me) continue; const [x, y] = P(a.pos.x, a.pos.z); ctx.fillStyle = a.state === 'ok' ? (a.kind === 'bot' ? '#9fe0ff' : '#5ad1ff') : '#ff9a5a'; ctx.beginPath(); ctx.arc(x, y, full ? 5 : 3.5, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#0d1820'; ctx.lineWidth = 1.5; ctx.stroke(); }
  // 나
  const [mx, my] = P(me.pos.x, me.pos.z);
  ctx.save(); ctx.translate(mx, my); ctx.rotate(full ? -me.yaw : 0); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0d1820'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  ctx.restore();
  if (!full) { ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(me.yaw); ctx.fillStyle = '#e9c46a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -h / 2 + 15); ctx.restore(); }
}
function updateCompass() {
  const me = G.me, strip = $('#compass .strip'), W = 520;
  const items = [['N', 0, 0, -1], ['E', 0, 1, 0], ['S', 0, 0, 1], ['W', 0, -1, 0]];
  let html = '';
  const fov = Math.PI * 0.75;
  const put = (ang, inner, cls) => { let d = Math.atan2(Math.sin(ang - (-me.yaw)), Math.cos(ang - (-me.yaw))); if (Math.abs(d) > fov / 2) return; html += `<span class="${cls}" style="left:${W / 2 + d / (fov / 2) * W / 2}px">${inner}</span>`; };
  for (const [l, , x, z] of items) put(Math.atan2(x, -z), l, 'dir');
  for (const m of markers()) { if (m.minor || m.k === 'done' || m.k === 'chest' || m.k === 'sealed') continue; const dx = m.x - me.pos.x, dz = m.z - me.pos.z, dist = Math.hypot(dx, dz); put(Math.atan2(dx, -dz), `<i style="background:${MCOL[m.k]}"></i><small>${Math.round(dist)}m</small>`, 'mk'); }
  for (const a of G.actors) { if (a === G.me || a.kind === 'bot') continue; const dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z; put(Math.atan2(dx, -dz), `<i class="ally"></i>`, 'mk'); }
  strip.innerHTML = html;
}

// ================= 매 프레임 HUD =================
let lastCardKey = '', mapT = 0, partyKey = '';
export function hud(g, camera) {
  cam = camera;
  if (bannerT > 0) { bannerT -= 1 / 60; if (bannerT <= 0) $('#banner').classList.remove('show'); }
  if (!G.run || !G.me || !G.me.S) return;
  const me = G.me, S = me.S, run = G.run, cls = me.cls;
  $('#hud').classList.toggle('aiming', G.aim.aiming); $('#touch').classList.toggle('aiming', G.aim.aiming);
  const hpF = Math.max(0, me.hp / S.hpMax);
  $('#hpfill').style.width = `${hpF * 100}%`; $('#hptext').textContent = `${Math.ceil(Math.max(0, me.hp))} / ${Math.round(S.hpMax)}`;
  $('#minihp i').style.width = `${hpF * 100}%`; $('#lowhp').classList.toggle('on', hpF < 0.3 && me.state === 'ok');
  $('#manabar').classList.toggle('hidden', cls !== 'cleric'); if (cls === 'cleric') $('#manafill').style.width = `${me.mana}%`;
  const sc = G.save.classes[cls]; $('#lvtext').textContent = sc.lv; $('#myname').textContent = me.name;
  $('#xpfill').style.width = sc.lv >= D.LEVEL_CAP ? '100%' : `${sc.xp / D.xpForLevel(sc.lv) * 100}%`;
  const fp = freePts(sc); $('#ptsbadge').classList.toggle('hidden', fp <= 0); $('#ptsbadge').textContent = `+${fp} 능력치 (T)`;
  $('#myemblem').className = `emblem ${cls}`; $('#myemblem').textContent = CLS_ICON[cls];
  const W = G.world;
  $('#region').textContent = W ? regionName(me.pos.x, me.pos.z) : '';
  $('#objective').innerHTML = run.phase === 'victory' ? '포털로 돌아가 원정을 마치자' : W && W.seal ? '봉인이 풀렸다 — 북쪽 유적의 최종 보스' : `봉인 해제: 거점 <b>${Math.min(run.campsCleared, D.SEAL_CAMPS)}/${D.SEAL_CAMPS}</b> · 중간 보스 <b>${run.midDead ? '✓' : '✗'}</b>`;
  $('#danger').textContent = `위험도 ${run.danger}`;
  // 쿨타임
  const cd = (id, rem, max) => { for (const s of document.querySelectorAll(`[data-cd="${id}"]`)) s.style.setProperty('--cd', max > 0 ? Math.min(1, rem / max) : 0); };
  cd('q', me.cd.q, me.qMax || 1); cd('dash', me.cd.dash, S.dashCd); cd('rmb', me.cd.rmb, me.rmbMax || 1);
  for (const s of document.querySelectorAll('[data-lbl="q"]')) s.textContent = D.CLASSES[cls].q;
  for (const s of document.querySelectorAll('[data-lbl="rmb"]')) s.textContent = D.CLASSES[cls].rmb;
  const key = JSON.stringify(me.cards);
  if (key !== lastCardKey) { lastCardKey = key; $('#cardicons').innerHTML = Object.entries(me.cards).map(([id, t]) => `<span style="--tc:${D.TIER_COLORS[t]}" title="${D.CARD_BY_ID[id].name}">${D.CARD_BY_ID[id].name.slice(0, 2)}</span>`).join(''); }
  // 파티
  const pk = G.actors.map(a => `${a.id}${a.state}${Math.round(a.hp / (a.S?.hpMax || 1) * 50)}`).join();
  if (pk !== partyKey) { partyKey = pk; $('#party').innerHTML = G.actors.filter(a => a !== me).map(a => `<div class="pf ${a.state}">${emblem(a.cls, 'sm')}<div class="pfb"><div class="pfn">${a.name}${a.kind === 'bot' ? ' <small>봇</small>' : ''}</div><div class="bar hp"><i style="width:${Math.max(0, a.hp / (a.S?.hpMax || 1) * 100)}%"></i></div></div>${a.state === 'down' ? '<em>쓰러짐</em>' : a.state === 'dead' ? '<em>전사</em>' : ''}</div>`).join(''); }
  // 이름표
  let tags = '';
  for (const a of G.actors) { if (a === me || !a.model) continue; tv.set(a.pos.x, a.pos.y + 2.2, a.pos.z).project(camera); if (tv.z > 1 || Math.abs(tv.x) > 1.1 || Math.abs(tv.y) > 1.1) continue; const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z); if (d > 45) continue;
    tags += `<div class="ntag ${a.state}" style="left:${(tv.x + 1) / 2 * innerWidth}px;top:${(1 - tv.y) / 2 * innerHeight}px">${a.name}${a.state === 'down' ? ' — 살려줘!' : ''}</div>`; }
  $('#tags').innerHTML = tags;
  // 미니맵·나침반 (가볍게 30fps)
  mapT -= 1 / 60; if (mapT <= 0) { mapT = 1 / 30; drawMap($('#minimap'), false); updateCompass(); if (!$('#bigmap').classList.contains('hidden')) drawMap($('#bigmap canvas'), true); }
  // 조준점
  const ch = $('#crosshair'); ch.className = `ch-${cls}`; ch.classList.toggle('hidden', !!G.aim.swinging || me.state !== 'ok');
  const ring = $('#chargering'), cv = cls === 'mage' ? G.aim.charge : G.aim.draw;
  ring.style.setProperty('--p', cv); ring.classList.toggle('hidden', !(cv > 0)); ring.classList.toggle('full', cv >= 0.999);
  const tg = $('#target');
  if (G.aim.target) { const t = G.aim.target, h = Math.max(30, t.bot.y - t.top.y); tg.classList.remove('hidden'); Object.assign(tg.style, { left: `${t.top.x - t.w / 2}px`, top: `${t.top.y - 6}px`, width: `${t.w}px`, height: `${h + 12}px` });
    const wk = $('#weak'); wk.classList.toggle('hidden', !t.weak); wk.style.left = `${t.head.x}px`; wk.style.top = `${t.head.y}px`; }
  else { tg.classList.add('hidden'); $('#weak').classList.add('hidden'); }
}

// ================= 입력 =================
function bindKeyboardMouse() {
  const I = G.input, k = I.keys;
  const upd = () => { I.mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0); I.my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') { e.preventDefault(); if (G.mode === 'run') openBag('bag'); else if (G.mode === 'bag') closeBag(); return; }
    if (e.code === 'KeyT' && (G.mode === 'run' || G.mode === 'bag')) { if (G.mode === 'run') openBag('stats'); else closeBag(); return; }
    if (e.code === 'KeyM' && G.run) { toggleMap(); return; }
    if (cardPick && /^Digit[1-4]$/.test(e.code)) { cardPick(+e.code.slice(5) - 1); return; }
    if (G.mode === 'pause' && e.code === 'Escape') { resume(); return; }
    if (G.mode !== 'run') return;
    k[e.code] = true; upd();
    if (e.code === 'Space') { I.jumpT = true; I.jumpHeld = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') I.dashT = true;
    if (e.code === 'KeyQ') I.q = true; if (e.code === 'KeyE') I.useT = true;
    if (e.code === 'Escape' && lockFailed) pause();
  });
  addEventListener('keyup', e => { k[e.code] = false; upd(); if (e.code === 'KeyQ') I.q = false; if (e.code === 'Space') I.jumpHeld = false; });
  const canvas = $('#game');
  canvas.addEventListener('mousedown', e => { if (G.mode !== 'run' || G.isTouch) return; if (!locked() && !lockFailed) { lockPointer(); return; } if (e.button === 0) I.lmb = true; if (e.button === 2) I.rmb = true; });
  addEventListener('mouseup', e => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
  addEventListener('mousemove', e => { if (G.mode === 'run' && (locked() || lockFailed) && !G.isTouch) { I.lookDX += e.movementX; I.lookDY += e.movementY; } });
  addEventListener('contextmenu', e => { if (G.run) e.preventDefault(); });
  document.addEventListener('pointerlockchange', () => { if (!locked() && G.mode === 'run' && !G.me?.choosing) { I.lmb = I.rmb = I.q = false; for (const c in k) k[c] = false; upd(); pause(); } });
  addEventListener('blur', () => { I.lmb = I.rmb = I.q = false; for (const c in k) k[c] = false; upd(); });
}
function bindTouch() {
  const I = G.input, root = $('#touch'); let joy = null, look = null; const held = {};
  const knob = $('#joy-knob'), base = $('#joy-base');
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.tbtn')) return;
    if (e.clientX < innerWidth * 0.45 && !joy) { joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`; base.classList.remove('hidden'); }
    else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  addEventListener('pointermove', e => {
    if (joy && e.pointerId === joy.id) { let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; I.mx = dx / m; I.my = -dy / m; }
    for (const t of [look, ...Object.values(held)]) if (t && e.pointerId === t.id) { I.lookDX += (e.clientX - t.x) * 2.2; I.lookDY += (e.clientY - t.y) * 2.2; t.x = e.clientX; t.y = e.clientY; }
  });
  const release = k => { const t = held[k]; if (!t) return; t.btn.classList.remove('held'); delete held[k]; if (k === 'atk') I.lmb = false; if (k === 'aux') I.rmb = false; if (k === 'skill') I.q = false; if (k === 'jump') I.jumpHeld = false; };
  const end = e => { if (joy && e.pointerId === joy.id) { joy = null; I.mx = I.my = 0; knob.style.transform = ''; base.classList.add('hidden'); } if (look && e.pointerId === look.id) look = null; for (const [k, t] of Object.entries(held)) if (t.id === e.pointerId) release(k); };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  for (const btn of document.querySelectorAll('.tbtn')) btn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); const k = btn.dataset.k;
    if (k === 'dash') I.dashT = true; else if (k === 'use') I.useT = true; else if (k === 'bag') openBag('bag'); else if (k === 'pause') pause(); else if (k === 'map') toggleMap();
    else { held[k] = { id: e.pointerId, x: e.clientX, y: e.clientY, btn }; btn.classList.add('held'); if (k === 'atk') I.lmb = true; if (k === 'aux') I.rmb = true; if (k === 'skill') I.q = true; if (k === 'jump') { I.jumpT = true; I.jumpHeld = true; } }
  });
}

export function init(g, a) {
  G = g; api = a;
  for (const b of document.querySelectorAll('#town-nav button')) b.onclick = () => { tab = b.dataset.tab; resetArm = false; render(); };
  for (const b of document.querySelectorAll('#bag-tabs button')) b.onclick = () => { bagTab = b.dataset.t; renderBag(); };
  $('#bag-close').onclick = closeBag; $('#pause-resume').onclick = resume;
  $('#pause-quit').onclick = () => { $('#pause').classList.add('hidden'); G.mode = 'run'; api.quitRun(); };
  $('#bigmap').onclick = () => toggleMap(false);
  bindKeyboardMouse();
  if (G.isTouch) { bindTouch(); document.body.classList.add('touch'); }
}
