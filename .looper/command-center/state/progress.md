# Progress — command-center

Loop: 1   Cycle: 3   Latest fitness: 0.9612 (cycle 2)   Attractor: converged (target raised 0.95→0.98)

Cycle 3 is the user-elected polish pass: lift the sixteen residual 9s toward their 10-anchors
without regressing the twenty-four tens. **73 unit tests green (was 55)**; three new pure
load-bearing modules (`virtual`, `persist`, `digestneeds`) plus three new memory-store tests,
all passing the mutation protocol. Both `window.prompt` quick-actions are gone — replaced by
an inline dispatch dialog and a reusable note/pin composer. Verified live with Playwright:
17/17 feature checks, the feed DOM stays bounded (~14–22 rows) at a 1000-item / 96-session
scale, and f8/f9 (interactive pty + detach-survives) and c11 (WS reconnect) re-confirmed via
direct WS clients with no console/page errors. Run commands below are unchanged.

## ▶ How to run it (exact commands — evaluator)

Build dir: `/home/null/Desktop/work/command-center/.looper/command-center/build`
Open URL after launch: **http://127.0.0.1:4178**

```bash
cd /home/null/Desktop/work/command-center/.looper/command-center/build

# 0. one-time: install deps (compiles node-pty natively; node 26 + make/g++ present)
npm install                       # dist/ is already pre-built; `npm run build` rebuilds it

# 1. write synthetic fixtures into a projects dir (REQUIRED before launch)
CC_PROJECTS_DIR=/tmp/cc-proj node fixtures/generate.js init

# 2. launch (single command). CC_MEMORY_DIR is REQUIRED-no-default (fail-fast).
CC_MEMORY_DIR=/tmp/cc-mem \
CC_PROJECTS_DIR=/tmp/cc-proj \
CC_SESSION_CMD="node /home/null/Desktop/work/command-center/.looper/command-center/build/fixtures/heartbeat.js" \
CC_PORT=4178 \
npm start
# -> serves http://127.0.0.1:4178
```

Harness seams:
- **Fail-fast (f13):** launch with `CC_MEMORY_DIR` unset → exits non-zero, stderr names `CC_MEMORY_DIR`, never binds. Set it (+ the others) → serves.
- **Heartbeat stand-in (f8/f9/c8):** `CC_SESSION_CMD="node .../fixtures/heartbeat.js"`. Prints cwd on launch; per-second monotonic `tick N`; ANSI color + cursor-move animation; `2+2`→`4`; `token`/`whoami`→a session-unique token; `pwd`→cwd.
- **Fixtures append / live (f4/f14):** `CC_PROJECTS_DIR=/tmp/cc-proj node fixtures/generate.js append` (one live action) or `... live 1500` (loop). Regenerate `init` right before launch so the "working" fixtures are fresh (status window is 5 min; `CC_NOW=<iso>` pins "now" if needed).
- **K-writer probe (f12):** `POST /api/memory {scope:'dir',cwd,content:'<unique line>',mode:'append'}` fired K≥50× concurrently → all land once, intact, file still markdown.
- **Forced WS drop (c11):** kill/restart the server → client shows a reconnect banner, auto-reconnects, post-restart appends surface with no reload.
- **Tests + mutation:** `npm test` (55 tests, node:test). Frontend bundle: `npm run build` → `dist/`.
- **Browser QA (no gstack binary needed):** Playwright lives in pyenv 3.10.13; drive with
  `/home/null/.pyenv/versions/3.10.13/bin/python` + `playwright.sync_api` (chromium cached).

## Built (end-to-end, all verified)

