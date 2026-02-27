'use client';

import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera, ContactShadows, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { OilBottleGLB } from '../models/OilBottleGLB';
import { usePerformanceTier } from '@/lib/performance-tier';
import { Loader2, RotateCcw, Pause, Play, Info } from 'lucide-react';

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-mustard animate-spin" />
        <p className="text-sm text-brand-muted">Loading 3D model...</p>
      </div>
    </div>
  );
}

// Annotation hotspots on the bottle
const annotations = [
  {
    position: [0.6, 0.3, 0.3] as [number, number, number],
    label: 'Cold-Pressed',
    detail: 'Extracted at temperatures below 50°C to preserve nutrients',
  },
  {
    position: [0, 1.2, 0.2] as [number, number, number],
    label: 'Natural Cork',
    detail: 'Sustainable cork seal preserves freshness naturally',
  },
  {
    position: [-0.3, -0.3, 0.5] as [number, number, number],
    label: '100% Pure Oil',
    detail: 'No additives, no preservatives — just organic purity',
  },
];

function AnnotationMarker({
  position,
  label,
  detail,
  isActive,
  onClick,
  index,
}: {
  position: [number, number, number];
  label: string;
  detail: string;
  isActive: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <Html position={position} center distanceFactor={5}>
      <div className="cursor-pointer select-none" onClick={onClick}>
        {/* Dot marker */}
        <div className="w-7 h-7 rounded-full bg-brand-mustard/80 border-2 border-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
          <span className="text-white text-xs font-bold">{index + 1}</span>
        </div>

        {/* Expanded detail card */}
        {isActive && (
          <div className="absolute left-10 top-1/2 -translate-y-1/2 w-48 p-3 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg text-left z-50 border border-brand-border/50">
            <p className="text-sm font-semibold text-brand-charcoal">{label}</p>
            <p className="text-xs text-brand-muted mt-1 leading-relaxed">{detail}</p>
          </div>
        )}
      </div>
    </Html>
  );
}

function SceneContent({
  autoRotateEnabled,
  showAnnotations,
  activeAnnotation,
  setActiveAnnotation,
}: {
  autoRotateEnabled: boolean;
  showAnnotations: boolean;
  activeAnnotation: number | null;
  setActiveAnnotation: (i: number | null) => void;
}) {
  const { tier } = usePerformanceTier();

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 4]} fov={40} />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={2}
        maxDistance={8}
        autoRotate={autoRotateEnabled}
        autoRotateSpeed={1.5}
        maxPolarAngle={Math.PI * 0.85}
        minPolarAngle={Math.PI * 0.15}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.8}
      />

      {/* Studio lighting */}
      <ambientLight intensity={0.6} color="#FFF8F0" />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.2}
        color="#FFE4C4"
        castShadow={tier === 'high'}
      />
      <directionalLight position={[-3, 3, -3]} intensity={0.4} color="#D4A574" />
      <pointLight position={[0, -1, 3]} intensity={0.3} color="#DAA520" />
      {/* Rim light */}
      <pointLight position={[-2, 1, -2]} intensity={0.2} color="#FFF5E6" />

      {/* Boosted studio environment */}
      <Environment preset="studio" environmentIntensity={1.0} />

      <OilBottleGLB
        position={[0, -0.5, 0]}
        scale={2}
        autoRotate={false}
        floating={false}
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={tier === 'high'}
        enableEntrance={false}
        envMapIntensity={1.3}
      />

      {/* Annotation hotspots */}
      {showAnnotations && annotations.map((ann, i) => (
        <AnnotationMarker
          key={i}
          index={i}
          position={ann.position}
          label={ann.label}
          detail={ann.detail}
          isActive={activeAnnotation === i}
          onClick={() => setActiveAnnotation(activeAnnotation === i ? null : i)}
        />
      ))}

      {/* Contact shadows */}
      <ContactShadows
        position={[0, -2, 0]}
        opacity={0.3}
        scale={8}
        blur={2}
        far={4}
        resolution={tier === 'high' ? 512 : 256}
        color="#8b7355"
      />

      {/* Post-processing */}
      {tier !== 'low' && (
        <EffectComposer multisampling={tier === 'high' ? 4 : 0}>
          <Bloom
            luminanceThreshold={0.9}
            intensity={0.15}
            mipmapBlur={tier === 'high'}
          />
        </EffectComposer>
      )}
    </>
  );
}

export function Product3DViewer({ className }: { className?: string }) {
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  const { tier } = usePerformanceTier();

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Suspense fallback={<LoadingSpinner />}>
        <Canvas
          shadows={tier === 'high'}
          gl={{ antialias: true, alpha: false, stencil: false }}
          dpr={tier === 'high' ? [1, 2] : [1, 1.5]}
          style={{ background: '#ffffff', borderRadius: 'inherit' }}
        >
          <SceneContent
            autoRotateEnabled={autoRotateEnabled}
            showAnnotations={showAnnotations}
            activeAnnotation={activeAnnotation}
            setActiveAnnotation={setActiveAnnotation}
          />
        </Canvas>
      </Suspense>

      {/* Controls overlay */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {/* Turntable toggle */}
        <button
          onClick={() => setAutoRotateEnabled(!autoRotateEnabled)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-xs font-medium text-brand-charcoal hover:bg-white transition-colors"
        >
          {autoRotateEnabled ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Rotate
            </>
          )}
        </button>

        {/* Annotations toggle */}
        <button
          onClick={() => {
            setShowAnnotations(!showAnnotations);
            setActiveAnnotation(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full shadow-sm text-xs font-medium transition-colors ${
            showAnnotations
              ? 'bg-brand-mustard text-white'
              : 'bg-white/90 backdrop-blur-sm text-brand-charcoal hover:bg-white'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          Details
        </button>
      </div>

      {/* Interaction hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full pointer-events-none">
        Drag to rotate &middot; Scroll to zoom
      </div>
    </div>
  );
}
