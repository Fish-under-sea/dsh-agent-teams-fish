/**
 * #160 regression for the reviewed legacy-session repair path.
 *
 * Builds a real pre-v3 session artifact with the published released-V2 encoder
 * in a temporary directory (never a user session store), proves the installed
 * catalog refuses it, then checks the repair tool: dry run publishes nothing,
 * `--apply` publishes one current-generation artifact while the source
 * generation keeps its exact bytes and a backup appears, the published
 * artifact reads back through the installed catalog, and a second run refuses
 * to overwrite anything.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { decodeStoredFrames } from './legacy-session-source-repair.mjs'
import test from 'node:test'

const script = fileURLToPath(new URL('./legacy-session-source-repair.mjs', import.meta.url))

/** Resolve one Harness format package through the installed host cohort. */
function harnessImport(name) {
  const require = createRequire(import.meta.url)
  const sessionDir = dirname(require.resolve('@deepseek-ai/dsh-session/package.json'))
  const nested = createRequire(join(sessionDir, 'package.json'))
  return import(pathToFileURL(nested.resolve(name)).href)
}

const { sessionFormatCatalog, createSessionFormatCatalogWithChildren } = await harnessImport('@deepseek-ai/dsh-session-format-catalog')
const { releasedV2SessionFormatCodec } = await harnessImport('@deepseek-ai/dsh-session-format-v1-to-v2')
const { releasedV3SessionFormatCodec } = await harnessImport('@deepseek-ai/dsh-session-format-v2-to-v3')

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const frame = text => zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } })

function writeLegacySession(dir, kind, extraSource = {}) {
  const header = releasedV2SessionFormatCodec.encodeHeader({ version: 2, id: 'session-160-repair', createdAt: 1, isSeeded: false, delegationDepth: 0 }, 0)
  const event = (type, seq, data, extra = {}) => ({ type, seq, time: 1 + seq, data, ...extra })
  const rows = [
    event('turn/start', 0, { turn: 1 }),
    event('step/start', 1, { turn: 1, step: 1 }),
    event('user/message', 2, { id: 'm1', role: 'user', content: [{ type: 'text', text: 'captain activation' }], source: { kind, ...extraSource } }, { surfaceOp: 'append' }),
    event('step/end', 3, { turn: 1, step: 1 }),
    event('turn/end', 4, { turn: 1, reason: { kind: 'completed' } }),
  ]
  const lines = [JSON.stringify(header), ...rows.map(row => JSON.stringify(releasedV2SessionFormatCodec.encodeEvent(row)))]
  const path = join(dir, 'session.v2.jsonl.zstd')
  writeFileSync(path, Buffer.concat([frame(`${lines[0]}\n`), frame(`${lines.slice(1).join('\n')}\n`)]))
  return path
}

function catalogRestore(dir, file) {
  const text = decodeStoredFrames(readFileSync(join(dir, file)))
  const lines = text.split('\n').filter(line => line !== '')
  const restore = createSessionFormatCatalogWithChildren([]).createRestore(JSON.parse(lines[0]), { recovery: 'strict', validation: 'current' })
  for (const line of lines.slice(1)) restore.decodeRow(JSON.parse(line))
  return restore.finish()
}

function run(args) {
  // stderr stays captured: the refusal paths are asserted, not printed.
  const output = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(output)
}

