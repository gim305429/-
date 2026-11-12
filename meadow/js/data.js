// 게임 데이터. 카드·몬스터·장비를 추가할 때는 이 파일의 표에 한 줄만 더한다.

export const CLASSES = {
  warrior: { name: '전사', role: '탱커', hp: 160, speed: 5.0, color: 0xc9643c,
    lmb: '검 베기', rmb: '방패 막기', q: '전투 함성', qcd: 12, families: ['방패', '검', '함성'] },
  cleric: { name: '성직자', role: '힐러', hp: 120, speed: 5.0, color: 0xf2d27a,
    lmb: '성광탄', rmb: '치유', q: '성역', qcd: 15, families: ['빛', '치유', '성역'] },
  mage: { name: '마법사', role: '원거리 딜러', hp: 100, speed: 5.2, color: 0x8a6bd1,
    lmb: '마력탄 / 화염구', rmb: '순간이동', q: '서리 폭발', qcd: 10, families: ['불', '번개', '서리'] },
  archer: { name: '궁수', role: '원거리 딜러', hp: 110, speed: 5.5, color: 0x6fae5c,
    lmb: '활 쏘기', rmb: '조준', q: '화살비', qcd: 12, families: ['정밀', '다발', '기동'] },
};
export const CLASS_IDS = Object.keys(CLASSES);

// 카드: id, cls(직업 또는 common), fam(계열), name, d(설명, X 자리에 수치), v([일반,희귀,영웅]), f(표시 형식)
// 전설 카드는 v 없이 L:true
const C = (id, cls, fam, name, d, v, f) => ({ id, cls, fam, name, d, v, f });
const L = (id, cls, fam, name, d) => ({ id, cls, fam, name, d, L: true });

