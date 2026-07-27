import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActiveProjectId } from '@/lib/get-active-project'

// ── Adaptive Audit Configuration API ──
// Instead of hardcoding categories, severities, tiers, statuses, etc.,
// store them in AuditConfig table so users can customize their audit framework.
// This makes the system future-proof and adaptive.

// Known template variables for narrative_templates and export_templates validation
const KNOWN_TEMPLATE_VARS = new Set([
  'task', 'title', 'severity', 'tier', 'category', 'claim', 'evidence',
  'verificationStatus', 'verificationNote', 'dependsOn', 'affectedFiles',
  'findingIds', 'summary', 'proposalCount', 'moduleTitle', 'moduleSubtitle',
  'repoOwner', 'repoName', 'repoUrl', 'projectName', 'projectId',
])

// Default configurations (these serve as fallbacks when DB has no entries)
const DEFAULT_CONFIGS: Record<string, object> = {
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
    'wont-fix':      { label: 'Won\'t Fix',  color: 'text-red-500', bg: 'bg-red-500/10', icon: 'XCircle' },
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
    low:    { label: 'Low Risk',    reversible: 'Easily reversible',  color: 'text-emerald-600' },
    medium: { label: 'Medium Risk', reversible: 'Partially reversible', color: 'text-amber-600' },
    high:   { label: 'High Risk',   reversible: 'Hard to reverse',    color: 'text-red-600' },
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
  narrative_templates: {
    finding_header: '{task}: {title} — {severity} ({tier})',
    finding_summary: '{claim}\nEvidence: {evidence}\nFiles: {affectedFiles}',
    proposal_card: '{title} — Effort: {effort}, Risk: {risk}',
    module_header: '{id}: {title} — {subtitle}',
    module_coverage: '{coreIdea}\nFixes: {fixes}',
    ai_prompt_prefix: 'Analyze the following finding for the {repoName} project:',
    github_issue_title: '{repoName} Audit: {task} — {title}',
    github_issue_body: '**Severity**: {severity}\n**Tier**: {tier}\n**Category**: {category}\n\n{claim}\n\n**Evidence**: {evidence}\n\n**Affected Files**: {affectedFiles}',
  },
  export_templates: {
    csv_columns: ['task', 'title', 'severity', 'tier', 'category', 'summary', 'verificationStatus', 'affectedFiles'],
    csv_headers: ['Task', 'Title', 'Severity', 'Tier', 'Category', 'Summary', 'Verification', 'Files'],
    markdown_sections: ['header', 'summary_table', 'findings_detail', 'module_summary', 'g3_blocked'],
    json_fields: ['task', 'title', 'severity', 'tier', 'category', 'summary', 'claim', 'evidence', 'affectedFiles', 'proposals'],
  },
  g3_blocked: [
    { task: '6', title: 'Absolute calcium and phosphorus ceilings', canShipNow: 'Mechanism: computed ceiling from DER envelope', needsReview: 'Values: Ca/P g/1000kcal ceilings need AAFCO + veterinary review' },
    { task: '7', title: 'Fix growth-energy model and scenario labels', canShipNow: 'Mechanism: age-banded schedule structure + label swap', needsReview: 'Values: k-multipliers per age band need NRC 2006 + veterinary review' },
  ],
  active_project: { projectId: '', projectName: '' },
}

// Validate template variable references in narrative_templates and export_templates
function validateTemplateVars(key: string, value: object): string[] | null {
  if (key !== 'narrative_templates' && key !== 'export_templates') {
    return null // No validation needed for other config keys
  }

  const valueStr = JSON.stringify(value)
  // Find all {variable} references in the template
  const varPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  const unknownVars: string[] = []
  let match: RegExpExecArray | null

  while ((match = varPattern.exec(valueStr)) !== null) {
    const varName = match[1]
    if (!KNOWN_TEMPLATE_VARS.has(varName)) {
      unknownVars.push(varName)
    }
  }

  return unknownVars.length > 0 ? unknownVars : null
}

