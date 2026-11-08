import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { policy } from './compatibility.mjs'
import { hostVerification, runtimeTargets, requiredRuntimeScenarios, validateRuntimeReport, validateRuntimeReports } from './harness-validation.mjs'
import { runPluginInstallation } from './harness-runtime-scenarios.mjs'

const futureVersion = '0.2.1-rc.999' // Fictional regression input, never a support claim.
const future = { ...policy, supportedHosts: [...policy.supportedHosts, { version: futureVersion, track: 'preview' }] }
const expected = { pluginVersion: '0.1.26', artifactSha256: 'a'.repeat(64) }
function reportFor(target, install = true) {
  return { passed: true, version: target.host, platform: target.os === 'windows-latest' ? 'win32' : 'linux', ...expected,
    runs: [...requiredRuntimeScenarios, ...(install ? ['plugin-manager-install'] : [])].map(scenario => ({ scenario, passed: true })) }
}

test('future targets automatically receive both platforms and a required install probe', () => {
  assert.deepEqual(runtimeTargets(future).filter(t => t.host === futureVersion), [
    { host: futureVersion, os: 'ubuntu-latest' }, { host: futureVersion, os: 'windows-latest' },
  ])
  assert.equal(hostVerification(futureVersion).pluginManagerInstall, true, 'Unlisted prequalification candidates must also exercise installation')
  for (const target of runtimeTargets(future).filter(t => t.host === futureVersion)) {
    assert.throws(() => validateRuntimeReport(reportFor(target, false), target, expected, future), /plugin-manager-install/)
    assert.doesNotThrow(() => validateRuntimeReport(reportFor(target), target, expected, future))
  }
})

test('historical coverage remains explicit without exempting adjacent or unknown versions', () => {
  for (const host of ['0.2.1-rc.2', '0.2.1-rc.3']) {
    for (const os of ['ubuntu-latest', 'windows-latest']) assert.ok(runtimeTargets().some(target => target.host === host && target.os === os))
  }
  const legacy = { host: '0.2.1-rc.1', os: 'ubuntu-latest' }
  assert.ok(hostVerification(legacy.host).legacyDirectInstallReason)
  assert.doesNotThrow(() => validateRuntimeReport(reportFor(legacy, false), legacy, expected))
  for (const host of ['0.2.1-rc.2', '0.2.1-rc.3', futureVersion, '0.3.0']) assert.equal(hostVerification(host).pluginManagerInstall, true)
  for (const version of ['latest', '*', futureVersion + '\n']) assert.throws(() => hostVerification(version), /exact host/)
  for (const properties of [{ platforms: [] }, { platforms: ['windows-latest'] }, { platforms: ['ubuntu-latest', 'macos-latest'] }, { legacyDirectInstallReason: '' }]) {
    const invalid = { ...policy, supportedHosts: policy.supportedHosts.map((host, i) => i ? host : { ...host, ...properties }) }
    assert.throws(() => runtimeTargets(invalid))
  }
})

test('missing scenarios, failed runs, wrong platform or a different candidate cannot pass', () => {
  const target = { host: futureVersion, os: 'windows-latest' }
  const valid = reportFor(target)
  for (const scenario of [...requiredRuntimeScenarios, 'plugin-manager-install']) {
    assert.throws(() => validateRuntimeReport({ ...valid, runs: valid.runs.filter(run => run.scenario !== scenario) }, target, expected, future), new RegExp(scenario))
  }
  for (const change of [{ passed: false }, { version: '0.2.1-rc.3' }, { platform: 'linux' }, { pluginVersion: 'old' }, { artifactSha256: 'b'.repeat(64) }, { runs: [...valid.runs, { scenario: 'extra', passed: false }] }]) {
    assert.throws(() => validateRuntimeReport({ ...valid, ...change }, target, expected, future))
  }
})

test('collection consumes the same platform plan and refuses missing Windows evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'harness-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const target of runtimeTargets(future)) {
    const directory = join(root, `harness-${target.os}-${target.host}`)
    mkdirSync(directory)
    writeFileSync(join(directory, 'result.json'), JSON.stringify(reportFor(target)))
  }
  assert.equal(validateRuntimeReports(root, expected, future), runtimeTargets(future).length)
  rmSync(join(root, `harness-windows-latest-${futureVersion}`, 'result.json'))
  assert.throws(() => validateRuntimeReports(root, expected, future), /ENOENT/)
})

test('real installation entry is invoked for an unknown candidate and preserves its failures', async t => {
  const report = mkdtempSync(join(tmpdir(), 'harness-install-'))
  t.after(() => rmSync(report, { recursive: true, force: true }))
  let calls = 0
  let exit = 0
  let installedVersion = expected.pluginVersion
  let timedOut = false
  const options = { version: futureVersion, pluginVersion: expected.pluginVersion, artifact: join(report, 'candidate.tgz'), runtime: join(report, 'runtime'), report, environment: extra => extra,
    async command(argv, cwd, env, label) {
      calls++
      assert.equal(label, 'plugin-manager-install')
      assert.deepEqual(argv.slice(2), ['plugin', '--profile', 'web', 'add', '--save-exact', options.artifact])
      const installed = join(env.DSH_HOME, 'profiles/web/node_modules/@nanmicoder/dsh-agent-teams')
      mkdirSync(installed, { recursive: true })
      writeFileSync(join(installed, 'package.json'), JSON.stringify({ version: installedVersion }))
      return { code: exit, timedOut }
    } }
  assert.equal((await runPluginInstallation(options))[0].passed, true)
  exit = 1
  assert.equal((await runPluginInstallation(options))[0].passed, false, 'A leftover package must not hide CLI rejection')
  exit = 0; installedVersion = '0.1.15'
  assert.equal((await runPluginInstallation(options))[0].passed, false)
  installedVersion = expected.pluginVersion; timedOut = true
  assert.equal((await runPluginInstallation(options))[0].passed, false)
  assert.equal(calls, 4)
  assert.deepEqual(await runPluginInstallation({ ...options, version: '0.2.1-rc.1' }), [])
  assert.equal(calls, 4, 'Historical limitation must not silently change coverage')
})
