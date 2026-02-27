'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Center, Float } from '@react-three/drei';
import * as THREE from 'three';
import { PerformanceTier } from '@/lib/performance-tier';

const MODEL_PATH = '/models/oil-bottle.glb';

interface OilBottleGLBProps {
  position?: [number, number, number];
  scale?: number;
  autoRotate?: boolean;
  rotateSpeed?: number;
  scrollProgress?: number;
  floating?: boolean;
  tier?: PerformanceTier;
  enableTransmission?: boolean;
  envMapIntensity?: number;
  tintColor?: string;
  enableEntrance?: boolean;
  enablePulse?: boolean;
}

export function OilBottleGLB({
  position = [0, 0, 0],
  scale = 1,
  autoRotate = true,
  rotateSpeed = 0.3,
  scrollProgress = 0,
  floating = true,
  tier = 'high',
  enableTransmission = true,
  envMapIntensity = 1.5,
  tintColor = '#D4A020',
  enableEntrance = true,
  enablePulse = false,
}: OilBottleGLBProps) {
  const { scene } = useGLTF(MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);
  const entranceProgress = useRef(0);
  const [entered, setEntered] = useState(false);

  // Trigger entrance animation
  useEffect(() => {
    if (enableEntrance) {
      const timer = setTimeout(() => setEntered(true), 100);
      return () => clearTimeout(timer);
    }
    setEntered(true);
  }, [enableEntrance]);

  // Clone scene and enhance materials (memoized — runs once per tier change)
  const enhancedScene = useMemo(() => {
    const clone = scene.clone();

    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const oldMat = mesh.material as THREE.MeshStandardMaterial;

      // Preserve original textures
      const baseMap = oldMat.map;
      const metRoughMap = oldMat.metalnessMap || oldMat.roughnessMap;

      if (tier === 'high' && enableTransmission) {
        // Full premium material with glass transmission
        const enhanced = new THREE.MeshPhysicalMaterial({
          map: baseMap,
          metalnessMap: metRoughMap,
          roughnessMap: metRoughMap,
          // Glass-like properties
          transmission: 0.6,
          thickness: 1.5,
          ior: 1.45,
          roughness: 0.05,
          metalness: 0.0,
          // Warm oil attenuation
          attenuationColor: new THREE.Color(tintColor),
          attenuationDistance: 0.5,
          // Enhanced reflections
          envMapIntensity: envMapIntensity,
          clearcoat: 0.3,
          clearcoatRoughness: 0.1,
          // Specular
          specularIntensity: 1.0,
          specularColor: new THREE.Color('#ffffff'),
          // Emissive for glow pulse
          emissive: new THREE.Color(tintColor),
          emissiveIntensity: 0.05,
          transparent: true,
          side: THREE.DoubleSide,
        });
        mesh.material = enhanced;
      } else if (tier === 'medium') {
        // Medium: clearcoat + env boost, no transmission
        const enhanced = new THREE.MeshPhysicalMaterial({
          map: baseMap,
          metalnessMap: metRoughMap,
          roughnessMap: metRoughMap,
          roughness: 0.1,
          metalness: 0.05,
          envMapIntensity: envMapIntensity * 0.8,
          clearcoat: 0.5,
          clearcoatRoughness: 0.15,
          emissive: new THREE.Color(tintColor),
          emissiveIntensity: 0.03,
        });
        mesh.material = enhanced;
      }
      // Low tier: keep original material

      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    return clone;
  }, [scene, tier, enableTransmission, envMapIntensity, tintColor]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Entrance animation
    if (enableEntrance && entered && entranceProgress.current < 1) {
      entranceProgress.current = Math.min(1, entranceProgress.current + delta * 0.8);
      const t = entranceProgress.current;
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      // Rise from below
      const entranceY = (1 - eased) * -1.5;
      groupRef.current.position.y = position[1] + entranceY;

      // Scale in slightly
      const entranceScale = 0.8 + eased * 0.2;
      groupRef.current.scale.setScalar(scale * entranceScale);
    }

    // Auto-rotation
    if (autoRotate && scrollProgress <= 0) {
      groupRef.current.rotation.y += rotateSpeed * delta;
    }

    // Scroll-driven rotation
    if (scrollProgress > 0) {
      groupRef.current.rotation.y = scrollProgress * Math.PI * 2;
    }

    // Emissive pulse (subtle golden glow)
    if (enablePulse && (tier === 'high' || tier === 'medium')) {
      const pulse = Math.sin(state.clock.elapsedTime * 1.5) * 0.5 + 0.5;
      enhancedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = 0.03 + pulse * 0.08;
          }
        }
      });
    }
  });

  const content = (
    <group ref={groupRef} position={position} scale={scale}>
      <Center>
        <primitive object={enhancedScene} />
      </Center>
    </group>
  );

  if (floating) {
    return (
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[-0.1, 0.1]}>
        {content}
      </Float>
    );
  }

  return content;
}

// Preload the model
useGLTF.preload(MODEL_PATH);
