import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GEO, M, TEAM_COLORS, type TeamId, type UnitKind } from "./units";

/* ============================================================
   Character rigs. Every rig faces +Z (facing = atan2(x, z)).
   Static meshes of each bone are merged into one vertex-coloured
   geometry, so posing a unit costs ~10 matrix updates per frame.
   ============================================================ */

export interface Spring { x: number; v: number }
export interface RigPart { group: THREE.Group; geometry: THREE.BufferGeometry; material: THREE.Material }
export type HandMode = "fixed" | "follow";

export interface UnitRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hand: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  lArm: THREE.Group;
  rArm: THREE.Group;
  cloak: THREE.Group | null;
  /** Knee joints of two-legged rigs: everything below the knee hangs off these. */
  lShin?: THREE.Group;
  rShin?: THREE.Group;
  /** Farthest point of the held weapon, in the hand's local space (the blade tip for trails). */
  tip: THREE.Vector3;
  flLeg?: THREE.Group;
  frLeg?: THREE.Group;
  blLeg?: THREE.Group;
  brLeg?: THREE.Group;
  headH: number;
  heavy: boolean;
  scale: number;
  tilt: number;
  kind: UnitKind;
  handMode: HandMode;
  handRest: number;
  parts: RigPart[];
  fx: Record<string, Spring>;
}

const PI = Math.PI;
const dark = (c: number, f = 0.55) => new THREE.Color(c).multiplyScalar(f).getHex();
const light = (c: number, f = 0.35) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), f).getHex();
const bCache = new Map<number, THREE.MeshBasicMaterial>();
const B = (c: number) => {
  let m = bCache.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); bCache.set(c, m); }
  return m;
};
const STEEL = 0xaab3c2, STEEL_LIGHT = 0xdce3ed, STEEL_DARK = 0x5c6472, IRON = 0x434954;
const GOLD = 0xe0b04a, GOLD_LIGHT = 0xf5d478, BRASS = 0xb88a3e, COPPER = 0xc87442;
const LEATHER = 0x523a24, LEATHER_DARK = 0x2f2114, BONE = 0xe8e0c8, BONE_DARK = 0xc7bea2;
const steel = (c = STEEL) => M(c, 0.32, 0.82);
const gold = (c = GOLD) => M(c, 0.28, 0.85);
const leather = (c = LEATHER) => M(c, 0.78, 0.08);
const cloth = (c: number) => M(c, 0.88, 0.04);
const boneMat = (c = BONE) => M(c, 0.68, 0.06);

/**
 * Chooses the form of a block from its proportions, so nothing on a unit is a raw cube:
 * rods become pills, plates keep crisp chamfered edges, and chunky volumes become soft rounded blocks.
 */
function sculpt(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const dims = [sx, sy, sz];
  const hi = Math.max(sx, sy, sz), lo = Math.min(sx, sy, sz);
  const mid = sx + sy + sz - hi - lo;
  if (hi < 0.09) return GEO.box;
  if (lo < 0.07 || lo < mid * 0.34) {
    // Square slabs lying flat (headbands, hat brims, bases) are discs; other plates keep crisp chamfers.
    if (lo === sy && sy >= 0.03 && hi <= mid * 1.25 && hi >= 0.3) return GEO.pillY;
    return lo >= 0.03 ? GEO.bevel : GEO.box;
  }
  if (hi >= mid * 1.7 && mid <= lo * 1.7) return [GEO.pillX, GEO.pillY, GEO.pillZ][dims.indexOf(hi)];
  return GEO.soft;
}

