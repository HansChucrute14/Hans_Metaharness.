'use client'

import { useQuery } from '@tanstack/react-query'
import { useProject } from '@/lib/project-context'
import { DEFAULT_CONFIGS } from '@/lib/audit-defaults'

// ── AuditConfigData interface (flat config structure) ──
// This is what useAuditConfig returns — a flat object where each key
// maps directly to its config value (not wrapped in {value, isDefault}).
// The API returns {configs: {key: {value, isDefault}}} and we flatten
// it to {key: value} for easier consumption by UI components.

export interface AuditConfigData {
  severity_levels: Record<string, { label: string; weight: number; color: string; border: string }>
  tier_labels: Record<string, { short: string; full: string; color: string; weight: number }>
  categories: string[]
  audit_statuses: Record<string, { label: string; color: string; bg: string; icon: string }>
  verification_statuses: Record<string, { label: string; color: string; badge: string }>
  effort_levels: Record<string, { label: string; hours: string; color: string }>
  risk_levels: Record<string, { label: string; reversible: string; color: string }>
  module_ids: Record<string, { title: string; short: string }>
  repo_info: { owner: string; name: string; url: string; description: string }
  g3_blocked: Array<{ task: string; title: string; canShipNow: string; needsReview: string }>
  narrative_templates: Record<string, string>
  export_templates: Record<string, string>
  active_project: string
}

// ── Flattening helper ──
// API response shape: { configs: { severity_levels: { value: {...}, isDefault: true }, ... } }
// Desired shape:      { severity_levels: {...}, tier_labels: {...}, ... }

function flattenConfigResponse(
  raw: Record<string, { value: object; isDefault: boolean }>
): AuditConfigData {
  const flat: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(raw)) {
    flat[key] = entry.value
  }
  return flat as unknown as AuditConfigData
}

// ── TanStack Query hook ──

export function useAuditConfig() {
  const { activeProjectId } = useProject()

  return useQuery<AuditConfigData>({
    queryKey: ['audit-config', activeProjectId],
    queryFn: async () => {
      const url = activeProjectId
        ? `/api/config?projectId=${activeProjectId}`
        : '/api/config'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch audit config')
      const json = await res.json()

      // The API returns { configs: {key: {value, isDefault}} }
      if (json.configs && typeof json.configs === 'object') {
        return flattenConfigResponse(json.configs)
      }

      // Fallback: if the API returned a single key query
      // (shouldn't happen with our hook, but just in case)
      return DEFAULT_CONFIGS as unknown as AuditConfigData
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: DEFAULT_CONFIGS as unknown as AuditConfigData,
  })
}
