import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installMemberSelectionRuntime, spawnMember } from '../lib/members.js'
import { createTeamDir } from '../lib/state.js'

const STATE_DIR = '.agent-teams'

function scope(extra = {}) {
  const listeners = new Map(), disposers = []
  return { ...extra, listeners, logger: { warn() {}, debug() {} },
    on(name, fn) { const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(fn); return () => set.delete(fn) },
    effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose },
    emit(name, event) { for (const fn of [...listeners.get(name) ?? []]) fn(event) },
    dispose() { for (const dispose of disposers.reverse()) dispose?.() },
  }
}

/** A preset-only host: only agentPreset/agentOptions, no persona/toolFilter. */
function fixture({ rejectFilter = false, workspace } = {}) {
  const seen = []
  const runtime = {
    getProvider: () => ({
      prepareContinuable() {},
      capabilities: { agentOptions: true, agentPreset: true, outputSchema: true, depthLimit: true },
    }),
    [Symbol.for('dsh.subagent.deliverPrompt')]() {}, sendMessage() {},
    async startActivation(spec) {
      assert.equal('persona' in spec.request, false, 'preset-only host must not receive persona')
      assert.equal('toolFilter' in spec.request, false, 'preset-only host must not receive toolFilter')
      const child = makeChild({
        cwd: workspace, parentSession: 'captain',
        events: [{ type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: spec.label, agentProvider: 'chosen', agentModel: 'model' } }],
      })
      ctx.emit('agent/created', { agent: child, source: 'startup' })
      assert.match(child.applied.persona, /You are worker/)
      assert.deepEqual(child.applied.filter, FILTER)
      seen.push(child)
      return { childId: child.id }
    },
  }
  const ctx = scope({ subagents: runtime })
  function makeChild({ cwd, parentSession, events }) {
    const applied = { persona: '', filter: undefined, disposed: 0 }
    const child = { id: 'child', status: 'idle', options: {}, applied,
      session: { header: { cwd, parentSession }, ownEvents: () => events,
        // The plugin must never write an unknown session event type: that makes
        // a stored session unreadable for the Harness.
        append() { throw new Error('unexpected session append') } } }
    child.ctx = scope({
      tools: { restrict(filter) { if (rejectFilter) throw new Error('restriction unavailable'); applied.filter = structuredClone(filter); return () => applied.disposed++ } },
      systemPrompt: { getSectionOrder: () => 10, section(spec) { applied.persona = spec.text; return () => applied.disposed++ } },
    })
    return child
  }
  const bridge = installMemberSelectionRuntime(ctx, STATE_DIR, undefined, 'plugin guidance')
  return { ctx, bridge, seen, makeChild }
}

const captain = { id: 'captain' }
const TEAM = {
  id: 'team', name: 'Team', description: 'ship the thing', captainSessionId: 'captain',
  createdAt: 1, taskSeq: 0, tasks: [], members: [],
}
const route = { provider: 'chosen', model: 'model' }
const FILTER = { allow: ['read', 'agent_teams_claim_task'], deny: ['agent_teams_create'] }

function tempWorkspace() {
  return mkdtempSync(join(tmpdir(), 'agent-teams-composition-'))
}

async function spawn(f, workspace) {
  const member = { id: '', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle' }
  await spawnMember(f.ctx, { provider: 'spawn', maxDepth: 0 }, f.bridge, route, captain, structuredClone(TEAM), member, STATE_DIR, new AbortController().signal, 'ready task', FILTER)
  assert.equal(member.toolFilter !== undefined, true, 'spawn must record the accepted filter')
  assert.deepEqual(member.toolFilter, FILTER)
  return { member, workspace }
}

test('preset-only host: persona and exact tool filter installed before the first request', async () => {
  const workspace = tempWorkspace()
  const f = fixture({ workspace })
  try {
    await spawn(f, workspace)
    assert.equal(f.seen.length, 1)
    f.ctx.dispose()
    assert.equal(f.seen[0].applied.disposed, 2)
  } finally { f.ctx.dispose(); rmSync(workspace, { recursive: true, force: true }) }
})

test('a failed tool restriction aborts the spawn instead of admitting an unisolated member', async () => {
  const workspace = tempWorkspace()
  const f = fixture({ workspace, rejectFilter: true })
  try {
    await assert.rejects(spawn(f, workspace), /restriction unavailable/)
    assert.equal(f.seen.length, 0)
  } finally { f.ctx.dispose(); rmSync(workspace, { recursive: true, force: true }) }
})

test('cold resume rebuilds the composition from durable team.json and installs it once', async () => {
  const workspace = tempWorkspace()
  const f = fixture({ workspace })
  try {
    const stateRoot = join(workspace, STATE_DIR)
    await createTeamDir(stateRoot, {
      ...structuredClone(TEAM),
      members: [{ id: 'child', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle', toolFilter: FILTER }],
    })
    const events = [{ type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'agent-teams:team:worker', agentProvider: 'chosen', agentModel: 'model' } }]
    const cold = f.makeChild({ cwd: workspace, parentSession: 'captain', events })
    f.ctx.emit('agent/created', { agent: cold, source: 'resume' })
    assert.match(cold.applied.persona, /You are worker, a member of the multi-agent team "Team"/)
    assert.match(cold.applied.persona, /plugin guidance/)
    assert.deepEqual(cold.applied.filter, FILTER)
    const length = events.length
    f.ctx.emit('agent/created', { agent: cold, source: 'resume' })
    assert.equal(events.length, length, 'cold resume must not append session events')
    f.ctx.dispose()
    assert.equal(cold.applied.disposed, 2)
  } finally { f.ctx.dispose(); rmSync(workspace, { recursive: true, force: true }) }
})

test('a member record without a filter or with a corrupted filter is refused, unrelated subagents untouched', async () => {
  const workspace = tempWorkspace()
  const f = fixture({ workspace })
  try {
    const stateRoot = join(workspace, STATE_DIR)
    const descriptor = (label) => ({
      cwd: workspace, parentSession: 'captain',
      events: [{ type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label, agentProvider: 'chosen', agentModel: 'model' } }],
    })
    await createTeamDir(stateRoot, {
      ...structuredClone(TEAM),
      members: [{ id: 'child', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle' }],
    })
    assert.throws(
      () => f.ctx.emit('agent/created', { agent: f.makeChild(descriptor('agent-teams:team:worker')), source: 'resume' }),
      /no durable composition snapshot/,
    )
    // A corrupted filter never reaches the composition rebuild: the durable
    // state boundary refuses the whole record first, so the member is not
    // resumed with an unrestricted tool set by either layer.
    await createTeamDir(stateRoot, {
      ...structuredClone(TEAM),
      members: [{ id: 'child', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle', toolFilter: { deny: ['ok'], allow: 'all' } }],
    })
    assert.throws(
      () => f.ctx.emit('agent/created', { agent: f.makeChild(descriptor('agent-teams:team:worker')), source: 'resume' }),
      /is not a valid member record/,
    )
    const unrelated = f.makeChild(descriptor('ordinary'))
    f.ctx.emit('agent/created', { agent: unrelated, source: 'startup' })
    assert.equal(unrelated.applied.persona, '')
    assert.equal(unrelated.applied.filter, undefined)
  } finally { f.ctx.dispose(); rmSync(workspace, { recursive: true, force: true }) }
})
