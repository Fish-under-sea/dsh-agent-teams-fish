<div align="center">

# dsh-agent-teams-fish

**AgentTeams 插件的补充版 —— 让团队头像跟着「哪家模型」走**

[![npm](https://img.shields.io/npm/v/dsh-agent-teams-fish?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-agent-teams-fish)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?style=flat-square)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-4b6ef6?style=flat-square)
![plugin](https://img.shields.io/badge/plugin-client%20%2B%20host-6b7280?style=flat-square)

**简体中文** · [English](README.en.md)

</div>

---

十五个厂商 × 十个岗位的头像、十五个厂商商标徽标**随包自带** —— 装上就有；想换画风仍是一个自定义目录的事，不改一行动画代码。

## 目录

- [原作者与授权（请先读）](#原作者与授权请先读)
- [上游插件做什么](#上游插件做什么)
- [本版新增了什么](#本版新增了什么)
- [安装与启用](#安装与启用)
- [配置](#配置)
- [美术系统](#美术系统)
- [开发与测试](#开发与测试)
- [目录结构](#目录结构)
- [已知限制与踩过的坑](#已知限制与踩过的坑)
- [更多文档](#更多文档)
- [致谢](#致谢)
- [许可](#许可)

---

## 原作者与授权（请先读）

| 项目 | 内容 |
|------|------|
| 插件名 | **dsh-agent-teams**（把一次 DeepSeek Harness 会话变成可协作的多智能体团队） |
| 原作者 | **程序员阿江（Relakkes）** · GitHub [@NanmiCoder](https://github.com/NanmiCoder) · relakkes@gmail.com |
| 原仓库 | <https://github.com/NanmiCoder/dsh-agent-teams> |
| 上游 npm 包名 | `@nanmicoder/dsh-agent-teams`（**归原作者，本版不能沿用**） |
| 本版 npm 包名 | **`dsh-agent-teams-fish`** |
| 许可证 | **MIT**，版权归原作者（本仓库 [`LICENSE`](LICENSE) **未做任何修改**） |
| 本版基线 | 上游 tag `v0.1.22`（commit `9cba4fe`） |
| 本版性质 | **补充版（fork）**，非原创、非官方；上游原始 README 完整保留为 [`README.original.md`](README.original.md) / [`README_ZH.original.md`](README_ZH.original.md) |

> 署名与新增范围的完整说明见 **[`NOTICE.md`](NOTICE.md)**。再分发时请保留原作者署名。

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="上游插件的宣传图（来自上游仓库）">
</p>

## 上游插件做什么

上游把 DSH 的单会话扩展成一支**有编制的团队**：建花名册、排任务 DAG（`dependencies` 表达前置关系）、按依赖调度、质量门（requirements → implementation → verification → review → repair → integration）、成员信箱与右侧「团队协作」面板。

本版**没有动这套协作逻辑**，只补「这支队看起来长什么样」。

## 本版新增了什么

| 能力 | 说明 | 主要文件 |
|------|------|---------|
| 自定义美术目录 | 新增 `artworkDir` 配置。配置后自定义图片优先于随包素材；且**只放行已知文件名**（未知文件名、`..`、绝对路径一律 404） | `src/artwork-source.ts`〔新增〕· `src/index.ts` |
| 厂商素材随包分发（[0.3.1](release-notes/v0.3.1.md)） | 厂商头像与商标 SVG 进包，装完即有，不再依赖某台机器上的外部目录 | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs`〔新增〕 |
| 包内素材按扩展名给 MIME（[0.3.2](release-notes/v0.3.2.md)） | 内置素材里也有 `brand-<vendor>.svg`；[0.3.1](release-notes/v0.3.1.md) 把包内素材一律当 `image/png` 发送，浏览器解码 SVG 失败后徽标静默回落成活动状态图 —— 现在按扩展名推断 | `src/artwork-source.ts` · `src/index.ts` |
| 厂商头像命名空间 | 头像名从「岗位」扩展为「厂商 + 岗位」：`member-<vendor>-<role>-v2.png`；识别不出厂商时自动回落到岗位通用图 | 同上 · `src/client/artwork.ts` |
| 厂商识别 | 从成员的 `provider + model` 路由推断厂商 —— `bailian` 一家同时供 qwen 与 deepseek，所以**以 model 为准** | `src/client/artwork.ts` |
| 厂商商标徽标 | 头像右下角 22px 徽标从「活动状态图」换成「厂商商标 SVG」（`brand-<vendor>.svg`）；文件缺失时 `onError` 自动换回活动图，**不会破图** | 同上 · `ActivityPanel.tsx` · `ActivityPanel.module.css` |
| 中文岗位名 | 面板与卡片里的岗位标签显示中文（工程师、测试、安全、研究员、设计、文档、数据、运营、音频、视频） | `src/client/locales.ts` |
| 点击放大 | 点头像出 320px 大图预览（`-full` 文件缺失时自动降级到头像图），Esc 或点背景关闭 | `ActivityPanel.tsx` |
| 队长头像 | 队长不跟随模型路由，改为 `team-lead-<vendor>.png` 优先、`team-lead-v2.png` 兜底的文件覆盖；并**改请求全新 URL** 规避浏览器 24h 缓存 | `src/client/artwork.ts` |
| 厂商通用大图兜底 | 识别出厂商但岗位图缺失时，先尝试 `member-<vendor>-v2.png` 厂商通用图，再回落到随包素材 | `src/client/artwork.ts` |
| 缓存策略收紧 | 只要配了 `artworkDir`，美术资源一律 `no-store`（原来打包图带 `max-age=86400`，会造成「换了图看着没换」） | `src/index.ts` |
| 高清预览族（2026-10-08） | 列表小图仍是 256 PNG；点击放大改用**去背后的原分辨率**画面（岗位/队长 1024×1024、厂商立绘长边 ≤2048），编成 WebP 质量 92 带 alpha —— 整套 125 张高清合计 ~19 MB，PNG 同分辨率要 ~125 MB | `assets/agent-teams/` |
| 第二轮厂商素材（2026-10-08） | 厂商命名空间 9 → 15，厂商素材 108 → 265 张；`audio` / `video` 两个此前只登记未出图的岗位桶补齐（10 个厂商）；素材分两档：前 10 个厂商有「厂商 × 岗位」全套，后 5 个只有通用图与立绘 | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs` |
| 路由链单测 | 新增 20 条单测：降级链顺序、未知厂商拒绝、非 `.png` 请求拒绝、路径穿越拒绝、包内扩展名探测 | `scripts/custom-artwork.test.mjs`〔新增〕 |
| 中英双语 README（[0.4.0](release-notes/v0.4.0.md)） | 新增 [`README.en.md`](README.en.md) 英文对照版，章节与中文版一一对应 | `README.md` · `README.en.md` |
| **厂商识别细化 + 两处系统性修复**（[0.4.1](release-notes/v0.4.1.md)） | ① 尾随 `\b` 卡住「名字 + 数字」的 id：`hunyuan3` / `rwkv7` / `seed1.6` / `abab6.5s` / `chatglm3-6b` 全都匹配不上；② **`\b` 对 CJK 永远不成立**（JS 的 `\w` 只含 ASCII），中文别名「混元 / 通义 / 智谱 / 豆包 / 文心 / 千帆」此前**全是死分支**。本次补齐混元 `hy` 家族（`hy3` / `hy-3` / `hy_1.5`）与 minimax（`abab6.5s` / `hailuo`）、mistral 家族（`magistral` / `pixtral` / `voxtral` / `ministral`）、qwen（`qwq`）等共 **18 处漏命中**，且 0 误伤（`hypothesis` / `hybrid-1` / `hyperbolic` / `orchestral-music` / `metadata-model` 仍不命中） | `src/client/artwork.ts` · `scripts/artwork-role-match.test.mjs` |

## 安装与启用

### 方式一：从 npm 安装（推荐）

```sh
# 装进某个 profile —— dsh plugin 会做 pnpm 安装并把本包对账进 bundles 层
# profile 名：桌面 = desktop，Web = web
dsh plugin --profile <profile> add dsh-agent-teams-fish
```

> 装完**重启 DSH**。宿主代码改动必须重启；纯客户端包改动刷新页面即可。

也可以手工写进 `profiles/<profile>/package.json`：

```jsonc
"dependencies": {
  "dsh-agent-teams-fish": "^0.4.1"
}
```

### 方式二：本地 link 源码（改源码用）

```jsonc
// profiles/<profile>/package.json
"dependencies": {
  "dsh-agent-teams-fish": "link:<本仓库路径>"
}
```

> 不要用 `file:` —— pnpm 会把目录依赖当无哈希缓存，改了源码重装也不更新。

### 方式三：从 GitHub 安装

```jsonc
"dependencies": {
  "dsh-agent-teams-fish": "github:Fish-under-sea/dsh-agent-teams-fish"
}
```

> 本版 npm 包名是 **`dsh-agent-teams-fish`**：上游包名 `@nanmicoder/dsh-agent-teams` 属于原作者，本版无法沿用。
> 改名会牵动三处必须一致 —— `package.json` 的 `name`、`cordis.patch.yml` 的插件行 `name`、客户端包的注册 `id`（不一致会报 `loaded without registering`）。

## 配置

在 `profiles/<profile>/cordis.patch.yml` 里启用插件。厂商素材已经**随包分发**，`artworkDir` 只在你想整套换图时才需要：

```yaml
- insert:
    - id: agent-teams
      name: 'dsh-agent-teams-fish'
      config:
        stateDir: .agent-teams
        memberProvider: spawn
        # 可选：一个目录即可整套覆盖随包素材（不配就用包内 15 厂商素材）
        artworkDir: <你的美术目录绝对路径>
```

| 配置键 | 说明 | 默认值 |
|--------|------|--------|
| `stateDir` | 团队状态目录（相对于会话工作区） | `.agent-teams` |
| `memberProvider` | 成员子代理的创建方式（`spawn` / `fork`） | `spawn` |
| `artworkDir` | **可选**：自定义美术素材目录的绝对路径；配了就整套覆盖随包素材（含厂商图） | 无（用包内素材） |

> 配置目录**只在启动时读一次**；之后换图不用重启（自定义图片走 `no-store`）。
> ⚠️ `artworkDir` 是**本机绝对路径**：换机器或换用户名后它不再成立，插件会静默回落到随包素材。[0.3.1](release-notes/v0.3.1.md) 之前包里没有厂商图，这次回落就表现为「整队变回内置鲸鱼头像」；现在包里自带厂商素材，跨机器不需要再配它。

## 美术系统

### 命名契约

| 文件名 | 用途 | 面板尺寸 / 规格 |
|--------|------|:--------:|
| `member-<vendor>-<role>-v2.png` | 某厂商某岗位的成员头像（列表用小图） | 40px（卡片 24px）· 256×256 PNG |
| `member-<vendor>-<role>-full-v2.webp` | 点开后的高清图（岗位级） | 320px 框 · 1024×1024 WebP |
| `member-<role>-v2.png` | 不区分厂商的岗位通用图 | 40px · 256×256 PNG |
| `member-<vendor>-v2.png` | 厂商通用头像（识别出厂商但岗位图缺失时兜底） | 40px · 256×256 PNG |
| `member-<vendor>-full-v2.webp` | 厂商通用立绘高清（兜底大图） | 320px 框 · 长边 ≤2048 WebP |
| `team-lead-<vendor>-v2.png` · `team-lead-v2.png` | 队长头像（前者优先） | 44px · 256×256 PNG |
| `team-lead-<vendor>-full-v2.webp` | 队长点开后的高清图 | 320px 框 · 1024×1024 WebP |
| `brand-<vendor>.svg` | 头像右下角的厂商商标 | 22px · 单色内联 path |
| `action-*-v2.png` | 未识别厂商时徽标用的活动状态图 | 22px |

- **厂商 token（15）**：`deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` `meta` `mistral` `rwkv` `seed` `ernie`
- **岗位 token（10）**：`engineer` `qa` `security` `researcher` `designer` `docs` `data` `operator` `audio` `video`（队长单列）
- 自定义目录里的文件名可省略 `-v2`；扩展名优先级 `.png` `.webp` `.jpg` `.jpeg` `.gif` `.svg`
- **客户端请求的永远是 `.png` 名字**（`member-…-v2.png` / `…-full-v2.png`）；`member-` / `team-lead-` 两个族的候选名会**按上表顺序探测扩展名**，所以随包的 `.webp` 高清图能直接应答 `.png` 请求。商标（`brand-…svg` → `brand-…png` → `brand.svg` → `brand.png`）与活动状态图保持严格候选名。

> **为什么高清族用 WebP**：同一个 1024×1024 画面，PNG 约 **0.9 MB**（整套 110 张要 ~125 MB），质量 92 的 WebP 只要 **~130 KB**（整套 125 张高清合计 **~19 MB**）。预览框只有 320px 宽，两种编码肉眼看不出差别，而 `<img>` 对两者一视同仁（`content-type` 由实际命中的扩展名给出）。

### 随包素材（[0.3.1](release-notes/v0.3.1.md) 起；厂商素材于 2026-10-08 换成新一批并加入高清族）

`assets/agent-teams/` 共 **280 个文件 / 约 28.6 MB**：15 张内置鲸鱼基线（队长 / 8 岗位 / 6 动作）+ **265 张厂商素材**。

| 族 | 数量 | 规格 |
|----|:---:|------|
| `member-<vendor>-<role>-v2.png` | 10 × 10 = 100 | 256×256 8-bit RGBA |
| `member-<vendor>-<role>-full-v2.webp` | 10 × 10 = 100 | 1024×1024 RGBA WebP |
| `member-<vendor>-v2.png` | 15 | 256×256 8-bit RGBA |
| `member-<vendor>-full-v2.webp` | 15 | 竖幅，长边 1897–2048 |
| `team-lead-<vendor>-v2.png` | 10 | 256×256 8-bit RGBA |
| `team-lead-<vendor>-full-v2.webp` | 10 | 1024×1024 RGBA WebP |
| `brand-<vendor>.svg` | 15 | 内联 path、离线自洽（无外链、无脚本） |

> 厂商素材分两档：`deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` 这 10 个有「厂商 × 岗位」全套图（头像 + 高清）与队长图；`meta` `mistral` `rwkv` `seed` `ernie` 只有厂商通用头像与立绘高清，岗位请求沿 `member-<vendor>-v2.png` 兜底（降级链第 3 跳，不会 404）。

> ⚠️ **内置目录只认候选链里的名字（带 `-v2`）**：`artworkDir` 里的 `member-qwen-qa.png` 能靠别名回退命中，但包内目录不做这层别名回退。所以导入脚本会统一补 `-v2` —— 手工把不带后缀的文件复制进包，会出现「文件明明在包里，请求却永远落空」。`pnpm verify` 现在逐条断言这 265 张与它们的尺寸、格式（含两族的编码与 alpha）。

### 降级链（不会出现破图）

```text
请求 member-qwen-qa-v2.png
  ├─ 1. member-qwen-qa-v2.png     厂商 + 岗位（随包）
  ├─ 2. member-qa-v2.png          岗位通用
  ├─ 3. member-qwen-v2.png        厂商通用（随包）
  └─ 4. 内置鲸鱼素材
```

带 `-full` 的请求会额外列出同名的非 full 版本（没画立绘也能点开放大）；随包的高清族是 `.webp`，宿主按扩展名探测到它，所以「列表用小图 + 点开用高清图」共用一条请求名。商标链：`brand-<vendor>.svg → brand-<vendor>.png → brand.svg → brand.png`，全都没有时前端自动换回活动状态图。

### 厂商识别规则

用 `provider + model` 拼起来做小写正则匹配：

| token | 命中 | token | 命中 |
|-------|------|-------|------|
| `deepseek` | deepseek | `gemini` | gemini / gemma / google |
| `qwen` | qwen / tongyi / 通义 | `grok` | grok / xai / x.ai |
| `glm` | chatglm / glm / zai / z.ai / 智谱 | `gpt` | gpt / chatgpt / openai / codex |
| `kimi` | kimi / moonshot | `hunyuan` | hunyuan / 混元 / tencent |
| `claude` | claude / anthropic | `minimax` | minimax / mini-max / abab |
| `meta` | meta / llama | `mistral` | mistral\* / mixtral / codestral / devstral |
| `rwkv` | rwkv | `seed` | seed / doubao / 豆包 / bytedance / volcengine / volces |
| `ernie` | ern\* / wenxin / 文心 / baidu / qianfan / 千帆 | | |

### 制作流水线（本版美术怎么来的）

| 步骤 | 做法 |
|------|------|
| 角色图 | Q 版立绘 → 白底去背（flood fill 阈值 238 + 边缘收缩）→ 裁到实心包围盒 → 8% 内边距 → **256×256 RGBA**（立绘 512×512） |
| 商标 | simple-icons / Iconify `thesvg` → 单色 path + 各厂商品牌色 `fill` → **等视觉内缩归一化** |
| 归一化为什么必要 | 多数商标的墨迹**顶到 viewBox 边缘**，塞进 22px 圆盘（3px 内边距）会被边缘挤住、大小看着不一；统一缩到墨迹框 **0.854** 后视觉大小一致 |
| 导入进包 | `pnpm import:artwork --from <素材目录> --apply` —— 统一补 `-v2` 后缀、跳过 `.md` 与 1×1 占位图、不覆盖内置队长基线 |
| 工具 | `render-svgs.mjs`（SVG→PNG，肉眼审图）· `normalize-brands.mjs`（归一化，回读真实栅格验证） |
| **2026-10-08 换图** | 厂商通用图 / 立绘 ← 15 张全身立绘；厂商 × 岗位图与队长图 ← 10 个厂商 × 11 张 Q 版立绘。同一套去背口径，另加两步：5×5 盒式模糊抹平 JPEG 噪点后再洪水填充、连通域去斑（小于万分之零点五的孤立前景判为噪点）—— MJPG 源的白底杂斑曾把墨迹框撑到满幅 |
| **徽标补齐** | 新增 6 个厂商的商标：simple-icons（`minimax` / `meta` / `mistralai`）+ LobeHub icons（`rwkv` / `bytedance` / `wenxin`）→ 单色 path + 厂商品牌色 → 与既有 9 个用**同一个**归一化目标框（墨迹框最大边缩到 0.84×24、居中；既有 9 个实测中位残差 0.026） |
| **2026-10-08 高清族** | 列表小图仍是 256 PNG；点开的高清图**直接用去背后的原分辨率画面**：岗位/队长放在 1024×1024 画布上按 **1:1 原生像素居中**（不重采样、不放大），厂商立绘按**长边 ≤2048** 面积平均缩放。全部编成 **WebP `-quality 92`**（`-pixel_format rgba`、带 alpha），整套 125 张合计 19 MB；PNG 同分辨率会到 125 MB。原 512 PNG 立绘被高清 WebP 取代 —— 同名族的扩展名优先级是 `.png` 优先，留着 PNG 会让高清永远轮不到 |

## 开发与测试

```sh
pnpm install

pnpm typecheck                                          # tsc 双工程（宿主 + 客户端）
pnpm build                                              # 构建 lib/ 与素材指纹
pnpm exec node --test scripts/custom-artwork.test.mjs   # 20 条路由链单测

pnpm import:artwork --from <素材目录>                    # 预演：列出将写入的文件与改名
pnpm import:artwork --from <素材目录> --apply            # 真正写入 assets/agent-teams/
```

## 目录结构

```text
dsh-agent-teams-fish/
├── src/
│   ├── index.ts                         插件入口：artworkDir 配置、资产路由（含按扩展名探测）、no-store 策略
│   ├── artwork-source.ts                【本版新增】slug 语法、降级链、自定义/包内目录查找
│   └── client/
│       ├── artwork.ts                   厂商/岗位识别与美术 URL 构建
│       ├── ActivityPanel.tsx            团队面板：成员头像、徽标、点击放大、队长头像
│       ├── ActivityPanel.module.css
│       ├── AgentTeamsCard.tsx           会话卡片头像
│       └── locales.ts                   中英文案（含中文岗位名）
├── scripts/
│   ├── custom-artwork.test.mjs          【本版新增】20 条路由链单测（含包内扩展名探测）
│   └── import-vendor-artwork.mjs        【随包新增】厂商素材导入（补 -v2 后缀，跳过占位图）
├── lib/                                 构建产物（随仓库跟踪，DSH 实际加载的就是它）
├── assets/                              素材（15 张内置鲸鱼图 + 265 张厂商素材〔含高清 WebP〕+ readme/hero.svg）
├── README.md                            本文件（本版重写）
├── README.en.md                         英文对照版
├── README.original.md                   上游英文 README（原样保留）
├── README_ZH.original.md                上游中文 README（原样保留）
├── NOTICE.md                            来源与署名
├── LICENSE                              上游 MIT 许可证（未修改）
└── CONTRIBUTING.md                      上游贡献指南
```

## 已知限制与踩过的坑

| 项 | 实际情况 |
|----|---------|
| **队长不跟随模型路由** | 面板快照（`TeamActivitySnapshot`）里只有成员的 `provider/model`，没有队长的；宿主能取到队长路由但没进快照。所以队长用文件覆盖，想自动跟随需给快照加字段 |
| **打包同名 URL 会被浏览器缓存 24h** | 打包图带 `max-age=86400`：某 URL 先请求过一次打包图，之后再放自定义文件，浏览器 24h 内不会重新请求，看着就像「改了没生效」（队长真踩过）。现已双重规避：队长改请求**全新 URL** + 配了目录就一律 `no-store` |
| **内置同名文件的硬刷新例外仍在** | 替换「同时也随插件发布」的文件名（`team-lead-v2.png`、`member-<role>-v2.png`、`action-*.png`）第一次需 `Ctrl+Shift+R` 挤掉旧缓存。厂商命名空间（`member-<vendor>-*-v2.png`、`brand-<vendor>.svg`）是 [0.3.1](release-notes/v0.3.1.md) 才进包的新 URL，浏览器从没见过，不受这段缓存影响 |
| **高清族上线时的同 URL 缓存**（2026-10-08） | 升级前 `member-<vendor>-*-full-v2.png` 请求会被宿主解析成 256 头像并在浏览器里按 `max-age=86400` 存 24h；升级后同一 URL 可能还吐旧字节。**没配 `artworkDir` 的机器**第一次升级后硬刷新一次即可（配了的走 `no-store`，不受影响） |
| **徽标的媒体类型（[0.3.2](release-notes/v0.3.2.md) 修）** | 内置素材里同样有 SVG，但 [0.3.1](release-notes/v0.3.1.md) 的宿主端把**包内**素材一律当 `image/png` 发送 → 浏览器解码失败 → 徽标 `onError` 回落活动图，看起来就像「SVG 没进包」；配了 `artworkDir` 的机器不受影响（那条分支本来就按扩展名推断）。现在两条路径共用同一张扩展名表（`member-` / `team-lead-` 族按扩展名探测，商标与活动图保持严格候选名），并有门禁断言每个 `brand-<vendor>.svg` 以 `image/svg+xml` 送达、高清 WebP 以 `image/webp` 送达 |
| **`artworkDir` 不可移植** | 它是本机绝对路径，且插件按进程工作目录解析。换机器后若目录不存在，查找链直接落到随包素材 —— [0.3.1](release-notes/v0.3.1.md) 之前这一步就是「厂商头像集体消失」的现场 |
| **`lib/` 是构建产物** | 与上游一致随仓库跟踪（便于 GitHub 直装），所以一次构建的 diff 较大。`package.json` 只改身份字段：包名换成 `dsh-agent-teams-fish`、`repository`/`homepage`/`bugs` 指向本仓库，**版本与 `author` 保持上游不变**；改名会牵动插件行与客户端注册名，装机时 profile 要同步改 |
| **未跑上游发布校验** | 上游 `verify:release` / `verify:compatibility` 等脚本校验的是上游仓库元数据，本版未逐一执行 |
| **工具链坑** | 本环境下 `& "DSH Desktop Beta.exe" script.mjs`（`ELECTRON_RUN_AS_NODE=1`）**不阻塞**：它写出的文件可能落在后续命令之后。把「归一化 → 复制 → 渲染」串起来时必须显式等待，否则会读到旧副本 |
| **实测环境** | Windows 10/11 + PowerShell 5.1 + Node `^22.19.0 \|\| >=24`；`pnpm build` 需要已装依赖 |

## 更多文档

| 文档 | 内容 |
|------|------|
| [`NOTICE.md`](NOTICE.md) | 来源与署名（原作者、基线、新增范围、美术素材版权） |
| [`README.original.md`](README.original.md) | 上游英文 README（原样保留，含完整功能说明） |
| [`README_ZH.original.md`](README_ZH.original.md) | 上游中文 README（原样保留） |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 上游贡献指南 |
| [`LICENSE`](LICENSE) | 上游 MIT 许可证 |

## 致谢

感谢上游原作者 **程序员阿江（Relakkes / @NanmiCoder）** 创建了 dsh-agent-teams 插件，为本版提供了完整的团队协作基座。本版只在其基础上补充了美术系统相关能力。上游原始仓库：<https://github.com/NanmiCoder/dsh-agent-teams>。

## 许可

本版**继承上游 MIT**。原作者的版权声明与许可证原文完整保留在 [`LICENSE`](LICENSE)，本版新增代码同样以 MIT 发布 —— 再分发时请保留原作者署名（见 [`NOTICE.md`](NOTICE.md)）。

---

<sub>dsh-agent-teams 补充版 · 基于上游 v0.1.22 · DSH ≥ 0.2.0-rc.2 · Node ^22.19.0 || >=24 · 原作者 <b>程序员阿江（Relakkes / @NanmiCoder）</b></sub>
