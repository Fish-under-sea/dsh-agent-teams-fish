#!/usr/bin/env node
/**
 * Verify a packed plugin against an already built, exact Harness source checkout.
 * No package is published, no host manifest is changed, and no profile is reused.
 *
 * node scripts/harness-source-verify.mjs --host-dir /path/to/deepseek-harness
 *   --artifact /path/to/plugin.tgz --report-dir /tmp/new-report
 *   [--candidate-version 0.2.0] [--scenario lifecycle] [--prepare-only]
 *
 * Build the host with its own build:lib:host and build:lib:client scripts first.
 * Candidate versions exercise the host's real compatibility evaluator with an
 * explicit runtimeVersion; scenarios still execute the recorded source version.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRuntimeScenarios, runtimeScenarios } from './harness-runtime-scenarios.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginName = 'dsh-agent-teams-fish';
const isDsh = name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

/** Reject registry-runner arguments and ambiguous/missing source-runner inputs. */
export function parseSourceArguments(argv) {
    const allowed = new Set(['--host-dir', '--artifact', '--report-dir', '--candidate-version', '--scenario', '--prepare-only']);
    const flags = new Map();
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        if (!allowed.has(flag) || flags.has(flag)) throw Error('Unknown or duplicate source argument ' + flag);
        if (flag === '--prepare-only') flags.set(flag, true);
        else {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw Error('Missing value for ' + flag);
            flags.set(flag, value);
        }
    }
    for (const required of ['--host-dir', '--artifact', '--report-dir']) {
        if (!flags.has(required)) throw Error(required + ' required');
    }
    if (flags.has('--scenario') && !runtimeScenarios.includes(flags.get('--scenario'))) throw Error('Unknown scenario');
    return flags;
}

/** Limit source discovery to tracked package manifests in the host's package tiers. */
export function discoverWorkspacePackages(host, trackedFiles) {
    const packages = new Map();
    for (const path of trackedFiles) {
        if (!/^(?:vendor\/[^/]+|packages\/[^/]+\/[^/]+|apps\/[^/]+|native\/system(?:\/packages\/[^/]+)?)\/package\.json$/.test(path)) continue;
        const manifestPath = join(host, path), manifest = readJson(manifestPath);
        if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw Error('Invalid workspace manifest: ' + path);
        if (packages.has(manifest.name)) throw Error('Duplicate workspace package: ' + manifest.name);
        packages.set(manifest.name, { name: manifest.name, version: manifest.version, directory: realpathSync(dirname(manifestPath)), manifestPath, manifestSha256: sha256(manifestPath), manifest });
    }
    for (const required of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/cordis']) {
        if (!packages.has(required)) throw Error('Missing source workspace package: ' + required);
    }
    return packages;
}

/** Reject a candidate claim for any checkout other than the exact recorded source. */
export function selectSourceCandidate(policy, candidateVersion, sourceCommit, sourceClean) {
    const candidates = policy.sourceCandidates ?? [];
    const candidate = candidateVersion
        ? candidates.find(entry => entry.version === candidateVersion)
        : candidates.find(entry => entry.commit === sourceCommit);
    if (!candidate) throw Error('No matching sourceCandidates entry; specify a policy-pinned candidate version');
    if (!sourceClean) throw Error('Candidate verification requires a clean tracked source checkout');
    if (candidate.commit !== sourceCommit) throw Error('Source commit does not match the candidate policy: ' + candidate.commit);
    return candidate;
}

function resolveManifest(name, fromDirectory) {
    const require = createRequire(join(fromDirectory, 'package.json'));
    // Read the installed root manifest in Node's package search order. Export
    // maps can hide package.json or redirect it to a nameless dist manifest;
    // neither should change the identity of the installed dependency.
    for (const directory of require.resolve.paths(name) ?? []) {
        const candidate = join(directory, name, 'package.json');
        if (existsSync(candidate)) return realpathSync(candidate);
    }
    const error = Error('No installed package manifest for ' + name);
    error.code = 'MODULE_NOT_FOUND';
    throw error;
}

