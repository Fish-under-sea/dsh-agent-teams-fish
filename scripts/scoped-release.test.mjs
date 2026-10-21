import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(text('package.json'))

test('1.0.1 release uses the Fish scope throughout the install contract', () => {
  assert.equal(pkg.name, '@fish-under-sea/dsh-agent-teams-fish')
  assert.equal(pkg.version, '1.0.1')
  assert.ok(text('cordis.patch.yml').includes("name: '@fish-under-sea/dsh-agent-teams-fish'"))
  assert.ok(text('scripts/doctor.mjs').includes("locatePackage('@fish-under-sea/dsh-agent-teams-fish'"))
})

test('both public READMEs document the scoped 1.0.1 install', () => {
  for (const file of ['README.md', 'README.en.md']) {
    assert.ok(text(file).includes('@fish-under-sea/dsh-agent-teams-fish@1.0.1'), file)
  }
})

test('runtime verification and benchmarks resolve the scoped installation path', () => {
  for (const file of ['scripts/harness-runtime-verify.mjs', 'scripts/harness-runtime-scenarios.mjs', 'scripts/harness-model-benchmark.mjs']) {
    assert.ok(!text(file).includes('node_modules/dsh-agent-teams-fish'), file)
    assert.ok(text(file).includes('node_modules/@fish-under-sea/dsh-agent-teams-fish'), file)
  }
})

test('publish workflow checks the current package identity before publishing', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.ok(workflow.includes('PACKAGE_NAME: ${{ steps.version.outputs.package_name }}'))
  assert.ok(workflow.includes('npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}"'))
  assert.ok(workflow.includes('npm view "${PACKAGE_NAME}" dist-tags.latest'))
})

test('verification is manual-only and tag publishing has no verification dependency', () => {
  const verify = text('.github/workflows/verify.yml')
  assert.ok(verify.includes('workflow_dispatch:'))
  for (const trigger of ['pull_request:', 'branches: [main]', 'workflow_call:']) assert.ok(!verify.includes(trigger), trigger)
  const publish = text('.github/workflows/publish.yml')
  assert.ok(!publish.includes('uses: ./.github/workflows/verify.yml'))
  assert.ok(!publish.includes('needs: verify'))
  assert.ok(!publish.includes('scripts/release-metadata.mjs'))
  assert.equal(JSON.parse(text('package.json')).scripts.prepublishOnly, undefined)
})