// GET: Retrieve audit configuration (from DB or defaults)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const projectId = await getActiveProjectId(request)

  if (key && projectId) {
    // Return specific config key using composite unique
    const dbConfig = await db.auditConfig.findUnique({
      where: { projectId_key: { projectId, key } },
    })
    if (dbConfig) {
      return NextResponse.json({
        key,
        value: JSON.parse(dbConfig.value),
        isDefault: dbConfig.isDefault,
      })
    }
    // Fall back to hardcoded defaults
    const defaultValue = DEFAULT_CONFIGS[key]
    if (!defaultValue) {
      return NextResponse.json({ error: `Unknown config key: ${key}` }, { status: 404 })
    }
    return NextResponse.json({ key, value: defaultValue, isDefault: true })
  }

  // Return all configs (from DB, merging with defaults)
  const whereClause = projectId ? { projectId } : {}
  const dbConfigs = await db.auditConfig.findMany({ where: whereClause })
  const result: Record<string, { value: object; isDefault: boolean }> = {}

  // Start with defaults
  for (const [k, v] of Object.entries(DEFAULT_CONFIGS)) {
    result[k] = { value: v, isDefault: true }
  }

  // Override with DB values
  for (const config of dbConfigs) {
    result[config.key] = { value: JSON.parse(config.value), isDefault: config.isDefault }
  }

  // Inject dynamic repo_info and active_project from the Project record
  const projectRecord = projectId ? await db.project.findUnique({ where: { id: projectId } }) : null
  if (projectRecord) {
    result.repo_info = {
      value: {
        owner: projectRecord.repoOwner ?? '',
        name: projectRecord.repoName ?? '',
        url: `https://github.com/${projectRecord.repoOwner ?? ''}/${projectRecord.repoName ?? ''}`,
        description: projectRecord.description ?? '',
      },
      isDefault: false,
    }
    result.active_project = {
      value: { projectId: projectRecord.id, projectName: projectRecord.name },
      isDefault: false,
    }
  }

  return NextResponse.json({ configs: result })
}

// PUT: Update a configuration value (custom override)
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { key, value, projectId } = body as { key: string; value: object; projectId?: string }

  if (!key || !value) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }

  // Validate that the key exists in defaults
  if (!DEFAULT_CONFIGS[key]) {
    return NextResponse.json({ error: `Unknown config key: ${key}. Available keys: ${Object.keys(DEFAULT_CONFIGS).join(', ')}` }, { status: 400 })
  }

  // Template validation for narrative_templates and export_templates
  const invalidVars = validateTemplateVars(key, value)
  if (invalidVars) {
    return NextResponse.json({
      error: `Template contains unknown variable references: ${invalidVars.join(', ')}. Known variables: ${Array.from(KNOWN_TEMPLATE_VARS).join(', ')}`,
    }, { status: 400 })
  }

  const activeId = projectId ?? await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  try {
    const config = await db.auditConfig.upsert({
      where: { projectId_key: { projectId: activeId, key } },
      update: {
        value: JSON.stringify(value),
        isDefault: false,  // User-modified configs are not default
        updatedAt: new Date(),
      },
      create: {
        key,
        value: JSON.stringify(value),
        isDefault: false,
        projectId: activeId,
      },
    })

    return NextResponse.json({ config: { key, value, isDefault: false, projectId: activeId } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: Remove a custom config override (revert to default)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  const projectId = await getActiveProjectId(request)

  if (!key) {
    return NextResponse.json({ error: 'key parameter is required' }, { status: 400 })
  }

  if (!projectId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  try {
    await db.auditConfig.delete({
      where: { projectId_key: { projectId, key } },
    })
    return NextResponse.json({
      deleted: true,
      revertedTo: DEFAULT_CONFIGS[key] ?? null,
      message: `Config "${key}" reverted to default`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Reset all configs to defaults for a specific project
export async function POST(request: NextRequest) {
  const projectId = await getActiveProjectId(request)
  if (!projectId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  try {
    await db.auditConfig.deleteMany({ where: { projectId } })

    // Seed the defaults into the DB for this project
    const seedPromises = Object.entries(DEFAULT_CONFIGS).map(([key, value]) =>
      db.auditConfig.create({
        data: { key, value: JSON.stringify(value), isDefault: true, projectId },
      })
    )
    await Promise.all(seedPromises)

    return NextResponse.json({
      reset: true,
      seeded: Object.keys(DEFAULT_CONFIGS).length,
      projectId,
      message: 'All configs reset to defaults and seeded into DB for active project',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reset configs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
