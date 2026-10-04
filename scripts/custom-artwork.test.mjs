/**
 * Artwork resolution checks: the packaged slugs, the vendor-namespace lookup
 * chain, and custom-directory resolution.
 *
 * Run after `tsc -p tsconfig.json`:
 *   node --test scripts/custom-artwork.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ARTWORK_ROLES,
  ARTWORK_VENDORS,
  PACKAGED_ARTWORK_SLUGS,
  artworkCandidates,
  artworkStems,
  findCustomArtwork,
  isAllowedArtwork,
} from '../lib/artwork-source.js'

const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

async function artDir() {
  const dir = await mkdtemp(join(tmpdir(), 'agent-teams-art-'))
  return { dir, done: () => rm(dir, { recursive: true, force: true }) }
}

test('every packaged slug stays servable exactly as shipped', () => {
  assert.equal(PACKAGED_ARTWORK_SLUGS.length, 15)
  for (const slug of PACKAGED_ARTWORK_SLUGS) {
    assert.deepEqual(artworkCandidates(slug), [slug], `${slug} must resolve to itself`)
    assert.ok(isAllowedArtwork(slug), `${slug} must stay allowed`)
  }
})

test('vendor namespaces cover the 9 vendors and 8 roles', () => {
  assert.equal(ARTWORK_VENDORS.length, 9)
  assert.equal(ARTWORK_ROLES.length, 8)
  assert.ok(ARTWORK_VENDORS.includes('deepseek'))
  assert.ok(ARTWORK_VENDORS.includes('hunyuan'))
  assert.ok(ARTWORK_ROLES.includes('operator'))
})

test('a brand request lists the svg, its png sibling, then the family default', () => {
  assert.deepEqual(artworkCandidates('brand-hunyuan.svg'), [
    'brand-hunyuan.svg',
    'brand-hunyuan.png',
    'brand.svg',
    'brand.png',
  ])
})

test('a brand request for an unknown vendor is refused', () => {
  assert.deepEqual(artworkCandidates('brand-nope.svg'), [])
})

test('a non-png member request stays refused even after the brand family', () => {
  assert.deepEqual(artworkCandidates('member-deepseek-qa-v2.svg'), [])
})

test('a vendor+role request degrades to role, then vendor', () => {
  assert.deepEqual(artworkCandidates('member-deepseek-qa-v2.png'), [
    'member-deepseek-qa-v2.png',
    'member-qa-v2.png',
    'member-deepseek-v2.png',
  ])
})

test('a -full request also lists its non-full sibling', () => {
  assert.deepEqual(artworkCandidates('member-deepseek-qa-full-v2.png'), [
    'member-deepseek-qa-full-v2.png',
    'member-deepseek-qa-v2.png',
    'member-qa-full-v2.png',
    'member-qa-v2.png',
    'member-deepseek-full-v2.png',
    'member-deepseek-v2.png',
  ])
})

test('the captain degrades per vendor, then to the packaged whale', () => {
  assert.deepEqual(artworkCandidates('team-lead-deepseek-v2.png'), [
    'team-lead-deepseek-v2.png',
    'team-lead-v2.png',
  ])
  assert.deepEqual(artworkCandidates('team-lead-v2.png'), ['team-lead-v2.png'])
})

test('foreign names never reach the filesystem', () => {
  for (const slug of [
    '../secret.png',
    '/etc/passwd',
    'nope.png',
    'team-lead-evil-v2.png',
    'action-nope-v2.png',
    'member-deepseek-qa-v2.svg',
  ]) {
    assert.equal(isAllowedArtwork(slug), false, `${slug} must be rejected`)
    assert.deepEqual(artworkCandidates(slug), [])
  }
})

test('an unknown vendor or role token degrades to what is known', () => {
  // A provider this fork does not know still gets the role artwork instead of
  // a broken image; unknown tokens never appear in a candidate name.
  assert.deepEqual(artworkCandidates('member-evil-qa-v2.png'), ['member-qa-v2.png'])
  assert.deepEqual(artworkCandidates('member-deepseek-evil-v2.png'), ['member-deepseek-v2.png'])
  assert.deepEqual(artworkCandidates('member-deepseek-qa-evil-v2.png'), [
    'member-deepseek-qa-v2.png',
    'member-qa-v2.png',
    'member-deepseek-v2.png',
  ])
})

test('stems probe the exact name before the -v2-less alias', () => {
  assert.deepEqual(artworkStems('member-qa-v2.png'), ['member-qa-v2', 'member-qa'])
  assert.deepEqual(artworkStems('member-deepseek-qa-v2.png'), ['member-deepseek-qa-v2', 'member-deepseek-qa'])
})

test('the exact vendor+role file wins and keeps its media type', async () => {
  const { dir, done } = await artDir()
  try {
    await writeFile(join(dir, 'member-deepseek-qa-v2.png'), PNG)
    await writeFile(join(dir, 'member-qa-v2.png'), Buffer.from('other'))
    const found = await findCustomArtwork(dir, 'member-deepseek-qa-v2.png')
    assert.equal(found?.path, join(dir, 'member-deepseek-qa-v2.png'))
    assert.equal(found?.contentType, 'image/png')
    assert.deepEqual(found?.data, PNG)
  } finally {
    await done()
  }
})

test('the -v2-less alias answers the same slug', async () => {
  const { dir, done } = await artDir()
  try {
    await writeFile(join(dir, 'team-lead-deepseek.png'), PNG)
    const found = await findCustomArtwork(dir, 'team-lead-deepseek-v2.png')
    assert.equal(found?.path, join(dir, 'team-lead-deepseek.png'))
  } finally {
    await done()
  }
})

test('other image formats resolve with their own media type', async () => {
  const { dir, done } = await artDir()
  try {
    await writeFile(join(dir, 'member-deepseek-engineer-v2.webp'), PNG)
    await writeFile(join(dir, 'member-deepseek-docs-v2.svg'), '<svg/>')
    assert.equal((await findCustomArtwork(dir, 'member-deepseek-engineer-v2.png'))?.contentType, 'image/webp')
    assert.equal((await findCustomArtwork(dir, 'member-deepseek-docs-v2.png'))?.contentType, 'image/svg+xml')
  } finally {
    await done()
  }
})

test('unknown slugs and missing directories fall back to packaged art', async () => {
  const { dir, done } = await artDir()
  try {
    assert.equal(await findCustomArtwork(dir, '../secret.png'), undefined)
    assert.equal(await findCustomArtwork(dir, 'member-deepseek-qa-v2.png'), undefined)
    assert.equal(await findCustomArtwork(join(dir, 'nope'), 'member-deepseek-qa-v2.png'), undefined)
  } finally {
    await done()
  }
})

test('a directory named like a slug is not served as artwork', async () => {
  const { dir, done } = await artDir()
  try {
    await mkdir(join(dir, 'member-deepseek-qa-v2.png'))
    assert.equal(await findCustomArtwork(dir, 'member-deepseek-qa-v2.png'), undefined)
  } finally {
    await done()
  }
})