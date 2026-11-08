import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { linkDirectory } from './harness-runtime-scenarios.mjs';

test('fixture package links work without Windows symlink privileges and replace stale links', t => {
    const root = mkdtempSync(join(tmpdir(), 'runtime link test '));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const first = join(root, 'first'), second = join(root, 'second'), link = join(root, 'profile package');
    for (const target of [first, second]) {
        mkdirSync(target);
        writeFileSync(join(target, 'package.json'), JSON.stringify({ name: target }));
    }
    linkDirectory(first, link);
    assert.equal(readFileSync(join(link, 'package.json'), 'utf8'), readFileSync(join(first, 'package.json'), 'utf8'));
    rmSync(first, { recursive: true });
    linkDirectory(second, link);
    assert.equal(readFileSync(join(link, 'package.json'), 'utf8'), readFileSync(join(second, 'package.json'), 'utf8'));
});

test('fixture linking refuses to replace real files or directories', t => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-link-preserve-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'file'), directory = join(root, 'directory');
    writeFileSync(file, 'keep');
    mkdirSync(directory);
    for (const path of [file, directory]) assert.throws(() => linkDirectory(root, path), /non-link fixture path/);
    assert.equal(readFileSync(file, 'utf8'), 'keep');
});
