// Issue #189 regression: member route composition.
//
// These are pure-function assertions over `composeMemberRoute`, the single
// place where the request/config/captain precedence is decided. They are
// deliberately NOT the acceptance evidence for #189 — the real Loader +
// DeepSeek Flash acceptance lives in the group's real-host run. This file only
// pins the composition policy that a previous attempt got wrong.
//
// Guarded cases:
//   - a "/" inside a model id is part of that id and is never a separator
//   - an explicitly requested model keeps the caller's provider (no silent
//     owner discovery), while a model-only *configuration* default may be
//     resolved by catalog
//   - a named provider is never derived, so it can never be re-pointed
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeMemberRoute } from '../lib/members.js'

const captain = { provider: 'aihub', model: 'gpt-5.6-sol' }

test('a slash inside a model id is preserved verbatim', () => {
  const composed = composeMemberRoute(
    { provider: 'openrouter', model: 'google/gemini-x' },
    captain,
  )
  assert.deepEqual(composed, {
    provider: { value: 'openrouter', source: 'request' },
    model: { value: 'google/gemini-x', source: 'request' },
    derivedProvider: false,
  })
})

test('an explicitly requested model is never re-routed by owner discovery', () => {
  const composed = composeMemberRoute({ model: 'deepseek-v4.1-flash' }, captain)
  assert.deepEqual(composed, {
    provider: { value: 'aihub', source: 'captain' },
    model: { value: 'deepseek-v4.1-flash', source: 'request' },
    derivedProvider: false,
  })
})

test('a model-only configuration default is the only derived-provider shape', () => {
  const composed = composeMemberRoute({ defaultModel: 'deepseek-v4.1-flash' }, captain)
  assert.deepEqual(composed, {
    provider: { value: 'aihub', source: 'captain' },
    model: { value: 'deepseek-v4.1-flash', source: 'config' },
    derivedProvider: true,
  })
})

test('a configured provider is authoritative and never derived', () => {
  const composed = composeMemberRoute(
    { defaultModel: 'deepseek-v4.1-flash', defaultProvider: 'ollama-cloud' },
    captain,
  )
  assert.deepEqual(composed, {
    provider: { value: 'ollama-cloud', source: 'config' },
    model: { value: 'deepseek-v4.1-flash', source: 'config' },
    derivedProvider: false,
  })
})

test('an explicit request pair wins over the configuration default', () => {
  const composed = composeMemberRoute(
    { provider: 'openrouter', model: 'google/gemini-x', defaultModel: 'deepseek-v4.1-flash', defaultProvider: 'ollama-cloud' },
    captain,
  )
  assert.deepEqual(composed, {
    provider: { value: 'openrouter', source: 'request' },
    model: { value: 'google/gemini-x', source: 'request' },
    derivedProvider: false,
  })
})

test('a request model wins over the configuration default but keeps the captain provider', () => {
  const composed = composeMemberRoute({ model: 'gpt-5.6-sol', defaultModel: 'deepseek-v4.1-flash' }, captain)
  assert.deepEqual(composed, {
    provider: { value: 'aihub', source: 'captain' },
    model: { value: 'gpt-5.6-sol', source: 'request' },
    derivedProvider: false,
  })
})

test('pure captain inheritance stays the captain route', () => {
  const composed = composeMemberRoute({}, captain)
  assert.deepEqual(composed, {
    provider: { value: 'aihub', source: 'captain' },
    model: { value: 'gpt-5.6-sol', source: 'captain' },
    derivedProvider: false,
  })
})

test('a provider without a model cannot be composed', () => {
  assert.equal(composeMemberRoute({ provider: 'openrouter' }, captain), undefined)
})

test('blank configured values are rejected instead of silently ignored', () => {
  assert.equal(composeMemberRoute({ defaultProvider: '   ' }, captain), undefined)
  assert.equal(composeMemberRoute({ defaultModel: '' }, captain), undefined)
})
