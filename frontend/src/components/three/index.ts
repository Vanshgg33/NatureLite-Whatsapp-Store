// Core wrapper
export { CanvasWrapper, LoadingFallback, StaticFallback } from './canvas-wrapper';

// Legacy components (CSS-based)
export { SeedParticles } from './seed-particles';
export { WoodenPressScene } from './wooden-press-scene';
export { ProductViewer } from './product-viewer';

// 3D Scenes
export { HeroScene3D } from './scenes/HeroScene3D';
export { ProcessScene3D } from './scenes/ProcessScene3D';
export { StoryScene } from './scenes/StoryScene';

// 3D Models
export { OilBottleRealistic, MustardOil, SesameOil, GroundnutOil, CoconutOil } from './models/OilBottleRealistic';
export { GhaniPress } from './models/GhaniPress';

// Legacy 3D Objects
export { OilBottle3D, MustardOilBottle, SesameOilBottle, GroundnutOilBottle, CoconutOilBottle } from './objects/OilBottle3D';
export { WoodenPress3D } from './objects/WoodenPress3D';

// Effects
export { GoldenParticles, SeedParticles as GoldenSeedParticles, DustParticles } from './effects/GoldenParticles';

// Hooks
export { useScrollProgress, useScrollTimeline, useGlobalScrollProgress, useInViewport } from './hooks/useScrollProgress';
