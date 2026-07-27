/* Default configuration values for the audit system.
 *
 * These are the same values as in /api/config/route.ts DEFAULT_CONFIGS,
 * but presented in FLAT format (not wrapped in {value, isDefault}).
 *
 * Used as `placeholderData` in the useAuditConfig TanStack Query hook,
 * so the UI renders immediately with sensible defaults before the
 * API response arrives.
 */

export const DEFAULT_CONFIGS = {
  severity_levels: {
    critical: { label: 'Critical', weight: 4, color: '#dc2626', border: 'border-red-600' },
    high:     { label: 'High',     weight: 3, color: '#f97316', border: 'border-orange-500' },
    medium:   { label: 'Medium',   weight: 2, color: '#eab308', border: 'border-yellow-500' },
    low:      { label: 'Low',      weight: 1, color: '#6b7280', border: 'border-gray-500' },
  },
  tier_labels: {
    tier0:      { short: 'T0', full: 'Tier 0 — Immediate Threats', color: 'text-red-600', weight: 3 },
    tier1:      { short: 'T1', full: 'Tier 1 — Data Integrity',     color: 'text-orange-600', weight: 2 },
    tier2:      { short: 'T2', full: 'Tier 2 — Quality & UX',       color: 'text-yellow-600', weight: 1 },
    deferred:   { short: 'Def', full: 'Deferred',                    color: 'text-gray-500', weight: 0 },
    additional: { short: 'Add', full: 'Additional Findings',         color: 'text-gray-400', weight: 0 },
  },
  categories: [
    'Data Integrity', 'Input Validation', 'Algorithm Logic', 'Error Handling',
    'Security', 'Performance', 'UX/Accessibility', 'Code Quality',
    'Compliance', 'Documentation', 'Testing', 'Configuration',
    'Dependency', 'Type Safety', 'State Management', 'Internationalization',
  ],
  audit_statuses: {
    'not-started':   { label: 'Not Started', color: 'text-gray-500', bg: 'bg-gray-500/10', icon: 'Circle' },
    'in-progress':   { label: 'In Progress', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: 'LoaderCircle' },
    'fixed':         { label: 'Fixed',       color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: 'CheckCircle2' },
    'wont-fix':      { label: "Won't Fix",   color: 'text-red-500', bg: 'bg-red-500/10', icon: 'XCircle' },
  },
  verification_statuses: {
    'confirmed-execution':         { label: 'Confirmed (Execution)',         color: 'text-emerald-600', badge: 'bg-emerald-500' },
    'confirmed-reading':           { label: 'Confirmed (Code Reading)',      color: 'text-teal-600', badge: 'bg-teal-500' },
    'confirmed-logical':           { label: 'Confirmed (Logical Derivation)', color: 'text-violet-600', badge: 'bg-violet-500' },
    'needs-execution-confirmation': { label: 'Needs Execution Confirmation', color: 'text-orange-600', badge: 'bg-orange-500' },
    'partial':                     { label: 'Partially Verified',            color: 'text-yellow-600', badge: 'bg-yellow-500' },
  },
  effort_levels: {
    low:    { label: 'Low Effort',    hours: '< 2h',   color: 'text-emerald-600' },
    medium: { label: 'Medium Effort', hours: '2-8h',   color: 'text-amber-600' },
    high:   { label: 'High Effort',   hours: '> 8h',   color: 'text-red-600' },
  },
  risk_levels: {
    low:    { label: 'Low Risk',    reversible: 'Easily reversible',    color: 'text-emerald-600' },
    medium: { label: 'Medium Risk', reversible: 'Partially reversible', color: 'text-amber-600' },
    high:   { label: 'High Risk',   reversible: 'Hard to reverse',     color: 'text-red-600' },
  },
  module_ids: {
    nutrient_report:  { title: 'Nutrient Report Module', short: 'NR' },
    module_integrity: { title: 'Module Integrity', short: 'MI' },
    growth_model:     { title: 'Growth Model Fix', short: 'GM' },
    scenario_engine:  { title: 'Scenario Engine', short: 'SE' },
  },
  repo_info: {
    owner: '',
    name: '',
    url: '',
    description: '',
  },
  g3_blocked: [
    { task: '6', title: 'Absolute calcium and phosphorus ceilings', canShipNow: 'Mechanism: computed ceiling from DER envelope', needsReview: 'Values: Ca/P g/1000kcal ceilings need AAFCO + veterinary review' },
    { task: '7', title: 'Fix growth-energy model and scenario labels', canShipNow: 'Mechanism: age-banded schedule structure + label swap', needsReview: 'Values: k-multipliers per age band need NRC 2006 + veterinary review' },
  ],
  narrative_templates: {
    executive_summary: '{projectName}: {criticalCount} critical, {highCount} high severity findings across {totalFindings} issues.',
    finding_detail: 'Task {task}: {title} — {severityLabel} ({tierLabel})',
  },
  export_templates: {
    csv: 'task,title,severity,tier,category,verification',
    markdown: '# {projectName} Audit Report\n\n## Summary\n{summary}\n\n## Findings\n{findings}',
  },
  active_project: '',
} as const
