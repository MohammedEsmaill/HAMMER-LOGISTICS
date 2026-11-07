import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type SceneMode = 'loader' | 'calm';

const CONTAINERS = 38;
const PARTICLES = 700;

/** A deterministic pseudo-random sequence, so the scene looks the same on every load. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Shipping containers on a slow, tilted spiral: gold ones and a few dark steel ones. */
function Containers({ mode }: { mode: SceneMode }) {
  const gold = useRef<THREE.InstancedMesh>(null);
  const steel = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const rand = seeded(7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let g = 0;
    let s = 0;
    for (let i = 0; i < CONTAINERS; i++) {
      const t = i / CONTAINERS;
      const angle = t * Math.PI * 6;
      const radius = 4.6 + rand() * 2.6;
      const y = (t - 0.5) * 6 + (rand() - 0.5) * 0.8;
      e.set(rand() * 0.4, -angle + Math.PI / 2, rand() * 0.3);
      q.setFromEuler(e);
      const scale = 0.32 + rand() * 0.26;
      m.compose(
        new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
        q,
        new THREE.Vector3(scale, scale, scale),
      );
      if (i % 5 === 0) steel.current?.setMatrixAt(s++, m);
      else gold.current?.setMatrixAt(g++, m);
    }
    if (gold.current) {
      gold.current.count = g;
      gold.current.instanceMatrix.needsUpdate = true;
    }
    if (steel.current) {
      steel.current.count = s;
      steel.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    const speed = mode === 'loader' ? 0.45 : 0.08;
    group.current.rotation.y += delta * speed;
    group.current.rotation.x = Math.sin(performance.now() / 4000) * 0.12;
  });

  // a 20-ft container is about 2.4 : 1 : 1
  return (
    <group ref={group} rotation={[0.35, 0, -0.12]}>
      <instancedMesh ref={gold} args={[undefined, undefined, CONTAINERS]}>
        <boxGeometry args={[2.4, 1, 1]} />
        <meshStandardMaterial color="#d4a73c" metalness={0.9} roughness={0.32} />
      </instancedMesh>
      <instancedMesh ref={steel} args={[undefined, undefined, CONTAINERS]}>
        <boxGeometry args={[2.4, 1, 1]} />
        <meshStandardMaterial color="#2b2b30" metalness={0.7} roughness={0.45} />
      </instancedMesh>
    </group>
  );
}

/** Gold dust drifting upward. */
function Dust({ mode }: { mode: SceneMode }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const rand = seeded(42);
    const arr = new Float32Array(PARTICLES * 3);
    for (let i = 0; i < PARTICLES; i++) {
      arr[i * 3] = (rand() - 0.5) * 22;
      arr[i * 3 + 1] = (rand() - 0.5) * 14;
      arr[i * 3 + 2] = (rand() - 0.5) * 14;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!points.current) return;
    points.current.rotation.y -= delta * (mode === 'loader' ? 0.06 : 0.015);
    points.current.position.y = ((points.current.position.y + delta * 0.15 + 3) % 6) - 3;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f1d27a" size={0.045} transparent opacity={0.75} sizeAttenuation />
    </points>
  );
}

/** The camera leans gently toward the pointer. */
function Parallax() {
  const { camera, pointer } = useThree();
  useFrame(() => {
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 0.8 + 0.6 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** A warm light at the centre that breathes. */
function CoreLight({ mode }: { mode: SceneMode }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (!light.current) return;
    const pulse = (Math.sin(performance.now() / (mode === 'loader' ? 400 : 1600)) + 1) / 2;
    light.current.intensity = 30 + pulse * 30;
  });
  return <pointLight ref={light} position={[0, 0.5, 0]} color="#f1b94a" distance={14} />;
}

export default function GoldScene({ mode = 'calm' }: { mode?: SceneMode }) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <Canvas
      camera={{ position: [0, 0.6, 13], fov: 45 }}
      dpr={[1, 1.75]}
      frameloop={reduced ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <fog attach="fog" args={['#0b0b0d', 10, 24]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 8, 5]} intensity={2.2} color="#fff1cf" />
      <directionalLight position={[-8, -2, -4]} intensity={0.6} color="#7f6a3a" />
      <CoreLight mode={mode} />
      <Containers mode={mode} />
      <Dust mode={mode} />
      {!reduced && <Parallax />}
    </Canvas>
  );
}
