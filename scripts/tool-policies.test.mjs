import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUILTIN_DENY_TOOLS,
  dedupeToolNames,
  memberSpawnRelaxableDeny,
  normalizeToolPolicy,
  optionalToolPolicy,
  parseToolPolicies,
  requireToolPolicy,
  resolveMemberToolFilter,
} from '../lib/tool-policies.js'
import { memberToolFilter, startMemberWithLenientFilter } from '../lib/harness-compat.js'
import { CAPTAIN_TOOL_NAMES, MEMBER_TOOL_NAMES } from '../lib/tool-names.js'
import { createTeamDir, readTeam } from '../lib/state.js'

/**
 * Issue #59: reusable per-member tool policies. These are the pure resolver /
 * helper contracts; the real host path (child schema assembly, forced
 * invocation rejection, cold resume) is covered by the acceptance case under
 * `docs/issue-maintenance-2026-10-10/policies/REPORT.md`.
 */

test('policy resolution trims, de-duplicates, and keeps declaration order', () => {
  const policy = normalizeToolPolicy('researcher', {
    allow: [' read ', 'glob', 'read', '', 'grep'],
    deny: ['web_search', ' web_search '],
  })
  assert.deepEqual(policy.allow, ['read', 'glob', 'grep'])
  assert.deepEqual(policy.deny, ['web_search'])
  assert.deepEqual(dedupeToolNames(['a', ' a ', 'b', '']), ['a', 'b'])

  const filter = resolveMemberToolFilter(policy)
  assert.deepEqual(filter.allow, [...policy.allow, ...MEMBER_TOOL_NAMES])
  assert.ok(filter.deny.includes('web_search'))
})

test('an allow-list policy injects the four required coordination tools', () => {
  const filter = resolveMemberToolFilter({ allow: ['read'] })
  for (const name of MEMBER_TOOL_NAMES) {
    assert.ok(filter.allow?.includes(name), `${name} stays available through an allow list`)
    assert.ok(!filter.deny.includes(name), `${name} is never denied`)
  }
  assert.deepEqual(MEMBER_TOOL_NAMES, [
    'agent_teams_claim_task',
    'agent_teams_update_task',
    'agent_teams_send_message',
    'agent_teams_status',
  ])
})

test('captain-only tools cannot be reopened through an allow list', () => {
  const filter = resolveMemberToolFilter({ allow: ['read', ...CAPTAIN_TOOL_NAMES] })
  for (const name of CAPTAIN_TOOL_NAMES) {
    assert.ok(filter.deny.includes(name), `${name} stays denied`)
    assert.ok(!filter.allow?.includes(name), `${name} never enters the allow list`)
  }
  assert.deepEqual(filter.allow, ['read', ...MEMBER_TOOL_NAMES])
})

test('a deny-only policy unions the captain-only deny list', () => {
  const filter = resolveMemberToolFilter({ deny: ['write', 'bash'] })
  assert.equal(filter.allow, undefined)
  assert.deepEqual(filter.deny.slice(0, 2), ['write', 'bash'])
  for (const name of CAPTAIN_TOOL_NAMES) assert.ok(filter.deny.includes(name))
})

test('the legacy filter of a member without a policy is unchanged', () => {
  const hostNames = new Set(['subagent_fork', 'send_message', 'skill', ...CAPTAIN_TOOL_NAMES])
  assert.deepEqual(resolveMemberToolFilter(undefined, { maxDepth: 0 }), memberToolFilter(0, undefined))
  assert.deepEqual(
    memberToolFilter(0, undefined).deny,
    [...CAPTAIN_TOOL_NAMES, 'subagent', 'send_message'],
    'without a registry view the depth entries pass through verbatim',
  )
  assert.deepEqual(memberToolFilter(0, hostNames).deny, [...CAPTAIN_TOOL_NAMES, 'send_message'])
  assert.deepEqual(memberToolFilter(1, undefined).deny, [...CAPTAIN_TOOL_NAMES])
  assert.deepEqual(resolveMemberToolFilter({ allow: ['read'] }, { maxDepth: 0, knownTools: hostNames }).deny, memberToolFilter(0, hostNames).deny)
})

test('malformed policies fail before a member could ever be persisted', () => {
  assert.throws(() => normalizeToolPolicy('empty', {}), /must declare "allow" and\/or "deny"/u)
  assert.throws(() => normalizeToolPolicy('empty-allow', { allow: ['  '] }), /empty allow list/u)
  assert.throws(() => normalizeToolPolicy('empty-deny', { deny: [] }), /empty deny list/u)
  assert.throws(() => normalizeToolPolicy('no-coordination', { allow: ['read'], deny: ['agent_teams_status'] }), /required member coordination tool/u)
  assert.throws(() => parseToolPolicies({ ' ': { allow: ['read'] } }), /empty policy id/u)
  assert.throws(() => parseToolPolicies({ researcher: { allow: ['read'] }, ' researcher ': { allow: ['glob'] } }), /duplicate policy id/u)
})

