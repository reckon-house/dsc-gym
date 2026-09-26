// Take a restore point of production before a deploy, keeping a rolling set.
//
//   npx tsx scripts/restore-point.ts pre-leads
//
// Creates a Neon branch of production named "<label>-YYYY-MM-DD". Neon caps the
// project at 10 branches, so before creating one this drops the OLDEST
// automatic restore points until at most KEEP - 1 remain. The user asked for
// exactly this: "as we push new backups can the last just drop off?"
//
// What it will delete — all must hold:
//   - the name looks like one this script makes: pre-… / post-…-YYYY-MM-DD
//   - it is not production, dev, or any production_old* copy (named rule +
//     never the default branch)
//   - nothing was branched from it
//   - its endpoint is not the host in this machine's .env (dev) or production
// Anything else is left alone and reported.
//
// Exits non-zero, loudly, if the new branch was not created. An earlier
// version echoed "restore point made" whether or not it was — never again.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ORG = 'org-bitter-boat-03322225'
const PROJECT = 'patient-queen-13561192'
const KEEP = Number(process.env.KEEP ?? 5)
/** DRY_RUN=1 prints what would happen and changes nothing. */
const DRY = process.env.DRY_RUN === '1'
const AUTO = /^(pre|post)-[a-z0-9-]+-\d{4}-\d{2}-\d{2}$/
const NEVER = [/^production$/, /^production_old/, /^dev$/, /^main$/]

interface Branch {
  id: string
  name: string
  parent_id?: string
  created_at: string
  default?: boolean
  primary?: boolean
}

function neon(args: string[]): string {
  return execFileSync('npx', ['neonctl@latest', ...args, '--org-id', ORG, '--project-id', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function hostOf(branch: string): string | null {
  try {
    const url = neon(['connection-string', branch]).trim()
    return url.match(/@(ep-[a-z0-9-]+?)(?:-pooler)?\./)?.[1] ?? null
  } catch {
    return null // no compute — can't be in use by anything
  }
}

function main() {
  const label = (process.argv[2] ?? '').trim()
  if (!/^(pre|post)-[a-z0-9-]+$/.test(label)) {
    console.error('Usage: npx tsx scripts/restore-point.ts pre-<what>   (lowercase, dashes)')
    process.exit(2)
  }
  const today = new Date().toISOString().slice(0, 10)
  const name = `${label}-${today}`

  const branches: Branch[] = JSON.parse(neon(['branches', 'list', '--output', 'json']))
  if (branches.some((b) => b.name === name)) {
    console.log(`Restore point ${name} already exists — nothing to do.`)
    return
  }

  // Hosts that are in use and must never be deleted.
  const inUse = new Set<string>()
  for (const h of [hostOf('production'), hostOf('dev')]) if (h) inUse.add(h)
  try {
    for (const m of readFileSync('.env', 'utf8').matchAll(/@(ep-[a-z0-9-]+?)(?:-pooler)?\./g)) inUse.add(m[1])
  } catch {
    /* no local .env */
  }

  const hasChildren = new Set(branches.map((b) => b.parent_id).filter(Boolean) as string[])
  const auto = branches
    .filter((b) => AUTO.test(b.name) && !NEVER.some((r) => r.test(b.name)) && !b.default && !b.primary)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  let excess = auto.length - (KEEP - 1)
  for (const b of auto) {
    if (excess <= 0) break
    if (hasChildren.has(b.id)) {
      console.log(`  keep ${b.name}: other branches were made from it`)
      continue
    }
    const host = hostOf(b.name)
    if (host && inUse.has(host)) {
      console.log(`  keep ${b.name}: its database is in use (${host})`)
      continue
    }
    if (DRY) {
      console.log(`  [dry run] would drop ${b.name} (${b.created_at.slice(0, 10)})`)
      excess--
      continue
    }
    const out = neon(['branches', 'delete', b.id, '--output', 'json'])
    if (!out.includes(`"id": "${b.id}"`)) {
      console.error(`FAILED to delete ${b.name}; stopping.\n${out}`)
      process.exit(1)
    }
    console.log(`  dropped oldest restore point ${b.name} (${b.created_at.slice(0, 10)})`)
    excess--
  }

  if (DRY) {
    console.log(`  [dry run] would create ${name}; ${auto.length} automatic restore points exist, keeping ${KEEP}.`)
    return
  }
  let out = ''
  try {
    out = neon(['branches', 'create', '--parent', 'production', '--name', name, '--output', 'json'])
  } catch (err) {
    out = String((err as { stderr?: string }).stderr ?? err)
  }
  if (!out.includes(`"name": "${name}"`)) {
    console.error(`RESTORE POINT FAILED — do not deploy without deciding what to do.\n${out.slice(0, 500)}`)
    process.exit(1)
  }
  console.log(`RESTORE POINT CREATED: ${name}`)
}

main()
