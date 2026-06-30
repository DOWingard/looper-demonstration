# Contract — command-center

Negotiated between the generator and the evaluator from the planner's spec. **This, not the
spec, is what gets graded.** Every criterion is scored 0–10 with calibration anchors so the
score is objective and the fitness number means something. Every criterion is checkable by the
evaluator **exercising the running app** (Playwright in a browser) against synthetic fixtures
and a stand-in interactive `CC_SESSION_CMD` — never by reading source.

- Target build: A local-first web Command Center that auto-discovers many concurrent Claude Code CLI sessions, groups them by real project directory, streams a unified cross-session live action feed from on-disk transcripts, attaches/detaches/reattaches real shells via node-pty, and shares concurrent-write-safe markdown memory per directory and globally.
- Size class / criteria count: medium / 40
- Category allocation: functionality 14 · craft 11 · design 9 · originality 6
- Priority: functionality > craft > design > originality
- Stopping target fitness: 0.95 (asymptote band [0.85, 0.95])
- Calibration references — good: Claude Squad, Conductor, Sculptor, Nimbalyst, Vibe Kanban, Claudia/Opcode; floor = native `claude agents` Agent View · anti: Enterprise OTel dashboards (Datadog/Dynatrace), generic kanban/PM repurposed, raw DIY (N terminals + `tail -f` JSONL)

Each criterion id is the key in `evals.jsonl.scores`. Ids are stable across cycles so the
trajectory stays comparable. The evaluator exercises against fixtures from the build's own
generator (`CC_PROJECTS_DIR`), memory under `CC_MEMORY_DIR`, and a stand-in interactive
`CC_SESSION_CMD`. Assertions describe **observable outcomes**, not how to build them.

**Gradeability principle.** Where a property would otherwise be an implementation detail (e.g.
"only the new delta is parsed", "no full-history parse", "reads cwd not the dir name"), the
anchor is restated as an *observable proxy* the running app must exhibit. Design (d*) and the
non-derivative judgments (o4) are graded from the **rendered output and exercised behavior** by
the human judge — still observation, never source. The exact stand-in/fixture seams the anchors
assume are listed in **Evaluation harness** at the bottom; the build must be built to expose
them or the corresponding criteria cannot reach 10.

## Functionality (14)

