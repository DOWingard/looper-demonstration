# Reference Analysis — command-center

Empirical analysis of every good/anti reference, ingested via official docs, GitHub READMEs,
changelogs, and screenshot/walkthrough sources (the apps could not be run in this environment;
the human approved doc+image grounding). The spec boundaries and the contract's 0/10 anchors
come from THIS file, not from a prior about "what good looks like."

## Per-reference observations

### good — Claude Squad (smtg-ai)  (TUI / Go; qualified for: functionality — terminal attach)
- Functionality: one isolated git worktree + tmux session per agent; `↵`/`o` drops into the
  **real** live shell; `ctrl-q` detaches **without killing** (agent runs on); `c` commit+pause,
  `r` resume; `-y` unattended.
- Design: persistent bottom command-legend always visible (no mode switch to see actions);
  vertical session list + right pane.
- Originality: tmux-as-substrate → zero process abstraction; you are *in* the agent's terminal.
- Craft: `tab` toggles live-output ↔ git-diff in place; 100 ms preview refresh; fully keyboard.
- 10-anchors: detach-without-kill semantics; in-place output↔diff toggle; pause/resume w/ auto-commit.

### good — Conductor  (macOS native GUI; qualified for: design + review flow)
- Functionality: parallel workspaces, each = worktree + branch + terminal + diff + CI tracking.
- Design: sidebar-centric; each workspace is a self-contained lane; no global clutter; Cmd+K palette;
  searchable workspaces, pinned + mark-unread triage.
- Originality: **Checks tab** consolidates every merge prerequisite (CI, PR approval, resolved
  comments, todos) into one gated pane.
- Craft: keyboard shortcut for every major action (Cmd+Shift+D/P/N); 70+ versioned UI iterations.
- 10-anchors: inline diff comments routed back to the agent mid-review; merge gated on all signals;
  expandable per-workspace terminal inside the GUI.

### good — Sculptor (Imbue)  (Mac/Linux GUI + Docker; qualified for: originality + craft)
- Functionality: **container-per-agent** (deps pre-installed, no per-agent reinstall); line-level
  merge tool; session forking from any state.
- Design: tab-per-workspace at window top (no sidebar nesting); 3-tab Files panel (Browse/Changes
  /Commits) always visible; **Changes count badge** persistent.
- Originality: **Pairing Mode** — live bidirectional container↔local IDE sync while the agent runs.
- Craft: Plan/Fast/Effort toggles first-class; **context-window % shown after each turn**, clickable
  for token breakdown; progress "1/8" inline in chat.
- 10-anchors: Pairing Mode bidirectional sync; always-visible diff/changes badge; per-turn context-%
  telemetry surfaced inline.

### good — Nimbalyst  (desktop + iOS; qualified for: design + craft)
- Functionality: iOS companion push on completion/approval; start/monitor/resume from phone.
- Design: **three-panel Agent Window** — session list (w/ search) | streaming transcript w/ tool-call
  viz | files-read/written + prompts — all co-visible, no tab switching.
- Originality: session-phase kanban (Backlog→Planning→Implementing→Validating→Complete) + per-session
  file-change sidebar; inline wakeup banner w/ Cancel/Fire-now.
- Craft: **type-aware diff** (Monaco for code, rich-text markdown, Excalidraw mockups, canvas
  diagrams); per-turn "Finished in 6m57s — 3 files +45 −12" metadata; window state persisted.
- 10-anchors: hover-card → live transcript popover (inspect without navigating away); per-turn
  "N files +X −Y" as first-class UI; three-panel co-visibility.

### good — Vibe Kanban (BloopAI)  (web app, Rust+TS; qualified for: originality)  [now community-maintained]
- Functionality: 10+ agents, per-card agent selection; per-card workspace = branch + embedded
  terminal + dev server + built-in browser; PR w/ AI description + auto-rebase.
- Design: 4-column board (To Do→In Progress→Review→Done); each card a self-contained context.
- Originality: **Attempt system** — reject a result, re-run with a different agent/prompt, compare
  diffs side-by-side before merge.
- Craft: **embedded DevTools browser** in the workspace (no external context switch); `dev-manager-mcp`
  daemon auto-allocates ports across parallel agents; live logs over WebSocket.
- 10-anchors: attempt comparison; embedded preview+devtools; programmatic port management.

### good — Claudia / Opcode (getAsterisk)  (cross-platform desktop, Tauri2/Rust/React; qualified for: functionality + craft)
- Functionality: **browses `~/.claude/projects/`** directly; checkpoint/fork/restore; CC Agents w/
  per-agent permissions + background exec; MCP registry.
- Design: shadcn/ui + Tailwind consistent component system; session cards w/ first-message preview for
  fast scanning.
- Originality: **branching visual checkpoint timeline** (fork/restore any point, diff two states);
  usage analytics dashboard w/ per-model/project/date cost + CSV export.
- Craft: Tauri2/Rust native perf; SQLite for all local state; no telemetry; CLAUDE.md per-project
  editor w/ live markdown preview.
- 10-anchors: visual branching timeline; reads the real `~/.claude/projects/` tree (our exact data
  source); local-first SQLite + zero telemetry.

### anti — Enterprise OTel dashboards (Datadog Agent Console / Dynatrace)  (qualified 0-anchor: DESIGN)
- Aggregate metric tiles (spend, tokens, time-to-merge), spend-over-time charts, per-user/team
  rollups, DORA metrics, flagged-session lists. Piped from OpenTelemetry; never surfaces the running
  session. Audience = platform leads / FinOps. **0-anchor:** passive telemetry you *observe*, not a
  surface you *operate* — no attach, peek, reply, or dispatch; chart density signals monitoring, not flow.

