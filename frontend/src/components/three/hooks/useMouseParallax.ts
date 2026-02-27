'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Tilts a Three.js group toward the mouse cursor position.
 * Creates a subtle parallax effect that makes the scene feel interactive.
 */
export function useMouseParallax(
  groupRef: React.RefObject<THREE.Group>,
  intensity: number = 0.12
) {
  const mouse = useRef({ x: 0, y: 0 });
  const target = useRef({ rotX: 0, rotY: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize to -1..1 range
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    // Target rotation based on mouse position
    target.current.rotY = mouse.current.x * intensity;
    target.current.rotX = -mouse.current.y * intensity * 0.5;

    // Smooth interpolation
    groupRef.current.rotation.x += (target.current.rotX - groupRef.current.rotation.x) * 0.05;
    groupRef.current.rotation.y += (target.current.rotY - groupRef.current.rotation.y) * 0.05;
  });
}
