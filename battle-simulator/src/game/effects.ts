import * as THREE from "three";

/* ============================================================
   Combat effects.
   Every effect is layered and directional so a hit reads as a
   hit, not as particles radiating evenly in all directions:
     - impact flash + shock shell + directional spark cone
     - sparks stretch along their velocity (the hit normal)
     - blood spray droplets, a red mist puff and a ground stain
     - armour chips bounce and tumble off the ground
     - explosions layer flash → fireball → shock ring → smoke
     - weapon trails follow the blade tip as a ribbon
     - lightning forks between the strike point and the target
   All pools are drawn with instanced meshes, so the frame cost is
   flat no matter how many effects are alive.
   ============================================================ */

const UP = new THREE.Vector3(0, 1, 0);
const HALF_PI = Math.PI / 2;
const TMP = new THREE.Vector3();
const MID = new THREE.Vector3();
const DIR = new THREE.Vector3();
const BOLT_A = new THREE.Vector3();
const BOLT_B = new THREE.Vector3();
const BOLT_DIRS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
] as const;
const QUAT = new THREE.Quaternion();
const BASIS = new THREE.Matrix4();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const TIP_A = new THREE.Vector3(), TIP_B = new THREE.Vector3();
const BASE_A = new THREE.Vector3(), BASE_B = new THREE.Vector3();
function catmull(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}
const COL = new THREE.Color();

