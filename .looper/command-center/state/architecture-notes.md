# Architecture Notes — command-center (orchestrator grounding)

Empirical facts gathered by the orchestrator before planning. The planner, generator, and
evaluator must treat these as **given** — they are measured from this machine and the real
Claude Code data, not assumptions.

## Toolchain on this machine (measured)

- node **v26.2.0**, npm **11.16.0**, npx present.
- python3 **3.14.2**; make + g++ present → native node addons (node-pty) are buildable.
- git **2.54.0**.
- **tmux is NOT installed.** → the interactive-attach mechanism MUST use **node-pty** (a
  pseudo-terminal in the backend process), not tmux. Do not depend on tmux.
- **Playwright 1.61.1 is available** → the evaluator will drive the running UI in a real
  browser. The build therefore MUST be a browser-renderable web UI served over HTTP/WS so it
  is gradeable. Medium boundary: **local web app** (e.g. Vite/React frontend + Node backend
  with `ws` + `node-pty` + a file watcher). This matches the visual GUIs that set the design bar.

## Real Claude Code transcript schema (probed from ~/.claude/projects, redacted)

- `~/.claude/projects/` holds **one directory per project cwd** (49 here). Dir name = the cwd
  with `/` → `-` (e.g. `-home-null-Desktop-work-looper` ⇒ `/home/user/projects/app`).
  **3749** total `.jsonl` files. → never parse all history on load; **tail recent + lazy-load**.
- Each `.jsonl` file = **one session** (filename stem = sessionId). Some project dirs also
  contain a `subagents/` subfolder with sidechain transcripts.
- Every record is one JSON object per line. Top-level keys present on ~all records:
  `parentUuid, isSidechain, agentId, type, uuid, timestamp, userType, entrypoint, cwd,
  sessionId, version, gitBranch, message`. Assistant records add:
  `requestId, attributionAgent, attributionSkill, promptId, toolUseResult, sourceToolAssistantUUID`.
- `type` ∈ {`user`, `assistant`, `attachment`} (plus meta records; `isMeta` seen).
- **Directory grouping** comes from the `cwd` field on each record (robust) or by decoding the
  dir name (fast). Prefer reading `cwd`.
- **The action feed** = derive from records:
  - assistant `message.content[]` is an array of blocks; block `type` ∈ {`thinking`, `text`,
    `tool_use`, ...}. A **major action** = a `tool_use` block → `{name, input}` (e.g. Bash
    command, Edit/Write file path, Read path, Task/agent dispatch).
  - tool results arrive on `user` records via `toolUseResult` (and/or tool_result content).
  - `isSidechain: true` + `agentId` mark **subagent** activity → the feed should distinguish
    main-thread actions from subagent sidechains.
- **Session status** is inferred (the build defines the heuristic), e.g.: last record `type` +
  recency of `timestamp` → running (recent tool activity) / waiting-for-input (last record is
  assistant text, no newer user record) / idle / done (stale).

## Gradeability seams (REQUIRED — this is a sharpening of the human's env-var + subscription rules)

The evaluator must exercise the build with NO live Claude subscription and NO real running
agents. The build must therefore be fully demonstrable on **synthetic fixtures + a stand-in
interactive process**, selected via env vars (which also satisfies "config via env vars,
fail-fast on missing required"):

- `CC_PROJECTS_DIR` — transcripts root. Default `~/.claude/projects`; eval points it at a
  synthetic fixtures tree.
- `CC_MEMORY_DIR` — where per-project-dir markdown + the one global markdown live.
- `CC_SESSION_CMD` — the command launched inside the node-pty for a new/attached session.
  Default `claude` (rides the user's Pro/Max via the INTERACTIVE CLI — never `claude -p`).
  Eval sets it to a stand-in interactive process (a small scripted REPL / `bash`) so
  attach → type → see output → detach → reattach (process survives) is provable.
- The build MUST ship a **fixtures generator**: writes synthetic JSONL across ≥3 fake project
  dirs with multiple sessions, schema-faithful to the section above, including a mode that
  **appends new action records over time** to simulate live sessions for the action feed.
- **Do NOT copy real transcript content into fixtures** (private data). Fixtures are synthetic.

## Hard constraints carried from the request

- Sessions ride the subscription via the **interactive** `claude` CLI in a node-pty. Never
  architect around `claude -p` (OAuth + -p has billing-misclassification issues; Anthropic's
  Feb-2026 policy restricts OAuth to official clients).
- Secrets/required config via **env vars**, **fail fast** at startup if a required one is
  missing — no silent defaults for true secrets (optional dirs may default as above).
- **Local-first**: no external service required for core function.
- **Concurrent-write safety** on the shared markdown memory (many sessions writing): design it
  explicitly (append-only log + compaction, or a single-writer daemon) behind a small swappable
  interface so an MCP server can replace it later.

## Intake parameters (set by orchestrator)

- Slug: `command-center`. Size class: **medium app → 40 criteria**.
- Category priority: **functionality > craft > design > originality**.
- Allocation (floors 3 each + rank-weighted remainder): **functionality 14, craft 11,
  design 9, originality 6 = 40**.
- Stopping target fitness: **0.95**, asymptote band **[0.85, 0.95]**.
</content>
