# Improvement Plan: Pragmatic Convex + Local Worker

## Context

The hybrid migration described in `CONVEX_PLAN.md` is largely complete.
Convex is already the source of truth for application state. What remains in
`src/app/api/` falls into three categories:

- thin compatibility/proxy routes that can be removed once the UI uses Convex directly
- routes that touch the local filesystem (papers, notes, PDFs, evidence index)
- routes that run long-lived agent work and stream progress

The original "delete all API routes" plan overreached in two places:

- browser clients cannot talk directly to the local filesystem
- chat and note generation have different runtime requirements and should not be
  migrated as one unit

This revised plan keeps the good parts of the migration:

- Convex remains the primary app data layer
- long-running and disk-backed work moves to a local worker
- validation moves into Convex

But it drops the brittle part:

- zero API routes is not a goal

## Goals

- Use Convex as the source of truth for app state and subscriptions
- Move long-running and filesystem-backed work to a local worker
- Keep the normal UX UI-driven
- Enforce citation and annotation validation in Convex
- Reduce the Next.js API surface without forcing everything through Convex

## Non-Goals

- Do not require the browser to access local files directly
- Do not migrate chat to the worker in phase 1
- Do not expose `.cache/papers/` via `public/`
- Chat is not yet migrated to a worker — keep current Convex agent flow

## Target Architecture

```text
┌─────────────┐      useQuery/useMutation      ┌────────┐
│  Next.js UI │ ─────────────────────────────> │ Convex │
└─────────────┘                                └────────┘
       │                                            ^
       │ PDF bytes                                   │ job state, events, data
       v                                            │
┌──────────────────┐                                │
│ Minimal Next API │                                │
│ PDF only, maybe  │                                │
│ worker health    │                                │
└──────────────────┘                                │
                                                    │
                                           ┌────────────────┐
                                           │ Local Worker   │
                                           │ Node + Claude  │
                                           │ CLI + fs       │
                                           └────────────────┘
                                                    │
                                              local filesystem
                                              .cache/papers/
```

- **Next.js UI**: presentation plus direct Convex reads/mutations where safe
- **Convex**: app state, job queue state, job events, validation
- **Local worker**: long-running jobs, local filesystem operations, Claude CLI
- **Minimal Next API**: scoped file serving only, starting with PDF

## Core Recommendation

Use a worker for the things that actually need a worker:

- paper import
- note generation
- paper delete
- note delete

Do **not** force chat into the same migration. Chat currently depends on:

- partial assistant streaming
- thread title updates
- session resume/fallback behavior
- abort behavior tied to a live process

Those behaviors exist today in `src/app/api/threads/[threadId]/messages/route.ts`
and should stay there until the worker can match them cleanly.

## Route Disposition

### Remove after the UI is fully on Convex

These are mostly compatibility/proxy routes:

- `GET /papers`
- `GET /papers/[id]`
- `GET /notes`
- `GET /threads`
- `POST /threads`
- `GET /threads/[threadId]`
- `DELETE /threads/[threadId]`
- `PATCH /threads/[threadId]/papers`
- `GET /papers/[id]/notes`
- `GET /papers/[id]/notes/[filename]`

### Replace with worker-backed flows

These routes currently perform local disk work or long-running tasks and should
be replaced by job creation plus worker execution:

- `POST /papers` -> enqueue `paper-import`
- `POST /generate` -> enqueue `note-generation`
- `DELETE /papers/[id]` -> enqueue `paper-delete`
- `DELETE /papers/[id]/notes/[filename]` -> enqueue `note-delete`
- `GET/DELETE /papers/[id]/notes/generation` -> replace with Convex-backed job
  status and cancel-request mutations

### Keep for now

- `GET /papers/[id]/pdf`
- `POST /threads/[threadId]/messages`

`GET /papers/[id]/pdf` should remain a narrow file-serving route. Do not symlink
`.cache/papers/` into `public/`; that would expose notes, extracted source, and
evidence indexes in addition to PDFs.

