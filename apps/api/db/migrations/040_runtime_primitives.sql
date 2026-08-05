-- 040 — the three runtime primitives the factory was missing.
-- Idempotent: migrations are replayed on API boot.
--
-- Each one is named after the LangGraph construct it is our version of, so a
-- reader who knows one vocabulary can read the other. What they are NOT is a
-- port: the factory is a graph whose nodes are separate OS processes, and these
-- are the pieces that model needs and did not have.
--
--   1. reducer      -> sc_append_work_log()      (a merge rule, not read-modify-write)
--   2. checkpointer -> sc_dev_task_checkpoints   (state history, and a basis for fork)
--   3. Store        -> sc_agent_memory           (cross-run memory with retrieval)

-- similarity() and the % operator come from pg_trgm, and sc_memory_search below
-- is compiled against them — so this has to be the first statement in the file,
-- not a tidy footnote at the end.
create extension if not exists pg_trgm;


-- ═══ 1. reducer ════════════════════════════════════════════════════════════
-- `work_log` was read in bash, concatenated in bash and written back whole.
-- That is a lost update waiting for the day two stations touch one card, and
-- the factory already runs stations concurrently — only the WIP check on
-- intake kept it from happening. LangGraph's answer to concurrent writes is to
-- make you declare a reducer; this is that reducer, and it runs inside the
-- database where the read and the write cannot be separated.
create or replace function sc_append_work_log(p_task_id uuid, p_chunk text)
returns void
language sql
security definer
set search_path = public
as $$
  update sc_dev_tasks
     set work_log   = coalesce(work_log, '') || p_chunk,
         updated_at = now()
   where id = p_task_id;
$$;

comment on function sc_append_work_log(uuid, text) is
  'Append-only reducer for sc_dev_tasks.work_log. Concurrent-safe by construction: '
  'the read and the write are one statement, so two stations cannot clobber each other.';


-- ═══ 2. checkpointer ═══════════════════════════════════════════════════════
-- One row per state transition, holding the card as it was at that moment.
-- Three things this buys that a prose work_log cannot:
--   * get_state_history() — what did this card actually look like at QA?
--   * fork                — parent_id makes the history a tree, not a line, so
--                           a re-run from step N is representable
--   * an honest cost trail — tokens per checkpoint, not per card
--
-- Deliberately NOT a blob: the whole advantage our state has over theirs is
-- that it is queryable without our code, and serialising it into BYTEA would
-- throw that away to save nothing.
create table if not exists sc_dev_task_checkpoints (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references sc_dev_tasks(id) on delete cascade,
  parent_id    uuid references sc_dev_task_checkpoints(id) on delete set null,
  step         integer not null,
  source       text not null default 'loop'
                 check (source in ('input', 'loop', 'update', 'fork')),
  status       text not null,
  agent        text,
  branch       text,
  commit_sha   text,
  state        jsonb not null default '{}'::jsonb,
  tokens_in    integer,
  tokens_out   integer,
  cost_usd     numeric(10, 4),
  created_at   timestamptz not null default now()
);

-- `source` mirrors CheckpointMetadata.source in langgraph.checkpoint.base:
-- input | loop | update | fork. Same four words, same meanings.

create index if not exists sc_dev_task_checkpoints_task_step_idx
  on sc_dev_task_checkpoints (task_id, step);
create index if not exists sc_dev_task_checkpoints_parent_idx
  on sc_dev_task_checkpoints (parent_id);

alter table sc_dev_task_checkpoints enable row level security;
-- Written by the host worker through the service-role key; read by the admin
-- API the same way. No client policy on purpose.

-- get_state_history(): the checkpoints of one card, newest first.
create or replace function sc_task_state_history(p_task_id uuid)
returns setof sc_dev_task_checkpoints
language sql
stable
security definer
set search_path = public
as $$
  select * from sc_dev_task_checkpoints
   where task_id = p_task_id
   order by step desc, created_at desc;
$$;


