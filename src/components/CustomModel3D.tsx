import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Mood } from "../types";
import { HUD_COLOR } from "./Kosmos";
import { FrameLimiter, Guard } from "./Kosmos3D";
import { useFrameBudget } from "../hooks/usePageVisible";

interface Props {
  /** Object URL of a user-uploaded .glb or .vrm. */
  url: string;
  mood: Mood;
  talking: boolean;
  onPoke: () => void;
  fallback: ReactNode;
}

/** Target height of the model in scene units, so any file frames the same. */
const HEIGHT = 2;

/**
 * Any GLB/VRM the user uploads. Unlike the built-in character there is nothing
 * known about its shape, so it gets whole-body motion only: it is scaled to a
 * fixed height, then floats, turns toward the mouse, spins when clicked and
 * bobs while she talks. The mood tints the rim light.
 */
function Model({ url, mood, talking, spins }: { url: string; mood: Mood; talking: boolean; spins: number }) {
  const { scene } = useGLTF(url);
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const spin = useRef({ seen: spins, start: -10 });

  // Scale to HEIGHT and stand the feet on y = -1, centred on x and z.
  const model = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = HEIGHT / Math.max(size.y, 1e-3);
    const centre = box.getCenter(new THREE.Vector3());
    root.scale.setScalar(scale);
    root.position.set(-centre.x * scale, -1 - box.min.y * scale, -centre.z * scale);
    return root;
  }, [scene]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (spin.current.seen !== spins) {
      spin.current = { seen: spins, start: t };
    }
    const spinning = Math.min(1, (t - spin.current.start) / 0.9);
    const spinAngle = spinning < 1 ? Math.PI * 2 * (1 - (1 - spinning) ** 3) : 0;
    const yaw = THREE.MathUtils.clamp(pointer.current.x, -1, 1) * 0.35;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y % (Math.PI * 2), yaw, 0.06) + spinAngle;
    g.position.y = Math.sin(t * 1.2) * 0.03 + (talking ? Math.abs(Math.sin(t * 9)) * 0.015 : 0);
  });

  return (
    <group ref={group}>
      <primitive object={model} />
      <pointLight position={[0, 0.6, -1.4]} intensity={2.5} color={HUD_COLOR[mood]} />
    </group>
  );
}

export default function CustomModel3D({ url, mood, talking, onPoke, fallback }: Props) {
  const [spins, setSpins] = useState(0);
  const fps = useFrameBudget();
  return (
    <Guard fallback={fallback}>
      <div
        className="waifu kosmos3d"
        onClick={() => {
          setSpins((n) => n + 1);
          onPoke();
        }}
      >
        <Canvas
          camera={{ position: [0, 0.1, 4.2], fov: 32 }}
          gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
          dpr={[1, 1.25]}
          frameloop={fps ? "demand" : "never"}
        >
          <FrameLimiter fps={fps} />
          <hemisphereLight args={["#ffffff", "#c8d6ff", 1.6]} />
          <directionalLight position={[1.5, 2, 3]} intensity={1.6} />
          <Suspense fallback={null}>
            <Model url={url} mood={mood} talking={talking} spins={spins} />
          </Suspense>
        </Canvas>
      </div>
    </Guard>
  );
}
