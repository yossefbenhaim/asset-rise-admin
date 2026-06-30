# Storage Migration Plan — `silver-castle/` → `asset-rise/` object prefix

> STATUS: PROPOSAL ONLY — DO NOT RUN.
>
> The `silver-castle/{userId}/...` storage prefix (and the `sc_*` table prefix)
> is currently **FROZEN for backwards-compatibility**. Existing objects in the
> `documents` bucket are namespaced under `silver-castle/` and both Asset Rise
> (the product) and Asset Rise Admin read those exact paths. **This migration
> must be discussed with and explicitly approved by Yossef before any step is
> executed.** Renaming objects out from under the live product without the
> dual-read window below will break every existing document link.

## Goal

Migrate stored objects in the `documents` bucket from the legacy prefix:

```
silver-castle/{userId}/{category}/{ts}-{filename}
silver-castle/{userId}/task/{taskId}/{ts}-{filename}
silver-castle/{userId}/signed_forms/{linkedDocId}/{ts}-{filename}
```

to the rebranded prefix:

```
asset-rise/{userId}/{category}/{ts}-{filename}
asset-rise/{userId}/task/{taskId}/{ts}-{filename}
asset-rise/{userId}/signed_forms/{linkedDocId}/{ts}-{filename}
```

Only the leading namespace segment (`silver-castle` → `asset-rise`) changes; the
rest of each key (userId / category / source / timestamp / filename) is
preserved verbatim so paths stay 1:1 mappable.

The same bucket (`documents`) is kept. We are renaming object **keys**, not the
bucket.

## What holds the paths (inventory)

The path strings live in DB columns and (sometimes) baked into URLs. Inventory
before touching anything:

1. `public.sc_tenant_documents`
   - `storage_path` — bucket-relative object key (the source of truth the admin
     `signedUrl` query signs).
   - `file_url` — historically a **public** URL produced by `getPublicUrl`, which
     embeds the full object key (`.../object/public/documents/silver-castle/...`).
2. Any other `sc_*` table that persisted a `storage_path` / `file_url` / a
   `documents/silver-castle/...` substring. Audit candidates (verify each
   actually has such a column before trusting it):
   - signed-form rows, task-attachment rows, contract/tender attachment rows.
   - Run a discovery sweep:
     ```sql
     -- columns that might hold a storage key or URL
     SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name LIKE 'sc\_%'
       AND (column_name ILIKE '%storage_path%'
            OR column_name ILIKE '%file_url%'
            OR column_name ILIKE '%url%'
            OR column_name ILIKE '%path%');
     ```
   - For each candidate column, count affected rows:
     ```sql
     SELECT count(*) FROM public.sc_tenant_documents
     WHERE storage_path LIKE 'silver-castle/%'
        OR file_url LIKE '%/documents/silver-castle/%';
     ```
3. The bucket itself — enumerate every object under the old prefix:
   ```sql
   SELECT count(*) FROM storage.objects
   WHERE bucket_id = 'documents' AND name LIKE 'silver-castle/%';
   ```
   (`storage.*` is internal — read for inventory, but prefer the Storage API for
   copies; see the rollback note about delete-protection triggers.)

Produce a manifest CSV of `(old_key, new_key, owning_table, owning_row_id,
owning_column)` and snapshot it before doing anything. This manifest IS the
rollback map.

## Code that writes the prefix (must change in lockstep)

The product code still WRITES new objects under `silver-castle/`. Migrating old
objects while new uploads keep landing under the old prefix is pointless — flip
the writers at the same time. In `~/silver-castle/apps/api/src/`:

- `routers/tenant.ts` — `PREFIX` constant + `signed_forms` path template.
- `routers/projectWorkflow.ts` — `task` attachment path template.
- `routers/documents.ts` — upload path template.
- `routers/auth.ts` — the `silver-castle/${userId}` cleanup prefix.

Introduce a single shared `STORAGE_PREFIX = 'asset-rise'` constant and route all
of the above through it, so the namespace lives in exactly one place.

## Migration steps

### Phase 0 — Approval + backup
- [ ] Get Yossef's explicit go-ahead (prefix is frozen).
- [ ] Full DB dump (at least the affected `sc_*` tables) + a bucket listing
      snapshot. Keep the manifest CSV from inventory.

