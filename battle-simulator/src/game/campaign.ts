import { DEFS, type UnitKind } from "./units";

export type Pattern = "line" | "block" | "wedge" | "flank" | "arc" | "spots";

export interface EnemyGroup {
  kind: UnitKind; count: number; x: number; z: number; pattern: Pattern;
  /** Hand-placed positions (pattern "spots"). */
  spots?: { x: number; z: number }[];
  /** Garrison id: groups sharing an id hold their ground until an enemy comes close or one of them is hurt. Ids of 100 and up are ambushes, which also move at first blood. */
  guard?: number;
}
/** A rectangle of ground the player may deploy on. */
export interface DeployRect { x0: number; x1: number; z0: number; z1: number }
export const DEFAULT_DEPLOY: readonly DeployRect[] = [{ x0: -76, x1: -3, z0: -50, z1: 50 }];
export interface Stage {
  id: number;
  scene: number;
  name: string;
  hint: string;
  budget: number;
  unlock: UnitKind[];
  enemies: EnemyGroup[];
  /** Where the player deploys, when it is not the usual left half. */
  deploy?: DeployRect[];
  /** Expedition rule: the player may field at most this many of any one kind. */
  kindCap?: number;
}

export interface SceneInfo { id: number; name: string; sub: string; color: string }
export const SCENES: SceneInfo[] = [
  { id: 1, name: "辺境の荒野", sub: "不死の軍勢", color: "#9fc27a" },
  { id: 2, name: "裂け谷", sub: "蛮族の襲撃", color: "#e48a4a" },
  { id: 3, name: "霜の峠", sub: "神秘の守護者と機械兵", color: "#b58cff" },
  { id: 4, name: "王都決戦", sub: "全軍総力戦", color: "#e0503f" },
  { id: 5, name: "砂海の遺跡", sub: "異邦の遠征軍", color: "#e6c36a" },
  { id: 6, name: "世界の果て", sub: "包囲と攻城", color: "#7fd6c8" },
];

/** Available before clearing stage 1. */
export const STARTER_UNITS: UnitKind[] = ["spear", "guardian", "archer"];

type Roster = [UnitKind, number][];

/** One uniform rule for every stage: the player always gets this share of the enemy army's cost. */
export const BUDGET_RATIO = 0.9;
/** Expedition rule of the outland chapters: no more than this many of any one kind in the player's army. */
export const KIND_CAP = 8;
/** Expedition rule of the outland chapters: far from home, the player gets a smaller share of the enemy's cost. */
export const EXPEDITION_RATIO = 0.8;

/**
 * Every enemy army deploys by the same drill, so the player can read it at a glance:
 * shield wall first, polearms behind it, other foot behind them, shooters and casters at the back,
 * healers last, and hunters (assassins, cavalry) split onto both wings.
 */
function formation(army: Roster): EnemyGroup[] {
  const row = (k: UnitKind) => {
    const d = DEFS[k];
    if (d.hunter) return "wing";
    if (d.heal && !d.shield) return "support";
    if (d.ranged) return "shot";
    if ((d.shield ?? 0) >= 0.5) return "wall";
    return d.brace ? "pole" : "foot";
  };
  const out: EnemyGroup[] = [];
  let x = 8;
  for (const r of ["wall", "pole", "foot"]) {
    for (const [kind, count] of army) {
      if (row(kind) !== r) continue;
      const block = r === "foot" && DEFS[kind].radius < 0.9 && count >= 6;
      out.push({ kind, count, x, z: 0, pattern: block ? "block" : "line" });
      x += block ? Math.ceil(Math.sqrt(count)) * 2.3 + 0.6 : 2.8;
    }
  }
  let back = Math.max(22, x + 7);
  for (const r of ["shot", "support"]) {
    for (const [kind, count] of army) {
      if (row(kind) !== r) continue;
      out.push({ kind, count, x: back, z: 0, pattern: "line" });
      back += 3;
    }
  }
  for (const [kind, count] of army) if (row(kind) === "wing") out.push({ kind, count, x: 10, z: 0, pattern: "flank" });
  return out.map(e => ({ ...e, x: Math.round(e.x * 2) / 2 }));
}