`POST /threads/[threadId]/messages` stays until chat has a separate migration
plan that preserves streaming, cancellation, and session semantics.

## Job Worker

### Scope for phase 1

Create `src/worker/` as a long-running local Node process that handles:

- `paper-import`
- `note-generation`
- `paper-delete`
- `note-delete`

The worker is responsible for:

- claiming pending jobs
- performing local filesystem work
- invoking Claude Code CLI for note generation
- writing progress to Convex `job_events`
- updating final job state

### Suggested layout

```text
src/worker/
  index.ts
  claude-runner.ts
  task-configs.ts
  prompt-builder.ts
  job-types.ts
  job-runtime.ts
  fs-ops.ts
```

### Runtime requirements

When the worker is introduced, also add:

- a `worker` script to `package.json`
- a runtime such as `tsx`

Do not plan around `npm run worker` until those are actually added.

## Job Model Changes

The current `jobs` API is not sufficient for a real worker. In particular,
`jobs.create` currently inserts rows with `status: "running"`, which leaves no
safe claim step for a worker.

Before worker adoption, redesign `convex/jobs.ts` around these semantics:

### Job lifecycle

1. UI enqueues a job as `pending`
2. Worker claims the job and marks it `running`
3. Worker heartbeats while running
4. UI may request cancellation
5. Worker exits cleanly and marks `completed`, `failed`, or `cancelled`
6. Recovery logic can detect stale `running` jobs with expired heartbeats

### Required capabilities

- `enqueue`
- `claim`
- `heartbeat`
- `appendEvent`
- `complete`
- `fail`
- `requestCancel`
- `sweepExpired` or equivalent stale-job recovery

### Suggested fields

- `type`
- `status`
- `sanitizedPaperId`
- `threadId` for future chat jobs
- `noteFilename`
- `prompt`
- `taskType`
- `model`
- `payload` or typed per-job args
- `workerId`
- `startedAt`
- `lastHeartbeatAt`
- `completedAt`
- `cancelRequestedAt`
- `error`
- `displayCommand`

The exact schema can vary, but the model must support claiming, heartbeats, and
real process cancellation.

## Note Generation

### Current behavior to preserve

Today note generation does all of the following:

- ensures the evidence index exists
- builds a prompt from local paper context
- runs the agent
- reads the generated note from disk
- validates citations and annotations
- writes the note and citations into Convex
- records job events and supports cancellation

That end-to-end behavior should move to the worker, not be split awkwardly
between the browser and Convex.

## Revised note-generation flow

1. UI enqueues a `note-generation` job in Convex
2. Worker claims it
3. Worker loads paper metadata, annotations, and evidence index
4. Worker runs Claude Code CLI locally
5. Worker captures stdout/stderr into `job_events`
6. Worker reads the generated note from disk
7. Worker calls a validated Convex mutation to save it
8. If validation fails, worker appends the error to the prompt and retries a
   bounded number of times
9. Worker marks the job complete or failed

## Validation and retry

Move validation into Convex, but do **not** assume Claude sees mutation failures
inline by magic. In this design the worker is the control loop.

Add:

- `notes.upsertValidated`

This mutation should:

- parse citation tokens from content
- resolve refIds against `paper_chunks`
- validate annotation ids against `annotations`
- reject invalid or missing required citations
- upsert the note row
- replace `note_citations`

The worker should then implement retry behavior explicitly:

- run Claude
- call `notes.upsertValidated`
- if Convex rejects the save, append the validation error to the next retry
- stop after a small bounded retry count

This preserves server-side enforcement without relying on unsupported inline
agent recovery assumptions.

## Paper Import and Delete

These are good worker jobs because they are deterministic and disk-backed.

### `paper-import`

1. UI enqueues a `paper-import` job with the arXiv input
2. Worker downloads metadata, PDF, and source locally
3. Worker builds the evidence index
4. Worker syncs paper metadata, paper index, and chunks to Convex
5. Worker emits progress via `job_events`

### `paper-delete`

