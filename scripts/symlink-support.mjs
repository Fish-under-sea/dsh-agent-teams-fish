/**
 * Runtime capability probe for symlink creation.
 *
 * Several regression tests build real symlinks on purpose (they assert the
 * walker refuses to follow a link out of the workspace, and that a doctor
 * binary is executed through its installed link). Creating a symlink is not
 * universally permitted:
 *
 *   - POSIX: always available to an ordinary user.
 *   - Windows: requires `SeCreateSymbolicLinkPrivilege`, which is granted by
 *     Developer Mode or by running elevated. Without it the call fails with
 *     `EPERM`, and that says nothing about the code under test.
 *
 * Probe the filesystem instead of branching on `process.platform`: a Windows
 * host with Developer Mode enabled keeps the full real coverage, and a POSIX
 * host never skips.
 *
 * Usage (node:test `skip` option):
 *   test('...', { skip: noSymlinkSupport }, () => { ... })
 *
 * `false` means "supported, do not skip"; a string is the skip reason.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const SYMLINK_UNSUPPORTED_REASON =
  'symlink creation is not permitted on this host (Windows requires Developer Mode or an elevated shell)'

/** `false` when symlinks work here, otherwise the reason to skip. */
export function symlinkSkipReason() {
  if (process.platform !== 'win32') return false
  const probe = mkdtempSync(join(tmpdir(), 'symlink-support-probe-'))
  try {
    writeFileSync(join(probe, 'target.txt'), 'probe\n')
    symlinkSync(join(probe, 'target.txt'), join(probe, 'link.txt'))
    return false
  } catch {
    return SYMLINK_UNSUPPORTED_REASON
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

/** The probe is idempotent, so evaluate it once per process. */
export const noSymlinkSupport = symlinkSkipReason()