| id | assertion (scored 0–10) | 0 = | 10 = |
|----|-------------------------|-----|------|
| f1 | Sessions are auto-discovered from CC_PROJECTS_DIR and grouped under their real project cwd | a flat ungrouped list, or — on the conflict fixture — sessions filed by decoding the dir name instead of the record's cwd; or no grouping at all (raw-DIY) | across ≥3 dirs each holding multiple sessions, every fixture session appears under the cwd carried in its records; on the **cwd-vs-dirname conflict fixture** (dir name encodes path A, records' `cwd` = path B) the session groups under B — proving cwd is read, not just the dir name decoded |
| f2 | Transcript JSONL parses to the real schema and survives a malformed line | one bad or partial line blanks or crashes the session or the whole app | the malformed line is skipped AND the skip is surfaced (a visible "N skipped/malformed" indicator on that session), every valid record around it still renders, and the UI never blanks |
| f3 | Per-session status is inferred richer than running/done | only running/done, or a status that misreads the controlled-recency fixtures | working / waiting-for-input / idle / done are each correctly shown, induced by fixtures with crafted last-record type + timestamp recency (recent tool_use → working; trailing assistant text with no newer user record → waiting-for-input; quiet-but-recent → idle; stale → done) |
| f4 | An append to a session's .jsonl surfaces live without a reload | the change needs a manual refresh | appending a record via the fixtures append mode surfaces in the UI near-real-time with no reload, AND appending to one session does not reset/flicker other sessions' rows, selection or scroll (observable proxy that the whole tree is not re-read) |
| f5 | One chronological feed merges major actions across ALL sessions and dirs, live | activity is scoped to the selected session only; there is no merged fleet feed (the gap in every reference) | a single fleet-wide feed interleaves tool_use actions from all sessions in **timestamp order** (assert ordering across sources), each item naming its source session + dir, with main-thread vs subagent (isSidechain/agentId) visibly distinguished |
| f6 | A selected session renders a legible streaming transcript with tool-call visualization | a raw JSON dump; thinking/text/tool_use indistinguishable; results detached | each block kind (thinking/text/tool_use) is visually distinct, tool calls show name plus an input summary, and each tool result attaches to its originating call (Nimbalyst streaming-transcript bar) |
| f7 | A per-session files-changed +X/−Y surface is derived from Edit/Write blocks | there is no file-change surface | a first-class per-session surface lists touched paths with add/delete counts; on a crafted case (Write of an N-line new file → +N/−0; Edit replacing one line → +1/−1) the paths and counts are correct and directionally right |
| f8 | A new or attached session runs CC_SESSION_CMD interactively in a real pseudo-terminal | no real shell, a fake static echo, or a non-interactive `claude -p` | attaching runs the interactive stand-in in a node-pty; typing a probe that requires computation/state (the stand-in returns 4 for `2+2`, or echoes a session-specific token only it holds) yields the correct live response — proving a real interactive process, not a canned echo; never `-p`, not tmux |
| f9 | Detach leaves the process running and reattach restores the same live session | detach kills the process, or reattach yields a fresh/blank process (counter reset) or no scrollback | with the **heartbeat stand-in** (emits a monotonic per-second counter): attach (counter at K) → type a marker, see output → detach → wait T s → reattach shows the counter at ≈K+T (it kept running while detached) AND the earlier marker is still in scrollback (same live pty, history intact) |
| f10 | A new session can be dispatched from the UI into a chosen project directory | dispatch is impossible, or the session starts in the wrong cwd or ungrouped | a UI dispatch control launches a CC_SESSION_CMD pty into a chosen real dir; the stand-in reports its cwd as that dir (prints cwd on launch / answers a pwd probe), the session appears under that dir's group, and it is attachable like any other |
| f11 | Per-dir and global markdown memory are readable and writable from the UI | there is no memory, edits do not persist, or it is not plain markdown on disk | a directory's memory file and the one global file both read and write from the UI and persist to CC_MEMORY_DIR as plain markdown (the eval reads the on-disk file to confirm content + markdown form) |
| f12 | Concurrent memory writers produce no corruption and no lost writes | concurrent writes interleave/tear a line, corrupt the file, or any write is silently dropped | firing the **K-writer probe** (K≥50 simultaneous appends, each a unique full-line token) leaves all K tokens present exactly once and intact (no torn/interleaved line) in BOTH the on-disk file and the UI, and the memory still parses/loads as markdown |
| f13 | Missing required env config fails fast before serving | a silent default, a broken-but-running start, or an unclear failure | launched with the required config unset the app exits non-zero within a short bound and prints actionable stderr **naming the missing var(s)**, and no server ever binds (the browser cannot connect); with exactly those named vars set it serves and the browser loads. The build must declare ≥1 required-no-default var; if nothing fails fast, this scores 0 |
| f14 | The fixtures generator produces schema-faithful synthetic data that drives the whole app | there is no generator, or its output does not flow through the real discovery/parse/feed path | one command writes schema-faithful synthetic JSONL across ≥3 dirs with multiple sessions, tool_use variety, sidechains, ≥1 malformed line, a **spread of timestamp recencies** (so every f3 state is inducible) and an append-over-time mode; pointing the app at it populates discovery, feed and status end-to-end |

## Craft (11)