function part(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  if (geo === GEO.box) geo = sculpt(sx, sy, sz);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/* ============ faces: every humanoid shares one eye construction ============ */

interface Face {
  sep?: number; y?: number; z?: number; size?: number;
  sclera?: number; pupil?: number; brow?: number; browColor?: number;
  uneven?: boolean; look?: number; lookY?: number;
  mouth?: "smile" | "flat" | "open" | "grin" | "none";
  socket?: boolean;
}

function addFace(head: THREE.Group, skin: number, f: Face = {}) {
  const sep = f.sep ?? 0.105, y = f.y ?? 0.03, z = f.z ?? 0.222, r = f.size ?? 0.064;
  const skinDark = dark(skin, 0.74);
  const lip = dark(skin, 0.5);
  // Monsters keep a coloured eyeball; everyone else gets clean, dark, glossy eyes.
  const beast = f.sclera !== undefined;
  for (const s of [-1, 1]) {
    const k = f.uneven && s > 0 ? 1.35 : 1;
    const ex = s * sep, ez = z + 0.012;
    if (f.socket) {
      part(head, GEO.sph, B(0x0b0907), r * 1.5, r * 1.7, r * 0.8, ex, y, z);
      part(head, GEO.sph, B(f.pupil ?? 0x7fe8ff), r * 0.52, r * 0.52, r * 0.4, ex, y - 0.005, z + r * 0.44);
      part(head, GEO.sph, B(0xffffff), r * 0.18, r * 0.18, r * 0.12, ex + r * 0.12, y + r * 0.12, z + r * 0.7);
    } else if (beast) {
      part(head, GEO.sph, M(skinDark, 0.7), r * 1.22 * k, r * 1.02 * k, r * 0.5, ex, y, ez - 0.016);
      part(head, GEO.sph, B(f.sclera!), r * 1.0 * k, r * 0.8 * k, r * 0.5, ex, y, ez);
      part(head, GEO.sph, B(f.pupil ?? 0x16110d), r * 0.46 * k, r * 0.6 * k, r * 0.36,
        ex * 0.96 + (f.look ?? 0) * r * 0.25 * (f.uneven && s > 0 ? -1 : 1), y + (f.lookY ?? 0) * r * 0.3, ez + r * 0.3);
      part(head, GEO.sph, B(0xffffff), r * 0.15, r * 0.15, r * 0.1, ex + r * 0.2, y + r * 0.26, ez + r * 0.5);
    } else {
      part(head, GEO.sph, B(f.pupil ?? 0x1d1611), r * 0.62 * k, r * 0.86 * k, r * 0.34, ex, y, ez);
      part(head, GEO.sph, B(0xffffff), r * 0.2 * k, r * 0.24 * k, r * 0.12, ex + r * 0.2, y + r * 0.36, ez + r * 0.26);
      part(head, GEO.sph, B(0xdfe9f5), r * 0.1, r * 0.1, r * 0.08, ex - r * 0.18, y - r * 0.34, ez + r * 0.26);
    }
    if (f.brow !== undefined || !f.socket) {
      const by = y + r * (beast ? 1.35 : 1.5) * k;
      part(head, GEO.pillX, B(f.browColor ?? 0x2a1d12), r * 1.7, r * 0.3, r * 0.4, ex, by + Math.abs(f.brow ?? 0) * r * 0.5, z + 0.012, 0, s * 0.18, s * (f.brow ?? 0) * 1.15);
    }
  }
  const mouth = f.mouth ?? "smile";
  if (mouth === "smile") {
    part(head, GEO.pillX, B(lip), 0.07, 0.016, 0.02, 0, -0.118, 0.244);
    for (const s of [-1, 1]) part(head, GEO.pillX, B(lip), 0.034, 0.016, 0.02, s * 0.044, -0.109, 0.238, 0, s * 0.3, s * 0.6);
  } else if (mouth === "flat") {
    part(head, GEO.pillX, B(lip), 0.078, 0.016, 0.02, 0, -0.118, 0.243);
  } else if (mouth === "open") {
    part(head, GEO.sph, B(0x2a0e0c), 0.058, 0.044, 0.02, 0, -0.124, 0.238);
    part(head, GEO.pillX, B(0xf1ecd9), 0.074, 0.02, 0.02, 0, -0.104, 0.244);
    part(head, GEO.sph, B(0xc0554a), 0.034, 0.018, 0.016, 0, -0.142, 0.238);
  } else if (mouth === "grin") {
    part(head, GEO.sph, B(0x2a0e0c), 0.086, 0.044, 0.02, 0, -0.118, 0.236);
    part(head, GEO.pillX, B(0xf5f0df), 0.14, 0.03, 0.02, 0, -0.112, 0.243);
  }
  if (!f.socket) {
    part(head, GEO.sph, M(light(skin, 0.06), 0.6), 0.036, 0.034, 0.036, 0, -0.04, 0.258);
  } else part(head, GEO.cone, B(0x0b0907), 0.036, 0.074, 0.032, 0, -0.058, 0.252, PI, 0, 0);
}

/* ============ humanoid ============ */

type HumanKind = Exclude<UnitKind, "knight" | "robot" | "tank" | "railgun" | "catapult" | "hwacha" | "mammoth" | "snake">;
interface Look { skin: number; armor: number; pants: number; boot: number; chest: number; scale: number; head: number; legs: number; tilt: number }

function lookOf(kind: HumanKind, tc: number, tcd: number): Look {
  const base: Look = { skin: 0xe6b88e, armor: tc, pants: 0x2f3540, boot: 0x241d13, chest: 0.74, scale: 1, head: 1.28, legs: 1, tilt: 0.04 };
  switch (kind) {
    case "spear": return base;
    case "guardian": return { ...base, armor: 0x8d96a6, pants: 0x3a404c, boot: 0x2b2f38, chest: 0.9, scale: 1.06, head: 1.24, legs: 0.92, tilt: 0.02 };
    case "archer": return { ...base, armor: 0x6e5a38, pants: 0x4a3b28, boot: 0x2a2016, chest: 0.66, scale: 0.98, tilt: 0.06 };
    case "crossbow": return { ...base, armor: tcd, pants: 0x353a44, chest: 0.76, scale: 1.02, head: 1.26, legs: 0.98, tilt: 0.05 };
    case "swordsman": return { ...base, armor: 0x9aa3b2, pants: 0x3d4450, chest: 0.72, scale: 1.0, head: 1.26, legs: 1.02, tilt: 0.05 };
    case "halberdier": return { ...base, armor: 0x7f8896, pants: 0x333945, chest: 0.78, scale: 1.06, head: 1.22, legs: 0.98, tilt: 0.03 };
    case "paladin": return { ...base, armor: 0xd8dbe2, pants: 0x2f3540, boot: 0x2b2f38, chest: 0.86, scale: 1.14, head: 1.2, legs: 0.96, tilt: 0.02 };
    case "orc": return { ...base, skin: 0x84b455, armor: 0x55452e, pants: 0x3a3326, boot: 0x1f1a12, chest: 0.92, scale: 1.22, head: 1.2, legs: 0.92, tilt: 0.1 };
    case "berserker": return { ...base, skin: 0xd29a6c, armor: 0xd29a6c, pants: 0x4f3a26, boot: 0x2a2016, chest: 0.82, scale: 1.1, head: 1.24, tilt: 0.1 };
    case "javelin": return { ...base, skin: 0xcf966a, armor: 0x7a6242, pants: 0x4a3b28, chest: 0.7, scale: 1.0, head: 1.28, legs: 1.02, tilt: 0.06 };
    case "bomber": return { ...base, skin: 0xcf966a, armor: 0x6b5a3e, pants: 0x2f3540, chest: 0.8, head: 1.3, legs: 0.9, tilt: 0.08 };
    case "shaman": return { ...base, skin: 0x8fa060, armor: 0x6a5a3a, pants: 0x4a4230, boot: 0x3a3020, chest: 0.7, scale: 1.04, head: 1.3, legs: 0.92, tilt: 0.14 };
    case "troll": return { ...base, skin: 0x8a9a78, armor: 0x8a9a78, pants: 0x5a4a3a, boot: 0x3a2c20, chest: 1.0, scale: 1.7, head: 1.02, legs: 0.88, tilt: 0.16 };
    case "giant": return { ...base, skin: 0xbf9070, armor: 0xbf9070, pants: 0x5a4a3a, boot: 0x3a2c20, chest: 1.05, scale: 1.9, head: 1.0, legs: 0.86, tilt: 0.12 };
    case "elf": return { ...base, skin: 0xf0dcb8, armor: 0x3f6b3a, pants: 0x2f4a2c, boot: 0x4a3826, chest: 0.58, scale: 0.97, legs: 1.08, tilt: 0.03 };
    case "monk": return { ...base, skin: 0xdca87e, armor: 0xc8a058, pants: 0xb08a4a, boot: 0x5a4630, chest: 0.66, scale: 1.0, head: 1.26, legs: 1.04, tilt: 0.06 };
    case "assassin": return { ...base, armor: 0x2b2f3a, pants: 0x23262e, boot: 0x18191f, chest: 0.62, scale: 0.96, head: 1.24, legs: 1.02, tilt: 0.16 };
    case "mage": return { ...base, armor: tc, pants: 0x2a2f3a, boot: tcd, chest: 0.64, head: 1.28, tilt: 0.02 };
    case "frost": return { ...base, skin: 0xe8dcc8, armor: 0x4f7fbf, pants: 0x2f4462, boot: 0x2a3a52, chest: 0.64, head: 1.28, tilt: 0.02 };
    case "cleric": return { ...base, armor: 0xf0ead8, pants: 0xd8cfb0, boot: 0x5a4630, chest: 0.68, head: 1.28, tilt: 0.02 };
    case "zombie": return { ...base, skin: 0x9fb072, armor: 0x5a5a44, pants: 0x3a3a2e, boot: 0x2a2a20, chest: 0.72, head: 1.3, tilt: 0.32 };
    case "skeleton": return { ...base, skin: 0xece5cd, armor: 0xece5cd, pants: 0xe0d9c0, boot: 0xcfc8ae, chest: 0.5, scale: 1.02, head: 1.35, legs: 1.05, tilt: 0.05 };
    case "bonearcher": return { ...base, skin: 0xe6dfc6, armor: 0xe6dfc6, pants: 0xd8d0b4, boot: 0xc6bfa6, chest: 0.5, scale: 1.0, head: 1.35, legs: 1.05, tilt: 0.05 };
    case "vampire": return { ...base, skin: 0xe8dcd0, armor: 0x241f2c, pants: 0x1c1824, boot: 0x141119, chest: 0.72, scale: 1.06, head: 1.24, legs: 1.04, tilt: 0.05 };
    case "king": return { ...base, skin: 0xefc39a, armor: 0x8a2f3c, pants: 0x5a1620, boot: 0x3d1016, chest: 0.88, scale: 1.2, head: 1.2, legs: 0.94, tilt: 0.03 };
    case "pirate": return { ...base, skin: 0xd19a6a, armor: 0x4a3a52, pants: 0x2e2734, boot: 0x241d22, chest: 0.72, scale: 1.02, head: 1.26, legs: 1.0, tilt: 0.07 };
    case "sapper": return { ...base, skin: 0xd8a070, armor: 0x7a3a26, pants: 0x3a3326, boot: 0x1f1a12, chest: 0.74, scale: 0.98, head: 1.34, legs: 1.0, tilt: 0.16 };
    case "necromancer": return { ...base, skin: 0xb9c4a8, armor: 0x2c2238, pants: 0x1c1626, boot: 0x120e18, chest: 0.6, scale: 1.08, head: 1.22, tilt: 0.1 };
    case "zeus": return { ...base, skin: 0xe2b88c, armor: 0xe4dcc6, pants: 0xe4dcc6, boot: 0xc2a45c, chest: 0.98, scale: 1.3, head: 1.14, legs: 1.12, tilt: 0.0 };
    case "hoplite": return { ...base, skin: 0xd9a676, armor: 0xb8873a, pants: 0x6a2f24, boot: 0x6b4a2a, chest: 0.84, scale: 1.08, head: 1.22, legs: 0.96, tilt: 0.03 };
    case "samurai": return { ...base, skin: 0xe8c39a, armor: 0x2a2228, pants: 0x23262e, boot: 0x17181d, chest: 0.8, scale: 1.08, head: 1.22, legs: 0.98, tilt: 0.05 };
    case "ninja": return { ...base, skin: 0xe2bd96, armor: 0x1d2028, pants: 0x16181e, boot: 0x101116, chest: 0.6, scale: 0.94, head: 1.26, legs: 1.02, tilt: 0.18 };
    case "harpooner": return { ...base, skin: 0xc98f62, armor: 0x3f6a78, pants: 0x4a4032, boot: 0x2a2016, chest: 0.84, scale: 1.08, head: 1.24, legs: 0.96, tilt: 0.07 };
    case "snakearcher": return { ...base, skin: 0xc9a070, armor: 0x4d6a2c, pants: 0x6a5a34, boot: 0x3a2c1a, chest: 0.62, scale: 1.0, head: 1.28, legs: 1.02, tilt: 0.05 };
    case "valkyrie": return { ...base, skin: 0xf0d2b0, armor: 0xcfd6e2, pants: 0x3a4252, boot: 0xb9c1ce, chest: 0.66, scale: 1.04, head: 1.24, legs: 1.06, tilt: 0.1 };
    case "fanbearer": return { ...base, skin: 0xead0aa, armor: 0xe9e2cc, pants: 0xb23a3a, boot: 0x2a2016, chest: 0.7, scale: 1.02, head: 1.26, legs: 0.96, tilt: 0.02 };
  }
}

function buildHumanoid(kind: HumanKind, team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc), tcl = new THREE.Color(tc).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  const L = lookOf(kind, tc, tcd);
  const cw = L.chest, ww = cw * 0.84;
  const skel = kind === "skeleton" || kind === "bonearcher";
  const armored = kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin" || kind === "king" || kind === "vampire" || kind === "zeus" || kind === "valkyrie";
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  root.scale.setScalar(L.scale);
  const body = new THREE.Group();
  root.add(body);
  const hipY = 1.02 * L.legs;

  const kneeY = -0.45 * L.legs;
  const shins: THREE.Group[] = [];
  const mkLeg = (side: number) => {
    const p = new THREE.Group();
    p.position.set(side * (0.17 + cw * 0.05), hipY, 0);
    body.add(p);
    // The shin group pivots at the knee; its parts are authored in hip space and shifted down to it.
    const shin = new THREE.Group();
    shin.position.set(0, kneeY, 0);
    p.add(shin);
    shins.push(shin);
    const low = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) =>
      part(shin, geo, mat, sx, sy, sz, x, y - kneeY, z);
    if (skel) {
      part(p, GEO.sph, boneMat(L.skin), 0.078, 0.078, 0.078, 0, -0.04, 0);
      part(p, GEO.cyl, boneMat(L.skin), 0.048, 0.42 * L.legs, 0.048, 0, -0.24 * L.legs, 0);
      low(GEO.sph, boneMat(L.pants), 0.082, 0.076, 0.086, 0, -0.45 * L.legs, 0.02);
      low(GEO.cyl, boneMat(L.pants), 0.042, 0.42 * L.legs, 0.042, side * 0.012, -0.67 * L.legs, 0);
      low(GEO.cyl, boneMat(BONE_DARK), 0.024, 0.38 * L.legs, 0.024, -side * 0.022, -0.67 * L.legs, -0.012);
      low(GEO.box, boneMat(L.boot), 0.11, 0.085, 0.24, 0, -0.92 * L.legs, 0.05);
      for (const t of [-0.032, 0, 0.032]) low(GEO.box, boneMat(L.skin), 0.02, 0.036, 0.075, t, -0.94 * L.legs, 0.165);
      return p;
    }
    const th = kind === "orc" || kind === "troll" || kind === "giant" ? 0.28 : 0.24;
    const shinM = armored ? (kind === "paladin" ? steel(0xd8dbe2) : kind === "king" || kind === "zeus" ? gold(L.boot) : steel(STEEL_DARK)) : M(L.pants, 0.8);
    part(p, GEO.limb, M(L.pants, 0.82), th * 1.2, 0.5 * L.legs, th * 1.3, 0, -0.22 * L.legs, 0);
    low(GEO.limb, shinM, th * 1.04, 0.44 * L.legs, th * 1.12, 0, -0.66 * L.legs, -0.01);
    const kneeM = armored ? (kind === "paladin" || kind === "king" || kind === "zeus" ? gold() : steel(STEEL_LIGHT)) : leather(0x3d2d1d);
    if (armored) {
      low(GEO.sph, kneeM, th * 0.52, 0.1, th * 0.56, 0, -0.45 * L.legs, th * 0.4);
      low(GEO.pillY, kneeM, th * 1.14, 0.08, th * 1.2, 0, -0.45 * L.legs, 0.0);
    } else {
      low(GEO.sph, M(dark(L.pants, 0.82), 0.8), th * 0.42, 0.085, th * 0.44, 0, -0.45 * L.legs, th * 0.36);
    }
    // A ball joint fills the gap that opens behind a bent knee.
    part(p, GEO.sph, M(L.pants, 0.82), th * 0.5, th * 0.5, th * 0.54, 0, -0.45 * L.legs, 0);
    if (armored) low(GEO.box, kneeM, 0.035, 0.14, 0.12, side * th * 0.56, -0.45 * L.legs, 0.04);
    const bootM = armored ? shinM : leather(L.boot);
    low(GEO.pillY, bootM, th * 1.12, 0.26, th * 1.16, 0, -0.84 * L.legs, 0);
    low(GEO.softer, bootM, th * 1.16, 0.19, th * 1.9, 0, -0.915 * L.legs, 0.07);
    low(GEO.bevel, M(0x18130e, 0.9), th * 1.1, 0.04, th * 1.74, 0, -0.995 * L.legs, 0.07);
    if (kind === "orc" || kind === "giant" || kind === "berserker" || kind === "troll") part(p, GEO.box, M(0x4a3a28), th * 1.18, 0.11, th * 1.26, 0, -0.3 * L.legs, 0);
    if (kind === "zombie" && side < 0) low(GEO.box, boneMat(), 0.085, 0.16, 0.085, 0, -0.58 * L.legs, 0.09);
    return p;
  };
  const lLeg = mkLeg(1), rLeg = mkLeg(-1);

  const torso = new THREE.Group();
  torso.position.set(0, hipY + 0.04, 0);
  torso.rotation.x = L.tilt;
  body.add(torso);

  if (skel) {
    part(torso, GEO.box, boneMat(L.skin), ww * 0.96, 0.13, cw * 0.52, 0, 0.02, 0);
    for (let i = 0; i < 6; i++) {
      part(torso, GEO.box, boneMat(L.skin), 0.085, 0.105, 0.09, 0, 0.14 + i * 0.12, -0.03);
      part(torso, GEO.cone, boneMat(L.pants), 0.03, 0.075, 0.03, 0, 0.14 + i * 0.12, -0.095, -PI / 2, 0, 0);
    }
    part(torso, GEO.box, boneMat(L.skin), 0.072, 0.48, 0.042, 0, 0.48, cw * 0.25);
    part(torso, GEO.sph, B(kind === "bonearcher" ? 0x7eff9e : tcl), 0.075, 0.11, 0.065, 0, 0.48, 0.01);
    for (let i = 0; i < 4; i++) {
      const ry = 0.26 + i * 0.14, rw = cw * (0.86 + i * 0.05);
      for (const s of [-1, 1]) {
        const broken = kind === "skeleton" && i === 1 && s < 0;
        part(torso, GEO.box, boneMat(L.skin), broken ? rw * 0.34 : rw * 0.48, 0.048, cw * 0.52, s * (rw * 0.25), ry, 0.01);
      }
    }
    part(torso, GEO.box, boneMat(L.skin), cw * 1.08, 0.055, 0.08, 0, 0.78, 0.02);
    part(torso, GEO.box, M(tc), cw * 1.05, 0.1, cw * 0.56, 0, 0.74, 0.0, 0, 0, 0.35);
    part(torso, GEO.box, cloth(tcd), ww * 0.96, 0.24, 0.04, -0.08, -0.09, cw * 0.27, 0, 0, 0.08);
  } else if (kind === "mage" || kind === "frost" || kind === "necromancer") {
    const robe = kind === "frost" ? 0x4f7fbf : kind === "necromancer" ? 0x2c2238 : tc;
    part(torso, GEO.box, M(robe), cw, 0.8, cw * 0.62, 0, 0.42, 0);
    part(torso, GEO.robe, M(robe), 0.62, 1.7, 0.62, 0, -0.2, 0);
    part(torso, GEO.ring, steel(GOLD), 0.62, 0.62, 0.62, 0, -1.04, 0, PI / 2, 0, 0);
    part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.1, 0.84, 0.05, 0, 0.0, cw * 0.32 + 0.02);
    part(torso, GEO.box, M(kind === "frost" ? 0xbfe4ff : 0xd9c08a), cw * 1.02, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, leather(0x4a2a18), 0.12, 0.24, 0.18, -cw * 0.54, 0.0, 0.06, 0, 0, 0.18);
    part(torso, GEO.box, gold(), 0.13, 0.06, 0.19, -cw * 0.54, 0.0, 0.06, 0, 0, 0.18);
  } else if (kind === "cleric" || kind === "monk" || kind === "shaman" || kind === "fanbearer") {
    const robe = kind === "cleric" ? 0xf0ead8 : kind === "monk" ? 0xc8a058 : kind === "fanbearer" ? 0xe9e2cc : 0x6a5a3a;
    part(torso, GEO.box, M(robe), cw, 0.8, cw * 0.62, 0, 0.42, 0);
    part(torso, GEO.robe, M(robe), 0.66, 1.7, 0.66, 0, -0.2, 0);
    part(torso, GEO.ring, steel(kind === "monk" ? 0x8a6a2a : GOLD), 0.66, 0.66, 0.66, 0, -1.04, 0, PI / 2, 0, 0);
    part(torso, GEO.box, M(tc), 0.2, 1.6, 0.04, 0, -0.1, cw * 0.32 + 0.05);
    if (kind === "shaman") {
      for (let i = 0; i < 5; i++) part(torso, GEO.sph, M(0xe8e0c8), 0.068, 0.088, 0.052, -0.24 + i * 0.12, 0.7 - Math.abs(i - 2) * 0.03, cw * 0.31 + 0.04);
      part(torso, GEO.box, M(0xd8cfb0), cw * 0.9, 0.2, 0.06, 0, 0.1, -cw * 0.31 - 0.03);
    }
    if (kind === "cleric") {
      part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.22, 0.05, 0.05, 0, 0.58, cw * 0.32 + 0.08);
      part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.05, 0.22, 0.05, 0, 0.58, cw * 0.32 + 0.08);
    }
  } else {
    const zOff = kind === "zombie" ? 0.06 : 0;
    part(torso, GEO.box, M(L.armor), ww, 0.38, cw * 0.58, 0, 0.22, zOff);
    part(torso, GEO.box, M(L.armor), cw, 0.48, cw * 0.63, 0, 0.58, zOff);
    part(torso, GEO.box, M(0x2a2016), ww + 0.06, 0.13, cw * 0.65, 0, 0.04, zOff);
    part(torso, GEO.box, gold(BRASS), 0.14, 0.15, 0.05, 0, 0.04, cw * 0.32 + zOff + 0.02);
    part(torso, GEO.box, steel(STEEL_LIGHT), 0.06, 0.022, 0.058, 0.01, 0.04, cw * 0.32 + zOff + 0.025);
    part(torso, GEO.box, leather(LEATHER), 0.11, 0.14, 0.09, -ww * 0.48, -0.02, zOff + 0.08, 0, 0, 0.12);
  }
  part(torso, GEO.cyl, skel ? boneMat(L.skin) : M(L.skin, 0.6), skel ? 0.055 : 0.11, 0.18, skel ? 0.055 : 0.11, 0, 0.9, 0);

  // faction- and role-specific torso detail
  if (kind === "spear") {
    part(torso, GEO.box, steel(0x9aa3b2), cw + 0.04, 0.4, cw * 0.64, 0, 0.62, 0);
    part(torso, GEO.box, M(tcd), cw * 0.9, 0.3, cw * 0.68, 0, -0.14, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(0x9aa3b2), 0.2, 0.15, 0.2, s * (cw / 2 + 0.1), 0.74, 0);
  } else if (kind === "guardian") {
    part(torso, GEO.box, steel(), cw + 0.05, 0.8, cw * 0.66, 0, 0.42, 0);
    part(torso, GEO.box, M(tc), cw * 0.5, 0.7, cw * 0.66 + 0.02, 0, 0.38, 0);
    part(torso, GEO.box, M(GOLD, 0.4, 0.5), cw * 0.5 + 0.02, 0.06, cw * 0.66 + 0.03, 0, 0.62, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(), 0.27, 0.2, 0.27, s * (cw / 2 + 0.12), 0.74, 0);
  } else if (kind === "swordsman") {
    part(torso, GEO.box, steel(0x9aa3b2), cw + 0.03, 0.34, cw * 0.65, 0, 0.56, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.09, cw * 0.66, 0, 0.34, 0, 0, 0, 0.4);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(), 0.19, 0.14, 0.19, s * (cw / 2 + 0.1), 0.72, 0);
  } else if (kind === "halberdier") {
    part(torso, GEO.box, steel(0x7f8896), cw + 0.05, 0.6, cw * 0.66, 0, 0.5, 0);
    part(torso, GEO.box, M(tc), cw * 0.34, 0.72, cw * 0.68, 0, 0.4, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(0x7f8896), 0.24, 0.2, 0.24, s * (cw / 2 + 0.12), 0.74, 0);
  } else if (kind === "paladin") {
    part(torso, GEO.box, steel(0xd8dbe2), cw + 0.06, 0.82, cw * 0.68, 0, 0.44, 0);
    part(torso, GEO.box, M(tc), cw * 0.44, 0.76, cw * 0.7, 0, 0.4, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw * 0.46, 0.06, cw * 0.71, 0, 0.66, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw + 0.07, 0.06, cw * 0.69, 0, 0.16, 0);
    for (const s of [-1, 1]) {
      part(torso, GEO.sph, steel(0xd8dbe2), 0.3, 0.24, 0.3, s * (cw / 2 + 0.14), 0.76, 0);
      part(torso, GEO.cone, M(GOLD, 0.35, 0.7), 0.09, 0.3, 0.09, s * (cw / 2 + 0.14), 0.98, 0, -0.3, 0, -s * 0.5);
    }
  } else if (kind === "archer" || kind === "bonearcher") {
    part(torso, GEO.box, M(0x4a3926), cw + 0.03, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.09, cw * 0.66, 0, 0.62, 0, 0, 0, 0.5);
    part(torso, GEO.cyl, M(0x4a3220), 0.13, 0.62, 0.13, 0.2, 0.5, -0.3, 0.22, 0, 0);
    for (let i = 0; i < 4; i++) {
      part(torso, GEO.cyl, M(skel ? 0xd8d0b4 : 0xb69250), 0.02, 0.34, 0.02, 0.14 + i * 0.04, 0.9, -0.33);
      part(torso, GEO.box, skel ? M(0x3a2418) : B(tcl), 0.05, 0.1, 0.012, 0.14 + i * 0.04, 1.02, -0.33);
      part(torso, GEO.box, skel ? M(0x3a2418) : B(tcl), 0.012, 0.1, 0.05, 0.14 + i * 0.04, 1.02, -0.33);
    }
  } else if (kind === "crossbow") {
    part(torso, GEO.box, M(0x6e5a38), cw + 0.04, 0.2, cw * 0.67, 0, 0.1, 0);
    part(torso, GEO.box, M(0xd9cfa8), 0.1, 0.8, cw * 0.65, 0.18, 0.42, 0.0);
    part(torso, GEO.box, M(0x4a3926), 0.3, 0.3, 0.14, -0.1, 0.3, -cw * 0.34 - 0.04);
    for (let i = 0; i < 3; i++) part(torso, GEO.cyl, steel(), 0.02, 0.2, 0.02, -0.18 + i * 0.07, 0.5, -cw * 0.34 - 0.06);
  } else if (kind === "javelin") {
    part(torso, GEO.box, M(0x7a6242), cw + 0.03, 0.16, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.08, cw * 0.67, 0, 0.6, 0, 0, 0, -0.4);
    for (let i = 0; i < 3; i++) part(torso, GEO.cyl, M(0x9a7a4a), 0.03, 1.5, 0.03, -0.16 + i * 0.07, 0.7, -0.3, 0.1, 0, 0.06);
  } else if (kind === "orc") {
    part(torso, GEO.box, M(tc), cw * 1.06, 0.1, cw * 0.66, 0, 0.62, 0, 0, 0, 0.55);
    part(torso, GEO.box, M(0x6b5a3e), cw * 0.7, 0.36, cw * 0.62 + 0.02, 0, 0.0, 0);
    for (const s of [-1, 1]) {
      part(torso, GEO.sph, M(0x3d3426, 0.8, 0.2), 0.3, 0.2, 0.3, s * (cw / 2 + 0.14), 0.76, 0);
      part(torso, GEO.cone, steel(0x8b939f), 0.07, 0.22, 0.07, s * (cw / 2 + 0.14), 0.96, 0);
    }
  } else if (kind === "berserker") {
    for (const s of [-1, 1]) part(torso, GEO.box, M(0x4a3220), 0.1, 0.95, cw * 0.66, s * 0.0, 0.42, 0, 0, 0, s * 0.62);
    part(torso, GEO.box, M(tc), cw * 0.9, 0.12, cw * 0.62 + 0.02, 0, 0.1, 0);
    part(torso, GEO.sph, M(0xe8e0c8), 0.08, 0.08, 0.05, 0, 0.5, cw * 0.32 + 0.03);
  } else if (kind === "bomber") {
    part(torso, GEO.box, M(0x3b2f20), cw + 0.05, 0.3, cw * 0.66, 0, 0.08, 0);
    part(torso, GEO.box, M(tc), 0.14, 0.82, cw * 0.65, -0.2, 0.42, 0, 0, 0, 0.35);
    part(torso, GEO.box, M(0x3b2f20), 0.5, 0.52, 0.22, 0, 0.5, -cw * 0.31 - 0.08);
    for (const x of [-0.14, 0.14]) {
      part(torso, GEO.sph, M(0x25252a, 0.5, 0.2), 0.13, 0.13, 0.13, x, 0.82, -cw * 0.31 - 0.08);
      part(torso, GEO.box, B(0xff9a3a), 0.025, 0.07, 0.025, x, 0.98, -cw * 0.31 - 0.08);
    }
    for (let i = 0; i < 3; i++) part(torso, GEO.sph, M(0x25252a, 0.5, 0.2), 0.09, 0.09, 0.09, -0.2 + i * 0.2, 0.0, cw * 0.33 + 0.04);
  } else if (kind === "troll") {
    part(torso, GEO.sph, M(L.skin), cw * 0.6, 0.52, 0.52, 0, 0.26, 0.08);
    part(torso, GEO.box, M(0x6a4a30), cw * 1.1, 0.4, cw * 0.66, 0, -0.08, 0);
    part(torso, GEO.box, M(0x4e6a3a), cw * 0.92, 0.5, cw * 0.66, 0, 0.56, 0.0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x3f5a2e), 0.34, 0.24, 0.34, s * (cw / 2 + 0.2), 0.8, 0);
    for (let i = 0; i < 3; i++) part(torso, GEO.cone, B(0xf0e6c0), 0.04, 0.16, 0.04, -0.12 + i * 0.12, 0.14, cw * 0.33 + 0.02);
  } else if (kind === "giant") {
    part(torso, GEO.sph, M(L.skin), cw * 0.6, 0.5, 0.5, 0, 0.26, 0.1);
    part(torso, GEO.box, M(0x6a4a30), cw * 1.1, 0.4, cw * 0.66, 0, -0.08, 0);
    part(torso, GEO.box, M(0x7a5a3c), cw * 0.9, 0.5, cw * 0.65, 0, 0.55, 0.0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x4a3a2a), 0.32, 0.24, 0.32, s * (cw / 2 + 0.2), 0.8, 0);
  } else if (kind === "elf") {
    part(torso, GEO.box, M(0x2c4f2a), cw + 0.03, 0.12, cw * 0.66, 0, 0.08, 0);
    part(torso, GEO.box, M(0xd9c08a, 0.5, 0.4), cw * 0.5, 0.06, cw * 0.66, 0, 0.62, 0);
    part(torso, GEO.box, M(0x4a3826), 0.1, 0.6, 0.08, -0.18, 0.5, -0.3, 0.1, 0, 0);
    part(torso, GEO.cone, M(0x2f6a35), 0.2, 0.55, 0.12, 0, -0.36, 0.0);
    part(torso, GEO.box, M(tc), 0.07, 0.32, 0.03, 0.0, 0.0, cw * 0.32 + 0.03);
  } else if (kind === "monk") {
    part(torso, GEO.box, M(0xb08a4a), cw + 0.02, 0.5, cw * 0.66, 0, 0.5, 0);
    part(torso, GEO.box, M(tc), cw + 0.04, 0.1, cw * 0.68, 0, 0.32, 0);
    part(torso, GEO.box, M(0xd9c08a), 0.14, 0.6, 0.05, 0.0, 0.1, 0, 0, 0, 0.5);
  } else if (kind === "assassin") {
    part(torso, GEO.box, M(tc), cw + 0.03, 0.1, cw * 0.66, 0, 0.62, 0, 0, 0, -0.5);
    part(torso, GEO.box, M(0x14151a), cw + 0.04, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, steel(0x6b7280), 0.1, 0.34, 0.06, 0.2, 0.0, cw * 0.33);
  } else if (kind === "vampire") {
    part(torso, GEO.box, M(0x241f2c), cw + 0.04, 0.8, cw * 0.64, 0, 0.42, 0);
    part(torso, GEO.box, M(0x8a1f2a), cw * 0.3, 0.7, cw * 0.66, 0, 0.4, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw + 0.05, 0.06, cw * 0.66, 0, 0.14, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x241f2c), 0.26, 0.18, 0.26, s * (cw / 2 + 0.12), 0.74, 0);
    part(torso, GEO.ring, steel(GOLD), 0.34, 0.34, 0.05, 0, 0.46, cw * 0.33 + 0.02);
  } else if (kind === "zombie") {
    part(torso, GEO.box, M(0x4a4a38), 0.22, 0.46, 0.05, -0.18, 0.12, cw * 0.31 + 0.06);
    part(torso, GEO.box, M(0x3a3a2a), 0.2, 0.3, 0.05, 0.2, 0.55, cw * 0.31 + 0.06, 0, 0, 0.3);
    part(torso, GEO.sph, M(0x5a2a22), 0.14, 0.1, 0.05, 0.16, 0.36, cw * 0.31 + 0.07);
    part(torso, GEO.box, M(0xe0d8c0), 0.18, 0.03, 0.04, 0.16, 0.5, cw * 0.31 + 0.07);
  } else if (kind === "hoplite") {
    // muscled bronze cuirass over a red tunic, leather strips hanging from the waist
    part(torso, GEO.box, gold(0xb8873a), cw + 0.05, 0.62, cw * 0.67, 0, 0.5, 0);
    part(torso, GEO.box, gold(0xd2a455), cw * 0.42, 0.3, cw * 0.69, -cw * 0.24, 0.6, 0);
    part(torso, GEO.box, gold(0xd2a455), cw * 0.42, 0.3, cw * 0.69, cw * 0.24, 0.6, 0);
    part(torso, GEO.box, gold(0x8a6428), cw + 0.07, 0.07, cw * 0.69, 0, 0.2, 0);
    for (let i = 0; i < 6; i++) part(torso, GEO.box, i % 2 ? leather(0x6b4a2a) : M(tc), cw * 0.17, 0.34, 0.04, (i - 2.5) * cw * 0.185, -0.08, cw * 0.33);
    for (let i = 0; i < 6; i++) part(torso, GEO.box, i % 2 ? M(tc) : leather(0x6b4a2a), cw * 0.17, 0.34, 0.04, (i - 2.5) * cw * 0.185, -0.08, -cw * 0.33);
    for (const sd of [-1, 1]) part(torso, GEO.sph, gold(0xb8873a), 0.25, 0.17, 0.25, sd * (cw / 2 + 0.11), 0.76, 0);
  } else if (kind === "samurai") {
    // lacquered plates laced in the team colour, wide shoulder guards
    part(torso, GEO.box, M(0x2a2228, 0.4, 0.35), cw + 0.05, 0.72, cw * 0.67, 0, 0.46, 0);
    for (let i = 0; i < 4; i++) part(torso, GEO.box, M(tc), cw + 0.07, 0.035, cw * 0.69, 0, 0.2 + i * 0.17, 0);
    part(torso, GEO.box, gold(), 0.12, 0.12, 0.03, 0, 0.62, cw * 0.345);
    for (let i = 0; i < 5; i++) part(torso, GEO.box, M(0x2a2228, 0.4, 0.35), cw * 0.2, 0.36, 0.05, (i - 2) * cw * 0.215, -0.1, cw * 0.31, -0.12, 0, 0);
    for (let i = 0; i < 5; i++) part(torso, GEO.box, M(tc), cw * 0.2, 0.03, 0.056, (i - 2) * cw * 0.215, -0.24, cw * 0.325, -0.12, 0, 0);
    for (const sd of [-1, 1]) {
      part(torso, GEO.box, M(0x2a2228, 0.4, 0.35), 0.3, 0.07, 0.42, sd * (cw / 2 + 0.17), 0.8, 0, 0, 0, -sd * 0.3);
      part(torso, GEO.box, M(tc), 0.3, 0.035, 0.44, sd * (cw / 2 + 0.2), 0.72, 0, 0, 0, -sd * 0.3);
      part(torso, GEO.box, M(0x2a2228, 0.4, 0.35), 0.28, 0.07, 0.42, sd * (cw / 2 + 0.23), 0.64, 0, 0, 0, -sd * 0.3);
    }
    // the short sword stays in the sash
    part(torso, GEO.box, M(0x15131a, 0.4, 0.3), 0.05, 0.07, 0.62, cw * 0.5, 0.08, 0.02, 0.25, 0.2, 0);
    part(torso, GEO.cyl, gold(), 0.06, 0.02, 0.06, cw * 0.5, 0.17, 0.3, PI / 2 + 0.25, 0, 0);
  } else if (kind === "ninja") {
    part(torso, GEO.box, M(tc), cw + 0.04, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, M(tc), 0.08, 0.3, 0.04, -cw * 0.3, -0.1, cw * 0.33, 0, 0, 0.2);
    part(torso, GEO.box, leather(0x2a2620), 0.07, 0.9, cw * 0.67, 0, 0.46, 0, 0, 0, 0.6);
    // straight sword slung across the back
    part(torso, GEO.box, M(0x14151a, 0.5, 0.2), 0.06, 0.95, 0.06, 0.06, 0.52, -cw * 0.34 - 0.05, 0, 0, -0.6);
    part(torso, GEO.box, steel(STEEL_DARK), 0.14, 0.03, 0.1, 0.33, 0.9, -cw * 0.34 - 0.05, 0, 0, -0.6);
    for (let i = 0; i < 3; i++) part(torso, GEO.box, steel(STEEL_LIGHT), 0.09, 0.09, 0.012, -0.12 + i * 0.1, 0.1, cw * 0.34 + 0.02, 0, 0, PI / 4);
  } else if (kind === "harpooner") {
    // open sea-coat over a striped shirt, a coil of line over the shoulder
    part(torso, GEO.box, cloth(0xe6dec8), cw * 0.5, 0.78, cw * 0.65, 0, 0.42, 0.01);
    for (let i = 0; i < 4; i++) part(torso, GEO.box, cloth(tc), cw * 0.5, 0.06, cw * 0.66, 0, 0.14 + i * 0.19, 0.012);
    part(torso, GEO.box, leather(0x3a2c1c), cw + 0.05, 0.12, cw * 0.67, 0, 0.06, 0);
    part(torso, GEO.ring, M(0xc9b27a, 0.95), 0.34, 0.34, 0.9, cw * 0.2, 0.5, 0, 0.2, PI / 2 - 0.5, 0.5);
    part(torso, GEO.ring, M(0xb09a64, 0.95), 0.3, 0.3, 0.9, cw * 0.22, 0.5, 0.02, 0.2, PI / 2 - 0.5, 0.5);
    part(torso, GEO.cone, steel(STEEL_LIGHT), 0.04, 0.2, 0.04, -cw * 0.4, 0.0, cw * 0.34, PI, 0, 0);
  } else if (kind === "snakearcher") {
    part(torso, GEO.box, M(tc), cw + 0.03, 0.1, cw * 0.66, 0, 0.6, 0, 0, 0, 0.45);
    part(torso, GEO.box, leather(0x4a3826), cw + 0.04, 0.12, cw * 0.66, 0, 0.08, 0);
    // wicker basket on the back, lid ajar, something looking out
    part(torso, GEO.cyl, M(0xb89a5a, 0.95), 0.25, 0.56, 0.25, 0, 0.42, -cw * 0.33 - 0.22);
    for (const y of [0.22, 0.42, 0.62]) part(torso, GEO.cyl, M(0x8a7038, 0.95), 0.262, 0.04, 0.262, 0, y, -cw * 0.33 - 0.22);
    part(torso, GEO.cyl, M(0x8a7038, 0.95), 0.27, 0.05, 0.27, 0.08, 0.74, -cw * 0.33 - 0.24, 0.35, 0, 0.3);
    part(torso, GEO.cyl, M(0x4f8a3a, 0.6), 0.05, 0.3, 0.05, -0.1, 0.84, -cw * 0.33 - 0.2, 0.3, 0, 0.2);
    part(torso, GEO.sph, M(0x4f8a3a, 0.6), 0.075, 0.055, 0.1, -0.13, 1.0, -cw * 0.33 - 0.14);
    for (const sd of [-1, 1]) part(torso, GEO.sph, B(0xffd84a), 0.018, 0.018, 0.018, -0.13 + sd * 0.04, 1.02, -cw * 0.33 - 0.07);
  } else if (kind === "valkyrie") {
    part(torso, GEO.box, steel(0xcfd6e2), cw + 0.04, 0.5, cw * 0.67, 0, 0.56, 0);
    part(torso, GEO.box, gold(), cw + 0.06, 0.05, cw * 0.69, 0, 0.32, 0);
    part(torso, GEO.box, gold(), 0.07, 0.46, cw * 0.69, 0, 0.56, 0);
    part(torso, GEO.box, M(tc), cw * 0.9, 0.3, cw * 0.62, 0, 0.14, 0);
    for (let i = 0; i < 6; i++) part(torso, GEO.cone, cloth(i % 2 ? 0xf4f1e6 : tc), 0.09, 0.42, 0.05, (i - 2.5) * cw * 0.19, -0.2, cw * 0.3, PI, 0, 0);
    for (let i = 0; i < 6; i++) part(torso, GEO.cone, cloth(i % 2 ? tc : 0xf4f1e6), 0.09, 0.42, 0.05, (i - 2.5) * cw * 0.19, -0.2, -cw * 0.3, PI, 0, 0);
    for (const sd of [-1, 1]) {
      part(torso, GEO.sph, steel(0xcfd6e2), 0.22, 0.16, 0.22, sd * (cw / 2 + 0.1), 0.76, 0);
      part(torso, GEO.cone, gold(), 0.06, 0.2, 0.06, sd * (cw / 2 + 0.16), 0.9, 0, 0, 0, -sd * 0.7);
    }
  }
  detailTorso(kind, torso, cw, tc);

  // cloak
  let cloak: THREE.Group | null = null;
  const cloakColor: Partial<Record<HumanKind, [number, number, number]>> = {
    spear: [tcd, 0.9, 1.1], guardian: [tcd, 0.96, 1.24], halberdier: [tcd, 0.86, 1.1], king: [0x8a1c28, 1.16, 1.48], zeus: [0xf4eee0, 1.08, 1.44],
    elf: [0x2f5f33, 0.8, 1.2], mage: [tcd, 0.8, 1.25], frost: [0x3a5f8f, 0.8, 1.25],
    assassin: [tc, 0.22, 1.5], skeleton: [tcd, 0.6, 0.9], bonearcher: [tcd, 0.6, 0.9], cleric: [0xd9cfb0, 0.7, 1.1],
    paladin: [tcd, 1.0, 1.3], vampire: [0x2a1420, 1.5, 1.7], shaman: [0x4a4230, 0.8, 1.2], monk: [tc, 0.7, 1.0],
    hoplite: [0x8a2a24, 0.9, 1.15], ninja: [tc, 0.2, 1.3],
  };
  const cc = cloakColor[kind];
  if (cc) {
    cloak = new THREE.Group();
    cloak.position.set(0, 0.8, -cw * 0.34);
    torso.add(cloak);
    part(cloak, GEO.cape, M(cc[0]), cw * cc[1] * 1.12, cc[2], 0.05, 0, -cc[2] * 0.5, -0.05);
    // Trim: a second, slightly larger sheet peeking out below the hem.
    part(cloak, GEO.cape, cloth(kind === "king" || kind === "paladin" || kind === "zeus" || kind === "cleric" || kind === "mage" ? GOLD : dark(cc[0], 0.7)), cw * cc[1] * 1.15, cc[2] * 1.03, 0.05, 0, -cc[2] * 0.515, -0.035);
    if (kind === "vampire") part(cloak, GEO.box, M(cc[0]), cw * 0.24, cc[2] * 0.85, 0.04, 0.0, -cc[2] * 1.0, -0.06);
  }
  if (kind === "valkyrie") {
    // Wings ride on the cloak bone, so they beat with the same spring that swings a cape.
    cloak = new THREE.Group();
    cloak.position.set(0, 0.82, -cw * 0.36);
    torso.add(cloak);
    for (const sd of [-1, 1]) {
      part(cloak, GEO.box, M(0xd8d2c0, 0.8), 0.9, 0.1, 0.08, sd * 0.5, 0.06, -0.02, 0, 0, sd * 0.42);
      for (let i = 0; i < 7; i++) {
        const len = 1.25 - Math.abs(i - 2) * 0.13;
        part(cloak, GEO.box, cloth(i % 3 === 2 ? tcl : 0xf6f3ea), 0.17, len, 0.035,
          sd * (0.18 + i * 0.18), 0.1 + i * 0.07 - len * 0.5, -0.04 - i * 0.006, 0, 0, sd * (0.1 + i * 0.12));
      }
      for (let i = 0; i < 4; i++) part(cloak, GEO.box, cloth(0xe2dccb), 0.15, 0.5, 0.04, sd * (0.2 + i * 0.2), 0.12 + i * 0.07, -0.01, 0, 0, sd * (0.2 + i * 0.12));
    }
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0);
  head.scale.setScalar(L.head);
  torso.add(head);
  part(head, GEO.head, M(L.skin, 0.6), 0.262, 0.275, 0.262);
  if (!skel) {
    // Soft cheeks and jaw give the head a readable shape from any angle.
    part(head, GEO.softer, M(L.skin, 0.6), 0.47, 0.25, 0.44, 0, -0.105, 0.025);
    for (const s of [-1, 1]) {
      part(head, GEO.sph, M(L.skin, 0.6), 0.045, 0.07, 0.05, s * 0.258, -0.02, -0.01);
      part(head, GEO.sph, M(dark(L.skin, 0.8), 0.6), 0.022, 0.04, 0.03, s * 0.275, -0.02, 0.0);
    }
  }
  let headExtra = 0;
  const dome = (c: number, r: number, y: number, metal = false, sy = 0.9) =>
    part(head, GEO.dome, metal ? steel(c) : M(c), r, r * sy, r, 0, y, -0.005);
  const teeth = (c = 0xf0e6c0) => { for (let i = 0; i < 4; i++) part(head, GEO.box, B(c), 0.02, 0.05, 0.01, -0.06 + i * 0.04, -0.19, 0.2); };

  switch (kind) {
    case "spear":
      dome(0x9aa3b2, 0.3, 0.07, true);
      part(head, GEO.ring, steel(0x6b7280), 0.3, 0.3, 0.3, 0, 0.07, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(0x9aa3b2), 0.05, 0.22, 0.04, 0, -0.01, 0.275);
      for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.17, 0.17, s * 0.265, -0.04, 0.0);
      part(head, GEO.box, M(tc), 0.07, 0.2, 0.5, 0, 0.3, -0.06, -0.3, 0, 0);
      headExtra = 0.15;
      addFace(head, L.skin, { brow: 0.12, mouth: "flat" });
      break;
    case "guardian":
      dome(0x8d96a6, 0.32, 0.07, true);
      part(head, GEO.ring, steel(GOLD), 0.32, 0.32, 0.32, 0, 0.08, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(), 0.06, 0.26, 0.05, 0, 0.0, 0.282);
      for (const s of [-1, 1]) part(head, GEO.box, steel(), 0.05, 0.22, 0.2, s * 0.28, -0.05, 0.0);
      part(head, GEO.box, M(tc), 0.08, 0.26, 0.4, 0, 0.34, -0.05, -0.2, 0, 0);
      headExtra = 0.15;
      addFace(head, L.skin, { brow: 0.16, mouth: "flat" });
      break;
    case "archer":
      dome(tcd, 0.31, 0.04);
      part(head, GEO.cone, M(tcd), 0.28, 0.4, 0.28, 0, 0.0, -0.19, -1.15, 0, 0);
      part(head, GEO.box, M(tcl), 0.03, 0.2, 0.06, 0.22, 0.26, -0.05, 0.3, 0, -0.5);
      addFace(head, L.skin, { mouth: "smile" });
      break;
    case "bonearcher":
      part(head, GEO.box, M(L.skin, 0.7), 0.28, 0.1, 0.2, 0, -0.22, 0.08);
      part(head, GEO.box, M(tc), 0.5, 0.07, 0.5, 0, 0.16, 0);
      teeth(0xe6dfc6);
      addFace(head, L.skin, { socket: true, pupil: 0x9fffa8, brow: 0.2, mouth: "none", size: 0.06 });
      break;
    case "crossbow":
      dome(0x7a808c, 0.31, 0.11, true, 1.05);
      part(head, GEO.cyl, steel(0x7a808c), 0.45, 0.035, 0.45, 0, 0.1, 0);
      addFace(head, L.skin, { brow: 0.1, mouth: "flat" });
      break;
    case "swordsman":
      dome(0x9aa3b2, 0.3, 0.08, true, 0.95);
      part(head, GEO.ring, steel(0x6b7280), 0.3, 0.3, 0.3, 0, 0.08, 0, PI / 2, 0, 0);
      for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.14, 0.14, s * 0.26, -0.06, 0.0);
      addFace(head, L.skin, { brow: 0.14, mouth: "smile" });
      break;
    case "halberdier":
      dome(0x7f8896, 0.3, 0.1, true, 1.1);
      part(head, GEO.box, steel(0x7f8896), 0.06, 0.2, 0.32, 0, 0.02, 0.24);
      part(head, GEO.box, M(tc), 0.07, 0.16, 0.44, 0, 0.3, -0.04, -0.25, 0, 0);
      addFace(head, L.skin, { brow: 0.16, mouth: "flat" });
      break;
    case "paladin":
      dome(0xd8dbe2, 0.32, 0.08, true);
      part(head, GEO.ring, steel(GOLD), 0.32, 0.32, 0.32, 0, 0.08, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(0xd8dbe2), 0.05, 0.24, 0.04, 0, 0.0, 0.28);
      for (const s of [-1, 1]) {
        part(head, GEO.box, steel(0xd8dbe2), 0.04, 0.2, 0.2, s * 0.275, -0.04, 0.0);
        const wing = part(head, GEO.cone, M(GOLD, 0.35, 0.7), 0.07, 0.34, 0.07, s * 0.24, 0.3, -0.05, -0.2, 0, -s * 0.35);
        void wing;
      }
      part(head, GEO.cone, M(tc), 0.09, 0.4, 0.09, 0, 0.42, -0.12, -0.35, 0, 0);
      headExtra = 0.2;
      addFace(head, L.skin, { brow: 0.14, mouth: "flat" });
      break;
    case "orc":
      part(head, GEO.box, M(L.skin, 0.6), 0.5, 0.11, 0.3, 0, 0.115, 0.1);
      part(head, GEO.sph, M(L.skin, 0.6), 0.2, 0.16, 0.14, 0, -0.17, 0.12);
      for (const s of [-1, 1]) {
        part(head, GEO.cone, M(0xf0e6c0, 0.5), 0.055, 0.2, 0.055, s * 0.13, -0.19, 0.2, -0.35, 0, 0);
        part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.3, 0.06, s * 0.3, 0.1, 0, 0, 0, -s * 1.25);
      }
      part(head, GEO.box, M(tcd, 0.6, 0.3), 0.54, 0.09, 0.54, 0, 0.2, 0);
      addFace(head, L.skin, { sclera: 0xffe9a0, pupil: 0xd02a1c, brow: 0.42, mouth: "grin", browColor: 0x1d1a10 });
      break;
    case "berserker":
      for (let i = 0; i < 5; i++) part(head, GEO.cone, M(tc), 0.05, 0.3 - Math.abs(i - 2) * 0.05, 0.06, 0, 0.3 - Math.abs(i - 2) * 0.03, 0.14 - i * 0.075, 0, 0, 0);
      part(head, GEO.box, M(0x8a5a32), 0.27, 0.12, 0.2, 0, -0.22, 0.12);
      addFace(head, L.skin, { brow: 0.36, mouth: "open", browColor: 0x3a2412 });
      headExtra = 0.12;
      break;
    case "javelin":
      dome(tcd, 0.3, 0.06);
      part(head, GEO.cone, M(tcd), 0.26, 0.36, 0.26, 0, 0.0, -0.18, -1.1, 0, 0);
      part(head, GEO.box, M(0xd9c08a), 0.5, 0.06, 0.5, 0, -0.02, 0);
      addFace(head, L.skin, { brow: 0.12, mouth: "smile" });
      break;
    case "bomber":
      dome(tc, 0.285, 0.07);
      part(head, GEO.cone, M(tc), 0.1, 0.22, 0.1, 0, 0.02, -0.3, -1.9, 0, 0);
      part(head, GEO.box, M(0x2a2016), 0.22, 0.03, 0.04, 0, -0.06, 0.255);
      for (const s of [-1, 1]) {
        part(head, GEO.ring, steel(0xb9803a), 0.095, 0.095, 0.1, s * 0.105, 0.04, 0.235);
        part(head, GEO.box, M(0x2a2016), 0.06, 0.05, 0.5, s * 0.27, 0.07, 0.0);
      }
      addFace(head, L.skin, { brow: 0.2, mouth: "grin", sclera: 0xfaf3d8 });
      break;
    case "shaman":
      for (let i = 0; i < 4; i++) part(head, GEO.cone, B(0xe8e0c8), 0.05, 0.22, 0.05, -0.16 + i * 0.11, 0.28, 0.0, 0, 0, 0);
      part(head, GEO.box, M(0xd8cfb0), 0.52, 0.32, 0.34, 0, 0.0, 0.02);
      part(head, GEO.box, B(0x1a140c), 0.4, 0.1, 0.04, 0, 0.02, 0.2);
      part(head, GEO.cone, B(0xf0e6c0), 0.06, 0.16, 0.06, 0, 0.22, 0.22, PI / 2, 0, 0);
      addFace(head, L.skin, { socket: true, pupil: 0xffd06a, size: 0.062, brow: 0.1, mouth: "none" });
      break;
    case "troll":
      part(head, GEO.box, M(L.skin, 0.6), 0.44, 0.18, 0.26, 0, -0.16, 0.08);
      part(head, GEO.box, M(0x3f5a2e), 0.48, 0.08, 0.06, 0, 0.14, 0.23);
      for (let i = 0; i < 3; i++) part(head, GEO.cone, M(0x2f4a22), 0.06, 0.24, 0.06, -0.1 + i * 0.1, 0.3, 0.0);
      for (const s of [-1, 1]) {
        part(head, GEO.cone, B(0xf0e6c0), 0.04, 0.16, 0.04, s * 0.1, -0.2, 0.18, 0.2, 0, 0);
        part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.26, 0.06, s * 0.29, 0.08, 0, 0, 0, -s * 1.2);
      }
      addFace(head, L.skin, { brow: 0.3, mouth: "open", sep: 0.1, size: 0.07, y: 0.04, sclera: 0xf6e8a8, pupil: 0x2a3a14 });
      break;
    case "giant":
      part(head, GEO.box, M(L.skin, 0.6), 0.46, 0.2, 0.26, 0, -0.17, 0.08);
      part(head, GEO.box, M(0x2a1d12), 0.5, 0.08, 0.06, 0, 0.14, 0.23);
      for (let i = 0; i < 4; i++) part(head, GEO.cone, M(0x3a2a1a), 0.06, 0.2, 0.06, -0.1 + i * 0.07, 0.3, 0.0);
      for (const s of [-1, 1]) {
        part(head, GEO.sph, M(L.skin, 0.6), 0.06, 0.09, 0.05, s * 0.27, 0, 0);
        part(head, GEO.cone, B(0xf0e6c0), 0.04, 0.13, 0.04, s * 0.1, -0.2, 0.17, 0.2, 0, 0);
      }
      addFace(head, L.skin, { brow: 0.3, mouth: "open", sep: 0.09, size: 0.07, y: 0.05 });
      break;
    case "elf":
      for (const s of [-1, 1]) part(head, GEO.cone, M(L.skin, 0.6), 0.075, 0.34, 0.07, s * 0.28, 0.12, 0, 0, 0, -s * 1.25);
      dome(0xe8d9a0, 0.288, 0.07, false, 1.0);
      part(head, GEO.cone, M(0xe8d9a0), 0.12, 0.42, 0.12, 0, -0.08, -0.27, 0.35, 0, 0);
      part(head, GEO.ring, steel(0xd6c98a), 0.285, 0.285, 0.285, 0, 0.1, 0, PI / 2 - 0.1, 0, 0);
      part(head, GEO.sph, M(0x4fc27a), 0.04, 0.05, 0.03, 0, 0.18, 0.27);
      addFace(head, L.skin, { sclera: 0xf8f6ea, pupil: 0x2a9a5a, brow: -0.08, mouth: "smile", browColor: 0x9a8350 });
      break;
    case "monk":
      part(head, GEO.box, M(tc), 0.52, 0.09, 0.52, 0, 0.16, 0);
      for (const s of [-1, 1]) part(head, GEO.sph, M(L.skin, 0.6), 0.05, 0.07, 0.04, s * 0.255, -0.01, 0.0);
      addFace(head, L.skin, { brow: -0.1, mouth: "smile", pupil: 0x2a1a10 });
      break;
    case "assassin":
      dome(0x24262e, 0.3, 0.05, false, 1.0);
      part(head, GEO.cone, M(0x24262e), 0.26, 0.4, 0.26, 0, 0.0, -0.2, -1.1, 0, 0);
      part(head, GEO.box, M(0x1b1c22), 0.5, 0.22, 0.34, 0, -0.14, 0.04);
      part(head, GEO.box, M(tc), 0.54, 0.06, 0.54, 0, 0.1, 0);
      addFace(head, L.skin, { size: 0.052, brow: 0.5, mouth: "none", pupil: 0x0d0a08, y: 0.045 });
      break;
    case "mage":
      part(head, GEO.cone, M(0xece7d6, 0.8), 0.1, 0.34, 0.09, 0, -0.27, 0.15, PI, 0, 0);
      part(head, GEO.cone, M(tcd), 0.27, 0.58, 0.27, 0, 0.44, 0, -0.12, 0, 0);
      part(head, GEO.cone, M(tcd), 0.12, 0.3, 0.12, 0, 0.7, -0.07, -0.8, 0, 0);
      part(head, GEO.cyl, M(tcd), 0.46, 0.05, 0.46, 0, 0.2, 0);
      part(head, GEO.ring, steel(GOLD), 0.27, 0.27, 0.27, 0, 0.23, 0, PI / 2, 0, 0);
      addFace(head, L.skin, { brow: -0.05, mouth: "smile", browColor: 0xece7d6 });
      headExtra = 0.55;
      break;
    case "frost":
      part(head, GEO.cone, M(0xe4f2ff, 0.8), 0.1, 0.3, 0.09, 0, -0.26, 0.15, PI, 0, 0);
      part(head, GEO.cone, M(0x3a5f8f), 0.28, 0.6, 0.28, 0, 0.44, 0, -0.16, 0, 0);
      part(head, GEO.cone, M(0x6a9fd8), 0.13, 0.3, 0.13, 0, 0.74, -0.08, -0.7, 0, 0);
      part(head, GEO.cyl, M(0x3a5f8f), 0.47, 0.05, 0.47, 0, 0.2, 0);
      for (const s of [-1, 1]) part(head, GEO.cone, B(0xbfe8ff), 0.05, 0.26, 0.05, s * 0.2, 0.24, -0.05, -0.6, 0, -s * 0.4);
      addFace(head, L.skin, { sclera: 0xeaf6ff, pupil: 0x2a6ad8, brow: -0.06, mouth: "flat", browColor: 0xdceaf5 });
      headExtra = 0.5;
      break;
    case "cleric":
      for (const s of [-1, 1]) part(head, GEO.sph, M(0xcfc6b0), 0.08, 0.1, 0.12, s * 0.22, 0.04, -0.06);
      part(head, GEO.ring, steel(GOLD), 0.3, 0.3, 0.3, 0, 0.58, 0, PI / 2, 0, 0);
      addFace(head, L.skin, { brow: -0.22, mouth: "smile", pupil: 0x3a2a1a });
      headExtra = 0.35;
      break;
    case "sapper":
      // soot-stained bandana, a lit match behind the ear and a grin that knows how this ends
      part(head, GEO.dome, M(tc), 0.29, 0.2, 0.29, 0, 0.08, 0);
      part(head, GEO.box, M(tc), 0.1, 0.05, 0.3, 0.2, 0.06, -0.3, 0.3, 0.4, 0);
      part(head, GEO.cyl, M(0xd8c090), 0.012, 0.2, 0.012, 0.3, 0.1, 0.02, 0.3, 0, 0);
      part(head, GEO.sph, B(0xffa040), 0.035, 0.035, 0.035, 0.3, 0.2, 0.05);
      addFace(head, L.skin, { brow: 0.25, mouth: "grin", uneven: true, sclera: 0xfaf3d8 });
      teeth();
      break;
    case "necromancer":
      // deep hood with a bone crest; only the green eye-lights show
      part(head, GEO.cone, M(0x2c2238), 0.36, 0.66, 0.36, 0, 0.3, -0.06, -0.22, 0, 0);
      part(head, GEO.box, M(0x1c1626), 0.5, 0.36, 0.2, 0, 0.0, -0.2);
      for (const sgn of [-1, 1]) part(head, GEO.cone, boneMat(), 0.045, 0.3, 0.045, sgn * 0.2, 0.34, 0.02, 0, 0, sgn * -0.5);
      part(head, GEO.cone, boneMat(), 0.05, 0.36, 0.05, 0, 0.5, 0.0);
      addFace(head, L.skin, { socket: true, pupil: 0x8fff6a, size: 0.066, brow: 0.05, mouth: "none" });
      headExtra = 0.5;
      break;
    case "zombie":
      part(head, GEO.sph, M(0x4a3325), 0.19, 0.09, 0.09, 0.14, 0.06, 0.2);
      part(head, GEO.box, M(0xe0d8c0), 0.14, 0.12, 0.05, -0.12, 0.2, 0.18, 0, 0, 0.3);
      for (let i = 0; i < 3; i++) part(head, GEO.cone, M(0x3a3224), 0.03, 0.12, 0.03, -0.08 + i * 0.08, 0.28, 0.0);
      part(head, GEO.box, M(L.skin, 0.6), 0.2, 0.05, 0.15, 0, -0.21, 0.1);
      addFace(head, L.skin, { sclera: 0xe6e8a8, pupil: 0x2a2a14, uneven: true, look: 1.2, brow: -0.25, mouth: "open", size: 0.07, browColor: 0x3a3a20 });
      break;
    case "skeleton":
      part(head, GEO.box, M(L.skin, 0.7), 0.28, 0.1, 0.2, 0, -0.22, 0.08);
      for (let i = 0; i < 5; i++) part(head, GEO.box, B(0x2a2418), 0.012, 0.07, 0.01, -0.08 + i * 0.04, -0.2, 0.18);
      addFace(head, L.skin, { socket: true, pupil: tcl, brow: 0.2, mouth: "none", size: 0.06 });
      break;
    case "vampire":
      for (const s of [-1, 1]) part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.3, 0.07, s * 0.28, 0.1, 0, 0, 0, -s * 1.15);
      dome(0x141018, 0.3, 0.05, false, 1.05);
      part(head, GEO.box, M(0x8a1f2a), 0.06, 0.3, 0.5, 0, 0.28, -0.1, -0.3, 0, 0);
      for (const s of [-1, 1]) part(head, GEO.cone, B(0xf6f2e6), 0.035, 0.14, 0.03, s * 0.07, -0.2, 0.2, 0.1, 0, 0);
      addFace(head, L.skin, { sclera: 0xf2e8e0, pupil: 0x8a1420, brow: 0.2, mouth: "grin", size: 0.06 });
      break;
    case "king":
      dome(0x6d2530, 0.3, 0.06, false, 1.0);
      // crown band + points
      part(head, GEO.cyl, M(GOLD, 0.32, 0.75), 0.3, 0.1, 0.3, 0, 0.12, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(head, GEO.cone, M(GOLD, 0.32, 0.75), 0.055, 0.24, 0.055, Math.cos(a) * 0.26, 0.26, Math.sin(a) * 0.26);
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        part(head, GEO.sph, B(0x8c1f2a), 0.045, 0.045, 0.045, Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26);
      }
      part(head, GEO.box, M(0xf0d9b0), 0.28, 0.16, 0.06, 0, -0.2, 0.16); // beard
      addFace(head, L.skin, { brow: 0.1, mouth: "flat", sclera: 0xf8f2e4, pupil: 0x3a2a18 });
      break;
    case "pirate":
      dome(0x2e2734, 0.29, 0.05, false, 1.0);
      part(head, GEO.box, M(0x8a1f2a), 0.52, 0.14, 0.5, 0, 0.09, 0, 0, 0, 0.06); // bandana
      part(head, GEO.box, M(0x8a1f2a), 0.1, 0.3, 0.08, 0.24, -0.02, -0.12, 0.2, 0, 0.3); // tail
      part(head, GEO.sph, M(0x1c161e), 0.085, 0.085, 0.04, -0.105, 0.035, 0.235); // eyepatch
      part(head, GEO.box, M(0xd8cfb8), 0.04, 0.04, 0.3, 0.12, 0.03, 0.02, 0, 0, 0.2); // strap
      part(head, GEO.box, M(0x4a3828), 0.26, 0.12, 0.12, 0, -0.2, 0.14); // beard
      addFace(head, L.skin, { brow: 0.2, mouth: "grin", size: 0.058 });
      break;
    case "hoplite":
      // closed bronze helm with a tall horsehair crest running front to back
      dome(0xb8873a, 0.33, 0.06, true, 1.05);
      part(head, GEO.box, gold(0xb8873a), 0.56, 0.3, 0.5, 0, -0.08, -0.02);
      part(head, GEO.box, B(0x15110c), 0.3, 0.07, 0.03, 0, 0.03, 0.262);
      part(head, GEO.box, B(0x15110c), 0.07, 0.24, 0.03, 0, -0.1, 0.262);
      part(head, GEO.box, gold(0xd2a455), 0.05, 0.2, 0.05, 0, 0.0, 0.275);
      for (const sd of [-1, 1]) part(head, GEO.box, gold(0xd2a455), 0.09, 0.2, 0.05, sd * 0.13, -0.14, 0.262);
      part(head, GEO.box, gold(0x8a6428), 0.06, 0.1, 0.6, 0, 0.33, -0.04);
      for (let i = 0; i < 7; i++) part(head, GEO.box, cloth(i % 2 ? tc : tcl), 0.07, 0.3 - Math.abs(i - 3) * 0.035, 0.1, 0, 0.5, 0.26 - i * 0.1, -0.1 + i * 0.03, 0, 0);
      part(head, GEO.box, cloth(tc), 0.06, 0.4, 0.09, 0, 0.16, -0.42, 0.5, 0, 0);
      for (const sd of [-1, 1]) part(head, GEO.sph, B(0xf7f3e6), 0.04, 0.035, 0.02, sd * 0.1, 0.03, 0.266);
      for (const sd of [-1, 1]) part(head, GEO.sph, B(0x16110d), 0.022, 0.024, 0.02, sd * 0.1, 0.03, 0.274);
      headExtra = 0.34;
      break;
    case "samurai":
      // lacquered helmet, flared neck guard, a gold crescent and a snarling half-mask
      dome(0x2a2228, 0.32, 0.07, true, 0.95);
      part(head, GEO.cyl, M(0x2a2228, 0.4, 0.35), 0.4, 0.035, 0.4, 0, 0.09, 0.03, 0.16, 0, 0);
      for (let i = 0; i < 3; i++) part(head, GEO.box, M(i % 2 ? tc : 0x2a2228, 0.4, 0.35), 0.62 + i * 0.07, 0.085, 0.3, 0, 0.02 - i * 0.085, -0.19 - i * 0.03, -0.28, 0, 0);
      part(head, GEO.tor, gold(GOLD_LIGHT), 0.26, 0.26, 0.5, 0, 0.5, 0.25, 0, 0, PI);
      part(head, GEO.sph, gold(), 0.055, 0.055, 0.04, 0, 0.27, 0.27);
      part(head, GEO.box, M(0x7a1f24, 0.4, 0.3), 0.3, 0.15, 0.1, 0, -0.14, 0.2);
      for (let i = 0; i < 4; i++) part(head, GEO.box, B(0xf0e6c0), 0.022, 0.04, 0.012, -0.06 + i * 0.04, -0.15, 0.255);
      part(head, GEO.box, M(0x7a1f24, 0.4, 0.3), 0.05, 0.1, 0.07, 0, -0.04, 0.25, -0.3, 0, 0);
      addFace(head, L.skin, { brow: 0.42, mouth: "none", size: 0.056, y: 0.05, browColor: 0x15110c });
      headExtra = 0.36;
      break;
    case "ninja":
      dome(0x1d2028, 0.3, 0.05, false, 1.0);
      part(head, GEO.box, M(0x1d2028), 0.52, 0.24, 0.36, 0, -0.14, 0.04);
      part(head, GEO.box, M(0x1d2028), 0.5, 0.1, 0.3, 0, 0.14, 0.06);
      part(head, GEO.box, M(tc), 0.55, 0.07, 0.55, 0, 0.11, 0);
      part(head, GEO.box, steel(STEEL_DARK), 0.2, 0.08, 0.02, 0, 0.11, 0.28);
      for (const sd of [-1, 1]) part(head, GEO.box, M(tc), 0.07, 0.36, 0.03, sd * 0.07, -0.04, -0.3, 0.5, 0, sd * 0.25);
      addFace(head, L.skin, { size: 0.05, brow: 0.45, mouth: "none", pupil: 0x0d0a08, y: 0.03 });
      break;
    case "harpooner":
      // knitted cap, a weathered squint and a full sailor's beard
      part(head, GEO.dome, cloth(tc), 0.29, 0.27, 0.29, 0, 0.06, -0.01);
      part(head, GEO.cyl, cloth(tcd), 0.3, 0.09, 0.3, 0, 0.09, -0.01);
      part(head, GEO.sph, cloth(tcl), 0.07, 0.07, 0.07, 0, 0.36, -0.02);
      part(head, GEO.box, M(0x6b4a30, 0.9), 0.4, 0.22, 0.22, 0, -0.2, 0.1);
      part(head, GEO.box, M(0x6b4a30, 0.9), 0.3, 0.16, 0.18, 0, -0.34, 0.12);
      for (const sd of [-1, 1]) part(head, GEO.box, M(0x6b4a30, 0.9), 0.07, 0.26, 0.2, sd * 0.24, -0.1, 0.04);
      addFace(head, L.skin, { brow: 0.3, mouth: "flat", size: 0.054, browColor: 0x4a3220 });
      break;
    case "snakearcher":
      // wrapped turban with a jewel, and a snake worn like a scarf
      part(head, GEO.sph, cloth(0xefe6cc), 0.34, 0.22, 0.33, 0, 0.17, -0.02);
      for (let i = 0; i < 4; i++) part(head, GEO.tor, cloth(i % 2 ? 0xd9cfae : 0xefe6cc), 0.31, 0.26, 0.9, 0, 0.1 + i * 0.045, -0.02, 0.2, i * 0.8, 0.25);
      part(head, GEO.sph, B(0x3fd08a), 0.05, 0.065, 0.04, 0, 0.2, 0.3);
      part(head, GEO.ring, gold(), 0.07, 0.07, 0.07, 0, 0.2, 0.29);
      part(head, GEO.ring, M(0x4f8a3a, 0.6), 0.25, 0.22, 1.2, 0, -0.26, 0.0, PI / 2, 0, 0);
      part(head, GEO.sph, M(0x4f8a3a, 0.6), 0.06, 0.045, 0.085, 0.18, -0.24, 0.2);
      part(head, GEO.box, B(0xd03a3a), 0.012, 0.012, 0.08, 0.2, -0.25, 0.3);
      addFace(head, L.skin, { brow: 0.1, mouth: "smile", pupil: 0x3a2a12, sclera: 0xf6efd8, browColor: 0x241a10 });
      headExtra = 0.12;
      break;
    case "valkyrie":
      // winged helm, long braid over the shoulder
      dome(0xcfd6e2, 0.305, 0.07, true, 0.95);
      part(head, GEO.ring, steel(GOLD), 0.305, 0.305, 0.3, 0, 0.08, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(0xcfd6e2), 0.045, 0.2, 0.04, 0, 0.02, 0.278);
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 3; i++) part(head, GEO.box, cloth(0xf6f3ea), 0.035, 0.34 - i * 0.07, 0.11, sd * 0.3, 0.3 + i * 0.03, -0.02 - i * 0.09, -0.5 - i * 0.2, 0, -sd * 0.25);
        part(head, GEO.sph, gold(), 0.05, 0.05, 0.03, sd * 0.29, 0.1, 0.02);
        part(head, GEO.box, M(0xe8cf7a, 0.8), 0.07, 0.3, 0.1, sd * 0.2, -0.12, -0.12);
      }
      part(head, GEO.sph, M(0xe8cf7a, 0.8), 0.27, 0.26, 0.2, 0, -0.02, -0.12);
      for (let i = 0; i < 5; i++) part(head, GEO.sph, M(i % 2 ? 0xd9bd62 : 0xe8cf7a, 0.8), 0.075, 0.085, 0.075, 0.12 + i * 0.012, -0.24 - i * 0.12, -0.2 - i * 0.012);
      part(head, GEO.box, M(tc), 0.09, 0.05, 0.09, 0.18, -0.84, -0.26);
      addFace(head, L.skin, { sclera: 0xf8f6ee, pupil: 0x3f7fc0, brow: 0.14, mouth: "flat", browColor: 0xb89a4a });
      headExtra = 0.3;
      break;
    case "fanbearer":
      // tall black court cap tied under the chin
      part(head, GEO.dome, M(0x17161c, 0.5), 0.29, 0.2, 0.29, 0, 0.1, 0);
      part(head, GEO.box, M(0x17161c, 0.5), 0.2, 0.46, 0.24, 0, 0.4, -0.06, -0.12, 0, 0);
      part(head, GEO.box, M(0x17161c, 0.5), 0.05, 0.3, 0.4, 0, 0.5, -0.26, -0.7, 0, 0);
      for (const sd of [-1, 1]) part(head, GEO.box, cloth(0xf4f1e6), 0.02, 0.3, 0.02, sd * 0.24, -0.08, 0.06, 0, 0, sd * 0.25);
      part(head, GEO.sph, B(0xc8323a), 0.02, 0.012, 0.012, 0, 0.115, 0.262);
      addFace(head, L.skin, { brow: -0.16, mouth: "smile", size: 0.056, pupil: 0x1a120c, browColor: 0x17161c });
      headExtra = 0.55;
      break;
    case "zeus": {
      const hair = 0xf2ede0;
      dome(hair, 0.31, 0.055, false, 1.02);
      part(head, GEO.sph, M(hair, 0.78), 0.33, 0.3, 0.32, 0, -0.02, -0.13);
      for (let i = 0; i < 5; i++) {
        part(head, GEO.box, M(hair, 0.78), 0.09, 0.34, 0.11, -0.24 + i * 0.12, -0.16, -0.14 - i * 0.02, 0.22, 0, (i - 2) * 0.12);
      }
      part(head, GEO.cyl, M(GOLD, 0.3, 0.82), 0.315, 0.07, 0.315, 0, 0.12, 0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 0.3 + (i % 2) * 0.2;
        part(head, GEO.cone, M(GOLD, 0.28, 0.85), 0.045, h, 0.045, Math.cos(a) * 0.28, 0.22 + h * 0.5, Math.sin(a) * 0.28, 0, 0, Math.cos(a) * 0.2);
        part(head, GEO.sph, B(0x9fd8ff), 0.045, 0.045, 0.045, Math.cos(a) * 0.28, 0.22 + h, Math.sin(a) * 0.28);
      }
      part(head, GEO.box, M(GOLD, 0.3, 0.85), 0.36, 0.12, 0.32, 0, 0.16, 0.05);
      part(head, GEO.sph, B(0x9fd8ff), 0.07, 0.07, 0.05, 0, 0.16, 0.23);
      addFace(head, L.skin, { sclera: 0xbfe6ff, pupil: 0x2c79d8, brow: -0.18, mouth: "smile", size: 0.072, browColor: 0xf2ede0 });
      part(head, GEO.cone, M(hair, 0.8), 0.22, 0.62, 0.19, 0, -0.3, 0.13, PI, 0, 0);
      part(head, GEO.box, M(hair, 0.8), 0.42, 0.13, 0.18, 0, -0.17, 0.11);
      for (let i = 0; i < 4; i++) {
        const t = i - 1.5;
        part(head, GEO.box, M(hair, 0.8), 0.09, 0.34, 0.1, t * 0.1, -0.42 - i * 0.05, 0.06 - i * 0.03, 0.18, 0, t * 0.12);
      }
      for (const sd of [-1, 1]) {
        part(head, GEO.box, M(hair, 0.8), 0.17, 0.09, 0.11, sd * 0.13, -0.17, 0.12, 0, 0, sd * 0.42);
      }
      break;
    }
  }
  detailHead(kind, head, tc, tcl, L.skin);

  // arms
  const bareArms = kind === "berserker" || kind === "giant" || kind === "orc" || kind === "troll" || kind === "monk" || kind === "hoplite" || kind === "harpooner";
  const mkArm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * (cw / 2 + 0.15), 0.8, 0);
    torso.add(a);
    const t = skel ? 0.09 : 0.2;
    const sleeveC = bareArms ? L.skin : L.armor;
    const foreC = kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin"
      ? 0x8b93a1
      : kind === "archer" || kind === "crossbow" || kind === "javelin" || kind === "bonearcher" ? 0x4a3826
      : bareArms ? L.skin : L.armor;
    if (skel) {
      part(a, GEO.sph, boneMat(L.skin), t * 0.62, t * 0.62, t * 0.62, 0, -0.02, 0);
      part(a, GEO.box, M(sleeveC), t, 0.42, t * 1.1, 0, -0.19, 0);
      part(a, GEO.sph, M(foreC), t * 0.56, t * 0.52, t * 0.6, 0, -0.38, -0.01);
      part(a, GEO.box, M(foreC), t * 0.88, 0.36, t * 0.98, 0, -0.5, 0);
    } else {
      // Shoulder cap, a tapered upper arm and a forearm that swells into a cuff at the wrist.
      part(a, GEO.sph, M(sleeveC), t * 0.66, t * 0.62, t * 0.68, 0, -0.01, 0);
      part(a, GEO.limb, M(sleeveC), t * 1.16, 0.44, t * 1.22, 0, -0.2, 0);
      part(a, GEO.sph, armored ? steel(STEEL_LIGHT) : M(foreC), t * 0.5, t * 0.48, t * 0.54, 0, -0.39, -0.01);
      part(a, GEO.limb, M(foreC), t * 1.06, 0.34, t * 1.12, 0, -0.51, 0, PI, 0, 0);
      part(a, GEO.pillY, armored ? steel(STEEL_DARK) : M(dark(foreC, 0.8)), t * 1.16, 0.09, t * 1.2, 0, -0.63, 0);
    }
    if (kind === "mage" || kind === "cleric" || kind === "frost" || kind === "shaman" || kind === "fanbearer") part(a, GEO.cone, M(kind === "mage" ? tc : L.armor), kind === "fanbearer" ? 0.26 : 0.2, kind === "fanbearer" ? 0.5 : 0.4, 0.2, 0, -0.5, 0, PI, 0, 0);
    if (kind === "samurai") { part(a, GEO.box, M(0x2a2228, 0.4, 0.35), t * 1.05, 0.3, t * 1.1, 0, -0.5, 0); part(a, GEO.box, M(tc), t * 1.08, 0.03, t * 1.12, 0, -0.42, 0); }
    if (kind === "valkyrie" || kind === "hoplite") part(a, GEO.box, kind === "hoplite" ? gold(0xb8873a) : steel(0xcfd6e2), t * 0.98, 0.26, t * 1.06, 0, -0.52, 0);
    if (bareArms) part(a, GEO.box, M(0x4a3a28), t * 1.1, 0.1, t * 1.1, 0, -0.52, 0);
    // Mitten hand with a thumb: big enough to read at battlefield distance.
    const handM = skel ? boneMat(L.skin) : armored ? steel(STEEL_DARK) : M(L.skin, 0.6);
    part(a, GEO.softer, handM, skel ? 0.15 : 0.2, skel ? 0.17 : 0.22, skel ? 0.16 : 0.22, 0, -0.74, 0.01);
    part(a, GEO.sph, handM, 0.045, 0.06, 0.05, -side * 0.085, -0.73, 0.05);
    return a;
  };
  const lArm = mkArm(1), rArm = mkArm(-1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);

  let handMode: HandMode = "follow";
  let handRest = 0;
  const polearm = (len: number, thick: number, tipLen: number, head?: "axe" | "spear" | "halberd") => {
    part(hand, GEO.cyl, M(0x6b4a2a, 0.7), thick, len, thick, 0, 0, len * 0.35, PI / 2, 0, 0);
    part(hand, GEO.cone, steel(STEEL_DARK), thick * 1.6, 0.18, thick * 1.6, 0, 0, -len * 0.14, -PI / 2, 0, 0);
    part(hand, GEO.cyl, steel(STEEL_LIGHT), thick * 1.45, 0.14, thick * 1.45, 0, 0, len * 0.72, PI / 2, 0, 0);
    if (head === "axe") {
      part(hand, GEO.box, steel(0x8b939f), 0.06, 0.5, 0.44, 0, 0.02, len * 0.78);
      part(hand, GEO.box, steel(STEEL_LIGHT), 0.032, 0.56, 0.12, 0, 0.22, len * 0.8);
      part(hand, GEO.box, steel(0x8b939f), 0.06, 0.3, 0.3, 0, -0.02, len * 0.3);
    } else if (head === "halberd") {
      part(hand, GEO.cone, steel(0xc7cfdb), thick * 2.8, tipLen, thick * 2.8, 0, 0, len * 0.78, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0x8b939f), 0.05, 0.4, 0.3, 0, 0.02, len * 0.72);
      part(hand, GEO.box, steel(STEEL_LIGHT), 0.03, 0.48, 0.09, 0, 0.24, len * 0.72);
      part(hand, GEO.cone, steel(0x8b939f), 0.05, 0.2, 0.05, 0, -0.06, len * 0.62, 0, 0, 0);
    } else {
      part(hand, GEO.cone, steel(0xc7cfdb), thick * 2.8, tipLen, thick * 2.8, 0, 0, len * 0.78, PI / 2, 0, 0);
    }
  };
  const staffWithOrb = (robe: number, glow: number) => {
    part(hand, GEO.cyl, M(0x4a3520), 0.04, 1.75, 0.04, 0, 0, 0.3, PI / 2, 0, 0);
    part(hand, GEO.cone, gold(robe), 0.075, 0.22, 0.075, 0, 0, 1.04, PI / 2, 0, 0);
    part(hand, GEO.sph, B(glow), 0.15, 0.15, 0.15, 0, 0.0, 1.2);
    part(hand, GEO.sph, B(0xffffff), 0.08, 0.08, 0.08, 0, 0.0, 1.2);
    part(hand, GEO.ring, steel(robe), 0.2, 0.2, 0.2, 0, 0.0, 1.2, 0.6, 0.4, 0);
    part(hand, GEO.ring, steel(robe), 0.2, 0.2, 0.2, 0, 0.0, 1.2, 0.0, 0.9, 0.0);
  };

  switch (kind) {
    case "spear": {
      part(lArm, GEO.cyl, M(0x7a5532, 0.7), 0.4, 0.07, 0.4, 0.12, -0.5, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.4, 0.4, 0.5, 0.12, -0.5, 0.235);
      part(lArm, GEO.sph, steel(), 0.1, 0.1, 0.07, 0.12, -0.5, 0.26);
      part(lArm, GEO.box, M(tc), 0.06, 0.52, 0.03, 0.12, -0.5, 0.246);
      polearm(2.7, 0.035, 0.46);
      part(hand, GEO.box, M(tc), 0.02, 0.16, 0.34, 0, 0.07, 2.0);
      handMode = "fixed"; handRest = 0.1;
      break;
    }
    case "guardian": {
      part(lArm, GEO.box, steel(), 0.66, 1.0, 0.08, 0.1, -0.42, 0.26);
      part(lArm, GEO.box, M(tc), 0.46, 0.76, 0.09, 0.1, -0.42, 0.265);
      part(lArm, GEO.box, M(GOLD, 0.4, 0.5), 0.34, 0.07, 0.1, 0.1, -0.3, 0.27);
      part(lArm, GEO.dome, steel(), 0.33, 0.14, 0.33, 0.1, 0.08, 0.26, 0, 0, 0);
      part(hand, GEO.box, steel(0xdde3ec), 0.05, 0.13, 0.85, 0, 0, 0.58);
      part(hand, GEO.cone, steel(0xdde3ec), 0.065, 0.14, 0.04, 0, 0, 1.06, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.34, 0.05, 0.07, 0, 0, 0.14);
      handRest = -0.9;
      break;
    }
    case "archer": case "elf": case "bonearcher": case "snakearcher": {
      const big = kind === "elf" ? 1.2 : 1;
      if (kind === "snakearcher") {
        // the arrow on the string is already half snake
        part(hand, GEO.sph, M(0x4f8a3a, 0.6), 0.06, 0.05, 0.1, 0, 0, 0.62);
        for (const sd of [-1, 1]) part(hand, GEO.sph, B(0xffd84a), 0.016, 0.016, 0.016, sd * 0.035, 0.03, 0.68);
        part(hand, GEO.box, B(0xd03a3a), 0.012, 0.012, 0.09, 0, -0.01, 0.76);
        for (let i = 0; i < 4; i++) part(hand, GEO.sph, M(i % 2 ? 0x3f7a2e : 0x5fa046, 0.6), 0.04, 0.04, 0.07, Math.sin(i * 1.6) * 0.03, 0, 0.12 + i * 0.12);
      }
      part(hand, GEO.tor, M(kind === "bonearcher" ? 0xcabc96 : kind === "elf" ? 0xc8a060 : kind === "snakearcher" ? 0x5a7a34 : 0x7a5228), 0.52 * big, 0.52 * big, 0.05, 0, 0, -0.5 * big, 0, PI / 2, PI / 2);
      part(hand, GEO.box, B(0xe6dcb0), 0.02, 1.04 * big, 0.02, 0, 0, -0.5 * big);
      part(hand, GEO.cyl, M(skel ? 0xd8d0b4 : 0xb69250), 0.022, 1.0, 0.022, 0, 0, 0.0, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(), 0.05, 0.14, 0.05, 0, 0, 0.55, PI / 2, 0, 0);
      if (kind === "elf") for (const s of [-1, 1]) part(hand, GEO.sph, M(0x4fc27a), 0.05, 0.12, 0.04, 0, s * 0.62, 0.0);
      handMode = "fixed"; handRest = 0;
      break;
    }
    case "crossbow": {
      part(hand, GEO.box, M(0x6b4a2a), 0.09, 0.1, 0.85, 0, 0, 0.18);
      part(hand, GEO.box, steel(0x5a606c), 0.95, 0.06, 0.07, 0, 0.0, 0.58);
      part(hand, GEO.box, B(0xe6dcb0), 0.9, 0.015, 0.015, 0, 0.0, 0.4);
      part(hand, GEO.cyl, steel(), 0.02, 0.5, 0.02, 0, 0.07, 0.38, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(), 0.04, 0.1, 0.04, 0, 0.07, 0.66, PI / 2, 0, 0);
      handMode = "fixed"; handRest = 0;
      break;
    }
    case "swordsman": {
      part(hand, GEO.box, steel(0xdde3ec), 0.045, 0.1, 1.0, 0, 0, 0.42);
      part(hand, GEO.cone, steel(0xdde3ec), 0.055, 0.16, 0.03, 0, 0, 0.98, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.24, 0.05, 0.08, 0, 0, -0.04);
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.22, 0.06, 0.22, 0.1, -0.5, 0.14, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.22, 0.22, 0.3, 0.1, -0.5, 0.17);
      handRest = -0.6;
      break;
    }
    case "halberdier": {
      polearm(3.3, 0.04, 0.5, "halberd");
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.34, 0.06, 0.34, 0.12, -0.5, 0.16, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.34, 0.34, 0.42, 0.12, -0.5, 0.19);
      handMode = "fixed"; handRest = 0.1;
      break;
    }
    case "paladin": {
      part(hand, GEO.cyl, M(GOLD, 0.4, 0.6), 0.07, 0.9, 0.07, 0, 0, 0.0, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0xdde3ec), 0.05, 0.12, 0.9, 0, 0.02, 0.6);
      part(hand, GEO.cone, steel(0xdde3ec), 0.07, 0.2, 0.05, 0, 0.02, 1.1, PI / 2, 0, 0);
      part(hand, GEO.box, M(tc), 0.2, 0.24, 0.06, 0, 0.02, 0.16);
      part(lArm, GEO.box, steel(0xd8dbe2), 0.42, 0.66, 0.08, 0.1, -0.42, 0.22);
      part(lArm, GEO.box, M(tc), 0.3, 0.5, 0.09, 0.1, -0.42, 0.225);
      part(lArm, GEO.cone, M(GOLD, 0.35, 0.7), 0.1, 0.26, 0.05, 0.1, -0.06, 0.24, PI / 2, 0, 0);
      handRest = -0.7;
      break;
    }
    case "orc": {
      part(lArm, GEO.cyl, M(0x6a4a2a, 0.8), 0.38, 0.07, 0.38, 0.1, -0.5, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(0x8b939f), 0.38, 0.38, 0.5, 0.1, -0.5, 0.235);
      for (let i = 0; i < 4; i++) part(lArm, GEO.cone, steel(0x8b939f), 0.05, 0.14, 0.05, 0.1 + Math.cos(i * 1.57) * 0.24, -0.5 + Math.sin(i * 1.57) * 0.24, 0.26, PI / 2, 0, 0);
      polearm(1.1, 0.05, 0.2, "axe");
      part(hand, GEO.sph, M(0xd7a64a, 0.4, 0.7), 0.06, 0.06, 0.06, 0, 0, 0.0);
      handRest = -1.1;
      break;
    }
    case "berserker": {
      polearm(0.95, 0.045, 0.2, "axe");
      part(lArm, GEO.cyl, M(0x5d4226), 0.045, 0.85, 0.045, 0, -0.74, 0.28, PI / 2 - 0.5, 0, 0);
      part(lArm, GEO.box, steel(0x9aa3b2), 0.05, 0.36, 0.3, 0, -0.5, 0.64, -0.5, 0, 0);
      handRest = -1.0;
      break;
    }
    case "javelin": {
      part(hand, GEO.cyl, M(0x9a7a4a), 0.032, 1.7, 0.032, 0.1, 0, 0.3, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(0xc7cfdb), 0.075, 0.36, 0.075, 0.1, 0, 1.2, PI / 2, 0, 0);
      part(lArm, GEO.cyl, M(0x9a7a4a), 0.03, 1.5, 0.03, -0.16, -0.2, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.cone, steel(0xc7cfdb), 0.07, 0.3, 0.07, -0.16, -0.2, 0.98, PI / 2, 0, 0);
      handMode = "fixed"; handRest = -0.2;
      break;
    }
    case "bomber": {
      part(hand, GEO.sph, M(0x25252a, 0.5, 0.2), 0.2, 0.2, 0.2, 0, 0.12, 0.18);
      part(hand, GEO.cyl, M(0xa58a5a), 0.02, 0.14, 0.02, 0, 0.35, 0.18);
      part(hand, GEO.sph, B(0xffb050), 0.06, 0.06, 0.06, 0, 0.44, 0.18);
      part(hand, GEO.sph, B(0xfff0a0), 0.03, 0.03, 0.03, 0, 0.46, 0.18);
      handRest = 0;
      break;
    }
    case "shaman": {
      part(hand, GEO.cyl, M(0x4a3520), 0.04, 1.6, 0.04, 0, 0, 0.28, PI / 2, 0, 0);
      part(hand, GEO.sph, M(0xe8e0c8), 0.14, 0.14, 0.14, 0, 0.0, 1.12);
      part(hand, GEO.box, B(0x1a140c), 0.1, 0.06, 0.06, 0, 0.14, 1.12);
      part(hand, GEO.cone, B(0x8fe06a), 0.05, 0.12, 0.05, 0, -0.12, 1.12, PI / 2, 0, 0);
      handMode = "fixed"; handRest = -1.4;
      break;
    }
    case "troll": {
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.14, 2.3, 0.14, 0, 0, 0.9, PI / 2, 0, 0);
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.24, 0.9, 0.24, 0, 0, 1.9, PI / 2, 0, 0);
      for (let i = 0; i < 5; i++) part(hand, GEO.cone, steel(0x7a808c), 0.06, 0.2, 0.06, Math.cos(i * 1.05) * 0.26, Math.sin(i * 1.05) * 0.26, 1.9, 0, 0, 0);
      handRest = -1.1;
      break;
    }
    case "giant": {
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.17, 2.6, 0.17, 0, 0, 1.0, PI / 2, 0, 0);
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.28, 1.0, 0.28, 0, 0, 2.1, PI / 2, 0, 0);
      for (let i = 0; i < 6; i++) part(hand, GEO.cone, steel(0x7a808c), 0.07, 0.2, 0.07, Math.cos(i * 1.05) * 0.3, Math.sin(i * 1.05) * 0.3, 2.1, 0, 0, 0);
      handRest = -1.1;
      break;
    }
    case "monk": {
      for (const arm of [lArm, rArm]) for (const f of [0, 1, 2, 3]) {
        part(arm, GEO.box, M(L.skin, 0.6), 0.035, 0.13, 0.035, (f - 1.5) * 0.045, -0.8, 0.02, 0.1, 0, 0);
      }
      handRest = -0.3;
      break;
    }
    case "assassin": {
      part(hand, GEO.box, steel(0xd9dfe8), 0.04, 0.09, 0.5, 0, 0, 0.36);
      part(hand, GEO.cone, steel(0xd9dfe8), 0.05, 0.1, 0.03, 0, 0, 0.66, PI / 2, 0, 0);
      part(hand, GEO.box, M(0x14151a), 0.18, 0.04, 0.05, 0, 0, 0.1);
      part(lArm, GEO.box, steel(0xd9dfe8), 0.04, 0.09, 0.45, 0, -0.62, 0.34, -0.9, 0, 0);
      handRest = -0.9;
      break;
    }
    case "mage": staffWithOrb(GOLD, team === 0 ? 0xd9a8ff : 0xffc0a0); handMode = "fixed"; handRest = -1.45; break;
    case "frost": staffWithOrb(0x8fc0f0, 0x9fe0ff); handMode = "fixed"; handRest = -1.45; break;
    case "cleric": {
      part(hand, GEO.cyl, M(0xe0d8c0), 0.04, 1.6, 0.04, 0, 0, 0.3, PI / 2, 0, 0);
      part(hand, GEO.ring, steel(GOLD), 0.2, 0.2, 0.2, 0, 0.0, 1.15, 0, PI / 2, 0);
      part(hand, GEO.sph, B(0xfff2b0), 0.1, 0.1, 0.1, 0, 0.0, 1.15);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.05, 0.3, 0.05, 0, 0.0, 1.15, 0, 0, 0);
      handMode = "fixed"; handRest = -1.45;
      break;
    }
    case "king": {
      part(hand, GEO.cyl, M(0x6b4a2a, 0.7), 0.045, 1.5, 0.045, 0, 0, 0.7, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0xe4e9f2), 0.05, 0.13, 1.5, 0, 0, 0.95);
      part(hand, GEO.cone, steel(0xe4e9f2), 0.07, 0.28, 0.035, 0, 0, 1.78, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.35, 0.7), 0.3, 0.05, 0.08, 0, 0, 0.28);
      part(hand, GEO.sph, M(GOLD, 0.3, 0.8), 0.08, 0.08, 0.08, 0, 0, 0.28);
      // scepter in the left hand
      part(lArm, GEO.cyl, M(GOLD, 0.35, 0.7), 0.04, 1.7, 0.04, 0.08, -0.5, 0.2, PI / 2 - 0.4, 0, 0);
      part(lArm, GEO.sph, B(0xffe27a), 0.12, 0.12, 0.12, 0.08, -0.5, 0.85);
      handMode = "fixed"; handRest = -0.2;
      break;
    }
    case "pirate": {
      part(hand, GEO.box, M(0x3a2c22, 0.7), 0.07, 0.12, 0.4, 0, 0, 0.4);
      part(hand, GEO.cyl, M(0x8a8f98, 0.35, 0.8), 0.035, 0.5, 0.035, 0, 0, 0.72, PI / 2, 0, 0);
      part(hand, GEO.box, M(0x6b4a2a, 0.7), 0.06, 0.16, 0.1, 0, -0.08, 0.28);
      part(hand, GEO.sph, M(GOLD, 0.35, 0.75), 0.045, 0.045, 0.045, 0, 0.12, 0.34);
      handMode = "fixed"; handRest = -0.15;
      break;
    }
    case "zeus": {
      part(hand, GEO.cyl, M(0xd8cfa8, 0.8), 0.05, 2.1, 0.05, 0, 0, 0.95, PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) part(hand, GEO.cyl, M(GOLD, 0.3, 0.8), 0.085, 0.07, 0.085, 0, 0, 0.2 + i * 0.35, PI / 2, 0, 0);
      part(hand, GEO.sph, B(0xe4f2ff), 0.17, 0.17, 0.17, 0, 0, 1.82);
      part(hand, GEO.sph, B(0x9fd8ff), 0.1, 0.1, 0.1, 0, 0, 1.82);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const spike = part(hand, GEO.cone, M(GOLD, 0.28, 0.85), 0.045, 0.3, 0.045,
          Math.cos(a) * 0.13, Math.sin(a) * 0.13, 1.82);
        spike.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      }
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const bx = Math.cos(a), by = Math.sin(a);
        for (let seg = 0; seg < 3; seg++) {
          const r0 = 0.34 + seg * 0.28;
          const jitter = (seg % 2 ? 1 : -1) * 0.14;
          const arc = part(hand, GEO.box, B(0xe6f2ff), 0.038, 0.038, 0.34,
            bx * r0 + by * jitter, by * r0 - bx * jitter, 1.82);
          arc.rotation.z = a;
        }
      }
      part(hand, GEO.ring, M(GOLD, 0.3, 0.8), 0.36, 0.36, 0.36, 0, 0, 1.82, 0, PI / 2, 0);
      part(hand, GEO.ring, M(GOLD, 0.3, 0.8), 0.52, 0.52, 0.52, 0, 0, 1.82, 0, PI / 2, 0);
      handMode = "fixed"; handRest = -1.3;
      break;
    }
    case "sapper": {
      // powder keg hugged to the chest, fuse already burning
      part(hand, GEO.cyl, M(0x6b4a2a, 0.8), 0.27, 0.56, 0.27, 0.2, 0.18, 0.2, 0, 0, PI / 2);
      for (const k of [-0.2, 0, 0.2]) part(hand, GEO.cyl, steel(IRON), 0.285, 0.05, 0.285, 0.2 + k, 0.18, 0.2, 0, 0, PI / 2);
      part(hand, GEO.cyl, M(0x2a2420), 0.07, 0.04, 0.07, 0.2, 0.46, 0.2);
      part(hand, GEO.cyl, M(0xd8c090), 0.014, 0.2, 0.014, 0.2, 0.56, 0.2, 0, 0, 0.3);
      part(hand, GEO.sph, B(0xffa040), 0.07, 0.07, 0.07, 0.17, 0.68, 0.2);
      part(hand, GEO.sph, B(0xfff2b0), 0.035, 0.035, 0.035, 0.17, 0.7, 0.2);
      handMode = "fixed"; handRest = -0.9;
      break;
    }
    case "necromancer": {
      // crooked staff topped with a skull that leaks green light
      part(hand, GEO.cyl, M(0x2a1f18), 0.04, 1.8, 0.04, 0, 0, 0.3, PI / 2, 0, 0);
      part(hand, GEO.sph, boneMat(), 0.15, 0.16, 0.15, 0, 0.0, 1.26);
      part(hand, GEO.box, boneMat(BONE_DARK), 0.14, 0.08, 0.1, 0, -0.1, 1.26);
      for (const sgn of [-1, 1]) part(hand, GEO.sph, B(0x8fff6a), 0.04, 0.04, 0.04, sgn * 0.06, 0.03, 1.39);
      part(hand, GEO.ring, B(0x5fd04a), 0.24, 0.24, 0.24, 0, 0.0, 1.26, 0.5, 0.3, 0);
      for (const sgn of [-1, 1]) part(hand, GEO.cone, boneMat(), 0.03, 0.2, 0.03, sgn * 0.12, 0.0, 1.05, PI / 2, 0, sgn * 0.6);
      handMode = "fixed"; handRest = -1.45;
      break;
    }
    case "skeleton": {
      part(hand, GEO.box, steel(0x8c8f8a), 0.05, 0.12, 0.95, 0, 0, 0.55);
      part(hand, GEO.box, M(0x5a4630), 0.3, 0.05, 0.07, 0, 0, 0.1);
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.3, 0.06, 0.3, 0.1, -0.5, 0.18, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(0x8c8f8a), 0.3, 0.3, 0.45, 0.1, -0.5, 0.21);
      handRest = -1.0;
      break;
    }
    case "vampire": {
      part(hand, GEO.box, steel(0xe8ecf2), 0.04, 0.1, 1.1, 0, 0, 0.45);
      part(hand, GEO.cone, steel(0xe8ecf2), 0.05, 0.18, 0.03, 0, 0, 1.06, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.35, 0.7), 0.26, 0.05, 0.09, 0, 0, -0.02);
      part(hand, GEO.box, B(0x8a1420), 0.16, 0.03, 0.04, 0.2, 0.02, 0.2);
      handRest = -0.6;
      break;
    }
    case "zombie":
      for (const arm of [lArm, rArm]) for (let f = -1; f <= 1; f++) part(arm, GEO.box, M(L.skin, 0.6), 0.045, 0.15, 0.045, f * 0.055, -0.82, 0.08);
      break;
    case "hoplite": {
      // great round shield: bronze face, team-coloured field, a chevron blazon
      part(lArm, GEO.cyl, gold(0xb8873a), 0.56, 0.07, 0.56, 0.12, -0.46, 0.24, PI / 2, 0, 0);
      part(lArm, GEO.cyl, M(tc), 0.47, 0.075, 0.47, 0.12, -0.46, 0.245, PI / 2, 0, 0);
      part(lArm, GEO.ring, gold(0xd2a455), 0.56, 0.56, 0.6, 0.12, -0.46, 0.27);
      for (const sd of [-1, 1]) part(lArm, GEO.box, B(0xf4f1e6), 0.42, 0.075, 0.02, 0.12 + sd * 0.14, -0.5, 0.29, 0, 0, sd * 0.9);
      part(lArm, GEO.sph, gold(0xd2a455), 0.09, 0.09, 0.06, 0.12, -0.2, 0.29);
      polearm(2.9, 0.036, 0.5);
      part(hand, GEO.cone, gold(0xb8873a), 0.05, 0.22, 0.05, 0, 0, -0.52, -PI / 2, 0, 0);
      handMode = "fixed"; handRest = 0.1;
      break;
    }
    case "samurai": {
      // long curved sword held two-handed
      part(hand, GEO.box, steel(0xe8ecf2), 0.035, 0.085, 0.62, 0, 0, 0.5);
      part(hand, GEO.box, steel(0xe8ecf2), 0.033, 0.08, 0.5, 0, 0.035, 1.02, -0.08, 0, 0);
      part(hand, GEO.cone, steel(0xe8ecf2), 0.04, 0.16, 0.022, 0, 0.065, 1.33, PI / 2 - 0.12, 0, 0);
      part(hand, GEO.box, steel(STEEL_LIGHT), 0.012, 0.03, 1.1, 0, -0.03, 0.75);
      part(hand, GEO.cyl, gold(), 0.085, 0.022, 0.085, 0, 0, 0.17, PI / 2, 0, 0);
      part(hand, GEO.cyl, M(0x15131a, 0.6), 0.036, 0.42, 0.036, 0, 0, -0.04, PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) part(hand, GEO.box, M(tc), 0.075, 0.075, 0.03, 0, 0, -0.18 + i * 0.09, 0, 0, PI / 4);
      handRest = -0.75;
      break;
    }
    case "ninja": {
      // a throwing star between the fingers, more on the belt
      for (const a of [0, PI / 4]) part(hand, GEO.box, steel(STEEL_LIGHT), 0.26, 0.012, 0.06, 0, 0.04, 0.12, 0, a * 2, 0);
      for (const a of [PI / 4, (3 * PI) / 4]) part(hand, GEO.box, steel(0x8b939f), 0.2, 0.014, 0.05, 0, 0.04, 0.12, 0, a, 0);
      part(hand, GEO.cyl, B(0x15131a), 0.03, 0.02, 0.03, 0, 0.04, 0.12);
      part(lArm, GEO.box, steel(0xd9dfe8), 0.035, 0.08, 0.4, 0, -0.66, 0.3, -0.9, 0, 0);
      handRest = -0.4;
      break;
    }
    case "harpooner": {
      // barbed harpoon with the line made fast to the shaft
      part(hand, GEO.cyl, M(0x7a5a34, 0.8), 0.04, 2.0, 0.04, 0.1, 0, 0.35, PI / 2, 0, 0);
      part(hand, GEO.cyl, steel(STEEL_DARK), 0.03, 0.5, 0.03, 0.1, 0, 1.55, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(0xc7cfdb), 0.085, 0.34, 0.03, 0.1, 0, 1.94, PI / 2, 0, 0);
      for (const sd of [-1, 1]) part(hand, GEO.cone, steel(0xc7cfdb), 0.035, 0.22, 0.02, 0.1 + sd * 0.085, 0, 1.76, -PI / 2 - sd * 0.0, 0, sd * 0.5);
      part(hand, GEO.ring, M(0xc9b27a, 0.95), 0.07, 0.07, 0.3, 0.1, 0, 1.3, 0, PI / 2, 0);
      part(hand, GEO.cyl, M(0xc9b27a, 0.95), 0.014, 1.5, 0.014, 0.12, -0.12, 0.5, PI / 2 + 0.16, 0, 0);
      part(lArm, GEO.ring, M(0xc9b27a, 0.95), 0.2, 0.2, 0.7, 0, -0.74, 0.02, 0, PI / 2, 0);
      handMode = "fixed"; handRest = -0.2;
      break;
    }
    case "valkyrie": {
      // winged spear and a small steel buckler
      polearm(2.3, 0.034, 0.5);
      for (const sd of [-1, 1]) part(hand, GEO.box, cloth(0xf6f3ea), 0.3, 0.02, 0.16, sd * 0.17, 0, 1.6, 0, sd * 0.5, 0);
      part(hand, GEO.sph, gold(), 0.06, 0.06, 0.06, 0, 0, 1.62);
      part(lArm, GEO.cyl, steel(0xcfd6e2), 0.3, 0.05, 0.3, 0.1, -0.5, 0.18, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(GOLD), 0.3, 0.3, 0.4, 0.1, -0.5, 0.2);
      part(lArm, GEO.cone, gold(), 0.08, 0.14, 0.08, 0.1, -0.5, 0.26, PI / 2, 0, 0);
      handMode = "fixed"; handRest = 0.15;
      break;
    }
    case "fanbearer": {
      // a war fan as wide as its bearer: paper leaf, red sun, lacquered ribs
      part(hand, GEO.cyl, M(0x15131a, 0.5), 0.035, 0.7, 0.035, 0, 0, 0.2, PI / 2, 0, 0);
      part(hand, GEO.cyl, cloth(0xf4f1e6), 0.72, 0.03, 0.72, 0, 0, 1.1, 0, 0, PI / 2);
      part(hand, GEO.cyl, B(0xc8323a), 0.3, 0.036, 0.3, 0, 0, 1.12, 0, 0, PI / 2);
      part(hand, GEO.ring, gold(), 0.72, 0.72, 0.5, 0, 0, 1.1, 0, PI / 2, 0);
      for (let i = 0; i < 5; i++) part(hand, GEO.box, M(0x15131a, 0.5), 0.04, 0.02, 1.25, 0, 0, 1.0, (i - 2) * 0.42, 0, 0);
      part(hand, GEO.box, M(tc), 0.03, 0.4, 0.05, 0, -0.26, 0.0);
      handRest = -0.9;
      break;
    }
  }
  detailWeapons(kind, hand, lArm, rArm, tcl);

  const headH = (hipY + 1.45 + 0.28 * L.head + headExtra) * L.scale;
  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak, headH, heavy: kind === "giant" || kind === "troll",
    scale: L.scale, tilt: L.tilt, kind, handMode, handRest, parts: [], fx: {}, tip: new THREE.Vector3(),
    lShin: shins[0], rShin: shins[1],
  };
}

