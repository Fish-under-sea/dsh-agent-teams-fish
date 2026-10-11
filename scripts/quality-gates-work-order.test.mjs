#!/usr/bin/env node
/**
 * Regression tests for issue #174: the auto-generated acceptance / inScope of
 * a repair round is a snapshot taken at finding-generation time; every later
 * repair invalidates it and nothing refreshes or flags it.
 *
 * Original case (reproduced through the API that already existed, with real
 * files on a real disk):
 *   a review failed with a finding whose requiredFix cited `lib/stats.js:2`,
 *   `planQualityFollowUp` generated the repair round, the file was then really
 *   changed on disk, and nothing in the plugin said the work order no longer
 *   described the workspace — the member following it literally edits a line
 *   that may no longer exist. The generated acceptance also carried the line
 *   anchor verbatim, one of the six cases reported in the issue.
 *
 * Nothing here is a fixture: the workspace is a real temporary directory, the
 * digests are real sha256 values, and every "later round" is a real write or
 * unlink. The candidate-only rules (`contractStaleness`, `snapshotWorkspacePaths`,
 * `workOrderWarnings`, `digestWorkspacePaths`) are loaded dynamically so this
 * file also runs unchanged against the previous build and fails behaviourally.
 *
 * Run: node --test scripts/quality-gates-work-order.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canDeclareDelivery, describeQualityLoop, planQualityFollowUp } from '../lib/quality-gates.js'
import { applyQualityFollowUp } from '../lib/tools.js'

const qualityGates = await import('../lib/quality-gates.js')
const artifacts = await import('../lib/artifacts.js').catch(() => undefined)

/** Real wall-clock pause: a "later round" must be later than the verdict. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const STATS_V1 = 'export const median = (xs) => xs[0]\n'
const STATS_V2 = 'export const median = (xs) => (xs[0] + xs[1]) / 2\n'

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'issue174-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'stats.js'), STATS_V1)
  writeFileSync(join(root, 'lib', 'format.js'), 'export const fmt = (n) => String(n)\n')
  return root
}

function member(name, role) {
  return { id: `member-${name}`, name, role, joinedAt: 0, status: 'idle' }
}

const DRIFTED_FINDING = {
  id: 'F1', severity: 'medium', file: 'lib/stats.js',
  problem: 'median is wrong on an even-length list',
  requiredFix: 'fix the even branch in lib/stats.js:2 so it averages the two middle values',
}

function teamWithReview(findings = [DRIFTED_FINDING]) {
  const source = {
    id: 't1', subject: 'impl', status: 'completed', dependencies: [],
    createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'implementation',
    assignee: 'implementer', inScope: ['lib/'], acceptance: ['done'], verify: ['node --test'],
    changedPaths: ['lib/stats.js'],
  }
  const review = {
    id: 't2', subject: 'review-round-1', status: 'failed', dependencies: ['t1'],
    createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'review', round: 1,
    assignee: 'reviewer', verdict: 'needs_revision', reviewedTaskId: 't1',
    objective: 'Review', acceptance: ['no blockers'],
    findings,
  }
  return {
    name: 't', id: 't', description: '', captainSessionId: 'captain',
    createdAt: 0, taskSeq: 2,
    members: [member('implementer', 'implementer'), member('reviewer', 'reviewer')],
    tasks: [source, review],
  }
}

/** The caller's real byte reading, used on both sides of the comparison. */
function readArtifacts(root, paths) {
  return paths.map((path) => {
    try {
      const bytes = readFileSync(join(root, path))
      return { path, present: true, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.byteLength }
    } catch {
      return { path, present: false }
    }
  })
}

test('#174 (original case): generated acceptance must not assert a line number that drifts', () => {
  const team = teamWithReview()
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.ok(repair, 'no repair round generated')
  for (const item of repair.acceptance ?? []) {
    assert.doesNotMatch(item, /:\d+/u, `acceptance asserts a drifting line anchor: ${item}`)
  }
})

test('#174 (original case): the repair records the failed gate whose findings it fixes', () => {
  const team = teamWithReview()
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  // A dedicated causal edge, not `dependencies`: a failed task never reaches
  // `completed`, so a dependency on it would make the repair unclaimable.
  assert.deepEqual(repair.findingSourceTaskIds, ['t2'])
  assert.ok(repair.dependencies.includes('t1'), 'repair lost its upstream dependency')
})

