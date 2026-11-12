// 화면(DOM) 담당: 마을, 카드 선택, 결과, HUD, 입력(키보드·마우스·터치)
import * as THREE from 'three';
import * as D from './data.js';

let G, api, cam;
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pct = v => `${Math.round(v * 100)}%`;

// ================= 아이템 표시 =================
export function itemHTML(it, extra = '') {
  if (!it) return '<div class="item empty">비어 있음</div>';
  const p = api.itemPower(it);
  const lines = [];
  if (p.atk) lines.push(`피해 +${pct(p.atk)}`);
  if (p.hp) lines.push(`체력 +${p.hp}`);
  for (const a of it.aff) { const d = D.AFFIXES[a.k]; lines.push(`${d.name} ${d.f === 'neg' ? '−' : '+'}${(a.v * 100).toFixed(1)}%`); }
  const slotName = { weapon: `무기 · ${D.CLASSES[it.cls]?.name || ''}`, armor: '갑옷', trinket: '장신구' }[it.slot];
  return `<div class="item" style="--rc:${D.RARITY_COLORS[it.r]}">
    <div class="iname">${it.name}${it.enh ? ` <b>+${it.enh}</b>` : ''}</div>
    <div class="islot">${D.RARITY[it.r]} · ${slotName}</div>
    <div class="istats">${lines.join('<br>')}</div>
    ${it.u ? `<div class="iuniq">${D.UNIQUES[it.u].d}</div>` : ''}${extra}</div>`;
}

