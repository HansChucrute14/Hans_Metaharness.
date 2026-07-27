import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActiveProjectId, invalidateActiveProjectCache } from '@/lib/get-active-project'

// ── Project Management API ──
// Multi-project support: list, create, set active, delete projects.

// GET: List all projects with finding counts + active project info
export async function GET(request: NextRequest) {
  try {
    const projects = await db.project.findMany({
      include: {
        _count: { select: { findings: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const activeId = await getActiveProjectId(request)

    const result = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      repoOwner: p.repoOwner,
      repoName: p.repoName,
      isActive: p.isActive,
      isCurrentActive: p.id === activeId,
      findingCount: p._count.findings,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    return NextResponse.json({
      projects: result,
      activeProjectId: activeId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list projects'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Create a new project with name, repoOwner, repoName, description.
// Auto-seeds default configs for the new project.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, repoOwner, repoName, description } = body as {
      name: string
      repoOwner: string
      repoName: string
      description?: string
    }

    if (!name || !repoOwner || !repoName) {
      return NextResponse.json(
        { error: 'name, repoOwner, and repoName are required' },
        { status: 400 }
      )
    }

    const project = await db.project.create({
      data: {
        name,
        repoOwner,
        repoName,
        description: description ?? '',
        isActive: true,
      },
    })

    // Auto-seed default configs for the new project
    const defaultConfigs = [
      { key: 'severity_levels', value: JSON.stringify({
        critical: { label: 'Critical', weight: 4, color: '#dc2626', border: 'border-red-600' },
        high:     { label: 'High',     weight: 3, color: '#f97316', border: 'border-orange-500' },
        medium:   { label: 'Medium',   weight: 2, color: '#eab308', border: 'border-yellow-500' },
        low:      { label: 'Low',      weight: 1, color: '#6b7280', border: 'border-gray-500' },
      })},
      { key: 'tier_labels', value: JSON.stringify({
        tier0:      { short: 'T0', full: 'Tier 0 — Immediate Threats', color: 'text-red-600', weight: 3 },
        tier1:      { short: 'T1', full: 'Tier 1 — Data Integrity',     color: 'text-orange-600', weight: 2 },
        tier2:      { short: 'T2', full: 'Tier 2 — Quality & UX',       color: 'text-yellow-600', weight: 1 },
        deferred:   { short: 'Def', full: 'Deferred',                    color: 'text-gray-500', weight: 0 },
        additional: { short: 'Add', full: 'Additional Findings',         color: 'text-gray-400', weight: 0 },
      })},
      { key: 'categories', value: JSON.stringify([
        'Data Integrity', 'Input Validation', 'Algorithm Logic', 'Error Handling',
        'Security', 'Performance', 'UX/Accessibility', 'Code Quality',
        'Compliance', 'Documentation', 'Testing', 'Configuration',
        'Dependency', 'Type Safety', 'State Management', 'Internationalization',
      ])},
      { key: 'audit_statuses', value: JSON.stringify({
        'not-started':   { label: 'Not Started', color: 'text-gray-500', bg: 'bg-gray-500/10', icon: 'Circle' },
        'in-progress':   { label: 'In Progress', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: 'LoaderCircle' },
        'fixed':         { label: 'Fixed',       color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: 'CheckCircle2' },
        'wont-fix':      { label: 'Won\'t Fix',  color: 'text-red-500', bg: 'bg-red-500/10', icon: 'XCircle' },
      })},
      { key: 'verification_statuses', value: JSON.stringify({
        'confirmed-execution':         { label: 'Confirmed (Execution)',         color: 'text-emerald-600', badge: 'bg-emerald-500' },
        'confirmed-reading':           { label: 'Confirmed (Code Reading)',      color: 'text-teal-600', badge: 'bg-teal-500' },
        'confirmed-logical':           { label: 'Confirmed (Logical Derivation)', color: 'text-violet-600', badge: 'bg-violet-500' },
        'needs-execution-confirmation': { label: 'Needs Execution Confirmation', color: 'text-orange-600', badge: 'bg-orange-500' },
        'partial':                     { label: 'Partially Verified',            color: 'text-yellow-600', badge: 'bg-yellow-500' },
      })},
      { key: 'effort_levels', value: JSON.stringify({
        low:    { label: 'Low Effort',    hours: '< 2h',   color: 'text-emerald-600' },
        medium: { label: 'Medium Effort', hours: '2-8h',   color: 'text-amber-600' },
        high:   { label: 'High Effort',   hours: '> 8h',   color: 'text-red-600' },
      })},
      { key: 'risk_levels', value: JSON.stringify({
        low:    { label: 'Low Risk',    reversible: 'Easily reversible',  color: 'text-emerald-600' },
        medium: { label: 'Medium Risk', reversible: 'Partially reversible', color: 'text-amber-600' },
        high:   { label: 'High Risk',   reversible: 'Hard to reverse',    color: 'text-red-600' },
      })},
      { key: 'module_ids', value: JSON.stringify({
        nutrient_report:  { title: 'Nutrient Report Module', short: 'NR' },
        module_integrity: { title: 'Module Integrity', short: 'MI' },
        growth_model:     { title: 'Growth Model Fix', short: 'GM' },
        scenario_engine:  { title: 'Scenario Engine', short: 'SE' },
      })},
      { key: 'repo_info', value: JSON.stringify({
        owner: repoOwner,
        name: repoName,
        url: `https://github.com/${repoOwner}/${repoName}`,
        description: '',
      })},
      { key: 'narrative_templates', value: JSON.stringify({})},
      { key: 'export_templates', value: JSON.stringify({})},
      { key: 'g3_blocked', value: JSON.stringify([])},
    ]

    const seedPromises = defaultConfigs.map(dc =>
      db.auditConfig.create({
        data: {
          key: dc.key,
          value: dc.value,
          isDefault: true,
          projectId: project.id,
        },
      })
    )
    await Promise.all(seedPromises)

    // Seed default GitHub configs for the new project
    const githubDefaults = [
      { key: 'repo_owner', value: repoOwner },
      { key: 'repo_name', value: repoName },
    ]
    const githubSeedPromises = githubDefaults.map(gc =>
      db.gitHubConfig.create({
        data: {
          key: gc.key,
          value: gc.value,
          projectId: project.id,
        },
      })
    )
    await Promise.all(githubSeedPromises)

    // Invalidate cache since we just created a project
    invalidateActiveProjectCache()

    return NextResponse.json({ project }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT: Set active project by upserting AuditConfig key `active_project`
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId } = body as { projectId: string }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Verify the project exists
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 })
    }

    // Upsert the active_project config
    // Need to determine which project's AuditConfig to store this under.
    // We store the active_project config in the target project's own AuditConfig.
    await db.auditConfig.upsert({
      where: { projectId_key: { projectId, key: 'active_project' } },
      update: {
        value: JSON.stringify(projectId),
        updatedAt: new Date(),
      },
      create: {
        key: 'active_project',
        value: JSON.stringify(projectId),
        isDefault: false,
        projectId,
      },
    })

    // Invalidate cache so new active project is picked up immediately
    invalidateActiveProjectCache()

    return NextResponse.json({
      activeProjectId: projectId,
      project: { id: project.id, name: project.name },
      message: `Active project set to "${project.name}"`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set active project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: Delete a project by ID (with cascade)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId query parameter is required' }, { status: 400 })
    }

    // Verify the project exists before deleting
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: `Project "${projectId}" not found` }, { status: 404 })
    }

    // Delete with cascade (Prisma onDelete: Cascade handles related records)
    await db.project.delete({ where: { id: projectId } })

    // Invalidate cache since active project might have changed
    invalidateActiveProjectCache()

    return NextResponse.json({
      deleted: true,
      projectId,
      projectName: project.name,
      message: `Project "${project.name}" and all related data deleted`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