test('#174 (original case): the work order must be flagged once a cited file changes underneath it', async () => {
  const root = workspace()
  try {
    const team = teamWithReview()
    const followUp = applyQualityFollowUp(team, team.tasks[1], (paths) => (
      artifacts === undefined
        ? { at: Date.now(), artifacts: [] }
        : artifacts.snapshotWorkspacePaths(root, paths)
    ))
    const repair = followUp.created.find((item) => item.kind === 'repair')
    assert.ok(repair, 'no repair task materialized')
    // applyQualityFollowUp materializes the tasks onto the team record.
    const staged = { ...team, taskSeq: 4, tasks: team.tasks }

    // A later round really changes the file the work order was derived from.
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const audit = { artifacts: readArtifacts(root, ['lib/stats.js']) }
    const loop = describeQualityLoop(staged, audit)
    assert.ok(
      (loop.warnings ?? []).some((warning) => warning.includes('lib/stats.js')),
      `stale work order was not surfaced: ${JSON.stringify(loop)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174 (original case): the generated description states the plugin did not verify the finding', () => {
  const team = teamWithReview()
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.match(String(repair.description ?? ''), /line number/iu)
  assert.match(String(repair.description ?? ''), /not verify|did not verify|unverified/iu)
})

test('#174: the generated work order records a real workspace snapshot', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    const team = teamWithReview()
    const followUp = applyQualityFollowUp(team, team.tasks[1], (paths) => artifacts.snapshotWorkspacePaths(root, paths))
    const repair = followUp.created.find((item) => item.kind === 'repair')
    assert.ok(repair.contractSnapshot, 'no contractSnapshot recorded')
    assert.equal(typeof repair.contractSnapshot.at, 'number')
    const snapshot = repair.contractSnapshot.artifacts.find((item) => item.path === 'lib/stats.js')
    assert.equal(snapshot.sha256, sha256(STATS_V1))
    assert.equal(snapshot.size, STATS_V1.length)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: digests are real bytes; a missing path is recorded as absent, not skipped', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    const digests = artifacts.digestWorkspacePaths(root, ['lib/stats.js', 'lib/missing.js'])
    const stats = digests.find((item) => item.path === 'lib/stats.js')
    assert.equal(stats.sha256, sha256(STATS_V1))
    const missing = digests.find((item) => item.path === 'lib/missing.js')
    assert.equal(missing.present, false)
    assert.equal(missing.sha256, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: a path absent at generation time becoming present is drift', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    const snapshot = artifacts.snapshotWorkspacePaths(root, ['lib/new.js'])
    assert.equal(snapshot.artifacts[0].present, false)
    writeFileSync(join(root, 'lib', 'new.js'), 'export const added = true\n')
    const task = { id: 't9', status: 'pending', contractSnapshot: snapshot }
    const stale = qualityGates.contractStaleness(task, artifacts.digestWorkspacePaths(root, ['lib/new.js']))
    assert.equal(stale.length, 1)
    assert.match(stale[0], /lib\/new\.js/u)
    assert.match(stale[0], /now exists|appeared/iu)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: a deleted cited file is reported and a completed order is not', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    const team = teamWithReview()
    const followUp = applyQualityFollowUp(team, team.tasks[1], (paths) => artifacts.snapshotWorkspacePaths(root, paths))
    const repair = followUp.created.find((item) => item.kind === 'repair')
    assert.deepEqual(qualityGates.contractStaleness(repair, artifacts.digestWorkspacePaths(root, ['lib/stats.js'])), [])
    unlinkSync(join(root, 'lib', 'stats.js'))
    const stale = qualityGates.contractStaleness(repair, artifacts.digestWorkspacePaths(root, ['lib/stats.js']))
    assert.equal(stale.length, 1)
    assert.match(stale[0], /deleted|absent|missing|no longer/iu)
    const closed = {
      ...team,
      tasks: [...team.tasks.filter((item) => item.id !== repair.id), { ...repair, status: 'completed' }],
    }
    assert.deepEqual(qualityGates.workOrderWarnings(closed, artifacts.digestWorkspacePaths(root, ['lib/stats.js'])), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: a directory scope expands to the real files it covers', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    assert.deepEqual(artifacts.expandScopePaths(root, ['lib/']), ['lib/format.js', 'lib/stats.js'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: a broad scope must not absorb secrets, .env or plugin state', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    mkdirSync(join(root, 'secrets'), { recursive: true })
    mkdirSync(join(root, '.agent-teams', 'team'), { recursive: true })
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, 'secrets', 'token.txt'), 'super-secret\n')
    writeFileSync(join(root, '.env.example'), 'APP_SECRET=\n')
    writeFileSync(join(root, '.agent-teams', 'team', 'team.json'), '{}\n')
    writeFileSync(join(root, '.git', 'config'), '[core]\n')
    const paths = artifacts.expandScopePaths(root, ['./'])
    assert.ok(!paths.some((path) => path.includes('secrets')), `secrets leaked into scope: ${JSON.stringify(paths)}`)
    assert.ok(!paths.some((path) => path.startsWith('.env')), `.env leaked into scope: ${JSON.stringify(paths)}`)
    assert.ok(!paths.some((path) => path.startsWith('.agent-teams')), `plugin state leaked into scope: ${JSON.stringify(paths)}`)
    assert.ok(!paths.some((path) => path.startsWith('.git')), `.git leaked into scope: ${JSON.stringify(paths)}`)
    assert.ok(paths.includes('lib/stats.js'), `real source missing from scope: ${JSON.stringify(paths)}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: illegal scope patterns are rejected, never widened to the workspace root', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    for (const pattern of ['../', '/etc/', '~/projects/', 'C:\\temp\\']) {
      const read = artifacts.readArtifactScope(root, [pattern])
      assert.deepEqual(read.artifacts, [], `${pattern} produced artifacts`)
      assert.equal(read.gaps.length, 1, `${pattern} produced no gap: ${JSON.stringify(read.gaps)}`)
      assert.match(read.gaps[0].reason, /workspace-relative|absolute/u)
    }
    const read = artifacts.readArtifactScope(root, ['', '  '])
    assert.deepEqual(read.artifacts, [])
    assert.equal(read.gaps.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: traversal never follows a symlink out of the workspace or into a cycle', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  const outside = mkdtempSync(join(tmpdir(), 'issue174-outside-'))
  try {
    writeFileSync(join(outside, 'host-secret.txt'), 'not part of this project\n')
    symlinkSync(outside, join(root, 'lib', 'escape'))
    symlinkSync(join(root, 'lib'), join(root, 'lib', 'loop'))
    const paths = artifacts.expandScopePaths(root, ['lib/'])
    assert.ok(!paths.some((path) => path.includes('[host-secret]') || path.endsWith('host-secret.txt')), `escaped the workspace: ${JSON.stringify(paths)}`)
    assert.ok(!paths.some((path) => path.includes('escape')), `followed a symlink out of the workspace: ${JSON.stringify(paths)}`)
    assert.ok(!paths.some((path) => path.includes('loop')), `followed a symlink cycle: ${JSON.stringify(paths)}`)
    // An explicitly named symlink is rejected with a reason instead of read.
    const read = artifacts.readArtifactScope(root, ['lib/escape/host-secret.txt'])
    assert.equal(read.artifacts[0].unreadable, true)
    assert.match(String(read.artifacts[0].reason), /symlink|outside/iu)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('#174: hitting the expansion cap is reported, not silently truncated', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    mkdirSync(join(root, 'many'), { recursive: true })
    for (let index = 0; index < artifacts.MAX_EXPANDED_ARTIFACTS + 25; index += 1) {
      writeFileSync(join(root, 'many', `f${String(index).padStart(4, '0')}.js`), `export const n = ${index}\n`)
    }
    const read = artifacts.readArtifactScope(root, ['many/'])
    assert.equal(read.artifacts.length, artifacts.MAX_EXPANDED_ARTIFACTS)
    assert.equal(read.gaps.length, 1, `cap was silent: ${JSON.stringify(read.gaps)}`)
    assert.match(read.gaps[0].reason, /cap|partial/iu)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: an unreadable path is reported as unreadable, never as unchanged or absent', {
  skip: artifacts === undefined
    ? 'artifacts module missing in this build'
    : process.platform === 'win32' ? 'POSIX permission probe' : false,
}, () => {
  const root = workspace()
  try {
    const target = join(root, 'lib', 'locked.js')
    writeFileSync(target, 'export const locked = true\n')
    chmodSync(target, 0o000)
    const digest = artifacts.digestWorkspacePaths(root, ['lib/locked.js'])[0]
    assert.equal(digest.unreadable, true, `expected an unreadable record, got ${JSON.stringify(digest)}`)
    assert.notEqual(digest.present, true)
    assert.match(String(digest.reason), /cannot be read|EACCES|EPERM/iu)
  } finally {
    chmodSync(join(root, 'lib', 'locked.js'), 0o600)
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174: a capped scope is incomplete evidence and never passes as full coverage', { skip: artifacts === undefined && 'artifacts module missing in this build' }, () => {
  const root = workspace()
  try {
    mkdirSync(join(root, 'many'), { recursive: true })
    for (let index = 0; index < artifacts.MAX_EXPANDED_ARTIFACTS + 25; index += 1) {
      writeFileSync(join(root, 'many', `f${String(index).padStart(4, '0')}.js`), `export const n = ${index}\n`)
    }
    const read = artifacts.readArtifactScope(root, ['many/'])
    const state = teamWithReview([])
    const review = {
      ...state.tasks[1],
      status: 'completed', verdict: 'pass', findings: [],
      reviewedTaskId: 't1', reviewedAttempt: 1,
      reviewedArtifacts: read.artifacts,
      reviewedGaps: read.gaps,
      reviewedScope: ['many/'],
    }
    const delivery = canDeclareDelivery({ ...state, tasks: [state.tasks[0], review] }, {
      artifacts: read.artifacts,
      expandedScope: read.artifacts.map((item) => ({ path: item.path, present: item.present })),
    })
    assert.equal(delivery.ok, false, `partial coverage passed as a full verdict: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.blockers.some((item) => /partial|cap/iu.test(item)),
      `no incomplete-coverage blocker: ${JSON.stringify(delivery.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174/#161: a large artifact is hashed in constant memory (no whole-file read)', {
  skip: artifacts === undefined ? 'artifacts module missing in this build' : false,
}, () => {
  const root = workspace()
  try {
    const big = join(root, 'lib', 'big.bin')
    const chunk = Buffer.alloc(1024 * 1024, 7)
    const megabytes = 48
    const handle = openSync(big, 'w')
    try {
      for (let index = 0; index < megabytes; index += 1) writeSync(handle, chunk)
    } finally {
      closeSync(handle)
    }
    const expected = createHash('sha256')
    for (let index = 0; index < megabytes; index += 1) expected.update(chunk)
    const before = process.memoryUsage().heapUsed
    const digest = artifacts.digestWorkspacePaths(root, ['lib/big.bin'])[0]
    const grew = process.memoryUsage().heapUsed - before
    assert.equal(digest.size, megabytes * chunk.byteLength)
    assert.equal(digest.sha256, expected.digest('hex'))
    assert.ok(
      grew < 16 * 1024 * 1024,
      `hashing a ${megabytes} MiB file grew the heap by ${Math.round(grew / 1024 / 1024)} MiB`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174/#161: the production audit carries current gaps, and an over-cap scope blocks delivery', {
  skip: artifacts === undefined ? 'artifacts module missing in this build' : false,
}, async () => {
  const root = workspace()
  try {
    // The reviewed scope held 199 of its 200-file cap when the verdict closed;
    // later rounds grow it past the cap, with the new files sorting last.
    mkdirSync(join(root, 'many'), { recursive: true })
    for (let index = 0; index < 199; index += 1) {
      writeFileSync(join(root, 'many', `f${String(index).padStart(4, '0')}.js`), `export const n = ${index}\n`)
    }
    const atReview = artifacts.readArtifactScope(root, ['many/'])
    assert.deepEqual(atReview.gaps, [], 'the review-time read was already incomplete')
    const state = teamWithReview([])
    const review = {
      ...state.tasks[1],
      status: 'completed', verdict: 'pass', findings: [],
      reviewedTaskId: 't1', reviewedAttempt: 1,
      reviewedArtifacts: atReview.artifacts,
      reviewedScope: ['many/'],
    }
    const reviewed = { ...state, taskSeq: 2, tasks: [state.tasks[0], review] }
    for (let index = 199; index < 225; index += 1) {
      writeFileSync(join(root, 'many', `f${String(index).padStart(4, '0')}.js`), `export const n = ${index}\n`)
    }
    const { auditTeamWorkspace } = await import('../lib/workspace-audit.js')
    const audit = auditTeamWorkspace(root, reviewed)
    assert.ok(audit.gaps !== undefined && audit.gaps.length > 0, `the production audit dropped the current gaps: ${JSON.stringify(audit.gaps)}`)
    assert.ok(audit.gaps.some((gap) => /cap|partial/iu.test(gap.reason)))
    const delivery = canDeclareDelivery(reviewed, audit)
    assert.equal(delivery.ok, false, `an over-cap current audit still declared delivery: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.blockers.some((item) => /audit is incomplete/iu.test(item)),
      `no incomplete-audit blocker: ${JSON.stringify(delivery.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: an unreadable current artifact makes the production audit incomplete and blocks delivery', {
  skip: artifacts === undefined
    ? 'artifacts module missing in this build'
    : process.platform === 'win32' ? 'POSIX permission probe' : false,
}, async () => {
  const root = workspace()
  try {
    const locked = join(root, 'lib', 'locked.js')
    writeFileSync(locked, 'export const locked = true\n')
    const atReview = artifacts.readArtifactScope(root, ['lib/locked.js'])
    const state = teamWithReview([])
    const review = {
      ...state.tasks[1],
      status: 'completed', verdict: 'pass', findings: [],
      reviewedTaskId: 't1', reviewedAttempt: 1,
      reviewedArtifacts: atReview.artifacts,
      reviewedScope: ['lib/locked.js'],
    }
    const reviewed = { ...state, taskSeq: 2, tasks: [state.tasks[0], review] }
    chmodSync(locked, 0o000)
    const { auditTeamWorkspace } = await import('../lib/workspace-audit.js')
    const audit = auditTeamWorkspace(root, reviewed)
    assert.ok(audit.gaps !== undefined && audit.gaps.some((gap) => /locked\.js/u.test(gap.pattern)), `unreadable path not reported: ${JSON.stringify(audit.gaps)}`)
    const delivery = canDeclareDelivery(reviewed, audit)
    assert.equal(delivery.ok, false, `an unreadable current artifact still declared delivery: ${JSON.stringify(delivery)}`)
    chmodSync(locked, 0o600)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#174/#161: a directory pattern that is a symlink out of the workspace is never enumerated', {
  skip: artifacts === undefined
    ? 'artifacts module missing in this build'
    : process.platform === 'win32' ? 'symlink probe' : false,
}, () => {
  const root = workspace()
  const outside = mkdtempSync(join(tmpdir(), 'issue174-outside-'))
  try {
    writeFileSync(join(outside, 'host-only-secret.js'), 'export const leaked = true\n')
    mkdirSync(join(outside, 'nested'), { recursive: true })
    writeFileSync(join(outside, 'nested', 'deeper.js'), 'export const deeper = true\n')
    symlinkSync(outside, join(root, 'escape'))
    // Trailing-slash directory patterns go straight to the walker, so the
    // prefix itself must be verified before readdir.
    const readSlash = artifacts.readArtifactScope(root, ['escape/'])
    assert.deepEqual(readSlash.artifacts, [], `enumerated outside names: ${JSON.stringify(readSlash.artifacts)}`)
    assert.equal(readSlash.gaps.length, 1, `no gap reported: ${JSON.stringify(readSlash.gaps)}`)
    assert.match(readSlash.gaps[0].reason, /outside the workspace|resolves outside/iu)
    const readPlain = artifacts.readArtifactScope(root, ['escape'])
    assert.equal(readPlain.artifacts[0].unreadable, true)
    // A nested pattern through the same symlink is refused too.
    const readNested = artifacts.readArtifactScope(root, ['escape/nested/'])
    assert.deepEqual(readNested.artifacts, [])
    assert.ok(readNested.gaps.length > 0)
    // And the same pattern used as a work-order scope records no external bytes.
    const snapshot = artifacts.snapshotWorkspacePaths(root, ['escape/'])
    assert.deepEqual(snapshot.artifacts, [])
    assert.ok((snapshot.gaps ?? []).length > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