// ================= 마을 =================
let townTab = 'expedition', smithSel = null, resetArm = false;
export function showTown() {
  hideAll(); $('#town').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  renderTown();
}
function renderTown() {
  const s = G.save, box = $('#town-body');
  $('#town-mats').textContent = `재료 ${s.mats}`;
  for (const b of document.querySelectorAll('#town-tabs button')) b.classList.toggle('on', b.dataset.tab === townTab);
  box.innerHTML = '';
  if (townTab === 'expedition') {
    const grid = el('div', 'classgrid');
    for (const id of D.CLASS_IDS) {
      const c = D.CLASSES[id], sc = s.classes[id], need = D.xpForLevel(sc.lv);
      const card = el('button', 'classcard' + (s.cls === id ? ' on' : ''), `
        <div class="cname">${c.name}<span>${c.role}</span></div>
        <div class="clv">Lv.${sc.lv}${sc.lv >= D.LEVEL_CAP ? ' (최대)' : ''}</div>
        <div class="bar"><i style="width:${sc.lv >= D.LEVEL_CAP ? 100 : Math.min(100, sc.xp / need * 100)}%"></i></div>
        <div class="cskills"><b>좌클릭</b> ${c.lmb}<br><b>우클릭</b> ${c.rmb}<br><b>Q</b> ${c.q}</div>`);
      card.onclick = () => { s.cls = id; api.writeSave(); renderTown(); };
      grid.appendChild(card);
    }
    box.appendChild(grid);
    const allKilled = D.FINAL_ORDER.every(b => s.killed[b]);
    const row = el('div', 'startrow');
    if (allKilled) {
      const sel = el('select', 'bosspick');
      sel.innerHTML = `<option value="">최종 보스: 랜덤</option>` + D.FINAL_ORDER.map(b => `<option value="${b}" ${s.pickFinal === b ? 'selected' : ''}>최종 보스: ${D.BOSSES[b].name}</option>`).join('');
      sel.onchange = () => { s.pickFinal = sel.value || null; api.writeSave(); };
      row.appendChild(sel);
    } else {
      const k = D.FINAL_ORDER.filter(b => s.killed[b]).length;
      row.appendChild(el('div', 'note', `최종 보스 ${k}/${D.FINAL_ORDER.length} 처치 · 전부 잡으면 보스를 골라 도전할 수 있다`));
    }
    const go = el('button', 'big primary', '원정 출발');
    go.onclick = () => api.startRun();
    row.appendChild(go); box.appendChild(row);
    box.appendChild(el('div', 'help', G.isTouch
      ? '왼쪽 엄지로 이동, 오른쪽을 끌어 시점. 공격 버튼을 누른 채 끌면 조준이 따라온다.'
      : 'WASD 이동 · 마우스 시점 · 좌클릭 공격 · 우클릭 보조 · Q 스킬 · Shift 대시 · Space 점프 · E 줍기 · Tab 가방 · Esc 일시정지'));
  } else if (townTab === 'gear') {
    const cls = s.cls, eq = s.classes[cls].equip;
    box.appendChild(el('h3', null, `${D.CLASSES[cls].name} 착용 장비`));
    const slots = el('div', 'slots');
    for (const sl of ['weapon', 'armor', 'trinket']) {
      const w = el('div', 'slot'); w.innerHTML = `<div class="slabel">${{ weapon: '무기', armor: '갑옷', trinket: '장신구' }[sl]}</div>` + itemHTML(eq[sl]);
      if (eq[sl]) { const b = el('button', 'small', '해제'); b.onclick = () => { if (s.stash.length >= 40) return toast('창고가 가득 찼다'); s.stash.push(eq[sl]); eq[sl] = null; api.writeSave(); renderTown(); }; w.appendChild(b); }
      slots.appendChild(w);
    }
    box.appendChild(slots);
    box.appendChild(el('h3', null, `창고 ${s.stash.length}/40`));
    const list = el('div', 'itemlist');
    for (const it of [...s.stash].sort((a, b) => b.r - a.r)) {
      const w = el('div', 'iwrap'); w.innerHTML = itemHTML(it);
      const ok = it.slot !== 'weapon' || it.cls === cls;
      const b = el('button', 'small', ok ? '착용' : '다른 직업 무기'); b.disabled = !ok;
      b.onclick = () => { const old = eq[it.slot]; eq[it.slot] = it; s.stash.splice(s.stash.indexOf(it), 1); if (old) s.stash.push(old); api.writeSave(); renderTown(); };
      w.appendChild(b); list.appendChild(w);
    }
    if (!s.stash.length) list.appendChild(el('div', 'note', '창고가 비어 있다. 원정에서 장비를 가져오자.'));
    box.appendChild(list);
  } else if (townTab === 'smith') {
    const cls = s.cls, eq = s.classes[cls].equip;
    const all = [...Object.values(eq).filter(Boolean).map(it => ({ it, where: '착용' })), ...s.stash.map(it => ({ it, where: '창고' }))];
    if (smithSel && !all.some(x => x.it === smithSel)) smithSel = null;
    const wrap = el('div', 'smith');
    const list = el('div', 'itemlist narrow');
    for (const { it, where } of all) {
      const w = el('div', 'iwrap pick' + (smithSel === it ? ' on' : '')); w.innerHTML = itemHTML(it, `<div class="where">${where}</div>`);
      w.onclick = () => { smithSel = it; renderTown(); }; list.appendChild(w);
    }
    if (!all.length) list.appendChild(el('div', 'note', '장비가 없다.'));
    const panel = el('div', 'smithpanel');
    if (smithSel) {
      const it = smithSel, gm = D.GRADE_COST_MULT[it.r];
      panel.innerHTML = itemHTML(it);
      if (it.enh < 10) {
        const cost = Math.round(10 * (it.enh + 1) * gm), rate = D.ENHANCE_RATE[it.enh];
        const b = el('button', 'primary', `강화 +${it.enh + 1} · 재료 ${cost} · 성공 ${pct(rate)}`);
        b.onclick = () => { if (s.mats < cost) return toast('재료가 부족하다'); s.mats -= cost; if (Math.random() < rate) { it.enh++; toast(`강화 성공! +${it.enh}`); } else toast('강화 실패 (재료만 소모)'); api.writeSave(); renderTown(); };
        panel.appendChild(b);
      } else panel.appendChild(el('div', 'note', '최대 강화'));
      if (s.stash.includes(it)) {
        const b = el('button', null, `분해 → 재료 ${D.SALVAGE[it.r]}`);
        b.onclick = () => { s.mats += D.SALVAGE[it.r]; s.stash.splice(s.stash.indexOf(it), 1); smithSel = null; api.writeSave(); renderTown(); };
        panel.appendChild(b);
      }
      const rc = Math.round(30 * gm);
      it.aff.forEach((a, i) => {
        const b = el('button', 'small', `옵션 재설정: ${D.AFFIXES[a.k].name} · 재료 ${rc}`);
        b.onclick = () => {
          if (s.mats < rc) return toast('재료가 부족하다');
          const keys = Object.keys(D.AFFIXES).filter(k => !it.aff.some(x => x.k === k));
          const k = keys[Math.floor(Math.random() * keys.length)], d = D.AFFIXES[k];
          s.mats -= rc; it.aff[i] = { k, v: +(d.min + Math.random() * (d.max - d.min)).toFixed(3) }; api.writeSave(); renderTown();
        };
        panel.appendChild(b);
      });
    } else panel.appendChild(el('div', 'note', '왼쪽에서 장비를 고르세요.'));
    wrap.append(list, panel); box.appendChild(wrap);
  } else if (townTab === 'settings') {
    const st = s.settings;
    const f = el('div', 'settings');
    f.innerHTML = `
      <label>시점 감도 <input type="range" min="0.3" max="2.5" step="0.1" value="${st.sens}" id="set-sens"><span>${st.sens}</span></label>
      <label>화면 흔들림 <input type="checkbox" id="set-shake" ${st.shake ? 'checked' : ''}></label>
      <label>조준 보정 (모바일) <select id="set-assist"><option value="0">끔</option><option value="1">약</option><option value="2">강</option></select></label>
      <label>그래픽 <select id="set-gfx"><option value="auto">자동</option><option value="high">높음</option><option value="low">낮음</option></select></label>`;
    box.appendChild(f);
    $('#set-assist').value = String(st.assist); $('#set-gfx').value = st.gfx;
    $('#set-sens').oninput = e => { st.sens = +e.target.value; e.target.nextElementSibling.textContent = st.sens; api.writeSave(); };
    $('#set-shake').onchange = e => { st.shake = e.target.checked; api.writeSave(); };
    $('#set-assist').onchange = e => { st.assist = +e.target.value; api.writeSave(); };
    $('#set-gfx').onchange = e => { st.gfx = e.target.value; api.writeSave(); api.rebuildWorld(); };
    const r = el('button', 'danger', resetArm ? '정말 초기화? 한 번 더 누르면 모든 진행이 지워진다' : '진행 초기화');
    r.onclick = () => { if (!resetArm) { resetArm = true; renderTown(); return; } try { localStorage.clear(); } catch (e) { } location.reload(); };
    box.appendChild(r);
  }
}

