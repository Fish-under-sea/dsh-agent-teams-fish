/**
 * Issue #203 regression: a team card must resolve the host's canonical team id
 * instead of re-deriving it from the display name.
 *
 * The client used to clean names with an ASCII-only whitelist while the host
 * keeps Unicode letters and digits, so `数据团队` became `team` on the card and
 * never matched its live team (empty roster, never-satisfied monitor target, and
 * a bogus historic entry beside the real team in the activity panel).
 *
 * These tests import the BUILT client helper the browser bundle is generated
 * from. The fixtures are the values recorded by the real runs documented in
 * docs/issue-maintenance-2026-10-10/card/REPORT.md (dsh 0.2.0-rc.2 +
 * deepseek-account/deepseek-flash); the canonical ids are re-checked against
 * the real host key function rather than hard-coded twice.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentTeamsCardDefinition,
  parseAgentTeamsCreateArgs,
  parseAgentTeamsCreateResult,
  resultText,
  teamIdFromCreateResultText,
  teamKeyFromName,
} from '../lib/client/agent-teams-card-definition.js'
import { sanitizeKey } from '../lib/state.js'

// Real recorded runs (see REPORT.md section 5).
const REAL_CANDIDATE_SESSION = 'session-5b9c59ae-7b18-47ae-8b56-2cb4fe66b13c'
const REAL_MEMBERS = [
  { id: '', name: '阿明', role: '工程师' },
  { id: '', name: 'Léa', role: 'reviewer' },
]
const LONG_NAME = '跨区域研发效能平台数据治理跨区域研发效能平台数据治理跨区域研发效能平台数据治理跨区域研发效能平台数据治理专项验证小组'
const EMOJI_NAME = '🚀🎯'

/** The exact renderings the create tool has produced since they were introduced. */
const runningText = (name, id, stateDir) => `Team "${name}" created (id ${id}) under ${stateDir}. You are the captain.`
const stagedText = (name, stateDir) => `Team "${name}" plan created under ${stateDir}. It is staged: finish the roster and DAG, then wait for the user to edit and approve it. Do not start or approve it yourself.`

/** Run one real create call plus its result through the card definition. */
function fold(createArguments, resultData = {}) {
  const call = { type: 'tool/call', seq: 17, data: { callId: 'call_1', name: 'agent_teams_create', arguments: createArguments } }
  const result = {
    type: 'tool/result',
    seq: 18,
    data: {
      turn: 1,
      step: 1,
      message: { role: 'tool', source: { kind: 'tool', callId: 'call_1' }, toolCallId: 'call_1', content: [], isError: false },
      ...resultData,
    },
  }
  const location = { kind: 'session' }
  const startMatch = { event: call, role: 'start', location }
  const base = { key: 'agent-teams:call_1', kind: 'agent-teams', id: 'call_1', target: 'chat' }
  assert.equal(agentTeamsCardDefinition.match(call)?.role, 'start')
  let context = { ...base, start: startMatch, state: agentTeamsCardDefinition.start({ ...base, start: startMatch }, startMatch) }
  context = { ...context, state: agentTeamsCardDefinition.update(context, { event: result, role: 'update', location }) }
  return { state: context.state, node: agentTeamsCardDefinition.buildViewNode(context) }
}

test('the client key mirrors the host key for names the host cleans without a digest', () => {
  for (const name of ['数据团队', 'Équipe A', 'チーム1', 'Repo Review 2W!', '  Mixed   Name  ']) {
    assert.equal(teamKeyFromName(name), sanitizeKey(name), `key parity for ${name}`)
  }
  assert.equal(teamKeyFromName('数据团队'), '数据团队')
  assert.equal(teamKeyFromName('Équipe A'), 'équipe-a')
})

test('names needing the host digest or truncation stay divergent, so the canonical id is required', () => {
  // Long names: the host truncates and appends a digest; the client cannot.
  assert.equal([...LONG_NAME].length > 48, true)
  assert.notEqual(teamKeyFromName(LONG_NAME), sanitizeKey(LONG_NAME))
  assert.match(sanitizeKey(LONG_NAME), /-[\da-f]{8}$/u)
  // Names with no letters or digits: the host digests the raw name; the client
  // has no synchronous digest and keeps its legacy fallback.
  assert.equal(teamKeyFromName(EMOJI_NAME), 'team')
  assert.equal(sanitizeKey(EMOJI_NAME), 'k-28f98294')
})

test('create arguments keep the display name and use the host-shaped key', () => {
  assert.deepEqual(parseAgentTeamsCreateArgs('{"name":" 数据团队 "}'), { teamId: '数据团队', name: '数据团队' })
  assert.deepEqual(parseAgentTeamsCreateArgs('{"name":" Repo Review 2W! "}'), { teamId: 'repo-review-2w', name: 'Repo Review 2W!' })
  assert.equal(parseAgentTeamsCreateArgs('{bad'), undefined)
  assert.equal(parseAgentTeamsCreateArgs('{"name":"   "}'), undefined)
})

