#!/usr/bin/env node
/**
 * Repair one historical AgentTeams session generation for #160.
 *
 * The released v2→v3 migration edge audits every message source against a
 * closed list of released kinds, so a stored pre-v3 generation that contains
 * the plugin's own producer kind (`agent-teams-command`) is refused in full by
 * every later Harness (`SessionFormatUnsupportedMigrationError: cannot safely
 * transform unclassified message source`). No plugin can change that read path:
 * the published catalog is assembled from direct imports and runs before any
 * plugin mounts. This tool is the reviewable, non-destructive recovery path:
 *
 *  - read-only unless `--apply` is passed;
 *  - the stored source generation is never modified: it is copied to a backup
 *    beside it (exclusive create, so an existing backup is never overwritten)
 *    before anything is published, and its hash is compared before/after;
 *  - a generation the installed catalog already migrates is left untouched;
 *  - only source kinds outside the released vocabulary are normalized to the
 *    released plugin wrapper (`{ kind: 'plugin', plugin: 'dsh-agent-teams' }`,
 *    the shape the fixed plugin writes on those hosts). The released wrapper's
 *    audit admits exactly those two members, so extra historical source fields
 *    (goal, profile, ...) are *not* carried into the repaired generation: they
 *    are listed in the report and remain only in the untouched source
 *    generation and its byte-identical backup. Message content, ordering and
 *    every other row value are preserved;
 *  - the artifact is then migrated and validated by the *installed* Harness
 *    catalog, re-encoded as the current generation through the installed
 *    encoder, verified from its exact bytes, and published exclusively
 *    (temporary file + link, never replacing an existing generation).
 *
 * Usage:
 *   node scripts/legacy-session-source-repair.mjs --session-dir <dir> [--apply]
 *     [--kinds agent-teams-command]
 *
 * Exit codes: 0 success (dry runs report `"applied": false`), 1 refusal or
 * failure (nothing published).
 */
import { constants as fsConstants, copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

/**
 * Resolve one Harness package through the installed host cohort. The format
 * packages are transitive to the exact `@deepseek-ai/dsh-session` this checkout
 * pins, so they are resolved from that package's own dependency scope instead
 * of duplicating a private copy of the format contract.
 */
function harnessImport(name) {
  const require = createRequire(import.meta.url)
  const sessionDir = dirname(require.resolve('@deepseek-ai/dsh-session/package.json'))
  const nested = createRequire(join(sessionDir, 'package.json'))
  return import(pathToFileURL(nested.resolve(name)).href)
}

const DEFAULT_KINDS = ['agent-teams-command']
const BACKUP_SUFFIX = '.pre-160-repair.bak'

/** Lowercase hex SHA-256 of one file's exact bytes. */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function fail(message) {
  console.error(`legacy session source repair: ${message}`)
  process.exitCode = 1
  return undefined
}

function parseArguments(argv) {
  const options = { apply: false, kinds: DEFAULT_KINDS.slice(), sessionDir: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--apply') options.apply = true
    else if (flag === '--session-dir') options.sessionDir = argv[++index]
    else if (flag === '--kinds') options.kinds = String(argv[++index] ?? '').split(',').map(value => value.trim()).filter(Boolean)
    else return fail(`unknown argument ${flag}`)
  }
  if (options.sessionDir === undefined || options.sessionDir === '') return fail('--session-dir is required')
  if (options.kinds.length === 0) return fail('--kinds must name at least one source kind')
  return options
}

/** Stored generation files in one session directory, newest generation last. */
function storedGenerations(sessionDir) {
  if (!existsSync(sessionDir)) return []
  return readdirSync(sessionDir)
    .map(name => {
      const match = name.match(/^session\.v(\d+)\.jsonl(\.zstd)?$/)
      return match === null ? undefined : { name, version: Number(match[1]), zstd: match[2] === '.zstd' }
    })
    .filter(entry => entry !== undefined)
    .sort((left, right) => left.version - right.version)
}

/**
 * Measure one complete Zstandard frame starting at `start` (RFC 8878):
 * magic, frame header descriptor, optional window/dictionary/content-size
 * fields, the block chain, and the optional checksum. Node's zstd APIs decode
 * only the first frame of the store's concatenated container, and searching for
 * the magic bytes would split on compressed payload that happens to contain
 * them, so every frame is measured exactly.
 */
function zstdFrameLength(buffer, start) {
  // The magic is the byte sequence 28 B5 2F FD, i.e. 0xFD2FB528 little-endian.
  if (start + 5 > buffer.length || buffer.readUInt32LE(start) !== 0xfd2fb528) {
    throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${start}`)
  }
  const descriptor = buffer[start + 4]
  if (((descriptor >> 3) & 1) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${start}`)
  const contentSizeFlag = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const checksum = (descriptor >> 2) & 1
  const dictionarySize = [0, 1, 2, 4][descriptor & 3]
  let cursor = start + 5 + (singleSegment === 1 ? 0 : 1) + dictionarySize
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment === 1 ? 1 : 0) : [0, 2, 4, 8][contentSizeFlag]
  let contentSize
  if (contentSizeBytes === 1) contentSize = buffer.readUInt8(cursor)
  else if (contentSizeBytes === 2) contentSize = buffer.readUInt16LE(cursor) + 256
  else if (contentSizeBytes === 4) contentSize = buffer.readUInt32LE(cursor)
  else if (contentSizeBytes === 8) contentSize = Number(buffer.readBigUInt64LE(cursor))
  cursor += contentSizeBytes
  for (;;) {
    if (cursor + 3 > buffer.length) throw new Error(`corrupt Zstandard session log: truncated block header at byte ${cursor}`)
    const blockHeader = buffer.readUIntLE(cursor, 3)
    cursor += 3
    const last = blockHeader & 1
    const blockType = (blockHeader >> 1) & 3
    const blockSize = blockHeader >> 3
    if (blockType === 3) throw new Error(`corrupt Zstandard session log: reserved block type at byte ${cursor}`)
    // RFC 8878 §3.1.1.2.2/3: Block_Size counts the block's *content*; an RLE
    // block stores that content as a single repeated byte, so its payload is
    // one byte regardless of Block_Size.
    cursor += blockType === 1 ? 1 : blockSize
    if (last === 1) break
  }
  if (checksum === 1) cursor += 4
  if (cursor > buffer.length) throw new Error('corrupt Zstandard session log: truncated final frame')
  if (contentSize !== undefined && contentSize !== 0) {
    const decoded = zstdDecompressSync(buffer.subarray(start, cursor))
    if (decoded.byteLength !== contentSize) throw new Error('corrupt Zstandard session log: frame content size disagrees with its header')
  }
  return cursor - start
}