### Phase 1 — Copy objects (non-destructive)
- [ ] For each object under `silver-castle/...`, **copy** (never move yet) to the
      matching `asset-rise/...` key using the service-role Storage API:
      `supabase.storage.from('documents').copy(oldKey, newKey)`.
- [ ] Idempotent + resumable: skip a copy if the destination already exists;
      drive the loop from the manifest so a crash can resume.
- [ ] Verify each copy: object exists at `newKey` and its size/content matches
      the source. **Do not delete the source in this phase.** After Phase 1 every
      file exists under BOTH prefixes.

### Phase 2 — Dual-read / redirect (backwards-compat window)
- [ ] Make the admin `signedUrl` query (and the product's read paths)
      **prefix-tolerant**: when signing a stored key, if the object is missing at
      the recorded prefix, retry the alternate prefix
      (`silver-castle/` ⇄ `asset-rise/`) before failing. This means an old link
      keeps working whether the row was rewritten yet or not.
- [ ] Keep this dual-read shim in place for the entire migration and a grace
      period afterwards. Old `file_url` public links keep resolving because the
      original objects still exist (we haven't deleted them).

### Phase 3 — Rewrite the stored path columns
- [ ] In a transaction per table, rewrite the persisted keys/URLs from the
      manifest:
      ```sql
      UPDATE public.sc_tenant_documents
      SET storage_path = 'asset-rise/' || substring(storage_path from length('silver-castle/') + 1),
          file_url     = replace(file_url, '/documents/silver-castle/', '/documents/asset-rise/'),
          updated_at   = now()
      WHERE storage_path LIKE 'silver-castle/%';
      ```
      Repeat the targeted form for every other column found in inventory.
- [ ] Note: `sc_tenant_documents` has the immutable-audit + storage
      delete-protection triggers documented in CLAUDE.md — verify these `UPDATE`s
      are not blocked, and bypass per the documented procedure only if required.
- [ ] Re-run the inventory counts: rows still matching `silver-castle/%` should
      drop to 0 as rewrites land.

### Phase 4 — Verify
- [ ] Every rewritten row's `storage_path` resolves to an existing object under
      `asset-rise/` (sign a sample + a full programmatic sweep against the
      manifest).
- [ ] Spot-check the admin Documents screen (this phase's feature): row → open →
      preview renders for image/PDF and opens for other types.
- [ ] Spot-check the live product: tenant/chair/provider can open their docs.
- [ ] Confirm no row still points at `silver-castle/`.

### Phase 5 — Decommission old objects (only after a safe grace period)
- [ ] After the dual-read window has proven stable (suggest >= 2 weeks, and only
      with Yossef's sign-off), delete the now-orphaned `silver-castle/...` objects
      from the bucket using the manifest.
- [ ] Keep the manifest + DB backup archived even after deletion.

## Rollback

Because Phase 1 only **copies** and Phase 3 is a column rewrite (with the old
objects still present), rollback at any point before Phase 5 is clean:

- **Before Phase 3** (objects copied, columns not rewritten): nothing to undo —
  the duplicate `asset-rise/` objects are harmless. Optionally delete them.
- **After Phase 3, before Phase 5** (columns rewritten, old objects still
  present): restore the path columns from the manifest:
  ```sql
  UPDATE public.sc_tenant_documents
  SET storage_path = 'silver-castle/' || substring(storage_path from length('asset-rise/') + 1),
      file_url     = replace(file_url, '/documents/asset-rise/', '/documents/silver-castle/'),
      updated_at   = now()
  WHERE storage_path LIKE 'asset-rise/%';
  ```
  The original objects were never removed, so reads recover immediately.
- **After Phase 5** (old objects deleted): rollback requires re-copying objects
  back from the `asset-rise/` prefix to `silver-castle/` using the manifest,
  then the column restore above. This is why Phase 5 waits for a long, proven
  grace period.

## Risks / notes
- The prefix is FROZEN — this is a coordinated cross-repo change (product +
  admin), not an admin-only task. Do not run any phase without Yossef.
- `file_url` public links are the riskiest surface (they embed the full key and
  may be cached/shared externally). The dual-read shim + keeping old objects
  through the grace period is what protects them.
- Prefer signed URLs over public URLs going forward (the admin `signedUrl` query
  already does this) so future renames don't require touching baked public URLs.