const stage = (id: number, name: string, hint: string, unlock: UnitKind[], army: Roster): Stage => {
  const cost = army.reduce((sum, [k, n]) => sum + DEFS[k].cost * n, 0);
  return { id, scene: Math.min(4, Math.ceil(id / 5)), name, hint, unlock, enemies: formation(army), budget: Math.round((cost * BUDGET_RATIO) / 25) * 25 };
};

/* ---- Hand-built deployments for the outland chapters: no two stages share a shape. ---- */

type Spot = [number, number];
/** A rank across the field (along z), centred on z. */
const rank = (n: number, x: number, z = 0, gap = 2.4): Spot[] => Array.from({ length: n }, (_, i) => [x, z + (i - (n - 1) / 2) * gap]);
/** A rank facing north or south (along x), centred on x. */
const across = (n: number, z: number, x = 0, gap = 2.4): Spot[] => Array.from({ length: n }, (_, i) => [x + (i - (n - 1) / 2) * gap, z]);
/** A slanted line: each man one step back and one step across from the last. */
const slant = (n: number, x: number, z: number, dx: number, dz: number): Spot[] => Array.from({ length: n }, (_, i) => [x + i * dx, z + i * dz]);
/** Part of a circle around a point, angles in turns (0 = toward +x, 0.25 = toward +z). */
const circle = (n: number, cx: number, cz: number, r: number, from = 0, sweep = 1): Spot[] => Array.from({ length: n }, (_, i) => {
  const a = (from + (sweep >= 1 ? i / n : n === 1 ? sweep / 2 : (i / (n - 1)) * sweep)) * Math.PI * 2;
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
});
const put = (kind: UnitKind, spots: Spot[], guard?: number): EnemyGroup => ({
  kind, count: spots.length, x: spots[0][0], z: spots[0][1], pattern: "spots",
  spots: spots.map(([x, z]) => ({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 })),
  ...(guard ? { guard } : {}),
});
const custom = (id: number, scene: number, name: string, hint: string, unlock: UnitKind[], enemies: EnemyGroup[], deploy?: DeployRect[]): Stage => {
  const cost = enemies.reduce((sum, g) => sum + DEFS[g.kind].cost * g.count, 0);
  return { id, scene, name, hint, unlock, enemies, budget: Math.round((cost * EXPEDITION_RATIO) / 25) * 25, kindCap: KIND_CAP, ...(deploy ? { deploy } : {}) };
};