/**
 * Decode the store's concatenated-frame container: the first frame holds
 * exactly the header line, later frames hold event batches.
 */
export function decodeStoredFrames(buffer) {
  let offset = 0
  let text = ''
  while (offset < buffer.length) {
    const length = zstdFrameLength(buffer, offset)
    text += zstdDecompressSync(buffer.subarray(offset, offset + length)).toString('utf8')
    offset += length
  }
  return text
}

/** Physical log text: the first line is the header, the rest are event rows. */
function readPhysicalLog(path, zstd) {
  const raw = readFileSync(path)
  const text = zstd ? decodeStoredFrames(raw) : raw.toString('utf8')
  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return { bytes: raw, header: JSON.parse(lines[0]), rows: lines.slice(1).map(line => JSON.parse(line)) }
}

/** Normalize one out-of-vocabulary message source to the released plugin wrapper. */
function normalizeSources(value, kinds, counter, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => normalizeSources(item, kinds, counter, depth + 1))
  const record = { ...value }
  const source = record['source']
  if (source !== null && typeof source === 'object' && !Array.isArray(source)
    && typeof source['kind'] === 'string' && kinds.includes(source['kind'])) {
    // The released wrapper's source audit admits exactly {kind, plugin}, so any
    // extra historical metadata on this source cannot travel into the repaired
    // generation. It is reported instead, and stays readable in the untouched
    // source generation and its byte-identical backup.
    const dropped = Object.keys(source).filter(key => key !== 'kind' && key !== 'plugin')
    record['source'] = { kind: 'plugin', plugin: 'dsh-agent-teams' }
    counter.normalized += 1
    for (const key of dropped) counter.droppedFields.add(key)
  }
  for (const [key, item] of Object.entries(record)) {
    if (key === 'source') continue
    record[key] = normalizeSources(item, kinds, counter, depth + 1)
  }
  return record
}

/** Write the current-generation artifact with the store's checksummed frame container. */
function encodeFrames(headerLine, rowLines) {
  const frame = text => zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } })
  const frames = [frame(`${headerLine}\n`)]
  for (let index = 0; index < rowLines.length; index += 500) {
    frames.push(frame(`${rowLines.slice(index, index + 500).join('\n')}\n`))
  }
  return Buffer.concat(frames)
}

