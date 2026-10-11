import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Regression test for the corrupt-team.json issue: a state file that exists
// but fails JSON parsing (truncated write, disk corruption, manual edit,
// merge-conflict markers) must never leak a raw SyntaxError through the two
// global host integration points:
//   A) the `agent/pre-step` mailbox-admission hook (src/mailbox.ts)
//   B) the member delegation guard wrapping subagents.start (src/members.ts)
// Node >= 23.6 imports the type-stripping-compatible plugin sources directly.
const { installMailboxAdmission } = await import('../src/mailbox.ts')
const { installMemberDelegationGuard } = await import('../src/members.ts')
const { SUBAGENT_DESCRIPTOR_VERSION } = await import('@deepseek-ai/dsh-subagent')

const STATE_DIR = '.agent-teams-state'
const CAPTAIN_ID = 'captain-session-0001'
const MEMBER_ID = 'member-session-0001'
const MEMBER_NAME = 'alice'
const TEAM_ID = 'team-a'
const NOW = 1_700_000_000_000
const CORRUPT_JSON = '{"id": "team-a", "members": [ TRUNCATED'

const validTeam = (overrides = {}) => ({
  id: TEAM_ID,
  name: 'Corrupt State Team',
  captainSessionId: CAPTAIN_ID,
  createdAt: NOW,
  members: [{ id: MEMBER_ID, name: MEMBER_NAME, role: 'engineer', joinedAt: NOW, status: 'idle' }],
  tasks: [],
  taskSeq: 0,
  ...overrides,
})

async function workspaceWith(team) {
  const root = await mkdtemp(join(tmpdir(), 'corrupt-teamjson-test-'))
  const stateRoot = join(root, STATE_DIR)
  await mkdir(join(stateRoot, TEAM_ID, 'inbox'), { recursive: true })
  await writeFile(join(stateRoot, TEAM_ID, 'team.json'), typeof team === 'string' ? team : JSON.stringify(team, null, 2))
  return { root, stateRoot }
}

function memberSession(cwd) {
  return {
    header: { cwd },
    ownEvents: () => [{
      type: 'subagent/descriptor',
      data: { version: SUBAGENT_DESCRIPTOR_VERSION, mode: 'continuable', provider: 'in-process', label: `agent-teams:${TEAM_ID}:${MEMBER_NAME}` },
    }],
  }
}

/** Minimal ctx whose logger captures warnings and whose `on` records the hook. */
function hookContext() {
  const listeners = new Map()
  const warnings = []
  const ctx = { on: (name, listener) => { listeners.set(name, listener); return () => listeners.delete(name) }, logger: { warn: m => warnings.push(m) } }
  return { ctx, listeners, warnings }
}

const settlementDecision = () => ({
  kind: 'enter',
  messages: [{
    source: {
      kind: 'subagent-settled',
      senderSessionId: MEMBER_ID,
      summary: `Background subagent ${MEMBER_ID} finished and will do no further work unless you send it more.`,
    },
    content: [],
  }],
})

test('A1: corrupt team.json degrades mailbox admission to plain pass-through instead of escaping the pre-step hook', async t => {
  const { root, stateRoot } = await workspaceWith(CORRUPT_JSON)
  t.after(() => rm(root, { recursive: true, force: true }))
  const { ctx, listeners, warnings } = hookContext()
  installMailboxAdmission(ctx, STATE_DIR)
  const decision = settlementDecision()
  const result = await listeners.get('agent/pre-step')(
    { agent: { id: CAPTAIN_ID, session: { header: { cwd: root }, ownEvents: () => [] } }, turn: 1 },
    async () => decision,
  )
  assert.equal(result.kind, 'enter', 'host step must be admitted')
  assert.deepEqual(result.messages, decision.messages, 'settlement inputs must pass through untouched')
  assert.ok(warnings.some(m => m.includes('mailbox admission degraded')), 'degradation must be logged')
  await rm(stateRoot, { recursive: true, force: true })
})

test('A2: valid team.json keeps mailbox admission working on the same hook path', async t => {
  const { root } = await workspaceWith(validTeam())
  t.after(() => rm(root, { recursive: true, force: true }))
  const { ctx, listeners, warnings } = hookContext()
  installMailboxAdmission(ctx, STATE_DIR)
  const result = await listeners.get('agent/pre-step')(
    { agent: { id: CAPTAIN_ID, session: { header: { cwd: root }, ownEvents: () => [] } }, turn: 1 },
    async () => settlementDecision(),
  )
  assert.equal(result.kind, 'enter')
  assert.equal(warnings.length, 0, 'no degradation warning on valid state')
})

