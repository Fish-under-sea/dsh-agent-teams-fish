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

Fifteen vendors × ten role avatars and fifteen vendor brand marks **ship inside the package** — they work out of the box; swapping the entire art style is still just one custom directory away, with zero changes to animation code.

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
| Vendor-generic portrait fallback | When the vendor is recognized but the role-specific art is missing, `member-<vendor>-v2.png` is tried first, then packaged assets | `src/client/artwork.ts` |
| Tightened cache policy | When `artworkDir` is configured, all artwork responses use `no-store` (previously packaged assets used `max-age=86400`, causing "changed the image but it looks the same") | `src/index.ts` |
| High-resolution preview family (2026-10-08) | List thumbnails remain 256 PNG; click-to-enlarge uses the **original-resolution** artwork after background removal (role/captain at 1024×1024, vendor portraits with long edge ≤2048), encoded as WebP quality 92 with alpha — the full set of 125 HD images totals ~19 MB, whereas PNG at the same resolution would be ~125 MB | `assets/agent-teams/` |
| Second-round vendor assets (2026-10-08) | Vendor namespace expanded from 9 → 15; vendor assets from 108 → 265 files; `audio` / `video` role buckets (previously registered but without art) completed for 10 vendors; assets split into two tiers: the first 10 vendors have full "vendor × role" sets, the remaining 5 have only generic portraits and HD portraits | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs` |
| Route-chain unit tests | 20 unit tests covering: degradation chain order, unknown vendor rejection, non-`.png` request rejection, path traversal rejection, packaged extension probing | `scripts/custom-artwork.test.mjs` [new] |
| Bilingual README ([0.4.0](release-notes/v0.4.0.md)) | Added [`README.en.md`](README.en.md) as an English counterpart, with sections matching the Chinese version one-to-one | `README.md` · `README.en.md` |
| **Refined vendor matching + two systemic fixes** ([0.4.1](release-notes/v0.4.1.md)) | ① A trailing `\b` blocked "name + digits" ids: `hunyuan3` / `rwkv7` / `seed1.6` / `abab6.5s` / `chatglm3-6b` all failed to match; ② **`\b` never holds next to CJK** (JS `\w` is ASCII-only), so the Chinese aliases 混元 / 通义 / 智谱 / 豆包 / 文心 / 千帆 were **dead branches all along**. This release closes **18 misses** — the hunyuan `hy` family (`hy3` / `hy-3` / `hy_1.5`), minimax (`abab6.5s` / `hailuo`), the mistral family (`magistral` / `pixtral` / `voxtral` / `ministral`), qwen (`qwq`) and more — with zero false positives (`hypothesis` / `hybrid-1` / `hyperbolic` / `orchestral-music` / `metadata-model` still do not match) | `src/client/artwork.ts` · `scripts/artwork-role-match.test.mjs` |
| **Captain avatar follows the route** ([0.4.2](release-notes/v0.4.2.md)) | The captain image used to be a hard-coded constant `team-lead-deepseek-v2.png`, so a captain running qwen / claude / glm still requested the DeepSeek one — the **other 9 packaged captain images were unreachable**. The root cause was the host side: `team.json` recorded only `captainSessionId`, never the captain's model route. Team creation now writes `captainProvider` / `captainModel`, the snapshot exposes them (live value wins), and the panel uses the same vendor detection as members | `src/client/artwork.ts` · `src/tools.ts` · `src/snapshot.ts` · `src/types.ts` |

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
  "dsh-agent-teams-fish": "^0.4.2"
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

- **Vendor tokens (15)**: `deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` `meta` `mistral` `rwkv` `seed` `ernie`
- **Role tokens (10)**: `engineer` `qa` `security` `researcher` `designer` `docs` `data` `operator` `audio` `video` (captain is separate)
- Custom directory filenames may omit the `-v2` suffix; extension priority: `.png` `.webp` `.jpg` `.jpeg` `.gif` `.svg`
- **The client always requests `.png` names** (`member-…-v2.png` / `…-full-v2.png`); the `member-` and `team-lead-` families **probe extensions in order** (as listed above), so the packaged `.webp` HD images can directly answer `.png` requests. Brand marks (`brand-…svg` → `brand-…png` → `brand.svg` → `brand.png`) and activity images keep strict candidate names.

> **Why the HD family uses WebP**: for the same 1024×1024 image, PNG is about **0.9 MB** (110 images would total ~125 MB), while quality-92 WebP is only **~130 KB** (125 HD images total **~19 MB**). The preview frame is only 320px wide — the two encodings are visually indistinguishable, and `<img>` handles both identically (`content-type` is determined by the actual extension that matches).

### Packaged Assets (since [0.3.1](release-notes/v0.3.1.md); vendor assets refreshed on 2026-10-08 with HD family added)

`assets/agent-teams/` contains **280 files / ~28.6 MB**: 15 built-in whale baselines (captain / 8 roles / 6 actions) + **265 vendor assets**.

| Family | Count | Spec |
|--------|:-----:|------|
| `member-<vendor>-<role>-v2.png` | 10 × 10 = 100 | 256×256 8-bit RGBA |
| `member-<vendor>-<role>-full-v2.webp` | 10 × 10 = 100 | 1024×1024 RGBA WebP |
| `member-<vendor>-v2.png` | 15 | 256×256 8-bit RGBA |
| `member-<vendor>-full-v2.webp` | 15 | Portrait, long edge 1897–2048 |
| `team-lead-<vendor>-v2.png` | 10 | 256×256 8-bit RGBA |
| `team-lead-<vendor>-full-v2.webp` | 10 | 1024×1024 RGBA WebP |
| `brand-<vendor>.svg` | 15 | Inline path, fully offline (no external links, no scripts) |

> Vendor assets come in two tiers: `deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` — these 10 have full "vendor × role" sets (avatars + HD) and captain art; `meta` `mistral` `rwkv` `seed` `ernie` have only vendor-generic avatars and HD portraits — role requests fall back through `member-<vendor>-v2.png` (the 3rd hop in the degradation chain, never 404s).

> ⚠️ **The packaged directory only recognizes names in the candidate chain (with `-v2`)**: `member-qwen-qa.png` in `artworkDir` can hit via alias fallback, but the packaged directory does not perform this alias fallback. The import script uniformly adds `-v2` — manually copying files without the suffix into the package causes "the file is clearly there, but the request always misses." `pnpm verify` now asserts all 265 files with their dimensions and formats (including encoding and alpha for both families).

### Degradation Chain (no broken images)

```text
Request: member-qwen-qa-v2.png
  ├─ 1. member-qwen-qa-v2.png     Vendor + role (packaged)
  ├─ 2. member-qa-v2.png          Role-generic
  ├─ 3. member-qwen-v2.png        Vendor-generic (packaged)
  └─ 4. Built-in whale assets
