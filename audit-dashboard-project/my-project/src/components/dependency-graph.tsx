'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Finding, Severity, Tier } from '@/lib/audit-types'
import {
  FINDINGS, severityConfig, tierLabels,
} from '@/lib/audit-data'
import { Network, ArrowRight, CircleDot, GitBranch, Maximize, Expand } from 'lucide-react'

/* ─── SEVERITY & TIER COLORS FOR SVG ─── */
const severitySvgColors: Record<Severity, { fill: string; stroke: string; label: string }> = {
  critical: { fill: '#dc262620', stroke: '#dc2626', label: 'Critical' },
  high:     { fill: '#f9731620', stroke: '#f97316', label: 'High' },
  medium:   { fill: '#eab30820', stroke: '#eab308', label: 'Medium' },
  low:      { fill: '#6b728020', stroke: '#6b7280', label: 'Low' },
}

const tierSvgColors: Record<Tier, string> = {
  tier0: '#dc2626',
  tier1: '#f97316',
  tier2: '#eab308',
  additional: '#10b981',
  deferred: '#6b7280',
}

const tierBandBg: Record<Tier, string> = {
  tier0: '#dc262608',
  tier1: '#f9731608',
  tier2: '#eab30808',
  additional: '#10b98108',
  deferred: '#6b728008',
}

/* ─── PARSE DEPENDENCIES ─── */
function parseDependsOn(dependsOn: string): (number | string)[] {
  if (dependsOn === 'None' || dependsOn.startsWith('None')) return []
  if (dependsOn === 'Deferred') return []

  const tasks: (number | string)[] = []
  const regex = /Task\s+(\d+|X\d+|D-\w+)/gi
  let match
  while ((match = regex.exec(dependsOn)) !== null) {
    const val = match[1]
    if (val.startsWith('X') || val.startsWith('D')) {
      tasks.push(val)
    } else {
      tasks.push(Number(val))
    }
  }
  return tasks
}

/* ─── NODE & EDGE STRUCTURES ─── */
interface DepNode {
  task: number | string
  finding: Finding
  x: number
  y: number
  tier: Tier
  levelInTier: number
}

interface DepEdge {
  from: number | string  // dependent task (X)
  to: number | string    // prerequisite task (Y) — X depends on Y
  isCriticalPath: boolean
}

/* ─── COMPUTE CRITICAL PATH ─── */
function computeCriticalPath(
  edges: DepEdge[],
  nodeTasks: (number | string)[]
): { length: number; path: (number | string)[] } {
  // Build adjacency: prerequisite → dependents
  const adj = new Map<number | string, (number | string)[]>()
  nodeTasks.forEach(t => adj.set(t, []))
  edges.forEach(e => {
    const list = adj.get(e.to) ?? []
    list.push(e.from)
    adj.set(e.to, list)
  })

  // BFS from nodes with no incoming edges (roots)
  const inDegree = new Map<number | string, number>()
  nodeTasks.forEach(t => inDegree.set(t, 0))
  edges.forEach(e => {
    inDegree.set(e.from, (inDegree.get(e.from) ?? 0) + 1)
  })

  // Find longest path using DP
  const dist = new Map<number | string, number>()
  const parent = new Map<number | string, number | string>()
  nodeTasks.forEach(t => dist.set(t, 0))

  // Topological order via BFS
  const queue: (number | string)[] = []
  nodeTasks.forEach(t => {
    if (inDegree.get(t) === 0) queue.push(t)
  })

  const topoOrder: (number | string)[] = []
  while (queue.length > 0) {
    const curr = queue.shift()!
    topoOrder.push(curr)
    const dependents = adj.get(curr) ?? []
    dependents.forEach(dep => {
      const newDist = (dist.get(curr) ?? 0) + 1
      if (newDist > (dist.get(dep) ?? 0)) {
        dist.set(dep, newDist)
        parent.set(dep, curr)
      }
      inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1)
      if (inDegree.get(dep) === 0) queue.push(dep)
    })
  }

  // Find node with maximum distance
  let maxDist = 0
  let endNode: number | string = nodeTasks[0]
  nodeTasks.forEach(t => {
    if ((dist.get(t) ?? 0) > maxDist) {
      maxDist = dist.get(t) ?? 0
      endNode = t
    }
  })

  // Reconstruct path
  const path: (number | string)[] = [endNode]
  let curr = endNode
  while (parent.has(curr)) {
    curr = parent.get(curr)!
    path.unshift(curr)
  }

  return { length: maxDist + 1, path }
}

