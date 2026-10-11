# Issue maintenance — state & model routing (#188, #189, #205)

- **Group key:** `state-routes`
- **Worktree:** `/Users/nanmi/.codex/worktrees/issue-state-routes/dsh-agent-teams`
- **Branch:** `codex/issues-20261010-state-routes`
- **Baseline commit:** `1e1c624fd2e909008aa5228a004706b3e4460670`
- **Baseline checkout (pristine, reusable for review):** `/private/tmp/agentteams-issues-20261010/state-routes/baseline-checkout`
- **Evidence root (all temporary artifacts):** `/private/tmp/agentteams-issues-20261010/state-routes/` — every `logs/`, `cases/`, `baseline/` and harness path below is relative to that root, not to this repository.
- **Host under test:** `@deepseek-ai/dsh` **0.2.0-rc.2** (this repo's `devDependencies`, exact). Baseline and candidate used the **same** CLI binary, the same profiles and the same inputs; only the linked plugin checkout differed.
- **Model route:** `deepseek-account` / `deepseek-flash` / `reasoningEffort: max` — the existing authenticated desktop account service. No API key was configured, read, copied or printed; the `deepseek-official`/API-key route and all mock providers were excluded.
- **Real host catalogs observed:** `deepseek-account` → `deepseek-flash`, `deepseek-v4-pro`; `openai-codex` → `gpt-5.3-codex-spark`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`. `openai-codex` comes from the pre-existing `llm-pi-ai` providers map in the user's `web` profile (an `apiKeyEnv` reference only). It supplied a genuine second catalog and a genuine captain route; **no generation request was ever sent to it**.

This report records all three issues in the group. Nothing was pushed, published, closed, or commented on GitHub.

---

## 1. Issue #188 — `line: -1` in a task finding bricks the entire team

### Original failure (baseline, reproduced)

Script: `cases/issue-188-case.mjs` against `baseline-checkout/lib/*.js`, real on-disk `team.json`, real `readTeam` / `readTeamSync` / `writeTeam`.

- `readTeam` throws `invalid AgentTeams state in team "repro"` for a record whose only defect is `findings[0].line = -1`. Removing that one field makes the same file read clean, exactly as reported.
- `readTeamSync` has the identical brick.
- The message names neither the task nor the field — no path to recovery except hand-bisecting the file.
- The write side persisted `line: 1.5` and then could not read back its own output (write/read contract drift).
- Baseline artifact: `baseline/issue-188-case-baseline.json` — **20/32 checks passed, exit 1**.

### Fix

| Area | Change |
| --- | --- |
| Shared contract | `isValidFindingLine()` in `src/quality-gates.ts` is now the single predicate used by both the write-side parser and `isReviewFinding`, so the two cannot drift again. |
| Write side | `parseFindings()` in `src/tools.ts` persists `line` only when `isValidFindingLine` accepts it. Proven through the **real tool path** below, not only by unit assertion. |
| Read side | `normalizeSentinelNumericTaskFields()` treats an out-of-contract **numeric** sentinel as absent for `round` (min 1), `reviewedAttempt` (min 0), `attempt` (min 0) and `findings[].line` (min 0), so already-written files self-heal. It is reached through `normalizeBlankOptionalTaskFields`, which `coerceTeamState` already calls. |
| Diagnosability | `describeTeamStateDefect()` in `src/state.ts` names the first failing record and field, keeping the existing `invalid AgentTeams state in team "..."` prefix. It runs only on the failure path. |

Deliberately **not** changed: only out-of-range **numbers** are healed. A wrong-typed value (`round: "oops"`, `attempt: {}`, `line: "oops"`, and the `null` that `JSON.stringify` produces for `NaN`/`Infinity`) is still a hard, named validation failure, so genuine corruption is never silently swallowed.

### Original case re-run

- Candidate: `cases/issue-188-case-candidate.json` — **38/38 checks passed, exit 0**.
- Baseline: 20/32, exit 1 — the 12 failures are exactly the repaired behaviours (self-heal, naming, task-scoped diagnostics, exact-file replay).
- Preserved on candidate: `line: 0`, `line: 1176`, `file`, `resolved: false`, `round: 2`, `reviewedAttempt: 0`, `attempt: 3`.

### Write side through the real tool path

`parseFindings` is module-private, so the write guard cannot be exercised without the tool dispatch. The harness `/private/tmp/agentteams-issues-20261010/state-routes/run-188-write.sh` therefore drives real `agent_teams_update_task` calls through `ctx.tools.execute()` with a real captain Agent and reads the resulting `team.json` back from disk:

| step | baseline | candidate |
| --- | --- | --- |
| `update_task` with `line: -1`, `1.5`, `-1176` | persisted all three into `team.json` | persisted **no** `line` key at all |
| every later tool call | `invalid AgentTeams state in team "..."` | succeeded |
| `update_task` with `line: 0` and `line: 1176` | unreachable (team already bricked) | persisted verbatim, with `file` and `resolved: false` |
| `readTeam` on the finished record | threw `invalid AgentTeams state` | read clean |

Logs: `logs/188write-baseline.log`, `logs/188write-candidate.log`.

### Durable regressions (in this repository)

| Issue | File | Candidate | Baseline |
| --- | --- | --- | --- |
| #188 | [scripts/issue-188.test.mjs](../../../scripts/issue-188.test.mjs) — real disk read/write | 9/9 pass | 1/9 pass (8 fail) |
| #189 | [scripts/issue-189.test.mjs](../../../scripts/issue-189.test.mjs) — pure route composition | 9/9 pass | 0/1 fail |
| #205 | [scripts/issue-205.test.mjs](../../../scripts/issue-205.test.mjs) — pure failure disposition | 6/6 pass | fails |

All three are wired into `pnpm verify:issue-regressions`, which `pnpm verify` runs.

Example candidate diagnostic:

```
invalid AgentTeams state in team "repro": task "t2": findings[0].line null must be an integer >= 0 (omit it when there is no line number)
```

---

## 2. Issue #189 — `memberModel` was paired with the captain's provider

### Original failure (baseline, reproduced on the real host)

New harness: `run-189-real.sh`, using the real Loader with two genuinely mounted provider catalogs and a **real captain Agent** whose route is `openai-codex`. The acceptance plugin (`acceptance-plugin-189/acceptance.mjs`) creates that Agent with `ctx.agents.create()` and drives the real plugin tools through `ctx.tools.execute()` — the same dispatch path a model call uses.

- Real captain route: `openai-codex` (no generation request sent).
- Configured `memberModel: deepseek-flash` (served only by `deepseek-account`).
- **Baseline:** `agent_teams_add_member` fails with the exact reported error —
  `pi-ai provider "openai-codex" has no configured model "deepseek-flash" (code UNKNOWN_MODEL)` — and no durable member route is written. Artifact: `logs/189real-baseline.log`.
- **Candidate:** the same call succeeds and `team.json` records `deepseek-account/deepseek-flash`. Artifact: `logs/189real-candidate-final.log`.

### Fix

- `Config.memberLlmProvider` (and `ToolsConfig.memberLlmProvider`) names the LLM provider that owns `memberModel`, distinct from `memberProvider` (the subagent runtime backend).
- `composeMemberRoute()` is the single, pure precedence point: **explicit request > plugin configuration > captain session**.
- `resolveMemberLlmSelection()` resolves an owner from the live catalogs **only** for a bare configured `memberModel` with no provider anywhere, and accepts only an unambiguous owner (zero or several advertising providers produce an actionable error listing them).
- A provider the caller **named** — explicitly or via `memberLlmProvider` — is never silently switched away from; a model it does not advertise is a hard, route-naming error.
- `validateMemberLlmSelections()` already ran on the `add_member` path; the resolver now also fails early with an actionable message.

Two regressions found during review were fixed before acceptance, and are pinned by `scripts/issue-189.test.mjs` (9/9 passing, a supplement to — not a substitute for — the real-host run):

1. A `provider/model` shorthand is **not** implemented. A `/` inside a real model id (`openrouter` + `google/gemini-x`) is part of that id and is never split; `memberModel` is used verbatim.
2. Owner discovery now keys off "the model came from a **configuration default**", not "the model was not the captain's". An explicitly requested model therefore keeps the caller's provider and is never re-routed.

### Coverage boundary

This host mounts exactly one credentialed provider (`deepseek-account`), so a second *usable* provider could not be created here. The reproduction uses the real `openai-codex` catalog and a real `openai-codex` captain route, which is enough to reproduce the reported mis-pairing and to prove the fix; the member itself only ever ran real DeepSeek Flash requests.

---

## 3. Issue #205 — a post-settlement member turn failure left no record

The reporter's correction comment is authoritative: **no delivery was lost**; the surviving point is the narrower one — a member's final turn failure *after* its work settled sometimes leaves no record anywhere.

### Original failure (baseline, reproduced on the real host)

New harness: `run-205.sh`. The official `dsh web` app boots the profile **persistently**, so the member's real turn can finish while its process is still alive (the official `headless` app exits as soon as the root turn quiesces and would take the member with it — an earlier attempt at this case failed for exactly that reason and is kept as `logs/205-candidate-realhost-FAILED-prestep.log`).

Real stack: `workspaceRegistry.create()` → `sessionController.create()`/`selectModel()`/`prompt()` → a real captain turn that creates the team and the task → the **real member Agent** runs a real DeepSeek Flash turn, really completes the task, and the task really settles.

- **Baseline:** after the member settled, its next real turn failed and the captain inbox stayed at **1 line** (the completion notice only). **No durable record of the failure existed anywhere.** Artifact: `logs/205-baseline-realhost.log`.
- **Candidate:** the same flow now appends exactly one durable captain note; the completed task and the idle member are left untouched. Artifact: `logs/205-candidate-realhost-final.log`.

Candidate note, verbatim:

```
Member "policy" hit an unrecoverable turn failure: … (code UNKNOWN).
No open attempt was owned; no task state was changed.
```

### Injected failure — explicit disclosure

The failing turn is a **host-level turn failure**: a test-only plugin throws a genuine `Error` inside a real `agent/pre-step` waterfall listener for that one member, and the host surfaces it through its own `agent/error` path — the event `failMemberOpenAttempt` consumes. It is **not** a real DeepSeek account 429, and no provider response, context, registry value or model output was fabricated. Every captain and member model turn in the run is a real DeepSeek Flash turn.

(An earlier version of this observer broke the waterfall by not returning `next()`; that failure is preserved in the `-FAILED-prestep` log rather than rewritten.)

### Fix and known boundary

`classifyMemberFailure()` makes the policy explicit and pure:

- `failed_attempt` — the observed attempt is still open: mark the task failed (unchanged behaviour).
- `noted_settled` — this member generation owns no open attempt: leave task and member exactly as they are and append one durable captain note. **No member `status` may suppress this.** `syncMemberStatus` writes `working` as soon as a turn runs, while a task completed earlier in that same turn leaves no open attempt behind — that is the reporter's run A, and an earlier revision of this fix wrongly treated `working` as "moved on to newer work" and dropped it.
- `ignored` — stale by contract: a **replaced** member generation (same name, new session id), or a *concrete* superseded open attempt (a different task, or a newer `attempt`/`attemptId` on the same task). Those are the only silent cases.

The note only describes the observed task when its durable status is **terminal**, and only a `completed` record may claim the work landed:

| durable status of the observed task | wording |
| --- | --- |
| `completed` | `Task tN ("…") had already completed; … This member's last turn died after its work landed.` |
| `failed` / `cancelled` | `Task tN ("…") was already closed as <status>; its record was left unchanged.` — no delivery claim |
| `pending` / `claimed` / `in_progress` (e.g. unclaimed or reassigned while the error was queued) | plain `No open attempt was owned; no task state was changed.` |
| no observed task at all (never assigned, or a welcome-turn failure) | plain `No open attempt was owned; no task state was changed.` |

These boundaries are pinned by `scripts/issue-205.test.mjs` (`settledTaskRecord`, `memberFailureMessage`).

In the recorded real-host runs the plugin's listener observes **no** open attempt at error time (`observedOpenAttempt: null` in the trace), so both shapes correctly produce the plain wording:

```
Member "policy" hit an unrecoverable turn failure: … (code UNKNOWN).
No open attempt was owned; no task state was changed.
```

The `completed`/`failed`/`cancelled` wording applies when the listener *did* observe an open attempt that then closed before the team lock was acquired (for example a `reassign_task` moving the task to a newer attempt); that ordering is covered by the pure tests rather than by a dedicated real-host run.

### Both real-host shapes

The injector throws only after reading the live durable record and observing the exact run A condition. It was verified in the trace:

```
{"event":"pre-step","label":"agent-teams:state205wh:policy","turn":2,"step":2,...}   # condition evaluated
{"event":"run-a-window-observed","turn":2,"step":2}
{"event":"agent-error-observed","turn":2,"step":1,"error":"... host-level turn failure ..."}
```
with `logs/205-candidate-state-working-no-open-task.json` captured live at that moment:

```
tasks:   [('t1', 'completed')]
members: [('policy', 'working', 'running')]      <- working, and no open attempt
```

| shape | baseline | candidate |
| --- | --- | --- |
| task settled earlier, member `idle` | captain inbox stayed at 1 line — **no record** | durable note appended; task and member unchanged |
| run A: member `working`, no open attempt | durable note appended | durable note appended — **the candidate must not drop this**, and after the fix it does not |
| replaced generation / superseded attempt | silent | silent (by contract; pinned by `scripts/issue-205.test.mjs`) |

Artifacts: `logs/205-baseline-realhost.log` (idle shape), `logs/205-candidate-realhost-final.log` (idle shape), `logs/205-candidate-working-realhost.log` and `logs/205-baseline-working-realhost.log` (run A shape).

## Commands, exit codes and artifacts

| Step | Command | Exit | Artifact |
| --- | --- | --- | --- |
| Baseline build | `pnpm install --frozen-lockfile && pnpm build` in `baseline-checkout` | 0 | `logs/baseline-checkout-build.log` |
| #188 read case (candidate) | `node cases/issue-188-case.mjs <candidate> cases/issue-188-case-candidate.json` | 0 | `cases/issue-188-case-candidate.json` (39/39) |
| #188 read case (baseline) | `node cases/issue-188-case.mjs baseline-checkout baseline/issue-188-case-baseline.json` | 1 | `baseline/issue-188-case-baseline.json` (20/33) |
| #188 write side (candidate) | `./run-188-write.sh candidate` | 0 | `logs/188write-candidate.log` |
| #188 write side (baseline) | `./run-188-write.sh baseline` | 0 | `logs/188write-baseline.log` |
| Durable issue regressions | `pnpm verify:issue-regressions` | 0 | 24/24 |
| #189 candidate | `./run-189-real.sh candidate` | 0 | `logs/189real-candidate-final.log` |
| #189 baseline | `./run-189-real.sh baseline` | 0 | `logs/189real-baseline.log` |
| #205 candidate | `./run-205.sh candidate r4` | 0 | `logs/205-candidate-realhost-final.log` |
| #205 baseline (idle shape) | `./run-205.sh baseline r3` | 0 | `logs/205-baseline-realhost.log` |
| #205 candidate (run A shape) | `./run-205.sh candidate <fresh-suffix>` | 0 | `logs/205-candidate-working-realhost.log` |
| #205 baseline (run A shape) | `./run-205.sh baseline <fresh-suffix>` | 0 | `logs/205-baseline-working-realhost.log` |
| Typecheck | `pnpm typecheck` | 0 | — |
| Repo verify | `node scripts/verify.mjs` | 0 | all checks passed |
| Member failure TDD | `node scripts/member-failure-tdd.mjs` | 0 | 10/10 |
| Quality gates TDD | `node scripts/quality-gates-tdd.mjs` | 0 | passed |
| Related `node --test` suites | `issue-189`, `corrupt-teamjson`, `member-spawn-recovery`, `quality-gates-repair-scope`, `quality-gates-amend`, `issue-159`, `capabilities`, `compatibility`, `release-metadata`, `http-body`, `workspace-activity`, `client-harness-migration`, `harness-source-verify` | 0 | 0 failures |
| Lifecycle / compat / stress | `lifecycle-verify`, `harness-compat-tdd`, `fallback-tdd`, `stress-verify` | 0 | `/tmp/sr-lifecycle.log` |

These repository regressions are listed **separately** from the real-model acceptance above; passing them is not evidence about the three issues.

### Artifact hashes (SHA-256, first 16 hex)

| Artifact (under `/private/tmp/agentteams-issues-20261010/state-routes/`) | Hash |
| --- | --- |
| `cases/issue-188-case-candidate.json` | `a868153bf53c22c9` |
| `baseline/issue-188-case-baseline.json` | `1bed0214f0ab7d19` |
| `logs/188write-candidate.log` | `1573759d20531450` |
| `logs/188write-baseline.log` | `4e0c0c5f923197d9` |
| `logs/189real-candidate-final.log` | `d03359566e653335` |
| `logs/189real-baseline.log` | `4419b5682231ae96` |
| `logs/205-candidate-realhost-final.log` | `b1cb3d10b08f78d9` |
| `logs/205-baseline-realhost.log` | `5438e2466a57d183` |
| `logs/205-candidate-working-realhost.log` | `3d47b13da2b9642d` |
| `logs/205-baseline-working-realhost.log` | `6905877e080c62cc` |

A small sanitized digest of these results is committed next to this report as
[`acceptance-summary.json`](acceptance-summary.json), so the outcome stays readable even if the
temporary directory is lost. The permanent, re-runnable regressions are the three
`scripts/issue-*.test.mjs` suites wired into `pnpm verify:issue-regressions`.

Bulk logs stay under `/private/tmp/agentteams-issues-20261010/state-routes/logs/`; only this report is added to the repository.

## Not covered

- The reporter's original 128-task / 13-member production team was not available; #188 is reproduced from the issue's minimal case plus a drift variant, and from an exact replay of the reported record shape.
- A second **usable** provider could not be created on this host (only `deepseek-account` is credentialed), so #189 is reproduced through a real second *catalog* and a real `openai-codex` captain route, not through a real failing generation on a second provider.
- #205's failing turn is a host-level turn failure, not a real account 429.
- A **replaced** member generation intentionally stays silent; only the current generation (including an explicitly retired one) is recorded.
- No publication, tagging, release or merge was performed. Main is untouched, as instructed.