Backend (Node ESM, `ws` + `node-pty` + `chokidar`, no tmux):
- `src/server/config.js` — env config, fail-fast on `CC_MEMORY_DIR` before any bind (f13).
- `src/shared/parser.js` — JSONL → normalized records, malformed-tolerant, partial-line buffering (f2).
- `src/server/discovery.js` + `tail.js` — tail-recent (last 64 KB/file, cap 160 freshest), never full-history (f1/c5).
- `src/shared/grouping.js` — group by record `cwd` (dir-name decode only as fallback) → conflict fixture groups under cwd (f1).
- `src/shared/status.js` — working/waiting/idle/done from last-record kind + recency; client recomputes live (f3).
- `src/shared/feed.js` — unified cross-session feed in timestamp order, source + main/subagent tagged (f5).
- `src/shared/filechanges.js` — +X/−Y from Edit/Write/MultiEdit (f7).
- `src/server/watcher.js` — chokidar; on change reads only the byte delta from the last offset → live, no tree re-read (f4).
- `src/server/pty-registry.js` — node-pty per session, scrollback ring buffer; detach keeps process alive; reattach replays (f8/f9/f10). Creates a missing target cwd so attach/dispatch land in the real dir.
- `src/server/memory-store.js` — per-dir + global markdown, per-key single-writer queue → K-writer safe; narrow swappable interface read/append/replace/list (f11/f12).
- `src/server/audit.js` (durable provenance trail, o6), `digest.js` (away baseline, o5).
- `src/server/{http-api,ws-hub,static,index}.js` — REST + WS multiplex + SPA serve.

Frontend (React 19 + Vite 7 + Tailwind v4 + xterm), three co-visible panels:
- Dir-grouped session list with status color/icon/motion, live metadata, hover-peek (d1/d3/d4/c7/c10).
- Unified feed + filters; per-item jump → attach → pin (f5/c9/o1).
- Session detail with in-place Activity/Diff/Terminal toggle (f6/f7/c6/c8).
- Right panel: files-changed + shared-memory editor + Decision Trail (f7/f11/o6).
- ⌘K command palette (c1), persistent legend (d6), away-digest (o5), help, designed edge states (c4), WS auto-reconnect + keepalive watchdog (c11), localStorage workspace persistence (c3), responsive wide→narrow (d9).

### Signature move (o3/o4): Pin-to-Memory Decision Trail
Any feed action pins (one click / `p`) into its directory's shared memory as a provenance-tagged
markdown decision card AND into the durable audit trail. It is native to this substrate — it can
only exist because there is a cross-session feed + shared memory + on-disk provenance together —
and it is the connective tissue of the four-way flow (feed → session → attach → note-to-memory).

## Cycle 2 — what changed (lowest-scoring first)
- **c7 (was 8) — negative session age, FIXED.** Root cause: `model.summarize` computed
  `ageMs = lastTs − firstTs` from the *array-order* first/last record. The generator stamps
  idle/done terminal records staler than the conversation body, so last < first → negative
  (3 sessions: api-done, api-idle, webapp-history). New pure `src/shared/sessiontime.js`
  takes MIN/MAX timestamps (order-independent) and clamps elapsed at ≥0; `firstTs`=min,
  status anchor `lastTs` stays the terminal record (f3 unchanged). Client recomputes age/
  since live each tick from the summary (`liveAge`/`liveSince`), clamped. TDD + mutation
  below. Verified: all ages ≥0 in API and UI ("age 53m 39s" on api-done).
- **c8 (was 8) — clipboard copy now lands.** `Terminal.jsx`: robust `writeClipboard`
  (async Clipboard API → execCommand fallback), a DOM `copy`-event handler that injects
  xterm's selection (covers native/programmatic copy), and a Copy button that appears on
  selection. Verified: 254 chars read back from `navigator.clipboard` after Ctrl+C.
  Reflow/ANSI/scrollback untouched.
- **c3 (was 8) — reload restores the working context.** `panels` + `attachIntentKey` were
  already persisted; the gap was that the selection's side-effects never re-ran on reload.
  Added `rehydrateFromPersisted()` after the hello snapshot: reloads the selected session's
  transcript + dir memory, reattaches the terminal (centerMode/attachIntent), and clears a
  stale selection. Verified: selection + leftW(301) + terminal + detail all restored.
- **d9 (was 7) — narrow viewport.** `TopBar` collapses at <760px: subtitle/extra status
  badges hidden, action buttons go icon-only ("⌘K"), header is `overflow-hidden` + `min-w-0`.
  Verified at 480px: body scrollW == innerW (no overflow), primary button right=448 ≤ 480
  (not clipped), Sessions/Activity/Context tab bar present.