// ================= 런 진입·포인터 =================
let lockFailed = false;
export function enterRun() { hideAll(); $('#hud').classList.remove('hidden'); if (G.isTouch) $('#touch').classList.remove('hidden'); lastCardKey = ''; }
export function lockPointer() {
  if (G.isTouch) return;
  try { const p = $('#game').requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; }); } catch (e) { lockFailed = true; }
}
export function unlockPointer() { try { document.exitPointerLock(); } catch (e) { } }
const locked = () => document.pointerLockElement === $('#game');

// ================= 카드 선택 =================
let cardPick = null;
export function showCards(choices, onPick, rerolls, onReroll, isChest) {
  const box = $('#cards'); box.classList.remove('hidden'); $('#banner').classList.remove('show'); bannerT = 0;
  const row = $('#cards-row'); row.innerHTML = '';
  $('#cards-title').textContent = isChest ? '보상 상자 — 희귀 이상 카드' : '강화 카드를 고르세요';
  choices.forEach((ch, i) => {
    const c = ch.card, color = D.TIER_COLORS[ch.tier];
    const owned = G.run.cards[c.id];
    const up = ch.upgrade ? `<div class="upg">등급 올리기 ${D.TIERS[owned]} → ${D.TIERS[ch.tier]}</div>` : '';
    const b = el('button', 'card' + (c.L ? ' legend' : ''), `
      <div class="ctier" style="color:${color}">${D.TIERS[ch.tier]}</div>
      <div class="cfam">${c.cls === 'common' ? '공용' : D.CLASSES[c.cls].name} · ${c.fam}</div>
      <div class="ctitle">${c.name}</div>
      <div class="cdesc">${D.cardText(c, Math.min(2, ch.tier))}</div>${up}
      <div class="ckey">${i + 1}</div>`);
    b.style.setProperty('--tc', color);
    b.onclick = () => onPick(ch);
    row.appendChild(b);
  });
  if (!choices.length) { const b = el('button', 'card', '<div class="ctitle">더 고를 카드가 없다</div>'); b.onclick = () => onPick({ card: D.CARD_BY_ID.k_train, tier: Math.min(2, (G.run.cards.k_train ?? -1) + 1) }); row.appendChild(b); }
  const rr = $('#cards-reroll'); rr.textContent = `다시 뽑기 (${rerolls})`; rr.disabled = rerolls <= 0; rr.onclick = onReroll;
  cardPick = i => { const ch = choices[i]; if (ch) onPick(ch); };
}
export function hideCards() { $('#cards').classList.add('hidden'); cardPick = null; }

