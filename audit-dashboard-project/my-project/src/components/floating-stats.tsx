'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Filter, BookmarkCheck, TrendingUp, Pin, PinOff,
} from 'lucide-react'

interface FloatingStatsProps {
  filteredCount: number
  totalCount: number
  bookmarkCount: number
  progressPercent: number
  resolvedCount: number
}

export function FloatingStats({
  filteredCount,
  totalCount,
  bookmarkCount,
  progressPercent,
  resolvedCount,
}: FloatingStatsProps) {
  const [visible, setVisible] = useState(false)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (pinned) {
      requestAnimationFrame(() => setVisible(true))
      return
    }
    const handler = () => {
      requestAnimationFrame(() => setVisible(window.scrollY > 300))
    }
    window.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => window.removeEventListener('scroll', handler)
  }, [pinned])

  const togglePin = useCallback(() => {
    setPinned(prev => !prev)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
          className={`floating-stats-panel ${!visible && !pinned ? 'hidden-panel' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Quick Stats
            </span>
            <button
              onClick={togglePin}
              className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
              aria-label={pinned ? 'Unpin stats panel' : 'Pin stats panel'}
            >
              {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-0.5">
                <Filter className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">{filteredCount}</span>
              </div>
              <div className="text-[9px] text-muted-foreground">of {totalCount}</div>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-0.5">
                <BookmarkCheck className="h-2.5 w-2.5 text-amber-500" />
                <span className="text-sm font-bold text-foreground">{bookmarkCount}</span>
              </div>
              <div className="text-[9px] text-muted-foreground">bookmarked</div>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-0.5">
                <span className="text-sm font-bold text-emerald-600">{progressPercent}%</span>
              </div>
              <div className="text-[9px] text-muted-foreground">{resolvedCount} fixed</div>
            </div>
          </div>
          {/* Mini progress bar */}
          <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
