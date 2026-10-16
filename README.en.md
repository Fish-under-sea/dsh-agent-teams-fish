<div align="center">

# dsh-agent-teams-fish

**A companion fork of the AgentTeams plugin — team avatars that follow the model vendor**

[![npm](https://img.shields.io/npm/v/dsh-agent-teams-fish?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-agent-teams-fish)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?style=flat-square)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-4b6ef6?style=flat-square)
![plugin](https://img.shields.io/badge/plugin-client%20%2B%20host-6b7280?style=flat-square)

[简体中文](README.md) · **English**

</div>

---

> **🆕 [0.7.1](release-notes/v0.7.1.md) (2026-10-16)**: **fixes "a blank optional field blocks team creation"** — a blank `tool_policy` / `provider` / `model` / `reasoning_effort` / `role` inside an inline plan no longer raises `must not be empty`; a blank now means **not provided**.
>
> - **Symptom**: in one session `agent_teams_create` failed **34 times with 0 successes**, in another **14 times with 0 successes**, and no member ever started; the error alternated between `profiles.inline-plan.members[0].tool_policy must not be empty` and `unknown tool policy "default"`.
> - **Root cause**: the captain model fills **every optional parameter with `""`** instead of omitting it (its own reasoning: "the tools I need require all parameters, even the optional ones"), while the plugin treated the two paths differently — `add_member` / `edit_plan` run `trimmedOptional`, which washes `""` into `undefined` (allowed), whereas the inline plan ran `optionalNonEmptyString` (always rejected). The top-level `profile` already normalized blanks (issue #99); the inline plan's inner fields were missed.
> - **Fix**: one place, `optionalNonEmptyString` in `src/profiles.ts` — a blank or whitespace-only value now returns `undefined`. **Required fields are untouched** (`name` / `id` / `subject` / `fallback.provider|model` / dependency ids stay strict; a non-string is still a hard error).
> - **Regression**: new `scripts/inline-plan-blank-optional-tdd.mjs` (wired into `pnpm verify`), **23/23 green**, including 7 assertions that keep required fields rejecting blanks.
> - **Also clarified**: the `subagent` tools were **never called at all** in those sessions (all 70/70 request headers carried the tool) — "cannot call a subagent" really meant the model never issued the call; with the blank-string habit fixed, calls such as `list_subagent_models` are no longer bounced by `` `provider` must be non-empty ``.
> - **Also fixed**: the `#161` drift check used a `1ms` mtime tolerance, smaller than the measured cross-clock skew (worst case 2.2ms on Windows), so a file written *before* a verdict read as modified *after* it — the test precondition failed about **57.75%** of runs. Raising the tolerance to **4ms** turned the 400-round probe to **0/400** and ten consecutive suite runs **10/10** green, backed by two new **deterministic** regression cases that inject the skew instead of hoping for it. Three symlink-dependent cases now share the runtime probe `scripts/symlink-support.mjs`: they skip with an explicit reason where Windows lacks Developer Mode (previously hard-coded or not skipped at all, so they always failed on such a host) and still run in full where symlinks work.
>
> **🆕 [0.7.0](release-notes/v0.7.0.md) (2026-10-12)**: vendor namespace **17 → 18**, adding **MiMo (Xiaomi MiMo)**.
>
> - **Tier**: the same tier as `meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev` — a vendor-generic portrait plus an HD one, **no role art**. A member request for `member-mimo-<role>-v2.png` misses hop 1 and lands on **the vendor's own character at hop 2** (the chain has been `vendor+role → vendor → role` since [0.5.1](release-notes/v0.5.1.md)), so avatars render normally.
> - **Recognition**: `mimo` / `mimo-*` (`mimo-v2` / `MiMo-7B` / `mimo-vl`) / `xiaomi` / 小米. **Boundaries are the hard part here**: `mimo` shares the `mi` prefix with `minimax` and `mistral`, so relaxing to a bare `\bmi[\w.-]*` would swallow both vendors wholesale; yet a loose `\bmimo[\w.-]*` would swallow ordinary words such as `mimosa` / `mimolette`. The rule therefore requires a word boundary or a separator after `mimo` — real MiMo model ids always carry a separator, so tightening loses no real id. Both directions are pinned by unit tests.
> - **Assets**: 3 new files (a 256×256 RGBA avatar, an alpha WebP HD portrait and a brand SVG); the asset directory goes **286 → 289 files**. The portrait was checked corner by corner to keep its transparent background (all four corners read `(0,0,0,0)`), consistent with the existing vendor art.
> - ⚠️ **`brand-mimo.svg` is a self-made simplified monogram**: the gate requires a brand file per vendor, so a minimal Mi monogram (Xiaomi-orange rounded square with a white `mi`) was drawn under the existing normalization contract. It is **not an official mark**; replace the file once official art exists.
> - **Why minor**: `ARTWORK_VENDORS.length` is a gate-asserted contract value (17 was hard-coded), so moving it to 18 is a behaviour change, not a patch.
>
> **🆕 [0.6.1](release-notes/v0.6.1.md) (2026-10-12)**: **fixes the whole-row disable on DSH `0.2.1-alpha.2`** — neither `supportedHosts` nor the 21 `@deepseek-ai/dsh-*` peer ranges declared that version, so DSH judged the plugin incompatible and **disabled its profile row** (symptom: the plugin shows as broken and team collaboration does nothing).
>
> - **Root cause**: this repository treats `compatibility.json` as the **single source of truth** and requires every peer range to **exactly enumerate** its host versions. The declaration surface simply did not follow the runtime to `0.2.1-alpha.2` — **the plugin code itself is not defective** (its compiled output value-imports only `dsh-llm` and `schemastery`, both of which still export on the new host).
> - **Fix**: add `0.2.1-alpha.2` to `supportedHosts` with `track: preview`, then append it to all **21** peer ranges (the `scripts/compatibility.mjs` gate forces this step: skip it and the check goes red). `recommendedHost` **stays** on the stable `0.2.0-rc.2` — an alpha must not be the ordinary-user recommendation.
> - **Why not a wide range**: DSH compares with `includePrerelease`, so `>=0.2.0-rc.2` would claim compatibility with **every future** version, which contradicts this repository's stance of declaring a host only after testing it.
>
> **🆕 [0.6.0](release-notes/v0.6.0.md) (2026-10-11)**: merges **upstream v0.1.23** (member tool policies / quality-gate contract and amendment binding / lineage identity across forks / session source metadata and recovery utility / workspace audit / degraded handling of a corrupt `team.json` / card id-matching regression fix), while **fully preserving** Fish's vendor art system and captain-avatar route following.
> **🆕 [0.6.0](release-notes/v0.6.0.md) (2026-10-11)**: merges **upstream v0.1.23** (member tool policies / quality-gate contract and amendment binding / lineage identity across forks / session source metadata and recovery utility / workspace audit / degraded handling of a corrupt `team.json` / card id-matching regression fix), while **fully preserving** Fish's vendor art system and captain-avatar route following.
>
> - **Baseline advanced**: upstream tag `v0.1.22` (`9cba4fe`) → **`v0.1.23`** (`1094b84`), bringing in 37 upstream commits and four new modules (`tool-policies` / `workspace-audit` / `lineage` / `artifacts`) at once.
> - **New capabilities**: `toolPolicies` lets the deployment owner declare reusable tool `allow` / `deny` lists by id, which members select via `tool_policy` (the four coordination tools always remain available); verdicts bind to **artifact bytes** with repair lineage completed; captain identity survives **warm and cold forks**. See [0.6.0](release-notes/v0.6.0.md).
> - **Not a line of Fish lost**: the `vendor+role → vendor → role` degradation chain, seventeen-vendor recognition and brand marks, captain-avatar route following, and the 286 packaged asset files — all intact, with the three art suites (21 / 41 / 9) fully green.
>
> **🆕 [0.5.1](release-notes/v0.5.1.md) (2026-10-11)**: fixes a degradation-chain defect that made an entire vendor art tier **unreachable**, and closes a batch of vendor-recognition misses on real model IDs.
>
> - **Root cause**: the chain used to be `vendor+role → role → vendor`. A role-generic image (`member-<role>-v2.png`, the 8 packaged whales) exists for **every** role, so the *role* hop always won and the *vendor* hop was dead code. The symptom on screen was "the badge already shows the StepFun mark, yet the avatar is the generic role whale" — **vendor detection was right; the chain order was wrong**.
> - **Impact**: the vendor character was permanently unreachable for the **7 vendors** that ship only a generic portrait (`meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev`); and `member-<vendor>-full-v2.webp` (**17 vendor portraits**) could never win, so click-to-enlarge only ever produced a 256px role avatar.
> - **Fix**: the chain is now **`vendor+role → vendor → role`** — vendor identity is the point of this art system, so vendor wins; the role image stays at the tail as before.
> - **Why the gate missed it**: it only pinned **hop 1** (`vendor+role` must resolve to its own file), while the accident happened at hop 2. Three assertions were added: hop 2 must reach the vendor's own portrait, the vendor hop index must precede the role hop, and `-full` must prefer the vendor portrait.
> - **Recognition refinements**: added StepFun's **letter families** (`step-asr` / `step-tts-mini` / `stepaudio-*` — the old rule required a digit after `step`, missing them all), GLM's `charglm` / `codegeex` / `cogview` / `cogvideo`, qwen's `dashscope` / `aliyun`, Gemini's `palm-<digit>` / `bison` / `gecko` / `vertex`, seed's `byteplus` / `skylark`, minimax's `speech-<digit>`; and tightened `\bern` to `\bernie` (the old prefix misjudged `ernest` / `ernestine` as ERNIE). See [0.5.1](release-notes/v0.5.1.md).
>
> **🆕 [0.5.0](release-notes/v0.5.0.md) (2026-10-11)**: vendor namespace **15 → 17**, adding **StepFun** and **Jev** (TypeSafe System One).
>
> - **Tier**: both ship only a generic vendor portrait + HD portrait — the same tier as `meta` / `mistral` / `rwkv` / `seed` / `ernie`. A member request for `member-<vendor>-<role>-v2.png` misses hop 1, and [0.5.1](release-notes/v0.5.1.md) then made hop 2 land on **the vendor's own character** ([0.5.0](release-notes/v0.5.0.md) itself mistakenly landed on the role-generic image; see above).
> - **Recognition**: `stepfun` matches the provider name, the `step-<digit>` model family, and 阶跃. The model-family clause is required: this machine's real routes are `cn-f/cline/cline-free/step-5-preview`-style, whose **provider segment never contains "stepfun"** — matching the provider alone drops the whole team to fallback art (the same class of defect fixed for `hunyuan3` in [0.4.1](release-notes/v0.4.1.md)). `jev` matches `jev` / `typesafe` / `type-safe`.
> - **Boundaries**: both keep word boundaries, so `stepper` / `steps` / `stepstone` / `jevons` / `jevenile` are not swallowed (pinned by unit tests).
> - **Assets**: 6 new files (2 × 256×256 RGBA avatars, 2 × alpha WebP HD portraits, 2 brand SVGs); the asset directory goes **280 → 286 files**.
> - ⚠️ **`brand-jev.svg` is a placeholder monogram, not an official mark**: TypeSafe / Jev has no public logo (neither simple-icons nor LobeHub icons carries one), so a minimal "J" mark was drawn under the existing normalization contract. **Replace that file once an official mark exists** — the name and size contract stay the same.

---
Eighteen vendors × ten role avatars and eighteen vendor brand marks **ship inside the package** — they work out of the box; swapping the entire art style is still just one custom directory away, with zero changes to animation code.

## Table of Contents

- [Original Author & Licensing (Read First)](#original-author--licensing-read-first)
- [What the Upstream Plugin Does](#what-the-upstream-plugin-does)
- [What This Fork Adds](#what-this-fork-adds)
- [Installation & Activation](#installation--activation)
- [Configuration](#configuration)
- [Art System](#art-system)
- [Development & Testing](#development--testing)
- [Directory Structure](#directory-structure)
- [Known Limitations & Pitfalls](#known-limitations--pitfalls)
- [More Documentation](#more-documentation)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Original Author & Licensing (Read First)

| Item | Detail |
|------|--------|
| Plugin name | **dsh-agent-teams** (turns a single DeepSeek Harness session into a collaborative multi-agent team) |
| Original author | **程序员阿江 (Relakkes)** · GitHub [@NanmiCoder](https://github.com/NanmiCoder) · relakkes@gmail.com |
| Upstream repo | <https://github.com/NanmiCoder/dsh-agent-teams> |
| Upstream npm package | `@nanmicoder/dsh-agent-teams` (**belongs to the original author; this fork cannot reuse the name**) |
| This fork's npm package | **`dsh-agent-teams-fish`** |
| License | **MIT**, copyright retained by the original author (the [`LICENSE`](LICENSE) file is **unmodified**) |
| Upstream baseline | tag `v0.1.22` (commit `9cba4fe`) |
| Nature of this fork | **Companion fork** — neither original nor official; the upstream README is preserved verbatim as [`README.original.md`](README.original.md) / [`README_ZH.original.md`](README_ZH.original.md) |

> See **[`NOTICE.md`](NOTICE.md)** for full attribution and a summary of additions. Please retain the original author's credit when redistributing.

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Upstream plugin hero image (from the upstream repository)">
</p>

## What the Upstream Plugin Does

The upstream plugin extends a single DSH session into a **structured team**: roster management, task DAG scheduling (with `dependencies` expressing prerequisites), dependency-driven dispatch, quality gates (requirements → implementation → verification → review → repair → integration), member mailboxes, and a "Team Collaboration" side panel.

This fork **does not touch that collaboration logic** — it only adds "what the team looks like."

## What This Fork Adds

| Feature | Description | Key files |
|---------|-------------|-----------|
| Custom artwork directory | New `artworkDir` config option. When set, custom images take priority over packaged assets; only **known filenames** are accepted (unknown names, `..`, and absolute paths all get a 404) | `src/artwork-source.ts` [new] · `src/index.ts` |
| Packaged vendor assets ([0.3.1](release-notes/v0.3.1.md)) | Vendor avatars and brand-mark SVGs ship inside the package — no external directory needed | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs` [new] |
| Extension-based MIME for packaged assets ([0.3.2](release-notes/v0.3.2.md)) | The package also contains `brand-<vendor>.svg`; [0.3.1](release-notes/v0.3.1.md) served all packaged assets as `image/png`, causing the browser to fail SVG decoding and silently fall back to the activity image — now the MIME type is inferred from the extension | `src/artwork-source.ts` · `src/index.ts` |
| Vendor-namespaced avatars | Avatar filenames expanded from "role only" to "vendor + role": `member-<vendor>-<role>-v2.png`; unrecognized vendors fall back to the role-generic image | Same · `src/client/artwork.ts` |
| Vendor identification | Vendor is inferred from a member's `provider + model` route — since `bailian` serves both qwen and deepseek, **the model id is the reliable key** | `src/client/artwork.ts` |
| Vendor brand badge | The 22px badge in the avatar's corner changes from "activity state image" to "vendor brand SVG" (`brand-<vendor>.svg`); `onError` automatically falls back to the activity image when the file is missing — **no broken images** | Same · `ActivityPanel.tsx` · `ActivityPanel.module.css` |
| Chinese role labels | Role labels in the panel and cards display in Chinese (工程师, 测试, 安全, 研究员, 设计, 文档, 数据, 运营, 音频, 视频) | `src/client/locales.ts` |
| Click-to-enlarge | Clicking an avatar opens a 320px large preview (automatically degrades to the avatar when the `-full` file is missing); close with Esc or by clicking the backdrop | `ActivityPanel.tsx` |
| Captain avatar | The captain **follows its own model route**: team creation records the captain's `provider`/`model` into `team.json` (`captainProvider` / `captainModel`), and the panel requests `team-lead-<vendor>-v2.png`, falling back to `team-lead-v2.png` when the vendor is unknown — and **requests a brand-new URL** to bypass the browser's 24h cache | `src/client/artwork.ts` · `src/tools.ts` · `src/snapshot.ts` |
| Vendor-generic portrait fallback | When the vendor is recognized but the role-specific art is missing, `member-<vendor>-v2.png` is used — **this vendor hop now precedes the role-generic image** (fixed in [0.5.1](release-notes/v0.5.1.md); the order used to be reversed, turning the hop into dead code) | `src/client/artwork.ts` · `src/artwork-source.ts` |
| Tightened cache policy | When `artworkDir` is configured, all artwork responses use `no-store` (previously packaged assets used `max-age=86400`, causing "changed the image but it looks the same") | `src/index.ts` |
| High-resolution preview family (2026-10-08) | List thumbnails remain 256 PNG; click-to-enlarge uses the **original-resolution** artwork after background removal (role/captain at 1024×1024, vendor portraits with long edge ≤2048), encoded as WebP quality 92 with alpha — the full set of 125 HD images totals ~19 MB, whereas PNG at the same resolution would be ~125 MB | `assets/agent-teams/` |
| Second-round vendor assets (2026-10-08) | Vendor namespace expanded from 9 → 15; vendor assets from 108 → 265 files; `audio` / `video` role buckets (previously registered but without art) completed for 10 vendors; assets split into two tiers: the first 10 vendors have full "vendor × role" sets, the remaining 5 have only generic portraits and HD portraits | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs` |
| Route-chain unit tests | 20 unit tests covering: degradation chain order, unknown vendor rejection, non-`.png` request rejection, path traversal rejection, packaged extension probing | `scripts/custom-artwork.test.mjs` [new] |
| Bilingual README ([0.4.0](release-notes/v0.4.0.md)) | Added [`README.en.md`](README.en.md) as an English counterpart, with sections matching the Chinese version one-to-one | `README.md` · `README.en.md` |
| **Refined vendor matching + two systemic fixes** ([0.4.1](release-notes/v0.4.1.md)) | ① A trailing `\b` blocked "name + digits" ids: `hunyuan3` / `rwkv7` / `seed1.6` / `abab6.5s` / `chatglm3-6b` all failed to match; ② **`\b` never holds next to CJK** (JS `\w` is ASCII-only), so the Chinese aliases 混元 / 通义 / 智谱 / 豆包 / 文心 / 千帆 were **dead branches all along**. This release closes **18 misses** — the hunyuan `hy` family (`hy3` / `hy-3` / `hy_1.5`), minimax (`abab6.5s` / `hailuo`), the mistral family (`magistral` / `pixtral` / `voxtral` / `ministral`), qwen (`qwq`) and more — with zero false positives (`hypothesis` / `hybrid-1` / `hyperbolic` / `orchestral-music` / `metadata-model` still do not match) | `src/client/artwork.ts` · `scripts/artwork-role-match.test.mjs` |
| **Captain avatar follows the route** ([0.4.2](release-notes/v0.4.2.md)) | The captain image used to be a hard-coded constant `team-lead-deepseek-v2.png`, so a captain running qwen / claude / glm still requested the DeepSeek one — the **other 9 packaged captain images were unreachable**. The root cause was the host side: `team.json` recorded only `captainSessionId`, never the captain's model route. Team creation now writes `captainProvider` / `captainModel`, the snapshot exposes them (live value wins), and the panel uses the same vendor detection as members | `src/client/artwork.ts` · `src/tools.ts` · `src/snapshot.ts` · `src/types.ts` |
| **Contradictory README line fixed** ([0.4.3](release-notes/v0.4.3.md)) | The [0.4.2](release-notes/v0.4.2.md) release missed the "Captain does not follow model routing" line in the known-limitations table, leaving the same README asserting both the old and new behavior. **An npm package's README is frozen at publish time and cannot be edited afterwards**, so [0.4.3](release-notes/v0.4.3.md) re-publishes the corrected text; functionality is identical to [0.4.2](release-notes/v0.4.2.md) — a documentation-only release | `README.md` · `README.en.md` |
| **Third-round vendor assets** ([0.5.0](release-notes/v0.5.0.md)) | Vendor namespace 15 → 17, adding **StepFun** and **Jev** (TypeSafe System One), both in the "generic portrait + HD portrait only" tier (same as `meta` / `rwkv`). `stepfun` matches the provider name, the `step-<digit>` family and 阶跃 — the model-family clause is required because this machine's Step routes never name stepfun in the provider segment; `jev` matches `jev` / `typesafe` / `type-safe`, both keeping word boundaries | `src/client/artwork.ts` · `src/artwork-source.ts` · `assets/agent-teams/` · `scripts/verify.mjs` |
| **Degradation-chain fix + refined vendor matching** ([0.5.1](release-notes/v0.5.1.md)) | ① **Chain defect**: the old `vendor+role → role → vendor` order let the role-generic image always win, making the vendor hop dead code — the vendor character of the 7 generic-only vendors and all 17 vendor portraits were permanently unreachable (on screen: "badge shows StepFun, avatar is the generic role whale"). Now **`vendor+role → vendor → role`**, with 3 new gate assertions (hop 2 reachable, vendor hop before role hop, `-full` prefers the vendor portrait) — the old gate only pinned hop 1 while the accident happened at hop 2. ② **Recognition**: added StepFun's letter families (`step-asr` / `step-tts-mini` / `stepaudio-*`), GLM's `charglm` / `codegeex` / `cogview` / `cogvideo`, qwen's `dashscope` / `aliyun`, Gemini's `palm-<digit>` / `bison` / `gecko` / `vertex`, seed's `byteplus` / `skylark`, minimax's `speech-<digit>`, and tightened `\bern` to `\bernie` so `ernest` is no longer swallowed | `src/artwork-source.ts` · `src/client/artwork.ts` · `scripts/verify.mjs` · `scripts/*.test.mjs` |

## Installation & Activation

### Option 1: Install from npm (recommended)

```sh
# Install into a profile — dsh plugin runs pnpm install and reconciles the package into the bundles layer
# Profile names: desktop = desktop, Web = web
dsh plugin --profile <profile> add dsh-agent-teams-fish
```

> **Restart DSH** after installation. Host-side code changes require a restart; client-only package changes only need a page refresh.

You can also add it manually to `profiles/<profile>/package.json`:

```jsonc
"dependencies": {
  "dsh-agent-teams-fish": "^0.7.1"
}
```

### Option 2: Local source link (for source modifications)

```jsonc
// profiles/<profile>/package.json
"dependencies": {
  "dsh-agent-teams-fish": "link:<path to this repo>"
}
```

> Do **not** use `file:` — pnpm treats directory dependencies as unhashed cache, so source changes won't propagate even after reinstalling.

### Option 3: Install from GitHub

```jsonc
"dependencies": {
  "dsh-agent-teams-fish": "github:Fish-under-sea/dsh-agent-teams-fish"
}
```

> This fork's npm package name is **`dsh-agent-teams-fish`**: the upstream package name `@nanmicoder/dsh-agent-teams` belongs to the original author and cannot be reused here.
> Renaming affects three places that must stay in sync — `package.json` `name`, the plugin row `name` in `cordis.patch.yml`, and the client package registration `id` (mismatches cause `loaded without registering` errors).

## Configuration

Enable the plugin in `profiles/<profile>/cordis.patch.yml`. Vendor assets already **ship inside the package**, so `artworkDir` is only needed when you want to replace the entire art style:

```yaml
- insert:
    - id: agent-teams
      name: 'dsh-agent-teams-fish'
      config:
        stateDir: .agent-teams
        memberProvider: spawn
        # Optional: one directory to override all packaged assets (omit to use the 15 built-in vendor sets)
        artworkDir: <absolute path to your artwork directory>
```

| Config key | Description | Default |
|------------|-------------|---------|
| `stateDir` | Team state directory (relative to the session workspace) | `.agent-teams` |
| `memberProvider` | How member subagents are created (`spawn` / `fork`) | `spawn` |
| `artworkDir` | **Optional**: absolute path to a custom artwork directory; when set, overrides all packaged assets (including vendor art) | None (uses packaged assets) |

> The configuration directory is **read only once at startup**; swapping images afterward does not require a restart (custom images are served with `no-store`).
> ⚠️ `artworkDir` is a **machine-local absolute path**: it breaks when you change machines or usernames, and the plugin silently falls back to packaged assets. Before [0.3.1](release-notes/v0.3.1.md), the package had no vendor art, so this fallback meant "the entire team reverts to built-in whale avatars"; now the package ships vendor assets, so cross-machine setups no longer need to configure it.

## Art System

### Naming Convention

| Filename | Purpose | Panel size / spec |
|----------|---------|:-----------------:|
| `member-<vendor>-<role>-v2.png` | Member avatar for a specific vendor and role (list thumbnail) | 40px (card 24px) · 256×256 PNG |
| `member-<vendor>-<role>-full-v2.webp` | High-resolution image on click (role-level) | 320px frame · 1024×1024 WebP |
| `member-<role>-v2.png` | Role-generic image (vendor-agnostic) | 40px · 256×256 PNG |
| `member-<vendor>-v2.png` | Vendor-generic avatar (fallback when the vendor is recognized but role art is missing) | 40px · 256×256 PNG |
| `member-<vendor>-full-v2.webp` | Vendor-generic HD portrait (fallback large image) | 320px frame · long edge ≤2048 WebP |
| `team-lead-<vendor>-v2.png` · `team-lead-v2.png` | Captain avatar (vendor-specific first; the captain follows its own model route through the same vendor detection as members) | 44px · 256×256 PNG |
| `team-lead-<vendor>-full-v2.webp` | Captain's click-to-enlarge HD image | 320px frame · 1024×1024 WebP |
| `brand-<vendor>.svg` | Vendor brand mark in the avatar corner | 22px · monochrome inline path |
| `action-*-v2.png` | Activity state image for the badge when vendor is unrecognized | 22px |

- **Vendor tokens (17)**: `deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` `meta` `mistral` `rwkv` `seed` `ernie` `stepfun` `jev`
- **Role tokens (10)**: `engineer` `qa` `security` `researcher` `designer` `docs` `data` `operator` `audio` `video` (captain is separate)
- Custom directory filenames may omit the `-v2` suffix; extension priority: `.png` `.webp` `.jpg` `.jpeg` `.gif` `.svg`
- **The client always requests `.png` names** (`member-…-v2.png` / `…-full-v2.png`); the `member-` and `team-lead-` families **probe extensions in order** (as listed above), so the packaged `.webp` HD images can directly answer `.png` requests. Brand marks (`brand-…svg` → `brand-…png` → `brand.svg` → `brand.png`) and activity images keep strict candidate names.

> **Why the HD family uses WebP**: for the same 1024×1024 image, PNG is about **0.9 MB** (110 images would total ~125 MB), while quality-92 WebP is only **~130 KB** (125 HD images total **~19 MB**). The preview frame is only 320px wide — the two encodings are visually indistinguishable, and `<img>` handles both identically (`content-type` is determined by the actual extension that matches).

### Packaged Assets (since [0.3.1](release-notes/v0.3.1.md); vendor assets refreshed on 2026-10-08 with HD family added)

`assets/agent-teams/` contains **289 files / ~29.7 MB**: 15 built-in whale baselines (captain / 8 roles / 6 actions) + **274 vendor assets**.

| Family | Count | Spec |
|--------|:-----:|------|
| `member-<vendor>-<role>-v2.png` | 10 × 10 = 100 | 256×256 8-bit RGBA |
| `member-<vendor>-<role>-full-v2.webp` | 10 × 10 = 100 | 1024×1024 RGBA WebP |
| `member-<vendor>-v2.png` | 18 | 256×256 8-bit RGBA |
| `member-<vendor>-full-v2.webp` | 18 | Portrait, long edge 1897–2048 |
| `team-lead-<vendor>-v2.png` | 10 | 256×256 8-bit RGBA |
| `team-lead-<vendor>-full-v2.webp` | 10 | 1024×1024 RGBA WebP |
| `brand-<vendor>.svg` | 18 | Inline path, fully offline (no external links, no scripts) |

> Vendor assets come in two tiers: `deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` — these 10 have full "vendor × role" sets (avatars + HD) and captain art; `meta` `mistral` `rwkv` `seed` `ernie` `stepfun` `jev` `mimo` have only vendor-generic avatars and HD portraits — role requests resolve to `member-<vendor>-v2.png` (now the **2nd** hop, ahead of the role-generic image, since [0.5.1](release-notes/v0.5.1.md); it used to be the 3rd hop and was therefore never reachable).

> ⚠️ **The packaged directory only recognizes names in the candidate chain (with `-v2`)**: `member-qwen-qa.png` in `artworkDir` can hit via alias fallback, but the packaged directory does not perform this alias fallback. The import script uniformly adds `-v2` — manually copying files without the suffix into the package causes "the file is clearly there, but the request always misses." `pnpm verify` now asserts all 274 files with their dimensions and formats (including encoding and alpha for both families).

### Degradation Chain (no broken images)

```text
Request: member-qwen-qa-v2.png
  ├─ 1. member-qwen-qa-v2.png     Vendor + role (packaged)
  ├─ 2. member-qwen-v2.png        Vendor-generic (packaged)
  ├─ 3. member-qa-v2.png          Role-generic
  └─ 4. Built-in whale assets
```

**The order is `vendor+role → vendor → role`: the vendor hop must precede the role hop** (fixed in [0.5.1](release-notes/v0.5.1.md)). The order used to be reversed, and since a role-generic image exists for **every** role, the role hop always won and the vendor hop became dead code — the vendor character was permanently unreachable for the 7 vendors that ship only a generic portrait (`meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev`), and the 17 vendor portraits could never win either. On screen this looked like "the badge already shows the StepFun mark, yet the avatar is the generic role whale".

Requests with `-full` additionally list the non-full variant of the same name (so clicking to enlarge works even without a dedicated portrait), and likewise **prefer the vendor portrait over the role avatar**; the packaged HD family is `.webp`, which the host discovers via extension probing, so "list thumbnail + click-to-enlarge HD" share a single request name. Brand chain: `brand-<vendor>.svg → brand-<vendor>.png → brand.svg → brand.png` — when none exist, the frontend automatically falls back to the activity state image.

### Vendor Identification Rules

Lowercase regex matching against `provider + model` concatenated:

| Token | Matches | Token | Matches |
|-------|---------|-------|---------|
| `deepseek` | deepseek | `gemini` | gemini / gemma / palm-\<digit\> / bison / gecko / google / vertex |
| `qwen` | qwen / tongyi / dashscope / aliyun / 通义 | `grok` | grok / xai / x.ai |
| `glm` | glm / chatglm / charglm / codegeex / cogview / cogvideo / zai / z.ai / zhipu / bigmodel / 智谱 | `gpt` | gpt / chatgpt / openai / codex |
| `kimi` | kimi / moonshot | `hunyuan` | hunyuan / hy\<digit\> / 混元 / tencent |
| `claude` | claude / anthropic | `minimax` | minimax / mini-max / abab / hailuo / speech-\<digit\> |
| `meta` | meta / llama | `mistral` | mistral\* / mixtral / codestral / devstral |
| `rwkv` | rwkv | `seed` | seed / doubao / 豆包 / bytedance / byteplus / volcengine / volces / skylark |
| `ernie` | ernie\* / wenxin / 文心 / baidu / qianfan / 千帆 | `stepfun` | stepfun / `step-<digit>` / `step-<letter>` / stepaudio\* / 阶跃 |
| `jev` | jev / typesafe / type-safe | `mimo` | mimo / mimo-\<suffix\> / xiaomi / 小米 |

> **Why `stepfun` must match model families**: this machine's three Step routes have provider segments like `cn-f/cline/cline-free`, which contain **not a single letter of "stepfun"**, while the model is `step-5-preview`. Matching the provider name alone drops the whole team to fallback art — the same class of defect fixed for `hunyuan3` / `rwkv7` / `seed1.6` in [0.4.1](release-notes/v0.4.1.md).
>
> **The `step-<letter>` clause is equally required** (added in [0.5.1](release-notes/v0.5.1.md)): StepFun's official ID list contains many letter-suffixed families (`step-asr` / `step-tts-mini` / `step-r1-v-mini` / `step-video-t2v`), and the old `step[-_.]?\d` required a **digit** after `step`, so all of them were missed. The patterns `step[-_.][a-z]` and `stepaudio[\w.-]*` close that gap.
>
> All of them keep word boundaries: `stepper` / `steps` / `stepstone` / `jevons` / `jevenile` are not swallowed (pinned by unit tests).

### Production Pipeline (how this fork's art is made)

| Step | Approach |
|------|----------|
| Role art | Chibi portrait → white background removal (flood fill threshold 238 + edge shrink) → crop to solid bounding box → 8% inner padding → **256×256 RGBA** (portraits 512×512) |
| Brand marks | simple-icons / Iconify `thesvg` → monochrome path + vendor brand-color `fill` → **perceptually normalized inset** |
| Why normalization matters | Most brand marks have ink **touching the viewBox edges**; cramming them into a 22px disc (3px padding) causes edge clipping and inconsistent sizing; uniform scaling to ink-frame **0.854** makes them visually consistent |
| Package import | `pnpm import:artwork --from <source dir> --apply` — uniformly adds `-v2` suffix, skips `.md` and 1×1 placeholder images, does not overwrite built-in captain baselines |
| Tools | `render-svgs.mjs` (SVG→PNG, visual review) · `normalize-brands.mjs` (normalization, reads back actual raster for verification) |
| **2026-10-08 asset refresh** | Vendor-generic / portraits ← 15 full-body portraits; vendor × role and captain art ← 10 vendors × 11 chibi portraits. Same background-removal pipeline, plus two extra steps: 5×5 box blur to smooth JPEG noise before flood fill, connected-component denoising (isolated foreground smaller than 0.005% classified as noise) — MJPG source artifacts had inflated the ink frame to full extent |
| **Badge completion** | 6 new vendor brand marks: simple-icons (`minimax` / `meta` / `mistralai`) + LobeHub icons (`rwkv` / `bytedance` / `wenxin`) → monochrome path + vendor brand color → using the **same** normalization target as the existing 9 (ink frame max edge scaled to 0.84×24, centered; existing 9 have median residual 0.026) |
| **2026-10-08 HD family** | List thumbnails remain 256 PNG; click-to-enlarge uses the **original-resolution** artwork after background removal: role/captain placed on 1024×1024 canvas at **1:1 native pixels centered** (no resampling, no upscaling), vendor portraits area-scaled to **long edge ≤2048**. All encoded as **WebP `-quality 92`** (`-pixel_format rgba`, with alpha) — 125 images total 19 MB; PNG at the same resolution would be 125 MB. Original 512 PNG portraits replaced by HD WebP — the extension priority for same-name families is `.png` first, so keeping PNG would prevent HD from ever being served |

## Development & Testing

```sh
pnpm install

pnpm typecheck                                          # tsc dual-project (host + client)
pnpm build                                              # Build lib/ and asset fingerprints
pnpm exec node --test scripts/custom-artwork.test.mjs   # 20 route-chain unit tests

pnpm import:artwork --from <source dir>                 # Dry run: list files to write and renames
pnpm import:artwork --from <source dir> --apply         # Actually write to assets/agent-teams/
```

## Directory Structure

```text
dsh-agent-teams-fish/
├── src/
│   ├── index.ts                         Plugin entry: artworkDir config, asset routing (with extension probing), no-store strategy
│   ├── artwork-source.ts                [New in this fork] Slug grammar, degradation chain, custom/packaged directory lookup
│   └── client/
│       ├── artwork.ts                   Vendor/role identification and artwork URL construction
│       ├── ActivityPanel.tsx            Team panel: member avatars, badges, click-to-enlarge, captain avatar
│       ├── ActivityPanel.module.css
│       ├── AgentTeamsCard.tsx           Session card avatar
│       └── locales.ts                   i18n strings (including Chinese role labels)
├── scripts/
│   ├── custom-artwork.test.mjs          [New in this fork] 20 route-chain unit tests (including packaged extension probing)
│   └── import-vendor-artwork.mjs        [New in package] Vendor asset import (adds -v2 suffix, skips placeholders)
├── lib/                                 Build output (tracked in repo; what DSH actually loads)
├── assets/                              Art (15 built-in whale images + 271 vendor assets [including HD WebP] + readme/hero.svg)
├── README.md                            This file (rewritten for this fork)
├── README.en.md                         English counterpart
├── README.original.md                   Upstream English README (preserved verbatim)
├── README_ZH.original.md                Upstream Chinese README (preserved verbatim)
├── NOTICE.md                            Attribution and provenance
├── LICENSE                              Upstream MIT license (unmodified)
└── CONTRIBUTING.md                      Upstream contributing guide
```

## Known Limitations & Pitfalls

| Item | Reality |
|------|---------|
| **Captain does not follow model routing** (fixed in [0.4.2](release-notes/v0.4.2.md)) | The panel snapshot (`TeamActivitySnapshot`) used to carry only members' `provider/model`, never the captain's, so the captain had to rely on file override. [0.4.2](release-notes/v0.4.2.md) adds `captainProvider` / `captainModel` to `TeamState` (written at team creation) and exposes them in the snapshot with the **live value winning**, so the captain artwork now uses the same vendor detection as members; legacy team records without the fields fall back to the packaged captain image |
| **Same-URL packaging gets 24h browser cache** | Packaged assets use `max-age=86400`: if a URL was once served a packaged image, subsequent custom files won't be re-requested for 24h, looking like "changes didn't take effect" (the captain actually hit this). Now mitigated doubly: captain requests a **brand-new URL** + `no-store` when a directory is configured |
| **Built-in same-name files still need hard refresh** | Replacing filenames that "also ship with the plugin" (`team-lead-v2.png`, `member-<role>-v2.png`, `action-*.png`) requires `Ctrl+Shift+R` the first time to bust the old cache. The vendor namespace (`member-<vendor>-*-v2.png`, `brand-<vendor>.svg`) entered the package in [0.3.1](release-notes/v0.3.1.md) as new URLs the browser has never seen, so it's unaffected by this cache issue |
| **Same-URL cache when HD family launched** (2026-10-08) | Before the upgrade, `member-<vendor>-*-full-v2.png` requests were resolved by the host as 256 avatars and cached by the browser for 24h with `max-age=86400`; after upgrade the same URL might still serve old bytes. **Machines without `artworkDir`** need one hard refresh after the first upgrade (those with it configured use `no-store` and are unaffected) |
| **Badge media type (fixed in [0.3.2](release-notes/v0.3.2.md))** | The package also contains SVG, but [0.3.1](release-notes/v0.3.1.md)'s host side served **all packaged** assets as `image/png` → browser decode failure → badge `onError` fell back to activity image, looking like "SVG was never packaged"; machines with `artworkDir` were unaffected (that branch already inferred by extension). Now both paths share the same extension table (`member-` / `team-lead-` families probe by extension, brand marks and activity images keep strict candidate names), with gate assertions that every `brand-<vendor>.svg` is delivered as `image/svg+xml` and HD WebP as `image/webp` |
| **`artworkDir` is not portable** | It's a machine-local absolute path, resolved relative to the process working directory. After changing machines, if the directory doesn't exist, the lookup chain falls straight through to packaged assets — before [0.3.1](release-notes/v0.3.1.md) this was the scene of "vendor avatars collectively disappearing" |
| **`lib/` is build output** | Tracked in the repo like upstream (for convenient GitHub direct-install), so a single build produces a large diff. `package.json` only changes identity fields: package name to `dsh-agent-teams-fish`, `repository`/`homepage`/`bugs` pointing to this repo, **version and `author` kept unchanged from upstream**; renaming affects the plugin row and client registration name — the profile must be updated accordingly during installation |
| **Upstream release verification not run** | Upstream `verify:release` / `verify:compatibility` scripts validate upstream repository metadata; this fork has not executed them all |
| **Toolchain pitfall** | In this environment, `& "DSH Desktop Beta.exe" script.mjs` (with `ELECTRON_RUN_AS_NODE=1`) **does not block**: files it writes may land after subsequent commands. When chaining "normalize → copy → render," explicit waits are necessary or you'll read stale copies |
| **Tested environment** | Windows 10/11 + PowerShell 5.1 + Node `^22.19.0 \|\| >=24`; `pnpm build` requires dependencies already installed |

## More Documentation

| Document | Content |
|----------|---------|
| [`NOTICE.md`](NOTICE.md) | Provenance and attribution (original author, baseline, scope of additions, artwork copyright) |
| [`README.original.md`](README.original.md) | Upstream English README (preserved verbatim, with full feature documentation) |
| [`README_ZH.original.md`](README_ZH.original.md) | Upstream Chinese README (preserved verbatim) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Upstream contributing guide |
| [`LICENSE`](LICENSE) | Upstream MIT license |

## Acknowledgments

Thanks to the original upstream author **程序员阿江 (Relakkes / @NanmiCoder)** for creating the dsh-agent-teams plugin, which provides the complete team collaboration foundation for this fork. This version only adds art system capabilities on top of it. Upstream repository: <https://github.com/NanmiCoder/dsh-agent-teams>.

## License

This fork **inherits the upstream MIT license**. The original author's copyright notice and license text are fully preserved in [`LICENSE`](LICENSE); new code in this fork is also released under MIT — please retain the original author's attribution when redistributing (see [`NOTICE.md`](NOTICE.md)).

---

<sub>dsh-agent-teams companion fork · Based on upstream v0.1.22 · DSH ≥ 0.2.0-rc.2 · Node ^22.19.0 || >=24 · Original author <b>程序员阿江 (Relakkes / @NanmiCoder)</b></sub>
