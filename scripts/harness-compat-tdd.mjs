/** Native service dispatch plus targeted compatibility lifecycle regressions.
 * Real full-CLI/composition validation is recorded separately by the host lab.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import * as compat from '../lib/harness-compat.js'
import { guardSubagentDelivery, installContinuableMemberSetup, memberToolFilter, queueMemberPrompt, restrictableToolNames, sessionOwnEvents } from '../lib/harness-compat.js'
import { installMemberDelegationGuard, installMemberSelectionRuntime, resolveMemberLlmSelection, spawnMember } from '../lib/members.js'
import { createTeamDir, writeTeam } from '../lib/state.js'
import { CAPTAIN_TOOL_NAMES } from '../lib/tool-names.js'

const queueKey = Symbol.for('dsh.subagent.queuePrompt')
const deliverKey = Symbol.for('dsh.subagent.deliverPrompt')
const signal = new AbortController().signal
const source = { kind: 'agent-teams' }
const content = [{ type: 'text', text: 'next distinct turn' }]

function scope(extra = {}) {
  const listeners = new Map()
  const effects = []
  const ctx = {
    ...extra, listeners,
    logger: { warn() {} },
    on(name, fn) {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set)
      set.add(fn)
      return () => set.delete(fn)
    },
    effect(setup) { const dispose = setup(); effects.push(dispose); return dispose },
    emit(name, payload) { for (const fn of [...listeners.get(name) ?? []]) fn(payload) },
    dispose() { for (const dispose of effects.splice(0).reverse()) dispose() },
  }
  return ctx
}

function modernRuntime() {
  return { [deliverKey]() {}, sendMessage() {} }
}

function child({ workspace = process.cwd(), effort, inherited = false } = {}) {
  const descriptor = { type: 'subagent/descriptor', data: {
    version: 3, mode: 'continuable', provider: 'spawn', label: 'agent-teams:team:worker',
    agentProvider: 'primary', agentModel: 'model',
  } }
  const agent = {
    id: 'member-id', status: 'idle', whenIdle: async () => {},
    options: { provider: 'primary', model: 'model', reasoningEffort: effort },
    session: { header: { cwd: workspace, parentSession: 'captain' }, ownEvents: () => inherited ? [] : [descriptor] },
  }
  agent.ctx = scope() // Harness 0.1.5 no longer exposes Context.agent.
  return agent
}

async function selection(agent) {
  for (const assemble of agent.ctx.listeners.get('system-prompt/assemble') ?? []) {
    await assemble({}, {}, async () => ({ variables: {} }))
  }
  return requestSelection(agent)
}

async function requestSelection(agent) {
  let config = { provider: 'inherited', model: 'parent-model', reasoningEffort: 'low' }
  for (const request of agent.ctx.listeners.get('agent/request') ?? []) {
    const previous = config
    config = await request({ agent }, async () => previous)
  }
  return config
}

await test('native SubagentRuntime keeps its receiver through FIFO delivery and retirement guard', async t => {
  const host = new Context()
  const fiber = host.plugin(SubagentRuntime)
  t.after(() => fiber.dispose())
  await fiber.await()
  const runtime = host.subagents
  assert.ok(runtime)
  if (typeof runtime.registerContinuableSetup === 'function') {
    // The real implementation reads this.ctx and this.setupRegistry. Its
    // internal ctx.effect must belong to the caller plugin, not the service.
    let installed = 0
    let disposed = 0
    const caller = host.plugin({ inject: ['subagents'], apply(ctx) {
      installContinuableMemberSetup(ctx, () => { installed++; return () => { disposed++ } })
    } })
    t.after(() => caller.dispose())
    await caller.await()
    const firstChild = scope({ agent: { id: 'first' } })
    runtime.setupRegistry.apply(firstChild).commit()
    assert.deepEqual({ installed, disposed }, { installed: 1, disposed: 0 })
    await caller.dispose()
    assert.deepEqual({ installed, disposed }, { installed: 1, disposed: 1 })
    const laterChild = scope({ agent: { id: 'later' } })
    runtime.setupRegistry.apply(laterChild).commit()
    assert.equal(installed, 1)
    firstChild.dispose()
    laterChild.dispose()
    assert.equal(disposed, 1)
  }
  const accepted = []
  const manager = {
    async followup(parent, id, body, options) {
      assert.equal(this, manager)
      accepted.push({ path: 'followup', parent, id, body, source: options.source })
      return 'accepted'
    },
    async queuePrompt(parent, id, body, provenance) {
      assert.equal(this, manager)
      accepted.push({ path: 'queue', parent, id, body, source: provenance })
      return 'accepted'
    },
    async sendMessage(parent, id, body) {
      assert.equal(this, manager)
      accepted.push({ path: 'steer', parent, id, body })
      return 'steered'
    },
  }
  // Only the downstream continuation manager is replaced. The real Cordis
  // service method still executes this.requireContinuations(), unlike old fakes.
  runtime.continuations = manager
  const captain = { id: 'captain', session: { header: {} } }
  const ctx = scope({ subagents: runtime })
  const methodKey = typeof runtime.followup === 'function' ? 'followup' : typeof runtime[deliverKey] === 'function' ? deliverKey : queueKey
  const before = Object.getOwnPropertyDescriptor(runtime, methodKey)
  guardSubagentDelivery(ctx, async (_sender, id) => id === 'retired')
  assert.equal(await queueMemberPrompt(runtime, captain, 'active', content, signal), 'accepted')
  assert.deepEqual(accepted[0].source, source)
  assert.notEqual(accepted[0].path, 'steer')
  await assert.rejects(queueMemberPrompt(runtime, captain, 'retired', content, signal), { code: 'NOT_RESUMABLE' })
  if (typeof runtime.sendMessage === 'function') {
    await assert.rejects(runtime.sendMessage(captain, 'retired', content, { signal }), { code: 'NOT_RESUMABLE' })
    assert.equal(await runtime.sendMessage(captain, 'unrelated', content, { signal }), 'steered')
  }
  ctx.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(runtime, methodKey), before)
  assert.equal(await queueMemberPrompt(runtime, captain, 'retired', content, signal), 'accepted')
})

await test('modern queue and public messaging are both guarded, including nested HMR disposal', async () => {
  const calls = []
  const runtime = {
    [queueKey](...args) { assert.equal(this, runtime); calls.push(['queue', ...args]); return Promise.resolve('queued') },
    sendMessage(...args) { assert.equal(this, runtime); calls.push(['steer', ...args]); return Promise.resolve('steered') },
  }
  const captain = { id: 'captain' }
  const first = scope({ subagents: runtime })
  const second = scope({ subagents: runtime })
  guardSubagentDelivery(first, async (_sender, id) => id === 'retired-first')
  guardSubagentDelivery(second, async (_sender, id) => id === 'retired-second')
  await assert.rejects(queueMemberPrompt(runtime, captain, 'retired-first', content, signal), { code: 'NOT_RESUMABLE' })
  await assert.rejects(runtime.sendMessage(captain, 'retired-second', content, { signal }), { code: 'NOT_RESUMABLE' })
  first.dispose()
  assert.equal(await queueMemberPrompt(runtime, captain, 'retired-first', content, signal), 'queued')
  second.dispose()
  assert.equal(await queueMemberPrompt(runtime, captain, 'retired-second', content, signal), 'queued')
  assert.ok(calls.every(([path]) => path === 'queue'))
})

await test('unsupported queue-only or send-only contract fails explicitly', async () => {
  const runtime = { sendMessage() { assert.fail('must never substitute steer') } }
  assert.throws(() => installContinuableMemberSetup(scope({ subagents: runtime }), () => () => {}), /unsupported Harness/)
  assert.throws(() => guardSubagentDelivery(scope({ subagents: runtime }), async () => false), /unsupported Harness/)
  await assert.rejects(queueMemberPrompt(runtime, {}, 'child', content, signal), /missing host FIFO/)
  assert.throws(() => sessionOwnEvents({ header: {} }), /missing ownEvents/)
})

await test('legacy session history excludes its inherited prefix; modern uses ownEvents receiver', () => {
  const inherited = { type: 'subagent/descriptor', data: { label: 'foreign' } }
  const own = { type: 'subagent/descriptor', data: { label: 'member' } }
  assert.deepEqual(sessionOwnEvents({ header: { seedLength: 1 }, events: [inherited, own] }), [own])
  const session = { header: {}, ownEvents() { assert.equal(this, session); return [own] } }
  assert.deepEqual(sessionOwnEvents(session), [own])
})

await test('synchronous modern setup selects the first request, deduplicates events, and disposes for HMR', async () => {
  const ctx = scope({ subagents: modernRuntime() })
  const bridge = installMemberSelectionRuntime(ctx, '.agent-teams')
  const agent = child()
  await bridge.withPending('captain', 'agent-teams:team:worker', {
    provider: 'selected', model: 'selected-model', reasoningEffort: 'high',
  }, async () => {
    ctx.emit('agent/session-start', { agent, source: 'startup' })
    assert.equal(agent.ctx.listeners.get('agent/request').size, 1)
    ctx.emit('agent/session-start', { agent, source: 'compact' })
    assert.equal(agent.ctx.listeners.get('agent/request').size, 1)
    assert.deepEqual(await selection(agent), { provider: 'selected', model: 'selected-model', reasoningEffort: 'high' })
  })
  ctx.dispose()
  assert.equal(agent.ctx.listeners.get('agent/request').size, 0)
  assert.equal(agent.ctx.listeners.get('agent/error').size, 0)
  agent.ctx.dispose()
})

await test('child disposal releases lifecycle contributions and permits a same-id resumed Agent', async () => {
  const ctx = scope({ subagents: modernRuntime() })
  let setups = 0
  let disposals = 0
  installContinuableMemberSetup(ctx, () => { setups++; return () => { disposals++ } })
  const first = child()
  ctx.emit('agent/session-start', { agent: first })
  first.ctx.dispose()
  assert.equal(disposals, 1)
  const second = child()
  ctx.emit('agent/session-start', { agent: second, source: 'resume' })
  assert.equal(setups, 2)
  ctx.dispose()
  assert.equal(disposals, 2)
  second.ctx.dispose()
  assert.equal(disposals, 2)
})

await test('setup exception blocks request instead of being swallowed by session-start dispatch', async () => {
  const ctx = scope({ subagents: modernRuntime() })
  installContinuableMemberSetup(ctx, () => { throw new Error('damaged durable model route') })
  const agent = child()
  ctx.emit('agent/session-start', { agent })
  await assert.rejects(selection(agent), /member initialization failed.*damaged durable model route/)
  ctx.dispose()
  assert.equal(agent.ctx.listeners.get('agent/request').size, 0)
})

await test('a child inheriting another member descriptor does not acquire member selection or failure hooks', () => {
  const ctx = scope({ subagents: modernRuntime() })
  installMemberSelectionRuntime(ctx, '.agent-teams')
  const agent = child({ inherited: true })
  ctx.emit('agent/session-start', { agent })
  assert.equal(agent.ctx.listeners.size, 0)
  const foreign = child()
  foreign.session.ownEvents = () => [{ type: 'subagent/descriptor', data: {
    version: 3, mode: 'continuable', provider: 'spawn', label: 'external-research-worker',
    agentProvider: 'primary', agentModel: 'model',
  } }]
  ctx.emit('agent/session-start', { agent: foreign })
  assert.equal(foreign.ctx.listeners.size, 0)
  ctx.dispose()
})

for (const fallbackActive of [false, true]) {
  await test(`cold resume restores route and effort coherently (fallbackActive=${fallbackActive})`, async t => {
    const workspace = await mkdtemp(join(tmpdir(), 'agent-teams-compat-'))
    t.after(() => rm(workspace, { recursive: true, force: true }))
    await createTeamDir(join(workspace, '.agent-teams'), {
      id: 'team', name: 'Team', captainSessionId: 'captain', createdAt: 1, taskSeq: 0, tasks: [],
      members: [{ id: 'member-id', name: 'worker', status: 'idle', joinedAt: 1,
        provider: 'primary', model: 'model', reasoningEffort: 'high',
        fallback: { provider: 'backup', model: 'backup-model' }, fallbackActive,
        ...(fallbackActive ? { activeProvider: 'backup', activeModel: 'backup-model' } : {}),
      }],
    })
    const ctx = scope({ subagents: modernRuntime() })
    t.after(() => ctx.dispose())
    installMemberSelectionRuntime(ctx, '.agent-teams')
    const agent = child({ workspace })
    ctx.emit('agent/session-start', { agent, source: 'resume' })
    assert.deepEqual(await selection(agent), fallbackActive
      ? { provider: 'backup', model: 'backup-model' }
      : { provider: 'primary', model: 'model', reasoningEffort: 'high' })
    if (fallbackActive) {
      let delegated = 0
      const handler = [...agent.ctx.listeners.get('agent/request-error')][0]
      assert.equal(await handler({ agent, signal, failure: { code: 'AUTH' } }, async () => { delegated++ }), undefined)
      assert.equal(delegated, 1)
    } else {
      const handler = [...agent.ctx.listeners.get('agent/request-error')][0]
      assert.deepEqual(await handler({ agent, signal, failure: { code: 'AUTH' } }, async () => undefined), { kind: 'retry' })
      // Harness retries inside the SAME step, without assembling the prompt
      // again. The accepted fallback must replace the captured request route.
      assert.deepEqual(await requestSelection(agent), { provider: 'backup', model: 'backup-model' })
    }
  })
}

await test('spawn explicitly passes reasoning effort, preserving persona and tool filters', async () => {
  let received
  const ctx = { subagents: {
    getProvider: () => ({ prepareContinuable() {}, capabilities: { persona: true, toolFilter: true } }),
    startContinuable: async spec => { received = spec; return { childId: 'child' } },
  } }
  const captain = { id: 'captain' }
  const team = { id: 'team', name: 'Team', captainSessionId: captain.id, members: [], tasks: [], createdAt: 1, taskSeq: 0 }
  const member = { id: '', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle' }
  await spawnMember(ctx, { provider: 'spawn', maxDepth: 0 }, { withPending: (_p, _l, _s, run) => run() },
    { provider: 'chosen', model: 'model', reasoningEffort: 'high' }, captain, team, member, '.agent-teams', signal)
  assert.deepEqual(received.request.agentOptions, { provider: 'chosen', model: 'model', reasoningEffort: 'high' })
  assert.match(received.request.persona, /engineer/)
  assert.ok(received.request.toolFilter.deny.includes('agent_teams_create'))
  assert.ok(received.request.toolFilter.deny.includes('send_message'), 'default members have only one parent-report channel')
  assert.ok(received.request.toolFilter.deny.includes('subagent'))
  assert.equal(member.id, 'child')
})

await test('depth deny entries resolve against the host tool registry (#163, #164)', async () => {
  // Host compositions register the delegation tool under a configurable
  // name (dsh-tool-subagent `toolName`, default `subagent`; the dsh-base
  // web-style composition ships `subagent_fork`). tools.restrict() rejects
  // unknown names and aborts the whole spawn, so the deny list may only
  // forward names the running host actually registered.
  const hostNames = new Set(['subagent_fork', 'send_message', 'skill', 'todo_write', ...CAPTAIN_TOOL_NAMES])
  const modern = { ctx: { tools: { view: () => ({ restrictableNames: hostNames }) } } }

  const resolved = memberToolFilter(0, restrictableToolNames(modern))
  assert.ok(resolved.deny.includes('send_message'), 'parent-report channel stays denied')
  assert.ok(CAPTAIN_TOOL_NAMES.every(name => resolved.deny.includes(name)), 'captain tools stay denied')
  assert.ok(!resolved.deny.includes('subagent'), 'the renamed delegation tool is dropped instead of killing the spawn')

  assert.equal(restrictableToolNames({ ctx: {} }), undefined, 'hosts without a registry view keep the verbatim list')
  assert.deepEqual(
    memberToolFilter(0, restrictableToolNames({ ctx: {} })).deny,
    [...CAPTAIN_TOOL_NAMES, 'subagent', 'send_message'],
    'unknown host shape: entries pass through unchanged',
  )
  assert.equal(restrictableToolNames({ ctx: { tools: { view: () => { throw new Error('older host shape') } } } }), undefined)
  assert.deepEqual(memberToolFilter(1, undefined).deny, [...CAPTAIN_TOOL_NAMES], 'delegation-allowed members carry no depth entries')

  // End to end through spawnMember on a host whose registry lacks `subagent`.
  let received
  const ctx = { subagents: {
    getProvider: () => ({ prepareContinuable() {}, capabilities: { persona: true, toolFilter: true } }),
    startContinuable: async spec => { received = spec; return { childId: 'child' } },
  } }
  const captain = { id: 'captain', ctx: { tools: { view: () => ({ restrictableNames: hostNames }) } } }
  const team = { id: 'team', name: 'Team', captainSessionId: captain.id, members: [], tasks: [], createdAt: 1, taskSeq: 0 }
  const member = { id: '', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle' }
  await spawnMember(ctx, { provider: 'spawn', maxDepth: 0 }, { withPending: (_p, _l, _s, run) => run() },
    { provider: 'chosen', model: 'model', reasoningEffort: 'high' }, captain, team, member, '.agent-teams', signal)
  assert.ok(received.request.toolFilter.deny.includes('send_message'))
  assert.ok(!received.request.toolFilter.deny.includes('subagent'), 'spawn survives hosts that renamed the delegation tool')
  assert.equal(member.id, 'child')
})

await test('0.1.5 delivery queues team jobs and guards both host modes across HMR', async () => {
  const calls = []
  const runtime = {
    [deliverKey](...args) { assert.equal(this, runtime); calls.push(args); return Promise.resolve('accepted') },
    sendMessage(...args) { assert.equal(this, runtime); return Promise.resolve('steered') },
  }
  const original = Object.getOwnPropertyDescriptor(runtime, deliverKey)
  const captain = { id: 'captain' }
  const first = scope({ subagents: runtime }), second = scope({ subagents: runtime })
  guardSubagentDelivery(first, async (_sender, id) => id === 'retired-first')
  guardSubagentDelivery(second, async (_sender, id) => id === 'retired-second')
  assert.equal(await queueMemberPrompt(runtime, captain, 'active', content, signal), 'accepted')
  assert.deepEqual(calls[0], [captain, 'active', content, source, signal, 'queue'])
  for (const id of ['retired-first', 'retired-second']) {
    for (const mode of ['queue', 'steer']) {
      await assert.rejects(runtime[deliverKey](captain, id, content, source, signal, mode), { code: 'NOT_RESUMABLE' })
    }
    await assert.rejects(runtime.sendMessage(captain, id, content, { signal }), { code: 'NOT_RESUMABLE' })
  }
  first.dispose()
  assert.equal(await queueMemberPrompt(runtime, captain, 'retired-first', content, signal), 'accepted')
  await assert.rejects(queueMemberPrompt(runtime, captain, 'retired-second', content, signal), { code: 'NOT_RESUMABLE' })
  second.dispose()
  assert.equal(await runtime[deliverKey](captain, 'retired-second', content, source, signal, 'steer'), 'accepted')
  assert.equal(calls.at(-1).at(-1), 'steer')
  // The surviving wrapper of an already disposed parent becomes inert.
  const clean = scope({ subagents: runtime })
  guardSubagentDelivery(clean, async () => true)
  clean.dispose()
  assert.equal(await queueMemberPrompt(runtime, captain, 'active', content, signal), 'accepted')
  assert.equal(typeof original.value, 'function')
})

await test('serial agent/created installs before first request, skips old early notification and cleans up', async () => {
  const ctx = scope({ subagents: modernRuntime() })
  const agent = child()
  let installed = 0, disposed = 0
  installContinuableMemberSetup(ctx, () => { installed++; return () => { disposed++ } })
  ctx.emit('agent/created', { agent })
  assert.equal(installed, 0, 'legacy publication must wait for session-start')
  ctx.emit('agent/created', { agent, source: 'startup' })
  assert.equal(installed, 1)
  ctx.emit('agent/created', { agent, source: 'resume' })
  assert.equal(installed, 1, 'duplicate setup must not leak handlers')
  ctx.dispose()
  assert.equal(disposed, 1)
  agent.ctx.dispose()
  assert.equal(disposed, 1)
})

await test('serial initialization failure vetoes creation instead of admitting a default-model request', () => {
  const ctx = scope({ subagents: modernRuntime() })
  installContinuableMemberSetup(ctx, () => { throw new Error('damaged durable model route') })
  assert.throws(() => ctx.emit('agent/created', { agent: child(), source: 'resume' }), /damaged durable model route/)
  ctx.dispose()
})

await test('activation-only host starts a durable member without inventing legacy methods', async () => {
  let received
  const runtime = {
    getProvider: () => ({ prepareContinuable() {}, capabilities: { persona: true, toolFilter: true } }),
    async startActivation(spec) {
      assert.equal(this, runtime)
      received = spec
      assert.equal(spec.delivery, 'parent', 'durable children retain parent-owned lifecycle and persistence')
      return { childId: 'activation-child', messageId: 'accepted', result: Promise.resolve({}), dispose: async () => {} }
    },
  }
  const captain = { id: 'captain', session: { header: {}, ownEvents: () => [] } }
  const ctx = scope({ subagents: runtime })
  installMemberDelegationGuard(ctx, '.agent-teams', 0)
  const team = { id: 'team', name: 'Team', captainSessionId: captain.id, members: [], tasks: [], createdAt: 1, taskSeq: 0 }
  const member = { id: '', name: 'worker', role: 'engineer', joinedAt: 1, status: 'idle' }
  try {
    await spawnMember(ctx, { provider: 'spawn', maxDepth: 0 }, { withPending: (_p, _l, _s, run) => run() },
      { provider: 'chosen', model: 'model', reasoningEffort: 'high' }, captain, team, member, '.agent-teams', signal)
    assert.equal(member.id, 'activation-child')
    assert.equal(received.provider, 'spawn')
    assert.equal(received.signal, signal)
    assert.equal(received.request.parent, captain)
    assert.equal(received.label, 'agent-teams:team:worker')
    assert.deepEqual(received.request.agentOptions, { provider: 'chosen', model: 'model', reasoningEffort: 'high' })
    assert.match(received.request.persona, /engineer/)
    assert.ok(received.request.toolFilter.deny.includes('agent_teams_create'))
    assert.ok(received.request.toolFilter.deny.includes('send_message'))
    assert.equal(typeof runtime.start, 'undefined')
    assert.equal(typeof runtime.startContinuable, 'undefined')
  } finally { ctx.dispose() }
})

await test('activation creation guard rejects retired members and restores prototype methods after HMR', async () => {
  let calls = 0
  const prototype = { async startActivation(spec) { assert.equal(this, runtime); calls++; return spec } }
  const runtime = Object.create(prototype)
  const first = scope({ subagents: runtime })
  const second = scope({ subagents: runtime })
  const retired = child()
  const captain = { session: { header: {}, ownEvents: () => [] } }
  const before = Object.getOwnPropertyDescriptor(runtime, 'startActivation')
  installMemberDelegationGuard(first, '.agent-teams', 0)
  installMemberDelegationGuard(second, '.agent-teams', 0)
  try {
    await assert.rejects(runtime.startActivation({ request: { parent: retired } }), /no longer admitting delegated work/)
    assert.equal(calls, 0)
    first.dispose()
    await assert.rejects(runtime.startActivation({ request: { parent: retired } }), /no longer admitting delegated work/)
    await runtime.startActivation({ request: { parent: captain } })
    assert.equal(calls, 1)
  } finally { second.dispose(); first.dispose() }
  await runtime.startActivation({ request: { parent: retired } })
  assert.equal(calls, 2, 'disposed nested wrappers must become inert')
  const clean = scope({ subagents: runtime })
  const original = Object.getOwnPropertyDescriptor(runtime, 'startActivation')
  installMemberDelegationGuard(clean, '.agent-teams', 0)
  clean.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(runtime, 'startActivation'), original)
  assert.equal(before, undefined)
  assert.equal(typeof runtime.startContinuable, 'undefined')
})

await test('activation guard preserves member-relative delegation budget and halt admission', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'agent-teams-activation-'))
  t.after(() => rm(workspace, { recursive: true, force: true }))
  const team = {
    id: 'team', name: 'Team', captainSessionId: 'captain', createdAt: 1, taskSeq: 0, tasks: [],
    members: [{ id: 'member-id', name: 'worker', status: 'idle', joinedAt: 1 }],
  }
  const root = join(workspace, '.agent-teams')
  await createTeamDir(root, team)
  const worker = child({ workspace })
  let calls = 0
  const runtime = { async startActivation(spec) { calls++; return spec } }
  const ctx = scope({ subagents: runtime, agents: { get: id => id === worker.id ? worker : undefined } })
  installMemberDelegationGuard(ctx, '.agent-teams', 0)
  await assert.rejects(runtime.startActivation({ request: { parent: worker } }), /delegation limit \(0\)/)
  assert.equal(calls, 0)
  ctx.dispose()
  const allowed = scope({ subagents: runtime, agents: ctx.agents })
  installMemberDelegationGuard(allowed, '.agent-teams', 1)
  await runtime.startActivation({ request: { parent: worker } })
  const descendant = { session: { header: { parentSession: worker.id }, ownEvents: () => [] } }
  await assert.rejects(runtime.startActivation({ request: { parent: descendant } }), /delegation limit \(1\)/)
  await writeTeam(root, { ...team, halted: true })
  await assert.rejects(runtime.startActivation({ request: { parent: worker } }), /no longer admitting delegated work/)
  allowed.dispose()
  assert.equal(calls, 1)
})

await test('member drain selects the activation host API and preserves targeted failure', async () => {
  assert.equal(typeof compat.drainMemberChildren, 'function')
  const parent = { id: 'captain' }, ids = ['member', 'descendant']
  const failure = new Error('native drain failed')
  let calls = 0
  const runtime = {
    async drainChildren(actualParent, actualIds) {
      assert.equal(this, runtime)
      assert.equal(actualParent, parent)
      assert.equal(actualIds, ids)
      calls++
      throw failure
    },
    async drainContinuableChildren() { assert.fail('activation API must take precedence') },
  }
  await assert.rejects(() => compat.drainMemberChildren(runtime, parent, ids), error => error === failure)
  assert.equal(calls, 1)
})

await test('member drain falls back to the legacy host API with its native receiver', async () => {
  assert.equal(typeof compat.drainMemberChildren, 'function')
  const parent = { id: 'captain' }, ids = ['member']
  let calls = 0
  const runtime = { async drainContinuableChildren(actualParent, actualIds) {
    assert.equal(this, runtime)
    assert.equal(actualParent, parent)
    assert.equal(actualIds, ids)
    calls++
  } }
  await compat.drainMemberChildren(runtime, parent, ids)
  assert.equal(calls, 1)
})

await test('member drain rejects a missing contract instead of pretending teardown succeeded', async () => {
  assert.equal(typeof compat.drainMemberChildren, 'function')
  await assert.rejects(() => compat.drainMemberChildren({}, { id: 'captain' }, ['member']), /unsupported Harness subagent contract.*missing member drain API/)
})

function modelPolicyFixture(routes, projected = false) {
  let calls = 0
  const events = routes === undefined ? [] : [{ type: 'subagent/model-selection-policy', data: { allowedModels: routes } }]
  const captain = { options: { provider: 'primary', model: 'model' }, session: {
    requestHeader: () => undefined, ownEvents: () => projected ? [] : events,
  } }
  const ctx = { llm: { async resolveCallConfig(selection) { calls++; return selection } },
    get(name) { assert.equal(name, 'sessionProjections'); return this.sessionProjections },
    ...(projected ? { sessionProjections: { stateOf(session, key) {
      assert.equal(session, captain.session)
      assert.equal(key, 'subagentModelSelectionPolicy')
      return routes
    } } } : {}),
  }
  return { ctx, captain, calls: () => calls }
}

await test('member route rejects an explicit model outside the captured session policy before provider lookup', async () => {
  const fixture = modelPolicyFixture([{ provider: 'primary', model: 'model' }])
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, { provider: 'other', model: 'other-model' }), /not allowed for this Session/)
  assert.equal(fixture.calls(), 0)
})

await test('member route rejects inherited captain models outside the selected child routes', async () => {
  const fixture = modelPolicyFixture([{ provider: 'allowed', model: 'child-model' }])
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, {}), /not allowed for this Session/)
  assert.equal(fixture.calls(), 0)
})

await test('member route rejects a fallback outside the selected child routes', async () => {
  const fixture = modelPolicyFixture([{ provider: 'primary', model: 'model' }])
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, { fallback: { provider: 'other', model: 'other-model' } }), /not allowed for this Session/)
  assert.equal(fixture.calls(), 0)
})

await test('member route accepts an allowed model and allowed fallback', async () => {
  const fixture = modelPolicyFixture([{ provider: 'primary', model: 'model' }])
  const selected = await resolveMemberLlmSelection(fixture.ctx, fixture.captain, { fallback: { provider: 'primary', model: 'model' } })
  assert.equal(selected.provider, 'primary')
  assert.equal(selected.model, 'model')
  assert.equal(fixture.calls(), 1)
})

await test('member route respects the host projection including policy inherited from session history', async () => {
  const fixture = modelPolicyFixture([{ provider: 'allowed', model: 'child-model' }], true)
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, {}), /not allowed for this Session/)
  assert.equal(fixture.calls(), 0)
})

await test('member route fails closed on malformed captured policy', async () => {
  const fixture = modelPolicyFixture([{ provider: 'primary' }])
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, {}), /invalid.*model.*policy/)
  assert.equal(fixture.calls(), 0)
})

await test('member route still enforces its saved policy when the host projection is not registered', async () => {
  const fixture = modelPolicyFixture([{ provider: 'allowed', model: 'child-model' }])
  fixture.ctx.sessionProjections = { stateOf: () => undefined }
  await assert.rejects(resolveMemberLlmSelection(fixture.ctx, fixture.captain, {}), /not allowed for this Session/)
  assert.equal(fixture.calls(), 0)
})

await test('member route retains legacy inheritance when no session policy exists', async () => {
  const fixture = modelPolicyFixture(undefined)
  assert.deepEqual(await resolveMemberLlmSelection(fixture.ctx, fixture.captain, {}), { provider: 'primary', model: 'model' })
})

for (const withProjection of [false, true]) {
  await test(`member policy reads an optional service from a real Cordis plugin context (projection=${withProjection})`, async t => {
    const host = new Context()
    const fixture = modelPolicyFixture([{ provider: 'primary', model: 'model' }], withProjection)
    if (withProjection) host.provide('sessionProjections', fixture.ctx.sessionProjections)
    let pluginContext
    const fiber = host.plugin({ apply(ctx) { pluginContext = ctx } })
    t.after(() => fiber.dispose())
    await fiber.await()
    assert.ok(pluginContext)
    assert.doesNotThrow(() => compat.assertMemberModelSelection(pluginContext, fixture.captain, { provider: 'primary', model: 'model' }))
    assert.throws(() => compat.assertMemberModelSelection(pluginContext, fixture.captain, { provider: 'other', model: 'other' }), /not allowed for this Session/)
  })
}

await test('unsupported creation contract fails explicitly without mutating the runtime', async () => {
  const runtime = { getProvider: () => ({ prepareContinuable() {}, capabilities: { persona: true, toolFilter: true } }) }
  const ctx = scope({ subagents: runtime })
  assert.throws(() => installMemberDelegationGuard(ctx, '.agent-teams', 0), /unsupported Harness subagent contract/)
  assert.equal(typeof runtime.startContinuable, 'undefined')
})