-- ═══ 3. Store ══════════════════════════════════════════════════════════════
-- Cross-run memory. Until now this was dev-shared/LEARNINGS.md: append-only,
-- unbounded, and pasted into EVERY station's prompt — 16 KB of it as of
-- 2026-08-05, which is roughly 5,400 tokens spent on every call whether or not
-- a single line is relevant.
--
-- The shape follows langgraph.store.base: a hierarchical namespace, a key, a
-- JSON value, a TTL, and search. The search is lexical (Postgres full-text +
-- trigram) rather than vector, because there is no embedding provider on this
-- box — the `vector` extension is available but nothing can fill the column.
-- The table is laid out so adding `embedding vector(N)` later is one migration
-- and no rewrite of the callers.
create table if not exists sc_agent_memory (
  id         uuid primary key default gen_random_uuid(),
  namespace  text[] not null,
  key        text not null,
  value      jsonb not null,
  -- Denormalised from value->>'text' by trigger so the index has something
  -- stable to sit on regardless of the value's shape.
  body       text not null default '',
  search     tsvector,
  ttl_at     timestamptz,
  hits       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (namespace, key)
);

create index if not exists sc_agent_memory_namespace_idx
  on sc_agent_memory using gin (namespace);
create index if not exists sc_agent_memory_search_idx
  on sc_agent_memory using gin (search);
create index if not exists sc_agent_memory_ttl_idx
  on sc_agent_memory (ttl_at) where ttl_at is not null;

create or replace function sc_agent_memory_index() returns trigger
language plpgsql as $$
begin
  new.body := coalesce(new.value->>'text', new.value::text);
  -- 'simple' rather than a language config: the corpus is mixed Hebrew and
  -- English, and no stemmer handles both. Trigram similarity carries the
  -- fuzzy matching instead.
  new.search := to_tsvector('simple', new.body);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sc_agent_memory_index_trg on sc_agent_memory;
create trigger sc_agent_memory_index_trg
  before insert or update on sc_agent_memory
  for each row execute function sc_agent_memory_index();

alter table sc_agent_memory enable row level security;

-- put(namespace, key, value, ttl) — upsert, mirroring BaseStore.put.
create or replace function sc_memory_put(
  p_namespace text[], p_key text, p_value jsonb, p_ttl_seconds integer default null
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into sc_agent_memory (namespace, key, value, ttl_at)
  values (p_namespace, p_key, p_value,
          case when p_ttl_seconds is null then null
               else now() + make_interval(secs => p_ttl_seconds) end)
  on conflict (namespace, key) do update
    set value = excluded.value, ttl_at = excluded.ttl_at
  returning id;
$$;

-- search(namespace_prefix, query, limit) — mirroring BaseStore.search. Expired
-- rows are filtered rather than deleted so a TTL never loses a row mid-read.
--
-- Two deliberate choices, both learned by watching the first version return
-- nothing for a query whose words were plainly in the corpus:
--
--   * OR, not AND. `plainto_tsquery` joins terms with AND, so "typecheck tsc"
--     missed a lesson containing only "tsc". A retrieval store that needs the
--     caller to guess the exact phrasing is not retrieval.
--   * word_similarity, not similarity. `similarity()` compares the query to the
--     WHOLE body, so a three-word query against a 200-character lesson always
--     scores near zero. `word_similarity` finds the best-matching run inside
--     the text, which is the actual question being asked.
create or replace function sc_memory_search(
  p_prefix text[], p_query text, p_limit integer default 5
) returns table (key text, value jsonb, score real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select string_agg(t, ' | ') as ored
      from unnest(regexp_split_to_array(lower(trim(p_query)), '\s+')) as t
     where length(t) > 1
  )
  select m.key, m.value,
         (ts_rank(m.search, to_tsquery('simple', nullif(q.ored, '')))
          + word_similarity(p_query, m.body))::real as score
    from sc_agent_memory m, q
   where m.namespace[1:array_length(p_prefix, 1)] = p_prefix
     and (m.ttl_at is null or m.ttl_at > now())
     and (m.search @@ to_tsquery('simple', nullif(q.ored, ''))
          or p_query <% m.body)
   order by score desc
   limit greatest(p_limit, 1);
$$;