function detailTorso(kind: HumanKind, t: THREE.Group, cw: number, tc: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, C0 = GEO.cyl, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin" || kind === "king") {
    const m = kind === "king" ? gold() : kind === "paladin" ? steel(0xe2e6ee) : steel(STEEL_LIGHT);
    P(t, C0, m, 0.21, 0.14, 0.21, 0, 0.85, 0.01);
    P(t, B0, gold(BRASS), 0.06, 0.42, cw * 0.69, 0, 0.56, 0);
    for (const s of [-1, 1]) {
      P(t, B0, m, 0.22, 0.24, 0.055, s * 0.21, -0.1, cw * 0.32, 0, 0, -s * 0.09);
      P(t, R0, gold(BRASS), 0.22, 0.22, 0.22, s * (cw / 2 + 0.11), 0.71, 0, PI / 2, 0, 0);
    }
  }
  if (kind === "swordsman" || kind === "archer" || kind === "crossbow") P(t, C0, leather(LEATHER_DARK), 0.032, 0.34, 0.024, cw * 0.45, -0.05, 0.02, 0.55, 0, -0.18);
  if (kind === "paladin") { P(t, S0, B(0x8ff4ff), 0.068, 0.068, 0.045, 0, 0.6, cw * 0.37); P(t, R0, gold(), 0.26, 0.26, 0.26, 0, 1.02, -0.22); }
  if (kind === "king") {
    P(t, B0, cloth(0xf7f4eb), cw + 0.18, 0.2, cw * 0.76, 0, 0.8, -0.02);
    P(t, S0, B(0xff4a5a), 0.072, 0.072, 0.05, 0, 0.62, cw * 0.35);
    for (let i = -2; i <= 2; i++) P(t, B0, B(0x1c1816), 0.028, 0.045, 0.02, i * 0.18, 0.78, cw * 0.38);
  }
  if (kind === "pirate") {
    P(t, B0, cloth(0xdfd6c2), cw * 0.48, 0.72, cw * 0.65, 0, 0.46, 0.01);
    P(t, B0, cloth(0x9a202c), cw * 0.96, 0.16, cw * 0.67, 0, 0.12, 0);
    P(t, B0, leather(0x3a2618), 0.1, 0.88, cw * 0.68, 0, 0.46, 0, 0, 0, -0.48);
    for (const s of [-1, 1]) P(t, B0, gold(), 0.06, 0.68, cw * 0.67, s * 0.16, 0.46, 0.01);
  }
  if (kind === "zeus") {
    P(t, B0, gold(), cw + 0.06, 0.14, cw * 0.68, 0, 0.52, 0, 0, 0, -0.52);
    P(t, S0, B(0x9fe0ff), 0.085, 0.085, 0.05, 0, 0.1, cw * 0.35);
    P(t, S0, gold(), 0.28, 0.2, 0.28, cw / 2 + 0.12, 0.78, 0);
  }
  if (kind === "orc" || kind === "berserker") for (const s of [-1, 1]) P(t, S0, M(0x6e8a48, 0.65), 0.19, 0.15, 0.1, s * 0.18, 0.63, cw * 0.3);
  if (kind === "troll") for (let i = 0; i < 3; i++) P(t, K0, M(0x3a542a), 0.05, 0.14, 0.05, 0, 0.36 + i * 0.15, -cw * 0.34, -PI / 2, 0, 0);
  if (kind === "giant") P(t, R0, steel(IRON), 0.14, 0.14, 0.14, 0, 0.06, cw * 0.36);
  if (kind === "assassin") for (let i = 0; i < 3; i++) P(t, K0, steel(STEEL_LIGHT), 0.022, 0.14, 0.015, -0.08 + i * 0.07, 0.56 - i * 0.06, cw * 0.34, 0, 0, -0.5);
  if (kind === "vampire") {
    P(t, B0, cloth(0x1a1220), 0.56, 0.34, 0.06, 0, 0.96, -0.14, -0.25, 0, 0);
    P(t, S0, B(0xff2a3c), 0.064, 0.084, 0.042, 0, 0.46, cw * 0.36);
  }
  if (kind === "monk") for (let i = 0; i < 8; i++) P(t, S0, M(i % 2 === 0 ? 0x5c3818 : GOLD, 0.5, 0.3), 0.05, 0.05, 0.05, Math.cos(i * PI / 4) * 0.23, 0.78, Math.sin(i * PI / 4) * 0.21);
  void tc;
}

