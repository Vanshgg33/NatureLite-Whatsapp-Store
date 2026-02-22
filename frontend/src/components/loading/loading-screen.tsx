'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';

// Optimized 3D Oil Bottle
function OilBottle() {
  const groupRef = useRef<THREE.Group>(null);

  // Bottle shape geometry - memoized
  const bottleGeometry = useMemo(() => {
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(0.35, 0));
    points.push(new THREE.Vector2(0.4, 0.05));
    points.push(new THREE.Vector2(0.45, 0.15));
    points.push(new THREE.Vector2(0.45, 0.75));
    points.push(new THREE.Vector2(0.42, 0.85));
    points.push(new THREE.Vector2(0.35, 0.95));
    points.push(new THREE.Vector2(0.22, 1.05));
    points.push(new THREE.Vector2(0.15, 1.15));
    points.push(new THREE.Vector2(0.12, 1.4));
    points.push(new THREE.Vector2(0.15, 1.45));
    points.push(new THREE.Vector2(0.15, 1.5));
    points.push(new THREE.Vector2(0.1, 1.5));
    points.push(new THREE.Vector2(0, 1.5));
    return new THREE.LatheGeometry(points, 32);
  }, []);

  // Oil geometry - memoized
  const oilGeometry = useMemo(() => {
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0.08));
    points.push(new THREE.Vector2(0.32, 0.08));
    points.push(new THREE.Vector2(0.37, 0.12));
    points.push(new THREE.Vector2(0.42, 0.18));
    points.push(new THREE.Vector2(0.42, 0.55));
    points.push(new THREE.Vector2(0.38, 0.58));
    points.push(new THREE.Vector2(0.2, 0.6));
    points.push(new THREE.Vector2(0, 0.62));
    return new THREE.LatheGeometry(points, 32);
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    groupRef.current.rotation.y = time * 0.4;
    groupRef.current.position.y = Math.sin(time * 0.6) * 0.1;
  });

  return (
    <group ref={groupRef} scale={2} position={[0, -0.3, 0]}>
      {/* Glass bottle - simple material */}
      <mesh geometry={bottleGeometry}>
        <meshPhysicalMaterial
          color="#e8e0d5"
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.1}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* Golden oil */}
      <mesh geometry={oilGeometry} position={[0, 0.02, 0]}>
        <meshStandardMaterial
          color="#DAA520"
          roughness={0.2}
          metalness={0.3}
          envMapIntensity={1}
        />
      </mesh>

      {/* Cork */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.12, 16]} />
        <meshStandardMaterial color="#8B4513" roughness={0.8} />
      </mesh>

      {/* Label */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.25, 32, 1, true]} />
        <meshStandardMaterial color="#faf5eb" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Label accent */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.465, 0.465, 0.06, 32, 1, true]} />
        <meshStandardMaterial color="#d4a574" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Simple floating droplets - no trails
function OilDroplets() {
  const groupRef = useRef<THREE.Group>(null);

  const droplets = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      position: [
        Math.sin(i * Math.PI / 4) * 2.5,
        (Math.random() - 0.5) * 2,
        Math.cos(i * Math.PI / 4) * 2.5,
      ] as [number, number, number],
      scale: 0.06 + Math.random() * 0.04,
      speed: 0.5 + Math.random() * 0.5,
    })), []
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.15;
  });

  return (
    <group ref={groupRef}>
      {droplets.map((droplet, i) => (
        <Float key={i} speed={droplet.speed} floatIntensity={1}>
          <mesh position={droplet.position} scale={droplet.scale}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial
              color="#F4D03F"
              transparent
              opacity={0.7}
              roughness={0.2}
              metalness={0.4}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

// Simple orbiting rings
function OrbitingRings() {
  const ringsRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ringsRef.current) return;
    const time = state.clock.elapsedTime;
    ringsRef.current.rotation.x = time * 0.2;
    ringsRef.current.rotation.z = time * 0.15;
  });

  return (
    <group ref={ringsRef}>
      <mesh>
        <torusGeometry args={[2.2, 0.012, 8, 64]} />
        <meshBasicMaterial color="#d4a574" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[2.5, 0.01, 8, 64]} />
        <meshBasicMaterial color="#DAA520" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, Math.PI / 6]}>
        <torusGeometry args={[2.8, 0.008, 8, 64]} />
        <meshBasicMaterial color="#B8860B" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// Main optimized scene
function LoadingScene() {
  return (
    <>
      {/* Simple lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-3, 2, -3]} intensity={0.5} color="#D4A574" />

      {/* Main elements */}
      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.2}>
        <OilBottle />
      </Float>
      <OilDroplets />
      <OrbitingRings />

      {/* Environment for reflections */}
      <Environment preset="city" />
    </>
  );
}

interface LoadingScreenProps {
  isLoading: boolean;
  onLoadingComplete?: () => void;
  minimumLoadTime?: number;
}

export function LoadingScreen({
  isLoading,
  onLoadingComplete,
  minimumLoadTime = 2500,
}: LoadingScreenProps) {
  const [showLoader, setShowLoader] = useState(true);
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        const increment = prev < 80 ? Math.random() * 3 : 1;
        return Math.min(prev + increment, 100);
      });
    }, 60);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, minimumLoadTime - elapsed);

      const timer = setTimeout(() => {
        setProgress(100);
        setTimeout(() => {
          setShowLoader(false);
          onLoadingComplete?.();
        }, 600);
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [isLoading, minimumLoadTime, onLoadingComplete]);

  return (
    <AnimatePresence>
      {showLoader && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.05,
            transition: { duration: 0.6, ease: 'easeInOut' }
          }}
        >
          {/* Dark background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1510] via-[#0f0c08] to-[#000000]" />

          {/* Subtle animated glow */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(212,165,116,0.15) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* 3D Canvas - optimized settings */}
          <div className="absolute inset-0">
            <Canvas
              camera={{ position: [0, 0, 5.5], fov: 45 }}
              gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
              dpr={1}
              frameloop="always"
            >
              <LoadingScene />
            </Canvas>
          </div>

          {/* Bottom content */}
          <div className="absolute bottom-0 left-0 right-0 pb-12 px-6">
            <div className="max-w-sm mx-auto text-center">
              {/* Brand */}
              <motion.h1
                className="text-3xl md:text-4xl font-serif text-white mb-1 tracking-wider"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ textShadow: '0 0 30px rgba(212,165,116,0.4)' }}
              >
                NATURELITE
              </motion.h1>
              <motion.p
                className="text-[#d4a574] text-xs tracking-[0.3em] uppercase mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Pure & Natural
              </motion.p>

              {/* Progress bar */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#B8860B] via-[#DAA520] to-[#F4D03F] rounded-full"
                    style={{ width: `${progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-white/40">Loading...</span>
                  <span className="text-[#DAA520]">{Math.round(progress)}%</span>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Corner accents */}
          <div className="absolute top-6 left-6 w-12 h-12 border-l border-t border-[#d4a574]/20" />
          <div className="absolute top-6 right-6 w-12 h-12 border-r border-t border-[#d4a574]/20" />
          <div className="absolute bottom-6 left-6 w-12 h-12 border-l border-b border-[#d4a574]/20" />
          <div className="absolute bottom-6 right-6 w-12 h-12 border-r border-b border-[#d4a574]/20" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
