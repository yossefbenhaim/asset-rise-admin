// Minimal migration runner — applies db/migrations/*.sql against the shared
// Supabase Postgres. Tracks applied files in a local table.
//
// Usage: SUPABASE_DB_URL=postgresql://... npm run migrate

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', '..', 'db', 'migrations')

async function main() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) throw new Error('SUPABASE_DB_URL not set')

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  // Use a separate table from Silver Castle so we don't fight over rows.
  await client.query(`
    create table if not exists ar_migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `)

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  const { rows: applied } = await client.query<{ name: string }>('select name from ar_migrations')
  const appliedSet = new Set(applied.map(r => r.name))

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓ ${file} (already applied)`)
      continue
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    console.log(`→ ${file}`)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into ar_migrations(name) values ($1)', [file])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback')
      console.error(`✗ ${file} failed:`, e)
      process.exit(1)
    }
  }

  await client.end()
  console.log('done')
}

main().catch(e => { console.error(e); process.exit(1) })
