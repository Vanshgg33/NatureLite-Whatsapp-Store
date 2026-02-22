'use client';

import { useRef, Suspense, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Environment, PresentationControls, Html, useTexture } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { ShoppingBag, Heart, Eye } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  color?: string;
}

// 3D Product Box Component
function ProductBox({
  product,
  position,
  isActive,
  onClick,
}: {
  product: Product;
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Load product texture
  const texture = useTexture(product.image || '/images/placeholder-product.jpg');
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

  useFrame((state) => {
    if (!meshRef.current) return;

    // Hover animation
    const targetScale = hovered || isActive ? 1.15 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // Subtle floating rotation
    if (!isActive) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.1;
    }
  });

  return (
    <group position={position}>
      <Float
        speed={2}
        rotationIntensity={isActive ? 0 : 0.3}
        floatIntensity={isActive ? 0.2 : 0.5}
      >
        <mesh
          ref={meshRef}
          onClick={onClick}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[2, 2.5, 0.5]} />
          <meshStandardMaterial
            map={texture}
            metalness={0.1}
            roughness={0.4}
            envMapIntensity={0.5}
          />
        </mesh>

        {/* Glow effect for active */}
        {isActive && (
          <mesh scale={1.05}>
            <boxGeometry args={[2, 2.5, 0.5]} />
            <meshBasicMaterial color="#d4a574" transparent opacity={0.3} />
          </mesh>
        )}

        {/* Product name label */}
        {hovered && (
          <Html position={[0, -1.8, 0]} center>
            <div className="bg-brand-charcoal/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium">
              {product.name}
            </div>
          </Html>
        )}
      </Float>
    </group>
  );
}

// Particle field for atmosphere
function ParticleField() {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 200;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 20;
    positions[i + 1] = (Math.random() - 0.5) * 20;
    positions[i + 2] = (Math.random() - 0.5) * 20;
  }

  useFrame((state) => {
    if (!particlesRef.current) return;
    particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#d4a574"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

// Camera controls
function CameraRig({ activeIndex }: { activeIndex: number }) {
  const { camera } = useThree();

  useFrame(() => {
    // Smooth camera movement based on active product
    const targetX = activeIndex !== -1 ? (activeIndex - 1) * 3 : 0;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.05);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, activeIndex !== -1 ? 5 : 8, 0.05);
  });

  return null;
}

// Main 3D Showcase Component
export function ProductShowcase3D({ products }: { products: Product[] }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const displayProducts = products.slice(0, 5);

  return (
    <section className="relative h-screen bg-gradient-to-b from-brand-charcoal to-brand-charcoal/95 overflow-hidden">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 8], fov: 45 }}
          shadows
          gl={{ antialias: true, alpha: true }}
        >
          <Suspense fallback={null}>
            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <spotLight
              position={[10, 10, 10]}
              angle={0.3}
              penumbra={1}
              intensity={1}
              castShadow
              shadow-mapSize={2048}
            />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#d4a574" />

            {/* Environment */}
            <Environment preset="studio" />

            {/* Camera Controls */}
            <CameraRig activeIndex={activeIndex} />

            {/* Particles */}
            <ParticleField />

            {/* Products */}
            <PresentationControls
              global
              rotation={[0, 0, 0]}
              polar={[-0.1, 0.1]}
              azimuth={[-0.5, 0.5]}
              config={{ mass: 2, tension: 400 }}
              snap
            >
              {displayProducts.map((product, index) => (
                <ProductBox
                  key={product.id}
                  product={product}
                  position={[(index - 2) * 3, 0, 0]}
                  isActive={activeIndex === index}
                  onClick={() => setActiveIndex(activeIndex === index ? -1 : index)}
                />
              ))}
            </PresentationControls>

            {/* Ground reflection */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]} receiveShadow>
              <planeGeometry args={[50, 50]} />
              <meshStandardMaterial color="#1a1410" metalness={0.8} roughness={0.2} />
            </mesh>
          </Suspense>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
        {/* Header */}
        <div className="p-8 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="font-display text-4xl lg:text-5xl font-bold text-white mb-4">
              Featured Collection
            </h2>
            <p className="text-white/60 max-w-md">
              Explore our handpicked organic products in immersive 3D.
              Click any product to view details.
            </p>
          </motion.div>
        </div>

        {/* Product Details Panel */}
        <AnimatePresence>
          {activeIndex !== -1 && displayProducts[activeIndex] && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 p-8 lg:p-12 bg-gradient-to-t from-brand-charcoal via-brand-charcoal/90 to-transparent pointer-events-auto"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.4 }}
            >
              <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-end justify-between gap-8">
                <div>
                  <motion.span
                    className="text-brand-mustard text-sm font-medium tracking-wider uppercase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    Organic & Natural
                  </motion.span>
                  <motion.h3
                    className="font-display text-3xl lg:text-4xl font-bold text-white mt-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {displayProducts[activeIndex].name}
                  </motion.h3>
                  <motion.div
                    className="flex items-baseline gap-3 mt-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <span className="text-3xl font-bold text-brand-mustard">
                      ₹{displayProducts[activeIndex].price.toLocaleString()}
                    </span>
                    <span className="text-white/40 line-through">
                      ₹{Math.round(displayProducts[activeIndex].price * 1.2).toLocaleString()}
                    </span>
                  </motion.div>
                </div>

                <motion.div
                  className="flex gap-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <button className="flex items-center gap-2 px-6 py-3 bg-brand-mustard text-brand-charcoal rounded-full font-semibold hover:bg-white transition-colors">
                    <ShoppingBag className="w-5 h-5" />
                    Add to Cart
                  </button>
                  <button className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                    <Heart className="w-5 h-5" />
                  </button>
                  <button className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                    <Eye className="w-5 h-5" />
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Product Navigation Dots */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-8 flex gap-3 pointer-events-auto">
          {displayProducts.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(activeIndex === index ? -1 : index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                activeIndex === index
                  ? 'bg-brand-mustard scale-125'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
