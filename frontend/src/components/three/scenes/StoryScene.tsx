'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// All animation state in refs - NO React state updates during scroll
interface AnimationState {
  progress: number;
  targetProgress: number;
  cameraPos: THREE.Vector3;
  cameraTarget: THREE.Vector3;
}

// Premium oil bottle - clean geometry
function OilBottle({ progress }: { progress: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const glassRef = useRef<THREE.Mesh>(null);
  const oilRef = useRef<THREE.Mesh>(null);

  // Bottle shape - elegant curves
  const bottleGeometry = useMemo(() => {
    const shape = new THREE.Shape();

    // Draw half profile for lathe
    shape.moveTo(0, 0);
    shape.lineTo(0.4, 0);
    shape.quadraticCurveTo(0.5, 0, 0.5, 0.1);
    shape.lineTo(0.5, 0.7);
    shape.quadraticCurveTo(0.5, 0.85, 0.35, 0.9);
    shape.quadraticCurveTo(0.2, 0.95, 0.15, 1.1);
    shape.lineTo(0.15, 1.3);
    shape.lineTo(0.12, 1.3);
    shape.lineTo(0.12, 1.05);
    shape.quadraticCurveTo(0.12, 0.95, 0.3, 0.88);
    shape.quadraticCurveTo(0.42, 0.82, 0.42, 0.7);
    shape.lineTo(0.42, 0.12);
    shape.quadraticCurveTo(0.42, 0.05, 0.35, 0.05);
    shape.lineTo(0, 0.05);

    const points: THREE.Vector2[] = [];
    const path = shape.getPoints(20);
    path.forEach(p => points.push(new THREE.Vector2(p.x, p.y)));

    return new THREE.LatheGeometry(points, 32);
  }, []);

  // Oil inside
  const oilGeometry = useMemo(() => {
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0, 0.08),
      new THREE.Vector2(0.38, 0.08),
      new THREE.Vector2(0.4, 0.12),
      new THREE.Vector2(0.4, 0.65),
      new THREE.Vector2(0.35, 0.7),
      new THREE.Vector2(0, 0.72),
    ];
    return new THREE.LatheGeometry(points, 24);
  }, []);

  // Smooth rotation based on progress
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.002;

    // Scale in smoothly
    const scale = THREE.MathUtils.lerp(0.8, 1, Math.min(1, progress * 2));
    groupRef.current.scale.setScalar(scale);
  });

  const opacity = Math.min(1, Math.max(0, (progress - 0.5) * 3));

  if (progress < 0.4) return null;

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      {/* Glass bottle */}
      <mesh geometry={bottleGeometry} ref={glassRef}>
        <meshPhysicalMaterial
          color="#d4c4a8"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Golden oil */}
      <mesh geometry={oilGeometry} ref={oilRef}>
        <meshStandardMaterial
          color="#d4a012"
          transparent
          opacity={0.85 * opacity}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>

      {/* Cork */}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.15, 16]} />
        <meshStandardMaterial color="#8b6914" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Wooden Ghani press - simplified elegant design
function GhaniPress({ progress }: { progress: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!armRef.current) return;
    // Slow, steady rotation
    armRef.current.rotation.y += 0.008;
  });

  const opacity = Math.min(1, Math.max(0, progress * 4));
  const fadeOut = Math.max(0, 1 - (progress - 0.6) * 3);

  if (progress > 0.75 || progress < 0.05) return null;

  return (
    <group ref={groupRef} position={[0, -0.5, 0]} scale={0.9 * fadeOut}>
      {/* Base platform */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.12, 24]} />
        <meshStandardMaterial color="#5d3a1a" roughness={0.85} />
      </mesh>

      {/* Main mortar bowl */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.7, 0.85, 0.6, 24]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>

      {/* Inner cavity */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.5, 24]} />
        <meshStandardMaterial color="#3d2815" roughness={0.9} side={THREE.BackSide} />
      </mesh>

      {/* Rotating arm assembly */}
      <group ref={armRef} position={[0, 0.7, 0]}>
        {/* Vertical pole */}
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 12]} />
          <meshStandardMaterial color="#4a3520" roughness={0.85} />
        </mesh>

        {/* Horizontal beam */}
        <mesh position={[0.5, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 1.1, 8]} />
          <meshStandardMaterial color="#5d3a1a" roughness={0.85} />
        </mesh>

        {/* Pestle */}
        <mesh position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.12, 0.18, 0.5, 12]} />
          <meshStandardMaterial color="#4a3520" roughness={0.85} />
        </mesh>
      </group>

      {/* Oil spout */}
      <mesh position={[0.9, 0.15, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.05, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#5d3a1a" roughness={0.8} />
      </mesh>

      {/* Collection bowl */}
      <group position={[1.1, -0.02, 0]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.22, 0.2, 16]} />
          <meshStandardMaterial color="#6b4423" roughness={0.8} />
        </mesh>
        {/* Oil in bowl */}
        {progress > 0.3 && (
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.22, 0.18, 0.08 * Math.min(1, (progress - 0.3) * 3), 16]} />
            <meshStandardMaterial color="#d4a012" roughness={0.2} metalness={0.3} />
          </mesh>
        )}
      </group>

      {/* Seeds */}
      {progress < 0.5 && (
        <group position={[0, 0.5, 0]}>
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const r = 0.25 + (i % 3) * 0.08;
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * r, -0.05, Math.sin(angle) * r]}
                scale={0.04}
              >
                <sphereGeometry args={[1, 8, 8]} />
                <meshStandardMaterial color="#c4a35a" roughness={0.7} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