test('the canonical identity is read from the create result metadata', () => {
  const identity = parseAgentTeamsCreateResult({
    team_id: '数据团队',
    team_name: '数据团队',
    captain_session_id: REAL_CANDIDATE_SESSION,
    phase: 'running',
    members: [{ id: '', name: '阿明', role: '工程师', status: 'idle' }, { id: '', name: 'Léa', role: 'reviewer', status: 'idle' }],
  })
  assert.deepEqual(identity, { teamId: '数据团队', captainSessionId: REAL_CANDIDATE_SESSION, members: REAL_MEMBERS })
  for (const meta of [undefined, null, {}, { team_id: '' }, { team_id: 42 }, 'text']) {
    assert.equal(parseAgentTeamsCreateResult(meta), undefined)
  }
})

test('a pre-metadata record still yields the canonical id from the running result text', () => {
  const stateDir = `.agent-teams/数据团队`
  assert.equal(teamIdFromCreateResultText(runningText('数据团队', '数据团队', stateDir)), '数据团队')
  assert.equal(teamIdFromCreateResultText(runningText(LONG_NAME, sanitizeKey(LONG_NAME), `.agent-teams/${sanitizeKey(LONG_NAME)}`)), sanitizeKey(LONG_NAME))
  assert.equal(teamIdFromCreateResultText(runningText(EMOJI_NAME, sanitizeKey(EMOJI_NAME), `.agent-teams/${sanitizeKey(EMOJI_NAME)}`)), 'k-28f98294')
})

test('a pre-metadata staged plan yields the canonical id from its state directory', () => {
  const id = sanitizeKey('数据团队审核组')
  assert.equal(teamIdFromCreateResultText(stagedText('数据团队审核组', `/workspace/.agent-teams/${id}`)), id)
  assert.equal(teamIdFromCreateResultText('Team "x" created. You are the captain.'), undefined)
})

test('a team name carrying a look-alike segment cannot override the canonical id', () => {
  const text = 'Team "A" created (id injected) under B" created (id real-team) under /x/.agent-teams/real-team. You are the captain.'
  assert.equal(teamIdFromCreateResultText(text), 'real-team')
})

test('resultText concatenates text blocks only', () => {
  assert.equal(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(resultText({ content: [] }), '')
})

test('the card folds the canonical id, captain and roster from metadata', () => {
  const { state, node } = fold(JSON.stringify({ name: '数据团队', approval: 'automatic' }), {
    meta: {
      team_id: '数据团队',
      team_name: '数据团队',
      captain_session_id: REAL_CANDIDATE_SESSION,
      phase: 'running',
      members: [{ id: '', name: '阿明', role: '工程师' }, { id: '', name: 'Léa', role: 'reviewer' }],
    },
    message: { role: 'tool', source: { kind: 'tool', callId: 'call_1' }, toolCallId: 'call_1', isError: false, content: [{ type: 'text', text: runningText('数据团队', '数据团队', '.agent-teams/数据团队') }] },
  })
  assert.equal(state.teamId, '数据团队')
  assert.equal(state.captainSessionId, REAL_CANDIDATE_SESSION)
  assert.deepEqual(state.members, REAL_MEMBERS)
  assert.deepEqual(node?.data, {
    teamId: '数据团队',
    captainSessionId: REAL_CANDIDATE_SESSION,
    teamName: '数据团队',
    members: REAL_MEMBERS,
  })
})

test('metadata cannot replace the display name taken from the create call', () => {
  const { node } = fold(JSON.stringify({ name: '数据团队' }), {
    meta: { team_id: 'canonical-key', team_name: 'renamed-by-host', captain_session_id: 's', members: [] },
  })
  assert.equal(node?.data.teamId, 'canonical-key')
  assert.equal(node?.data.teamName, '数据团队')
})

test('a pre-metadata record folds the canonical id without inventing a roster', () => {
  const { state, node } = fold(JSON.stringify({ name: LONG_NAME }), {
    message: { role: 'tool', source: { kind: 'tool', callId: 'call_1' }, toolCallId: 'call_1', isError: false, content: [{ type: 'text', text: runningText(LONG_NAME, sanitizeKey(LONG_NAME), `.agent-teams/${sanitizeKey(LONG_NAME)}`) }] },
  })
  assert.equal(state.teamId, sanitizeKey(LONG_NAME))
  assert.equal(state.captainSessionId, '')
  assert.deepEqual(state.members, [])
  assert.equal(node?.data.teamId, sanitizeKey(LONG_NAME))
})

test('a failed create result renders no card', () => {
  const { state, node } = fold(JSON.stringify({ name: '数据团队' }), {
    message: { role: 'tool', source: { kind: 'tool', callId: 'call_1' }, toolCallId: 'call_1', isError: true, content: [{ type: 'text', text: 'team id "数据团队" is taken by another captain' }] },
  })
  assert.equal(state.accepted, false)
  assert.equal(node, null)
})

test('a result without metadata or canonical text keeps the derived key', () => {
  const { state, node } = fold(JSON.stringify({ name: '数据团队' }), {
    message: { role: 'tool', source: { kind: 'tool', callId: 'call_1' }, toolCallId: 'call_1', isError: false, content: [{ type: 'text', text: 'ok' }] },
  })
  assert.equal(state.accepted, true)
  assert.equal(state.teamId, '数据团队')
  assert.equal(node?.data.teamId, '数据团队')
})