// ================= 결과 =================
export function showResult({ win, run, bag, mats }, done) {
  hideAll(); $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  const box = $('#result'); box.classList.remove('hidden');
  const cls = D.CLASSES[run.cls].name, sec = Math.round((performance.now() - run.startedAt) / 1000);
  let keep = null;
  box.innerHTML = `<h2>${win ? '원정 성공!' : '쓰러졌다…'}</h2>
    <div class="rsum">${cls} · ${run.floor === 6 ? '최종 보스' : run.floor + '층'} · 처치 ${run.kills} · ${Math.floor(sec / 60)}분 ${sec % 60}초 · 재료 +${mats}${win ? '' : ' (50%)'}</div>
    <div class="rnote">${win ? '얻은 장비를 전부 창고로 가져간다.' : bag.length ? '가져갈 장비를 하나만 고르세요. 경험치는 전부 남는다.' : '가져갈 장비가 없다. 경험치는 전부 남는다.'}</div>`;
  const list = el('div', 'itemlist');
  for (const it of bag) {
    const w = el('div', 'iwrap' + (win ? '' : ' pick')); w.innerHTML = itemHTML(it);
    if (!win) w.onclick = () => { keep = it; for (const x of list.children) x.classList.remove('on'); w.classList.add('on'); };
    list.appendChild(w);
  }
  box.appendChild(list);
  const b = el('button', 'big primary', '마을로'); b.onclick = () => done(keep); box.appendChild(b);
}

// ================= 가방·일시정지 =================
function openBag() {
  if (G.mode !== 'run') return;
  G.mode = 'bag'; unlockPointer();
  const box = $('#bag'); box.classList.remove('hidden'); renderBag();
}
function renderBag() {
  const box = $('#bag-list'); box.innerHTML = ''; const run = G.run;
  $('#bag-title').textContent = `원정 가방 ${run.bag.length}/20 · 이번 판 재료 ${run.mats}`;
  for (const it of run.bag) {
    const w = el('div', 'iwrap'); w.innerHTML = itemHTML(it);
    const on = run.bagEq[it.slot] === it.id, ok = it.slot !== 'weapon' || it.cls === run.cls;
    const b = el('button', 'small', on ? '착용 중 (해제)' : ok ? '이번 판 착용' : '다른 직업 무기'); b.disabled = !ok;
    b.onclick = () => { if (on) delete run.bagEq[it.slot]; else run.bagEq[it.slot] = it.id; api.computeStats(); renderBag(); };
    w.appendChild(b); box.appendChild(w);
  }
  if (!run.bag.length) box.appendChild(el('div', 'note', '아직 주운 장비가 없다.'));
  const cards = el('div', 'bagcards', Object.entries(run.cards).map(([id, t]) => { const c = D.CARD_BY_ID[id]; return `<span style="border-color:${D.TIER_COLORS[t]}" title="${D.cardText(c, Math.min(2, t))}">${c.name}</span>`; }).join(''));
  box.appendChild(el('h3', null, '이번 판 카드')); box.appendChild(cards);
}
function closeBag() { $('#bag').classList.add('hidden'); G.mode = 'run'; lockPointer(); }
function pause() {
  if (G.mode !== 'run') return;
  G.mode = 'pause'; $('#pause').classList.remove('hidden');
}
function resume() { $('#pause').classList.add('hidden'); G.mode = 'run'; lockPointer(); }