// Floating particles - minimal, elegant
function Particles({ progress }: { progress: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const count = 40;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const color = new THREE.Color('#d4a012');

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;

      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }

    return [pos, col];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        transparent
        opacity={0.4}
        vertexColors
        sizeAttenuation
      />
    </points>
  );
}

// Main scene controller
function Scene({ animState }: { animState: React.MutableRefObject<AnimationState> }) {
  const { camera } = useThree();

  // Camera keyframes
  const cameraKeyframes = useMemo(() => [
    { progress: 0, pos: [0, 0.5, 5], target: [0, 0, 0] },
    { progress: 0.25, pos: [1.5, 0.8, 4], target: [0, 0.2, 0] },
    { progress: 0.5, pos: [-1, 1.2, 3.5], target: [0, 0.3, 0] },
    { progress: 0.75, pos: [0.5, 0.3, 3], target: [0, 0, 0] },
    { progress: 1, pos: [0, 0.5, 3.5], target: [0, 0.2, 0] },
  ], []);

  useFrame(() => {
    const state = animState.current;

    // Smooth progress interpolation
    state.progress = THREE.MathUtils.lerp(state.progress, state.targetProgress, 0.08);

    // Find camera position based on progress
    let fromIdx = 0;
    for (let i = 0; i < cameraKeyframes.length - 1; i++) {
      if (state.progress >= cameraKeyframes[i].progress) {
        fromIdx = i;
      }
    }
    const toIdx = Math.min(fromIdx + 1, cameraKeyframes.length - 1);

    const from = cameraKeyframes[fromIdx];
    const to = cameraKeyframes[toIdx];
    const t = (state.progress - from.progress) / (to.progress - from.progress || 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad

    // Interpolate camera
    state.cameraPos.set(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], eased),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], eased),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], eased)
    );
    state.cameraTarget.set(
      THREE.MathUtils.lerp(from.target[0], to.target[0], eased),
      THREE.MathUtils.lerp(from.target[1], to.target[1], eased),
      THREE.MathUtils.lerp(from.target[2], to.target[2], eased)
    );

    camera.position.copy(state.cameraPos);
    camera.lookAt(state.cameraTarget);
  });

  const progress = animState.current.progress;

  return (
    <>
      {/* Lighting - warm, cinematic */}
      <ambientLight intensity={0.4} color="#fff5e6" />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        color="#ffe4c4"
      />
      <directionalLight
        position={[-3, 4, -2]}
        intensity={0.4}
        color="#ffd89b"
      />
      <pointLight position={[0, 2, 2]} intensity={0.3} color="#d4a012" />

      {/* Scene objects */}
      <Particles progress={progress} />
      <GhaniPress progress={progress} />
      <OilBottle progress={progress} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.65, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1410" roughness={1} />
      </mesh>
    </>
  );
}

// Story content for each stage
const storyContent = [
  { title: 'The Ancient Art', subtitle: 'Cold-pressed purity since generations' },
  { title: 'Premium Seeds', subtitle: 'Hand-selected for perfect extraction' },
  { title: 'The Wooden Ghani', subtitle: 'Traditional press at just 4-6 RPM' },
  { title: 'Pure Gold Flows', subtitle: 'Nutrients preserved, taste perfected' },
  { title: 'Nature\'s Finest', subtitle: 'From our family to yours' },
];

export function StoryScene({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animState = useRef<AnimationState>({
    progress: 0,
    targetProgress: 0,
    cameraPos: new THREE.Vector3(0, 0.5, 5),
    cameraTarget: new THREE.Vector3(0, 0, 0),
  });
  const textRef = useRef<HTMLDivElement>(null);
  const currentStageRef = useRef(0);

  // Native scroll handling - no libraries needed
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;

      ticking = true;
      requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const scrollHeight = container.offsetHeight * 2.5; // Scroll distance
        const scrolled = -rect.top;
        const progress = Math.max(0, Math.min(1, scrolled / scrollHeight));

        animState.current.targetProgress = progress;

        // Update text
        const stage = Math.floor(progress * 5);
        if (stage !== currentStageRef.current && textRef.current) {
          currentStageRef.current = stage;
          const content = storyContent[Math.min(stage, storyContent.length - 1)];
          const titleEl = textRef.current.querySelector('h2');
          const subEl = textRef.current.querySelector('p');
          if (titleEl) titleEl.textContent = content.title;
          if (subEl) subEl.textContent = content.subtitle;
        }

        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      style={{ height: '350vh', backgroundColor: '#1a1410' }}
    >
      {/* Sticky canvas */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <Canvas
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
          }}
          dpr={1}
          camera={{ position: [0, 0.5, 5], fov: 45 }}
          style={{ background: '#1a1410' }}
        >
          <Scene animState={animState} />
        </Canvas>

        {/* Text overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div ref={textRef} className="text-center px-4">
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-amber-50 mb-4 drop-shadow-lg">
              {storyContent[0].title}
            </h2>
            <p className="text-lg md:text-xl text-amber-100/70 max-w-xl mx-auto">
              {storyContent[0].subtitle}
            </p>
          </div>
        </div>

        {/* Gradient overlays */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
        </div>

        {/* Progress indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-amber-200/30 transition-colors duration-300"
              style={{
                backgroundColor: animState.current.progress * 5 >= i ? '#d4a012' : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-amber-100/40 text-sm animate-bounce">
          ↓ Scroll to explore
        </div>
      </div>
    </div>
  );
}

export default StoryScene;