function detailHead(kind: HumanKind, h: THREE.Group, tc: number, tcl: number, skin: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, C0 = GEO.cyl, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin") {
    P(h, B0, gold(BRASS), 0.055, 0.075, 0.22, 0, 0.28, -0.02);
    for (let i = 0; i < 3; i++) P(h, K0, cloth(i % 2 === 0 ? tc : tcl), 0.045, 0.18, 0.065, 0, 0.36 - i * 0.035, -0.18 - i * 0.07, -0.85 - i * 0.15, 0, 0);
  }
  if (kind === "paladin") for (const s of [-1, 1]) P(h, K0, gold(GOLD_LIGHT), 0.055, 0.28, 0.055, s * 0.31, 0.24, -0.08, -0.35, 0, -s * 0.55);
  if (kind === "orc" || kind === "berserker" || kind === "giant") P(h, B0, M(dark(skin, 0.62), 0.7), 0.016, 0.14, 0.02, -0.095, 0.01, 0.242, 0, 0, 0.18);
  if (kind === "bomber") for (const s of [-1, 1]) P(h, S0, B(0x7fe8ff), 0.068, 0.068, 0.03, s * 0.105, 0.04, 0.245);
  if (kind === "shaman") for (const s of [-1, 1]) P(h, K0, boneMat(0xd4cbb0), 0.075, 0.36, 0.075, s * 0.32, 0.18, 0.0, 0.2, 0, -s * 0.85);
  if (kind === "pirate") {
    P(h, C0, leather(0x241c28), 0.44, 0.06, 0.44, 0, 0.18, 0, -0.08, 0, 0);
    P(h, B0, gold(), 0.46, 0.025, 0.46, 0, 0.2, 0, -0.08, 0, 0);
    P(h, K0, B(0xf8f4e8), 0.05, 0.26, 0.08, -0.22, 0.3, -0.05, -0.35, 0, 0.45);
    P(h, R0, gold(), 0.042, 0.042, 0.042, 0.275, -0.06, 0.02);
  }
  if (kind === "king") {
    P(h, R0, cloth(0xf7f4eb), 0.31, 0.31, 0.22, 0, 0.08, 0, PI / 2, 0, 0);
    P(h, B0, gold(), 0.045, 0.1, 0.045, 0, 0.4, 0);
    P(h, B0, gold(), 0.09, 0.04, 0.045, 0, 0.41, 0);
  }
}

