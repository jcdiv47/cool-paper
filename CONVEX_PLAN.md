# Convex Hybrid Plan

## Summary

Use a hybrid architecture:

- Keep `Next.js` for the app shell, routing, and React UI.
- Use `Convex` as the source of truth for app state and realtime updates.
- Run Claude Code in a separate `Node` worker for agent execution and filesystem-heavy work.

This keeps Claude Code in an environment where subscription login and local file access make sense, while moving durable app state out of local JSON files and in-memory stores.

## Why Hybrid

This repo currently mixes three concerns in one runtime:

- UI rendering and navigation
- durable app state
- long-running agent and file operations

That is visible in the current code:

- `src/lib/agent/executor.ts` runs Claude Code via `@anthropic-ai/claude-agent-sdk`
- `src/lib/papers.ts` and `src/lib/arxiv.ts` download and manage paper files
- `src/lib/notes.ts` and `src/lib/chat-threads.ts` persist state to local files
- `src/lib/job-store.ts` keeps live job state in memory
- `src/app/api/generate/route.ts` and `src/app/api/threads/[threadId]/messages/route.ts` combine request handling, state management, and execution

The hybrid model separates those concerns cleanly:

- `Next.js` handles presentation
- `Convex` handles state
- the worker handles execution

## Target Architecture

### Next.js

Keep `Next.js` for:

- route structure and layout
- React UI
- auth integration
- PDF and note viewers
- calling Convex mutations/queries from the client

Reduce or remove custom stateful API routes over time.

### Convex

Use `Convex` for:

- papers metadata
- notes metadata and note content
- chat threads
- chat messages
- jobs
- job progress events
- realtime subscriptions for UI updates

Convex becomes the durable source of truth for user-visible state.

### Worker

Use a separate `Node` worker for:

- Claude Code execution
- local paper cache management
- PDF/source download and extraction
- translating worker progress into Convex job events
- any logic that needs a real filesystem or a local Claude Code login

The worker can run:

- on the developer machine for local/single-user usage
- on a VM or container you control for hosted usage

## Responsibility Split

### Move to Convex

These current modules are good candidates to move into Convex-backed state:

- `src/lib/chat-threads.ts`
- `src/lib/job-store.ts`
- `src/lib/generation-status.ts`
- most of `src/lib/notes.ts`

### Keep in Worker

These current modules should stay worker-owned or be adapted into worker code:

- `src/lib/agent/executor.ts`
- `src/lib/agent/prompt-builder.ts`
- `src/lib/agent/task-configs.ts`
- `src/lib/papers.ts`
- `src/lib/arxiv.ts`

### Likely Simplify or Replace

These current HTTP endpoints should shrink or be removed as Convex takes over state flows:

- `src/app/api/generate/route.ts`
- `src/app/api/threads/[threadId]/messages/route.ts`
- `src/app/api/papers/[id]/notes/generation/route.ts`
- most of the state-oriented routes under `src/app/api`

## Proposed Convex Data Model

Start with these tables:

- `papers`
- `paper_files`
- `notes`
- `threads`
- `messages`
- `jobs`
- `job_events`

Suggested responsibilities:

- `papers`: arXiv id, title, authors, abstract, timestamps, ownership
- `paper_files`: file kind, location, worker-local reference or storage reference
- `notes`: paper id, title, markdown, model, timestamps
- `threads`: title, paper ids, selected model, worker session id, timestamps
- `messages`: thread id, role, content, optional thinking, model, timestamps
- `jobs`: type, payload, status, worker assignment, start/end timestamps, error
- `job_events`: ordered progress/event stream per job

## File Storage Strategy

There are two reasonable options.

### Option A: Local Worker Cache

Keep the paper cache on disk in the worker, close to the current `.cache` model.

Pros:

- easiest migration
- works well with Claude Code subscription login
- minimal change to file-oriented tooling

Cons:

- not ideal for horizontally scaled multi-worker hosting
- requires the worker to be the source of truth for local file availability

