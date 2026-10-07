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
6. **队长头像覆盖** —— `team-lead-<vendor>-v2.png` 优先、`team-lead-v2.png` 兜底，并改请求全新 URL 规避浏览器缓存
7. **缓存策略收紧** —— 配置了 `artworkDir` 时美术资源一律 `no-store`
8. **路由链单测** —— `scripts/custom-artwork.test.mjs`〔新增〕16 条
9. **厂商素材随包分发**（0.3.1）—— 108 张厂商素材进 `assets/agent-teams/`，附导入脚本 `scripts/import-vendor-artwork.mjs`；`pnpm verify` 新增厂商整套与尺寸门禁

## 原作者的权利

- 插件全部功能与代码的著作权归**原作者**所有。
- 本仓库**完整保留**上游 `LICENSE` 原文与版权声明，未做任何修改。
- 上游原始 README 完整保留为 [`README.original.md`](README.original.md) 与 [`README_ZH.original.md`](README_ZH.original.md)，未做任何修改。
- 上游 `CONTRIBUTING.md` 原样保留。
- 本版新增代码同样以 **MIT** 发布；再分发时请保留本文件与上游署名。
- `package.json` 只改身份字段：包名为本版的 **`dsh-agent-teams-fish`**（上游包名 `@nanmicoder/dsh-agent-teams` 属原作者，本版无法沿用），`repository` / `homepage` / `bugs` 指向本仓库；**版本 `0.1.22`、`author`、`license` 保持上游不变**。
- 包名牵动三处必须同步，否则插件加载失败：`package.json` 的 `name`、`cordis.patch.yml` 的插件行 `name`、客户端包 `lib/client.js` 的注册 `id`（不一致会报 `loaded without registering`）。

## 美术素材与商标

- **0.3.1 起本仓库随包分发美术素材**：`assets/agent-teams/` 含 108 个厂商素材文件（9 厂商 × 8 岗位 + 厂商通用图 + 512×512 立绘 + 队长立绘 + 商标 SVG），加上上游自带的 15 张内置素材，共 123 个。
- 角色图是各家角色的 **AI 二次创作**；商标 SVG 是在 simple-icons / Iconify 的单色 path 上按各厂商品牌色着色的**各厂商商标**。两者**版权均归各厂商所有**，随包分发**仅供个人学习与本地使用**。
- 若你**商用或再分发**（包括把本包再发布到公共 registry、镜像站、或打包进商业产品），请自行评估并取得相应授权 —— 本仓库不代为授权。
- 想整套换画风仍可用 `artworkDir` 目录覆盖随包素材，命名与降级规则见 [`README.md`](README.md) 的「配置」与「美术系统」。