function detailWeapons(kind: HumanKind, hand: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, tcl: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "swordsman" || kind === "halberdier" || kind === "orc" || kind === "skeleton") {
    const r = kind === "swordsman" ? 0.22 : kind === "skeleton" ? 0.3 : 0.36;
    P(lArm, S0, steel(STEEL_LIGHT), r * 0.28, r * 0.28, 0.08, 0.11, -0.5, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (PI / 2);
      P(lArm, S0, gold(BRASS), 0.026, 0.026, 0.024, 0.11 + Math.cos(a) * r * 0.78, -0.5 + Math.sin(a) * r * 0.78, 0.21);
    }
  }
  if (kind === "guardian" || kind === "swordsman" || kind === "paladin" || kind === "king" || kind === "vampire") {
    P(hand, S0, gold(), 0.062, 0.062, 0.062, 0, 0, -0.14);
    P(hand, B0, steel(STEEL_DARK), 0.052, 0.032, 0.68, 0, 0, 0.52);
  }
  if (kind === "archer" || kind === "elf" || kind === "bonearcher") {
    P(hand, B0, B(tcl), 0.055, 0.014, 0.14, 0, 0, -0.44);
    P(hand, B0, B(tcl), 0.014, 0.055, 0.14, 0, 0, -0.44);
  }
  if (kind === "crossbow") { P(hand, R0, steel(IRON), 0.11, 0.11, 0.11, 0, 0.0, 0.72, PI / 2, 0, 0); P(hand, B0, B(tcl), 0.05, 0.014, 0.1, 0, 0.07, 0.18); }
  if (kind === "pirate") {
    P(hand, K0, gold(BRASS), 0.065, 0.14, 0.065, 0, 0, 1.0, -PI / 2, 0, 0);
    P(lArm, B0, gold(BRASS), 0.12, 0.14, 0.08, 0, -0.72, 0.16);
    P(lArm, B0, steel(STEEL_LIGHT), 0.035, 0.08, 0.58, 0, -0.62, 0.44, -0.35, 0, 0);
  }
  if (kind === "monk") for (const arm of [lArm, rArm]) P(arm, R0, gold(), 0.13, 0.13, 0.13, 0, -0.62, 0.01, PI / 2, 0, 0);
  if (kind === "frost") for (let i = 0; i < 4; i++) P(hand, K0, B(0xd8f4ff), 0.035, 0.22, 0.035, Math.cos(i * PI / 2) * 0.18, Math.sin(i * PI / 2) * 0.18, 1.3, PI / 2, 0, 0);
}