export const CARDS = [
  // 전사
  C('w_reflect', 'warrior', '방패', '반격의 방패', '막은 피해의 X를 되돌려줌', [0.2, 0.35, 0.5], 'p'),
  C('w_sturdy', 'warrior', '방패', '단단한 방패', '막기 피해 감소 +X', [0.05, 0.08, 0.12], 'pp'),
  C('w_bash', 'warrior', '방패', '방패 돌진', '막는 중 좌클릭하면 4m 돌진, 피해 X', [20, 35, 50], 'n'),
  C('w_wall', 'warrior', '방패', '철벽 이동', '막는 중 이동속도 50% → X', [0.65, 0.75, 0.9], 'p'),
  C('w_riposte', 'warrior', '방패', '반격 태세', '막은 직후 1초간 다음 베기 피해 +X', [0.3, 0.5, 0.8], 'p'),
  C('w_spin', 'warrior', '검', '회전 베기', '3번째 연속 베기가 360°, 피해 ×X', [1.2, 1.4, 1.7], 'x'),
  C('w_sharp', 'warrior', '검', '날카로운 검', '베기 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('w_leech', 'warrior', '검', '흡혈 검', '베기 피해의 X 회복', [0.04, 0.07, 0.1], 'p'),
  C('w_wide', 'warrior', '검', '넓은 베기', '베기 범위 90° → X', [120, 140, 160], 'deg'),
  C('w_exec', 'warrior', '검', '처형', '체력 25% 이하 적에게 피해 +X', [0.3, 0.5, 0.8], 'p'),
  C('w_roar', 'warrior', '함성', '우렁찬 함성', '함성 기절 +X', [0.5, 1, 1.5], 's'),
  C('w_will', 'warrior', '함성', '전투 의지', '함성 쿨 −X', [2, 3, 4], 's'),
  C('w_rage', 'warrior', '함성', '분노', '함성 후 6초간 공격속도 +X', [0.15, 0.25, 0.35], 'p'),
  C('w_unyield', 'warrior', '함성', '불굴', '체력 30% 이하일 때 받는 피해 −X', [0.15, 0.25, 0.35], 'p'),
  C('w_intim', 'warrior', '함성', '위압', '함성에 맞은 적이 5초간 받는 피해 +X', [0.1, 0.18, 0.25], 'p'),
  L('wL_giant', 'warrior', '방패', '거인의 방패', '막은 피해를 모았다가 우클릭을 놓으면 전방 폭발로 2배를 돌려줌'),
  L('wL_wave', 'warrior', '검', '검기', '베기가 검기를 날려 8m 앞까지 베기 피해의 60%'),
  L('wL_drum', 'warrior', '함성', '전쟁의 북', '함성 쿨 절반, 함성마다 체력 15% 회복'),
  // 성직자
  C('c_multi', 'cleric', '빛', '다중 성광', '성광탄 X발 추가 (부채꼴)', [1, 2, 3], 'shot'),
  C('c_pure', 'cleric', '빛', '정화의 빛', '성광탄 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('c_pierce', 'cleric', '빛', '관통하는 빛', '성광탄이 적 X명 관통', [1, 2, 3], 'cnt'),
  C('c_mark', 'cleric', '빛', '빛의 표식', '성광탄에 맞은 적이 3초간 받는 피해 +X', [0.08, 0.14, 0.2], 'p'),
  C('c_swift', 'cleric', '빛', '신속한 기도', '성광탄 발사 간격 −X', [0.1, 0.18, 0.25], 'p'),
  C('c_judg', 'cleric', '치유', '심판의 빛', '치유할 때 주변 4m 적에게 치유량의 X 피해', [0.5, 0.8, 1.2], 'p'),
  C('c_deep', 'cleric', '치유', '깊은 치유', '치유량 +X', [0.2, 0.35, 0.5], 'p'),
  C('c_grace', 'cleric', '치유', '넘치는 은총', '마나 회복 +X', [0.3, 0.5, 0.75], 'p'),
  C('c_armor', 'cleric', '치유', '축복의 갑옷', '치유 후 3초간 받는 피해 −X', [0.1, 0.18, 0.25], 'p'),
  C('c_thrift', 'cleric', '치유', '절약', '치유 마나 비용 25 → X', [20, 17, 13], 'n'),
  C('c_wide', 'cleric', '성역', '넓은 성역', '성역 반경 +X', [1.5, 2.5, 3.5], 'm'),
  C('c_long', 'cleric', '성역', '긴 성역', '성역 지속 +X', [1.5, 2.5, 4], 's'),
  C('c_holy', 'cleric', '성역', '신성한 땅', '성역 안의 적에게 초당 X 피해', [6, 10, 15], 'n'),
  C('c_haste', 'cleric', '성역', '성역 가속', '성역 안에서 이동속도 +X', [0.1, 0.18, 0.25], 'p'),
  C('c_quick', 'cleric', '성역', '빠른 축성', '성역 쿨 −X', [2, 3, 5], 's'),
  L('cL_sun', 'cleric', '빛', '태양의 창', '성광탄 5발째마다 관통하는 거대한 빛줄기, 피해 80'),
  L('cL_angel', 'cleric', '치유', '수호 천사', '한 판에 1번, 죽을 때 체력 100%로 부활하고 3초 무적'),
  L('cL_walk', 'cleric', '성역', '걸어 다니는 성역', '성역이 나를 따라다님'),
  // 마법사
  C('m_big', 'mage', '불', '거대 화염구', '화염구 폭발 반경 +X', [0.25, 0.4, 0.6], 'p'),
  C('m_fast', 'mage', '불', '빠른 영창', '차지 시간 −X', [0.15, 0.25, 0.4], 'p'),
  C('m_burn', 'mage', '불', '화상', '화염구에 맞은 적이 3초간 초당 X 피해', [4, 7, 10], 'n'),
  C('m_chain', 'mage', '불', '연쇄 폭발', '화염구로 죽은 적이 터져 주변에 X 피해', [15, 25, 40], 'n'),
  C('m_focus', 'mage', '불', '불꽃 집중', '화염구 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('m_arc', 'mage', '번개', '연쇄 번개', '마력탄이 주변 적 X명에게 튐 (각 50% 피해)', [1, 2, 3], 'cnt'),
  C('m_rapid', 'mage', '번개', '속사', '마력탄 발사 간격 −X', [0.1, 0.18, 0.25], 'p'),
  C('m_shock', 'mage', '번개', '감전', '마력탄에 맞은 적이 X 확률로 1초 기절', [0.1, 0.18, 0.25], 'p'),
  C('m_over', 'mage', '번개', '과충전', '마력탄 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('m_static', 'mage', '번개', '정전기', '마력탄 3발마다 주변 3m에 X 피해', [10, 18, 25], 'n'),
  C('m_ice', 'mage', '서리', '서리 갑옷', '순간이동 후 2초간 받는 피해 −X', [0.25, 0.4, 0.6], 'p'),
  C('m_perma', 'mage', '서리', '영구 동토', '서리 폭발이 X 동안 얼음 장판을 남김', [2, 3, 4], 's'),
  C('m_cold', 'mage', '서리', '혹한', '둔화 50% → X', [0.6, 0.7, 0.8], 'p'),
  C('m_blink', 'mage', '서리', '순간 영창', '순간이동 쿨 −X', [1, 1.5, 2], 's'),
  C('m_shard', 'mage', '서리', '얼음 파편', '서리 폭발 피해 +X', [0.2, 0.35, 0.5], 'p'),
  L('mL_meteor', 'mage', '불', '유성', '2초 이상 차지하면 조준 지점에 유성, 반경 5m 피해 120'),
  L('mL_storm', 'mage', '번개', '폭풍의 눈', '주변 6m 적에게 1초마다 번개 (마력탄 피해의 50%)'),
  L('mL_stop', 'mage', '서리', '시간 정지', '서리 폭발이 적을 3초간 완전히 얼림, 대신 쿨 +4초'),
  // 궁수
  C('a_eye', 'archer', '정밀', '매의 눈', '약점 배율 ×2에 +X', [0.25, 0.4, 0.6], 'n'),
  C('a_hand', 'archer', '정밀', '빠른 손', '당기는 시간 −X', [0.1, 0.18, 0.25], 'p'),
  C('a_bow', 'archer', '정밀', '강궁', '끝까지 당긴 화살 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('a_focus', 'archer', '정밀', '집중', '조준 중 치명타 확률 +X', [0.08, 0.14, 0.2], 'p'),
  C('a_mark', 'archer', '정밀', '사냥 표식', '약점에 맞은 적이 4초간 받는 피해 +X', [0.08, 0.14, 0.2], 'p'),
  C('a_tri', 'archer', '다발', '세 갈래 화살', '양옆 화살 2발 추가, 각 X 피해', [0.3, 0.45, 0.6], 'p'),
  C('a_pierce', 'archer', '다발', '관통', '화살이 적 X명 관통', [1, 2, 3], 'cnt'),
  C('a_blast', 'archer', '다발', '폭발 화살', '끝까지 당긴 화살이 반경 X로 터짐 (피해 50%)', [2, 2.5, 3], 'm'),
  C('a_wide', 'archer', '다발', '넓은 화살비', '화살비 반경 +X', [1, 1.5, 2.5], 'm'),
  C('a_long', 'archer', '다발', '긴 화살비', '화살비 지속 +X', [1, 1.5, 2.5], 's'),
  C('a_roll', 'archer', '기동', '구르기', '대시 쿨 −X', [0.4, 0.7, 1], 's'),
  C('a_wind', 'archer', '기동', '바람걸음', '이동속도 +X', [0.06, 0.1, 0.15], 'p'),
  C('a_reflex', 'archer', '기동', '사냥꾼의 반사', '대시 후 다음 화살 피해 +X', [0.25, 0.4, 0.6], 'p'),
  C('a_trap', 'archer', '기동', '덫', '대시한 자리에 덫, 밟은 적 X 속박', [1, 1.5, 2], 's'),
  C('a_range', 'archer', '기동', '거리 유지', '10m 밖 적에게 피해 +X', [0.08, 0.14, 0.2], 'p'),
  L('aL_breath', 'archer', '정밀', '저격수의 숨', '조준하는 동안 주변 시간이 50% 느려짐'),
  L('aL_storm', 'archer', '다발', '화살 폭풍', '모든 화살이 5갈래, 옆 화살도 피해 100%'),
  L('aL_dance', 'archer', '기동', '바람의 춤', '대시 2회 충전, 대시 중 무적'),
  // 공용
  C('k_train', 'common', '공격', '단련', '공격력 +X', [0.06, 0.1, 0.15], 'p'),
  C('k_sharp', 'common', '공격', '날카로움', '치명타 확률 +X', [0.04, 0.07, 0.1], 'p'),
  C('k_cruel', 'common', '공격', '잔혹함', '치명 피해 +X', [0.15, 0.25, 0.4], 'p'),
  C('k_ambush', 'common', '공격', '기습', '체력이 가득 찬 적에게 피해 +X', [0.15, 0.25, 0.4], 'p'),
  C('k_combo', 'common', '공격', '연속 공격', '같은 적을 연속으로 맞히면 피해 +X씩 (최대 5중첩)', [0.02, 0.03, 0.04], 'p'),
  C('k_giant', 'common', '공격', '거인 사냥꾼', '정예·골렘·보스에게 피해 +X', [0.08, 0.14, 0.2], 'p'),
  C('k_tough', 'common', '생존', '강인함', '최대 체력 +X', [0.08, 0.14, 0.2], 'p'),
  C('k_regen', 'common', '생존', '재생', '초당 최대 체력의 X 회복', [0.005, 0.008, 0.012], 'p1'),
  C('k_armor', 'common', '생존', '갑옷', '받는 피해 −X', [0.05, 0.08, 0.12], 'p'),
  C('k_kill', 'common', '생존', '처치 회복', '적 처치 시 체력 X 회복', [2, 4, 6], 'n'),
  C('k_escape', 'common', '생존', '위기 탈출', '체력이 30% 아래로 떨어지면 2초 무적, 쿨 X', [60, 45, 30], 's'),
  C('k_thorns', 'common', '생존', '가시 피부', '나를 근접 공격한 적에게 X 피해', [5, 9, 14], 'n'),
  C('k_run', 'common', '기동', '질주', '이동속도 +X', [0.05, 0.08, 0.12], 'p'),
  C('k_dash', 'common', '기동', '날쌘 대시', '대시 쿨 −X', [0.3, 0.5, 0.8], 's'),
  C('k_cast', 'common', '기동', '짧은 영창', 'Q 쿨 −X', [0.08, 0.14, 0.2], 'p'),
  C('k_react', 'common', '기동', '순간 반응', '대시 직후 1초간 피해 +X', [0.1, 0.18, 0.25], 'p'),
  C('k_magnet', 'common', '기동', '자석', '줍기 범위 +X', [2, 4, 6], 'm'),
  C('k_luck', 'common', '행운', '행운', '희귀 이상 장비 드랍 확률 +X', [0.02, 0.03, 0.05], 'pp'),
  C('k_treasure', 'common', '행운', '보물 감각', '보상 상자 재료 +X', [0.2, 0.35, 0.5], 'p'),
  C('k_cardsense', 'common', '행운', '카드 감각', '카드 선택지 희귀 이상 확률 +X', [0.05, 0.08, 0.12], 'pp'),
  C('k_collect', 'common', '행운', '수집가', '적 처치 시 X 확률로 재료 1 추가', [0.2, 0.35, 0.5], 'p'),
  C('k_reroll', 'common', '행운', '다시 뽑기', '이번 판 다시 뽑기 +X', [1, 2, 3], 'cntr'),
  L('kL_glass', 'common', '공격', '유리 대포', '공격력 +60%, 대신 최대 체력 −40%'),
  L('kL_vamp', 'common', '생존', '흡혈귀', '주는 모든 피해의 6% 회복, 대신 다른 회복 효과 절반'),
  L('kL_time', 'common', '기동', '시간 왜곡', '모든 쿨타임 −30%'),
  L('kL_wind', 'common', '기동', '바람의 축복', '이동속도 +25%, 대시로 지나친 적에게 피해 30'),
  L('kL_gold', 'common', '행운', '황금 손', '이번 판 보스 드랍 장비가 1등급 높게 나옴'),
  L('kL_star', 'common', '행운', '행운의 별', '이후 카드 선택지가 4장, 전설 확률 2배'),
];
export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

export const TIERS = ['일반', '희귀', '영웅', '전설'];
export const TIER_COLORS = ['#f4f1e8', '#5fa8e8', '#b07de0', '#f0a040'];
// 층별 카드 등급 확률 [일반, 희귀, 영웅, 전설]
export const CARD_TIER_ODDS = [
  [0.70, 0.24, 0.05, 0.01], [0.62, 0.28, 0.08, 0.02], [0.54, 0.31, 0.12, 0.03],
  [0.46, 0.34, 0.16, 0.04], [0.38, 0.36, 0.20, 0.06], [0.38, 0.36, 0.20, 0.06],
];

export function fmtCardValue(card, tier) {
  const v = card.v[tier];
  switch (card.f) {
    case 'p': return `${Math.round(v * 100)}%`;
    case 'p1': return `${(v * 100).toFixed(1)}%`;
    case 'pp': return `${Math.round(v * 100)}%p`;
    case 's': return `${v}초`;
    case 'm': return `${v}m`;
    case 'x': return `${v}`;
    case 'deg': return `${v}°`;
    case 'shot': return `${v}`;
    case 'cnt': return `${v}`;
    case 'cntr': return `${v}회`;
    default: return `${v}`;
  }
}
export function cardText(card, tier) {
  if (card.L) return card.d;
  return card.d.replace('X', fmtCardValue(card, tier));
}

// 몬스터: 행동 유형(type)을 돌려 쓰고 수치·특징만 다르게
export const MONSTERS = {
  mushroom: { name: '버섯 괴물', type: 'rush', hp: 40, atk: 8, speed: 3.5, r: 0.45, h: 1.0, floor: 1, xp: 5, color: 0xd9614c, poisonOnDeath: true },
  bat: { name: '박쥐 떼', type: 'flyer', hp: 18, atk: 5, speed: 6.0, r: 0.35, h: 0.5, floor: 1, xp: 3, color: 0x5b4a7a, group: 3 },
  vine: { name: '덩굴 뱀', type: 'ambush', hp: 35, atk: 10, speed: 4.0, r: 0.4, h: 0.8, floor: 1, xp: 5, color: 0x4f8f45 },
  petal: { name: '꽃잎 정령', type: 'shooter', hp: 30, atk: 7, speed: 3.0, r: 0.4, h: 1.2, floor: 1, xp: 6, color: 0xf2a6c8, keep: 8 },
  knight: { name: '유적 기사', type: 'shield', hp: 80, atk: 14, speed: 3.0, r: 0.5, h: 1.8, floor: 2, xp: 10, color: 0x9aa3ad, front: 0.5 },
  roller: { name: '구르는 돌정령', type: 'bomber', hp: 30, atk: 20, speed: 5.0, r: 0.5, h: 1.0, floor: 2, xp: 6, color: 0xb8ae9c },
  golem: { name: '이끼 골렘', type: 'tank', hp: 120, atk: 18, speed: 2.0, r: 0.8, h: 2.2, floor: 3, xp: 20, color: 0x7fa36b, big: true },
  shaman: { name: '버섯 주술사', type: 'support', hp: 50, atk: 0, speed: 2.5, r: 0.45, h: 1.3, floor: 3, xp: 12, color: 0xa36bd1, keep: 7 },
  rarcher: { name: '유적 궁수', type: 'shooter', hp: 45, atk: 12, speed: 3.0, r: 0.45, h: 1.7, floor: 3, xp: 10, color: 0xc2b28a, keep: 11, telegraph: true },
  wolf: { name: '바람 늑대', type: 'rush', hp: 60, atk: 12, speed: 7.0, r: 0.55, h: 1.0, floor: 4, xp: 12, color: 0xbcd4e0, group: 3, flank: true },
  turtle: { name: '수정 거북', type: 'tank', hp: 150, atk: 15, speed: 1.5, r: 0.9, h: 1.3, floor: 4, xp: 25, color: 0x6aa6a0, big: true, backCrystal: true },
  shadow: { name: '그림자 기사', type: 'shield', hp: 100, atk: 20, speed: 3.5, r: 0.5, h: 1.9, floor: 5, xp: 25, color: 0x4a4560, front: 0.5, teleport: true },
};

export const ELITE_AFFIXES = [
  { id: 'fast', name: '빠른' }, { id: 'tough', name: '단단한' }, { id: 'burning', name: '불타는' },
  { id: 'split', name: '분열하는' }, { id: 'vamp', name: '흡혈하는' },
];

export const BOSSES = {
  queen: { name: '버섯 여왕', mid: true, hp: 600, xp: 100, color: 0xd9614c, r: 1.3, h: 3.0 },
  gate: { name: '유적 수문장', mid: true, hp: 700, xp: 100, color: 0x8f98a3, r: 1.2, h: 3.4 },
  thorn: { name: '가시심장', mid: false, hp: 1500, xp: 200, color: 0x7a5a3a, r: 2.6, h: 7.0, unlockAfter: null },
  turtleking: { name: '수정 거북왕', mid: false, hp: 1800, xp: 250, color: 0x5d9c96, r: 2.6, h: 3.0, unlockAfter: 'thorn' },
};
export const FINAL_ORDER = ['thorn', 'turtleking']; // 데모에 들어간 최종 보스 해금 순서

// 장비
export const RARITY = ['일반', '고급', '희귀', '영웅', '전설'];
export const RARITY_COLORS = ['#f4f1e8', '#7ccf6a', '#5fa8e8', '#b07de0', '#f0a040'];
export const RARITY_MULT = [1, 1.15, 1.3, 1.5, 1.75];
export const RARITY_ODDS = [0.60, 0.25, 0.10, 0.04, 0.01];
export const SALVAGE = [5, 10, 20, 40, 80];
export const GRADE_COST_MULT = [1, 1.5, 2, 3, 4];
export const ENHANCE_RATE = [1, 1, 1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5]; // +1~+10

export const AFFIXES = {
  atk: { name: '공격력', min: 0.03, max: 0.08, f: 'p' },
  hp: { name: '최대 체력', min: 0.04, max: 0.10, f: 'p' },
  crit: { name: '치명타 확률', min: 0.02, max: 0.06, f: 'p' },
  critDmg: { name: '치명 피해', min: 0.10, max: 0.25, f: 'p' },
  move: { name: '이동속도', min: 0.03, max: 0.07, f: 'p' },
  cdr: { name: '스킬 쿨', min: 0.04, max: 0.10, f: 'neg' },
  leech: { name: '흡혈', min: 0.01, max: 0.03, f: 'p' },
  dr: { name: '받는 피해', min: 0.02, max: 0.06, f: 'neg' },
};

export const WEAPON_NAMES = { warrior: '검과 방패', cleric: '지팡이', mage: '마법서', archer: '활' };
export const ARMOR_NAMES = ['가죽 갑옷', '사슬 갑옷', '여행자 로브'];
export const TRINKET_NAMES = ['반지', '목걸이', '부적'];
export const RARITY_PREFIX = ['낡은', '쓸 만한', '빛나는', '영웅의', '전설의'];

// 전설 고유 효과
export const UNIQUES = {
  u_shock: { slot: 'weapon', cls: 'warrior', name: '충격파 방패', d: '막을 때마다 3m 충격파, 피해 20' },
  u_life: { slot: 'weapon', cls: 'cleric', name: '생명의 지팡이', d: '성광탄이 맞으면 체력 2 회복' },
  u_phoenix: { slot: 'weapon', cls: 'mage', name: '불사조 마법서', d: '화염구가 터질 때 작은 화염구 3개' },
  u_windbow: { slot: 'weapon', cls: 'archer', name: '바람의 활', d: '끝까지 당긴 화살 속도 ×2, 무한 관통' },
  u_cloak: { slot: 'armor', name: '초원의 망토', d: '대시 후 1초 무적' },
  u_star: { slot: 'trinket', name: '별의 목걸이', d: '적 처치 시 Q 쿨 −1초' },
  // 보스 전용
  b_spore: { slot: 'armor', boss: 'queen', name: '포자 망토', d: '맞으면 발밑에 3초 독 장판' },
  b_crest: { slot: 'trinket', boss: 'gate', name: '수문장의 문장', d: '정면에서 받는 피해 −20%' },
  b_vine: { slot: 'armor', boss: 'thorn', name: '가시 덩굴 갑옷', d: '나를 근접 공격한 적을 2초 속박' },
  b_shell: { slot: 'armor', boss: 'turtleking', name: '수정 등껍질', d: '5초마다 피해 1회를 막는 보호막' },
};

// 방 템플릿: 장애물(기둥·바위) 원 목록 [x, z, 반지름, 종류]
export const ROOMS = [
  { name: '무너진 회랑', obs: [[-8, -6, 1, 'pillar'], [-8, 2, 1, 'pillar'], [8, -6, 1, 'pillar'], [8, 2, 1, 'pillar'], [0, 9, 1.6, 'rock']] },
  { name: '세 바위 언덕', obs: [[-6, 4, 2, 'rock'], [7, 5, 1.8, 'rock'], [0, -7, 2.2, 'rock']] },
  { name: '돌기둥 숲', obs: [[-10, 0, 0.9, 'pillar'], [-5, 7, 0.9, 'pillar'], [5, 7, 0.9, 'pillar'], [10, 0, 0.9, 'pillar'], [5, -7, 0.9, 'pillar'], [-5, -7, 0.9, 'pillar']] },
  { name: '부서진 성벽', obs: [[-9, 3, 1.1, 'wall'], [-7, 3, 1.1, 'wall'], [7, -3, 1.1, 'wall'], [9, -3, 1.1, 'wall'], [0, 0, 1.4, 'pillar']] },
  { name: '빈 광장', obs: [[0, 10, 1.2, 'pillar'], [0, -10, 1.2, 'pillar']] },
  { name: '아치의 정원', obs: [[-4, 0, 1, 'pillar'], [4, 0, 1, 'pillar'], [-11, -8, 1.8, 'rock'], [11, 8, 1.8, 'rock'], [11, -8, 1.2, 'pillar'], [-11, 8, 1.2, 'pillar']] },
];

export const ARENA_R = 22;
export const LEVEL_CAP = 10;
export const xpForLevel = L => Math.round(100 * Math.pow(L, 1.5));