test('a pre-v3 generation with the historical producer kind is refused by the installed catalog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-teams-160-'))
  try {
    writeLegacySession(dir, 'agent-teams-command')
    assert.throws(
      () => catalogRestore(dir, 'session.v2.jsonl.zstd'),
      error => error.constructor.name === 'SessionFormatUnsupportedMigrationError'
        && error.message.includes('unclassified message source'),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the repair tool publishes a current generation without touching the source bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-teams-160-'))
  try {
    const source = writeLegacySession(dir, 'agent-teams-command', { goal: 'demo-goal', profile: 'demo-profile' })
    const before = sha256(source)

    const dry = run(['--session-dir', dir])
    assert.equal(dry.applied, false)
    assert.equal(dry.normalizedSources, 1)
    assert.deepEqual(dry.normalizedDroppedSourceFields, ['goal', 'profile'])
    assert.equal(dry.sourceGeneration, 2)
    assert.equal(dry.targetGeneration, sessionFormatCatalog.currentVersion)
    assert.deepEqual(readdirSync(dir).sort(), ['session.v2.jsonl.zstd'])

    const applied = run(['--session-dir', dir, '--apply'])
    assert.equal(applied.applied, true)
    assert.equal(applied.normalizedSources, 1)
    assert.equal(sha256(source), before, 'the source generation must keep its exact bytes')
    assert.equal(existsSync(join(dir, `${'session.v2.jsonl.zstd'}${'.pre-160-repair.bak'}`)), true)
    assert.equal(sha256(join(dir, `session.v2.jsonl.zstd.pre-160-repair.bak`)), before)

    const publishedHash = sha256(join(dir, applied.published))
    const restored = catalogRestore(dir, applied.published)
    assert.equal(restored.header.version, sessionFormatCatalog.currentVersion)
    // Migration may append its own shape markers; every source event survives.
    assert.ok(restored.events.length >= 5, `expected at least 5 migrated events, got ${restored.events.length}`)
    const message = restored.events.find(event => event.type === 'user/message')
    assert.equal(message.data.source.kind, 'plugin:dsh-agent-teams')
    assert.equal(message.data.source.plugin, undefined)
    assert.equal(message.data.source.goal, undefined, 'the released wrapper audit admits only kind and plugin')
    assert.deepEqual(message.data.content, [{ type: 'text', text: 'captain activation' }])
    // The dropped attribution is still readable in the untouched source.
    assert.match(decodeStoredFrames(readFileSync(source)), /"goal":"demo-goal"/)

    // A second apply must refuse and change nothing: source, backup and the
    // published generation keep their exact bytes.
    assert.throws(() => run(['--session-dir', dir, '--apply']), /Command failed/)
    assert.equal(sha256(source), before)
    assert.equal(sha256(join(dir, `session.v2.jsonl.zstd.pre-160-repair.bak`)), before)
    assert.equal(sha256(join(dir, applied.published)), publishedHash)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a readable pre-v3 generation with a released kind is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-teams-160-'))
  try {
    const source = writeLegacySession(dir, 'user')
    const before = sha256(source)
    const report = run(['--session-dir', dir, '--apply'])
    assert.equal(report.applied, false)
    assert.equal(report.skipped, 'already-readable')
    assert.deepEqual(readdirSync(dir).sort(), ['session.v2.jsonl.zstd'])
    assert.equal(sha256(source), before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a generation the installed catalog already migrates is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-teams-160-'))
  try {
    // A v3 generation carrying the plugin's producer kind is readable today:
    // the closed v2→v3 audit does not apply and v3→v4 keeps unknown kinds.
    const header = releasedV3SessionFormatCodec.encodeHeader({ version: 3, id: 'session-160-v3', createdAt: 1, isSeeded: false, delegationDepth: 0 }, 0)
    const rows = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
      { type: 'user/message', seq: 2, time: 3, data: { id: 'm1', role: 'user', content: [{ type: 'text', text: 'captain activation' }], source: { kind: 'agent-teams-command', goal: 'demo' } }, surfaceOp: 'append' },
      { type: 'step/end', seq: 3, time: 4, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 4, time: 5, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    const lines = [JSON.stringify(header), ...rows.map(row => JSON.stringify(releasedV3SessionFormatCodec.encodeEvent(row)))]
    writeFileSync(join(dir, 'session.v3.jsonl.zstd'), Buffer.concat([frame(`${lines[0]}\n`), frame(`${lines.slice(1).join('\n')}\n`)]))
    const before = sha256(join(dir, 'session.v3.jsonl.zstd'))
    const report = run(['--session-dir', dir, '--apply'])
    assert.equal(report.applied, false)
    assert.equal(report.skipped, 'already-readable')
    assert.deepEqual(readdirSync(dir).sort(), ['session.v3.jsonl.zstd'])
    assert.equal(sha256(join(dir, 'session.v3.jsonl.zstd')), before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an existing backup is never overwritten and blocks the repair', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-teams-160-'))
  try {
    const source = writeLegacySession(dir, 'agent-teams-command')
    const sourceHash = sha256(source)
    const staleBackup = join(dir, 'session.v2.jsonl.zstd.pre-160-repair.bak')
    writeFileSync(staleBackup, Buffer.from('stale backup bytes that must survive'))
    const staleHash = sha256(staleBackup)

    assert.throws(() => run(['--session-dir', dir, '--apply']), /Command failed/)
    assert.equal(sha256(source), sourceHash, 'the source generation must stay untouched')
    assert.equal(sha256(staleBackup), staleHash, 'the existing backup must not be replaced')
    assert.deepEqual(readdirSync(dir).sort(), ['session.v2.jsonl.zstd', 'session.v2.jsonl.zstd.pre-160-repair.bak'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the frame reader follows RFC 8878 block sizes, including RLE blocks', () => {
  // Valid RLE frame from RFC 8878 §3.1.1.2.3: Block_Size 5 stores one byte
  // repeated five times, so the payload is a single byte.
  const rle = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 5, (5 << 3) | 3, 0, 0, 0x61])
  assert.equal(zstdDecompressSync(rle).toString('utf8'), 'aaaaa')
  assert.equal(decodeStoredFrames(rle), 'aaaaa')

  const concatenated = Buffer.concat([frame('one\n'), rle, frame('three\n')])
  assert.equal(decodeStoredFrames(concatenated), 'one\naaaaathree\n')

  const truncated = Buffer.concat([frame('one\n'), rle.subarray(0, rle.length - 2)])
  assert.throws(() => decodeStoredFrames(truncated), /truncated final frame|truncated block/)
})