export const STAGES: Stage[] = [
  // ---- Scene 1: Borderland Wastes (Undead) ----
  stage(1, "墓地の夜", "骨弓兵の矢は盾兵が止める。ただし盾兵は敵を倒せない。壁の後ろに槍と弓を置き、役割を分けよう。", ["swordsman"], [["zombie", 6], ["skeleton", 8], ["orc", 3], ["bonearcher", 4]]),
  stage(2, "霧の街道", "足の速いスケルトンが射手に取り付くと、弓は撃てなくなる。爆弾は盾を無視して密集を吹き飛ばす。", ["zombie", "skeleton"], [["skeleton", 8], ["orc", 3], ["bonearcher", 4], ["bomber", 2]]),
  stage(3, "廃村の包囲", "オークの大斧は隣の兵まで巻き込む。爆弾兵が2人いるので、固まりすぎず、射手で先に削ろう。", ["crossbow"], [["skeleton", 10], ["orc", 4], ["bonearcher", 4], ["bomber", 3]]),
  stage(4, "朽ちた関所", "呪術師の呪いは範囲内の移動と攻撃を鈍らせる。数で押す骨の群れに、単発の重い矢は間に合わない。", ["cleric"], [["shaman", 1], ["skeleton", 10], ["zombie", 6], ["orc", 2], ["bonearcher", 4], ["bomber", 1]]),
  stage(5, "闇の主", "吸血鬼は斬るたびに回復する。弱い前衛は餌になるだけ。盾で受け、火力を一体に集めて落とせ。", ["halberdier", "bonearcher", "necromancer"], [["vampire", 2], ["skeleton", 16], ["bonearcher", 5], ["bomber", 2]]),

  // ---- Scene 2: Rift Canyon (Warband) ----
  stage(6, "峡谷の哨戒", "投槍は射程こそ短いが盾兵を転ばせる。転んだ兵に盾は効かない。投槍兵に届く手を用意しよう。", ["orc"], [["orc", 7], ["javelin", 6], ["berserker", 2], ["bomber", 1]]),
  stage(7, "赤土の野営", "狂戦士は駆け込んでくる。その速さは槍衾の餌食だ。後衛まで走らせないよう長柄で受け止めよ。", ["javelin"], [["orc", 6], ["berserker", 5], ["javelin", 5], ["shaman", 1], ["bomber", 1]]),
  stage(8, "火薬庫", "爆弾兵が4人。盾も密集も無意味になる。散らして置くか、撃たれる前に爆弾兵を黙らせる手を。", ["berserker", "sapper"], [["orc", 8], ["berserker", 6], ["bomber", 4], ["javelin", 2]]),
  stage(9, "再生する巨体", "トロールは削っても再生する。少しずつ殴るのは無駄だ。重い一撃を集めて一気に倒せ。", ["bomber"], [["troll", 2], ["orc", 6], ["javelin", 5], ["berserker", 4]]),
  stage(10, "巨人の谷", "巨人は歩兵を隊列ごと叩き飛ばす。殴り合わず、弩や投槍の重い射撃を壁の後ろから浴びせよう。", ["shaman", "pirate"], [["giant", 1], ["orc", 6], ["berserker", 4], ["javelin", 4], ["bomber", 2], ["shaman", 1]]),

  // ---- Scene 3: Frost Pass (Mystic) ----
  stage(11, "雪林の関", "エルフはこちらの弓より遠くから射ってくる。ロボットの装甲に軽い矢は通らない。刺客は後衛を狙う。", ["monk"], [["monk", 8], ["robot", 2], ["elf", 6], ["assassin", 4], ["mage", 2]]),
  stage(12, "氷結の坂", "盾壁の後ろから氷と炎が飛ぶ。足を止められた軍は的になる。刺客に張り付かれる前に後衛を守れ。", ["elf"], [["guardian", 4], ["monk", 6], ["robot", 2], ["assassin", 5], ["frost", 2], ["mage", 2], ["elf", 4]]),
  stage(13, "霧隠れの峠", "刺客が7人、両翼から射手を狩りに来る。魔術師は密集を焼く。護衛を付け、隊列は詰めすぎるな。", ["assassin"], [["monk", 8], ["robot", 2], ["mage", 4], ["assassin", 7], ["elf", 4]]),
  stage(14, "魔導陣", "盾・ロボット・僧侶で粘り、魔法で削る持久の陣。回復が追いつかない火力か、後衛を崩す手が要る。", ["mage"], [["guardian", 4], ["monk", 6], ["robot", 2], ["mage", 3], ["frost", 2], ["cleric", 2], ["assassin", 5], ["elf", 3]]),
  stage(15, "氷峰の祭壇", "ゼウスの雷は兵から兵へ走る。数で押すほど被害が増える。ロボットには重い一撃を、雷神には速い刃を。", ["frost", "knight"], [["robot", 4], ["monk", 6], ["zeus", 1], ["mage", 3], ["cleric", 1], ["assassin", 4], ["elf", 3]]),

  // ---- Scene 4: Royal Citadel (All Factions) ----
  stage(16, "外郭門", "王国の正規軍。大盾の壁に矢は通らず、弩と弓が後ろから撃ってくる。壁を壊すのは爆発か回り込みだ。", ["robot", "paladin"], [["guardian", 8], ["halberdier", 5], ["crossbow", 6], ["archer", 6], ["knight", 2], ["cleric", 1]]),
  stage(17, "燃える広場", "重騎兵4騎が後衛へ突っ込んでくる。槍衾なしでは止まらない。爆弾と魔法も密集を狙っている。", ["vampire", "troll"], [["guardian", 6], ["swordsman", 4], ["spear", 6], ["knight", 4], ["bomber", 3], ["mage", 2], ["archer", 6]]),
  stage(18, "王宮回廊", "聖騎士が前線を癒やし、電磁砲が縦列を貫く。縦に並ぶな。刺客6人と騎兵が両翼から来る。", ["king"], [["paladin", 2], ["guardian", 6], ["halberdier", 5], ["railgun", 2], ["assassin", 6], ["knight", 2], ["archer", 4], ["crossbow", 3]]),
  stage(19, "玉座の前", "王の周囲は3割強くなる。戦車の装甲は軽い攻撃を通さない。王と戦車、どちらから崩すか決めて組め。", ["railgun"], [["king", 1], ["tank", 1], ["guardian", 6], ["halberdier", 5], ["spear", 4], ["knight", 2], ["assassin", 5], ["archer", 4], ["crossbow", 4], ["mage", 2], ["cleric", 1]]),
  stage(20, "王都決戦", "王・雷神・大盾・槍衾・騎兵・刺客・弩。弱点のない軍はない。敵のどの兵に何を当てるか、全てを使え。", ["catapult"], [["king", 1], ["zeus", 1], ["guardian", 8], ["spear", 8], ["halberdier", 4], ["knight", 3], ["assassin", 4], ["crossbow", 6], ["cleric", 1]]),

  // ---- Extra: beyond the throne ----
  stage(21, "奈落の門", "樽爆兵は盾壁ごと吹き飛ばし、死霊術師は骨を呼び続け、投石機は遠くから隊列を潰す。待てば負ける。何から黙らせる？", ["giant", "tank", "zeus"],
    [["guardian", 8], ["spear", 8], ["halberdier", 4], ["sapper", 4], ["knight", 3], ["assassin", 4], ["necromancer", 2], ["crossbow", 7], ["elf", 3], ["catapult", 1], ["cleric", 1]]),

  // ---- Scene 5: Ruins of the Sand Sea (Outlanders) ----
  // 22: oblique order. The heavy wing leads and rolls up one flank; the other wing hangs back out of reach.
  custom(22, 5, "斜めの槍壁", "槍と大盾を両方持つ重装槍兵が斜めに並び、厚い右翼から先にぶつかってくる。正面は矢も騎兵も通らない。盾が効かないのは爆発と背後だけだ。薄い左翼は遠く、その外側から騎兵と刺客が回り込む。", ["hoplite"], [
    put("hoplite", slant(8, 8, 30, 1.7, -2.5)),
    put("hoplite", slant(6, 11.5, 31, 1.7, -2.5)),
    put("crossbow", slant(7, 17, 35, 1.7, -2.6)),
    put("halberdier", slant(6, 20.5, 37, 1.9, -2.8)),
    put("mage", [[26, 32], [31, 24]]),
    put("cleric", [[32, 32]]),
    put("javelin", rank(6, 34, -20, 2.6)),
    put("sapper", rank(4, 38, -20, 3)),
    put("knight", [[20, -44], [23, -47], [26, -44], [29, -47], [32, -44]]),
    put("assassin", [[38, -46], [41, -48], [44, -46], [47, -48]]),
  ]),
  // 23: three garrisons under one alarm. Touch one and all of them come.
  custom(23, 5, "蛇の巣", "蛇使いの矢は弱いが、当たった兵の足元に蛇が湧く。蛇に絡まれた射手は撃てず、大物は蛇を叩いて時間を失う。巣は3つ。近づくか傷つけるまで動かないが、一つを突けば全部が動く。吸血鬼と骨の群れは待ってくれない。", ["snakearcher"], [
    put("snakearcher", [[21, -33], [24, -30], [21, -27]], 1), put("crossbow", [[25, -34], [26, -27]], 1), put("hoplite", circle(4, 22, -30, 5, 0.34, 0.32), 1), put("halberdier", [[18, -36], [18, -24]], 1),
    put("snakearcher", [[29, -3], [31, 0], [29, 3]], 1), put("crossbow", [[33, -3], [33, 3]], 1), put("hoplite", circle(4, 30, 0, 5, 0.34, 0.32), 1), put("halberdier", [[26, -6], [26, 6]], 1), put("cleric", [[35, 0]], 1),
    put("snakearcher", [[21, 27], [24, 30], [21, 33]], 1), put("crossbow", [[26, 27], [25, 34]], 1), put("hoplite", circle(4, 22, 30, 5, 0.34, 0.32), 1), put("halberdier", [[18, 24], [18, 36]], 1),
    put("skeleton", [...rank(4, 9, 0, 2.3), ...rank(4, 11.4, 0, 2.3)]),
    put("vampire", [[13, -16], [15, -12], [15, 12], [13, 16]]),
  ]),
  // 24: the ground army comes from the front, the sky army from behind.
  custom(24, 5, "空からの挟撃", "戦乙女は背後の空で待ち、最初の一撃が入った瞬間に射手と僧侶へ舞い降りる。剣と斧は届かない。届くのは射撃・槍・戟・爆風だけ。正面からは北の蛮族の楔が来る。後ろにも前がある。", ["valkyrie"], [
    put("valkyrie", rank(8, -72, 0, 9), 100),
    put("halberdier", circle(8, 17, 0, 11, 0.36, 0.28)),
    { kind: "orc", count: 8, x: 11, z: 0, pattern: "wedge" },
    put("sapper", [[19, -5], [19, 0], [19, 5], [22, -8], [22, 8], [22, 0]]),
    put("troll", [[20, -12], [20, 12]]),
    put("berserker", [...rank(3, 14, -19, 2.4), ...rank(3, 14, 19, 2.4)]),
    put("pirate", rank(6, 28, 0, 5)),
    put("bomber", [[31, -8], [31, 0], [31, 8]]),
    put("shaman", [[34, -4], [34, 4]]),
  ]),
  // 25: a cove. The player may only form up in the channel; both shores and the head of the bay are held.
  custom(25, 5, "引き潮の入り江", "布陣できるのは中央の水路だけ。両岸の銛打ちは、射程に入った兵を一人ずつ岸へ引きずり上げる。盾兵も騎兵も隊列から抜かれる。重い兵と戦車は引けない。敵は動かないが、どこかを突けば三方から閉じてくる。投石機と死霊術師は待ってくれない。", ["harpooner"], [
    put("harpooner", [[-50, -41], [-38, -41], [-26, -41], [-14, -41], [-2, -41]], 1),
    put("harpooner", [[-50, 41], [-38, 41], [-26, 41], [-14, 41], [-2, 41]], 1),
    put("hoplite", [[-44, -38], [-20, -38], [4, -37], [-44, 38], [-20, 38], [4, 37]], 1),
    put("troll", [[-32, -40], [-8, -40], [-32, 40], [-8, 40], [20, 0]], 1),
    put("halberdier", rank(4, 14, 0, 2.6), 1),
    put("berserker", [...rank(3, 18, -9, 2.4), ...rank(3, 18, 9, 2.4)], 1),
    put("pirate", rank(7, 25, 0, 4), 1),
    put("necromancer", [[30, -6], [30, 6]], 1),
    put("railgun", [[36, -3], [36, 3]], 1),
    put("catapult", [[34, -12], [34, 12]], 1),
  ], [{ x0: -76, x1: -3, z0: -24, z1: 24 }]),
  // 26: six masters and one beast, each a different problem. A small, exact fight.
  custom(26, 5, "六人と一頭", "たった六人と一頭。侍は正面から来る矢・弩・投げ槍を刀で斬り払う。ただし一度に一本。爆発と魔法と銃弾は斬れない。忍者は張り付かれても投げ続け、戦乙女は空から来る。そしてマンモスは隊列ごと跳ね上げる。少ない予算で、誰に誰を当てる？", ["samurai"], [
    put("mammoth", [[20, 0]]),
    put("samurai", [[10, -12], [10, 12]]),
    put("mage", [[28, 0]]),
    put("ninja", [[24, -40], [24, 40]]),
    put("valkyrie", [[34, 0]]),
  ]),

  // ---- Scene 6: World's Edge ----
  // 27: the enemy holds the middle; the player may come from both sides at once.
  custom(27, 6, "風の砦", "敵は中央の方陣から動かない。風使いが向いている側から飛ぶ矢・投げ槍・爆弾は、すべて撃ち手に吹き返される。止められないのは魔法と銃砲だけ。今回は左右どちらにも布陣できる。風は一方にしか吹かない。侍は矢を斬り、上空の戦乙女は砲を狙う。", ["fanbearer"], [
    put("fanbearer", [[-10, -4], [-10, 4], [10, -4], [10, 4], [0, -10], [0, 10]], 1),
    put("hoplite", [[-10, -10], [10, -10], [-10, 10], [10, 10], [-10.5, 0], [10.5, 0]], 1),
    put("samurai", [[-7, -11], [7, -11], [-7, 11], [7, 11], [-8, 7], [8, -7]], 1),
    put("crossbow", [[-5, -6], [-5, -2], [-5, 2], [-5, 6], [5, -6], [5, -2], [5, 2], [5, 6]], 1),
    put("bomber", [[-7, -1.5], [7, 1.5], [0, -5]], 1),
    put("mage", [[-2, 3], [2, -3]], 1),
    put("cleric", [[0, 5]], 1),
    put("king", [[0, 0]], 1),
    put("valkyrie", [[-3, -3], [3, -3], [-3, 3], [3, 3]], 1),
  ], [{ x0: -76, x1: -31, z0: -50, z1: 50 }, { x0: 31, x1: 76, z0: -50, z1: 50 }]),
  // 28: batteries at the far edge, a long walk under fire, and a gate that is not what it seems.
  custom(28, 6, "火箭の雨", "火箭車は38mの彼方から一度に16本の火矢を降らせる。盾のない兵は歩くだけで溶け、電磁砲が大物と戦車を撃ち抜く。槍壁の真ん中だけ開いているのは罠だ。奥に樽爆兵と侍、そしてマンモスがいる。砲台に手を出せば、両脇の重騎兵と戦乙女が同時に飛び出してくる。", ["hwacha"], [
    put("hwacha", [[62, -26], [64, 0], [62, 26]], 1),
    put("catapult", [[71, 0]], 1),
    put("railgun", [[60, -13], [60, 13], [68, -20], [68, 20], [66, -7]], 1),
    put("hoplite", [...rank(4, 46, -14, 2.4), ...rank(4, 46, 14, 2.4)], 1),
    put("halberdier", [[48, -22], [48, -9], [48, 9], [48, 22]], 1),
    put("fanbearer", [[50, -26], [50, 26]], 1),
    put("sapper", [[54, -4], [54, 0], [54, 4], [57, -2], [57, 2]], 1),
    put("samurai", [[50, -5], [50, 5], [56, -9], [56, 9]], 1),
    put("mammoth", [[59, 0]], 1),
    put("knight", [[28, 44], [31, 47], [34, 44], [37, 47], [40, 44]], 1),
    put("valkyrie", [[28, -44], [32, -47], [36, -44], [40, -47], [44, -44]], 1),
  ]),
  // 29: the player stands in the middle; beasts on one side, blades and shooters on the other.
  custom(29, 6, "牙と刃のあいだ", "布陣できるのは中央の帯だけ。西からマンモスが隊列ごと跳ね上げに来る。銛でも風でも止まらない。止めるのは槍衾と重い射撃だ。東からは侍と忍者と弩。槍をどちらへ向ける？", ["ninja"], [
    put("mammoth", [[-56, 0], [-61, -15], [-61, 15]]),
    put("berserker", [...rank(4, -50, -28, 2.6), ...rank(4, -50, 28, 2.6)]),
    put("samurai", rank(4, 42, 0, 7)),
    put("harpooner", rank(4, 50, 0, 12)),
    put("crossbow", rank(7, 58, 0, 4)),
    put("ninja", [[48, -40], [54, -34], [60, -42], [48, 40], [54, 34], [60, 42]]),
  ], [{ x0: -13, x1: 13, z0: -46, z1: 46 }]),
  // 30: surrounded. Each side brings a different problem, all at once.
  custom(30, 6, "四面楚歌", "布陣は中央の小さな囲みだけ。北から戦乙女と蛇、西から忍者と銛とトロール、南からマンモス、東から侍と火箭と電磁砲。近い順に来る。四方それぞれに違う答えが要るが、四つが同時に着くわけではない。", ["mammoth"], [
    // north: the nearest, and the first to arrive
    put("valkyrie", across(4, -42, 0, 8)),
    put("snakearcher", [[-8, -37], [0, -38], [8, -37]]),
    put("hoplite", across(4, -33, 0, 2.6)),
    // west
    put("ninja", [[-54, -22], [-58, 0], [-54, 22]]),
    put("harpooner", rank(4, -62, 0, 6)),
    put("pirate", rank(4, -66, 0, 7)),
    put("troll", [[-52, -6], [-52, 6]]),
    put("necromancer", [[-72, 0]]),
    // south
    put("mammoth", [[-9, 46], [9, 46]]),
    put("berserker", [[-3, 43], [3, 43]]),
    put("shaman", [[0, 49]]),
    // east: the farthest, and the last
    put("samurai", rank(4, 60, 0, 3)),
    put("fanbearer", [[64, -8], [64, 8]]),
    put("railgun", [[70, -5], [70, 5]]),
    put("hwacha", [[72, -12], [72, 12]]),
    put("king", [[67, 0]]),
  ], [{ x0: -16, x1: 16, z0: -14, z1: 14 }]),
];

