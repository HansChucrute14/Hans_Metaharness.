import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { readFileSync, statSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

const PROJECT_DIR = '/home/z/my-project'
const ZIP_PATH = '/home/z/my-project-download.zip'

export async function GET() {
  try {
    // Remove old zip if exists
    if (existsSync(ZIP_PATH)) {
      unlinkSync(ZIP_PATH)
    }

    // Create a fresh zip of the entire project, excluding build artifacts and git history
    const excludeList = [
      'node_modules/*',
      '.next/*',
      '.git/*',
      'skills/*',
      'download/*',
      'tool-results/*',
      '*.png',
      'upload/*',
      'tests/*',
      'agent-ctx/*',
      'examples/*',
      'dev.log',
    ].map(e => `-x "${e}"`).join(' ')

    execSync(`cd /home/z && zip -r ${ZIP_PATH} my-project/ ${excludeList}`, {
      timeout: 60_000,
      stdio: 'pipe',
    })

    const zipStats = statSync(ZIP_PATH)
    const zipBuffer = readFileSync(ZIP_PATH)

    // Clean up after reading
    unlinkSync(ZIP_PATH)

    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `audit-dashboard-project-${timestamp}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipStats.size),
      },
    })
  } catch (error) {
    console.error('Download zip error:', error)
    return NextResponse.json(
      { error: 'Failed to create project archive', details: String(error) },
      { status: 500 }
    )
  }
}