/** Inventory the resolved declared closure; reject registry DSH/vendor duplicates. */
export function inspectResolvedCohort(workspaces, roots) {
    const pending = [...roots], visited = new Set(), packages = [], edges = [];
    while (pending.length) {
        const directory = realpathSync(pending.shift());
        if (visited.has(directory)) continue;
        visited.add(directory);
        const manifestPath = join(directory, 'package.json'), manifest = readJson(manifestPath);
        if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw Error('Resolved package has no identity: ' + manifestPath);
        const workspace = workspaces.get(manifest.name);
        if (workspace && workspace.directory !== directory) throw Error(`Mixed source closure: ${manifest.name} resolved to ${directory}, expected ${workspace.directory}`);
        if (isDsh(manifest.name) && !workspace) throw Error('DSH package outside tracked source workspace: ' + manifest.name);
        packages.push({ name: manifest.name, version: manifest.version, directory, manifestSha256: sha256(manifestPath), workspace: Boolean(workspace) });
        const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies };
        for (const name of Object.keys(dependencies).sort()) {
            const optional = Object.hasOwn(manifest.optionalDependencies ?? {}, name) || manifest.peerDependenciesMeta?.[name]?.optional === true;
            let target;
            try { target = resolveManifest(name, directory); }
            catch (error) {
                if (optional && error.code === 'MODULE_NOT_FOUND') {
                    edges.push({ from: manifest.name, fromDirectory: directory, name, optional: true, missing: true });
                    continue;
                }
                throw Error(`Cannot resolve ${manifest.name} dependency ${name}: ${error.message}`, { cause: error });
            }
            const targetDirectory = realpathSync(dirname(target));
            edges.push({ from: manifest.name, fromDirectory: directory, name, optional, directory: targetDirectory });
            pending.push(targetDirectory);
        }
    }
    return { kind: 'resolved-declared-dependency-closure', count: packages.filter(pkg => isDsh(pkg.name)).length, packages, edges };
}

/** Call the unmodified host evaluator, with no version exemption. */
export function evaluateCandidateGate(evaluate, manifest, candidateVersion) {
    const issue = evaluate(manifest, {}, candidateVersion);
    return { kind: 'simulated-runtime-version-gate', runtimeVersion: candidateVersion, passed: issue === undefined, exemptions: {}, incompatible: issue ?? null, changesHostManifests: false, verifiesPublishedRelease: false };
}

function isolatedEnvironment(report, extra = {}) {
    return { PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', HOME: join(report, 'user-home'), TMPDIR: join(report, 'tmp'), npm_config_userconfig: '/dev/null', ...extra };
}

function commandRunner(report) {
    return async (argv, cwd, env, label, timeoutMs = 900000) => {
        const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '', timedOut = false;
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, timeoutMs);
        let exit;
        try { exit = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolveExit({ code, signal })); }); }
        finally { clearTimeout(timer); }
        writeFileSync(join(report, label + '.stdout.log'), stdout);
        writeFileSync(join(report, label + '.stderr.log'), stderr);
        return { ...exit, timedOut, stdout, stderr };
    };
}

/** Extract only npm package files/directories through the host's installed tar library. */
async function extractArtifact(host, artifact, destination) {
    const require = createRequire(join(host, 'package.json'));
    const tar = require('tar');
    await tar.x({ file: artifact, cwd: destination, strip: 1, strict: true, filter: (path, entry) => {
        if (!path.startsWith('package/') || path.split('/').includes('..') || path.includes('\\') || !['File', 'Directory'].includes(entry.type)) throw Error('Unsupported artifact entry: ' + path);
        return true;
    } });
}