/* ============ machines: purpose-built, non-humanoid rigs ============ */

function buildRobot(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const shell = 0x9aa6b4, shellDark = 0x5e6a79, trim = 0x2f3a48;
  const glow = team === 0 ? 0x7fe8ff : 0xffb07f;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.26, 0.98, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.26, 0.98, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(shellDark, 0.5, 0.55), 0.3, 0.62, 0.34, 0, -0.3, 0);
    part(g, GEO.box, M(trim, 0.6, 0.4), 0.34, 0.16, 0.44, 0, -0.66, 0.04);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.24, 0.26, 0.26, 0, 0.08, 0);
    part(g, GEO.cyl, steel(STEEL_LIGHT), 0.14, 0.28, 0.14, 0, -0.36, 0.03, 0, 0, PI / 2);
    part(g, GEO.cyl, gold(COPPER), 0.045, 0.38, 0.045, 0, -0.44, -0.17);
    part(g, GEO.sph, B(glow), 0.07, 0.07, 0.07, 0, -0.36, 0.19);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 1.0, 0);
  body.add(torso);
  part(torso, GEO.box, M(shell, 0.42, 0.6), 0.92, 0.86, 0.6, 0, 0.42, 0);
  part(torso, GEO.box, M(trim, 0.5, 0.45), 0.96, 0.22, 0.64, 0, 0.62, 0);
  part(torso, GEO.box, M(tcd, 0.45, 0.4), 0.3, 0.5, 0.66, 0, 0.36, 0);
  part(torso, GEO.box, M(shellDark, 0.45, 0.55), 0.7, 0.2, 0.5, 0, 0.06, 0);
  part(torso, GEO.ring, steel(STEEL_LIGHT), 0.16, 0.16, 0.16, 0, 0.52, 0.33);
  part(torso, GEO.sph, B(glow), 0.12, 0.12, 0.06, 0, 0.52, 0.33);
  for (const y of [0.32, 0.38, 0.68]) part(torso, GEO.box, B(glow), 0.26, 0.022, 0.02, 0, y, 0.335);
  for (const s of [-1, 1]) {
    part(torso, GEO.cyl, steel(shellDark), 0.11, 0.22, 0.11, s * 0.18, 0.34, -0.42, 0.35, 0, 0);
    part(torso, GEO.sph, B(0xff8442), 0.075, 0.075, 0.05, s * 0.18, 0.26, -0.46);
  }
  part(torso, GEO.cyl, M(0x8f9aa8, 0.35, 0.7), 0.09, 0.5, 0.09, 0.22, 0.86, -0.1);
  part(torso, GEO.sph, B(team === 0 ? 0x9ff0ff : 0xffc89f), 0.1, 0.1, 0.1, 0.22, 1.14, -0.1);

  const head = new THREE.Group();
  head.position.set(0, 1.06, 0);
  torso.add(head);
  part(head, GEO.box, M(shell, 0.4, 0.6), 0.62, 0.44, 0.52);
  part(head, GEO.box, M(trim, 0.35, 0.5), 0.5, 0.12, 0.06, 0, 0.02, 0.28);
  part(head, GEO.sph, B(team === 0 ? 0x8ff4ff : 0xffb488), 0.09, 0.08, 0.06, 0.15, 0.04, 0.28);
  part(head, GEO.sph, B(team === 0 ? 0x8ff4ff : 0xffb488), 0.09, 0.08, 0.06, -0.15, 0.04, 0.28);
  part(head, GEO.cyl, M(0x8f9aa8, 0.35, 0.7), 0.03, 0.36, 0.03, 0.22, 0.36, 0);
  part(head, GEO.sph, B(0xff6a6a), 0.07, 0.07, 0.07, 0.22, 0.55, 0);

  const lArm = new THREE.Group(); lArm.position.set(0.6, 0.72, 0); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.6, 0.72, 0); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(shellDark, 0.45, 0.55), 0.28, 0.5, 0.3, 0, -0.22, 0);
    part(g, GEO.sph, steel(STEEL_LIGHT), 0.13, 0.13, 0.14, 0, -0.4, 0);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.24, 0.42, 0.26, 0, -0.58, 0.02);
    part(g, GEO.box, M(trim, 0.5, 0.5), 0.28, 0.14, 0.3, 0, -0.78, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(0x6b7480, 0.35, 0.75), 0.09, 0.16, 0.9, 0, 0, 0.5);
  part(hand, GEO.cone, steel(STEEL_LIGHT), 0.08, 0.24, 0.06, 0, 0, 1.04, PI / 2, 0, 0);
  part(hand, GEO.box, B(glow), 0.095, 0.04, 0.88, 0, -0.065, 0.5);
  part(hand, GEO.box, M(0x2f3a48, 0.5, 0.4), 0.12, 0.1, 0.3, 0, 0, 0.16);
  part(hand, GEO.box, B(0xff7a6a), 0.05, 0.05, 0.05, 0.07, 0, 0.2);

  const cloak = new THREE.Group();
  cloak.position.set(0, 0.8, -0.3);
  torso.add(cloak);
  part(cloak, GEO.box, M(tcd), 0.5, 0.5, 0.04, 0, -0.24, 0);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak,
    headH: 2.9, heavy: false, scale: 1, tilt: 0.02, kind: "robot",
    handMode: "follow", handRest: 0, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