- **d8 (was 8) — feed burst-collapse.** New pure `src/shared/feedgroup.js` collapses runs
  of ≥4 same-session items within 45s into one expandable "burst" row (default on; `c`
  toggles; header shows the burst count). Per-session only, so cross-session interleaving
  and main-vs-subagent (f5) are preserved. Verified: "50 actions BURST ×50" renders.
- **f2 (was 9) — malformed badge.** Cryptic `!1` → legible amber pill "⚠ N skipped" on the
  session row and in the detail header, with an explanatory tooltip.
- **f6 (was 9) — per-turn transcript metadata.** Each assistant turn now shows a meta line:
  turn clock time, the tool it ran, and that turn's +X/−Y (reusing `computeFileChanges`).
- **d4/d5 (was 9) — status motion.** Added a `cc-spin` keyframe; the working glyph rotates
  (plus the existing pulse), honoring `prefers-reduced-motion`.
- **o3/o4 (was 9) — pin discoverability.** The pin affordance on every feed item is now
  always visible (brand-tinted, not hover-only); the feed header carries a "pin → trail"
  hint that opens the Decision Trail; `c`/`p` added to the legend + Help. Still native to
  this substrate (feed + shared memory + audit), not a reference clone.

## Mutation test results (protocol satisfied)
Cycle 1: six faults (status/filechanges/parser/feed/grouping/memory) each went RED, restored GREEN.
Cycle 2 (new load-bearing logic):
- `sessiontime.js` sign flip (`now−ts` → `ts−now`) → sessiontime.test RED (2 tests: age≥0,
  future-clamp). Restored GREEN.
- `sessiontime.js` min/max swap (`ts < firstTs` → `ts > firstTs`) → sessiontime.test RED
  (3 tests: min/max, age, untimed-skip). Restored GREEN.
- `feedgroup.js` `sameSession && close` → `||` → feedgroup.test RED (3 tests: interleave,
  gap-break, burst+single). Restored GREEN.
Full suite GREEN after every restore: 55/55.

## Verified behaviors (Playwright + API)
f1 4 dirs incl. realBeta-not-decoyAlpha · f2 malformed counted (!1) · f3 all 4 statuses · f4 append
surfaces live · f5 feed interleaved + subagent tagged · f6 transcript · f7 +13/−1 · f8 `2+2`→`4`
+token+cwd · f9 counter advanced while detached + scrollback intact · f10 dispatch reports chosen
cwd + live badge · f11 markdown on disk in correct dir · f12 60 concurrent appends, 0 lost/torn ·
f13 fail-fast names var, no bind · f14 generator drives discovery/feed/status · c4 empty fleet ·
c6 diff toggle · c8 ANSI cursor + scrollback · c11 banner + recover + live append · responsive narrow.

### Cycle 2 re-verification (Playwright + API, no regressions)
- c7: every session ageMs/sinceMs ≥ 0 in `/api/state` and UI; api-done "age 53m 39s"; live tick.
- c8: Copy button on selection + Ctrl+C → 254 chars on `navigator.clipboard` (read back).
- c3: select + resize(leftW 301) + attach → reload → selection/panel/terminal/detail restored.
- d9 @480px: no horizontal overflow (body scrollW==innerW), primary button not clipped, tab bar.
- d8: burst row "50 actions ×50" + group toggle; f5 still interleaved + subagent-tagged.
- f2: "⚠ 1 skipped" pill on infra-working. f6: per-turn clock+tool lines in transcript.
- No-regression spot checks: f1 realBeta-not-decoyAlpha, f4 live append 84→85 no reload,
  f7 +12/−0 & +1/−1 in Changes, f11 markdown on disk, f13 fail-fast, o3 pin→memory+audit.
  Zero console/page errors across all flows. 55/55 unit tests green.

## Next (remaining headroom toward 0.95)
- Replace the two `window.prompt` quick-actions (note/custom-dispatch) with inline inputs
  (Playwright auto-dismisses prompts; primary paths already avoid them).
- Memory markdown preview/render toggle; code-split xterm to shrink the ~556 KB bundle.
- Optional: a first-run coachmark pointing at the pin affordance (current hint is persistent).