### anti — Generic kanban/PM repurposed (Trello/AgentsBoard-style)  (qualified 0-anchor: FUNCTIONALITY)
- Cards in Todo/In-Progress/Done; clicking Play fires a one-shot request → markdown on a Done card.
  **0-anchor:** ceremony over flow; task-as-discrete-unit not session-as-ongoing-conversation; status
  is hand-updated and does not reflect real agent state (blocked/errored/waiting invisible); no live
  terminal behind a card, no inline reply.

### anti — Raw DIY (N terminals + `claude --resume` + `tail -f` JSONL)  (qualified 0-anchor: CRAFT/navigability)
- Separate terminal per session; tail transcripts by hand; a side scratchpad to track which session is
  in which repo; context switch = Alt-Tab + scroll + re-read. **0-anchor:** zero at-a-glance fleet
  state, no unified feed, no directory grouping, no shared memory — the exact pain to solve.

### baseline (floor to beat) — native `claude agents` Agent View (v2.1.139+)
- Floor it already clears: full-terminal dashboard grouping sessions into Needs-input / Working /
  Completed / Pinned w/ animated icons; per-row live one-line Haiku summary (≤15 s, names active tool)
  + time-since-change + PR status; Peek (Space) shows last output / pending question + inline reply;
  Attach/detach (Enter/←); dispatch new sessions; `/bg` backgrounds via supervisor (survives terminal
  close); `--cwd` filters to one dir.
- Where it leaves the opening: **flat list — `--cwd` filters but does NOT group** by directory; **no
  unified cross-session action feed** (one summary line, or attach); **no shared markdown memory**; no
  auto-discovery of foreground sessions; no audit trail of decisions made while away; no directory-level
  context (branch / failing tests / recent sessions in this repo).

## Invariants — the generalized metrics + spec boundaries

- **Shared by ALL good targets** → spec boundaries the build MUST satisfy (the 10-anchors):
  - **Live streaming of agent activity** per session (Squad 100 ms preview, Nimbalyst streaming
    transcript, Vibe Kanban WS logs) — the feed must update in near-real-time, not on refresh.
  - **Diff / file-change is a first-class surface** (every single good target). For us this is
    derivable from `tool_use` Edit/Write blocks in the transcript → a per-session "files changed
    +X −Y" surface is in-scope, not optional.
  - **At-a-glance session list with a real status model** richer than running/done
    (Ready/Running/Paused; phase columns; Working/Needs-input/Completed).
  - **Keyboard-first w/ command palette** (Cmd+K in Conductor + Sculptor; Squad fully keyboard;
    persistent command legend) — a craft boundary for "feels like the references."
  - **Local-first**, wraps (never replaces) the Claude Code CLI; manages real processes.
- **Shared by ALL anti-targets** → the 0-anchors / what to avoid:
  - Passive observation with no way to act on a session (telemetry wall).
  - Hand-maintained status that lies about real agent state.
  - No unified fleet view, no grouping, no shared memory (raw DIY).
- **The combination NONE of them have** (good targets AND baseline) → our originality 10-anchors:
  1. **Unified cross-session live action feed** — every reference scopes activity to the selected
     session; a single feed across all sessions exists nowhere.
  2. **GUI command surface wrapped around a REAL attachable terminal** — Squad has the terminal but
     no GUI; the GUI tools have no shell entry. The fusion is absent.
  3. **Directory-grouped multi-project view** — references are flat or worktree-per-task; baseline
     filters but does not group.
  4. **Cross-session shared markdown memory** (per-dir file + one global), concurrent-write-safe —
     absent everywhere (Claudia's per-project CLAUDE.md editor is the nearest, and it is single-file,
     not cross-session shared).
- **Per-category bar (the empirical 10 the references collectively define):**
  - Functionality 10: every primary flow works incl. awkward inputs; sessions auto-discovered &
    grouped by real cwd; live action feed streams across all sessions; attach → type → see output →
    detach (process survives) → reattach all work on a real pty; many sessions write memory with **no
    corruption**.
  - Craft 10: keyboard shortcut + Cmd-K for every major action; near-real-time streaming (≈Squad's
    100 ms); state persists across reload; **every edge/error state designed** (empty fleet, dead
    session, malformed JSONL line, pty exit, memory write conflict); stays responsive at 7+ sessions
    over large transcripts.
  - Design 10: clear hierarchy to the primary action; directory groups legible at a glance; status by
    color/icon/animation; consistent component system (Claudia/shadcn bar); co-visible panels
    (Nimbalyst three-panel) — explicitly NOT the chart-dense telemetry wall of anti-A.
  - Originality 10: the absent combination above, plus one fresh signature move in the spirit of
    Pairing Mode / attempt-comparison / branching timeline.

## Discrepancies for the human (pre-loop checkpoint)

1. **Diff/file-change surface** is universal in the good targets but was not named in the request. It
   is cheap here (derive from Edit/Write `tool_use` blocks). → folding in as a craft/functionality
   criterion (a sharpening, not a rescope).
2. **Per-session git isolation (worktree/container)** is universal in the good targets — but those are
   *spawn-a-task* orchestrators; this build is *monitor + attach existing sessions in their real
   repos*. Worktree isolation is therefore **deliberately NOT adopted** (it belongs to a different
   product model than the human asked for). Optional "dispatch a new session into a chosen dir" stays
   in scope without forced isolation. Surfaced so the non-adoption is explicit, not silent.
3. **Command palette + richer status model** (blocked / waiting-on-tool / context-limit) are reference
   norms worth encoding as craft/design criteria.
</content>
