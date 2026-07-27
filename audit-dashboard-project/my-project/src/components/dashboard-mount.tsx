'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// This is the ONLY client component that the layout imports.
// It's extremely lightweight (just a useState + dynamic import),
// so the server only needs to compile this tiny file, not the
// massive 945-line dashboard-client.tsx or its 20+ sub-components.

const DashboardClient = dynamic(
  () => import('@/components/dashboard-client').then(m => m.DashboardClient),
  { ssr: false },
)

export function DashboardMount() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <div className="text-muted-foreground text-sm">
            Loading audit dashboard...
          </div>
        </div>
      </div>
    )
  }

  return <DashboardClient />
}
