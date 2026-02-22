'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export interface ScrollTriggerConfig {
  trigger: string | Element;
  start?: string;
  end?: string;
  scrub?: boolean | number;
  pin?: boolean | string | Element;
  markers?: boolean;
  toggleActions?: string;
  onEnter?: () => void;
  onLeave?: () => void;
  onEnterBack?: () => void;
  onLeaveBack?: () => void;
}

export interface AnimationConfig {
  duration?: number;
  delay?: number;
  ease?: string;
  stagger?: number | { amount: number; from?: 'start' | 'end' | 'center' | 'edges' | 'random' };
}

class AnimationControllerClass {
  private scrollTriggers: Map<string, ScrollTrigger> = new Map();
  private animations: Map<string, gsap.core.Tween> = new Map();
  private isPaused: boolean = false;
  private reducedMotion: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      // Listen for changes to reduced motion preference
      window
        .matchMedia('(prefers-reduced-motion: reduce)')
        .addEventListener('change', (e) => {
          this.reducedMotion = e.matches;
          if (e.matches) {
            this.pauseAll();
          } else {
            this.resumeAll();
          }
        });
    }
  }

  /**
   * Check if reduced motion is preferred
   */
  prefersReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /**
   * Register a scroll trigger animation
   */
  registerScrollTrigger(id: string, config: ScrollTriggerConfig): ScrollTrigger | null {
    if (this.reducedMotion) return null;
    if (this.scrollTriggers.has(id)) {
      this.unregisterScrollTrigger(id);
    }

    const trigger = ScrollTrigger.create({
      ...config,
      id,
    });

    this.scrollTriggers.set(id, trigger);
    return trigger;
  }

  /**
   * Unregister a scroll trigger
   */
  unregisterScrollTrigger(id: string): void {
    const trigger = this.scrollTriggers.get(id);
    if (trigger) {
      trigger.kill();
      this.scrollTriggers.delete(id);
    }
  }

  /**
   * Create a fade-up animation
   */
  fadeUp(
    elements: string | Element | Element[],
    config: AnimationConfig = {}
  ): gsap.core.Tween | null {
    if (this.reducedMotion) return null;

    return gsap.from(elements, {
      opacity: 0,
      y: 30,
      duration: config.duration ?? 0.8,
      delay: config.delay ?? 0,
      ease: config.ease ?? 'power3.out',
      stagger: config.stagger ?? 0.1,
    });
  }

  /**
   * Create a fade-in animation
   */
  fadeIn(
    elements: string | Element | Element[],
    config: AnimationConfig = {}
  ): gsap.core.Tween | null {
    if (this.reducedMotion) return null;

    return gsap.from(elements, {
      opacity: 0,
      duration: config.duration ?? 0.6,
      delay: config.delay ?? 0,
      ease: config.ease ?? 'power2.out',
      stagger: config.stagger ?? 0.05,
    });
  }

  /**
   * Create a scale-in animation
   */
  scaleIn(
    elements: string | Element | Element[],
    config: AnimationConfig = {}
  ): gsap.core.Tween | null {
    if (this.reducedMotion) return null;

    return gsap.from(elements, {
      opacity: 0,
      scale: 0.9,
      duration: config.duration ?? 0.6,
      delay: config.delay ?? 0,
      ease: config.ease ?? 'power2.out',
      stagger: config.stagger ?? 0.08,
    });
  }

  /**
   * Create a slide animation
   */
  slideIn(
    elements: string | Element | Element[],
    direction: 'left' | 'right' | 'up' | 'down',
    config: AnimationConfig = {}
  ): gsap.core.Tween | null {
    if (this.reducedMotion) return null;

    const props: gsap.TweenVars = {
      opacity: 0,
      duration: config.duration ?? 0.7,
      delay: config.delay ?? 0,
      ease: config.ease ?? 'power3.out',
      stagger: config.stagger ?? 0.1,
    };

    switch (direction) {
      case 'left':
        props.x = -50;
        break;
      case 'right':
        props.x = 50;
        break;
      case 'up':
        props.y = 50;
        break;
      case 'down':
        props.y = -50;
        break;
    }

    return gsap.from(elements, props);
  }

  /**
   * Create a parallax effect
   */
  parallax(
    element: string | Element,
    speed: number = 0.5,
    config: Partial<ScrollTriggerConfig> = {}
  ): gsap.core.Tween | null {
    if (this.reducedMotion) return null;

    return gsap.to(element, {
      y: () => window.innerHeight * speed,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        ...config,
      },
    });
  }

  /**
   * Pause all animations
   */
  pauseAll(): void {
    this.isPaused = true;
    this.scrollTriggers.forEach((trigger) => trigger.disable());
    gsap.globalTimeline.pause();
  }

  /**
   * Resume all animations
   */
  resumeAll(): void {
    if (this.reducedMotion) return;
    this.isPaused = false;
    this.scrollTriggers.forEach((trigger) => trigger.enable());
    gsap.globalTimeline.resume();
  }

  /**
   * Refresh ScrollTrigger (useful after content changes)
   */
  refresh(): void {
    ScrollTrigger.refresh();
  }

  /**
   * Clean up all animations and triggers
   */
  cleanup(): void {
    this.scrollTriggers.forEach((trigger) => trigger.kill());
    this.scrollTriggers.clear();
    this.animations.forEach((tween) => tween.kill());
    this.animations.clear();
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  }
}

// Export singleton instance
export const AnimationController = new AnimationControllerClass();

// Export GSAP and ScrollTrigger for direct use
export { gsap, ScrollTrigger };
