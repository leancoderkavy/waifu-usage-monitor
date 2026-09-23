import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Mood } from "../types";
import { HUD_COLOR } from "./Kosmos";

/**
 * The generated 3D KOS-MOS. The mesh has no skeleton or UVs, so the shader does
 * the work: it projects the front and back art onto the surface (blended by
 * facing, so there is no seam), turns the head separately from the body, sways
 * the hair, breathes the chest and adds a mood-colored rim glow.
 *
 * Heights below are in the mesh's own units (it spans y -1.0 .. 0.98), measured
 * on the reference art: chin ~16.5% from the top, collar ~18%, chest core ~30%.
 */
const NECK_Y = 0.62;
const CHEST_LO = 0.3;
const CHEST_HI = 0.5;

interface Props {
  /** Path prefix: loads `${base}_shape.glb`, `_front.jpg`, `_back.jpg`, `_front_mask.png`, `_back_mask.png`. */
  base: string;
  mood: Mood;
  talking: boolean;
  onPoke: () => void;
  /** Rendered when the model can't be loaded. */
  fallback: ReactNode;
}

/** Shows `fallback` if anything inside throws (missing file, bad GLB, no WebGL). */
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("3D character failed, using 2D:", e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const VERTEX_HEAD = /* glsl */ `
uniform float uTime, uYaw, uPitch, uSway, uBreath;
attribute vec3 aVis;
varying vec2 vVis;
varying vec3 vObjPos;
varying vec3 vObjNormal;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
float headWeight(vec3 p) { return smoothstep(${(NECK_Y - 0.02).toFixed(3)}, ${(NECK_Y + 0.05).toFixed(3)}, p.y); }
`;

const VERTEX_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
vObjNormal = objectNormal;
objectNormal = mix(objectNormal, rotY(uYaw) * rotX(uPitch) * objectNormal, headWeight(position));
`;

const VERTEX_POSITION = /* glsl */ `
#include <begin_vertex>
vObjPos = position;
vVis = aVis.rg;
// Head turns and tilts around the neck.
vec3 pivot = vec3(0.0, ${NECK_Y.toFixed(3)}, 0.0);
transformed = mix(transformed, rotY(uYaw) * rotX(uPitch) * (transformed - pivot) + pivot, headWeight(position));
// Hair (and the loose parts beside and behind her) sways, more the lower it hangs.
float below = clamp((${(NECK_Y - 0.08).toFixed(3)} - position.y) / 1.4, 0.0, 1.0);
float loose = max(smoothstep(0.2, 0.38, abs(position.x)), 1.0 - smoothstep(-0.2, -0.07, position.z));
float sway = below * below * loose;
transformed.x += sin(uTime * 1.1 + position.y * 2.5) * uSway * sway;
transformed.z += cos(uTime * 0.9 + position.y * 2.0 + position.x * 3.0) * uSway * 0.6 * sway;
// Breathing: the front of the chest rises and falls.
float chest = smoothstep(${CHEST_LO.toFixed(2)}, ${(CHEST_LO + 0.08).toFixed(2)}, position.y)
  * (1.0 - smoothstep(${(CHEST_HI - 0.08).toFixed(2)}, ${CHEST_HI.toFixed(2)}, position.y))
  * (1.0 - smoothstep(0.1, 0.22, abs(position.x)))
  * step(0.0, position.z);
transformed.z += uBreath * chest;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uFront, uBack;
uniform vec3 uMin, uMax, uRim;
uniform float uRimStrength;
varying vec2 vVis;
varying vec3 vObjPos;
varying vec3 vObjNormal;
`;

const FRAGMENT_ART = /* glsl */ `
vec2 uvF = (vObjPos.xy - uMin.xy) / (uMax.xy - uMin.xy);
vec2 uvB = vec2(1.0 - uvF.x, uvF.y);
// Faces toward the viewer take the front art, faces away take the back art,
// with a soft blend across the sides instead of a hard seam. Baked visibility
// (vVis: seen from front, seen from back) overrides the normal for thin parts.
float facing = smoothstep(-0.35, 0.35, normalize(vObjNormal).z);
facing = mix(mix(facing, 0.0, vVis.y), 1.0, vVis.x);
diffuseColor.rgb *= mix(texture2D(uBack, uvB).rgb, texture2D(uFront, uvF).rgb, facing);
`;

const FRAGMENT_RIM = /* glsl */ `
#include <emissivemap_fragment>
float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
totalEmissiveRadiance += uRim * fresnel * uRimStrength;
`;

type Uniforms = Record<string, THREE.IUniform>;

function useCharacterMaterial(front: THREE.Texture, back: THREE.Texture, box: THREE.Box3) {
  return useMemo(() => {
    for (const t of [front, back]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    const uniforms: Uniforms = {
      uTime: { value: 0 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uSway: { value: 0.018 },
      uBreath: { value: 0 },
      uFront: { value: front },
      uBack: { value: back },
      uMin: { value: box.min.clone() },
      uMax: { value: box.max.clone() },
      uRim: { value: new THREE.Color(HUD_COLOR.calm) },
      uRimStrength: { value: 0.35 },
    };
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = VERTEX_HEAD + shader.vertexShader
        .replace("#include <beginnormal_vertex>", VERTEX_NORMAL)
        .replace("#include <begin_vertex>", VERTEX_POSITION);
      shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
        .replace("#include <map_fragment>", FRAGMENT_ART)
        .replace("#include <emissivemap_fragment>", FRAGMENT_RIM);
    };
    return { material, uniforms };
  }, [front, back, box]);
}

function Model({ base, mood, talking, spins }: { base: string; mood: Mood; talking: boolean; spins: number }) {
  const gltf = useGLTF(`${base}_shape.glb`);
  const [front, back, frontMask, backMask] = useTexture([
    `${base}_front.jpg`,
    `${base}_back.jpg`,
    `${base}_front_mask.png`,
    `${base}_back_mask.png`,
  ]);
  const root = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const motion = useRef({ yaw: 0, pitch: 0, body: 0, spinStart: -10, spinsSeen: spins, rim: new THREE.Color(HUD_COLOR[mood]) });

  const { geometry, box } = useMemo(() => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    const g = mesh!.geometry.clone();
    // Vertex colors carry baked visibility, not color: R = seen from front, G = from back.
    g.setAttribute("aVis", g.getAttribute("color"));
    g.deleteAttribute("color");
    g.computeVertexNormals();
    g.computeBoundingBox();
    return { geometry: g, box: g.boundingBox! };
  }, [gltf.scene]);

  const { material, uniforms } = useCharacterMaterial(front, back, box);

  // The generated mesh has a few see-through gaps (between chin and hair locks).
  // A card inside her, cut to the art's outline, shows the right art through them.
  const cards = useMemo(() => {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const plane = new THREE.PlaneGeometry(size.x, size.y);
    const card = (map: THREE.Texture, alphaMap: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: 0.5, roughness: 0.9, metalness: 0 });
    return { plane, center, front: card(front, frontMask), back: card(back, backMask) };
  }, [box, front, back, frontMask, backMask]);
  const rimTarget = useMemo(() => new THREE.Color(HUD_COLOR[mood]), [mood]);

  // Scale the figure to 2.5 units tall, feet at y = -1.3.
  const fit = useMemo(() => {
    const k = 2.5 / (box.max.y - box.min.y);
    const c = box.getCenter(new THREE.Vector3());
    return { k, offset: new THREE.Vector3(-c.x * k, -box.min.y * k - 1.3, -c.z * k) };
  }, [box]);

  // Where the cursor is relative to her, not to the window, so she looks at it.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      pointer.current = {
        x: (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2),
        y: (e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2),
      };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [gl]);

  useFrame((state, rawDt) => {
    const g = root.current;
    if (!g) return;
    // Clamp so a hitch (tab switch, GC) doesn't make everything jump.
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const m = motion.current;
    const damp = THREE.MathUtils.damp;

    // Head follows the cursor quickly, body follows slowly: reads as looking, not rotating.
    const px = THREE.MathUtils.clamp(pointer.current.x, -1, 1);
    const py = THREE.MathUtils.clamp(pointer.current.y, -1, 1);
    m.body = damp(m.body, px * 0.22 + Math.sin(t * 0.27) * 0.05, 2.2, dt);
    m.yaw = damp(m.yaw, px * 0.5 - m.body * 0.4, 5, dt);
    const nod = talking ? Math.sin(t * 7.5) * 0.035 + 0.02 : 0;
    m.pitch = damp(m.pitch, py * 0.18 + 0.03 + nod, 6, dt);

    // Click spin: an eased full turn laid on top of the body yaw, never fed back into it.
    if (m.spinsSeen !== spins) {
      m.spinsSeen = spins;
      m.spinStart = t;
    }
    const since = (t - m.spinStart) / 1.1;
    const spin = since < 1 ? (since < 0.5 ? 4 * since ** 3 : 1 - (-2 * since + 2) ** 3 / 2) * Math.PI * 2 : 0;

    g.rotation.y = m.body + spin;
    // Idle: float, and a slow weight shift from foot to foot.
    g.position.y = Math.sin(t * 1.25) * 0.025;
    g.rotation.z = Math.sin(t * 0.55) * 0.012;
    // Alerts show through the rim glow only; she never trembles.

    uniforms.uTime.value = t;
    uniforms.uYaw.value = m.yaw;
    uniforms.uPitch.value = m.pitch;
    uniforms.uBreath.value = (Math.sin(t * 1.25) * 0.5 + 0.5) * 0.012;
    m.rim.lerp(rimTarget, 1 - Math.exp(-3 * dt));
    (uniforms.uRim.value as THREE.Color).copy(m.rim);
    uniforms.uRimStrength.value = mood === "panic" ? 0.45 + Math.sin(t * 6) * 0.2 : 0.35;
  });

  return (
    <group ref={root}>
      <group scale={fit.k} position={fit.offset}>
        <mesh geometry={geometry} material={material} />
        <group position={cards.center}>
          <mesh geometry={cards.plane} material={cards.front} />
          {/* Turned around so it faces backward; the back art lines up without mirroring. */}
          <mesh geometry={cards.plane} material={cards.back} rotation={[0, Math.PI, 0]} />
        </group>
      </group>
    </group>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#eaf3ff", "#6b7896", 1.3]} />
      <directionalLight position={[1.5, 2.5, 4]} intensity={1.9} />
      <directionalLight position={[-3, 1, 2]} intensity={0.6} color="#bcd6ff" />
    </>
  );
}

/**
 * Zoom 0 frames the full body, 1 frames the face. The figure is 2.5 units tall
 * with feet at y = -1.3, so her face sits near y = 0.9 and her waist near 0.
 */
const ZOOM_KEY = "kosmos.zoom";
const DEFAULT_ZOOM = 0.55;
const FULL = { y: 0.05, dist: 4.9 };
const FACE = { y: 0.9, dist: 1.25 };

function loadZoom(): number {
  const v = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(v) && localStorage.getItem(ZOOM_KEY) !== null ? THREE.MathUtils.clamp(v, 0, 1) : DEFAULT_ZOOM;
}

/** Eases the camera toward the zoom level the wheel sets. */
function CameraRig({ zoom }: { zoom: { current: number } }) {
  const current = useRef(zoom.current);
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    current.current = THREE.MathUtils.damp(current.current, zoom.current, 6, dt);
    // Ease-in so the middle of the range stays on the upper body a while.
    const z = current.current;
    const e = z * z * (3 - 2 * z);
    const y = THREE.MathUtils.lerp(FULL.y, FACE.y, e);
    camera.position.set(0, y, THREE.MathUtils.lerp(FULL.dist, FACE.dist, e));
    camera.lookAt(0, y, 0);
  });
  return null;
}

/** Rotating HUD rings behind the model, tinted by mood. */
function Rings({ mood }: { mood: Mood }) {
  const hud = HUD_COLOR[mood];
  return (
    <svg className="kosmos3d-rings" viewBox="0 0 300 300">
      <circle cx={150} cy={150} r={140} fill="none" stroke={hud} strokeWidth={1.3} strokeDasharray="3 9" className="spin-slow" />
      <circle cx={150} cy={150} r={124} fill="none" stroke={hud} strokeWidth={2.6} strokeDasharray="60 30 8 30"
        className={mood === "panic" ? "spin-fast" : "spin-rev"} />
    </svg>
  );
}

export default function Kosmos3D({ base, mood, talking, onPoke, fallback }: Props) {
  const [spins, setSpins] = useState(0);
  const zoom = useRef(loadZoom());
  const box = useRef<HTMLDivElement>(null);

  // Wheel zooms her in and out. Registered by hand because React's wheel
  // listener is passive and can't stop the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let save = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = THREE.MathUtils.clamp(zoom.current - e.deltaY * 0.0012, 0, 1);
      clearTimeout(save);
      save = window.setTimeout(() => localStorage.setItem(ZOOM_KEY, zoom.current.toFixed(3)), 300);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      clearTimeout(save);
    };
  }, []);

  return (
    <Guard fallback={fallback}>
      <div
        ref={box}
        className="waifu kosmos3d"
        title="Scroll to zoom · right-click to reset"
        onClick={() => {
          setSpins((n) => n + 1);
          onPoke();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          zoom.current = DEFAULT_ZOOM;
          localStorage.removeItem(ZOOM_KEY);
        }}
      >
        <Rings mood={mood} />
        <Canvas
          camera={{ position: [0, FULL.y, FULL.dist], fov: 32 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
        >
          <CameraRig zoom={zoom} />
          <Lights />
          <Suspense fallback={null}>
            <Model base={base} mood={mood} talking={talking} spins={spins} />
          </Suspense>
        </Canvas>
      </div>
    </Guard>
  );
}
