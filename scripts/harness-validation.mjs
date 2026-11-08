/** Shared execution plan and acceptance rules for real-host verification. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { policy, validatePolicy, validatePackageCompatibility } from './compatibility.mjs'

export const requiredRuntimeScenarios = [
  'lifecycle', 'lifecycle-cold-restore', 'fallback', 'fallback-cold-restore',
  'failure', 'captain-idle-wakeup', 'progressive-entry', 'web-approval',
  'protocol-compatibility', 'stability',
]

export function hostVerification(version, support = policy) {
  validatePolicy(support)
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(version)
      || version.trim() !== version) throw new Error('Verification requires an exact host version')
  const host = support.supportedHosts.find(host => host.version === version)
  // Unknown candidates are tested before being added to support. They receive
  // the full installation check, never the historical fixture-only exemption.
  return {
    platforms: host?.platforms ?? ['ubuntu-latest', 'windows-latest'],
    pluginManagerInstall: host?.legacyDirectInstallReason === undefined,
    ...(host?.legacyDirectInstallReason ? { legacyDirectInstallReason: host.legacyDirectInstallReason } : {}),
  }
}

export function runtimeTargets(support = policy) {
  return validatePolicy(support).flatMap(host => hostVerification(host, support).platforms.map(os => ({ host, os })))
}

export function validateRuntimeReport(report, target, expected, support = policy) {
  const { host, os } = target
  assert.ok(runtimeTargets(support).some(t => t.host === host && t.os === os), 'Report target is not in the verification plan')
  assert.equal(report.passed, true, `Host ${host} did not pass`)
  assert.equal(report.version, host)
  assert.equal(report.platform, os === 'windows-latest' ? 'win32' : 'linux')
  assert.equal(report.pluginVersion, expected.pluginVersion)
  assert.equal(report.artifactSha256, expected.artifactSha256)
  assert.ok(Array.isArray(report.runs) && report.runs.length > 0 && report.runs.every(run => run.passed === true), `Host ${host} lacks successful functional evidence`)
  const required = [...requiredRuntimeScenarios, ...(hostVerification(host, support).pluginManagerInstall ? ['plugin-manager-install'] : [])]
  for (const scenario of required) {
    assert.ok(report.runs.some(run => run.scenario === scenario && run.passed === true), `Host ${host} did not exercise ${scenario}`)
  }
}

export function validateRuntimeReports(directory, expected, support = policy) {
  const targets = runtimeTargets(support)
  for (const target of targets) {
    const report = JSON.parse(readFileSync(join(directory, `harness-${target.os}-${target.host}`, 'result.json'), 'utf8'))
    validateRuntimeReport(report, target, expected, support)
  }
  return targets.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const hosts = validatePackageCompatibility(pkg)
  if (process.argv.length === 3 && process.argv[2] === '--github-output') {
    console.log(`targets=${JSON.stringify(runtimeTargets())}`)
  } else if (process.argv.length === 6 && process.argv[2] === '--reports' && process.argv[4] === '--sha256') {
    const artifactSha256 = process.argv[5]
    assert.match(artifactSha256, /^[a-f0-9]{64}$/, 'Expected candidate SHA-256 is required')
    if (process.env.EXPECTED_HOSTS) assert.deepEqual(hosts, JSON.parse(process.env.EXPECTED_HOSTS))
    const count = validateRuntimeReports(process.argv[3], { pluginVersion: pkg.version, artifactSha256 })
    console.log(`Verified one package against ${count} host/platform targets: ${hosts.join(', ')}`)
  } else throw new Error('Usage: node scripts/harness-validation.mjs --github-output | --reports <directory> --sha256 <digest>')
}
