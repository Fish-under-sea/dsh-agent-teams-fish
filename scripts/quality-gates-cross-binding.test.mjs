#!/usr/bin/env node
/**
 * Regression tests for the #161 x #175 cross-group gap found during integration.
 *
 * Real trace it reproduces (this session's S-BC candidate artifact, deepseek-flash):
 *   t1 implementation.changedPaths = ['lib/format.js']
 *   t5 repair.changedPaths         = ['lib/sum.js']            (automatic round)
 *   t6 verification.reviewedScope  = ['lib/sum.js']            (automatic re-check)
 *   t4 review.dependencies         = ['t6']  but reviewedTaskId = 't1'
 *   t4 review.reviewedScope        = ['lib/format.js']
 *
 * The pre-planned review was rewired to the re-verification yet still bound only
 * the original source file, and a drifted verification was demoted to a warning
 * unconditionally. A later real edit of lib/sum.js therefore left the delivered
 * bytes with no valid gate evidence while delivery still said ok.
 *
 * Both halves are covered here with real files on a real disk:
 *  · verdictScopePatterns must bind the whole judged lineage (source + repairs);
 *  · a drifted verification without a sound covering verdict must block.
 *
 * The candidate-only rules are loaded dynamically so the file also runs against
 * a build that predates them (where the assertions fail behaviourally).
 *
 * Run: node --test scripts/quality-gates-cross-binding.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canDeclareDelivery } from '../lib/quality-gates.js'

const qualityGates = await import('../lib/quality-gates.js')
const artifacts = await import('../lib/artifacts.js').catch(() => undefined)
const bindingReady = typeof qualityGates.verdictScopePatterns === 'function'
  && typeof qualityGates.bindReviewToRevision === 'function'
  && artifacts !== undefined
const skip = bindingReady ? false : 'content binding not present in this build'

/** Real workspace with the two files the S-BC trace touched. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'issue161x175-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'format.js'), 'export const format = (n) => String(n)\n')
  writeFileSync(join(root, 'lib', 'sum.js'), 'export const sum = (a, b) => a + b\n')
  return root
}

const read = (root, paths) => artifacts.digestWorkspacePaths(root, paths)

/** The real S-BC graph: pre-planned review rewired to the automatic re-check. */
function sbcTeam(reviewExtra = {}) {
  const base = { createdAt: 0, updatedAt: Date.now(), dependencies: [], attempt: 1, assignee: 'engineer' }
  return {
    name: 't', id: 't', description: '', captainSessionId: 'captain', createdAt: 0, taskSeq: 6,
    members: [
      { id: 'm1', name: 'engineer', role: 'engineer', joinedAt: 0, status: 'idle' },
      { id: 'm2', name: 'verifier', role: 'verifier', joinedAt: 0, status: 'idle' },
    ],
    tasks: [
      { ...base, id: 't1', subject: 'impl', kind: 'implementation', status: 'completed', inScope: ['lib/'], acceptance: ['x'], verify: ['node --test'], changedPaths: ['lib/format.js'] },
      { ...base, id: 't5', subject: 'repair-round-2', kind: 'repair', status: 'completed', round: 2, dependencies: ['t1'], sourceTaskId: 't1', sourceFindingIds: ['F1'], findingSourceTaskIds: ['t3'], inScope: ['lib/', 'test/'], acceptance: ['y'], verify: ['node --test'], changedPaths: ['lib/sum.js'] },
      { ...base, id: 't6', subject: 'verification-round-2', kind: 'verification', status: 'completed', round: 2, dependencies: ['t5'], acceptance: ['z'], verify: ['node --test'] },
      {
        ...base, id: 't4', subject: 'review-round-1', kind: 'review', status: 'completed', round: 2,
        dependencies: ['t6'], reviewedTaskId: 't1', verdict: 'pass',
        objective: 'Review the workspace implementation against the project contract',
        acceptance: ['no blockers'],
        ...reviewExtra,
      },
    ],
  }
}