test('an unknown policy id is rejected with the configured ids', () => {
  const policies = parseToolPolicies({ researcher: { allow: ['read'] }, implementer: { deny: ['web_search'] } })
  assert.deepEqual(Object.keys(policies), ['researcher', 'implementer'])
  assert.deepEqual(requireToolPolicy(policies, 'implementer'), { deny: ['web_search'] })
  assert.throws(() => requireToolPolicy(policies, 'typo'), /unknown tool policy "typo".*configured: implementer, researcher/u)
  assert.throws(() => requireToolPolicy({}, 'typo'), /no toolPolicies are configured/u)
})

test('the spawn retry relaxes only the built-in deny entries', async () => {
  const rejection = names => new Error(
    `tools.restrict() names unknown global tool${names.length > 1 ? 's' : ''} ${names.map(name => `"${name}"`).join(', ')}; known global tools: x`,
  )
  assert.deepEqual(BUILTIN_DENY_TOOLS, [...CAPTAIN_TOOL_NAMES, 'subagent', 'send_message'])

  // The #163/#164 recovery path stays: a host that renamed or dropped a
  // delegation tool still starts the member.
  const attempts = []
  const started = await startMemberWithLenientFilter(async filter => {
    attempts.push([...filter.deny])
    if (attempts.length === 1) throw rejection(['subagent', 'send_message'])
    return 'started'
  }, { deny: [...CAPTAIN_TOOL_NAMES, 'subagent', 'send_message'] })
  assert.equal(started, 'started')
  assert.equal(attempts.length, 2)
  assert.deepEqual(attempts[1], [...CAPTAIN_TOOL_NAMES])

  // A name an owner policy contributed is never dropped: the member must not
  // silently spawn under a different policy than the owner declared.
  await assert.rejects(
    startMemberWithLenientFilter(async () => { throw rejection(['web_search']) }, { deny: [...CAPTAIN_TOOL_NAMES, 'web_search'] }),
    /unknown global tool/u,
  )
  // Nothing is ever relaxed out of an allow list, so the required coordination
  // tools cannot disappear either.
  await assert.rejects(
    startMemberWithLenientFilter(async () => { throw rejection(['read']) }, { allow: ['read', ...MEMBER_TOOL_NAMES], deny: [...CAPTAIN_TOOL_NAMES] }),
    /unknown global tool/u,
  )
  await assert.rejects(
    startMemberWithLenientFilter(async () => { throw rejection(['agent_teams_status']) }, { allow: [...MEMBER_TOOL_NAMES], deny: [...CAPTAIN_TOOL_NAMES] }),
    /unknown global tool/u,
  )
  // An explicit empty relaxable set makes even the built-in entries strict.
  await assert.rejects(
    startMemberWithLenientFilter(async () => { throw rejection(['subagent']) }, { deny: [...CAPTAIN_TOOL_NAMES, 'subagent'] }, []),
    /unknown global tool/u,
  )
})

test('an owner-declared deny name is never relaxable, even when it overlaps a built-in', () => {
  // `send_message` and `subagent` are built-in depth entries; `agent_teams_*`
  // are built-in captain-only entries. A policy that names one of them must not
  // inherit the #163/#164 relaxation for that exact name.
  const policy = normalizeToolPolicy('strict-send', { deny: ['send_message', 'web_search'] })
  const relaxable = memberSpawnRelaxableDeny(policy)
  assert.ok(!relaxable.includes('send_message'), 'the owner-declared built-in name stays strict')
  assert.ok(relaxable.includes('subagent'), 'built-in names the owner did not declare stay relaxable')
  assert.ok(CAPTAIN_TOOL_NAMES.every(name => relaxable.includes(name)))
  assert.ok(!relaxable.includes('web_search'), 'owner-only names were never relaxable')

  const captainOverlap = memberSpawnRelaxableDeny(normalizeToolPolicy('strict-captain', { deny: ['agent_teams_create'] }))
  assert.ok(!captainOverlap.includes('agent_teams_create'), 'an owner-declared captain-only name stays strict too')

  // A member without a policy keeps the legacy built-in recovery path, and a
  // selected policy id this deployment no longer declares relaxes nothing.
  assert.deepEqual(memberSpawnRelaxableDeny(undefined), [...BUILTIN_DENY_TOOLS])
  assert.deepEqual(memberSpawnRelaxableDeny(undefined, true), [], 'a selected id with no configured policy relaxes nothing')

  const policies = parseToolPolicies({ 'strict-send': { deny: ['send_message'] } })
  assert.deepEqual(optionalToolPolicy(policies, 'strict-send'), { deny: ['send_message'] })
  assert.equal(optionalToolPolicy(policies, 'not-configured'), undefined)
  assert.equal(optionalToolPolicy(policies, 'toString'), undefined)
})

