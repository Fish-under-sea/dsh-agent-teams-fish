# @fish-under-sea/dsh-agent-teams-fish

**1.0.1 · Durable teams with Fish vendor artwork**

[简体中文](README.md)

## Installation and Compatibility

```sh
dsh plugin --profile <profile> add @fish-under-sea/dsh-agent-teams-fish@1.0.1
```

Also included in `@fish-under-sea/dsh-fish@1.0.1`; do not mount twice. Restart DSH after installation. Requires Node `^22.19.0 || >=24`. Recommended Host: `0.2.0-rc.2`; `0.2.1-rc.2` is preview-supported. [compatibility.json](compatibility.json) is the exact support authority; desktop and core versions are distinct.

## Features

- Plan and approve before execution: member orchestration, task DAGs, durable mailboxes and progress monitoring.
- Persistent members, failure handling, capability-based reassignment, stop/resume and Host-enforced route/model policies.
- Optional quality gates for requirements, implementation, verification, review, repair and integration, binding judgments to artifacts.
- Fish artwork: eighteen vendor identities, role and vendor portraits, custom artworkDir, brand marks and route-aware captain portraits. Missing art falls back vendor+role → vendor → role; not every vendor has every role.
- Preset-only Hosts receive member persona and tool restrictions inside the child context; missing or corrupt restrictions refuse dispatch.

## Migration and Configuration

The old unscoped npm name `dsh-agent-teams-fish` moves to this scope. Update direct dependencies, bundle names and profile override `name` values, keeping `id: agent-teams`; never load both sources. State defaults to workspace `.agent-teams`, memberProvider to `spawn`; artworkDir is machine-local. The rename does not change configuration fields or team data format.

Back up securely first. Members consume real model quota. Tool policies are deployment-owned and cannot be bypassed by renaming. The plugin does not auto-repair logs, delete historical events or replay interrupted work; diagnose old corruption separately.

## Development Checks

Run these commands manually as needed. GitHub verification is manual-only, never triggered by pushes, PRs or releases. Tag publishing uses committed build artifacts without the test matrix, and skips npm versions already published. The local `prepublishOnly` build/verification hook is removed; maintainers decide when to build and check. Runtime approvals and optional quality-task rules are unchanged.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm verify
```

The `dsh-agent-teams-doctor` command inspects manifests and dependency closure only; it does not prove runtime behavior or identify the current process. Real Host and UI acceptance are separate.

## Attribution and History

Based on [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) (original author Relakkes / 程序员阿江). MIT. Upstream READMEs, NOTICE and release history are preserved. 1.0.1 coordinates identity and version; it does not claim the latest upstream HEAD is merged.

- [1.0.1](release-notes/v1.0.1.md)
- [1.0.0](release-notes/v1.0.0.md)
- [Historical notes](https://github.com/Fish-under-sea/dsh-agent-teams-fish/tree/main/release-notes)
- [NOTICE](NOTICE.md)