test('#161x#175: the rewired review binds the whole judged lineage, not only the original source', {
  skip,
}, () => {
  const root = workspace()
  try {
    const state = sbcTeam()
    const scope = qualityGates.verdictScopePatterns(state, state.tasks[3])
    assert.deepEqual(
      [...scope].sort(),
      ['lib/format.js', 'lib/sum.js'],
      `the review scope lost a judged artifact: ${JSON.stringify(scope)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161x#175: after the loop closes, a later real edit of the repair target blocks delivery', {
  skip,
}, () => {
  const root = workspace()
  try {
    const state = sbcTeam()
    const review = state.tasks[3]
    // The production path: the bound bytes are exactly the derived scope.
    const scope = qualityGates.verdictScopePatterns(state, review)
    const bound = qualityGates.bindReviewToRevision(state, review, {
      artifacts: read(root, scope),
      scope,
    })
    const verification = { ...state.tasks[2], reviewedAttempt: 1, reviewedArtifacts: read(root, ['lib/sum.js']) }
    const closed = { ...state, tasks: [state.tasks[0], state.tasks[1], verification, bound] }
    assert.equal(
      canDeclareDelivery(closed, { artifacts: read(root, ['lib/format.js', 'lib/sum.js']) }).ok,
      true,
      'precondition: the closed loop was deliverable',
    )

    // A later turn really rewrites the repair's target.
    writeFileSync(join(root, 'lib', 'sum.js'), 'export const sum = (a, b) => Number(a) + Number(b)\n')
    const after = canDeclareDelivery(closed, { artifacts: read(root, ['lib/format.js', 'lib/sum.js']) })
    assert.equal(after.ok, false, `a changed gate input was still delivered: ${JSON.stringify(after)}`)
    assert.ok(
      after.blockers.some((item) => item.includes('lib/sum.js')),
      `no blocker names the changed artifact: ${JSON.stringify(after.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161x#175: the legacy shape (review bound only the old source) still blocks via the verification', {
  skip,
}, () => {
  const root = workspace()
  try {
    // The pre-fix binding: the review covers lib/format.js only, exactly like
    // the recorded S-BC artifact.
    const state = sbcTeam({
      reviewedAttempt: 1,
      reviewedArtifacts: read(root, ['lib/format.js']),
      reviewedScope: ['lib/format.js'],
    })
    const verification = { ...state.tasks[2], reviewedAttempt: 1, reviewedArtifacts: read(root, ['lib/sum.js']) }
    const closed = { ...state, tasks: [state.tasks[0], state.tasks[1], verification, state.tasks[3]] }
    assert.equal(canDeclareDelivery(closed, { artifacts: read(root, ['lib/format.js', 'lib/sum.js']) }).ok, true)

    writeFileSync(join(root, 'lib', 'sum.js'), 'export const sum = (a, b) => Number(a) + Number(b)\n')
    const after = canDeclareDelivery(closed, { artifacts: read(root, ['lib/format.js', 'lib/sum.js']) })
    assert.equal(after.ok, false, `a drifted verification was demoted to a warning: ${JSON.stringify(after)}`)
    assert.ok(
      after.blockers.some((item) => item.includes('t6') && item.includes('lib/sum.js')),
      `the drifted verification is not a blocker: ${JSON.stringify(after.blockers)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#161x#175: a later sound review that binds both artifacts restores delivery', {
  skip,
}, () => {
  const root = workspace()
  try {
    const state = sbcTeam({
      reviewedAttempt: 1,
      reviewedArtifacts: read(root, ['lib/format.js']),
      reviewedScope: ['lib/format.js'],
    })
    const verification = { ...state.tasks[2], reviewedAttempt: 1, reviewedArtifacts: read(root, ['lib/sum.js']) }
    writeFileSync(join(root, 'lib', 'sum.js'), 'export const sum = (a, b) => Number(a) + Number(b)\n')
    const recheck = {
      ...state.tasks[3],
      id: 't9', subject: 'review-round-3', round: 3, createdAt: 900, updatedAt: Date.now(),
      dependencies: ['t6'], reviewedTaskId: 't5', reviewedAttempt: 1,
      reviewedArtifacts: read(root, ['lib/format.js', 'lib/sum.js']),
      reviewedScope: ['lib/format.js', 'lib/sum.js'],
    }
    const closed = { ...state, taskSeq: 9, tasks: [state.tasks[0], state.tasks[1], verification, state.tasks[3], recheck] }
    const delivery = canDeclareDelivery(closed, { artifacts: read(root, ['lib/format.js', 'lib/sum.js']) })
    assert.equal(delivery.ok, true, `a full re-review did not restore delivery: ${JSON.stringify(delivery)}`)
    assert.ok(
      delivery.warnings.some((item) => item.includes('superseded by t9')),
      `the superseded gates were not reported: ${JSON.stringify(delivery.warnings)}`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