### Option B: Object Storage or Convex File Storage

Store PDFs and source bundles remotely and let the worker materialize them locally before Claude Code runs.

Pros:

- better for multi-user hosted deployments
- easier to share assets across workers

Cons:

- more moving parts
- more work to preserve the current local working-directory model for Claude Code

Recommended starting point: `Option A`.

## Request Flows

### Add Paper

1. UI creates a paper import job in Convex.
2. Worker picks up the queued job.
3. Worker downloads metadata, PDF, and source files.
4. Worker stores progress in `job_events`.
5. Worker marks the paper import complete in Convex.
6. UI updates automatically through Convex subscriptions.

### Generate Note

1. UI creates a note-generation job in Convex.
2. Worker picks up the job.
3. Worker runs Claude Code against the paper working directory.
4. Worker writes progress output to `job_events`.
5. Worker stores the final note in `notes`.
6. Worker marks the job complete or failed.
7. UI reflects status and output from Convex in realtime.

### Chat

1. UI appends a user message to a thread in Convex.
2. UI or backend marks that thread as needing an assistant response.
3. Worker picks up the pending assistant turn.
4. Worker runs Claude Code with prior thread context and paper context.
5. Worker writes deltas or partial output to Convex.
6. Worker saves the final assistant message and updates the thread session id.
7. UI streams updates via Convex subscriptions instead of custom SSE.

## Migration Plan

### Phase 1: Move Thread and Job State to Convex

Goal:

- remove in-memory and JSON-file state for chats and jobs

Tasks:

- move `chat-threads` persistence into Convex
- replace `job-store.ts` with Convex-backed jobs and events
- store generation status in Convex rather than `.generation.json`
- adapt the UI to read threads and jobs from Convex

Expected benefit:

- durable state
- better recovery after restarts
- cleaner realtime UI

### Phase 2: Extract Worker

Goal:

- isolate Claude Code and filesystem operations

Tasks:

- create a dedicated worker entrypoint
- move agent execution out of Next route handlers
- move paper download/extraction into worker jobs
- have the worker claim and update Convex jobs

Expected benefit:

- Claude Code runs in a proper environment
- execution is decoupled from web requests
- backend behavior is easier to reason about

### Phase 3: Move Notes and Messages Fully to Convex

Goal:

- make Convex the durable source of truth for user-visible content

Tasks:

- migrate note content into Convex
- migrate chat messages into Convex
- remove JSON-file-backed thread/message storage

Expected benefit:

- unified data access
- easier query patterns
- realtime updates without custom replay logic

### Phase 4: Revisit File Storage

Goal:

- decide whether to keep worker-local files or adopt shared storage

Tasks:

- measure actual hosting and sharing needs
- keep local cache if single-user or controlled-worker deployment is enough
- move to remote storage only if scaling requirements justify it

Expected benefit:

- avoids premature complexity

## Recommended First Implementation

If the goal is the lowest-risk path, build this first:

- `Next.js` frontend
- `Convex` for threads, messages, jobs, and progress events
- one local or self-hosted `Node` worker for Claude Code and paper files

This keeps the current Claude Code workflow viable while immediately improving state durability and UI reactivity.

## Benefits

Main benefits of this design:

- Claude Code stays in an environment where subscription login and local execution make sense
- app state stops depending on JSON files and process memory
- realtime UX becomes a natural Convex concern rather than custom SSE infrastructure
- the migration can happen in stages instead of requiring a full rewrite

## Tradeoffs

Main tradeoff:

- one extra moving part: the worker

Other tradeoffs:

- a slightly more distributed mental model
- eventual consistency between worker-side local files and Convex state
- more deployment choices to document

## Recommendation

Adopt the hybrid architecture, but start narrowly:

- move state first
- extract the worker second
- revisit remote file storage only after the core flow is stable

That gives the project most of the Convex upside without breaking the Claude Code execution model that the current app depends on.
