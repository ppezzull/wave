// POST /api/emit — StrategySpec → SwapVM program bytes + disassembled pane rows.
//
// Spawns Flaviano's wave-compiler CLI (canonicalize → resolveRejections →
// lower → emit → disassemble). Keeps the NodeNext compiler package out of the
// Next bundle (its `.js` import suffixes don't resolve under Turbopack).
import { NextRequest } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMPILER_ROOT = path.resolve(process.cwd(), '../compiler')

function runEmit(specJson: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const tsxBin = path.join(COMPILER_ROOT, 'node_modules', '.bin', 'tsx')
    const child = spawn(tsxBin, ['src/cli-emit.ts'], {
      cwd: COMPILER_ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => {
      stdout += String(c)
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
    })
    child.on('error', (err) => {
      resolve({ code: 1, stdout: '', stderr: String(err) })
    })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.stdin.write(specJson)
    child.stdin.end()
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { code, stdout, stderr } = await runEmit(JSON.stringify(body))
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    return Response.json(
      {
        error: 'emit CLI returned non-JSON',
        detail: stderr || stdout.slice(0, 500),
      },
      { status: 502 },
    )
  }

  if (code !== 0 || parsed.error) {
    return Response.json(parsed, { status: 422 })
  }
  return Response.json(parsed)
}
