#!/usr/bin/env node
/**
 * Regression TDD: blank optional tool-call arguments must mean "absent".
 *
 * Observed field failure (2 sessions, 48 `agent_teams_create` attempts, 0
 * successes): the captain model filled EVERY optional key with `""` — plain
 * tool-call habit, not a schema requirement — and the inline-plan validator
 * rejected the blank string:
 *
 *   profiles.inline-plan.members[0].tool_policy must not be empty   (x15)
 *   profiles.inline-plan.members[0].provider must not be empty      (x6)
 *
 * The same habit broke `list_subagent_models` (``provider`` must be non-empty),
 * `working_directory` (cd must not be empty) and `grep` (include must be a
 * non-empty glob), proving it is caller behaviour, not one tool's contract.
 *
 * The edit path already normalizes blanks away (`trimmedOptional` in
 * `src/tools.ts`), so a blank string is "absent" everywhere else in this
 * plugin. This pins the profile normalizer to the same rule, so a blank
 * optional field can never deadlock a plan again, while required fields and
 * non-string values stay strict.
 */
import { resolveTeamProfile } from '../lib/profiles.js'

let failures = 0
function check(label, value) {
  if (value) console.log(`  PASS  ${label}`)
  else { failures += 1; console.error(`  FAIL  ${label}`) }
}
function ok(label, fn) {
  try { fn(); console.log(`  PASS  ${label}`) }
  catch (error) { failures += 1; console.error(`  FAIL  ${label} (threw: ${error.message})`) }
}
function throws(label, pattern, fn) {
  try {
    fn()
    failures += 1
    console.error(`  FAIL  ${label} (did not throw)`)
  } catch (error) {
    if (pattern.test(error.message)) console.log(`  PASS  ${label}`)
    else { failures += 1; console.error(`  FAIL  ${label} (message: ${error.message})`) }
  }
}

// ---- The exact failing call: every optional member key blank -------------
const blankPlan = {
  members: [{
    name: 'tuner-ui',
    role: '',
    provider: '',
    model: '',
    reasoning_effort: '',
    executionPrompt: '',
    tool_policy: '',
  }],
  tasks: [{ id: 't1', subject: 'Tune the panel', description: '', assignee: 'tuner-ui', dependencies: [] }],
}
let normalized
ok('a blank optional member key no longer aborts plan creation', () => {
  normalized = resolveTeamProfile({ 'inline-plan': blankPlan }, 'inline-plan', 8)
})
check('blank tool_policy is normalized to absent', normalized?.members[0]?.toolPolicy === undefined)
check('blank provider is normalized to absent', normalized?.members[0]?.provider === undefined)
check('blank model is normalized to absent', normalized?.members[0]?.model === undefined)
check('blank role is normalized to absent', normalized?.members[0]?.role === undefined)
check('blank reasoning_effort is normalized to absent', normalized?.members[0]?.reasoningEffort === undefined)
check('blank executionPrompt is normalized to absent', normalized?.members[0]?.executionPrompt === undefined)
check('blank task description is normalized to absent', normalized?.tasks[0]?.description === undefined)

// Whitespace-only is the same shape as an empty string.
const whitespace = { members: [{ name: 'w', tool_policy: '   ', role: '  ' }], tasks: [{ id: 't1', subject: 's', assignee: 'w' }] }
let spaced
ok('whitespace-only optional keys are accepted', () => {
  spaced = resolveTeamProfile({ 'inline-plan': whitespace }, 'inline-plan', 8)
})
check('whitespace-only tool_policy normalizes to absent', spaced?.members[0]?.toolPolicy === undefined)

// A real value still survives, trimmed.
const real = {
  members: [{ name: 'w', provider: 'deepseek-f', model: ' workbuddy/deepseek-v4.1-flash ', tool_policy: ' researcher ' }],
  tasks: [{ id: 't1', subject: 's', assignee: 'w' }],
}
let kept
ok('a real optional value is kept', () => {
  kept = resolveTeamProfile({ 'inline-plan': real }, 'inline-plan', 8)
})
check('real tool_policy survives, trimmed', kept?.members[0]?.toolPolicy === 'researcher')
check('real model survives, trimmed', kept?.members[0]?.model === 'workbuddy/deepseek-v4.1-flash')

// ---- Profile-level and required-field strictness is unchanged ------------
const blankProfile = {
  description: '',
  protocol: '  ',
  executionPrompt: '',
  members: [{ name: 'w' }],
  tasks: [{ id: 't1', subject: 's', assignee: 'w' }],
}
let blanked
ok('blank profile-level optional text is accepted', () => {
  blanked = resolveTeamProfile({ 'inline-plan': blankProfile }, 'inline-plan', 8)
})
check('blank profile description normalizes to absent', blanked?.description === undefined)
check('blank profile protocol normalizes to absent', blanked?.protocol === undefined)

throws('a member without a name is still rejected', /has a member with an empty name/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: '' }], tasks: [] } }, 'inline-plan', 8))
throws('a task without an id is still rejected', /has a task with an empty id/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w' }], tasks: [{ id: '', subject: 's' }] } }, 'inline-plan', 8))
throws('a task without a subject is still rejected', /missing a subject/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w' }], tasks: [{ id: 't1', subject: '' }] } }, 'inline-plan', 8))
throws('a blank dependency id is still rejected', /dependencies\[0\] must not be empty/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w' }], tasks: [{ id: 't1', subject: 's', dependencies: [''] }] } }, 'inline-plan', 8))
throws('a non-string optional value is still rejected', /tool_policy must be a string/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w', tool_policy: 7 }], tasks: [] } }, 'inline-plan', 8))
throws('a provider with no model is still rejected', /sets provider without model/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w', provider: 'deepseek-f' }], tasks: [] } }, 'inline-plan', 8))
throws('an entirely blank provider+model pair is absent, not a route', /sets provider without model/u,
  () => resolveTeamProfile({ 'inline-plan': { members: [{ name: 'w', provider: 'deepseek-f', model: '' }], tasks: [] } }, 'inline-plan', 8))

if (failures > 0) process.exitCode = 1
else console.log('inline-plan blank-optional TDD checks passed')
