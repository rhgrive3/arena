import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Shield } from 'lucide-react';
import { buildUnitRig, type UnitRig } from '../game/rigs';
import { DEFS, type UnitKind } from '../game/units';

const cache = new Map<UnitKind, string>();
let portraitRenderer: THREE.WebGLRenderer | null = null;

function addModel(scene: THREE.Scene, kind: UnitKind): UnitRig {
  const rig = buildUnitRig(kind, 0);
  for (const part of rig.parts) part.group.add(new THREE.Mesh(part.geometry, part.material));
  rig.root.rotation.y = -0.35;
  scene.add(rig.root);
  return rig;
}

function lightScene(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xe9eddf, 0x414d54, 2.8));
  const key = new THREE.DirectionalLight(0xffe6af, 3.8);
  key.position.set(-4, 8, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa6c8e4, 3);
  rim.position.set(4, 4, -5);
  scene.add(rim);
}

function frameModel(root: THREE.Group, camera: THREE.PerspectiveCamera) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.2;
  camera.position.set(center.x + distance * 0.1, center.y + distance * 0.08, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

function renderPortrait(kind: UnitKind) {
  if (cache.has(kind)) return cache.get(kind)!;
  if (!portraitRenderer) {
    portraitRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    portraitRenderer.setSize(320, 360);
    portraitRenderer.setPixelRatio(1);
    portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    portraitRenderer.toneMappingExposure = 1.25;
    portraitRenderer.setClearColor(0x000000, 0);
  }
  const scene = new THREE.Scene();
  lightScene(scene);
  const model = addModel(scene, kind);
  const camera = new THREE.PerspectiveCamera(34, 320 / 360, 0.1, 100);
  frameModel(model.root, camera);
  portraitRenderer.render(scene, camera);
  const url = portraitRenderer.domElement.toDataURL('image/png');
  cache.set(kind, url);
  return url;
}

export function UnitPortrait({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  const [src, setSrc] = useState(cache.get(kind) ?? '');
  useEffect(() => {
    setSrc(cache.get(kind) ?? '');
    if (cache.has(kind)) return;
    const timer = window.setTimeout(() => {
      try { setSrc(renderPortrait(kind)); } catch { /* A readable icon remains available without WebGL. */ }
    }, 20);
    return () => clearTimeout(timer);
  }, [kind]);
  return src ? <img className={`unit-portrait ${className}`} src={src} alt="" draggable={false} /> : <Shield className={`portrait-fallback ${className}`} aria-hidden="true" />;
}

export function UnitModel({ kind }: { kind: UnitKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    lightScene(scene);
    const rig = addModel(scene, kind);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${DEFS[kind].name}の3Dモデル。ドラッグで回転できます`);
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      frameModel(rig.root, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let dragging = false, lastX = 0, frame = 0;
    const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; canvas.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (dragging) { rig.root.rotation.y += (event.clientX - lastX) * 0.012; lastX = event.clientX; } };
    const up = () => { dragging = false; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    const animate = () => { frame = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    };
  }, [kind]);
  return <div className="unit-model" ref={ref}>{failed && <UnitPortrait kind={kind} />}</div>;
}