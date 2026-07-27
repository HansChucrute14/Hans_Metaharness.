'use client'

import dynamic from 'next/dynamic'
import { ProjectProvider } from '@/lib/project-context'

/* ─── SSR-BYPASS: load the entire DashboardClient on the client only ──
 * The dashboard was being OOM-killed during SSR because the ~2690-line
 * client component (plus 20+ sub-components, recharts, framer-motion)
 * consumed ~2 GB of server memory.  By using `ssr: false` here, the
 * server only sends a loading placeholder — the heavy component tree
 * loads and renders entirely on the client. The client then fetches
 * data from API routes (/api/findings, /api/findings/modules, etc.)
 * instead of receiving it as SSR props, which eliminates the need for
 * the server to compile or serialize any data at all. */
const DashboardClient = dynamic(
  () => import('@/components/dashboard-client').then(m => m.DashboardClient),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <div className="text-muted-foreground text-sm">
            Loading audit dashboard...
          </div>
        </div>
      </div>
    ),
  },
)

export function ClientOnlyDashboard() {
  return (
    <ProjectProvider>
      <DashboardClient />
    </ProjectProvider>
  )
}