function buildTank(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const hull = 0x6d7a58, hullDark = 0x4a5340, steelC = 0x59636f;
  const glow = team === 0 ? 0x8ff4ff : 0xffb488;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.62, 0.5, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.62, 0.5, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(0x2b2f36, 0.85, 0.2), 0.34, 0.62, 1.9, 0, -0.12, 0);
    part(g, GEO.box, M(hullDark, 0.65, 0.35), 0.38, 0.22, 2.04, 0, 0.08, 0);
    for (let i = 0; i < 6; i++) {
      const wz = -0.75 + i * 0.3;
      part(g, GEO.cyl, M(0x3d434c, 0.6, 0.5), 0.22, 0.36, 0.22, 0, -0.22, wz, 0, 0, PI / 2);
      part(g, GEO.cyl, steel(STEEL_LIGHT), 0.09, 0.38, 0.09, 0, -0.22, wz, 0, 0, PI / 2);
    }
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.72, 0);
  body.add(torso);
  // low, long hull with a small turret: reads as a tank, not a barrel
  part(torso, GEO.box, M(hull, 0.7, 0.3), 1.42, 0.5, 2.5, 0, 0.16, 0);
  part(torso, GEO.box, M(hullDark, 0.7, 0.3), 1.46, 0.16, 2.1, 0, 0.38, -0.05);
  part(torso, GEO.box, M(hullDark, 0.7, 0.3), 1.2, 0.22, 0.6, 0, 0.16, 1.42); // glacis
  for (const s of [-1, 1]) {
    part(torso, GEO.sph, B(glow), 0.065, 0.065, 0.04, s * 0.46, 0.34, 1.54);
    part(torso, GEO.cyl, steel(0x3a404a), 0.08, 0.42, 0.08, s * 0.42, 0.34, -1.26, 0, 0, PI / 2);
    part(torso, GEO.sph, B(0xff7a38), 0.055, 0.055, 0.04, s * 0.58, 0.34, -1.28);
  }
  part(torso, GEO.box, M(tcd, 0.6, 0.3), 0.5, 0.08, 1.4, 0, 0.42, -0.15);
  part(torso, GEO.box, M(steelC, 0.45, 0.6), 0.78, 0.34, 1.0, 0, 0.6, -0.15); // turret
  part(torso, GEO.box, steel(STEEL_DARK), 0.42, 0.28, 0.32, 0, 0.64, 0.46);
  part(torso, GEO.cyl, M(hullDark, 0.5, 0.4), 0.3, 0.16, 0.3, 0, 0.8, -0.15);
  part(torso, GEO.cyl, M(steelC, 0.4, 0.7), 0.075, 2.0, 0.075, 0, 0.66, 1.2, PI / 2, 0, 0); // barrel
  part(torso, GEO.cyl, steel(STEEL_LIGHT), 0.115, 0.34, 0.115, 0, 0.66, 1.42, PI / 2, 0, 0);
  part(torso, GEO.cyl, M(steelC, 0.4, 0.7), 0.1, 0.22, 0.1, 0, 0.66, 2.05, PI / 2, 0, 0);
  part(torso, GEO.sph, B(glow), 0.06, 0.06, 0.06, 0.26, 0.78, 0.36);
  part(torso, GEO.box, M(0x2b2f36, 0.6, 0.3), 0.22, 0.24, 0.08, 0.4, 0.72, -0.15);

  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
  torso.add(head);
  part(head, GEO.box, M(steelC, 0.4, 0.65), 0.5, 0.28, 0.44, 0, 0.5, 0.06);
  part(head, GEO.box, B(0x1a2028), 0.36, 0.12, 0.04, 0, 0.52, 0.3);
  part(head, GEO.sph, B(glow), 0.06, 0.06, 0.05, 0.12, 0.52, 0.32);
  part(head, GEO.sph, B(glow), 0.06, 0.06, 0.05, -0.12, 0.52, 0.32);

  const lArm = new THREE.Group(); lArm.position.set(0.78, 0.5, 0.1); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.78, 0.5, 0.1); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(hullDark, 0.5, 0.5), 0.22, 0.34, 0.3, 0, -0.14, 0);
    part(g, GEO.box, M(steelC, 0.45, 0.6), 0.18, 0.3, 0.22, 0, -0.42, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(steelC, 0.35, 0.8), 0.16, 0.16, 0.5, 0, 0, 0.3);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.6, heavy: true, scale: 1, tilt: 0.02, kind: "tank",
    handMode: "fixed", handRest: -0.2, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

function buildCatapult(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const wood = 0x7a5632, woodDark = 0x4f3620, rope = 0xc9b27a;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  // two wheel trucks stand in for legs so the whole frame rocks as it rolls
  const lLeg = new THREE.Group(); lLeg.position.set(0.86, 0.46, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.86, 0.46, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    for (const wz of [-0.85, 0.85]) {
      part(g, GEO.cyl, M(woodDark, 0.85), 0.46, 0.14, 0.46, 0, 0, wz, 0, 0, PI / 2);
      part(g, GEO.cyl, steel(IRON), 0.48, 0.05, 0.48, 0, 0, wz, 0, 0, PI / 2);
      part(g, GEO.cyl, steel(STEEL_DARK), 0.1, 0.2, 0.1, 0, 0, wz, 0, 0, PI / 2);
      for (let i = 0; i < 4; i++) part(g, GEO.box, M(wood, 0.85), 0.05, 0.84, 0.07, 0.03, 0, wz, (i * PI) / 4, 0, 0);
    }
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.56, 0);
  body.add(torso);
  // bed: two long rails and cross beams
  for (const s of [-1, 1]) part(torso, GEO.box, M(wood, 0.85), 0.2, 0.22, 2.7, s * 0.6, 0, 0);
  for (const z of [-1.15, 0, 1.15]) part(torso, GEO.box, M(woodDark, 0.85), 1.5, 0.18, 0.2, 0, 0.02, z);
  // A-frame uprights and the padded crossbar the arm slams into
  for (const s of [-1, 1]) {
    part(torso, GEO.box, M(wood, 0.85), 0.16, 1.5, 0.16, s * 0.6, 0.7, 0.42, 0.28, 0, 0);
    part(torso, GEO.box, M(wood, 0.85), 0.14, 1.3, 0.14, s * 0.6, 0.56, 0.98, -0.5, 0, 0);
    part(torso, GEO.box, M(tc), 0.04, 0.5, 0.36, s * 0.7, 0.9, 0.5);
  }
  part(torso, GEO.box, M(woodDark, 0.85), 1.4, 0.2, 0.2, 0, 1.4, 0.62);
  part(torso, GEO.box, M(0xb89a6a, 0.95), 1.0, 0.24, 0.1, 0, 1.4, 0.5);
  // twisted rope bundle and winch
  part(torso, GEO.cyl, M(rope, 0.95), 0.2, 1.3, 0.2, 0, 0.2, -0.2, 0, 0, PI / 2);
  part(torso, GEO.cyl, M(woodDark, 0.85), 0.12, 1.56, 0.12, 0, 0.14, -1.1, 0, 0, PI / 2);
  for (const s of [-1, 1]) part(torso, GEO.box, steel(IRON), 0.04, 0.5, 0.06, s * 0.82, 0.14, -1.1, 0.7, 0, 0);
  part(torso, GEO.box, M(tcd), 1.0, 0.04, 0.5, 0, 0.14, 0.9);
  // spare boulders riding on the bed
  part(torso, GEO.sph, M(0x8a8a86, 0.95), 0.2, 0.18, 0.2, 0.3, 0.26, -0.72);
  part(torso, GEO.sph, M(0x77777a, 0.95), 0.17, 0.16, 0.18, -0.24, 0.24, -0.66);

  const head = new THREE.Group();
  head.position.set(0, 1.4, 0.62);
  torso.add(head);
  // a skull daubed on the pennant: the crew's idea of a warning
  for (const sx of [-1, 1]) part(head, GEO.sph, B(0x14100c), 0.07, 0.08, 0.02, sx * 0.1, 0.48, 0.2);
  part(head, GEO.box, B(0x14100c), 0.16, 0.05, 0.02, 0, 0.33, 0.2);
  part(head, GEO.sph, B(0xf2ead4), 0.2, 0.2, 0.015, 0, 0.44, 0.19);
  part(head, GEO.box, M(tc), 0.5, 0.5, 0.04, 0, 0.42, 0.16);
  part(head, GEO.cyl, M(woodDark, 0.85), 0.03, 0.8, 0.03, 0, 0.3, 0.14);

  const lArm = new THREE.Group(); lArm.position.set(0.6, 0.2, -0.2); torso.add(lArm);
  // the throwing arm pivots at the rope bundle and lies back, loaded
  const rArm = new THREE.Group(); rArm.position.set(0, 0.2, -0.2); torso.add(rArm);
  const hand = new THREE.Group();
  rArm.add(hand);
  part(hand, GEO.box, M(wood, 0.85), 0.16, 0.16, 2.1, 0, 0, -1.0);
  part(hand, GEO.box, steel(IRON), 0.2, 0.2, 0.12, 0, 0, -0.2);
  part(hand, GEO.dome, M(woodDark, 0.85), 0.34, 0.2, 0.34, 0, 0.02, -2.08, PI, 0, 0);
  part(hand, GEO.ring, steel(IRON), 0.34, 0.34, 0.2, 0, 0.04, -2.08, PI / 2, 0, 0);
  part(hand, GEO.sph, M(0x8d8d88, 0.95), 0.27, 0.25, 0.27, 0, 0.2, -2.08);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.7, heavy: true, scale: 1, tilt: 0, kind: "catapult",
    handMode: "fixed", handRest: -0.25, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

function buildRailgun(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const shell = 0x6f7d8c, trim = 0x28303a, accent = team === 0 ? 0x7fe8ff : 0xffb07f;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.24, 0.92, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.24, 0.92, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(trim, 0.5, 0.5), 0.22, 0.66, 0.26, 0, -0.32, 0);
    part(g, GEO.sph, steel(STEEL_LIGHT), 0.12, 0.12, 0.13, 0, -0.34, 0.02);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.26, 0.2, 0.36, 0, -0.68, 0.06);
    part(g, GEO.box, B(accent), 0.16, 0.03, 0.04, 0, -0.34, 0.14);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.94, 0);
  body.add(torso);
  part(torso, GEO.box, M(shell, 0.42, 0.6), 0.7, 0.72, 0.5, 0, 0.38, 0);
  part(torso, GEO.box, M(trim, 0.5, 0.5), 0.74, 0.2, 0.54, 0, 0.6, 0);
  part(torso, GEO.box, M(tcd, 0.4, 0.4), 0.34, 0.34, 0.54, 0, 0.36, 0);
  part(torso, GEO.box, B(accent), 0.24, 0.05, 0.03, 0, 0.46, 0.28);
  part(torso, GEO.box, M(0x39424f, 0.5, 0.5), 0.5, 0.34, 0.24, 0.16, 0.42, -0.34); // battery pack
  part(torso, GEO.cyl, M(0x39424f, 0.4, 0.6), 0.09, 0.5, 0.09, -0.2, 0.5, -0.36);
  part(torso, GEO.cyl, B(accent), 0.08, 0.14, 0.08, -0.2, 0.56, -0.38);

  const head = new THREE.Group();
  head.position.set(0, 0.8, 0);
  torso.add(head);
  part(head, GEO.box, M(shell, 0.38, 0.62), 0.44, 0.34, 0.44);
  part(head, GEO.box, B(0x141a22), 0.34, 0.1, 0.04, 0, 0.02, 0.24);
  part(head, GEO.sph, B(accent), 0.07, 0.06, 0.05, 0.11, 0.03, 0.25);
  part(head, GEO.sph, B(accent), 0.07, 0.06, 0.05, -0.11, 0.03, 0.25);
  part(head, GEO.box, M(0x8f9aa8, 0.35, 0.7), 0.05, 0.34, 0.05, 0.18, 0.28, -0.1);
  part(head, GEO.sph, B(accent), 0.05, 0.05, 0.05, 0.18, 0.48, -0.1);

  const lArm = new THREE.Group(); lArm.position.set(0.46, 0.66, 0); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.46, 0.66, 0); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(trim, 0.45, 0.55), 0.2, 0.42, 0.22, 0, -0.2, 0);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.17, 0.36, 0.19, 0, -0.5, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(trim, 0.4, 0.7), 0.14, 0.14, 1.9, 0, 0, 0.9); // rail
  part(hand, GEO.box, M(0x8f9aa8, 0.3, 0.85), 0.06, 0.06, 1.7, 0.06, 0.04, 0.9);
  part(hand, GEO.box, M(0x8f9aa8, 0.3, 0.85), 0.06, 0.06, 1.7, -0.06, 0.04, 0.9);
  part(hand, GEO.box, B(accent), 0.045, 0.04, 1.68, 0, 0.02, 0.92);
  for (let i = 0; i < 5; i++) {
    part(hand, GEO.box, gold(COPPER), 0.2, 0.16, 0.055, 0, 0, 0.58 + i * 0.28);
    part(hand, GEO.box, B(accent), 0.21, 0.04, 0.035, 0, 0, 0.58 + i * 0.28);
  }
  part(hand, GEO.box, B(accent), 0.05, 0.05, 0.05, 0.07, 0.04, 1.8);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.7, heavy: false, scale: 1, tilt: 0.02, kind: "railgun",
    handMode: "fixed", handRest: -1.15, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

/* ============ cavalry ============ */

/** Rocket cart: a rack of fire arrows on two wheels, tilted at the sky. */
function buildHwacha(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const wood = 0x7a5632, woodDark = 0x4f3620;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.9, 0.62, -0.1); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.9, 0.62, -0.1); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.cyl, M(woodDark, 0.85), 0.62, 0.12, 0.62, 0, 0, 0, 0, 0, PI / 2);
    part(g, GEO.cyl, steel(IRON), 0.64, 0.045, 0.64, 0, 0, 0, 0, 0, PI / 2);
    part(g, GEO.cyl, steel(STEEL_DARK), 0.12, 0.2, 0.12, 0, 0, 0, 0, 0, PI / 2);
    for (let i = 0; i < 4; i++) part(g, GEO.box, M(wood, 0.85), 0.05, 1.16, 0.07, 0.03, 0, 0, (i * PI) / 4, 0, 0);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.66, 0);
  body.add(torso);
  part(torso, GEO.box, M(wood, 0.85), 1.5, 0.14, 2.0, 0, 0.04, -0.1);
  for (const sd of [-1, 1]) {
    part(torso, GEO.box, M(woodDark, 0.85), 0.14, 0.14, 3.0, sd * 0.62, -0.02, -0.4);
    part(torso, GEO.box, M(woodDark, 0.85), 0.12, 0.9, 0.12, sd * 0.6, 0.5, 0.5, 0.2, 0, 0);
    part(torso, GEO.box, M(tc), 0.04, 0.44, 0.5, sd * 0.69, 0.4, -0.1);
  }
  part(torso, GEO.box, M(woodDark, 0.85), 0.14, 0.7, 0.14, 0, -0.3, -1.7, 0.3, 0, 0);
  part(torso, GEO.box, M(0x3a2c1c, 0.9), 0.5, 0.3, 0.4, 0.36, 0.26, -0.8);
  for (let i = 0; i < 4; i++) part(torso, GEO.cyl, M(0xb69250), 0.02, 0.7, 0.02, 0.22 + i * 0.09, 0.5, -0.8, 0.2, 0, 0.1 * (i - 1.5));
  part(torso, GEO.cyl, M(0x4a3a2a, 0.9), 0.16, 0.34, 0.16, -0.4, 0.28, -0.8);
  part(torso, GEO.sph, B(0xffa040), 0.05, 0.05, 0.05, -0.4, 0.5, -0.8);

  // the launch box pivots at the axle: 5 x 4 tubes, every one loaded
  const rArm = new THREE.Group(); rArm.position.set(0, 0.72, 0.2); rArm.rotation.x = -0.5; torso.add(rArm);
  const hand = new THREE.Group();
  rArm.add(hand);
  part(hand, GEO.box, M(wood, 0.85), 1.34, 1.0, 0.9, 0, 0.3, 0);
  part(hand, GEO.box, M(woodDark, 0.85), 1.4, 0.1, 0.96, 0, 0.84, 0);
  part(hand, GEO.box, M(woodDark, 0.85), 1.4, 0.1, 0.96, 0, -0.24, 0);
  part(hand, GEO.box, M(tcd), 1.36, 0.16, 0.92, 0, 0.3, 0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = (c - 2) * 0.25, y = -0.06 + r * 0.24;
    part(hand, GEO.cyl, B(0x15110c), 0.085, 0.02, 0.085, x, y, 0.455, PI / 2, 0, 0);
    part(hand, GEO.cone, steel(STEEL_LIGHT), 0.035, 0.16, 0.035, x, y, 0.52, PI / 2, 0, 0);
    part(hand, GEO.cyl, M(0xc8323a, 0.8), 0.03, 0.12, 0.03, x, y, 0.4, PI / 2, 0, 0);
  }
  const lArm = new THREE.Group(); lArm.position.set(0.6, 0.2, -0.2); torso.add(lArm);

  const head = new THREE.Group();
  head.position.set(0, 1.0, -1.0);
  torso.add(head);
  part(head, GEO.cyl, M(woodDark, 0.85), 0.03, 1.5, 0.03, 0, 0.4, 0);
  part(head, GEO.box, M(tc), 0.04, 0.5, 0.7, 0, 0.88, -0.36);
  part(head, GEO.box, B(0xffd84a), 0.045, 0.14, 0.14, 0, 0.88, -0.36, PI / 4, 0, 0);
  // a tiger mask painted on a board at the foot of the mast: the crew's warning to whoever is downrange
  part(head, GEO.box, M(tcd), 0.6, 0.44, 0.04, 0, 0.1, 0.17);
  for (const sd of [-1, 1]) {
    part(head, GEO.sph, B(0xffd84a), 0.075, 0.06, 0.02, sd * 0.14, 0.16, 0.2);
    part(head, GEO.box, B(0x14100c), 0.02, 0.07, 0.02, sd * 0.14, 0.16, 0.215);
  }
  part(head, GEO.box, B(0xf2ead4), 0.3, 0.05, 0.02, 0, 0.0, 0.2);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.9, heavy: true, scale: 1, tilt: 0, kind: "hwacha",
    handMode: "fixed", handRest: 0, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