/** Units usable once `cleared` stages are done (0 = nothing cleared yet). */
export function unlockedThrough(cleared: number): UnitKind[] {
  const set = new Set<UnitKind>(STARTER_UNITS);
  for (let i = 0; i < Math.min(cleared, STAGES.length); i++) for (const k of STAGES[i].unlock) set.add(k);
  return [...set];
}

export function stagePositions(gr: EnemyGroup): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = gr.count;
  const sp = 2.3;
  switch (gr.pattern) {
    case "spots":
      for (const p of gr.spots ?? []) out.push({ x: p.x, z: p.z });
      break;
    case "line":
      for (let i = 0; i < n; i++) out.push({ x: gr.x, z: gr.z + (i - (n - 1) / 2) * sp });
      break;
    case "block": {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      for (let i = 0; i < n; i++) out.push({ x: gr.x + Math.floor(i / cols) * sp, z: gr.z + (i % cols - (cols - 1) / 2) * sp });
      break;
    }
    case "wedge": {
      let rank = 0, placed = 0;
      while (placed < n) {
        const inRank = Math.min(n - placed, rank + 1);
        for (let i = 0; i < inRank; i++) out.push({ x: gr.x + rank * sp, z: gr.z + (i - (inRank - 1) / 2) * sp });
        placed += inRank;
        rank++;
      }
      break;
    }
    case "flank": {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const side = i < half ? -1 : 1;
        const idx = i < half ? i : i - half;
        const per = i < half ? half : n - half;
        out.push({ x: gr.x + (idx % 3) * sp, z: side * 16 + (Math.floor(idx / 3) - (Math.ceil(per / 3) - 1) / 2) * sp });
      }
      break;
    }
    case "arc": {
      const spread = Math.min(Math.PI * 0.9, 0.34 * n);
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : -spread / 2 + (i / (n - 1)) * spread;
        out.push({ x: gr.x + Math.abs(Math.sin(a)) * 6, z: gr.z + Math.cos(a) * 12 });
      }
      break;
    }
  }
  return out;
}

