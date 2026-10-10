# 来源与署名（NOTICE）

本仓库是 **dsh-agent-teams** 插件的**补充版（fork）**，**不是原创项目**。

## 原始项目

| 项目 | 内容 |
|------|------|
| 插件名 | **dsh-agent-teams** —— 把一次 DeepSeek Harness 会话变成可协作的多智能体团队 |
| 原作者 | **程序员阿江（Relakkes）** |
| GitHub | [@NanmiCoder](https://github.com/NanmiCoder) |
| 邮箱 | relakkes@gmail.com |
| 原仓库 | <https://github.com/NanmiCoder/dsh-agent-teams> |
| npm 包名 | `@nanmicoder/dsh-agent-teams` |
| 许可证 | **MIT** |
| 本版基线 | 上游 tag **v0.1.22**（commit `9cba4fe`） |

## 本版（Fish-under-sea/dsh-agent-teams-fish）做了什么

只做**增量补充**，未改动上游的团队协作逻辑（花名册、任务 DAG、调度、质量门、信箱、面板主体交互）：

1. **自定义美术目录** —— 新增 `artworkDir` 配置项与文件查找链（`src/artwork-source.ts`〔新增〕、`src/index.ts`）
2. **厂商头像命名空间** —— `member-<vendor>-<role>-v2.png`，识别不出厂商时回落到岗位通用图
3. **厂商识别** —— 从成员的 `provider + model` 路由推断厂商
4. **厂商商标徽标** —— 头像右下角徽标换成 `brand-<vendor>.svg`，缺失时回落活动状态图
5. **点击放大预览** —— 320px 大图，Esc / 点背景关闭
6. **队长头像跟随路由**（2026-10-10 修）—— 原实现把队长图写死成 `team-lead-deepseek-v2.png`，队长换成 qwen / claude / glm 时仍请求 deepseek 那张，随包的另外 9 张队长图永远不可达。现改为建队时把队长的 `provider`/`model` 写进 `team.json`（`captainProvider` / `captainModel`），面板按与成员同一套厂商识别请求 `team-lead-<vendor>-v2.png`；识别不出厂商时回落 `team-lead-v2.png`，并继续改请求全新 URL 规避浏览器缓存
7. **缓存策略收紧** —— 配置了 `artworkDir` 时美术资源一律 `no-store`
8. **路由链单测** —— `scripts/custom-artwork.test.mjs`〔新增〕20 条
9. **厂商素材随包分发**（0.3.1）—— 108 张厂商素材进 `assets/agent-teams/`，附导入脚本 `scripts/import-vendor-artwork.mjs`；`pnpm verify` 新增厂商整套与尺寸门禁
10. **第二轮厂商素材**（2026-10-08）—— 厂商命名空间 9 → 15，厂商素材 108 → 265 张；`audio` / `video` 两个此前只登记、未出图的岗位桶补齐（10 个厂商）；`member-<vendor>-v2.png` 与高清立绘全套换成新的 15 张全身立绘。素材分两档：10 个厂商有「厂商 × 岗位」全套，`meta` / `mistral` / `rwkv` / `seed` / `ernie` 只有通用图与立绘
11. **高清预览族**（2026-10-08，同一轮）—— 点开的小图/大图拆成两份：列表仍是 256×256 PNG，点击放大改用**去背后的原分辨率**画面（岗位/队长 1024×1024、厂商立绘长边 ≤2048），编成 WebP（质量 92、带 alpha）。宿主端为 `member-` / `team-lead-` 族加了按扩展名探测，所以客户端请求的 `.png` 名字能命中随包的 `.webp`；原先 512×512 的 PNG 立绘被高清 WebP 取代

## 原作者的权利

- 插件全部功能与代码的著作权归**原作者**所有。
- 本仓库**完整保留**上游 `LICENSE` 原文与版权声明，未做任何修改。
- 上游原始 README 完整保留为 [`README.original.md`](README.original.md) 与 [`README_ZH.original.md`](README_ZH.original.md)，未做任何修改。
- 上游 `CONTRIBUTING.md` 原样保留。
- 本版新增代码同样以 **MIT** 发布；再分发时请保留本文件与上游署名。
- `package.json` 只改身份字段：包名为本版的 **`dsh-agent-teams-fish`**（上游包名 `@nanmicoder/dsh-agent-teams` 属原作者，本版无法沿用），`repository` / `homepage` / `bugs` 指向本仓库；**版本 `0.1.22`、`author`、`license` 保持上游不变**。
- 包名牵动三处必须同步，否则插件加载失败：`package.json` 的 `name`、`cordis.patch.yml` 的插件行 `name`、客户端包 `lib/client.js` 的注册 `id`（不一致会报 `loaded without registering`）。

## 美术素材与商标

- **0.3.1 起本仓库随包分发美术素材**：`assets/agent-teams/` 含厂商素材（岗位头像 + 点击放大的高清图 + 厂商通用头像/立绘 + 队长头像/高清 + 商标 SVG）。2026-10-08 第二轮后共 **265 张厂商素材 / 约 28.6 MB**（100 张岗位头像 PNG + 100 张岗位高清 WebP + 15 张厂商通用 PNG + 15 张厂商立绘高清 WebP + 10 张队长头像 PNG + 10 张队长高清 WebP + 15 个商标 SVG），加上上游自带的 15 张内置素材，共 **280 个文件**。
- 角色图是各家角色的 **AI 二次创作**；商标 SVG 是在 simple-icons（`minimax` / `meta` / `mistralai`）与 LobeHub icons（`rwkv` / `bytedance` / `wenxin`）等图标集的单色 path 上按各厂商品牌色着色的**各厂商商标**。两者**版权均归各厂商所有**，随包分发**仅供个人学习与本地使用**。
- 若你**商用或再分发**（包括把本包再发布到公共 registry、镜像站、或打包进商业产品），请自行评估并取得相应授权 —— 本仓库不代为授权。
- 想整套换画风仍可用 `artworkDir` 目录覆盖随包素材，命名与降级规则见 [`README.md`](README.md) 的「配置」与「美术系统」。