| id | assertion (scored 0–10) | 0 = | 10 = |
|----|-------------------------|-----|------|
| c1 | A Cmd/Ctrl-K command palette plus shortcuts reach every major action | no palette; primary actions are mouse-only | Cmd/Ctrl-K opens a searchable palette, and switch-session, attach, jump-to-dir, open-memory, filter-feed and dispatch are each reachable and operable from the keyboard (Conductor/Sculptor bar) |
| c2 | Live surfaces update within a ~100 ms-class latency of an on-disk change | updates are seconds-late or refresh-gated | measured lag from on-disk append to UI reflection is sub-second / ~100 ms-class (Squad preview); mid credit at ≤1–2 s; 0 if it needs a manual refresh or takes multiple seconds |
| c3 | Workspace state persists across reload | reload resets selection, filters and panel sizes to defaults | selected session/dir, panel sizes, feed filters and attach intent are substantially restored after reload (Nimbalyst window-state persistence) |
| c4 | Every edge and error state is deliberately designed | unhandled errors, raw stack traces, or a blank UI on any edge | empty fleet, dead/stale session, malformed JSONL, pty exit/crash, memory write conflict and WS disconnect each render a legible intentional state and none crash or blank — each induced by the eval (empty fixtures dir, stale-timestamp fixture, malformed line, an exiting stand-in, the K-writer probe, a forced WS drop) |
| c5 | The app stays responsive at 7+ concurrent sessions over large transcripts | janky, blocks on load, or freezes while large transcripts load | at 7+ concurrent sessions over large generated transcripts, initial load stays bounded (does not scale to many seconds with history size) and UI interactions stay responsive (a click/keypress responds within a small bound) during load and live updates |
| c6 | One control toggles a session's pane between live output and its diff in place | there is no toggle, or it navigates away or loses the selection | a single control or keystroke swaps the session pane between live output and its file-change/diff view in place, selection intact (Claude Squad tab-toggle) |
| c7 | Each session surfaces live at-a-glance metadata | no glanceable metadata, or it is static and goes stale | rows show time-since-last-change, currently-active tool, session age and +X/−Y, and these update live (append → the row's metadata updates) without opening the session (Nimbalyst per-turn metadata) |
| c8 | The embedded terminal has xterm-class fidelity | fixed size, no ANSI, no scrollback, broken copy/paste | resizing the pane reflows the pty; the stand-in's ANSI color + cursor render correctly; emitting many lines gives working scrollback; terminal text is selectable and copy lands on the clipboard |
| c9 | The unified feed is filterable by directory, session and action type | there is no filtering; the feed is an unfilterable wall | applying a dir / session / action-type filter narrows the feed correctly and clearing restores it, with the filter reachable from the keyboard |
| c10 | A session can be peeked and inspected without losing current navigation | the operator must navigate into a session to see anything, losing their place | hovering or peeking a non-selected session shows its latest activity in a popover and dismissing leaves the current selection unchanged (Nimbalyst hover-card / baseline Peek) |
| c11 | The client auto-recovers live streaming after a WebSocket drop | a dropped socket dead-ends the UI and needs a manual reload | a forced WS drop/restart shows a connection state, then auto-reconnects and resumes streaming (a post-reconnect append appears) with no manual reload |

## Design (9)

| id | assertion (scored 0–10) | 0 = | 10 = |
|----|-------------------------|-----|------|
| d1 | Visual hierarchy guides the eye to the primary action and to what needs the operator next | no hierarchy; the primary action and the session that needs attention are lost among equals | clear emphasis routes attention to the primary operate action, AND the session(s) that most need the operator (waiting-for-input) are the most salient/surfaced — so the next action is findable at a glance (Conductor/Nimbalyst legibility + the baseline's needs-input triage) |
| d2 | The three core surfaces are co-visible without context-losing tab-switches | single-pane or modal-buried; the differentiators require tab-switching that loses context | directory-grouped session list, unified feed / per-session activity, and files-changed plus memory are co-visible together without a tab switch (Nimbalyst three-panel) |
| d3 | Project directories read as first-class legible groups | a flat list where grouping is not visually obvious (the baseline is flat) | each dir is an obvious lane whose header carries name, session count and aggregate status, and a newly-appeared dir is instantly distinguishable |
| d4 | Session status is communicated by color plus icon plus motion, not text alone | status conveyed by text only, or states visually indistinct | each status is pre-attentively legible via a distinct color AND icon, with subtle motion on active states (e.g. a working pulse) — verifiable on the rendered rows |
| d5 | A single coherent component system runs across all panels | mismatched or unstyled controls, inconsistent spacing and type | controls, spacing and type share one cohesive visual language across every panel, reading as one designed product (Claudia/shadcn-class) — judged from the rendered UI, not the dependency list |
| d6 | A persistent command legend keeps key actions discoverable | actions are hidden; the user must already know the shortcuts | a persistent legend or hint bar keeps primary shortcuts visible or one keystroke away at all times (Claude Squad legend) |
| d7 | The surface reads as something to operate, not a telemetry wall to observe | aggregate metric tiles and spend-over-time charts dominate, with no attach/peek/dispatch/reply affordances (Datadog/Dynatrace anti) | attach, peek, dispatch and reply are present and prominent; any telemetry is absent or clearly subordinate — an inventory of the visible surface is action-first, not chart-first |
| d8 | Fleet-scale information stays uncluttered and scannable | cramped, noisy or chart-dense; the fleet view is hard to scan | at generated fleet scale (many dirs, sessions and feed items) the view stays readable with intentional density and whitespace rather than a wall |
| d9 | The layout holds together across viewport sizes | overlapping or clipped panels, broken scroll, or unusable when resized | across viewport widths (wide → narrow, driven by Playwright) panels resize and collapse gracefully and the co-visible layout degrades sensibly, with no overflow or broken scroll |

## Originality (6)

| id | assertion (scored 0–10) | 0 = | 10 = |
|----|-------------------------|-----|------|
| o1 | The four differentiators interlink as one connective flow | they are four disconnected tabs with no cross-navigation | from a feed item the operator jumps to its session, attaches its terminal, and writes a note into that dir's memory as one unbroken click-path — each hop lands on the right session / dir / pty / memory file |
| o2 | The absent four-way combination is the product's spine, not a bolt-on | only one or two differentiators are real, reducing the product to an existing reference | directory-grouped view, unified cross-session feed, attachable terminal and cross-session memory are all live, real and central in one session together — a combination no reference nor the baseline has |
| o3 | One signature move beyond the table-stakes four is demoable on fixtures | nothing memorable exists beyond the four differentiators | one clearly identifiable, discoverable original mechanic (e.g. feed-item → pin-to-memory trail, a directory-context card, a while-you-were-away digest, or a memory scratchpad surfaced inside every session) demos end-to-end on fixtures + stand-in alone |
| o4 | The signature move is native to this substrate, not a reference clone | a recognizable copy of Pairing Mode / attempt-comparison / branching timeline, or a generic widget | the exercised move demonstrably falls out of THIS product's cross-session feed + shared memory + real attach — memorable and not a reference clone |
| o5 | A cross-fleet "since you last looked" digest answers what happened while away | there is no away-view; the operator must attach to each session to know | after a baseline view, appended cross-session activity is summarized in one place with source attribution, answering "what happened across my sessions while away" at a glance — the gap the native baseline leaves |
| o6 | Notable actions form a durable, provenance-tagged audit trail | actions are ephemeral, with no trail, no provenance, lost on reload | a reconstructable trail from feed plus memory records notable actions and decisions, each tagged with its source session/dir, and the trail survives reload |

## Evaluation harness — stand-in behaviors the anchors assume

So the build is built to be gradeable, the evaluator will drive it with these seams. A build
that does not expose them cannot reach 10 on the dependent criteria.

- **Heartbeat stand-in** (`CC_SESSION_CMD` mode) — for f8, f9, c8: emits a monotonically
  increasing per-second counter, renders ANSI color + cursor moves, can produce many lines of
  scrollback, prints its cwd on launch, and answers a computed/stateful probe (returns `4` for
  `2+2`, or echoes a session-unique token). Lets f9 prove "process survived detach" purely
  in-UI (counter advanced + scrollback intact), and f8/f10 prove a real interactive process.
- **Controlled-recency + conflict fixtures** (generator, f14) — for f1, f3: records stamped
  across a recency spread so working/waiting-for-input/idle/done are each inducible, plus a
  **cwd-vs-dirname conflict fixture** (directory name encodes one path, records' `cwd` another)
  to prove grouping reads `cwd`.
- **K-writer probe** — for f12: the eval fires K≥50 concurrent appends (in-page `Promise.all`
  of writes, or parallel requests) each carrying a unique full-line token, then asserts all K
  land intact + once + the file still parses.
- **Self-describing fail-fast** — for f13: launched with required config unset, the app's
  stderr names what is required; the eval sets exactly those and confirms it serves and binds.
- **Induced edges** — for c4, c11: empty fixtures dir, a stale-timestamp fixture, a malformed
  line, an exiting stand-in, and a forced WS drop/restart are all eval-inducible.

> Note on coverage: the lived first-use / "find my next action" dimension is folded into **d1**
> (next-action triage to waiting-for-input sessions) rather than spent on a 41st criterion;
> the 14/11/9/6 allocation is unchanged.
