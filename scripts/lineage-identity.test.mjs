/**
 * Permanent identity-contract regression for #176.
 *
 * `teamLeadMatch` and `isTopLevelSession` are pure functions over plain values,
 * so these cases feed them ordinary objects — no mocked Context, Agents
 * registry, LLM or team state. They pin the *narrowing* direction that matters
 * for authorization: who may inherit lead identity, and what must never inherit
 * it. The real acceptance evidence for the fork flows is the recorded cold-fork
 * matrix on the exact host, not this file.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { isTopLevelSession, teamLeadMatch } from '../lib/lineage.js'

/** Plain team record as `findTeamByCaptain`/`findTeamByParticipant` see it. */
const team = members => ({ captainSessionId: 'session-captain', members })
const identity = (sessionId, ancestry, inheritsLead) => ({ sessionId, ancestry, inheritsLead })

const activeMembers = [
  { id: 'session-member', status: 'working' },
  { id: 'session-retired', status: 'removed' },
]

test('the recorded captain leads its own team', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-captain', [], true)), true)
  // An identity that claims no ancestry still matches by exact id.
  assert.equal(teamLeadMatch(team([]), identity('session-captain', [], false)), true)
})

test('a top-level fork descendant inherits lead identity, at any depth', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-fork', ['session-captain'], true)), true)
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-grandchild', ['session-fork', 'session-captain'], true)), true)
})

test('a member session never inherits lead identity from its captain parent', () => {
  // Member sessions are subagent children: leadIdentityOf reports inheritsLead false.
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-member', ['session-captain'], false)), false)
  // Defence in depth: even an identity that claims the fork capability is
  // rejected while its session id is a listed member row.
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-member', ['session-captain'], true)), false)
})

test('a retired member never regains lead identity, and neither does its fork', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-retired', ['session-captain'], true)), false)
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-fork-of-retired', ['session-retired', 'session-captain'], true)), false)
  // The same holds when the roster row carries no status at all.
  assert.equal(teamLeadMatch(team([{ id: 'session-retired' }]), identity('session-retired', ['session-captain'], true)), false)
})

test('a member fork never inherits lead identity through its member ancestor', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-fork-of-member', ['session-member', 'session-captain'], true)), false)
})

test('an unrelated lineage neither leads nor inherits', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-other', [], true)), false)
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-other', ['session-unrelated'], true)), false)
  // Ancestry that contains the captain id deeper than a member row stays refused.
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-other', ['session-retired', 'session-captain'], true)), false)
})

test('an identity that cannot inherit lead is never widened by ancestry', () => {
  assert.equal(teamLeadMatch(team(activeMembers), identity('session-fork', ['session-captain'], false)), false)
})

test('a team without roster rows keeps the exact-id contract', () => {
  assert.equal(teamLeadMatch(team(undefined), identity('session-captain', [], true)), true)
  assert.equal(teamLeadMatch(team(undefined), identity('session-fork', ['session-captain'], true)), true)
  assert.equal(teamLeadMatch(team(undefined), identity('session-other', [], true)), false)
})

test('only a top-level conversation may inherit lead identity', () => {
  assert.equal(isTopLevelSession({ header: {} }), true)
  assert.equal(isTopLevelSession({ header: { delegationDepth: 0 } }), true)
  assert.equal(isTopLevelSession({ header: { origin: 'subagent' } }), false)
  assert.equal(isTopLevelSession({ header: { delegationDepth: 1 } }), false)
  assert.equal(isTopLevelSession({ header: { origin: 'subagent', delegationDepth: 0 } }), false)
})
