# Looper Demonstration — Command Center

A recorded, end-to-end run of the **`/looper`** skill — a self-maintaining
generator–evaluator agent loop that builds a non-trivial software target to a quantitative
fitness bar and stops when the trajectory says it has converged.

This is the **`demonstration`** submodule of the looper skill. A plain clone of the skill does
**not** include it; fetch it with:

```bash
git clone --recurse-submodules <looper-skill-repo>
# or, in an existing clone:
git submodule update --init demonstration
```

The run is captured under `.looper/command-center/` in two halves:

- **`state/`** — the loop's memory on disk: the empirical reference analysis, the planner's
  spec, the negotiated contract (the rubric that gets graded), the per-cycle eval history, and
  the append-only log. The *record of how the software was built*.
- **`build/`** — the actual software the loop produced (source only; `node_modules/` and
  `dist/` are gitignored — run `npm install`).

## How the loop works (in one breath)

An **orchestrator** runs three disjoint roles in separate contexts so none can grade its own
work: a **planner** turns empirically-ingested references into a spec; a **generator** builds;
an **evaluator** *uses* the running software as a hostile human judge and scores it. Each
criterion is scored 0–10 across four categories — **functionality / craft / design /
originality** — and fitness is their **RMS, normalized to [0,1]**. A trajectory classifier
reads the fitness history and recommends **continue / restart / stop**; the orchestrator decides.

---

## The result — a Claude Code session command center, converged at fitness **0.9952**

A local-first web Command Center for many concurrent Claude Code CLI sessions, running against a
real fleet (161 sessions across 17 project directories):

![The Command Center running against a live Claude Code fleet — directory-grouped sessions (left), the unified cross-session action feed (center), an attached node-pty terminal, and the changes/memory/trail panel (right).](.looper/command-center/state/screens/command-center.png)

### What started it

> Build a local-first web Command Center for many concurrent Claude Code CLI sessions —
> **(1)** auto-discover sessions and **group them by project directory** (real `cwd`);
> **(2)** a **unified cross-session live action feed** read from the on-disk transcripts;
> **(3)** **interactive terminal attach/detach/reattach** via node-pty; **(4)** **shared
> markdown memory** (one file per directory + one global file), concurrent-write-safe, behind
> a swappable interface for a future MCP backend.
> Hard constraints: ride the subscription via the *interactive* `claude` CLI in a pty, never
> `claude -p`; config via env vars with fail-fast; local-first.

### Grounding — references and anti-references

The build was calibrated against real prior art, ingested from docs + screenshots (the apps
couldn't be run in the build environment) under an explicit instruction:

> *"If you can't access the software, read docs and explore images of its use to ground the
> spec and contract."*

| Good references (the 10-anchors) | Anti-references (the 0-anchors) |
|---|---|
| **Claude Squad** — real terminal attach/detach | Enterprise OTel dashboards (Datadog/Dynatrace) — *passive telemetry you observe, never operate* |
| **Conductor** — at-a-glance dashboard + review | Generic kanban/PM repurposed — *hand-updated cards, no live session behind them* |
| **Sculptor** — Pairing Mode, per-turn context-% | Raw DIY (N terminals + `tail -f` the JSONL) — *no fleet view, no grouping, no shared memory* |
| **Nimbalyst** — three-panel co-visibility, file deltas | |
| **Vibe Kanban** — attempt comparison, embedded preview | |
| **Claudia / Opcode** — reads `~/.claude/projects`, local-first | |

The decisive finding, true across every reference *and* the native `claude agents` view: none
fuses a **GUI command surface + a real attachable terminal + directory grouping + a unified
cross-session feed + shared memory**. That absent combination became the product's spine.

### The run

Medium app → **40 criteria** (functionality 14 · craft 11 · design 9 · originality 6),
built test-first with a mutation check, and graded by driving the running UI in **Playwright**
against synthetic fixtures + a heartbeat stand-in (so every criterion — including
detach-survives and 60-writer memory safety — is verifiable without a live subscription).

| Cycle | Fitness | Outcome |
|------:|:-------:|---------|
| 1 | **0.9330** | core flows working end-to-end |
| 2 | **0.9612** | closed the polish gaps; cleared the 0.95 target |
| 3 | **0.9952** | user-elected polish loop (bar raised to 0.98); converged |

Only two of forty criteria finished at 9/10, both design — a distinctive visual language and
holding three-panel co-visibility at phone width — honest subjective ceilings, not defects.

### The software

- **Directory-grouped discovery** — reads the real `cwd` from each transcript (proven on a
  `cwd`-vs-dirname conflict fixture), tails recent activity instead of parsing all history.
- **Unified cross-session action feed** — one timestamp-ordered stream across the whole fleet,
  main-thread vs subagent tagged, filterable, burst-collapsed at density.
- **Attachable terminals** — a real `node-pty` per managed session (no tmux); detach leaves the
  process running; reattach restores scrollback.
- **Concurrent-safe shared memory** — per-directory + global markdown, survives 60 simultaneous
  writers with no lost or torn writes, behind a swappable interface.
- **Signature move — Pin-to-Memory Decision Trail** — one keystroke pins any feed action into
  its directory's memory as a provenance-tagged card and into a durable audit trail; it can
  only exist on this substrate (cross-session feed + shared memory + on-disk provenance).
- **Product model — monitor + attach.** It watches *all* your sessions read-only and gives full
  two-way control of sessions it launches. It deliberately does **not** adopt the
  worktree/container isolation the spawn-a-task references use.

### Run it

```bash
cd .looper/command-center/build
npm install                                   # compiles node-pty; builds dist/ on first start

# demo mode — synthetic fixtures + a zero-cost heartbeat stand-in:
CC_PROJECTS_DIR=/tmp/cc-proj node fixtures/generate.js init
CC_MEMORY_DIR=/tmp/cc-mem CC_PROJECTS_DIR=/tmp/cc-proj \
  CC_SESSION_CMD="$PWD/fixtures/heartbeat.js" CC_PORT=4178 npm start   # → http://127.0.0.1:4178

# real mode — drop CC_PROJECTS_DIR (defaults to ~/.claude/projects) and set CC_SESSION_CMD="claude"
```

`CC_MEMORY_DIR` is required and fails fast if unset; `npm test` runs the suite.

### Where to look

| Path | What it is |
|---|---|
| `.looper/command-center/state/references.md` | empirical analysis of the 6 good + 3 anti references |
| `.looper/command-center/state/feature_list.json` | the planner's 31-feature spec |
| `.looper/command-center/state/contract.md` | the negotiated 40-criterion rubric with 0/10 anchors |
| `.looper/command-center/state/evals.jsonl` | per-cycle scores + fitness (the objective-function history) |
| `.looper/command-center/state/log.md` | append-only run log (intake → plan → contract → build/eval → stop) |
| `.looper/command-center/state/architecture-notes.md` | measured toolchain, real transcript schema, gradeability seams |
| `.looper/command-center/build/` | the software |

---

## Reproduce

Run your own: invoke `/looper` with a build target, ≥3 good references, ≥3 anti-references, a
category priority, and a stopping fitness. The orchestrator does the rest and records it as a
new `.looper/<slug>/`.
