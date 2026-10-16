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

> **[0.7.2](release-notes/v0.7.2.md)（2026-10-17）**：修复 DSH `0.2.1-alpha.2` 上「计划已批准、任务却始终无法派发」的问题。
>
> - **根因**：新版宿主以 `startActivation` 取代 `startContinuable`，旧委派守卫却给不存在的方法套上包装，最终抛出 `Cannot read properties of undefined (reading 'call')`。此前仅补齐宿主版本白名单，未覆盖这条真实启动路径。
> - **修复**：按宿主实际能力选择启动接口；新版明确使用 `delivery: 'parent'`，保留持久成员、父会话通知及冷恢复语义。委派守卫只包装真实存在的方法，并覆盖新版入口；停止、重派和归档统一适配 `drainChildren`，旧宿主仍走原接口。
> - **权限边界不变**：成员工具限制、委派深度预算、已退出成员与停机状态的准入检查继续生效；热重载后恢复原方法，不伪造旧 API。
> - **模型选择**：成员最终路由和备用路由必须属于当前会话捕获的子代理模型白名单。即使省略模型参数，也不会继承白名单外的队长模型；越界时在创建子会话前明确拒绝，不擅自切换模型。无此策略的旧宿主保持原有选择行为。
> - **回归与实测**：新增仅有新版 API 的启动用例、委派守卫与热重载回归、会话模型策略及真实 Cordis 可选服务读取回归，以及 `--activation-harness` 生命周期矩阵。本机 DSH `0.2.1-alpha.2` 已实际完成建队审批、成员领取、32/32 测试、回报和归档；原始请求头确认使用预选 Qwen 路由与 `low` 推理档位。升级后需重启 DSH；无需迁移团队记录。
>
> **🆕 [0.7.1](release-notes/v0.7.1.md)（2026-10-16）**：**修复「可选字段填空串就建不起团队」** —— 内联计划的 `tool_policy` / `provider` / `model` / `reasoning_effort` / `role` 填 `""` 或纯空白时，不再报 `must not be empty`，改按**未提供**处理。
>
> - **症状**：某会话 `agent_teams_create` 连续失败 **34 次、0 次成功**，另一个 **14 次、0 次成功**，代理一个都没启动；报错在 `profiles.inline-plan.members[0].tool_policy must not be empty` 与 `unknown tool policy "default"` 之间反复。
> - **根因**：队长模型习惯把**每个可选参数都填成空字符串**而不是省略（模型自述 "the tools I need require all parameters, even the optional ones"），而插件**两条路径口径不一致** —— `add_member` / `edit_plan` 走 `trimmedOptional` 把 `""` 洗成 `undefined`（放行），内联计划走 `optionalNonEmptyString`（必抛）。顶层 `profile` 早有空串归一（issue #99），内联计划内部字段漏了。
> - **修法**：只改 `src/profiles.ts` 的 `optionalNonEmptyString` 一处 —— 空串/纯空白返回 `undefined`。**必填字段一律不动**（`name` / `id` / `subject` / `fallback.provider|model` / 依赖 id 照旧严格，非字符串照旧是硬错误）。
> - **回归**：新增 `scripts/inline-plan-blank-optional-tdd.mjs`（已挂进 `pnpm verify`），**23/23 全绿**，其中 7 条钉住必填字段仍然抛错。
> - **附带澄清**：失败会话里 `subagent` 系工具**一次都没被调用过**（70/70 个请求都挂着该工具）——「调不动子代理」的真实形态是模型没有发起；修掉空串习惯后 `list_subagent_models` 一类调用不再被 `` `provider` must be non-empty `` 打回。
> - **附带修复**：`#161` 判决漂移检测的毫秒容差 `1ms` 小于实测的跨时钟偏移（Windows 上最坏 2.2ms），于是「判决前写好的文件」会被误判成「判决后被改」——测试前置断言约 **57.75%** 概率失败；容差提到 **4ms** 后 400 轮探针 **0/400**、测试连跑 **10/10** 全绿，并补了两个**确定性**回归用例（不依赖真实时钟）。另把三处符号链接用例改为共享运行时探测 `scripts/symlink-support.mjs`：Windows 无开发者模式时按明确原因跳过（原来硬编码或漏跳过，在该类主机上必红），有权限时仍跑完整覆盖。
>
> **🆕 [0.7.0](release-notes/v0.7.0.md)（2026-10-12）**：厂商命名空间 **17 → 18**，新增 **MiMo（小米 MiMo）**。
>
> - **档位**：与 `meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev` 同档 —— 只有「厂商通用图 + 立绘高清」，**没有 Q 版岗位图**。成员请求 `member-mimo-<role>-v2.png` 时第 1 跳落空，**第 2 跳命中自家厂商角色**（链序自 [0.5.1](release-notes/v0.5.1.md) 起为 `vendor+role → vendor → role`），头像照常显示、不破图。
> - **识别规则**：`mimo` / `mimo-*`（`mimo-v2` / `MiMo-7B` / `mimo-vl`）/ `xiaomi` / 小米。**边界是这条规则的主要难点**：`mimo` 与 `minimax` / `mistral` 同以 `mi` 开头，放宽成裸 `\bmi[\w.-]*` 会把这两家整片吞掉；而宽松的 `\bmimo[\w.-]*` 又会误吞 `mimosa` / `mimolette` 这类普通英文词。规则因此要求 `mimo` 后**是词边界或分隔符** —— MiMo 的真实 ID 一律带分隔符，收紧不会漏掉真实 ID。正反两组边界都有单测钉住。
> - **素材**：新增 3 个文件（256×256 RGBA 头像 + alpha WebP 立绘高清 + 商标 SVG），素材目录 **286 → 289 个文件**。立绘经逐角点核验保留透明背景（四角 RGBA 均为 `(0,0,0,0)`），与既有厂商素材一致。
> - ⚠️ **`brand-mimo.svg` 是自制简版字标**：仓库门禁强制每个厂商都必须有商标文件，本版按既有归一化口径自制了一个简版 Mi 字标（小米橙圆角方底 + 白色 `mi`），**不是官方商标**。拿到官方素材后替换同名文件即可。
> - **为什么走 minor**：`ARTWORK_VENDORS.length` 是仓库门禁硬断言的契约值（17 是写死的），改成 18 属行为变更，不是补丁。
>
> **🆕 [0.6.1](release-notes/v0.6.1.md)（2026-10-12）**：**修复在 DSH `0.2.1-alpha.2` 上被整行禁用的问题** —— `supportedHosts` 与全部 21 条 `@deepseek-ai/dsh-*` peer 白名单此前未收录该版本，DSH 判定不兼容并**自动停用插件行**（症状：插件显示「异常」、团队协作毫无反应）。
>
> - **根因**：本仓库以 `compatibility.json` 为**单一事实源**，并强制每条 peer 范围**精确枚举**其中的宿主版本。DSH 运行时升到 `0.2.1-alpha.2` 后声明面没跟上 —— **插件代码本身无缺陷**（运行时只 value-import `dsh-llm` 与 `schemastery`，两者在新宿主上照常导出）。
> - **修法**：把 `0.2.1-alpha.2` 以 `track: preview` 加入 `supportedHosts`，并同步追加到 **21** 条 peer 白名单（`scripts/compatibility.mjs` 门禁会强制这一步：漏改即红）。`recommendedHost` **仍是**稳定版 `0.2.0-rc.2` —— alpha 不得充当普通用户推荐目标。
> - **为何不写宽范围**：DSH 用 `includePrerelease` 语义比较，`>=0.2.0-rc.2` 会宣称「与所有未来版本兼容」，与本仓库「逐版本实测后再声明」的立场相悖。
>
> **🆕 [0.6.0](release-notes/v0.6.0.md)（2026-10-11）**：合并**上游 v0.1.23**（成员工具策略 / 质量门契约与修订绑定 / lineage 身份沿 fork 链 / 会话源元数据与恢复工具 / 工作区审计 / 损坏 `team.json` 降级 / 卡片 id 匹配回归修复），同时**完整保留** Fish 的厂商美术系统与队长头像跟随路由。
> **🆕 [0.6.0](release-notes/v0.6.0.md)（2026-10-11）**：合并**上游 v0.1.23**（成员工具策略 / 质量门契约与修订绑定 / lineage 身份沿 fork 链 / 会话源元数据与恢复工具 / 工作区审计 / 损坏 `team.json` 降级 / 卡片 id 匹配回归修复），同时**完整保留** Fish 的厂商美术系统与队长头像跟随路由。
>
> - **基线推进**：上游 tag `v0.1.22`（`9cba4fe`）→ **`v0.1.23`**（`1094b84`），一次带入上游 37 个提交与 4 个新模块（`tool-policies` / `workspace-audit` / `lineage` / `artifacts`）。
> - **新增能力**：`toolPolicies` 让部署方按 id 声明可复用的工具 `allow` / `deny` 列表，成员用 `tool_policy` 选用（四项协调工具始终保留）；判定绑定到**产物字节**并补齐修复沿革；队长身份在**热 / 冷 fork** 之间保持。详见 [0.6.0](release-notes/v0.6.0.md)。
> - **Fish 功能一行未丢**：`厂商+岗位 → 厂商 → 岗位` 降级链、十七厂商识别与商标徽标、队长头像跟随路由、随包 286 个素材文件 —— 全部在位，美术三套件（21 / 41 / 9）全绿。
>
> **🆕 [0.5.1](release-notes/v0.5.1.md)（2026-10-11）**：修掉让**厂商头像整档不可达**的降级链缺陷，并补齐一批真实模型 ID 的厂商漏命中。
>
> - **根因**：链序曾是 `vendor+role → role → vendor`。岗位通用图（随包 8 张鲸鱼）对**每一个**岗位都存在，所以「岗位」那一跳**永远**抢先命中，「厂商」那一跳是死代码。现场症状正是「徽标已是 StepFun 商标，头像却是通用岗位鲸鱼」——**厂商识别是对的，坏的是链序**。
> - **影响**：只有厂商通用图的 **7 家**（`meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev`）厂商角色永远不可达；`member-<vendor>-full-v2.webp`（**17 张**厂商立绘）永远轮不到，点击放大只拿到 256 岗位头像。
> - **修复**：链序改为 **`vendor+role → vendor → role`** —— 厂商身份是这套头像的主诉求，厂商优先；岗位图仍留在链尾兜底。
> - **为何门禁没抓到**：当时只钉了**第 1 跳**，而事故发生在第 2 跳。现已补 3 条断言（第 2 跳可达、厂商跳下标 < 岗位跳、`-full` 优先厂商立绘）。
> - **厂商识别细化**：按官方文档补 `stepfun` 的**字母家族**（`step-asr` / `step-tts-mini` / `stepaudio-*`，旧规则要求 step 后跟数字故整片漏）、`glm` 的 `charglm` / `codegeex` / `cogview` / `cogvideo`、`qwen` 的 `dashscope` / `aliyun`、`gemini` 的 `palm-<数字>` / `bison` / `gecko` / `vertex`、`seed` 的 `byteplus` / `skylark`、`minimax` 的 `speech-<数字>`；并把 `\bern` **收紧**为 `\bernie`（旧前缀把 `ernest` / `ernestine` 判成文心一言）。详见 [0.5.1](release-notes/v0.5.1.md)。
>
> **🆕 [0.5.0](release-notes/v0.5.0.md)（2026-10-11）**：厂商命名空间 **15 → 17**，新增 **StepFun（阶跃星辰）** 与 **Jev（TypeSafe System One）**。
>
> - **档位**：两家都只有「厂商通用图 + 立绘高清」这一档，与既有的 `meta` / `mistral` / `rwkv` / `seed` / `ernie` 同档。成员请求 `member-<vendor>-<role>-v2.png` 时第 1 跳落空，随后由 [0.5.1](release-notes/v0.5.1.md) 修正为**第 2 跳命中自家厂商角色**（[0.5.0](release-notes/v0.5.0.md) 当时误落岗位通用图，见上）。
> - **识别规则**：`stepfun` 同时认 provider 名、`step-<数字>` 模型族与中文「阶跃」。模型族那一条是必需的：本机三条真实路由是 `cn-f/cline/cline-free/step-5-preview` 这类，**provider 段里根本没有 stepfun 字样**，只认 provider 名会让整队掉兜底头像（与 [0.4.1](release-notes/v0.4.1.md) 修过的 `hunyuan3` 是同一类病根）。`jev` 认 `jev` / `typesafe` / `type-safe`。
> - **边界**：两者都保留词边界，`stepper` / `steps` / `stepstone` / `jevons` / `jevenile` 一类普通英文词不会被误吞（有单测钉住）。
> - **素材**：新增 6 个文件（2 张 256×256 RGBA 头像 + 2 张 alpha WebP 立绘高清 + 2 个商标 SVG），素材目录 **280 → 286 个文件**。
> - ⚠️ **`brand-jev.svg` 是占位字标，不是官方商标**：TypeSafe / Jev 目前没有公开商标（simple-icons 与 LobeHub icons 均无收录），所以按既有归一化口径（墨迹框最大边缩到 0.84×24、居中）做了一个简洁的「J」字标并注入品牌色。**拿到官方商标后直接替换该文件即可**，命名与尺寸口径都不用动。
> - **为什么走 minor**：`ARTWORK_VENDORS.length` 是仓库门禁硬断言的契约值（15 是写死的），改成 17 属行为变更，不是补丁。

