#!/usr/bin/env node
/**
 * Regression tests for issue #175: repair rounds are not wired to the
 * findings they fix.
 *
 * A · `planQualityFollowUp()` generated a `repair` that depended only on its
 * automatically-derived upstream (the implementation the review judged), never
 * on the failed gate task whose findings it fixes. The causal edge exists in
 * the transcript but not in the graph, so `canDeclareDelivery()` reported
 * `failed without a follow-up repair` for findings that were already fixed and
 * independently re-verified downstream.
 *
 * B · Auto-repair fired for a failed `review` but not for a failed
 * `verification`: both are quality gates with the same
 * findings → repair → re-check contract, yet only the review path self-healed.
 *
 * Run: node --test scripts/quality-gates-repair-wiring.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { canDeclareDelivery, planQualityFollowUp } from '../lib/quality-gates.js'
import { unsatisfiedDependencies } from '../lib/state.js'

function member(name, role) {
  return { id: `member-${name}`, name, role, joinedAt: 0, status: 'idle' }
}

function baseTeam(tasks) {
  return {
    name: 't', id: 't', description: '', captainSessionId: 'captain',
    createdAt: 0, taskSeq: tasks.length,
    members: [member('implementer', 'implementer'), member('reviewer', 'reviewer'), member('verifier', 'verifier')],
    tasks,
  }
}

function implementation(extra = {}) {
  return {
    id: 't1', subject: 'impl', status: 'completed', dependencies: [],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'implementation',
    assignee: 'implementer', inScope: ['src/'], acceptance: ['done'], verify: ['node --test'],
    changedPaths: ['src/app.js'],
    acceptanceResults: [{ criterion: 'done', status: 'passed' }],
    commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
    ...extra,
  }
}

function failedReview(extra = {}) {
  return {
    id: 't2', subject: 'review-round-1', status: 'failed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'review', round: 1,
    assignee: 'reviewer', verdict: 'needs_revision', reviewedTaskId: 't1',
    objective: 'Review', acceptance: ['no blockers'],
    findings: [{ id: 'F1', severity: 'high', problem: 'p', requiredFix: 'fix src/app.js', file: 'src/app.js' }],
    ...extra,
  }
}

function failedVerification(extra = {}) {
  return {
    id: 't3', subject: 'verification', status: 'failed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'verification',
    assignee: 'verifier',
    acceptance: ['Declared verification commands pass'],
    verify: ['node --test'],
    acceptanceResults: [{ criterion: 'Declared verification commands pass', status: 'failed', evidence: 'EXIT=2' }],
    commandsRun: [{ command: 'node --test', status: 'failed', exitCode: 2, evidence: 'half-written symbols' }],
    output: 'two gates failed',
    ...extra,
  }
}

test('#175A: a generated repair records the failed gate whose findings it fixes', () => {
  const team = baseTeam([implementation(), failedReview()])
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.ok(repair, 'no repair generated')
  assert.deepEqual(
    repair.findingSourceTaskIds,
    ['t2'],
    `the causal edge to the failed gate t2 is missing: ${JSON.stringify(repair.findingSourceTaskIds)}`,
  )
  assert.ok(repair.dependencies.includes('t1'), 'repair lost its upstream dependency')
})

test('#175A: a failed gate cannot be a dependency edge, or the repair could never be claimed', () => {
  // Why the causal link is a dedicated field: `unsatisfiedDependencies` only
  // accepts dependencies whose status is `completed`, and a failed task never
  // reaches it. Putting t2 into `dependencies` would dead-lock every generated
  // repair, so the graph records the causality without that edge.
  const team = baseTeam([implementation(), failedReview()])
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  const task = { ...repair, id: 't9', status: 'pending', createdAt: 0, updatedAt: 0, attempt: 0 }
  const withFailedEdge = { ...task, dependencies: [...task.dependencies, 't2'] }
  assert.deepEqual(
    unsatisfiedDependencies([...team.tasks, withFailedEdge], withFailedEdge.dependencies),
    ['t2'],
    'a failed dependency is not treated as satisfied',
  )
  assert.deepEqual(unsatisfiedDependencies([...team.tasks, task], task.dependencies), [])
})

test('#175A: delivery does not report a false "failed without a follow-up repair" for a fixed verification', () => {
  const repair = {
    id: 't4', subject: 'repair-round-1', status: 'completed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'repair', round: 1,
    assignee: 'implementer', inScope: ['src/'], acceptance: ['fix it'], verify: ['node --test'],
    sourceTaskId: 't1', sourceFindingIds: ['VF1'],
    changedPaths: ['src/app.js'],
    acceptanceResults: [{ criterion: 'fix it', status: 'passed' }],
    commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
  }
  const verification = failedVerification({
    findings: [{ id: 'VF1', severity: 'high', problem: 'p', requiredFix: 'fix src/app.js', file: 'src/app.js' }],
  })
  const review = {
    id: 't5', subject: 'review-round-1', status: 'completed', dependencies: ['t4'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'review', round: 1,
    assignee: 'reviewer', verdict: 'pass', reviewedTaskId: 't4',
    objective: 'Review', acceptance: ['no blockers'],
    reviewedAttempt: 1,
  }
  const team = baseTeam([implementation(), verification, repair, review])
  const delivery = canDeclareDelivery(team)
  assert.ok(
    !delivery.blockers.some((item) => item.includes('t3 failed without a follow-up repair')),
    `false blocker still reported: ${JSON.stringify(delivery.blockers)}`,
  )
})

test('#175B: a failed verification produces a repair + re-check round automatically', () => {
  const team = baseTeam([implementation(), failedVerification()])
  const planned = planQualityFollowUp(team, team.tasks[1])
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.ok(repair, 'a failed verification produced no repair round')
  assert.deepEqual(
    repair.findingSourceTaskIds,
    ['t3'],
    `repair does not record the failed verification t3: ${JSON.stringify(repair.findingSourceTaskIds)}`,
  )
  assert.ok(repair.acceptance.length > 0, 'repair has no acceptance derived from the failure')
  assert.deepEqual(repair.verify, ['node --test'])
  const recheck = planned.created.find((item) => item.id !== repair.id)
  assert.ok(recheck, 'a failed verification produced no re-check round')
  assert.equal(recheck.kind, 'verification')
  assert.deepEqual(recheck.dependencies, [repair.id])
})

test('#175B: the verification re-check is not a review and carries the same verify commands', () => {
  const team = baseTeam([implementation(), failedVerification()])
  const planned = planQualityFollowUp(team, team.tasks[1])
  const recheck = planned.created.find((item) => item.kind === 'verification')
  assert.ok(recheck)
  assert.deepEqual(recheck.verify, ['node --test'])
  assert.equal(recheck.reviewedTaskId, undefined)
})

test('#175B: a failed verification still respects the repair ceiling', () => {
  const priorRepairs = [1, 2].map((round) => ({
    id: `t${10 + round}`, subject: `repair-round-${round}`, status: 'completed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'repair', round,
    assignee: 'implementer', inScope: ['src/'], acceptance: ['x'],
    sourceTaskId: 't1', sourceFindingIds: [],
  }))
  const team = baseTeam([implementation(), failedVerification(), ...priorRepairs])
  const planned = planQualityFollowUp(team, team.tasks[1])
  assert.equal(planned.created.length, 0)
  assert.equal(planned.escalated, true)
})

test('#175: a failed review whose findings were fixed stays closed in the delivery graph', () => {
  const repair = {
    id: 't4', subject: 'repair-round-2', status: 'completed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'repair', round: 2,
    assignee: 'implementer', inScope: ['src/'], acceptance: ['fix it'], verify: ['node --test'],
    sourceTaskId: 't1', sourceFindingIds: ['F1'],
    changedPaths: ['src/app.js'],
    acceptanceResults: [{ criterion: 'fix it', status: 'passed' }],
    commandsRun: [{ command: 'node --test', status: 'passed', exitCode: 0 }],
  }
  const team = baseTeam([implementation(), failedReview(), repair])
  const delivery = canDeclareDelivery(team)
  assert.ok(
    !delivery.blockers.some((item) => item.includes('t2 failed without a follow-up repair')),
    `false blocker for a closed review loop: ${JSON.stringify(delivery.blockers)}`,
  )
})
