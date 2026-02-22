'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { detectPerformanceTier } from '@/lib/performance-tier';

interface ProductViewerProps {
  images: string[];
  productName: string;
  className?: string;
}

/**
 * ProductViewer - CSS-based interactive product viewer
 * Ready for Three.js 360° rotation upgrade when 3D models are available
 */
export function ProductViewer({
  images,
  productName,
  className,
}: ProductViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tier = detectPerformanceTier();

  // Drag to rotate through images
  const dragX = useMotionValue(0);
  const rotateY = useTransform(dragX, [-200, 200], [-30, 30]);

  const handleDragEnd = () => {
    const currentX = dragX.get();
    if (Math.abs(currentX) > 50) {
      // Change image based on drag direction
      const direction = currentX > 0 ? -1 : 1;
      const newIndex = (currentIndex + direction + images.length) % images.length;
      setCurrentIndex(newIndex);
    }
    // Reset drag position
    animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
  };

  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  const resetView = () => {
    setCurrentIndex(0);
    setIsZoomed(false);
    animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
  };

  // Simple view for low-end devices
  if (tier === 'low' || images.length === 0) {
    return (
      <div
        className={cn(
          'relative aspect-square rounded-2xl overflow-hidden bg-brand-sand',
          className
        )}
      >
        {images[0] ? (
          <Image
            src={images[0]}
            alt={productName}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-6xl text-brand-brown/20">
              {productName[0]}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative aspect-square rounded-2xl overflow-hidden', className)}
    >
      {/* Main image with drag interaction */}
      <motion.div
        className={cn(
          'absolute inset-0 cursor-grab active:cursor-grabbing',
          isZoomed && 'cursor-zoom-out'
        )}
        drag={!isZoomed ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        style={{ x: dragX, rotateY }}
        onDragEnd={handleDragEnd}
        onClick={toggleZoom}
      >
        <motion.div
          className="w-full h-full"
          animate={{ scale: isZoomed ? 1.5 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {images[currentIndex] ? (
            <Image
              src={images[currentIndex]}
              alt={`${productName} view ${currentIndex + 1}`}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-brand-sand flex items-center justify-center">
              <span className="font-display text-8xl text-brand-brown/20">
                {productName[0]}
              </span>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={toggleZoom}
          className="w-10 h-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center hover:bg-white transition-colors"
          aria-label={isZoomed ? 'Zoom out' : 'Zoom in'}
        >
          {isZoomed ? (
            <ZoomOut className="w-5 h-5 text-brand-charcoal" />
          ) : (
            <ZoomIn className="w-5 h-5 text-brand-charcoal" />
          )}
        </button>
        <button
          onClick={resetView}
          className="w-10 h-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center hover:bg-white transition-colors"
          aria-label="Reset view"
        >
          <RotateCcw className="w-5 h-5 text-brand-charcoal" />
        </button>
      </div>

      {/* Image indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                index === currentIndex
                  ? 'bg-brand-mustard'
                  : 'bg-white/50 hover:bg-white/80'
              )}
              aria-label={`View image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Drag hint */}
      {!isZoomed && images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs font-body opacity-0 hover:opacity-100 transition-opacity">
          Drag to rotate
        </div>
      )}
    </div>
  );
}

/**
 * Future Three.js implementation for 360° product view
 */
// export function ProductViewer3D({ modelUrl }: { modelUrl: string }) {
//   const gltf = useGLTF(modelUrl);
//   const meshRef = useRef<THREE.Group>(null);
//
//   return (
//     <Canvas>
//       <ambientLight intensity={0.5} />
//       <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
//       <OrbitControls enableZoom={true} enablePan={false} />
//       <primitive ref={meshRef} object={gltf.scene} />
//     </Canvas>
//   );
// }