// ================= HUD 효과 =================
function hideAll() { for (const id of ['#town', '#cards', '#result', '#bag', '#pause']) $(id).classList.add('hidden'); }
let bannerT = 0;
export function banner(text, dur = 2) { const b = $('#banner'); b.textContent = text; b.classList.add('show'); bannerT = dur; }
export function toast(html) { const t = el('div', 'toast', html); $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600); }
let promptText = null;
export function prompt(t) { if (t === promptText) return; promptText = t; const p = $('#prompt'); p.classList.toggle('hidden', !t); if (t) p.innerHTML = G.isTouch ? t : `<b>E</b> ${t}`; $('#btn-use').classList.toggle('hidden', !t); }
export function hurt() { const h = $('#hurtflash'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
export function blur(on) { $('#sporeblur').classList.toggle('on', !!on); }
export function bossBar(name, frac) {
  const b = $('#bossbar'); if (name == null) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); $('#bossname').textContent = name; $('#bossfill').style.width = `${Math.max(0, frac) * 100}%`;
}
const dmgLayer = () => $('#dmg');
const tv = new THREE.Vector3();
export function dmgWorld(pos, h, val, color, big) {
  if (!cam || dmgLayer().childElementCount > 40) return;
  tv.set(pos.x, (pos.y || 0) + h + 0.2, pos.z).project(cam);
  if (tv.z > 1) return;
  const d = el('div', 'dnum' + (big ? ' big' : ''), String(val));
  d.style.left = `${(tv.x + 1) / 2 * innerWidth + (Math.random() - 0.5) * 30}px`; d.style.top = `${(1 - tv.y) / 2 * innerHeight}px`; d.style.color = color;
  dmgLayer().appendChild(d); setTimeout(() => d.remove(), 700);
}

// ================= 매 프레임 HUD =================
let lastCardKey = '';
export function hud(g, camera) {
  cam = camera;
  if (bannerT > 0) { bannerT -= 1 / 60; if (bannerT <= 0) $('#banner').classList.remove('show'); }
  if (!G.run || !G.P) return;
  const P = G.P, S = G.S, run = G.run, cls = run.cls;
  $('#hud').classList.toggle('aiming', G.aim.aiming);
  $('#touch').classList.toggle('aiming', G.aim.aiming);
  const hpF = Math.max(0, P.hp / S.hpMax);
  $('#hpfill').style.width = `${hpF * 100}%`; $('#hptext').textContent = `${Math.ceil(Math.max(0, P.hp))} / ${Math.round(S.hpMax)}`;
  $('#minihp i').style.width = `${hpF * 100}%`;
  $('#lowhp').classList.toggle('on', hpF < 0.3);
  $('#manabar').classList.toggle('hidden', cls !== 'cleric'); if (cls === 'cleric') $('#manafill').style.width = `${P.mana}%`;
  const sc = G.save.classes[cls]; $('#lvtext').textContent = `Lv.${sc.lv}`; $('#xpfill').style.width = sc.lv >= D.LEVEL_CAP ? '100%' : `${sc.xp / D.xpForLevel(sc.lv) * 100}%`;
  const left = G.enemies.length + run.pending;
  $('#floorinfo').textContent = run.floor === 6 ? '최종 보스' : `${run.floor}층 · 웨이브 ${Math.min(run.wave, run.waves)}/${run.waves}${left ? ` · 남은 적 ${left}` : ''}`;
  // 쿨타임
  const cd = (id, rem, max) => { for (const s of document.querySelectorAll(`[data-cd="${id}"]`)) s.style.setProperty('--cd', max > 0 ? Math.min(1, rem / max) : 0); };
  cd('q', P.cd.q, P.qMax || 1); cd('dash', P.cd.dash, S.dashCd); cd('rmb', P.cd.rmb, P.rmbMax || 1);
  for (const s of document.querySelectorAll('[data-lbl="q"]')) s.textContent = D.CLASSES[cls].q;
  for (const s of document.querySelectorAll('[data-lbl="rmb"]')) s.textContent = D.CLASSES[cls].rmb;
  // 카드 아이콘
  const key = JSON.stringify(run.cards);
  if (key !== lastCardKey) {
    lastCardKey = key;
    $('#cardicons').innerHTML = Object.entries(run.cards).map(([id, t]) => `<span style="border-color:${D.TIER_COLORS[t]}">${D.CARD_BY_ID[id].name.slice(0, 2)}</span>`).join('');
  }
  // 조준점
  const ch = $('#crosshair'); ch.className = `ch-${cls}`;
  ch.classList.toggle('hidden', !!G.aim.swinging);
  const ring = $('#chargering'); ring.style.setProperty('--p', cls === 'mage' ? G.aim.charge : G.aim.draw); ring.classList.toggle('hidden', !(G.aim.charge > 0 || G.aim.draw > 0));
  ring.classList.toggle('full', (cls === 'mage' ? G.aim.charge : G.aim.draw) >= 0.999);
  const tg = $('#target');
  if (G.aim.target) {
    const t = G.aim.target, h = Math.max(30, t.bot.y - t.top.y);
    tg.classList.remove('hidden'); Object.assign(tg.style, { left: `${t.top.x - t.w / 2}px`, top: `${t.top.y - 6}px`, width: `${t.w}px`, height: `${h + 12}px` });
    const wk = $('#weak'); wk.classList.toggle('hidden', !t.weak); wk.style.left = `${t.head.x}px`; wk.style.top = `${t.head.y}px`;
  } else { tg.classList.add('hidden'); $('#weak').classList.add('hidden'); }
}

// ================= 입력 =================
function bindKeyboardMouse() {
  const I = G.input, k = I.keys;
  const upd = () => { I.mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0); I.my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); };
  addEventListener('keydown', e => {
    if (e.code === 'Tab') { e.preventDefault(); if (G.mode === 'run') openBag(); else if (G.mode === 'bag') closeBag(); return; }
    if (G.mode === 'cards' && /^Digit[1-4]$/.test(e.code)) { cardPick && cardPick(+e.code.slice(5) - 1); return; }
    if (G.mode === 'pause' && e.code === 'Escape') { resume(); return; }
    if (G.mode !== 'run') return;
    k[e.code] = true; upd();
    if (e.code === 'Space') { I.jumpT = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') I.dashT = true;
    if (e.code === 'KeyQ') I.q = true;
    if (e.code === 'KeyE') I.useT = true;
    if (e.code === 'Escape' && lockFailed) pause();
  });
  addEventListener('keyup', e => { k[e.code] = false; upd(); if (e.code === 'KeyQ') I.q = false; });
  const canvas = $('#game');
  canvas.addEventListener('mousedown', e => {
    if (G.mode !== 'run' || G.isTouch) return;
    if (!locked() && !lockFailed) { lockPointer(); return; }
    if (e.button === 0) I.lmb = true; if (e.button === 2) I.rmb = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
  addEventListener('mousemove', e => { if (G.mode === 'run' && (locked() || lockFailed) && !G.isTouch) { I.lookDX += e.movementX; I.lookDY += e.movementY; } });
  addEventListener('contextmenu', e => { if (G.mode === 'run') e.preventDefault(); });
  document.addEventListener('pointerlockchange', () => { if (!locked() && G.mode === 'run') { I.lmb = I.rmb = I.q = false; for (const c in k) k[c] = false; upd(); pause(); } });
  addEventListener('blur', () => { I.lmb = I.rmb = I.q = false; for (const c in k) k[c] = false; upd(); });
}

function bindTouch() {
  const I = G.input, root = $('#touch');
  let joy = null, look = null;
  const knob = $('#joy-knob'), base = $('#joy-base');
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.tbtn')) return;
    if (e.clientX < innerWidth * 0.45 && !joy) {
      joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
      base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`; base.classList.remove('hidden');
    } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  addEventListener('pointermove', e => {
    if (joy && e.pointerId === joy.id) {
      let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy), m = 55;
      if (l > m) { dx *= m / l; dy *= m / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; I.mx = dx / m; I.my = -dy / m;
    }
    for (const t of [look, ...Object.values(held)]) {
      if (t && e.pointerId === t.id) { I.lookDX += (e.clientX - t.x) * 2.2; I.lookDY += (e.clientY - t.y) * 2.2; t.x = e.clientX; t.y = e.clientY; }
    }
  });
  const end = e => {
    if (joy && e.pointerId === joy.id) { joy = null; I.mx = I.my = 0; knob.style.transform = ''; base.classList.add('hidden'); }
    if (look && e.pointerId === look.id) look = null;
    for (const [k, t] of Object.entries(held)) if (t.id === e.pointerId) release(k);
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  // 버튼: 누르고 있는 동안 화면을 끌면 조준이 따라온다
  const held = {};
  const release = k => { const t = held[k]; if (!t) return; t.btn.classList.remove('held'); delete held[k]; if (k === 'atk') I.lmb = false; if (k === 'aux') I.rmb = false; if (k === 'skill') I.q = false; };
  for (const btn of document.querySelectorAll('.tbtn')) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const k = btn.dataset.k;
      if (k === 'dash') I.dashT = true; else if (k === 'jump') I.jumpT = true; else if (k === 'use') I.useT = true;
      else if (k === 'bag') openBag(); else if (k === 'pause') pause();
      else { held[k] = { id: e.pointerId, x: e.clientX, y: e.clientY, btn }; btn.classList.add('held'); if (k === 'atk') I.lmb = true; if (k === 'aux') I.rmb = true; if (k === 'skill') I.q = true; }
    });
  }
}

// ================= 초기화 =================
export function init(g, a) {
  G = g; api = a;
  for (const b of document.querySelectorAll('#town-tabs button')) b.onclick = () => { townTab = b.dataset.tab; resetArm = false; renderTown(); };
  $('#bag-close').onclick = closeBag;
  $('#pause-resume').onclick = resume;
  $('#pause-quit').onclick = () => { $('#pause').classList.add('hidden'); G.mode = 'run'; api.quitRun(); };
  bindKeyboardMouse();
  if (G.isTouch) { bindTouch(); document.body.classList.add('touch'); }
}