test('B1: corrupt team.json rejects delegated spawn with an actionable error, not a raw SyntaxError', async t => {
  const { root } = await workspaceWith(CORRUPT_JSON)
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = { start: async () => ({ childId: 'child' }), startContinuable: async () => ({ childId: 'child' }) }
  const ctx = { subagents: runtime, agents: { get: () => undefined }, effect: f => f() }
  installMemberDelegationGuard(ctx, STATE_DIR, 1)
  await assert.rejects(
    runtime.start('child', { parent: { id: MEMBER_ID, session: memberSession(root) } }),
    error => !(error instanceof SyntaxError)
      && /delegation guard could not read the team state/.test(error.message)
      && error.message.includes('team.json'),
    'guard must reject with a clean, actionable message naming the corrupt file',
  )
})

test('B2: valid team.json with a removed member still gets the intended guard rejection', async t => {
  const { root } = await workspaceWith(validTeam({
    members: [{ id: MEMBER_ID, name: MEMBER_NAME, role: 'engineer', joinedAt: NOW, status: 'removed' }],
  }))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = { start: async () => ({ childId: 'child' }), startContinuable: async () => ({ childId: 'child' }) }
  const ctx = { subagents: runtime, agents: { get: () => undefined }, effect: f => f() }
  installMemberDelegationGuard(ctx, STATE_DIR, 1)
  await assert.rejects(
    runtime.start('child', { parent: { id: MEMBER_ID, session: memberSession(root) } }),
    /no longer admitting delegated work/,
  )
})

test('B3: valid team.json still enforces the member delegation depth limit', async t => {
  const { root } = await workspaceWith(validTeam())
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = { start: async () => ({ childId: 'grandchild' }), startContinuable: async () => ({ childId: 'grandchild' }) }
  const memberAgent = { id: MEMBER_ID, session: memberSession(root) }
  const ctx = { subagents: runtime, agents: { get: id => (id === MEMBER_ID ? memberAgent : undefined) }, effect: f => f() }
  installMemberDelegationGuard(ctx, STATE_DIR, 1)
  const descendant = { id: 'descendant-1', session: { header: { cwd: root, parentSession: MEMBER_ID }, ownEvents: () => [] } }
  await assert.rejects(
    runtime.start('grandchild', { parent: descendant }),
    /delegation limit \(1\) reached/,
  )
})

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0

test('B4: unreadable (EACCES) team.json rejects delegated spawn with the actionable guard error', async t => {
  if (process.platform === 'win32') { t.skip('Windows chmod does not enforce POSIX read permissions; skipping') ; return }
  if (isRoot) { t.skip('chmod-based EACCES is not enforced for root; skipping') ; return }
  const { root } = await workspaceWith(validTeam())
  t.after(() => rm(root, { recursive: true, force: true }))
  await chmod(join(root, STATE_DIR, TEAM_ID, 'team.json'), 0o000)
  const runtime = { start: async () => ({ childId: 'child' }), startContinuable: async () => ({ childId: 'child' }) }
  const ctx = { subagents: runtime, agents: { get: () => undefined }, effect: f => f() }
  installMemberDelegationGuard(ctx, STATE_DIR, 1)
  await assert.rejects(
    runtime.start('child', { parent: { id: MEMBER_ID, session: memberSession(root) } }),
    error => !(error instanceof SyntaxError)
      && /delegation guard could not read the team state/.test(error.message)
      && error.message.includes('unreadable')
      && /EACCES/.test(error.message),
    'guard must surface the EACCES cause inside the clean, actionable message',
  )
})

test('B5: missing state directory (ENOENT guard branch) yields the intended member rejection, not a read error', async t => {
  const root = await mkdtemp(join(tmpdir(), 'corrupt-teamjson-empty-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = { start: async () => ({ childId: 'child' }), startContinuable: async () => ({ childId: 'child' }) }
  const ctx = { subagents: runtime, agents: { get: () => undefined }, effect: f => f() }
  installMemberDelegationGuard(ctx, STATE_DIR, 1)
  await assert.rejects(
    runtime.start('child', { parent: { id: MEMBER_ID, session: memberSession(root) } }),
    error => /no longer admitting delegated work/.test(error.message)
      && !/could not read the team state/.test(error.message),
    'ENOENT must map to undefined team state and the normal member rejection',
  )
})
