#!/usr/bin/env node
/**
 * Regression tests for issue #161: a passing review is not bound to the
 * revision it judged.
 *
 * Original case (reproduced through the API that already existed, with real
 * bytes on a real disk):
 *   an implementation recorded `changedPaths`, a review closed with
 *   `verdict=pass` + `reviewedTaskId`, the workspace files were then really
 *   edited and really deleted, and `canDeclareDelivery(team)` still reported
 *   `ok: true` while `describeQualityLoop` still advertised `deliverable —
 *   All required quality gates passed`. A captain following that banner would
 *   report an unreviewed revision as verified; the only actor who could notice
 *   was a human re-hashing files by hand.
 *
 * The caller (which owns the workspace path, exactly like the status tool)
 * reads the current bytes and passes them in; the rules stay pure. Nothing in
 * this file is a fixture: every digest is read from a real temporary file with
 * node:crypto, and the edits/deletions are real filesystem writes.
 *
 * Run: node --test scripts/quality-gates-content-bound.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canDeclareDelivery, describeQualityLoop } from '../lib/quality-gates.js'

const STATS_V1 = [
  'export function median(values) {',
  '  const sorted = [...values].sort((a, b) => a - b)',
  '  const middle = Math.floor(sorted.length / 2)',
  '  if (sorted.length % 2 === 0) {',
  '    const lower = sorted[middle - 1]',
  '    const upper = sorted[middle]',
  '    return (lower + upper) / 2',
  '  }',
  '  return sorted[middle]',
  '}',
  '',
].join('\n')
const STATS_V2 = STATS_V1.replace('lower', 'lo').replace('upper', 'hi')
const TEST_V1 = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('median', () => {})\n"
const TEST_V2 = `${TEST_V1}test('even list', () => {})\ntest('odd list', () => {})\n`
const PACKAGE_V1 = '{\n  "name": "sample",\n  "version": "0.0.0",\n  "type": "module"\n}\n'

/** The caller's real byte reading: sha256 + size + mtime of the paths it owns. */
function readArtifacts(root, paths) {
  return paths.map((path) => {
    const absolute = join(root, path)
    try {
      const bytes = readFileSync(absolute)
      return {
        path,
        present: true,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.byteLength,
        mtimeMs: statSync(absolute).mtimeMs,
      }
    } catch {
      return { path, present: false }
    }
  })
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'issue161-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(join(root, 'lib', 'stats.js'), STATS_V1)
  writeFileSync(join(root, 'test', 'stats.test.js'), TEST_V1)
  writeFileSync(join(root, 'package.json'), PACKAGE_V1)
  return root
}

function member(name, role) {
  return { id: `member-${name}`, name, role, joinedAt: 0, status: 'idle' }
}

const REVIEWED_PATHS = ['lib/stats.js', 'test/stats.test.js', 'package.json']

/** Real wall-clock pause: an edit "after the pass" must be later than it. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The record the plugin writes: changedPaths on the implementation, a pass on the review. */
function team(extraReview = {}) {
  return {
    name: 'stats', id: 'stats', description: '', captainSessionId: 'captain',
    createdAt: Date.now(), taskSeq: 2,
    members: [member('engineer', 'engineer'), member('reviewer', 'reviewer')],
    tasks: [
      {
        id: 't1', subject: 'implementation', status: 'completed', dependencies: [],
        createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'implementation',
        assignee: 'engineer',
        objective: 'Implement stats module', inScope: ['lib/', 'test/', 'package.json'],
        acceptance: ['module works'], verify: ['node --test'],
        changedPaths: REVIEWED_PATHS,
        acceptanceResults: [{ criterion: 'module works', status: 'passed' }],
        commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
      },
      {
        id: 't5', subject: 'review-round-2', status: 'completed', dependencies: ['t1'],
        createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'review', round: 2,
        assignee: 'reviewer', verdict: 'pass', reviewedTaskId: 't1',
        objective: 'Review the implementation', acceptance: ['no blockers'],
        ...extraReview,
      },
    ],
  }
}