async function repair(options) {
  const sessionDir = resolve(options.sessionDir)
  const catalogModule = await harnessImport('@deepseek-ai/dsh-session-format-catalog')
  const catalog = catalogModule.sessionFormatCatalog
  const withChildren = catalogModule.createSessionFormatCatalogWithChildren([])

  const generations = storedGenerations(sessionDir)
  if (generations.length === 0) return fail(`no stored session generation under ${sessionDir}`)
  const source = generations[generations.length - 1]
  if (source.version >= catalog.currentVersion) {
    return fail(`stored generation v${source.version} is already current (v${catalog.currentVersion}); nothing to repair`)
  }
  const publishedName = `session.v${catalog.currentVersion}.jsonl${source.zstd ? '.zstd' : ''}`
  const publishedPath = join(sessionDir, publishedName)
  if (existsSync(publishedPath)) return fail(`${publishedName} already exists; refusing to overwrite it`)

  const { header, rows } = readPhysicalLog(join(sessionDir, source.name), source.zstd)

  // Only logs the installed catalog cannot migrate are touched. A generation
  // whose sources are already readable (v3 producer kinds included) is a no-op
  // so this tool never rewrites unrelated provenance.
  const readableAsIs = (() => {
    try {
      const restore = withChildren.createRestore(header, { recovery: 'strict', validation: 'current' })
      for (const row of rows) restore.decodeRow(row)
      restore.finish()
      return true
    } catch {
      return false
    }
  })()
  if (readableAsIs) {
    return {
      sessionDir,
      sourceGeneration: source.version,
      sourceFile: source.name,
      sourceBytes: readFileSync(join(sessionDir, source.name)).byteLength,
      targetGeneration: catalog.currentVersion,
      applied: false,
      skipped: 'already-readable',
    }
  }

  const counter = { normalized: 0, droppedFields: new Set() }
  const normalizedRows = rows.map(row => normalizeSources(row, options.kinds, counter))
  if (counter.normalized === 0) {
    return fail(`${source.name} is refused by the installed Harness but carries none of ${options.kinds.join(', ')}; nothing this tool may repair`)
  }

  // Migrate and validate with the installed catalog: the whole artifact must be
  // accepted before anything is published.
  let artifact
  try {
    const restore = withChildren.createRestore(header, { recovery: 'strict', validation: 'current' })
    for (const row of normalizedRows) restore.decodeRow(row)
    artifact = restore.finish()
  } catch (error) {
    return fail(`the installed Harness still refuses ${source.name} after source normalization: ${error?.constructor?.name}: ${error?.message}`)
  }

  const currentHeader = catalog.encodeCurrentHeader(artifact.header, artifact.inheritedEventCount)
  const currentRows = artifact.events.map(event => catalog.encodeCurrentEvent(event))
  const report = {
    sessionDir,
    sourceGeneration: source.version,
    sourceFile: source.name,
    sourceBytes: readFileSync(join(sessionDir, source.name)).byteLength,
    normalizedSources: counter.normalized,
    normalizedDroppedSourceFields: [...counter.droppedFields].sort(),
    events: artifact.events.length,
    targetGeneration: catalog.currentVersion,
    published: publishedName,
    applied: false,
  }
  if (!options.apply) return report

  const sourcePath = join(sessionDir, source.name)
  const sourceHashBefore = sha256(sourcePath)
  const backupPath = join(sessionDir, `${source.name}${BACKUP_SUFFIX}`)
  // Exclusive copy (`COPYFILE_EXCL`): an existing backup is never overwritten,
  // and a racing second run fails here instead of silently replacing it.
  try {
    copyFileSync(sourcePath, backupPath, fsConstants.COPYFILE_EXCL)
  } catch (error) {
    if (error?.code === 'EEXIST') return fail(`${backupPath} already exists; refusing to overwrite a backup`)
    throw error
  }
  report.backup = `${source.name}${BACKUP_SUFFIX}`

  const encoded = encodeFrames(JSON.stringify(currentHeader), currentRows.map(row => JSON.stringify(row)))
  // Read the exact bytes back before publishing: a repair that cannot be read
  // again must not replace a diagnosable state with an unreadable one.
  const verify = (() => {
    const text = decodeStoredFrames(encoded)
    const lines = text.split('\n').filter(line => line !== '')
    const restored = catalog.createRestore(JSON.parse(lines[0]), { recovery: 'strict', validation: 'current' })
    for (const line of lines.slice(1)) restored.decodeRow(JSON.parse(line))
    return restored.finish()
  })()
  if (verify.events.length !== artifact.events.length) {
    return fail(`re-encoded artifact lost events (${verify.events.length} of ${artifact.events.length}); nothing published`)
  }
  // Publish exclusively: the complete artifact is first written to a temporary
  // file in the same directory, verified there, and only then linked to its
  // final name — a half-written current generation can never be visible to the
  // host, and an existing one is never replaced.
  const temporaryPath = join(sessionDir, `${publishedName}.tmp-${process.pid}`)
  // Exclusive create: residue from a crashed run is never overwritten.
  try {
    writeFileSync(temporaryPath, encoded, { flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') return fail(`${temporaryPath} exists from an earlier interrupted run; remove it and retry`)
    throw error
  }
  try {
    linkSync(temporaryPath, publishedPath)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    if (error?.code === 'EEXIST') return fail(`${publishedName} appeared while repairing; refusing to overwrite it`)
    throw error
  }
  rmSync(temporaryPath, { force: true })
  report.applied = true
  report.publishedBytes = encoded.byteLength
  report.sourceUnchanged = sha256(sourcePath) === sourceHashBefore
  report.backupUnchanged = sha256(backupPath) === sourceHashBefore
  return report
}

// CLI body: skipped when this module is imported for its container decoder.
const invokedDirectly = process.argv[1] !== undefined
  && pathToFileURL(process.argv[1]).href === import.meta.url
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2))
  if (options !== undefined) {
    const report = await repair(options)
    if (report !== undefined) console.log(JSON.stringify(report, null, 2))
  }
}