/* ─── DEPENDENCY GRAPH COMPONENT ─── */
interface DependencyGraphProps {
  onNavigateToFinding?: (task: number | string) => void
}

type ViewMode = 'fit' | 'zoom'

export function DependencyGraph({ onNavigateToFinding }: DependencyGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<number | string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isScrolledRight, setIsScrolledRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Check whether the SVG content overflows the scroll container & whether
  // the user has scrolled to the far-right (so we can hide the gradient hint).
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflows = el.scrollWidth > el.clientWidth + 1
    setHasOverflow(overflows)
    if (overflows) {
      setIsScrolledRight(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
    } else {
      setIsScrolledRight(true)
    }
  }, [])

  useEffect(() => {
    checkOverflow()
    // Re-check after fonts/layout settle
    const id = requestAnimationFrame(checkOverflow)
    const id2 = setTimeout(checkOverflow, 250)
    window.addEventListener('resize', checkOverflow)
    return () => {
      cancelAnimationFrame(id)
      clearTimeout(id2)
      window.removeEventListener('resize', checkOverflow)
    }
  }, [checkOverflow, viewMode])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setIsScrolledRight(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
  }, [])

  const NODE_WIDTH = 200
  const NODE_HEIGHT = 62
  const TIER_GAP = 120
  const NODE_GAP_X = 240
  const LEFT_MARGIN = 90  // space for tier labels
  const TOP_MARGIN = 30

  // Tier ordering for layout
  const tierOrder: Tier[] = ['tier0', 'tier1', 'tier2', 'additional', 'deferred']

  // Build dependency graph data (computed once since FINDINGS is static)
  const graphData = (() => {
    // Build dependency edges: from=dependent, to=prerequisite (arrow points from prereq to dependent)
    const edges: DepEdge[] = []
    const findingMap = new Map<number | string, Finding>()
    FINDINGS.forEach(f => {
      findingMap.set(f.task, f)
      const deps = parseDependsOn(f.dependsOn)
      deps.forEach(dep => {
        // edge: Y (prereq) → X (dependent) visually means arrow from Y to X
        // But we store: from=dependent (X), to=prerequisite (Y) for easy lookup
        const isCritical = f.severity === 'critical' || (findingMap.get(dep)?.severity === 'critical')
        edges.push({ from: f.task, to: dep, isCriticalPath: isCritical })
      })
    })

    // Group findings by tier
    const tierGroups = new Map<Tier, Finding[]>()
    tierOrder.forEach(t => tierGroups.set(t, []))
    FINDINGS.forEach(f => {
      tierGroups.get(f.tier)?.push(f)
    })

    // Sort within each tier by severity then task number
    tierOrder.forEach(t => {
      const group = tierGroups.get(t) ?? []
      const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      group.sort((a, b) => {
        const sa = severityOrder[a.severity]
        const sb = severityOrder[b.severity]
        if (sa !== sb) return sa - sb
        return (a.task as number) - (b.task as number)
      })
    })

    // Compute node positions
    const nodes: DepNode[] = []
    tierOrder.forEach((tier, tierIdx) => {
      const group = tierGroups.get(tier) ?? []
      const yBase = TOP_MARGIN + tierIdx * (NODE_HEIGHT + TIER_GAP)
      const startX = LEFT_MARGIN + 20

      group.forEach((f, idx) => {
        nodes.push({
          task: f.task,
          finding: f,
          x: startX + idx * NODE_GAP_X + NODE_WIDTH / 2,
          y: yBase + NODE_HEIGHT / 2,
          tier,
          levelInTier: tierIdx,
        })
      })
    })

    // Compute statistics
    const nodeTasks = FINDINGS.map(f => f.task)
    const inDegree = new Map<number | string, number>()
    const outDegree = new Map<number | string, number>()
    nodeTasks.forEach(t => { inDegree.set(t, 0); outDegree.set(t, 0) })

    edges.forEach(e => {
      outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1)
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    })

    let maxInDegree = 0
    let mostDependedOn: number | string = nodeTasks[0]
    nodeTasks.forEach(t => {
      if ((inDegree.get(t) ?? 0) > maxInDegree) {
        maxInDegree = inDegree.get(t) ?? 0
        mostDependedOn = t
      }
    })

    let maxOutDegree = 0
    let mostDependencies: number | string = nodeTasks[0]
    nodeTasks.forEach(t => {
      if ((outDegree.get(t) ?? 0) > maxOutDegree) {
        maxOutDegree = outDegree.get(t) ?? 0
        mostDependencies = t
      }
    })

    const independenceCount = FINDINGS.filter(f => {
      const deps = parseDependsOn(f.dependsOn)
      return deps.length === 0
    }).length

    const criticalPath = computeCriticalPath(edges, nodeTasks)

    const stats = {
      totalNodes: FINDINGS.length,
      totalEdges: edges.length,
      mostDependedOn: { task: mostDependedOn, degree: maxInDegree },
      mostDependencies: { task: mostDependencies, degree: maxOutDegree },
      independenceCount,
      criticalPath,
    }

    return { nodes, edges, stats, tierGroups }
  })()

  const nodes = graphData.nodes
  const edges = graphData.edges
  const stats = graphData.stats
  const tierGroups = graphData.tierGroups

  // Build node lookup for edge rendering
  const nodeLookup = (() => {
    const map = new Map<number | string, DepNode>()
    nodes.forEach(n => map.set(n.task, n))
    return map
  })()

  // Get connected nodes for hover highlighting
  const getConnectedNodes = (task: number | string): Set<number | string> => {
    const connected = new Set<number | string>()
    connected.add(task)
    edges.forEach(e => {
      if (e.from === task) connected.add(e.to)
      if (e.to === task) connected.add(e.from)
    })
    // Also include transitive: if task depends on Y, also highlight what Y depends on
    edges.forEach(e => {
      if (e.from === task) {
        edges.forEach(e2 => {
          if (e2.from === e.to) connected.add(e2.to)
        })
      }
      if (e.to === task) {
        edges.forEach(e2 => {
          if (e2.to === e.from) connected.add(e2.from)
        })
      }
    })
    return connected
  }

  // SVG dimensions
  const maxNodesInTier = Math.max(...tierOrder.map(t => (tierGroups?.get(t) ?? []).length))
  const svgWidth = LEFT_MARGIN + 20 + maxNodesInTier * NODE_GAP_X + 100
  const svgHeight = TOP_MARGIN + tierOrder.length * (NODE_HEIGHT + TIER_GAP) + 60

  const arrowId = 'dep-arrowhead'
  const arrowIdCritical = 'dep-arrowhead-critical'
  const dotPatternId = 'dot-pattern'

  // Find the task object for stats display
  const mostDependedFinding = FINDINGS.find(f => f.task === stats.mostDependedOn.task)
  const mostDependenciesFinding = FINDINGS.find(f => f.task === stats.mostDependencies.task)

  // Truncate title for node display — show more text since nodes are wider now
  const truncateTitle = (title: string, maxLen: number = 28) => {
    if (title.length <= maxLen) return title
    // Try to break at a natural point (space, dash)
    const trunc = title.slice(0, maxLen)
    const lastSpace = trunc.lastIndexOf(' ')
    if (lastSpace > maxLen * 0.6) {
      return title.slice(0, lastSpace) + '…'
    }
    return trunc + '…'
  }

  // Split title into multiple lines for node display (up to 2 lines)
  const splitTitle = (title: string, maxCharsPerLine: number = 24): string[] => {
    if (title.length <= maxCharsPerLine) return [title]
    const mid = title.lastIndexOf(' ', maxCharsPerLine)
    if (mid > maxCharsPerLine * 0.4) {
      const line1 = title.slice(0, mid)
      const remaining = title.slice(mid + 1)
      if (remaining.length <= maxCharsPerLine) return [line1, remaining]
      return [line1, remaining.slice(0, maxCharsPerLine - 1) + '…']
    }
    return [title.slice(0, maxCharsPerLine - 1) + '…']
  }

  return (
    <div className="space-y-4">
      {/* ─── STATISTICS PANEL ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="glass-card p-4 rounded-lg border border-emerald-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <CircleDot className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground">Total Nodes</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalNodes}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-4 rounded-lg border border-orange-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowRight className="h-4 w-4 text-orange-600" />
            <span className="text-xs text-muted-foreground">Total Edges</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalEdges}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 rounded-lg border border-red-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <Network className="h-4 w-4 text-red-600" />
            <span className="text-xs text-muted-foreground">Most Depended-On</span>
          </div>
          <div className="text-lg font-bold">
            Task {stats.mostDependedOn.task}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {mostDependedFinding?.title ?? ''} ({stats.mostDependedOn.degree} in-degree)
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 rounded-lg border border-amber-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-muted-foreground">Most Dependencies</span>
          </div>
          <div className="text-lg font-bold">
            Task {stats.mostDependencies.task}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {mostDependenciesFinding?.title ?? ''} ({stats.mostDependencies.degree} deps)
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 rounded-lg border border-teal-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-teal-600">{stats.independenceCount}</span> independent
              &bull; path <span className="font-medium text-teal-600">{stats.criticalPath.length}</span>
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Independence = no deps &bull; Critical path = longest chain
          </div>
        </motion.div>
      </div>

      {/* ─── SVG GRAPH ─── */}
      <Card className="border-2 border-emerald-500/20">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-emerald-600" />
                Task Dependency Graph
              </CardTitle>
              <CardDescription className="text-xs">
                Interactive DAG — hover nodes to highlight connections, click to view details. Arrows show dependency direction (prerequisite → dependent).
              </CardDescription>
            </div>
            {/* ─── VIEW MODE TOGGLE ─── */}
            <TooltipProvider delayDuration={250}>
              <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Graph view mode">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'fit' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setViewMode('fit')}
                      aria-pressed={viewMode === 'fit'}
                    >
                      <Maximize className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Fit</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fit graph to container width</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'zoom' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setViewMode('zoom')}
                      aria-pressed={viewMode === 'zoom'}
                    >
                      <Expand className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Zoom</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Render at native size & scroll horizontally</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={`relative ${viewMode === 'zoom' ? 'overflow-x-auto scrollbar-custom pb-2' : 'overflow-hidden'}`}
          >
            <svg
              width={viewMode === 'fit' ? '100%' : svgWidth}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              preserveAspectRatio="xMinYMin meet"
              className="block"
              style={viewMode === 'zoom' ? { minWidth: svgWidth } : undefined}
            >
              {/* ─── DEFINITIONS ─── */}
              <defs>
                {/* Dot grid pattern */}
                <pattern id={dotPatternId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="var(--border)" opacity="0.3" />
                </pattern>

                {/* Normal arrowhead */}
                <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" opacity="0.7" />
                </marker>

                {/* Critical path arrowhead */}
                <marker id={arrowIdCritical} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
                </marker>
              </defs>

              {/* ─── DOT GRID BACKGROUND ─── */}
              <rect x="0" y="0" width={svgWidth} height={svgHeight} fill={`url(#${dotPatternId})`} />

              {/* ─── TIER BANDS ─── */}
              {tierOrder.map((tier, tierIdx) => {
                const yBase = TOP_MARGIN + tierIdx * (NODE_HEIGHT + TIER_GAP)
                return (
                  <g key={`tier-band-${tier}`}>
                    <rect
                      x={LEFT_MARGIN}
                      y={yBase - 10}
                      width={svgWidth - LEFT_MARGIN - 20}
                      height={NODE_HEIGHT + 20}
                      fill={tierBandBg[tier]}
                      rx="6"
                    />
                    {/* Tier label on left */}
                    <text
                      x={LEFT_MARGIN - 8}
                      y={yBase + NODE_HEIGHT / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize="11"
                      fontWeight="700"
                      fill={tierSvgColors[tier]}
                      fontFamily="var(--font-geist-sans)"
                    >
                      {tierLabels[tier].short}
                    </text>
                  </g>
                )
              })}

              {/* ─── DEPENDENCY EDGES ─── */}
              {edges.map((edge, idx) => {
                // Visual direction: arrow from prerequisite (Y/to) → dependent (X/from)
                const prereqNode = nodeLookup.get(edge.to)
                const depNode = nodeLookup.get(edge.from)
                if (!prereqNode || !depNode) return null

                const x1 = prereqNode.x  // start (prerequisite)
                const y1 = prereqNode.y
                const x2 = depNode.x      // end (dependent)
                const y2 = depNode.y

                // Calculate bezier curve control points
                const dx = x2 - x1
                const dy = y2 - y1

                // For horizontal-ish edges (same tier or close tiers)
                let pathD: string
                if (Math.abs(dy) < NODE_HEIGHT) {
                  // Same tier — use a slight arc
                  const midX = (x1 + x2) / 2
                  const arcY = y1 - 25
                  pathD = `M ${x1} ${y1} Q ${midX} ${arcY} ${x2} ${y2}`
                } else {
                  // Different tiers — use S-curve bezier
                  const ctrl1X = x1 + dx * 0.3
                  const ctrl1Y = y1 + dy * 0.5 - 20
                  const ctrl2X = x2 - dx * 0.3
                  const ctrl2Y = y2 - dy * 0.5 + 20
                  pathD = `M ${x1} ${y1} C ${ctrl1X} ${ctrl1Y} ${ctrl2X} ${ctrl2Y} ${x2} ${y2}`
                }

                const connectedNodes = hoveredNode ? getConnectedNodes(hoveredNode) : null
                const isHighlighted = connectedNodes
                  ? connectedNodes.has(edge.from) && connectedNodes.has(edge.to)
                  : false
                const isDimmed = connectedNodes && !isHighlighted

                return (
                  <motion.path
                    key={`edge-${idx}`}
                    d={pathD}
                    fill="none"
                    stroke={edge.isCriticalPath
                      ? (isDimmed ? '#dc262630' : '#dc2626')
                      : (isDimmed ? 'var(--border)' : isHighlighted ? 'var(--foreground)' : 'var(--muted-foreground)')
                    }
                    strokeWidth={edge.isCriticalPath ? 2.5 : isHighlighted ? 2 : 1}
                    strokeDasharray={isDimmed ? '2 4' : 'none'}
                    markerEnd={edge.isCriticalPath ? `url(#${arrowIdCritical})` : `url(#${arrowId})`}
                    opacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.65}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, delay: idx * 0.02 }}
                  />
                )
              })}

              {/* ─── TASK NODES ─── */}
              {nodes.map((node, idx) => {
                const connectedNodes = hoveredNode ? getConnectedNodes(hoveredNode) : null
                const isHovered = hoveredNode === node.task
                const isConnected = connectedNodes ? connectedNodes.has(node.task) : false
                const isDimmed = connectedNodes && !isConnected && !isHovered

                const sevColors = severitySvgColors[node.finding.severity]

                // Node center position
                const cx = node.x
                const cy = node.y
                const rx = NODE_WIDTH / 2
                const ry = NODE_HEIGHT / 2

                return (
                  <motion.g
                    key={`node-${String(node.task)}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: isDimmed ? 0.15 : 1,
                      scale: isHovered ? 1.05 : 1,
                    }}
                    transition={{
                      opacity: { duration: 0.2 },
                      scale: { duration: 0.2 },
                      initial: { duration: 0.4, delay: idx * 0.03 },
                    }}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredNode(node.task)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => onNavigateToFinding?.(node.task)}
                  >
                    {/* Rounded rectangle node with tier-colored background */}
                    <rect
                      x={cx - rx}
                      y={cy - ry}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx="8"
                      ry="8"
                      fill={isHovered ? sevColors.stroke + '30' : tierSvgColors[node.finding.tier] + '12'}
                      stroke={sevColors.stroke}
                      strokeWidth={isHovered ? 3 : 2}
                    />

                    {/* Task number label */}
                    <text
                      x={cx}
                      y={cy - 6}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--foreground)"
                      fontFamily="var(--font-geist-sans)"
                      style={{ pointerEvents: 'none' }}
                    >
                      Task {String(node.task)}
                    </text>

                    {/* Title label — split into up to 2 lines for wider nodes */}
                    {splitTitle(node.finding.title).map((line, li) => {
                      const titleLines = splitTitle(node.finding.title)
                      const lineSpacing = 12
                      const startY = cy + 8 - ((titleLines.length - 1) * lineSpacing) / 2
                      return (
                        <text
                          key={`${String(node.task)}-title-${li}`}
                          x={cx}
                          y={startY + li * lineSpacing}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="9"
                          fontWeight="500"
                          fill="var(--muted-foreground)"
                          fontFamily="var(--font-geist-sans)"
                          style={{ pointerEvents: 'none' }}
                        >
                          {line}
                        </text>
                      )
                    })}

                    {/* Hover tooltip */}
                    {isHovered && (
                      <foreignObject
                        x={cx - 100}
                        y={cy - ry - 80}
                        width={200}
                        height={70}
                        style={{ pointerEvents: 'none' }}
                      >
                        <div className="bg-background border border-border rounded-md p-2 shadow-lg text-xs">
                          <div className="font-semibold truncate">Task {node.task}: {node.finding.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0"
                              style={{ borderColor: sevColors.stroke, color: sevColors.stroke }}
                            >
                              {sevColors.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0"
                              style={{ borderColor: tierSvgColors[node.finding.tier], color: tierSvgColors[node.finding.tier] }}
                            >
                              {tierLabels[node.finding.tier].short}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Depends on: {node.finding.dependsOn}
                          </div>
                        </div>
                      </foreignObject>
                    )}
                  </motion.g>
                )
              })}
            </svg>
            {/* ─── SCROLL HINT GRADIENT (Zoom mode only, when overflow & not at far right) ─── */}
            {viewMode === 'zoom' && hasOverflow && !isScrolledRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-background via-background/80 to-transparent"
              />
            )}
          </div>

          {/* ─── LEGEND ─── */}
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground mt-3 pt-3 border-t">
            <span className="font-semibold uppercase tracking-wider mr-1">Legend:</span>
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => (
              <span key={s} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded" style={{
                  backgroundColor: severitySvgColors[s].fill,
                  borderColor: severitySvgColors[s].stroke,
                  borderWidth: '2px',
                }} />
                {severityConfig[s].label}
              </span>
            ))}
            <span className="flex items-center gap-1 ml-2">
              <svg width="24" height="10" className="inline">
                <line x1="0" y1="5" x2="16" y2="5" stroke="var(--muted-foreground)" strokeWidth="1.5" />
                <polygon points="16,2 24,5 16,8" fill="var(--muted-foreground)" opacity="0.7" />
              </svg>
              Normal dependency
            </span>
            <span className="flex items-center gap-1">
              <svg width="24" height="10" className="inline">
                <line x1="0" y1="5" x2="16" y2="5" stroke="#dc2626" strokeWidth="2.5" />
                <polygon points="16,2 24,5 16,8" fill="#dc2626" />
              </svg>
              Critical path
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
