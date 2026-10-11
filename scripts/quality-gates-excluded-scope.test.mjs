#!/usr/bin/env node
/**
 * Regression tests for issue #183: repair rounds derived from findings on
 * default-excluded paths (`secrets/` segments, `.env*`, `.git`, `.dsh`,
 * `id_rsa*`) are unsatisfiable.
 *
 * `repairScopeFromFindings()` used to collect `finding.file` and every path
 * mentioned in `requiredFix` unconditionally, while the completion gate
 * `classifyChangedPath()` checks `isDefaultExcluded()` BEFORE `inScope`. A
 * derived contract could therefore demand an edit (`acceptance` ← requiredFix,
 * `inScope` ← that path) that the gate rejects the moment the member honestly
 * reports it in `changedPaths`: `repair cannot complete: <path> is
 * out_of_scope`. No honest completion exists, so the round can only burn its
 * attempts and escalate.
 *
 * Contract generation and the completion gate must agree: default-excluded
 * paths are not eligible repair scope, and a finding whose only targets are
 * default-excluded must not silently produce a repair round.
 *
 * Run: node --test scripts/quality-gates-excluded-scope.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyChangedPath,
  planQualityFollowUp,
  repairScopeFromFindings,
} from '../lib/quality-gates.js'

function finding(extra = {}) {
  return { id: 'F1', severity: 'medium', problem: 'problem', requiredFix: 'fix it', ...extra }
}

function member(name, role) {
  return { id: `member-${name}`, name, role, joinedAt: 0, status: 'idle' }
}

function teamWithSource(extra = {}) {
  return {
    name: 't', id: 't', description: '', captainSessionId: 'captain',
    createdAt: 0, taskSeq: 1,
    members: [member('implementer', 'implementer'), member('reviewer', 'reviewer')],
    tasks: [{
      id: 't1', subject: 'impl', status: 'completed', dependencies: [],
      createdAt: 0, updatedAt: 0, attempt: 1, kind: 'implementation',
      assignee: 'implementer',
      inScope: ['src/'], acceptance: ['done'], verify: ['pnpm test'],
      ...extra,
    }],
  }
}

function failedReview(extra = {}) {
  return {
    id: 't2', subject: 'review', status: 'failed', dependencies: ['t1'],
    createdAt: 0, updatedAt: 0, attempt: 1, kind: 'review', round: 1,
    assignee: 'reviewer', verdict: 'needs_revision', reviewedTaskId: 't1',
    objective: 'Review', acceptance: ['no blockers'],
    findings: [finding()],
    ...extra,
  }
}

test('#183: derived repair scope drops paths the completion gate classifies out_of_scope', () => {
  const scope = repairScopeFromFindings(
    [finding({ file: 'src/secrets/redactor.ts', requiredFix: 'remove the leaking log line in src/secrets/redactor.ts' })],
    ['src/app/'],
  )
  assert.deepEqual(scope, ['src/app/'], `default-excluded path leaked into scope: ${JSON.stringify(scope)}`)
})

test('#183: .env.example and secrets/ findings never produce an unsatisfiable inScope entry', () => {
  const scope = repairScopeFromFindings(
    [
      finding({ id: 'F1', file: '.env.example', requiredFix: 'document APP_SECRET in .env.example' }),
      finding({ id: 'F2', file: 'lib/secrets/parser.ts', requiredFix: 'harden lib/secrets/parser.ts' }),
      finding({ id: 'F3', file: 'src/app/config.ts', requiredFix: 'read the value from src/app/config.ts' }),
    ],
    ['src/app/'],
  )
  assert.deepEqual(scope, ['src/app/config.ts'])
  for (const entry of scope ?? []) {
    assert.notEqual(
      classifyChangedPath(entry, scope ?? [], []),
      'out_of_scope',
      `derived scope entry ${entry} is rejected by the completion gate`,
    )
  }
})

test('#183: a repair round whose only cited targets are default-excluded escalates instead of dead-locking', () => {
  const team = teamWithSource()
  const review = failedReview({
    findings: [finding({ file: 'src/secrets/redactor.ts', requiredFix: 'redact src/secrets/redactor.ts' })],
  })
  team.tasks.push(review)
  const planned = planQualityFollowUp(team, review)
  assert.equal(planned.created.length, 0, `unsatisfiable repair round was generated: ${JSON.stringify(planned.created)}`)
  assert.equal(planned.escalated, true)
  assert.match(String(planned.reason ?? ''), /excluded|secrets|\.env/iu)
})

test('#183: a mixed round keeps the legal target and records the excluded finding for the user', () => {
  const team = teamWithSource()
  const review = failedReview({
    findings: [
      finding({ id: 'F1', file: 'src/secrets/redactor.ts', requiredFix: 'redact src/secrets/redactor.ts' }),
      finding({ id: 'F2', file: 'src/app/config.ts', requiredFix: 'read the value from src/app/config.ts' }),
    ],
  })
  team.tasks.push(review)
  const planned = planQualityFollowUp(team, review)
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.ok(repair, 'no repair round generated for the legal finding')
  assert.deepEqual(repair.inScope, ['src/app/config.ts'])
  assert.deepEqual(repair.acceptance, ['read the value from src/app/config.ts'])
  assert.deepEqual(repair.sourceFindingIds, ['F2'])
  assert.equal(planned.escalated, undefined)
  assert.match(String(planned.excludedFindings ?? ''), /F1/u)
})

test('#183: the completion gate itself still refuses default-excluded paths (unchanged invariant)', () => {
  assert.equal(classifyChangedPath('src/secrets/redactor.ts', ['src/secrets/'], []), 'out_of_scope')
  assert.equal(classifyChangedPath('.env.example', ['.env.example'], []), 'out_of_scope')
  assert.equal(classifyChangedPath('src/app/config.ts', ['src/app/'], []), 'in_scope')
})

test('#183: a prose path that is not a real file cannot rescue an excluded finding', () => {
  // Real run (deepseek-flash, 2026-10-10): a blocker finding named
  // src/secrets/redactor.js and its requiredFix said "never pass value to any
  // console/stream write". `console/stream` is not a workspace path, but it
  // made the finding look actionable, so the excluded finding produced a
  // repair whose acceptance demanded an edit the gate forbids.
  const team = teamWithSource()
  const review = failedReview({
    findings: [finding({
      file: 'src/secrets/redactor.js',
      requiredFix: "Remove the console.log from src/secrets/redactor.js and never pass `value` to any console/stream write.",
    })],
  })
  team.tasks.push(review)
  const planned = planQualityFollowUp(team, review, { pathExists: () => false })
  assert.equal(planned.created.length, 0, `impossible repair was generated: ${JSON.stringify(planned.created)}`)
  assert.equal(planned.escalated, true)
  assert.match(String(planned.reason ?? ''), /excluded|secrets/iu)
  assert.deepEqual(planned.excludedFindings, ['F1'])
})

test('#183: a real legal target keeps the finding actionable, and a missing own file is not discarded', () => {
  const team = teamWithSource()
  const review = failedReview({
    findings: [
      finding({ id: 'F1', file: 'src/app/config.js', requiredFix: 'route logging through src/app/config.js' }),
      finding({ id: 'F2', file: 'src/app/new-logger.js', requiredFix: 'create src/app/new-logger.js' }),
    ],
  })
  team.tasks.push(review)
  const planned = planQualityFollowUp(team, review, { pathExists: (path) => path === 'src/app/config.js' })
  const repair = planned.created.find((item) => item.kind === 'repair')
  assert.ok(repair, 'a legal finding produced no repair round')
  assert.deepEqual(repair.inScope, ['src/app/config.js', 'src/app/new-logger.js'])
  assert.equal(planned.escalated, undefined)
})