/** "5-3": chapter and the stage's place within it. */
export function stageLabel(stage: Stage): string {
  return `${stage.scene}-${STAGES.filter(s => s.scene === stage.scene && s.id <= stage.id).length}`;
}

export function enemyCost(stage: Stage): number {
  return stage.enemies.reduce((sum, e) => sum + DEFS[e.kind].cost * e.count, 0);
}

/** Enemy head-count per kind, in deployment order, for the pre-battle briefing. */
export function enemyRoster(stage: Stage): [UnitKind, number][] {
  const m = new Map<UnitKind, number>();
  for (const e of stage.enemies) m.set(e.kind, (m.get(e.kind) ?? 0) + e.count);
  return [...m];
}

/* ---- progress persistence ---- */

const KEY = "ebs.story.cleared";
let memoryCleared = 0;

export function loadCleared(): number {
  try {
    if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) {
          memoryCleared = Math.max(memoryCleared, Math.max(0, Math.min(STAGES.length, n)));
        }
      }
    }
  } catch {
    /* storage blocked or unavailable — fall back to in-memory state */
  }
  return memoryCleared;
}

export function saveCleared(cleared: number) {
  const clamped = Number.isFinite(cleared) ? Math.max(0, Math.min(STAGES.length, Math.floor(cleared))) : 0;
  memoryCleared = Math.max(memoryCleared, clamped);
  try {
    if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
      window.localStorage.setItem(KEY, String(memoryCleared));
    }
  } catch {
    /* storage blocked or unavailable — progress remains preserved in memoryCleared */
  }
}