```

Requests with `-full` additionally list the non-full variant of the same name (so clicking to enlarge works even without a dedicated portrait); the packaged HD family is `.webp`, which the host discovers via extension probing, so "list thumbnail + click-to-enlarge HD" share a single request name. Brand chain: `brand-<vendor>.svg → brand-<vendor>.png → brand.svg → brand.png` — when none exist, the frontend automatically falls back to the activity state image.

### Vendor Identification Rules

Lowercase regex matching against `provider + model` concatenated:

| Token | Matches | Token | Matches |
|-------|---------|-------|---------|
| `deepseek` | deepseek | `gemini` | gemini / gemma / google |
| `qwen` | qwen / tongyi / 通义 | `grok` | grok / xai / x.ai |
| `glm` | chatglm / glm / zai / z.ai / 智谱 | `gpt` | gpt / chatgpt / openai / codex |
| `kimi` | kimi / moonshot | `hunyuan` | hunyuan / 混元 / tencent |
| `claude` | claude / anthropic | `minimax` | minimax / mini-max / abab |
| `meta` | meta / llama | `mistral` | mistral\* / mixtral / codestral / devstral |
| `rwkv` | rwkv | `seed` | seed / doubao / 豆包 / bytedance / volcengine / volces |
| `ernie` | ern\* / wenxin / 文心 / baidu / qianfan / 千帆 | | |

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
├── assets/                              Art (15 built-in whale images + 265 vendor assets [including HD WebP] + readme/hero.svg)
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
| **Captain does not follow model routing** | The panel snapshot (`TeamActivitySnapshot`) only carries members' `provider/model`, not the captain's; the host can access the captain's route but it's not included in the snapshot. So the captain uses file override; automatic following would require adding a field to the snapshot |
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
