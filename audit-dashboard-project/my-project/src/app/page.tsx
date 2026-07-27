// No server-side data fetching — all data is fetched client-side via API.
// The ClientOnlyDashboard uses dynamic import with ssr:false, so the
// server only renders a loading placeholder (tiny HTML). The heavy
// dashboard component loads entirely on the client.
import { ClientOnlyDashboard } from '@/components/client-only-dashboard'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return <ClientOnlyDashboard />
}