/** Execute source validation, leaving reports and profiles available for inspection. */
export async function verifySource(argv) {
    const flags = parseSourceArguments(argv);
    const host = realpathSync(resolve(flags.get('--host-dir'))), artifact = realpathSync(resolve(flags.get('--artifact'))), report = resolve(flags.get('--report-dir'));
    if (existsSync(report) && readdirSync(report).length) throw Error('Report directory must be new or empty');
    const git = (...args) => execFileSync('git', ['-C', host, ...args], { encoding: 'utf8' }).trim();
    const sourceCommit = git('rev-parse', 'HEAD'), sourceStatus = git('status', '--porcelain', '--untracked-files=no');
    const policy = readJson(join(scriptDir, '../compatibility.json'));
    const candidate = selectSourceCandidate(policy, flags.get('--candidate-version'), sourceCommit, sourceStatus === '');
    const packages = discoverWorkspacePackages(host, git('ls-files').split('\n'));
    const cli = packages.get('@deepseek-ai/dsh'), boot = packages.get('@deepseek-ai/dsh-app-boot');
    for (const path of [join(cli.directory, 'lib/bin.js'), join(boot.directory, 'lib/index.js')]) {
        if (!existsSync(path)) throw Error('Build host and client libraries before verification; missing ' + path);
    }
    mkdirSync(report, { recursive: true });
    for (const name of ['user-home', 'tmp', 'runtime/node_modules']) mkdirSync(join(report, name), { recursive: true });
    const runtime = join(report, 'runtime'), modules = join(runtime, 'node_modules');
    for (const pkg of packages.values()) {
        const target = join(modules, pkg.name);
        mkdirSync(dirname(target), { recursive: true });
        symlinkSync(pkg.directory, target, 'dir');
    }
    const pluginDirectory = join(modules, pluginName);
    mkdirSync(pluginDirectory, { recursive: true });
    const artifactSha256 = sha256(artifact), retainedArtifact = join(report, 'artifact-' + artifactSha256 + '.tgz');
    copyFileSync(artifact, retainedArtifact);
    await extractArtifact(host, retainedArtifact, pluginDirectory);
    const plugin = readJson(join(pluginDirectory, 'package.json'));
    if (plugin.name !== pluginName) throw Error('Artifact package identity does not match AgentTeams');
    // Resolve external host identities from this prepared namespace, never from
    // the plugin checkout's development dependencies or another user profile.
    symlinkSync(modules, join(pluginDirectory, 'node_modules'), 'dir');
    const cohort = inspectResolvedCohort(packages, [cli.directory, pluginDirectory]);
    writeJson(join(report, 'cohort.json'), cohort);
    const { evaluatePluginCompatibility } = await import(pathToFileURL(join(boot.directory, 'lib/index.js')).href);
    const gate = evaluateCandidateGate(evaluatePluginCompatibility, plugin, candidate.version);
    writeJson(join(report, 'candidate-gate.json'), gate);
    const source = { kind: 'local-source-checkout', directory: host, repository: candidate.repository, commit: sourceCommit, trackedClean: sourceStatus === '', runtimeVersion: boot.version, cliManifestVersion: cli.version, buildMode: 'prebuilt-workspace', buildFreshness: 'caller-responsibility', cliSha256: sha256(join(cli.directory, 'lib/bin.js')), appBootSha256: sha256(join(boot.directory, 'lib/index.js')), lockSha256: sha256(join(host, 'pnpm-lock.yaml')) };
    const testFiles = Object.fromEntries(['harness-source-verify.mjs', 'harness-runtime-scenarios.mjs', ...readdirSync(join(scriptDir, 'fixtures')).filter(name => /^harness-runtime-.*\.mjs$/.test(name)).map(name => 'fixtures/' + name)].map(path => [path, sha256(join(scriptDir, path))]));
    const command = commandRunner(report), environment = extra => isolatedEnvironment(report, extra);
    const runs = flags.has('--prepare-only') || !gate.passed ? [] : await runRuntimeScenarios({ report, runtime, command, environment, selectedScenarios: flags.has('--scenario') ? [flags.get('--scenario')] : runtimeScenarios, linkWorkspacePackages: true });
    const result = { kind: 'source-candidate-verification', passed: gate.passed && (flags.has('--prepare-only') || runs.every(run => run.passed)), preparedOnly: flags.has('--prepare-only'), source, candidateGate: gate, artifactSha256, pluginVersion: plugin.version, testFiles, node: process.version, platform: process.platform, arch: process.arch, cohortCount: cohort.count, workspaceInventoryCount: packages.size, runs, unverified: ['published candidate-version artifact and dependency closure', 'npm/GitHub installation', 'real provider APIs and credentials', 'browser interaction', 'packaged Electron launch', 'other operating systems', 'native terminal execution', 'live user-data migration', 'prebuilt libraries reproducibly matching source checkout'] };
    writeJson(join(report, 'result.json'), result);
    console.log(JSON.stringify({ kind: result.kind, passed: result.passed, sourceCommit, sourceRuntimeVersion: source.runtimeVersion, candidateVersion: candidate.version, preparedOnly: result.preparedOnly, report, runs: runs.map(run => ({ scenario: run.scenario, passed: run.passed })) }, null, 2));
    return result.passed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = await verifySource(process.argv.slice(2)) ? 0 : 1; }
    catch (error) { console.error(error.stack ?? error); process.exitCode = 1; }
}