---

十八个厂商 × 十个岗位的头像、十八个厂商商标徽标**随包自带** —— 装上就有；想换画风仍是一个自定义目录的事，不改一行动画代码。

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

<div align="center">

[![AtomGit](https://atomgit.com/NanmiCoder/dsh-agent-teams/star/new_badge.svg)](https://atomgit.com/NanmiCoder/dsh-agent-teams)

</div>

<p align="center">
  <a href="https://dshfind.com/en/plugins/NanmiCoder/dsh-agent-teams?ref=badge"><img src="https://img.shields.io/badge/recommended%20by-dshfind-FFD700?style=flat-square" alt="Recommended by dshfind"></a>
  <a href="https://dshfind.com/en/plugins/NanmiCoder/dsh-agent-teams?ref=badge"><img src="https://dshfind.com/api/badge/NanmiCoder/dsh-agent-teams?lang=en" alt="dshfind score"></a>
  <a href="https://dshfind.com/en/plugins/NanmiCoder/dsh-agent-teams?ref=badge"><img src="https://dshfind.com/api/badge/NanmiCoder/dsh-agent-teams?metric=downloads&lang=en" alt="dshfind downloads"></a>
</p>

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
| 队长头像 | 队长**跟随自己的模型路由**：建队时把队长的 `provider`/`model` 写进 `team.json`（`captainProvider` / `captainModel`），面板据此请求 `team-lead-<vendor>-v2.png`，识别不出厂商时回落 `team-lead-v2.png`；并**改请求全新 URL** 规避浏览器 24h 缓存 | `src/client/artwork.ts` · `src/tools.ts` · `src/snapshot.ts` |
| 厂商通用大图兜底 | 识别出厂商但岗位图缺失时，命中 `member-<vendor>-v2.png` 厂商通用图 —— **厂商这一跳优先于岗位通用图**（[0.5.1](release-notes/v0.5.1.md) 修正，此前顺序反了导致该跳是死代码） | `src/client/artwork.ts` · `src/artwork-source.ts` |
| 缓存策略收紧 | 只要配了 `artworkDir`，美术资源一律 `no-store`（原来打包图带 `max-age=86400`，会造成「换了图看着没换」） | `src/index.ts` |
| 高清预览族（2026-10-08） | 列表小图仍是 256 PNG；点击放大改用**去背后的原分辨率**画面（岗位/队长 1024×1024、厂商立绘长边 ≤2048），编成 WebP 质量 92 带 alpha —— 整套 125 张高清合计 ~19 MB，PNG 同分辨率要 ~125 MB | `assets/agent-teams/` |
| 第二轮厂商素材（2026-10-08） | 厂商命名空间 9 → 15，厂商素材 108 → 265 张；`audio` / `video` 两个此前只登记未出图的岗位桶补齐（10 个厂商）；素材分两档：前 10 个厂商有「厂商 × 岗位」全套，后 5 个只有通用图与立绘 | `assets/agent-teams/` · `scripts/import-vendor-artwork.mjs` |
| 路由链单测 | 新增 20 条单测：降级链顺序、未知厂商拒绝、非 `.png` 请求拒绝、路径穿越拒绝、包内扩展名探测 | `scripts/custom-artwork.test.mjs`〔新增〕 |
| 中英双语 README（[0.4.0](release-notes/v0.4.0.md)） | 新增 [`README.en.md`](README.en.md) 英文对照版，章节与中文版一一对应 | `README.md` · `README.en.md` |
| **厂商识别细化 + 两处系统性修复**（[0.4.1](release-notes/v0.4.1.md)） | ① 尾随 `\b` 卡住「名字 + 数字」的 id：`hunyuan3` / `rwkv7` / `seed1.6` / `abab6.5s` / `chatglm3-6b` 全都匹配不上；② **`\b` 对 CJK 永远不成立**（JS 的 `\w` 只含 ASCII），中文别名「混元 / 通义 / 智谱 / 豆包 / 文心 / 千帆」此前**全是死分支**。本次补齐混元 `hy` 家族（`hy3` / `hy-3` / `hy_1.5`）与 minimax（`abab6.5s` / `hailuo`）、mistral 家族（`magistral` / `pixtral` / `voxtral` / `ministral`）、qwen（`qwq`）等共 **18 处漏命中**，且 0 误伤（`hypothesis` / `hybrid-1` / `hyperbolic` / `orchestral-music` / `metadata-model` 仍不命中） | `src/client/artwork.ts` · `scripts/artwork-role-match.test.mjs` |
| **队长头像跟随路由**（[0.4.2](release-notes/v0.4.2.md)） | 队长图此前是硬编码常量 `team-lead-deepseek-v2.png`，队长换成 qwen / claude / glm 时仍请求 deepseek 那张，**随包的另外 9 张队长图永远不可达**；根因是宿主端 `team.json` 只记 `captainSessionId`、没有队长的模型路由。现建队时写入 `captainProvider` / `captainModel`，快照暴露（实时值优先），面板走与成员同一套厂商识别 | `src/client/artwork.ts` · `src/tools.ts` · `src/snapshot.ts` · `src/types.ts` |
| **README 矛盾行修正**（[0.4.3](release-notes/v0.4.3.md)） | [0.4.2](release-notes/v0.4.2.md) 发布时漏改「已知限制」表里的「队长不跟随模型路由」，导致同一份 README 里新旧两种说法并存。**npm 包内 README 在发布时冻结、事后无法修改**，故补发 [0.4.3](release-notes/v0.4.3.md) 把正确文案带上 npm；功能与 [0.4.2](release-notes/v0.4.2.md) 完全一致，仅为文档修正 | `README.md` · `README.en.md` |
| **第三轮厂商素材**（[0.5.0](release-notes/v0.5.0.md)） | 厂商命名空间 15 → 17，新增 **StepFun（阶跃星辰）** 与 **Jev（TypeSafe System One）**，两者均落「只有通用图 + 立绘」档（与 `meta` / `rwkv` 等同档，岗位请求走降级链兜底）。`stepfun` 识别同时认 provider 名、`step-<数字>` 模型族与中文「阶跃」——**模型族那一条是必需的**，本机三条 Step 路由的 provider 段里没有 stepfun 字样，只认 provider 会整队掉兜底（与 [0.4.1](release-notes/v0.4.1.md) 修过的「名字 + 数字」病根同类）；`jev` 认 `jev` / `typesafe` / `type-safe`，两者都保留词边界 | `src/client/artwork.ts` · `src/artwork-source.ts` · `assets/agent-teams/` · `scripts/verify.mjs` |
| **降级链修正 + 厂商识别细化**（[0.5.1](release-notes/v0.5.1.md)） | ① **链序缺陷**：原链 `vendor+role → role → vendor` 里，岗位通用图对每个岗位都存在，故「岗位」跳永远抢先命中、「厂商」跳是死代码 —— 只有通用档的 7 家厂商角色与 17 张厂商立绘永久不可达（现场症状：徽标是 StepFun、头像是通用岗位鲸鱼）。现改为 **`vendor+role → vendor → role`**，并补 3 条门禁（第 2 跳可达、厂商跳 < 岗位跳、`-full` 优先厂商立绘）——旧门禁只钉第 1 跳，而事故发生在第 2 跳。② **识别细化**：补 `stepfun` 字母家族（`step-asr` / `step-tts-mini` / `stepaudio-*`）、`glm` 的 `charglm` / `codegeex` / `cogview` / `cogvideo`、`qwen` 的 `dashscope` / `aliyun`、`gemini` 的 `palm-<数字>` / `bison` / `gecko` / `vertex`、`seed` 的 `byteplus` / `skylark`、`minimax` 的 `speech-<数字>`，并把 `\bern` 收紧为 `\bernie` 以免误吞 `ernest` | `src/artwork-source.ts` · `src/client/artwork.ts` · `scripts/verify.mjs` · `scripts/*.test.mjs` |

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
  "dsh-agent-teams-fish": "^0.7.2"
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

- insert:
    - id: agent-teams
      name: 'dsh-agent-teams-fish'
      config:
        stateDir: .agent-teams
        memberProvider: spawn
        # 可选：一个目录即可整套覆盖随包素材（不配就用包内 18 厂商素材）
        artworkDir: <你的美术目录绝对路径>
        # 上游 v0.1.23 新增：成员默认模型 / 子代理深度上限 / 成员数上限 / 成员工具策略
        memberModel: deepseek-v4
        memberMaxDepth: 0
        maxMembers: 8
        toolPolicies:
          researcher:
            allow: [read, glob, grep]
          implementer:
            deny: [web_search]
```

| 配置键 | 说明 | 默认值 |
|--------|------|--------|
| `stateDir` | 团队状态目录（相对于会话工作区） | `.agent-teams` |
| `memberProvider` | 成员子代理的创建方式（`spawn` / `fork`） | `spawn` |
| `artworkDir` | **可选**：自定义美术素材目录的绝对路径；配了就整套覆盖随包素材（含厂商图） | 无（用包内素材） |
| `memberModel` | **可选**（上游 v0.1.23 起）：全体成员的默认模型 | 无（用队长当前模型） |
| `memberMaxDepth` | **可选**（上游 v0.1.23 起）：成员子代理的深度上限 | `0` |
| `maxMembers` | **可选**（上游 v0.1.23 起）：队伍成员数上限 | `8` |
| `toolPolicies` | **可选**（上游 v0.1.23 起）：成员工具策略表，按 id 声明可复用的 `allow` / `deny` 列表，成员用 `tool_policy` 选用 | 无 |

> 配置目录**只在启动时读一次**；之后换图不用重启（自定义图片走 `no-store`）。
> ⚠️ `artworkDir` 是**本机绝对路径**：换机器或换用户名后它不再成立，插件会静默回落到随包素材。[0.3.1](release-notes/v0.3.1.md) 之前包里没有厂商图，这次回落就表现为「整队变回内置鲸鱼头像」；现在包里自带厂商素材，跨机器不需要再配它。

### 成员工具策略（`toolPolicies`，上游 v0.1.23 新增）

`toolPolicies` 是部署方配置：按 id 声明可复用的成员工具策略。成员通过 id **选用** —— `agent_teams_add_member` 的 `tool_policy`、内联 `plan` 的成员行、或 profile 的成员行。队长模型可以选用已声明的策略，但**不能**在运行时提交原始 allow/deny 列表或凭空发明策略。

- `deny`：从该成员的 schema 里隐藏指定全局工具，并拒绝其调用。
- `allow`：只保留指定全局工具。四个协作工具（`agent_teams_claim_task` / `agent_teams_update_task` / `agent_teams_send_message` / `agent_teams_status`）总会被补进 allow 列表。
- 队长专属工具永远被拒绝，策略不能重新放开；策略也不能拒绝必需的协作工具。
- 未知 id、空策略、空列表会在挂载时或成员持久化之前报错。
- `agent_teams_status` 会显示每个成员选用的策略 id；完整解析后的过滤器写进 `team.json` 供审计，子代理的持久 descriptor 在重启后重新应用。
- 不带策略创建的队伍与成员保持原有工具集与记录形状。`agent_teams_edit_plan` 传空 `tool_policy` 可清除暂存成员的策略。

这是**模型层面的全局工具可见性与调用策略**，不是 OS 沙箱，也不是授权边界。

`memberProvider` 是子代理运行时后端（`spawn` / `fork`），不是 LLM provider。跨 LLM 厂商路由走 `agent_teams_add_member` 的可选 `provider` + `model` 字段；`memberModel` 只是全体成员的默认模型。与队长同 provider/model 的成员继承队长的 reasoning effort，换了 provider 或 model 则自动用目标模型的默认值。要指定 effort 时传可选的 `reasoning_effort` —— 目标模型支持的 effort id 之一，或 `"default"` 强制用模型自己的默认值。

## 美术系统

### 命名契约

| 文件名 | 用途 | 面板尺寸 / 规格 |
|--------|------|:--------:|
| `member-<vendor>-<role>-v2.png` | 某厂商某岗位的成员头像（列表用小图） | 40px（卡片 24px）· 256×256 PNG |
| `member-<vendor>-<role>-full-v2.webp` | 点开后的高清图（岗位级） | 320px 框 · 1024×1024 WebP |
| `member-<role>-v2.png` | 不区分厂商的岗位通用图 | 40px · 256×256 PNG |
| `member-<vendor>-v2.png` | 厂商通用头像（识别出厂商但岗位图缺失时兜底） | 40px · 256×256 PNG |
| `member-<vendor>-full-v2.webp` | 厂商通用立绘高清（兜底大图） | 320px 框 · 长边 ≤2048 WebP |
| `team-lead-<vendor>-v2.png` · `team-lead-v2.png` | 队长头像（前者优先；队长跟随自己的模型路由，与成员同一套厂商识别） | 44px · 256×256 PNG |
| `team-lead-<vendor>-full-v2.webp` | 队长点开后的高清图 | 320px 框 · 1024×1024 WebP |
| `brand-<vendor>.svg` | 头像右下角的厂商商标 | 22px · 单色内联 path |
| `action-*-v2.png` | 未识别厂商时徽标用的活动状态图 | 22px |

- **厂商 token（17）**：`deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` `meta` `mistral` `rwkv` `seed` `ernie` `stepfun` `jev`
- **岗位 token（10）**：`engineer` `qa` `security` `researcher` `designer` `docs` `data` `operator` `audio` `video`（队长单列）
- 自定义目录里的文件名可省略 `-v2`；扩展名优先级 `.png` `.webp` `.jpg` `.jpeg` `.gif` `.svg`
- **客户端请求的永远是 `.png` 名字**（`member-…-v2.png` / `…-full-v2.png`）；`member-` / `team-lead-` 两个族的候选名会**按上表顺序探测扩展名**，所以随包的 `.webp` 高清图能直接应答 `.png` 请求。商标（`brand-…svg` → `brand-…png` → `brand.svg` → `brand.png`）与活动状态图保持严格候选名。

> **为什么高清族用 WebP**：同一个 1024×1024 画面，PNG 约 **0.9 MB**（整套 110 张要 ~125 MB），质量 92 的 WebP 只要 **~130 KB**（整套 125 张高清合计 **~19 MB**）。预览框只有 320px 宽，两种编码肉眼看不出差别，而 `<img>` 对两者一视同仁（`content-type` 由实际命中的扩展名给出）。

### 随包素材（[0.3.1](release-notes/v0.3.1.md) 起；厂商素材于 2026-10-08 换成新一批并加入高清族）

`assets/agent-teams/` 共 **289 个文件 / 约 29.7 MB**：15 张内置鲸鱼基线（队长 / 8 岗位 / 6 动作）+ **274 张厂商素材**。

| 族 | 数量 | 规格 |
|----|:---:|------|
| `member-<vendor>-<role>-v2.png` | 10 × 10 = 100 | 256×256 8-bit RGBA |
| `member-<vendor>-<role>-full-v2.webp` | 10 × 10 = 100 | 1024×1024 RGBA WebP |
| `member-<vendor>-v2.png` | 18 | 256×256 8-bit RGBA |
| `member-<vendor>-full-v2.webp` | 18 | 竖幅，长边 1897–2048 |
| `team-lead-<vendor>-v2.png` | 10 | 256×256 8-bit RGBA |
| `team-lead-<vendor>-full-v2.webp` | 10 | 1024×1024 RGBA WebP |
| `brand-<vendor>.svg` | 18 | 内联 path、离线自洽（无外链、无脚本） |

> 厂商素材分两档：`deepseek` `qwen` `glm` `kimi` `claude` `gemini` `grok` `gpt` `hunyuan` `minimax` 这 10 个有「厂商 × 岗位」全套图（头像 + 高清）与队长图；`meta` `mistral` `rwkv` `seed` `ernie` `stepfun` `jev` `mimo` 这 8 个只有厂商通用头像与立绘高清，岗位请求沿 `member-<vendor>-v2.png` 兜底 —— 它是**第 2 跳**（[0.5.1](release-notes/v0.5.1.md) 起排在岗位通用图之前；此前是第 3 跳，被岗位图永久挡住，等于永远打不到）。

> ⚠️ **内置目录只认候选链里的名字（带 `-v2`）**：`artworkDir` 里的 `member-qwen-qa.png` 能靠别名回退命中，但包内目录不做这层别名回退。所以导入脚本会统一补 `-v2` —— 手工把不带后缀的文件复制进包，会出现「文件明明在包里，请求却永远落空」。`pnpm verify` 现在逐条断言这 274 张与它们的尺寸、格式（含两族的编码与 alpha）。

### 降级链（不会出现破图）

```text
请求 member-qwen-qa-v2.png
  ├─ 1. member-qwen-qa-v2.png     厂商 + 岗位（随包）
  ├─ 2. member-qwen-v2.png        厂商通用（随包）
  ├─ 3. member-qa-v2.png          岗位通用
  └─ 4. 内置鲸鱼素材
```

**顺序是 `厂商+岗位 → 厂商 → 岗位`，厂商必须先于岗位**（[0.5.1](release-notes/v0.5.1.md) 修正）。此前顺序反了，而岗位通用图对**每一个**岗位都存在，于是「岗位」那一跳永远抢先命中，「厂商」那一跳成了死代码 —— 只有厂商通用图的 7 家（`meta` / `mistral` / `rwkv` / `seed` / `ernie` / `stepfun` / `jev`）厂商角色永远不可达，17 张厂商立绘也永远轮不到。现场症状就是「徽标已是 StepFun 商标，头像却是通用岗位鲸鱼」。

带 `-full` 的请求会额外列出同名的非 full 版本（没画立绘也能点开放大），同样**厂商立绘优先于岗位头像**；随包的高清族是 `.webp`，宿主按扩展名探测到它，所以「列表用小图 + 点开用高清图」共用一条请求名。商标链：`brand-<vendor>.svg → brand-<vendor>.png → brand.svg → brand.png`，全都没有时前端自动换回活动状态图。

### 厂商识别规则

用 `provider + model` 拼起来做小写正则匹配：

| token | 命中 | token | 命中 |
|-------|------|-------|------|
| `deepseek` | deepseek | `gemini` | gemini / gemma / palm-\<数字\> / bison / gecko / google / vertex |
| `qwen` | qwen / tongyi / dashscope / aliyun / 通义 | `grok` | grok / xai / x.ai |
| `glm` | glm / chatglm / charglm / codegeex / cogview / cogvideo / zai / z.ai / zhipu / bigmodel / 智谱 | `gpt` | gpt / chatgpt / openai / codex |
| `kimi` | kimi / moonshot | `hunyuan` | hunyuan / hy\<数字\> / 混元 / tencent |
| `claude` | claude / anthropic | `minimax` | minimax / mini-max / abab / hailuo / speech-\<数字\> |
| `meta` | meta / llama | `mistral` | mistral\* / mixtral / codestral / devstral |
| `rwkv` | rwkv | `seed` | seed / doubao / 豆包 / bytedance / byteplus / volcengine / volces / skylark |
| `ernie` | ernie\* / wenxin / 文心 / baidu / qianfan / 千帆 | `stepfun` | stepfun / `step-<数字>` / `step-<字母>` / stepaudio\* / 阶跃 |
| `jev` | jev / typesafe / type-safe | `mimo` | mimo / mimo-\<后缀\> / xiaomi / 小米 |

> **`stepfun` 为什么必须认模型族**：本机三条 Step 路由的 provider 段是 `cn-f/cline/cline-free` 这类（见 [模型配置清单](../模型配置清单.md) 的 S1 / S2 / S3），**没有一个字母是 stepfun**，而 model 是 `step-5-preview`。只按 provider 名匹配会让整队掉兜底头像 —— 与 [0.4.1](release-notes/v0.4.1.md) 修掉的 `hunyuan3` / `rwkv7` / `seed1.6` 是同一类病根（名字后面跟数字时旧规则匹配不上）。
>
> **`step-<字母>` 那一条同样必需**（[0.5.1](release-notes/v0.5.1.md) 补）：阶跃官方公开 ID 里有一大批字母后缀家族（`step-asr` / `step-tts-mini` / `step-r1-v-mini` / `step-video-t2v`），而旧的 `step[-_.]?\d` 要求 step 后跟**数字**，这些全漏命中。现补 `step[-_.][a-z]` 与 `stepaudio[\w.-]*` 两条形态。
>
> 三者都保留词边界：`stepper` / `steps` / `stepstone` / `jevons` / `jevenile` 不会被误吞，有单测钉住。

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
| **2026-10-11 第三轮（stepfun / jev）** | 厂商通用图 / 立绘 ← 2 张 1152×2048 白底全身立绘，走**同一套**去背口径（四边连通洪水填充阈值 238 + 边缘收缩 1px → 裁到实心包围盒）。256 头像是立绘的等比缩小版：缩到高度 **254px**、水平居中贴进 256×256 透明画布（实测既有素材的墨迹高为 246–255）；立绘高清长边 ≤2048、编成 WebP `-quality 92` 带 alpha。**本次没有 Q 版岗位图**，故两家都落在通用档 |
| **`brand-jev.svg` 是占位字标** | TypeSafe / Jev 无公开商标（simple-icons 与 LobeHub icons 均 404），故按既有归一化口径自制一个「J」字标（墨迹框最大边缩到 0.84×24、居中）。**不是官方商标**，拿到官方素材后直接替换同名文件即可。`brand-stepfun.svg` 取自 LobeHub icons 的官方单色 path + 品牌色 |

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
├── assets/                              素材（15 张内置鲸鱼图 + 271 张厂商素材〔含高清 WebP〕+ readme/hero.svg）
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
| **队长不跟随模型路由**（[0.4.2](release-notes/v0.4.2.md) 已修） | 此前面板快照（`TeamActivitySnapshot`）里只有成员的 `provider/model`，没有队长的，所以队长只能靠文件覆盖。[0.4.2](release-notes/v0.4.2.md) 给 `TeamState` 加了 `captainProvider` / `captainModel`（建队时写入），快照暴露且**实时值优先**，队长图从此与成员走同一套厂商识别；老团队记录没有该字段，回落随包队长图 |
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