/** War mammoth: shaggy bulk, a war blanket in the team colour, curved tusks and a trunk that does the hitting. */
function buildMammoth(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const fur = team === 0 ? 0x7a5a3c : 0x5e4634, furDark = dark(fur, 0.72), furLight = light(fur, 0.16);
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  // barrel, shoulder hump, rump
  part(body, GEO.sph, M(fur, 0.95), 1.25, 1.2, 1.9, 0, 2.6, -0.1);
  part(body, GEO.sph, M(furDark, 0.95), 1.05, 0.9, 1.0, 0, 3.35, 0.7);
  part(body, GEO.sph, M(fur, 0.95), 1.1, 1.0, 1.0, 0, 2.5, -1.3);
  for (let i = 0; i < 9; i++) part(body, GEO.cone, M(i % 2 ? furDark : furLight, 0.95), 0.22, 0.8, 0.2, Math.sin(i * 2.4) * 1.0, 1.75 + (i % 3) * 0.12, -1.5 + i * 0.36, PI, 0, Math.sin(i * 2.4) * 0.25);
  part(body, GEO.cyl, M(furDark, 0.95), 0.07, 1.0, 0.07, 0, 2.3, -2.2, 0.5, 0, 0);
  part(body, GEO.sph, M(furDark, 0.95), 0.13, 0.2, 0.13, 0, 1.85, -2.45);
  // war blanket and girth
  part(body, GEO.box, M(tc, 0.85), 2.56, 0.9, 1.5, 0, 2.86, -0.2);
  part(body, GEO.box, M(tcd, 0.85), 2.6, 0.12, 1.54, 0, 2.42, -0.2);
  part(body, GEO.box, gold(), 2.62, 0.06, 1.56, 0, 2.5, -0.2);
  for (const sd of [-1, 1]) {
    part(body, GEO.cyl, gold(), 0.26, 0.05, 0.26, sd * 1.3, 2.9, -0.2, 0, 0, PI / 2);
    part(body, GEO.cyl, B(tcd), 0.16, 0.06, 0.16, sd * 1.3, 2.9, -0.2, 0, 0, PI / 2);
    for (let i = 0; i < 4; i++) part(body, GEO.cone, cloth(i % 2 ? 0xf4f1e6 : tc), 0.12, 0.34, 0.03, sd * 1.3, 2.2, -0.74 + i * 0.36, PI, 0, 0);
  }
  part(body, GEO.box, leather(LEATHER_DARK), 0.2, 2.5, 0.2, 0, 2.5, 0.62, 0, 0, PI / 2);

  const mkLeg = (x: number, z: number) => {
    const p = new THREE.Group();
    p.position.set(x, 1.9, z);
    body.add(p);
    part(p, GEO.cyl, M(fur, 0.95), 0.42, 1.1, 0.42, 0, -0.5, 0);
    part(p, GEO.cyl, M(furDark, 0.95), 0.36, 0.8, 0.36, 0, -1.3, 0);
    part(p, GEO.cyl, M(0x3a3028, 0.9), 0.4, 0.22, 0.4, 0, -1.78, 0.02);
    for (let i = 0; i < 3; i++) part(p, GEO.sph, boneMat(BONE_DARK), 0.09, 0.08, 0.08, (i - 1) * 0.2, -1.82, 0.36);
    part(p, GEO.cone, M(furLight, 0.95), 0.46, 0.5, 0.46, 0, -0.95, 0, PI, 0, 0);
    return p;
  };
  const flLeg = mkLeg(0.75, 0.95), frLeg = mkLeg(-0.75, 0.95), blLeg = mkLeg(0.75, -1.3), brLeg = mkLeg(-0.75, -1.3);

  // the whole head rides on the torso bone, so an attack swings head, tusks and trunk together
  const torso = new THREE.Group();
  torso.position.set(0, 3.0, 1.45);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.5);
  torso.add(head);
  part(head, GEO.sph, M(fur, 0.95), 0.86, 0.95, 0.8, 0, 0.1, 0);
  part(head, GEO.sph, M(furDark, 0.95), 0.6, 0.5, 0.5, 0, 0.86, -0.1);
  part(head, GEO.box, M(fur, 0.95), 0.7, 0.6, 0.5, 0, -0.5, 0.42);
  for (const sd of [-1, 1]) {
    part(head, GEO.cyl, M(furLight, 0.9), 0.62, 0.07, 0.62, sd * 0.86, 0.1, -0.2, 0.2, sd * 0.5, PI / 2);
    part(head, GEO.cyl, M(0xc99a8a, 0.9), 0.44, 0.075, 0.44, sd * 0.88, 0.06, -0.18, 0.2, sd * 0.5, PI / 2);
    part(head, GEO.sph, B(0x14100c), 0.07, 0.08, 0.05, sd * 0.58, 0.22, 0.6);
    part(head, GEO.sph, B(0xffffff), 0.022, 0.022, 0.02, sd * 0.6, 0.26, 0.64);
    part(head, GEO.box, M(furDark, 0.95), 0.26, 0.07, 0.1, sd * 0.56, 0.36, 0.62, 0, 0, sd * 0.35);
    // tusk: three bone segments sweeping down, out and back up
    part(head, GEO.cyl, boneMat(), 0.14, 0.9, 0.14, sd * 0.42, -0.9, 0.62, 0.5, 0, sd * 0.12);
    part(head, GEO.cyl, boneMat(), 0.12, 0.9, 0.12, sd * 0.52, -1.42, 1.2, 1.25, 0, sd * 0.1);
    part(head, GEO.cone, boneMat(0xf4eeda), 0.11, 0.9, 0.11, sd * 0.56, -1.36, 1.98, 2.1, 0, 0);
    part(head, GEO.cyl, gold(), 0.15, 0.1, 0.15, sd * 0.47, -1.16, 0.86, 0.9, 0, sd * 0.1);
  }
  // bronze frontlet with a spike, tassels in the team colour
  part(head, GEO.box, gold(0xb8873a), 0.6, 0.7, 0.08, 0, 0.3, 0.78, -0.2, 0, 0);
  part(head, GEO.cone, gold(), 0.1, 0.36, 0.1, 0, 0.42, 0.98, PI / 2 - 0.2, 0, 0);
  part(head, GEO.box, M(tc), 0.62, 0.08, 0.09, 0, 0.62, 0.72, -0.2, 0, 0);

  // trunk: the "arm" that the attack animation raises and slams down
  const rArm = new THREE.Group(); rArm.position.set(0, -0.56, 0.62); head.add(rArm);
  part(rArm, GEO.cyl, M(fur, 0.95), 0.25, 0.7, 0.25, 0, -0.3, 0.02);
  part(rArm, GEO.cyl, M(furDark, 0.95), 0.2, 0.7, 0.2, 0, -0.9, 0.06, 0.1, 0, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -1.25, 0.1);
  rArm.add(hand);
  part(hand, GEO.cyl, M(fur, 0.95), 0.15, 0.6, 0.15, 0, -0.2, 0.08, 0.3, 0, 0);
  part(hand, GEO.cyl, M(0xc99a8a, 0.9), 0.11, 0.3, 0.11, 0, -0.52, 0.24, 0.9, 0, 0);
  const lArm = new THREE.Group(); lArm.position.set(0, -0.5, 0.5); head.add(lArm);

  return {
    root, body, torso, head, hand, lLeg: flLeg, rLeg: frLeg, lArm, rArm, cloak: null,
    flLeg, frLeg, blLeg, brLeg, headH: 4.9, heavy: true, scale: 1, tilt: 0, kind: "mammoth",
    handMode: "follow", handRest: 0, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

/** A summoned snake: a banded body on the ground, head reared to strike. */
function buildSnake(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team];
  const scale = 0x4f8a3a, scaleDark = 0x2f5a26, belly = 0xd8d08a;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);
  // the coils double as the two "legs" so the body ripples as it moves
  const lLeg = new THREE.Group(); lLeg.position.set(0, 0.12, -0.25); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(0, 0.12, -0.75); body.add(rLeg);
  for (let i = 0; i < 4; i++) part(lLeg, GEO.sph, M(i % 2 ? scaleDark : scale, 0.6), 0.13, 0.11, 0.2, Math.sin(i * 1.7) * 0.14, 0, 0.3 - i * 0.2);
  for (let i = 0; i < 5; i++) part(rLeg, GEO.sph, M(i % 2 ? scale : scaleDark, 0.6), 0.11 - i * 0.012, 0.09 - i * 0.01, 0.19, Math.sin(i * 1.7 + 2) * 0.16, -0.01, 0.2 - i * 0.2);
  part(rLeg, GEO.cone, M(tc), 0.05, 0.22, 0.05, 0.02, 0, -0.82, -PI / 2, 0, 0);

  const torso = new THREE.Group();
  torso.position.set(0, 0.14, 0.12);
  body.add(torso);
  part(torso, GEO.cyl, M(scale, 0.6), 0.1, 0.36, 0.1, 0, 0.14, 0.04, 0.5, 0, 0);
  part(torso, GEO.cyl, M(belly, 0.7), 0.075, 0.34, 0.04, 0, 0.14, 0.1, 0.5, 0, 0);
  // flared hood
  part(torso, GEO.sph, M(scaleDark, 0.6), 0.2, 0.2, 0.05, 0, 0.3, 0.1, 0.3, 0, 0);
  part(torso, GEO.sph, M(tc), 0.07, 0.09, 0.02, 0, 0.32, 0.07, 0.3, 0, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.2);
  torso.add(head);
  part(head, GEO.sph, M(scale, 0.6), 0.1, 0.075, 0.15, 0, 0, 0.04);
  for (const sd of [-1, 1]) {
    part(head, GEO.sph, B(0xffd84a), 0.026, 0.026, 0.026, sd * 0.065, 0.035, 0.1);
    part(head, GEO.box, B(0x14100c), 0.008, 0.03, 0.01, sd * 0.07, 0.035, 0.125);
    part(head, GEO.cone, B(0xf4f1e6), 0.012, 0.05, 0.012, sd * 0.04, -0.05, 0.14, PI, 0, 0);
  }
  part(head, GEO.box, B(0xd03a3a), 0.014, 0.01, 0.14, 0, -0.02, 0.24);
  const rArm = new THREE.Group(); torso.add(rArm);
  const lArm = new THREE.Group(); torso.add(lArm);
  const hand = new THREE.Group(); hand.position.set(0, 0.36, 0.3); rArm.add(hand);
  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 0.9, heavy: false, scale: 1, tilt: 0, kind: "snake",
    handMode: "follow", handRest: 0, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

function buildKnight(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const horseC = team === 0 ? 0x8a6038 : 0x5a4a3c;
  const skin = 0xe6b88e;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  part(body, GEO.box, M(horseC, 0.72), 0.95, 0.82, 1.85, 0, 1.34, 0);
  part(body, GEO.box, M(dark(horseC, 0.88), 0.72), 0.78, 0.55, 0.9, 0, 1.12, -0.55);
  part(body, GEO.box, M(horseC, 0.72), 0.44, 0.8, 0.46, 0, 1.84, 0.84, 0.62, 0, 0);
  part(body, GEO.box, M(horseC, 0.72), 0.34, 0.38, 0.78, 0, 2.18, 1.22);
  part(body, GEO.box, M(0xd8b8a0, 0.8), 0.27, 0.25, 0.3, 0, 2.1, 1.62);
  for (const s of [-1, 1]) {
    part(body, GEO.cone, M(dark(horseC, 0.8), 0.8), 0.07, 0.2, 0.07, s * 0.16, 2.42, 1.02, -0.15, 0, 0);
    part(body, GEO.sph, B(0xf7f3e6), 0.06, 0.07, 0.04, s * 0.18, 2.26, 1.08);
    part(body, GEO.sph, B(0x1a120d), 0.035, 0.045, 0.03, s * 0.196, 2.26, 1.1);
    part(body, GEO.sph, B(0xffffff), 0.012, 0.012, 0.01, s * 0.2, 2.28, 1.115);
    part(body, GEO.sph, B(0x2a1a14), 0.03, 0.03, 0.02, s * 0.07, 2.08, 1.77);
    part(body, GEO.box, leather(LEATHER_DARK), 0.025, 0.035, 1.15, s * 0.17, 1.98, 0.96, 0.18, 0, 0);
  }
  part(body, GEO.box, M(0x2e2318), 0.1, 0.5, 1.15, 0, 2.04, 0.55);
  part(body, GEO.box, M(0x2e2318), 0.1, 0.66, 0.14, 0, 1.16, -1.02, 0.4, 0, 0);
  part(body, GEO.box, steel(0x7d8694), 1.0, 0.5, 0.9, 0, 1.36, 0.42);
  part(body, GEO.box, gold(), 1.04, 0.06, 0.92, 0, 1.14, 0.42);
  part(body, GEO.box, M(tcd, 0.8), 1.06, 0.42, 0.9, 0, 1.24, -0.3);
  part(body, GEO.box, M(tc), 1.08, 0.08, 0.92, 0, 1.06, -0.3);
  part(body, GEO.sph, steel(0x7d8694), 0.2, 0.3, 0.22, 0, 2.28, 1.3);
  part(body, GEO.cone, gold(), 0.045, 0.16, 0.045, 0, 2.34, 1.5, PI / 2, 0, 0);
  part(body, GEO.box, M(0x553f26), 0.6, 0.16, 0.5, 0, 1.82, 0);
  const mkHLeg = (x: number, z: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.95, z);
    body.add(p);
    part(p, GEO.cyl, M(dark(horseC, 0.82), 0.8), 0.13, 0.85, 0.13, 0, -0.42, 0);
    part(p, GEO.sph, M(dark(horseC, 0.76), 0.78), 0.13, 0.11, 0.13, 0, -0.44, 0.01);
    part(p, GEO.box, M(0x1c1710), 0.2, 0.12, 0.22, 0, -0.85, 0.03);
    part(p, GEO.box, M(0xe8e0d0), 0.15, 0.1, 0.15, 0, -0.7, 0);
    return p;
  };
  const flLeg = mkHLeg(0.3, 0.66), frLeg = mkHLeg(-0.3, 0.66), blLeg = mkHLeg(0.3, -0.6), brLeg = mkHLeg(-0.3, -0.6);

  for (const s of [-1, 1]) {
    part(body, GEO.box, M(0x2f3540), 0.16, 0.52, 0.24, s * 0.38, 1.62, 0.12, 0.5, 0, 0);
    part(body, GEO.box, steel(0x8b93a1), 0.2, 0.34, 0.22, s * 0.42, 1.34, 0.3);
    part(body, GEO.ring, steel(STEEL_LIGHT), 0.075, 0.075, 0.08, s * 0.45, 1.18, 0.32, 0, PI / 2, 0);
  }
  const torso = new THREE.Group();
  torso.position.set(0, 1.9, -0.05);
  body.add(torso);
  part(torso, GEO.box, M(tc), 0.64, 0.66, 0.38, 0, 0.42, 0);
  part(torso, GEO.box, M(0xd9d2c0, 0.5, 0.3), 0.68, 0.14, 0.42, 0, 0.18, 0);
  part(torso, GEO.box, steel(0x8b93a1), 0.68, 0.5, 0.44, 0, 0.62, 0);
  part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.5, 0.05, 0.46, 0, 0.78, 0);
  for (const s of [-1, 1]) part(torso, GEO.sph, steel(STEEL_LIGHT), 0.24, 0.18, 0.24, s * 0.42, 0.76, 0);
  const cloak = new THREE.Group();
  cloak.position.set(0, 0.84, -0.24);
  torso.add(cloak);
  part(cloak, GEO.box, M(tcd), 0.56, 1.0, 0.05, 0, -0.5, 0);
  part(cloak, GEO.box, gold(), 0.58, 0.06, 0.055, 0, -0.96, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  head.scale.setScalar(1.22);
  torso.add(head);
  part(head, GEO.sph, M(skin, 0.6), 0.26, 0.28, 0.26);
  for (const s of [-1, 1]) part(head, GEO.sph, M(skin, 0.6), 0.05, 0.07, 0.04, s * 0.255, -0.01, 0);
  part(head, GEO.dome, steel(0x9aa3b2), 0.3, 0.27, 0.3, 0, 0.07, -0.005);
  part(head, GEO.ring, steel(GOLD), 0.3, 0.3, 0.3, 0, 0.07, 0, PI / 2, 0, 0);
  part(head, GEO.box, steel(0x9aa3b2), 0.05, 0.22, 0.04, 0, -0.01, 0.275);
  for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.18, 0.18, s * 0.265, -0.04, 0);
  part(head, GEO.box, M(tc), 0.08, 0.3, 0.45, 0, 0.32, -0.08, -0.5, 0, 0);
  addFace(head, skin, { brow: 0.16, mouth: "grin" });

  const mkArm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * 0.43, 0.8, 0.06);
    torso.add(a);
    part(a, GEO.box, steel(0x8b93a1), 0.19, 0.46, 0.21, 0, -0.2, 0);
    part(a, GEO.box, steel(0x8b93a1), 0.17, 0.36, 0.19, 0, -0.5, 0);
    part(a, GEO.sph, steel(0x8b93a1), 0.14, 0.14, 0.16, 0, 0.02, 0);
    part(a, GEO.sph, M(skin), 0.1, 0.1, 0.1, 0, -0.72, 0);
    return a;
  };
  const lArm = mkArm(1), rArm = mkArm(-1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);
  part(hand, GEO.cyl, M(0x8a6a3a), 0.045, 3.6, 0.045, 0, 0, 1.2, PI / 2, 0, 0);
  part(hand, GEO.cone, steel(STEEL_LIGHT), 0.15, 0.3, 0.15, 0, 0, 0.28, PI / 2, 0, 0);
  part(hand, GEO.cone, steel(0xc9d1dc), 0.09, 0.44, 0.09, 0, 0, 3.05, PI / 2, 0, 0);
  part(hand, GEO.quadCone, M(tc), 0.16, 0.42, 0.02, 0, 0.1, 2.5, 0, PI / 2, 0);
  part(lArm, GEO.quadCone, M(tc, 0.55, 0.4), 0.3, 0.46, 0.08, 0, -0.5, 0.14, PI, PI / 4, 0);
  part(lArm, GEO.ring, steel(GOLD), 0.2, 0.2, 0.3, 0, -0.5, 0.2);

  return {
    root, body, torso, head, hand, lLeg: flLeg, rLeg: frLeg, lArm, rArm, cloak,
    flLeg, frLeg, blLeg, brLeg, headH: 3.7, heavy: true, scale: 1, tilt: 0.06, kind: "knight",
    handMode: "fixed", handRest: -0.1, parts: [], fx: {}, tip: new THREE.Vector3(),
  };
}

/* ============ baking ============ */

const MAT_STD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
const MAT_METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.78 });
const MAT_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
// Cool rim light on every unit: separates silhouettes from the ground and from each other.
for (const [mat, gain] of [[MAT_STD, 0.5], [MAT_METAL, 0.3]] as const) {
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rimLight = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.2);
      outgoingLight += (diffuseColor.rgb * 0.6 + vec3(0.2, 0.26, 0.36)) * rimLight * ${gain.toFixed(2)};
      #include <opaque_fragment>`,
    );
  };
}

/** Gives every unit a shared reflection probe. Metal mirrors it; cloth and skin only pick up a soft fill. */
export function getRigEnvironment() { return MAT_METAL.envMap; }
export function setRigEnvironment(env: THREE.Texture | null) {
  MAT_STD.envMap = env; MAT_STD.envMapIntensity = 0.3;
  MAT_METAL.envMap = env; MAT_METAL.envMapIntensity = 0.5;
  MAT_STD.needsUpdate = MAT_METAL.needsUpdate = true;
}
const CLASS_MAT: THREE.Material[] = [MAT_STD, MAT_METAL, MAT_BASIC];

function classOf(m: THREE.Material): 0 | 1 | 2 {
  if (m instanceof THREE.MeshBasicMaterial) return 2;
  return (m as THREE.MeshStandardMaterial).metalness >= 0.3 ? 1 : 0;
}

interface Baked { template: UnitRig; specs: RigPart[] }
const bakedCache = new Map<string, Baked>();

function bake(template: UnitRig): Baked {
  const specs: RigPart[] = [];
  const groups: THREE.Group[] = [];
  template.root.traverse(o => { if (o instanceof THREE.Group) groups.push(o); });
  for (const g of groups) {
    const buckets: THREE.BufferGeometry[][] = [[], [], []];
    for (const c of g.children) {
      if (!(c instanceof THREE.Mesh)) continue;
      c.updateMatrix();
      const geo = (c.geometry as THREE.BufferGeometry).clone().applyMatrix4(c.matrix);
      const mat = c.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      const cls = classOf(mat);
      const pos = geo.attributes.position, norm = geo.attributes.normal;
      const n = pos.count;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const spanY = Math.max(0.05, maxY - minY);
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        let shade = 1;
        if (cls !== 2) {
          const nx = norm ? norm.getX(i) : 0, ny = norm ? norm.getY(i) : 0, nz = norm ? norm.getZ(i) : 0;
          const h = (pos.getY(i) - minY) / spanY - 0.5;
          const key = ny * 0.11 + nz * 0.055 + Math.abs(nx) * 0.025;
          shade = cls === 1 ? 1 + key * 1.15 + h * 0.12 : 1 + key * 0.82 + h * 0.14;
          shade = Math.max(0.7, Math.min(1.2, shade));
        }
        colors[i * 3] = Math.min(1, mat.color.r * shade);
        colors[i * 3 + 1] = Math.min(1, mat.color.g * shade);
        colors[i * 3 + 2] = Math.min(1, mat.color.b * shade);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      buckets[cls].push(geo);
    }
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const merged = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        specs.push({ group: g, geometry: merged, material: CLASS_MAT[i] });
      }
    });
  }
  // Weapon tip: the vertex of the hand's geometry that reaches farthest from the grip.
  let far = 0;
  const v = new THREE.Vector3();
  for (const spec of specs) {
    if (spec.group !== template.hand) continue;
    const pos = spec.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.lengthSq();
      if (d > far) { far = d; template.tip.copy(v); }
    }
  }
  return { template, specs };
}

function cloneTree(src: THREE.Object3D, map: Map<THREE.Object3D, THREE.Group>): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(src.position);
  g.quaternion.copy(src.quaternion);
  g.scale.copy(src.scale);
  g.rotation.order = src.rotation.order;
  map.set(src, g);
  for (const child of src.children) if (child instanceof THREE.Group) g.add(cloneTree(child, map));
  return g;
}

function instantiate(b: Baked): UnitRig {
  const t = b.template;
  const map = new Map<THREE.Object3D, THREE.Group>();
  const root = cloneTree(t.root, map);
  const pick = (g?: THREE.Group | null) => (g ? map.get(g) : undefined);
  return {
    root, body: pick(t.body)!, torso: pick(t.torso)!, head: pick(t.head)!, hand: pick(t.hand)!,
    lLeg: pick(t.lLeg)!, rLeg: pick(t.rLeg)!, lArm: pick(t.lArm)!, rArm: pick(t.rArm)!, cloak: pick(t.cloak) ?? null,
    flLeg: pick(t.flLeg), frLeg: pick(t.frLeg), blLeg: pick(t.blLeg), brLeg: pick(t.brLeg),
    lShin: pick(t.lShin), rShin: pick(t.rShin), tip: t.tip,
    headH: t.headH, heavy: t.heavy, scale: t.scale, tilt: t.tilt, kind: t.kind, handMode: t.handMode, handRest: t.handRest,
    parts: b.specs.map(s => ({ group: map.get(s.group)!, geometry: s.geometry, material: s.material })),
    fx: {},
  };
}

export function buildUnitRig(kind: UnitKind, team: TeamId): UnitRig {
  const key = `${kind}:${team}`;
  let baked = bakedCache.get(key);
  if (!baked) {
    const template =
      kind === "knight" ? buildKnight(team)
      : kind === "robot" ? buildRobot(team)
      : kind === "tank" ? buildTank(team)
      : kind === "railgun" ? buildRailgun(team)
      : kind === "catapult" ? buildCatapult(team)
      : kind === "hwacha" ? buildHwacha(team)
      : kind === "mammoth" ? buildMammoth(team)
      : kind === "snake" ? buildSnake(team)
      : buildHumanoid(kind, team);
    baked = bake(template);
    bakedCache.set(key, baked);
  }
  const rig = instantiate(baked);
  rig.torso.rotation.x = rig.tilt;
  return rig;
}
