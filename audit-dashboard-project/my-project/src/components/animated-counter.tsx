'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * AnimatedCounter: A number that counts up from 0 to the target value on mount.
 * Uses requestAnimationFrame for smooth animation.
 */
export function AnimatedCounter({
  target,
  duration = 1200,
  delay = 0,
  suffix = '',
  className = '',
  decimals = 0,
}: {
  target: number
  duration?: number
  delay?: number
  suffix?: string
  className?: string
  decimals?: number
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // Delay before starting animation
    const timeoutId = setTimeout(() => {
      startTimeRef.current = null

      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp
        }

        const elapsed = timestamp - startTimeRef.current
        const progress = Math.min(elapsed / duration, 1)

        // Ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = eased * target

        setDisplayValue(current)

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayValue(target)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, delay])

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toString()

  return (
    <motion.span
      initial={{ opacity: 0.3 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: delay / 1000 }}
      className={`tabular-nums ${className}`}
    >
      {formatted}{suffix}
    </motion.span>
  )
}

/**
 * AnimatedStatCard: A stat card with glass-morphism effect and animated counter.
 */
export function AnimatedStatCard({
  icon,
  value,
  label,
  color,
  accentColor,
  delay = 0,
  suffix = '',
  decimals = 0,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
  accentColor: string
  delay?: number
  suffix?: string
  decimals?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -3, scale: 1.02 }}
      className="glass-card card-hover-enhanced"
    >
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center text-center relative">
        <div className="mb-1.5" style={{ color }}>{icon}</div>
        <AnimatedCounter
          target={value}
          delay={delay * 1000}
          suffix={suffix}
          decimals={decimals}
          className="text-2xl sm:text-3xl font-bold"
        />
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {/* Gradient accent bar at bottom */}
        <div
          className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-lg"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}60)`,
          }}
        />
      </div>
    </motion.div>
  )
}
