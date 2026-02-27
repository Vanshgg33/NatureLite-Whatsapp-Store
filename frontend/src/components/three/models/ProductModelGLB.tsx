'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Center, Float } from '@react-three/drei';
import * as THREE from 'three';
import { PerformanceTier } from '@/lib/performance-tier';

interface ProductModelGLBProps {
  modelPath: string;
  position?: [number, number, number];
  scale?: number;
  autoRotate?: boolean;
  rotateSpeed?: number;
  floating?: boolean;
  tier?: PerformanceTier;
  enableTransmission?: boolean;
  envMapIntensity?: number;
  tintColor?: string;
  enableEntrance?: boolean;
  enablePulse?: boolean;
  visible?: boolean;
}

export function ProductModelGLB({
  modelPath,
  position = [0, 0, 0],
  scale = 1,
  autoRotate = true,
  rotateSpeed = 0.3,
  floating = true,
  tier = 'high',
  enableTransmission = false,
  envMapIntensity = 1.5,
  tintColor = '#D4A020',
  enableEntrance = true,
  enablePulse = false,
  visible = true,
}: ProductModelGLBProps) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const entranceProgress = useRef(0);
  const [entered, setEntered] = useState(false);

  // Reset entrance when visibility changes
  useEffect(() => {
    if (visible && enableEntrance) {
      entranceProgress.current = 0;
      const timer = setTimeout(() => setEntered(true), 100);
      return () => clearTimeout(timer);
    }
    if (visible) setEntered(true);
  }, [visible, enableEntrance]);

  // Clone scene and enhance materials
  const enhancedScene = useMemo(() => {
    const clone = scene.clone();

    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const oldMat = mesh.material as THREE.MeshStandardMaterial;

      const baseMap = oldMat.map;
      const metRoughMap = oldMat.metalnessMap || oldMat.roughnessMap;

      if (tier === 'high' && enableTransmission) {
        const enhanced = new THREE.MeshPhysicalMaterial({
          map: baseMap,
          metalnessMap: metRoughMap,
          roughnessMap: metRoughMap,
          transmission: 0.6,
          thickness: 1.5,
          ior: 1.45,
          roughness: 0.05,
          metalness: 0.0,
          attenuationColor: new THREE.Color(tintColor),
          attenuationDistance: 0.5,
          envMapIntensity,
          clearcoat: 0.3,
          clearcoatRoughness: 0.1,
          specularIntensity: 1.0,
          specularColor: new THREE.Color('#ffffff'),
          emissive: new THREE.Color(tintColor),
          emissiveIntensity: 0.05,
          transparent: true,
          side: THREE.DoubleSide,
        });
        mesh.material = enhanced;
      } else if (tier === 'high' || tier === 'medium') {
        // Enhanced without transmission (good for opaque products like dry fruit box)
        const enhanced = new THREE.MeshPhysicalMaterial({
          map: baseMap,
          metalnessMap: metRoughMap,
          roughnessMap: metRoughMap,
          roughness: 0.15,
          metalness: 0.05,
          envMapIntensity: envMapIntensity * 0.8,
          clearcoat: 0.4,
          clearcoatRoughness: 0.15,
          emissive: new THREE.Color(tintColor),
          emissiveIntensity: 0.03,
        });
        mesh.material = enhanced;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    return clone;
  }, [scene, tier, enableTransmission, envMapIntensity, tintColor]);

  useFrame((state, delta) => {
    if (!groupRef.current || !visible) return;

    // Entrance animation
    if (enableEntrance && entered && entranceProgress.current < 1) {
      entranceProgress.current = Math.min(1, entranceProgress.current + delta * 0.8);
      const t = entranceProgress.current;
      const eased = 1 - Math.pow(1 - t, 3);
      const entranceY = (1 - eased) * -1.5;
      groupRef.current.position.y = position[1] + entranceY;
      const entranceScale = 0.8 + eased * 0.2;
      groupRef.current.scale.setScalar(scale * entranceScale);
    }

    if (autoRotate) {
      groupRef.current.rotation.y += rotateSpeed * delta;
    }

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
    <group ref={groupRef} position={position} scale={scale} visible={visible}>
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

// Preload all available product models
useGLTF.preload('/models/oil-bottle.glb');
useGLTF.preload('/models/dry-fruit-box.glb');