1. UI enqueues a `paper-delete` job
2. Worker removes local files under `.cache/papers/{id}`
3. Worker removes Convex records
4. Missing local files should be treated as already deleted

### `note-delete`

1. UI enqueues a `note-delete` job
2. Worker deletes the note file from disk
3. Worker removes the corresponding Convex note and citations
4. Missing note files should be treated as already deleted

These delete jobs should be idempotent. They cannot be a single transaction
across disk and Convex, so retries must be safe.

## Chat

Chat should stay on the current route for now.

Reasons:

- it already has working partial-message streaming
- it already has session resume/fallback behavior
- it already updates thread titles and session metadata
- it already ties request abort to process abort

Do not remove chat-related code until a separate chat migration is designed and
implemented.

## Convex MCP

Convex MCP is useful, but it should be optional in the first worker phase.

Recommendation:

- start with the worker fetching what it needs directly through the Convex client
- add Convex MCP to Claude Code only if direct tool access proves necessary for
  prompt quality or agent autonomy

That keeps phase 1 simpler and avoids coupling worker adoption to a second
integration surface.

If MCP is later added, register the official Convex MCP server and scope its use
to specific tasks rather than making it the foundation of the whole migration.

## What to Keep and Migrate

- `src/lib/evidence-index.ts` reused by worker jobs
- `src/lib/papers.ts` reused or partially extracted into worker fs utilities
- `src/lib/notes.ts` reused or partially extracted into worker fs utilities
- `src/lib/agent/task-configs.ts` and `prompt-builder.ts` adapted for worker note generation
- `src/lib/citations.ts` reused for token parsing
- `convex/` remains the primary data layer

## What Not to Delete Yet

- `src/app/api/papers/[id]/pdf/route.ts`
- any chat-specific agent helpers still used by the existing Convex agent flow

## Migration Order

### Phase 1: Fix the job protocol

- redesign `convex/jobs.ts` for `pending` -> `running` claim flow
- add heartbeats and cancel requests
- add stale-job recovery
- add `tsx` and `npm run worker`

### Phase 2: Build the worker skeleton

- create `src/worker/`
- implement job polling/subscription and claiming
- implement job event streaming to Convex
- implement graceful shutdown and cancellation checks

### Phase 3: Migrate deterministic disk-backed work

- move paper import to `paper-import`
- move paper delete to `paper-delete`
- move note delete to `note-delete`
- wire UI actions to enqueue these jobs instead of calling API routes

### Phase 4: Migrate note generation

- add `notes.upsertValidated`
- port prompt building to the worker
- run Claude Code CLI locally
- implement bounded retry on validation failure
- replace `/api/generate` and `/papers/[id]/notes/generation`

### Phase 5: Remove compatibility routes

- replace remaining proxy reads/writes with direct Convex usage in the UI
- remove routes that no longer do anything except proxy Convex

### Phase 6: Re-evaluate chat

- decide whether chat really benefits from the worker
- if yes, design a dedicated chat job model that supports partial streaming,
  session resume, and real cancellation
- only after that remove the current chat route and Agent SDK

### Phase 7: Optional Convex MCP

- add Convex MCP to Claude Code only if needed after the worker is stable

## Running the Stack

After the worker lands, local development likely runs:

```bash
# terminal 1
npm run dev

# terminal 2
npx convex dev

# terminal 3
npm run worker
```

This can later be wrapped in a combined dev command.

## Benefits

- Convex stays the single source of truth for app data
- disk-backed and long-running work leaves the request/response path
- the plan no longer breaks paper delete, note delete, or PDF serving
- note validation is enforced server-side in Convex
- the migration is staged so chat is not destabilized unnecessarily

## Tradeoffs

- there is still a small Next.js server surface
- the worker adds another long-running local process
- deleting disk and Convex state requires idempotent worker logic
- chat stays on the current Convex agent flow until migrated separately

## Summary

The right target is not "no API routes." The right target is:

- Convex for application state
- a local worker for jobs and filesystem work
- one minimal server boundary for scoped file serving
- chat migrated later, not mixed into the first worker rollout
