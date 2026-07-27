import { db } from '../src/lib/db'
import {
  FINDINGS,
  BEST_PROPOSAL_ANALYSIS,
  UNIFIED_EXECUTION_MODULES,
  ELEGANT_INSIGHT,
} from '../src/lib/audit-data'

// Default project ID — used as seed value and fallback
const DEFAULT_PROJECT_ID = 'default-project'

async function main() {
  console.log('Seeding database...')

  // 0. Create default project FIRST (all other entities reference it)
  const defaultProject = await db.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    update: {
      name: 'Hans-GSD-Raw-Calculator',
      description: 'GSD dog diet formulation tool using linear programming',
      repoOwner: 'HansChucrte14',
      repoName: 'Hans-GSD-Raw-Calculator',
      isActive: true,
    },
    create: {
      id: DEFAULT_PROJECT_ID,
      name: 'Hans-GSD-Raw-Calculator',
      description: 'GSD dog diet formulation tool using linear programming',
      repoOwner: 'HansChucrte14',
      repoName: 'Hans-GSD-Raw-Calculator',
      isActive: true,
    },
  })
  console.log(`✅ Created default project: ${defaultProject.id}`)

  // 1. Seed unified execution modules (no projectId — global entities)
  const elegantSolutionMap: Record<string, string> = {
    nutrient_report: ELEGANT_INSIGHT,
    module_integrity: UNIFIED_EXECUTION_MODULES.find(m => m.id === 'module_integrity')?.keyInsight ?? '',
    lp_solver_refactor: UNIFIED_EXECUTION_MODULES.find(m => m.id === 'lp_solver_refactor')?.keyInsight ?? '',
    pipeline_integrity: UNIFIED_EXECUTION_MODULES.find(m => m.id === 'pipeline_integrity')?.keyInsight ?? '',
    data_integrity: UNIFIED_EXECUTION_MODULES.find(m => m.id === 'data_integrity')?.keyInsight ?? '',
  }

  for (const mod of UNIFIED_EXECUTION_MODULES) {
    await db.unifiedExecutionModule.upsert({
      where: { id: mod.id },
      update: {
        title: mod.title,
        subtitle: mod.subtitle,
        coreIdea: mod.coreIdea,
        addresses: JSON.stringify(mod.addresses),
        fixes: JSON.stringify(mod.fixes),
        effort: mod.effort,
        risk: mod.risk,
        keyInsight: mod.keyInsight,
        elegantSolution: elegantSolutionMap[mod.id] ?? mod.keyInsight,
      },
      create: {
        id: mod.id,
        title: mod.title,
        subtitle: mod.subtitle,
        coreIdea: mod.coreIdea,
        addresses: JSON.stringify(mod.addresses),
        fixes: JSON.stringify(mod.fixes),
        effort: mod.effort,
        risk: mod.risk,
        keyInsight: mod.keyInsight,
        elegantSolution: elegantSolutionMap[mod.id] ?? mod.keyInsight,
      },
    })
  }
  console.log(`✅ Seeded ${UNIFIED_EXECUTION_MODULES.length} unified execution modules`)

  // 2. Seed findings with projectId = default project
  // Map from task → finding.id (needed for BestProposalAnalysis and AuditNote findingId FK)
  const taskIdToFindingId: Record<string, string> = {}

  for (const f of FINDINGS) {
    const taskStr = String(f.task)
    const analysis = BEST_PROPOSAL_ANALYSIS[f.task]

    // Note: we can't use upsert with `where: { task }` anymore since task is not @unique
    // We use composite unique: { projectId_task: { projectId, task } }
    const finding = await db.finding.upsert({
      where: { projectId_task: { projectId: DEFAULT_PROJECT_ID, task: taskStr } },
      update: {
        title: f.title,
        tier: f.tier,
        severity: f.severity,
        category: f.category,
        summary: f.summary,
        claim: f.claim,
        evidence: f.evidence,
        verificationStatus: f.verificationStatus,
        verificationNote: f.verificationNote ?? null,
        dependsOn: f.dependsOn,
        findingIds: JSON.stringify(f.findingIds),
        affectedFiles: JSON.stringify(f.affectedFiles),
        unifiedModuleId: analysis?.unifiedModuleId ?? null,
      },
      create: {
        task: taskStr,
        findingIds: JSON.stringify(f.findingIds),
        title: f.title,
        tier: f.tier,
        severity: f.severity,
        category: f.category,
        summary: f.summary,
        claim: f.claim,
        evidence: f.evidence,
        verificationStatus: f.verificationStatus,
        verificationNote: f.verificationNote ?? null,
        dependsOn: f.dependsOn,
        affectedFiles: JSON.stringify(f.affectedFiles),
        unifiedModuleId: analysis?.unifiedModuleId ?? null,
        projectId: DEFAULT_PROJECT_ID,
      },
    })

    taskIdToFindingId[taskStr] = finding.id

    // 3. Seed proposals for this finding
    await db.proposal.deleteMany({ where: { findingId: finding.id } })
    for (let i = 0; i < f.proposals.length; i++) {
      const p = f.proposals[i]
      await db.proposal.create({
        data: {
          findingId: finding.id,
          index: i,
          title: p.title,
          description: p.description,
          effort: p.effort,
          risk: p.risk,
          reversible: p.reversible,
        },
      })
    }

    // 4. Seed code snippets
    await db.codeSnippet.deleteMany({ where: { findingId: finding.id } })
    if (f.codeSnippets) {
      for (const s of f.codeSnippets) {
        await db.codeSnippet.create({
          data: {
            findingId: finding.id,
            file: s.file,
            lines: s.lines,
            language: s.language,
            code: s.code,
          },
        })
      }
    }
  }
  console.log(`✅ Seeded ${FINDINGS.length} findings with proposals and code snippets`)

  // 5. Seed best proposal analyses — now using findingId FK instead of task FK
  await db.bestProposalAnalysis.deleteMany()

  for (const [task, analysis] of Object.entries(BEST_PROPOSAL_ANALYSIS)) {
    const taskStr = String(task)
    const findingId = taskIdToFindingId[taskStr]

    if (!findingId) {
      console.warn(`⚠️ Skipping BestProposalAnalysis for task ${taskStr}: no matching Finding found`)
      continue
    }

    await db.bestProposalAnalysis.create({
      data: {
        findingId: findingId,  // cuid-based FK — always unique regardless of project scope
        bestSoloIndex: analysis.bestSoloIndex,
        bestSoloReason: analysis.bestSoloReason,
        hybridNote: analysis.hybridNote ?? null,
        unifiedModuleId: analysis.unifiedModuleId ?? null,
      },
    })
  }
  console.log(`✅ Seeded ${Object.keys(BEST_PROPOSAL_ANALYSIS).length} best proposal analyses`)

  // 6. Seed default audit configs for the default project
  const defaultConfigs: Record<string, object> = {
    active_project: {
      projectId: DEFAULT_PROJECT_ID,
      projectName: 'Hans-GSD-Raw-Calculator',
    },
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
    g3_blocked: [
      { task: '6', title: 'Absolute calcium and phosphorus ceilings', canShipNow: 'Mechanism: computed ceiling from DER envelope', needsReview: 'Values: Ca/P g/1000kcal ceilings need AAFCO + veterinary review' },
      { task: '7', title: 'Fix growth-energy model and scenario labels', canShipNow: 'Mechanism: age-banded schedule structure + label swap', needsReview: 'Values: k-multipliers per age band need NRC 2006 + veterinary review' },
    ],
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
  }

  for (const [key, value] of Object.entries(defaultConfigs)) {
    await db.auditConfig.upsert({
      where: { projectId_key: { projectId: DEFAULT_PROJECT_ID, key } },
      update: {
        value: JSON.stringify(value),
        isDefault: true,
      },
      create: {
        key,
        value: JSON.stringify(value),
        isDefault: true,
        projectId: DEFAULT_PROJECT_ID,
      },
    })
  }
  console.log(`✅ Seeded ${Object.keys(defaultConfigs).length} default audit configs`)

  console.log('🎉 Seed complete!')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