test('a relaxed spawn never drops an owner-declared overlap name', async () => {
  const rejection = names => new Error(
    `tools.restrict() names unknown global tool${names.length > 1 ? 's' : ''} ${names.map(name => `"${name}"`).join(', ')}; known global tools: x`,
  )
  const filter = resolveMemberToolFilter(normalizeToolPolicy('strict-send', { deny: ['send_message'] }), { maxDepth: 0 })
  // The host rejects only the owner-declared overlap name: the spawn must fail
  // instead of silently applying a filter the owner did not declare.
  await assert.rejects(
    startMemberWithLenientFilter(
      async () => { throw rejection(['send_message']) },
      filter,
      memberSpawnRelaxableDeny(normalizeToolPolicy('strict-send', { deny: ['send_message'] })),
    ),
    /unknown global tool/u,
  )
  // A rejection naming only an undeclared built-in entry is still recovered.
  const attempts = []
  const started = await startMemberWithLenientFilter(
    async current => {
      attempts.push([...current.deny])
      if (attempts.length === 1) throw rejection(['subagent'])
      return 'started'
    },
    filter,
    memberSpawnRelaxableDeny(normalizeToolPolicy('strict-send', { deny: ['send_message'] })),
  )
  assert.equal(started, 'started')
  assert.ok(!attempts[1].includes('subagent'))
  assert.ok(attempts[1].includes('send_message'), 'the owner-declared name is still denied on the retry')
})

test('policy ids are data, never prototype members', () => {
  const policies = parseToolPolicies(JSON.parse('{"__proto__": {"allow": ["read"]}, "constructor": {"deny": ["web_search"]}}'))
  assert.equal(Object.getPrototypeOf(policies), null)
  assert.deepEqual(Object.keys(policies).sort(), ['__proto__', 'constructor'])
  assert.deepEqual(requireToolPolicy(policies, '__proto__'), { allow: ['read'] })
  assert.deepEqual(requireToolPolicy(policies, 'constructor'), { deny: ['web_search'] })
  assert.throws(() => requireToolPolicy(policies, 'toString'), /unknown tool policy "toString"/u)
  assert.throws(() => requireToolPolicy(parseToolPolicies({}), 'constructor'), /no toolPolicies are configured/u)
  assert.throws(() => parseToolPolicies({ researcher: { allow: ['run_code'] } }), /reserved presentation transport/u)
})

test('durable member records reject wrong-typed tool policy fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-teams-policy-boundary-'))
  const write = async (member, id) => {
    await createTeamDir(root, {
      name: 'Policy Boundary Team',
      id,
      captainSessionId: 'captain',
      createdAt: Date.now(),
      members: [member],
      tasks: [],
      taskSeq: 0,
    })
    return join(root, id, 'team.json')
  }
  const base = { id: 'child', name: 'researcher', joinedAt: Date.now(), status: 'idle' }
  try {
    // Legacy records keep working: both fields absent.
    await write(base, 'legacy')
    assert.equal((await readTeam(root, 'legacy'))?.members[0]?.toolPolicy, undefined)

    // A well-formed policy snapshot round-trips.
    await write({ ...base, toolPolicy: 'researcher', toolFilter: { allow: ['read'], deny: [...CAPTAIN_TOOL_NAMES] } }, 'valid')
    assert.deepEqual((await readTeam(root, 'valid'))?.members[0]?.toolFilter, { allow: ['read'], deny: [...CAPTAIN_TOOL_NAMES] })

    const rejected = [
      ['blank-policy-id', { ...base, toolPolicy: '   ' }],
      ['numeric-policy-id', { ...base, toolPolicy: 7 }],
      ['filter-without-deny', { ...base, toolPolicy: 'p', toolFilter: { allow: ['read'] } }],
      ['string-deny', { ...base, toolPolicy: 'p', toolFilter: { deny: 'write' } }],
      ['empty-deny', { ...base, toolPolicy: 'p', toolFilter: { deny: [] } }],
      ['empty-allow', { ...base, toolPolicy: 'p', toolFilter: { allow: [], deny: [...CAPTAIN_TOOL_NAMES] } }],
      ['numeric-name', { ...base, toolPolicy: 'p', toolFilter: { deny: [7] } }],
      ['blank-name', { ...base, toolPolicy: 'p', toolFilter: { deny: ['  '] } }],
      ['string-filter', { ...base, toolPolicy: 'p', toolFilter: 'deny=write' }],
    ]
    for (const [id, member] of rejected) {
      await write(member, id)
      await assert.rejects(readTeam(root, id), /invalid AgentTeams state/u, `${id} must be rejected at the durable boundary`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('team.json round-trips the policy id and the resolved filter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-teams-policy-'))
  try {
    const filter = resolveMemberToolFilter({ allow: ['read', 'glob'] }, { maxDepth: 0 })
    await createTeamDir(root, {
      name: 'Policy Team',
      id: 'policy-team',
      captainSessionId: 'captain',
      createdAt: Date.now(),
      members: [{
        id: 'child',
        name: 'researcher',
        role: 'researcher',
        toolPolicy: 'researcher',
        toolFilter: filter,
        joinedAt: Date.now(),
        status: 'idle',
      }],
      tasks: [],
      taskSeq: 0,
    })
    const restored = await readTeam(root, 'policy-team')
    assert.deepEqual(restored?.members[0]?.toolPolicy, 'researcher')
    assert.deepEqual(restored?.members[0]?.toolFilter, filter)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