const HAS_DOM = typeof document !== "undefined";
function flatTexture(): THREE.Texture {
  if (!HAS_DOM) return new THREE.Texture();
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(stops: [number, string][]): THREE.Texture {
  if (!HAS_DOM) return flatTexture();
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Four-point star flare: the core of a hit, a muzzle flash or a lightning strike. */
function starTexture(): THREE.Texture {
  if (!HAS_DOM) return flatTexture();
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  const core = g.createRadialGradient(32, 32, 0, 32, 32, 12);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.55, "rgba(255,255,255,0.65)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(32, 32);
    g.rotate((i / 4) * Math.PI + Math.PI / 4);
    const grad = g.createLinearGradient(0, -30, 0, 30);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.98)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -30);
    g.quadraticCurveTo(2.6, 0, 0, 30);
    g.quadraticCurveTo(-2.6, 0, 0, -30);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function splatTexture(): THREE.Texture {
  if (!HAS_DOM) return flatTexture();
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const base = g.createRadialGradient(32, 32, 2, 32, 32, 24);
  base.addColorStop(0, "rgba(255,255,255,0.78)");
  base.addColorStop(0.55, "rgba(255,255,255,0.42)");
  base.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = base;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.sin(i * 3.1) * 0.45;
    const r = 6 + (i % 5) * 3.2;
    g.fillStyle = `rgba(255,255,255,${0.32 + (i % 3) * 0.14})`;
    g.beginPath();
    g.ellipse(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2 + (i % 3) * 1.8, 1.4 + (i % 2) * 1.8, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Billowing dust/smoke puff: several overlapping soft lobes instead of one flat disc. */
function puffTexture(): THREE.Texture {
  if (!HAS_DOM) return flatTexture();
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const lobes: [number, number, number, number][] = [
    [64, 66, 44, 0.55], [44, 54, 30, 0.5], [84, 52, 32, 0.5], [50, 82, 28, 0.42], [80, 80, 30, 0.42], [64, 44, 26, 0.45],
  ];
  for (const [x, y, r, a] of lobes) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Crescent of a blade's cut: thick and white-hot in the middle, tapering to nothing at both ends. */
function crescentTexture(): THREE.Texture {
  if (!HAS_DOM) return flatTexture();
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  // The arc is centred on the quad's bottom edge and bulges towards +V (the top).
  const cx = 64, cy = 128, r = 104;
  for (let pass = 0; pass < 3; pass++) {
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1.2) / steps;
      const a0 = Math.PI * (1.12 + 0.76 * t0), a1 = Math.PI * (1.12 + 0.76 * t1);
      const bell = Math.pow(Math.sin(Math.PI * t0), 1.4);
      // The leading end (t→1) is brighter: the cut is still "wet" there.
      const lead = 0.35 + 0.65 * t0;
      const width = [26, 12, 4][pass] * bell + 0.5;
      const alpha = [0.16, 0.42, 0.95][pass] * bell * lead;
      g.strokeStyle = `rgba(255,255,255,${alpha})`;
      g.lineWidth = width;
      g.lineCap = "butt";
      g.beginPath();
      g.arc(cx, cy, r - [10, 4, 1][pass], a0, a1);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Shock ring: a crisp bright rim with a soft glow trailing inward. */
function ringTexture(): THREE.Texture {
  return radialTexture([
    [0, "rgba(255,255,255,0)"], [0.58, "rgba(255,255,255,0)"], [0.8, "rgba(255,255,255,0.16)"],
    [0.93, "rgba(255,255,255,0.95)"], [0.985, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"],
  ]);
}

/** Per-instance opacity for alpha-blended pools (smoke, stains): instance colour alone cannot fade them. */
function fadeMaterial(mat: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vFade;");
  };
  return mat;
}

interface Particle {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  s0: number;
  s1: number;
  rot: number;
  rotV: number;
  drag: number;
  grav: number;
  r: number;
  g: number;
  b: number;
  stretch: number;
  q?: THREE.Quaternion;
}
class Pool {
  constructor(
    public mesh: THREE.InstancedMesh,
    public list: Particle[],
    public kind: "solid" | "billboard" | "flat" | "streak" | "oriented",
    public additive = false,
    public fade: THREE.InstancedBufferAttribute | null = null,
  ) {}
}

interface TrailSample { tip: THREE.Vector3; base: THREE.Vector3; age: number }
interface Trail { samples: TrailSample[]; color: THREE.Color; width: number }
const TRAIL_LIFE = 0.17;
const TRAIL_SAMPLES = 12;
const TRAIL_SUB = 3;
const TRAIL_MAX_QUADS = 1400;

export class EffectLayer {
  private sparks: Pool;
  private embers: Pool;
  private chunks: Pool;
  private smoke: Pool;
  private flares: Pool;
  private rings: Pool;
  private stains: Pool;
  private arcs: Pool;
  private trailMesh: THREE.Mesh;
  private trailPos: Float32Array;
  private trailCol: Float32Array;
  private trails = new Map<string, Trail>();
  private samplePool: TrailSample[] = [];
  private puffTex: THREE.Texture;
  private arcTex: THREE.Texture;
  private ringTex: THREE.Texture;
  private boltMesh: THREE.LineSegments;
  private boltPositions: Float32Array;
  private softTex: THREE.Texture;
  private starTex: THREE.Texture;
  private splatTex: THREE.Texture;
  private dummy = new THREE.Object3D();

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.softTex = radialTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.65)"], [1, "rgba(255,255,255,0)"]]);
    this.starTex = starTexture();
    this.splatTex = splatTexture();
    this.puffTex = puffTexture();
    this.arcTex = crescentTexture();
    this.ringTex = ringTexture();

    const box = new THREE.BoxGeometry(1, 1, 1);
    const plane = new THREE.PlaneGeometry(1, 1);
    const additive = (opacity = 1) => new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity,
    });

    this.sparks = this.make(box, additive(), 520, "streak", true);
    this.embers = this.make(box, additive(), 220, "streak", true);
    this.chunks = this.make(box, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.18 }), 260, "solid", false);
    this.smoke = this.make(plane, fadeMaterial(new THREE.MeshBasicMaterial({
      map: this.puffTex, transparent: true, opacity: 0.85, depthWrite: false,
    })), 320, "billboard", false, true);
    this.flares = this.make(plane, new THREE.MeshBasicMaterial({
      map: this.starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), 140, "billboard", true);
    const ringMat = additive(0.95);
    ringMat.map = this.ringTex;
    this.rings = this.make(new THREE.RingGeometry(0.5, 1, 40), ringMat, 120, "flat", true);
    this.stains = this.make(plane, fadeMaterial(new THREE.MeshBasicMaterial({
      map: this.splatTex, transparent: true, opacity: 0.5, depthWrite: false,
    })), 180, "flat", false, true);
    // Blade crescents: a quad whose bottom edge sits on the swing's pivot and whose arc bulges forward.
    const arcGeo = new THREE.PlaneGeometry(2, 1);
    arcGeo.translate(0, 0.5, 0);
    this.arcs = this.make(arcGeo, new THREE.MeshBasicMaterial({
      map: this.arcTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }), 96, "oriented", true);
    for (const p of this.arcs.list) p.q = new THREE.Quaternion();

    // Weapon trails: one dynamic ribbon mesh shared by every swinging blade.
    const trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_MAX_QUADS * 18);
    this.trailCol = new Float32Array(TRAIL_MAX_QUADS * 18);
    const posAttr = new THREE.BufferAttribute(this.trailPos, 3);
    const colAttr = new THREE.BufferAttribute(this.trailCol, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute("position", posAttr);
    trailGeo.setAttribute("color", colAttr);
    trailGeo.setDrawRange(0, 0);
    this.trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 4;
    this.trailMesh.visible = false;
    scene.add(this.trailMesh);

    const boltGeo = new THREE.BufferGeometry();
    this.boltPositions = new Float32Array(96 * 6);
    boltGeo.setAttribute("position", new THREE.BufferAttribute(this.boltPositions, 3));
    this.boltMesh = new THREE.LineSegments(
      boltGeo,
      new THREE.LineBasicMaterial({ color: 0xdfeeff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.boltMesh.userData.isBoltHost = true;
    this.boltMesh.frustumCulled = false;
    this.boltMesh.visible = false;
    this.boltMesh.renderOrder = 5;
    scene.add(this.boltMesh);
  }

  private make(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, kind: Pool["kind"], additive = false, fades = false): Pool {
    // A fading pool owns its geometry: the per-instance opacity attribute must not leak into other pools.
    if (fades) geo = geo.clone();
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    let fade: THREE.InstancedBufferAttribute | null = null;
    if (fades) {
      fade = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
      fade.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aFade", fade);
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = kind === "streak" || kind === "billboard" || kind === "oriented" ? 4 : 3;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    const list: Particle[] = [];
    for (let i = 0; i < n; i++) {
      list.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1, rot: 0, rotV: 0, drag: 0, grav: 0, r: 1, g: 1, b: 1, stretch: 0 });
    }
    return { mesh, list, kind, additive, fade };
  }

  private take(pool: Pool) {
    for (const p of pool.list) if (!p.alive) return p;
    return null;
  }

  /* ================= emitters ================= */

  /**
   * The impact moment: a white-hot core + compact star flash, a tight shock shell,
   * a directional spark cone along the blow, chips, a compact dust puff, and blood spray.
   * Differentiates heavy blows, sharp slashes, blunt guard blocks and magic bursts.
   */
  impact(x: number, y: number, z: number, dx: number, dz: number, power = 1, color = 0xffe0a0) {
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    COL.setHex(color);
    const isBlock = color === 0xffffff;
    const isMagic = !isBlock && (COL.b > COL.r * 1.02 || (COL.r > 0.72 && COL.b > 0.85));
    const isHeavy = power >= 1.05;

    // White-hot incandescent core flash layered with the colored star flash (~52% of original radius)
    this.flare(x, y, z, 0.46 + power * 0.32, 0xffffff, 0.065);
    this.flare(x, y, z, 0.82 + power * 0.62, color, isHeavy ? 0.12 : 0.095);

    const sparkColor = isBlock ? 0xe8f4ff : isMagic ? color : 0xffe2a0;
    const sparkSpeed = (isBlock ? 5.8 : isMagic ? 6.4 : 6.8) + power * 2.8;
    this.spark(x, y, z, nx, isBlock ? 0.35 : 0.45, nz, 8 + Math.round(power * 8), sparkColor, sparkSpeed);

    this.chip(x, y, z, nx, nz, 3 + Math.round(power * 3), isBlock ? 0xe2dcd0 : 0xd8cdb8);
    this.puff(x + nx * 0.14, y, z + nz * 0.14, 3, 0.36 + power * 0.2, isMagic ? color : 0xc8c0b0, 0.45, 0.34);

    if (isBlock) {
      this.blood(x, y, z, nx, nz, Math.max(2, Math.round(power * 3)));
      this.shock(x, y * 0.85, z, 0.16, 0.78 + power * 0.55, 0xd8f0ff, 0.16);
    } else {
      this.blood(x, y, z, nx, nz, 6 + Math.round(power * 6));
      if (isMagic) this.ember(x, y, z, 3 + Math.round(power * 3));
      if (power > 0.7) this.shock(x, 0.05, z, 0.18, 0.92 + power * 0.72, color, isHeavy ? 0.24 : 0.19);
    }
  }

  /** Sparks streak along the impact direction; they are never a uniform sphere. */
  spark(x: number, y: number, z: number, dx: number, dy: number, dz: number, count: number, color: number, speed = 5.5) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    COL.setHex(color);
    for (let i = 0; i < count; i++) {
      const p = this.take(this.sparks);
      if (!p) return;
      const spread = 0.62;
      const ax = dx + (Math.random() - 0.5) * spread;
      const ay = dy + (Math.random() - 0.5) * spread + 0.18;
      const az = dz + (Math.random() - 0.5) * spread;
      const l = Math.hypot(ax, ay, az) || 1;
      const sp = speed * (0.48 + Math.random() * 0.88);
      p.alive = true;
      p.p.set(x, y, z);
      p.v.set((ax / l) * sp, (ay / l) * sp, (az / l) * sp);
      p.life = p.max = 0.08 + Math.random() * 0.16;
      p.s0 = 0.036 + Math.random() * 0.032;
      p.s1 = 0.003;
      p.stretch = 3.2;
      p.drag = 3.6;
      p.grav = 13.5;
      p.r = COL.r; p.g = COL.g; p.b = COL.b;
      p.rot = 0; p.rotV = 0;
    }
  }

  /** Dark spray droplets, plus a compact red mist cloud and subtle ground stain. */
  blood(x: number, y: number, z: number, dx: number, dz: number, count = 10) {
    for (let i = 0; i < count; i++) {
      const p = this.take(this.chunks);
      if (!p) return;
      const sp = 1.8 + Math.random() * 3.1;
      p.alive = true;
      p.p.set(x, y, z);
      p.v.set((dx + (Math.random() - 0.5) * 0.95) * sp, 0.75 + Math.random() * 1.9, (dz + (Math.random() - 0.5) * 0.95) * sp);
      p.life = p.max = 0.24 + Math.random() * 0.3;
      p.s0 = 0.028 + Math.random() * 0.04;
      p.s1 = p.s0 * 0.55;
      p.drag = 1.4;
      p.grav = 25;
      p.rot = Math.random() * 6.28;
      p.rotV = (Math.random() - 0.5) * 18;
      p.r = 0.36; p.g = 0.04; p.b = 0.04;
      p.stretch = 1.05;
    }
    if (count >= 5) this.puff(x + dx * 0.16, y + 0.06, z + dz * 0.16, 2, 0.24, 0x6d2820, 0.26, 0.25);
    this.stain(x + dx * 0.22, z + dz * 0.22, 0.56 + Math.random() * 0.32, 0x5b0d0a, 11);
  }

  /** Solid chips (armour, bone) that tumble and bounce off the ground. */
  chip(x: number, y: number, z: number, dx: number, dz: number, count: number, color: number) {
    COL.setHex(color);
    for (let i = 0; i < count; i++) {
      const p = this.take(this.chunks);
      if (!p) return;
      const sp = 1.5 + Math.random() * 2.5;
      p.alive = true;
      p.p.set(x, y, z);
      p.v.set((dx + (Math.random() - 0.5) * 1.1) * sp, 1.2 + Math.random() * 2.3, (dz + (Math.random() - 0.5) * 1.1) * sp);
      p.life = p.max = 0.5 + Math.random() * 0.42;
      p.s0 = 0.038 + Math.random() * 0.052;
      p.s1 = p.s0 * 0.75;
      p.drag = 0.85;
      p.grav = 22;
      p.rot = Math.random() * 6.28;
      p.rotV = (Math.random() - 0.5) * 22;
      p.r = COL.r; p.g = COL.g; p.b = COL.b;
      p.stretch = 0;
    }
  }

  /** Soft smoke/dust cloud (~52% scale and tightened hang time). */
  puff(x: number, y: number, z: number, count: number, size: number, color = 0x9a948c, rise = 0.65, life = 0.62) {
    COL.setHex(color);
    for (let i = 0; i < count; i++) {
      const p = this.take(this.smoke);
      if (!p) return;
      p.alive = true;
      p.p.set(x + (Math.random() - 0.5) * 0.26, y + Math.random() * 0.16, z + (Math.random() - 0.5) * 0.26);
      p.v.set((Math.random() - 0.5) * 0.5, rise * (0.5 + Math.random() * 0.55), (Math.random() - 0.5) * 0.5);
      p.life = p.max = life * (0.62 + Math.random() * 0.42);
      p.s0 = size * 0.22;
      p.s1 = size * (0.8 + Math.random() * 0.42);
      p.rot = Math.random() * 6.28;
      p.rotV = (Math.random() - 0.5) * 1.4;
      p.drag = 2.2;
      p.grav = -0.22;
      p.r = COL.r; p.g = COL.g; p.b = COL.b;
      p.stretch = 0;
    }
  }

  /** Four-point star flash: the brightest point of an impact or a muzzle (~53% scale). */
  flare(x: number, y: number, z: number, size: number, color: number, life = 0.095) {
    const p = this.take(this.flares);
    if (!p) return;
    p.alive = true;
    p.p.set(x, y, z);
    p.v.set(0, 0, 0);
    p.life = p.max = life;
    p.s0 = size * 0.34;
    p.s1 = size * 0.94;
    p.rot = Math.random() * 6.28;
    p.rotV = 0;
    p.drag = 0; p.grav = 0;
    COL.setHex(color);
    p.r = COL.r; p.g = COL.g; p.b = COL.b;
    p.stretch = 0;
  }

  /** Expanding shock ring, flat on the ground (~54% radius when called directly or via presets). */
  shock(x: number, y: number, z: number, from: number, to: number, color: number, life = 0.25) {
    const p = this.take(this.rings);
    if (!p) return;
    p.alive = true;
    p.p.set(x, y, z);
    p.v.set(0, 0, 0);
    p.life = p.max = life;
    p.s0 = from * 0.85;
    p.s1 = to * 0.85;
    p.rot = Math.random() * 6.28;
    p.rotV = 0;
    p.drag = 0; p.grav = 0;
    COL.setHex(color);
    p.r = COL.r; p.g = COL.g; p.b = COL.b;
    p.stretch = 0;
  }

  /** Persistent ground stain (blood, scorch) with refined spread. */
  stain(x: number, z: number, size: number, color: number, life = 11) {
    const p = this.take(this.stains);
    if (!p) return;
    p.alive = true;
    p.p.set(x, 0.02, z);
    p.v.set(0, 0, 0);
    p.life = p.max = life;
    p.s0 = size * 0.72;
    p.s1 = size * 0.92;
    p.rot = Math.random() * 6.28;
    p.rotV = 0;
    p.drag = 0; p.grav = 0;
    COL.setHex(color);
    p.r = COL.r; p.g = COL.g; p.b = COL.b;
    p.stretch = 0;
  }

  /** Rising embers from fire (~53% spawn radius and size). */
  ember(x: number, y: number, z: number, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.take(this.embers);
      if (!p) return;
      p.alive = true;
      p.p.set(x + (Math.random() - 0.5) * 0.48, y + Math.random() * 0.32, z + (Math.random() - 0.5) * 0.48);
      p.v.set((Math.random() - 0.5) * 0.85, 1.15 + Math.random() * 1.75, (Math.random() - 0.5) * 0.85);
      p.life = p.max = 0.48 + Math.random() * 0.65;
      p.s0 = 0.046;
      p.s1 = 0.006;
      p.stretch = 1.4;
      p.drag = 1.1;
      p.grav = -1.2;
      p.r = 1; p.g = 0.52 + Math.random() * 0.38; p.b = 0.14;
      p.rot = 0; p.rotV = 0;
    }
  }

  /** Whole blast: white-hot core, fireball, shock ring, sparks, smoke, embers, scorch (~53% scale). */
  explosion(x: number, y: number, z: number, power = 1) {
    this.flare(x, y, z, 2.1 + power * 1.5, 0xfff4d8, 0.14);
    this.flare(x, y, z, 1.1 + power * 0.75, 0xffb060, 0.24);
    this.shock(x, 0.05, z, 0.32, 2.1 + power * 2.6, 0xffc27a, 0.36);
    this.spark(x, y, z, 0, 1, 0, 12 + Math.round(power * 10), 0xffc880, 5.4 + power * 2.8);
    this.puff(x, y, z, 7 + Math.round(power * 4), 0.85 + power * 0.68, 0x6a5c52, 0.72, 0.72);
    this.ember(x, y, z, 8 + Math.round(power * 6));
    this.chip(x, y, z, 0, 0, 6, 0x4a4038);
    this.stain(x, z, 1.25 + power * 0.65, 0x1b1512, 15);
  }

  /** Forking lightning bolt between two points. */
  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color = 0xdfeeff) {
    this.flare(bx, by, bz, 1.25, 0xeaf4ff, 0.09);
    const segments = 8;
    BOLT_A.set(ax, ay, az);
    BOLT_B.set(bx, by, bz);
    for (const dir of BOLT_DIRS) {
      const n = segments - 1;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = new THREE.Vector3().lerpVectors(BOLT_A, BOLT_B, t);
        const amp = Math.sin(t * Math.PI) * 0.38;
        p.x += (Math.random() - 0.5) * amp + dir.x * amp * 0.25;
        p.y += (Math.random() - 0.5) * amp + dir.y * amp * 0.25;
        p.z += (Math.random() - 0.5) * amp + dir.z * amp * 0.25;
        pts.push(p);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      line.renderOrder = 5;
      this.scene.add(line);
      this.boltMesh.userData.lines = this.boltMesh.userData.lines || [];
      this.boltMesh.userData.lines.push({ line, life: 0.14 });
    }
  }

  /* ================= update ================= */

  update(dt: number) {
    this.updatePool(this.sparks, dt);
    this.updatePool(this.embers, dt);
    this.updatePool(this.chunks, dt);
    this.updatePool(this.smoke, dt);
    this.updatePool(this.flares, dt);
    this.updatePool(this.rings, dt);
    this.updatePool(this.stains, dt);
    this.updatePool(this.arcs, dt);
    this.updateBolts(dt);
    this.updateTrails(dt);
  }

  private updatePool(pool: Pool, dt: number) {
    const mesh = pool.mesh;
    let count = 0;
    const camQ = this.camera.quaternion;
    for (const p of pool.list) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.v.y -= p.grav * dt;
      if (p.drag > 0) p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.04) {
        p.p.y = 0.04;
        if (pool.kind === "solid") {
          p.v.y = Math.abs(p.v.y) * 0.32;
          p.v.x *= 0.72;
          p.v.z *= 0.72;
          p.rotV *= 0.5;
          if (Math.abs(p.v.y) < 0.5) p.v.y = 0;
        } else {
          p.v.y = 0; p.v.x *= 0.6; p.v.z *= 0.6;
        }
      }
      p.rot += p.rotV * dt;
      const k = 1 - p.life / p.max;
      let size: number;
      if (pool === this.flares) {
        // Snap rapidly to peak brightness/scale, then contract along a sharp exponential curve
        const pulse = k < 0.18 ? k / 0.18 : Math.exp(-3.8 * (k - 0.18));
        size = p.s0 + (p.s1 - p.s0) * pulse;
      } else if (pool.kind === "streak") {
        // Exponential decay from incandescent birth size to fine tip
        const decay = Math.exp(-3.2 * k);
        size = p.s1 + (p.s0 - p.s1) * decay;
      } else if (pool === this.rings) {
        // Fast initial shockwave snap that decelerates exponentially
        const ease = 1 - Math.exp(-5.2 * k);
        size = p.s0 + (p.s1 - p.s0) * ease;
      } else if (pool === this.smoke) {
        const ease = 1 - Math.exp(-4.2 * k);
        const tail = k > 0.65 ? Math.max(0.2, 1 - ((k - 0.65) / 0.35) * 0.6) : 1;
        size = (p.s0 + (p.s1 - p.s0) * ease) * tail;
      } else if (pool === this.stains) {
        const spread = 1 - Math.exp(-8 * k);
        const tail = k > 0.75 ? 1 - ((k - 0.75) / 0.25) * 0.45 : 1;
        size = (p.s0 + (p.s1 - p.s0) * spread) * tail;
      } else if (pool === this.arcs) {
        // The cut opens almost instantly, then only drifts outward while it fades.
        size = p.s0 + (p.s1 - p.s0) * (1 - Math.exp(-9 * k));
      } else {
        size = p.s0 + (p.s1 - p.s0) * k;
      }

      this.dummy.position.copy(p.p);
      if (pool.kind === "oriented") {
        this.dummy.quaternion.copy(p.q!);
        this.dummy.rotateZ(p.rot);
        this.dummy.scale.set(size, size * p.stretch, size);
      } else if (pool.kind === "billboard") {
        this.dummy.quaternion.copy(camQ);
        this.dummy.rotateZ(p.rot);
        this.dummy.scale.setScalar(size);
      } else if (pool.kind === "flat") {
        this.dummy.rotation.set(-HALF_PI, 0, 0);
        this.dummy.rotateY(p.rot);
        this.dummy.scale.setScalar(size);
      } else if (pool.kind === "streak" && p.stretch > 0) {
        const speed = p.v.length();
        TMP.copy(p.v).normalize();
        QUAT.setFromUnitVectors(UP, TMP);
        this.dummy.quaternion.copy(QUAT);
        this.dummy.scale.set(size, size * (1 + Math.min(speed * 0.085, 3.2) * p.stretch), size);
      } else {
        this.dummy.rotation.set(p.rot, p.rot * 0.7, p.rot * 0.4);
        this.dummy.scale.setScalar(size);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(count, this.dummy.matrix);

      if (pool.additive) {
        // High-luminance white-hot core at birth, rapidly decaying exponentially
        const hot = Math.exp(-7.5 * k) * 0.72;
        const energy = Math.exp(-2.6 * k) * (1 - k * 0.75);
        COL.setRGB(
          (p.r + (1 - p.r) * hot) * energy,
          (p.g + (1 - p.g) * hot) * energy,
          (p.b + (1 - p.b) * hot) * energy,
        );
      } else {
        COL.setRGB(p.r, p.g, p.b);
      }
      if (pool.fade) {
        // Smoke blooms in and thins out; stains hold, then soak away.
        pool.fade.array[count] = pool === this.smoke
          ? Math.min(1, k * 9) * Math.pow(1 - k, 1.35)
          : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      }
      mesh.setColorAt(count, COL);
      count++;
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      if (pool.fade) {
        pool.fade.clearUpdateRanges();
        pool.fade.addUpdateRange(0, count);
        pool.fade.needsUpdate = true;
      }
    }
  }

  private updateBolts(dt: number) {
    const lines: { line: THREE.Line; life: number }[] = this.boltMesh.userData.lines || [];
    for (let i = lines.length - 1; i >= 0; i--) {
      lines[i].life -= dt;
      if (lines[i].life <= 0) {
        this.scene.remove(lines[i].line);
        lines[i].line.geometry.dispose();
        (lines[i].line.material as THREE.Material).dispose();
        lines.splice(i, 1);
      } else {
        const mat = lines[i].line.material as THREE.LineBasicMaterial;
        mat.opacity = Math.min(1, Math.pow(lines[i].life / 0.14, 1.5));
      }
    }
    this.boltMesh.userData.lines = lines;
  }

  private updateTrails(dt: number) {
    const pos = this.trailPos, col = this.trailCol;
    let v = 0;
    const put = (p: THREE.Vector3, r: number, g: number, b: number) => {
      pos[v] = p.x; pos[v + 1] = p.y; pos[v + 2] = p.z;
      col[v] = r; col[v + 1] = g; col[v + 2] = b;
      v += 3;
    };
    const limit = TRAIL_MAX_QUADS * 18;
    for (const [id, t] of this.trails) {
      const list = t.samples;
      for (const smp of list) smp.age += dt;
      while (list.length && list[0].age >= TRAIL_LIFE) this.samplePool.push(list.shift()!);
      if (!list.length) { this.trails.delete(id); continue; }
      const n = list.length;
      if (n < 2) continue;
      const cr = t.color.r, cg = t.color.g, cb = t.color.b;
      // Catmull-Rom between samples so a fast swing reads as a curve, not a polygon.
      let prevTip = TIP_A.copy(list[0].tip), prevBase = BASE_A.copy(list[0].base);
      let prevHeat = this.trailHeat(list[0].age, 0);
      for (let i = 0; i < n - 1 && v + 18 <= limit; i++) {
        const s0 = list[Math.max(0, i - 1)], s1 = list[i], s2 = list[i + 1], s3 = list[Math.min(n - 1, i + 2)];
        for (let j = 1; j <= TRAIL_SUB && v + 18 <= limit; j++) {
          const u = j / TRAIL_SUB;
          const tip = catmull(TIP_B, s0.tip, s1.tip, s2.tip, s3.tip, u);
          const base = catmull(BASE_B, s0.base, s1.base, s2.base, s3.base, u);
          const heat = this.trailHeat(s1.age + (s2.age - s1.age) * u, (i + u) / (n - 1));
          // Two triangles per span. The blade edge glows; the inner edge is black, i.e. invisible when additive.
          const h0 = prevHeat * t.width, h1 = heat * t.width;
          const w0 = Math.pow(prevHeat, 3) * 0.35, w1 = Math.pow(heat, 3) * 0.35;
          put(prevBase, 0, 0, 0);
          put(prevTip, (cr + (1 - cr) * w0) * h0, (cg + (1 - cg) * w0) * h0, (cb + (1 - cb) * w0) * h0);
          put(tip, (cr + (1 - cr) * w1) * h1, (cg + (1 - cg) * w1) * h1, (cb + (1 - cb) * w1) * h1);
          put(prevBase, 0, 0, 0);
          put(tip, (cr + (1 - cr) * w1) * h1, (cg + (1 - cg) * w1) * h1, (cb + (1 - cb) * w1) * h1);
          put(base, 0, 0, 0);
          prevTip = TIP_A.copy(tip); prevBase = BASE_A.copy(base); prevHeat = heat;
        }
      }
    }
    const geo = this.trailMesh.geometry;
    geo.setDrawRange(0, v / 3);
    this.trailMesh.visible = v > 0;
    if (v > 0) {
      for (const name of ["position", "color"] as const) {
        const attr = geo.getAttribute(name) as THREE.BufferAttribute;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, v);
        attr.needsUpdate = true;
      }
    }
  }

  /** Brightness of a ribbon span: young samples burn, and the ribbon tapers towards its tail. */
  private trailHeat(age: number, along: number) {
    const young = Math.max(0, 1 - age / TRAIL_LIFE);
    return Math.pow(young, 1.5) * (0.25 + 0.75 * along);
  }

  /**
   * Weapon trail: a ribbon swept by the blade itself. Each call adds the blade's current edge
   * (tip → a point part-way down the weapon); successive edges are stitched into a swoosh.
   */
  trail(id: string, tx: number, ty: number, tz: number, bx: number, by: number, bz: number, color: number, width = 1) {
    let t = this.trails.get(id);
    if (!t) {
      if (this.trails.size >= 72) return;
      t = { samples: [], color: new THREE.Color(color), width };
      this.trails.set(id, t);
    }
    t.color.setHex(color);
    t.width = width;
    const last = t.samples[t.samples.length - 1];
    if (last && last.tip.distanceToSquared(TMP.set(tx, ty, tz)) < 0.0009) return;
    const smp = t.samples.length >= TRAIL_SAMPLES ? t.samples.shift()!
      : this.samplePool.pop() ?? { tip: new THREE.Vector3(), base: new THREE.Vector3(), age: 0 };
    smp.tip.set(tx, ty, tz);
    smp.base.set(bx, by, bz);
    smp.age = 0;
    t.samples.push(smp);
  }

  /** Lets the ribbon burn out on its own instead of cutting it off mid-air. */
  endTrail(_id: string) { /* samples age out in updateTrails */ }

  get activeTrails() { return this.trails.size; }

  /**
   * The cut itself: a crescent hanging in the air where the blade passed.
   * `tilt` rolls the cutting plane about the facing axis (0 = level sweep, ±π/2 = vertical chop);
   * `sweep` spins the crescent within that plane as it fades, in the direction of the swing.
   */
  slash(x: number, y: number, z: number, dx: number, dz: number, radius: number, tilt = 0, sweep = 1, color = 0xfff2d0, depth = 0.62, life = 0.2) {
    const p = this.take(this.arcs);
    if (!p) return;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    // Basis: X = right, Y = forward (the crescent bulges this way), Z = up.
    BASIS.makeBasis(TMP.set(fz, 0, -fx), DIR.set(fx, 0, fz), MID.set(0, 1, 0));
    p.q!.setFromRotationMatrix(BASIS);
    QUAT.setFromAxisAngle(AXIS_Y, tilt);
    p.q!.multiply(QUAT);
    p.alive = true;
    p.p.set(x, y, z);
    p.v.set(fx * 1.3, 0, fz * 1.3);
    p.life = p.max = life;
    p.s0 = radius * 0.72;
    p.s1 = radius * 1.08;
    p.stretch = depth;
    p.rot = -sweep * 0.55;
    p.rotV = sweep * 4.6;
    p.drag = 5;
    p.grav = 0;
    COL.setHex(color);
    p.r = COL.r; p.g = COL.g; p.b = COL.b;
  }

  /** A single long streak: the line of a thrust, a lance point or a bolt leaving the string. */
  streak(x: number, y: number, z: number, dx: number, dy: number, dz: number, length: number, color: number, speed = 16) {
    const p = this.take(this.sparks);
    if (!p) return;
    const len = Math.hypot(dx, dy, dz) || 1;
    p.alive = true;
    p.p.set(x, y, z);
    p.v.set((dx / len) * speed, (dy / len) * speed, (dz / len) * speed);
    p.life = p.max = 0.13;
    p.s0 = 0.085;
    p.s1 = 0.004;
    p.stretch = Math.max(1, length / 0.085 / 3.2);
    p.drag = 9;
    p.grav = 0;
    COL.setHex(color);
    p.r = COL.r; p.g = COL.g; p.b = COL.b;
    p.rot = 0; p.rotV = 0;
  }

  clear() {
    for (const pool of [this.sparks, this.embers, this.chunks, this.smoke, this.flares, this.rings, this.stains, this.arcs]) {
      for (const p of pool.list) p.alive = false;
      pool.mesh.count = 0;
      pool.mesh.visible = false;
    }
    this.trailMesh.geometry.setDrawRange(0, 0);
    this.trailMesh.visible = false;
    this.trails.clear();
    const lines: { line: THREE.Line; life: number }[] = this.boltMesh.userData.lines || [];
    for (const l of lines) {
      this.scene.remove(l.line);
      l.line.geometry.dispose();
      (l.line.material as THREE.Material).dispose();
    }
    this.boltMesh.userData.lines = [];
    this.boltMesh.visible = false;
  }

  dispose() {
    this.clear();
    for (const pool of [this.sparks, this.embers, this.chunks, this.smoke, this.flares, this.rings, this.stains, this.arcs]) {
      this.scene.remove(pool.mesh);
      pool.mesh.geometry.dispose();
      (pool.mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.trailMesh);
    this.trailMesh.geometry.dispose();
    (this.trailMesh.material as THREE.Material).dispose();
    this.scene.remove(this.boltMesh);
    this.boltMesh.geometry.dispose();
    (this.boltMesh.material as THREE.Material).dispose();
    this.softTex.dispose();
    this.starTex.dispose();
    this.splatTex.dispose();
  }
}