test('#161 (original case): editing and deleting reviewed bytes after the pass must stop the deliverable claim', async () => {
  const root = workspace()
  try {
    const state = team()
    const before = canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(before.ok, true, `precondition: the reviewed revision was deliverable: ${JSON.stringify(before)}`)

    // The implementer's later turn, exactly as reported: rename two local
    // variables, add two assertions, delete package.json.
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    writeFileSync(join(root, 'test', 'stats.test.js'), TEST_V2)
    unlinkSync(join(root, 'package.json'))

    const after = canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(after.ok, false, `unreviewed revision still advertised as deliverable: ${JSON.stringify(after)}`)
    assert.ok(
      after.blockers.some((item) => item.includes('lib/stats.js')),
      `no blocker for the edited reviewed file: ${JSON.stringify(after.blockers)}`,
    )
    assert.ok(
      after.blockers.some((item) => item.includes('package.json')),
      `no blocker for the deleted reviewed file: ${JSON.stringify(after.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161 (original case): the loop banner must not stay green over changed bytes', async () => {
  const root = workspace()
  try {
    const state = team()
    assert.equal(describeQualityLoop(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) }).deliverable, true)
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const loop = describeQualityLoop(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(loop.deliverable, false, `banner still reads deliverable: ${JSON.stringify(loop)}`)
    assert.notEqual(loop.state, 'deliverable')
    assert.match(loop.summary, /stats\.js/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161 (recorded revision): a pass that recorded the bytes it judged is invalidated by any byte change', async () => {
  const root = workspace()
  try {
    const recorded = readArtifacts(root, REVIEWED_PATHS)
    const state = team({ reviewedAttempt: 1, reviewedArtifacts: recorded })
    assert.equal(canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) }).ok, true)
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const after = canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(after.ok, false)
    assert.ok(after.blockers.some((item) => item.includes('lib/stats.js')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: an identical rewrite is not drift, a real deletion is', () => {
  const root = workspace()
  try {
    const recorded = readArtifacts(root, REVIEWED_PATHS)
    const state = team({ reviewedAttempt: 1, reviewedArtifacts: recorded })
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V1)
    writeFileSync(join(root, 'test', 'stats.test.js'), TEST_V1)
    assert.equal(canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) }).ok, true)
    unlinkSync(join(root, 'package.json'))
    const after = canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(after.ok, false)
    assert.ok(
      after.blockers.some((item) => item.includes('package.json') && /deleted|absent|missing|no longer/iu.test(item)),
      `no deletion blocker: ${JSON.stringify(after.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: re-attempting the reviewed task invalidates the pass without needing any hashing', () => {
  const state = team({ reviewedAttempt: 1 })
  state.tasks[0].attempt = 2
  state.tasks[0].attemptId = 'attempt-2'
  const delivery = canDeclareDelivery(state)
  assert.equal(delivery.ok, false, `stale pass survived a re-attempt: ${JSON.stringify(delivery)}`)
  assert.ok(
    delivery.blockers.some((item) => item.includes('t5') && /attempt/u.test(item)),
    `no attempt-drift blocker: ${JSON.stringify(delivery.blockers)}`,
  )
})

test('#161: an intermediate verification that drifted is surfaced without false-blocking the newer review', async () => {
  const root = workspace()
  try {
    const implementation = team().tasks[0]
    const verification = {
      id: 't3', subject: 'verification', status: 'completed', dependencies: ['t1'],
      createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'verification',
      assignee: 'verifier', acceptance: ['commands pass'], verify: ['node --test'],
      reviewedAttempt: 1, reviewedArtifacts: readArtifacts(root, ['lib/stats.js']),
      acceptanceResults: [{ criterion: 'commands pass', status: 'passed' }],
      commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
    }
    const repair = {
      id: 't4', subject: 'repair-round-2', status: 'completed', dependencies: ['t3'],
      createdAt: 0, updatedAt: Date.now(), attempt: 1, kind: 'repair', round: 2,
      assignee: 'engineer', inScope: ['lib/'], acceptance: ['fix it'], verify: ['node --test'],
      sourceTaskId: 't1', sourceFindingIds: ['F1'], changedPaths: ['lib/stats.js'],
      acceptanceResults: [{ criterion: 'fix it', status: 'passed' }],
      commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
    }
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const review = {
      ...team().tasks[1],
      id: 't6', dependencies: ['t4'], round: 3, reviewedTaskId: 't4',
      reviewedAttempt: 1, reviewedArtifacts: readArtifacts(root, ['lib/stats.js']),
    }
    const state = {
      ...team(),
      taskSeq: 6,
      tasks: [implementation, verification, repair, review],
    }
    const loop = describeQualityLoop(state, { artifacts: readArtifacts(root, ['lib/stats.js']) })
    assert.equal(loop.deliverable, true, `a superseded verification must not block the new review: ${JSON.stringify(loop)}`)
    assert.ok(
      (loop.warnings ?? []).some((item) => item.includes('t3') && /changed since|revision that no longer exists/u.test(item)),
      `drifted verification not surfaced: ${JSON.stringify(loop)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: a work-kind task without a review is still not deliverable', () => {
  const state = team()
  state.tasks[1].verdict = 'needs_revision'
  assert.equal(canDeclareDelivery(state).ok, false)
})

/* ------------------------------------------------------------------------- *
 * Boundaries the supervisor asked to be explicit about: a review that ran
 * while the tree was moving, a legitimately superseded old pass, a new file
 * appearing under a reviewed directory, and partial (capped) coverage.        *
 * ------------------------------------------------------------------------- */

const qualityGates = await import('../lib/quality-gates.js')

test('#161: a review that ran while its inputs were changing must not claim the current bytes', () => {
  const root = workspace()
  try {
    const state = team({
      reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts(root, REVIEWED_PATHS),
      reviewedDuringDrift: ['lib/stats.js changed (sha256 062deee2 -> 91779f0e)'],
    })
    const delivery = canDeclareDelivery(state, { artifacts: readArtifacts(root, REVIEWED_PATHS) })
    assert.equal(delivery.ok, false, `a verdict over a moving workspace was accepted: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.blockers.some((item) => /while this verdict was being formed|stable revision/u.test(item)),
      `no during-review drift blocker: ${JSON.stringify(delivery.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: the claim-time snapshot and the close-time bytes decide what a verdict may bind', {
  skip: typeof qualityGates.bindReviewToRevision === 'function' ? false : 'content binding not present in this build',
}, () => {
  const root = workspace()
  try {
    const start = { at: Date.now(), artifacts: readArtifacts(root, REVIEWED_PATHS) }
    // Someone else writes the file while the review is open.
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const state = team()
    const drifting = {
      ...state.tasks[1],
      verdictStartSnapshot: start,
    }
    const duringDrift = qualityGates.artifactDrift(start.artifacts, readArtifacts(root, REVIEWED_PATHS))
    assert.equal(duringDrift.length, 1)
    const bound = qualityGates.bindReviewToRevision({ ...state, tasks: [...state.tasks, drifting] }, drifting, {
      artifacts: readArtifacts(root, REVIEWED_PATHS),
      scope: REVIEWED_PATHS,
      duringDrift,
    })
    assert.equal(bound.reviewedAttempt, 1)
    assert.deepEqual(bound.reviewedDuringDrift, duringDrift)
    assert.equal(bound.reviewedArtifacts.length, REVIEWED_PATHS.length)
    const blocked = canDeclareDelivery({ ...state, tasks: [state.tasks[0], bound] }, {
      artifacts: readArtifacts(root, REVIEWED_PATHS),
    })
    assert.equal(blocked.ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: a legitimate later repair and new pass supersede the old pass instead of blocking forever', async () => {
  const root = workspace()
  try {
    const implementation = { ...team().tasks[0], createdAt: 0 }
    const firstPass = {
      ...team().tasks[1],
      id: 't2', round: 1, createdAt: 100, updatedAt: Date.now(),
      reviewedAttempt: 1, reviewedArtifacts: readArtifacts(root, ['lib/stats.js']),
    }
    // A legitimate later round really changes the reviewed bytes.
    await pause(10)
    writeFileSync(join(root, 'lib', 'stats.js'), STATS_V2)
    const repair = {
      id: 't4', subject: 'repair-round-2', status: 'completed', dependencies: ['t2'],
      createdAt: 200, updatedAt: Date.now(), attempt: 1, kind: 'repair', round: 2,
      assignee: 'engineer', inScope: ['lib/'], acceptance: ['fix it'], verify: ['node --test'],
      sourceTaskId: 't1', sourceFindingIds: ['F2'], changedPaths: ['lib/stats.js'],
      acceptanceResults: [{ criterion: 'fix it', status: 'passed' }],
      commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
    }
    const secondPass = {
      ...team().tasks[1],
      id: 't6', round: 3, createdAt: 300, updatedAt: Date.now(),
      dependencies: ['t4'], reviewedTaskId: 't4', reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts(root, ['lib/stats.js']),
    }
    const state = { ...team(), taskSeq: 6, tasks: [implementation, firstPass, repair, secondPass] }
    const loop = describeQualityLoop(state, { artifacts: readArtifacts(root, ['lib/stats.js']) })
    assert.equal(loop.deliverable, true, `an old superseded pass blocked the new gate: ${JSON.stringify(loop)}`)
    assert.ok(
      (loop.warnings ?? []).some((item) => item.includes('t2') && /superseded/u.test(item)),
      `the superseded pass was not reported: ${JSON.stringify(loop)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: a new file under a reviewed directory scope was never reviewed', () => {
  const root = workspace()
  try {
    const state = team({
      reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts(root, ['lib/stats.js']),
      reviewedScope: ['lib/'],
    })
    writeFileSync(join(root, 'lib', 'added.js'), 'export const added = true\n')
    const delivery = canDeclareDelivery(state, {
      artifacts: readArtifacts(root, ['lib/stats.js', 'lib/added.js']),
      expandedScope: [
        { path: 'lib/stats.js', present: true },
        { path: 'lib/added.js', present: true },
      ],
    })
    assert.equal(delivery.ok, false, `a broad scope silently absorbed an unreviewed file: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.blockers.some((item) => item.includes('lib/added.js') && /never reviewed/u.test(item)),
      `no unreviewed-file blocker: ${JSON.stringify(delivery.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161: an unreadable reviewed file cannot be claimed as unchanged', () => {
  const root = workspace()
  try {
    const state = team({
      reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts(root, REVIEWED_PATHS),
    })
    const delivery = canDeclareDelivery(state, {
      artifacts: [
        ...readArtifacts(root, ['test/stats.test.js', 'package.json']),
        { path: 'lib/stats.js', present: false, unreadable: true, reason: 'lib/stats.js cannot be read (EACCES)' },
      ],
    })
    assert.equal(delivery.ok, false)
    assert.ok(
      delivery.blockers.some((item) => item.includes('lib/stats.js') && /cannot be read|confirm/iu.test(item)),
      `unreadable evidence was treated as a match: ${JSON.stringify(delivery.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------------- *
 * Independent-review findings on the content binding itself. Each case uses a
 * real temporary workspace with real bytes: A = lib/a.js, B = lib/b.js.
 * ------------------------------------------------------------------------- */

function abWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'issue161-ab-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'a.js'), 'export const a = 1\n')
  writeFileSync(join(root, 'lib', 'b.js'), 'export const b = 1\n')
  return root
}

/** Digest helper for an explicit root (the shared one is bound to REVIEWED_PATHS). */
function readArtifacts2(root, paths) {
  return readArtifacts(root, paths)
}

function abTeam(reviewOverrides) {
  const state = team()
  state.tasks = [
    {
      ...state.tasks[0],
      createdAt: 0, inScope: ['lib/'], changedPaths: ['lib/a.js', 'lib/b.js'],
    },
    {
      ...state.tasks[1],
      id: 't2', round: 1, createdAt: 100, dependencies: ['t1'],
      reviewedTaskId: 't1', reviewedAttempt: 1,
      ...reviewOverrides,
    },
  ]
  return state
}

test('#161 review: an unbound legacy pass cannot supersede a real drift blocker', async () => {
  const root = abWorkspace()
  try {
    const first = readArtifacts2(root, ['lib/a.js', 'lib/b.js'])
    const state = abTeam({
      reviewedAttempt: 1,
      reviewedArtifacts: first,
      reviewedScope: ['lib/a.js', 'lib/b.js'],
    })
    await pause(10)
    writeFileSync(join(root, 'lib', 'b.js'), 'export const b = 2\n')
    // A newer, completed pass in the same lineage that recorded NO artifact
    // identity (the shape of every pre-fix record).
    const legacy = {
      ...state.tasks[1],
      id: 't7', round: 5, createdAt: 900, updatedAt: Date.now(),
      reviewedTaskId: 't1', reviewedAttempt: 1,
      reviewedArtifacts: undefined, reviewedScope: undefined, reviewedGaps: undefined,
    }
    const withLegacy = { ...state, taskSeq: 7, tasks: [...state.tasks, legacy] }
    const delivery = canDeclareDelivery(withLegacy, { artifacts: readArtifacts2(root, ['lib/a.js', 'lib/b.js']) })
    assert.equal(delivery.ok, false, `an unbound pass cleared a real drift blocker: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.blockers.some((item) => item.includes('lib/b.js')),
      `the drifted path is not named: ${JSON.stringify(delivery.blockers)}`,
    )
    assert.ok(!delivery.warnings.some((item) => /superseded by t7/u.test(item)), 't7 was treated as superseding evidence')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161 review: a narrower new pass cannot clear drift on a path it never reviewed', async () => {
  const root = abWorkspace()
  try {
    const state = abTeam({
      reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts2(root, ['lib/a.js', 'lib/b.js']),
      reviewedScope: ['lib/a.js', 'lib/b.js'],
    })
    await pause(10)
    writeFileSync(join(root, 'lib', 'b.js'), 'export const b = 2\n')
    // A later sound pass that reviewed only A.
    const narrower = {
      ...state.tasks[1],
      id: 't8', round: 4, createdAt: 800, updatedAt: Date.now(),
      reviewedTaskId: 't1', reviewedAttempt: 1,
      reviewedArtifacts: readArtifacts2(root, ['lib/a.js']),
      reviewedScope: ['lib/a.js'],
    }
    const audit = { artifacts: readArtifacts2(root, ['lib/a.js', 'lib/b.js']) }
    const narrowed = { ...state, taskSeq: 8, tasks: [...state.tasks, narrower] }
    const blocked = canDeclareDelivery(narrowed, audit)
    assert.equal(blocked.ok, false, `a narrower review cleared unreviewed drift: ${JSON.stringify(blocked)}`)
    assert.ok(
      blocked.blockers.some((item) => item.includes('lib/b.js')),
      `the unreviewed drifted path is not named: ${JSON.stringify(blocked.blockers)}`,
    )

    // Positive control: a later pass that binds both paths does clear it.
    const full = {
      ...narrower,
      id: 't9', round: 6, createdAt: 950,
      reviewedArtifacts: readArtifacts2(root, ['lib/a.js', 'lib/b.js']),
      reviewedScope: ['lib/a.js', 'lib/b.js'],
    }
    const cleared = canDeclareDelivery({ ...state, taskSeq: 9, tasks: [...state.tasks, full] }, audit)
    assert.equal(cleared.ok, true, `a full re-review failed to clear the drift: ${JSON.stringify(cleared)}`)
    assert.ok(
      cleared.warnings.some((item) => item.includes('t2') && /superseded by t9/u.test(item)),
      `the superseded pass was not reported: ${JSON.stringify(cleared.warnings)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
