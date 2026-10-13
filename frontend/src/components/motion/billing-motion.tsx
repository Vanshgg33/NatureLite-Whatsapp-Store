'use client'
import { motion, useSpring, useMotionValueEvent } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/billing/utils/formatINR'

const DUR = { sm: 0.15, md: 0.25, lg: 0.32 }

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: DUR.md, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.sm, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, gap = 0.04 }: { children: React.ReactNode; gap?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export const StaggerItem = motion.div

export function Pressable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function Highlight({ value, children, className }: { value: unknown; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      key={String(value)}
      animate={{ backgroundColor: ['rgba(45,106,79,0.15)', 'transparent'] }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function ShakeOnError({ error, children }: { error: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      animate={error ? { x: [-4, 4, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const spring = useSpring(value, { stiffness: 80, damping: 20 })
  const [display, setDisplay] = useState(() => formatINR(value))

  useMotionValueEvent(spring, 'change', (latest) => {
    setDisplay(formatINR(Math.round(latest)))
  })

  useEffect(() => { spring.set(value) }, [spring, value])

  return <span className={cn('tabular-nums', className)}>{display}</span>
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn('bg-[var(--billing-brand-50)] rounded-md', className)}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

export function SuccessCheck({ size = 24 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <motion.path
        d="M5 13l4 4L19 7"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

