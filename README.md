# @fish-under-sea/dsh-agent-teams-fish

**1.0.0 · 持久团队协作与 Fish 厂商美术**

[English](README.en.md)

## 安装与兼容

```sh
dsh plugin --profile <profile> add @fish-under-sea/dsh-agent-teams-fish@1.0.0
```

也由 `@fish-under-sea/dsh-fish@1.0.0` 提供，不要重复挂载。安装后重启 DSH。Node 要求 `^22.19.0 || >=24`。推荐宿主 `0.2.0-rc.2`；`0.2.1-rc.2` 为预览支持。精确支持列表以 [compatibility.json](compatibility.json) 为唯一事实源，不以桌面应用版本推断核心版本。

## 功能

- 先规划后审批：成员编排、任务依赖 DAG、信箱通信与进度监测。
- 持久成员、失败处理、重派能力凭据、停机与恢复，遵守宿主路由和模型白名单。
- 可选质量门：需求、实现、验证、审查、修复及集成，审查与产物绑定。
- Fish 美术：十八厂商识别，厂商与岗位头像、自定义 artworkDir、商标徽标及队长模型路由头像。缺图按“厂商+岗位 → 厂商 → 岗位”降级，不代表每个厂商都有全部岗位图。
- 新宿主预设型成员组合在子上下文安装人设和工具限制；缺失或损坏的限制在派发前拒绝。

## 迁移与配置

旧 npm 名 `dsh-agent-teams-fish` 改为当前 scoped 名。更新直接依赖、bundle 名和覆盖行的 `name`，保留 `id: agent-teams`；不要同时加载两个来源。状态目录默认是工作区 `.agent-teams`，memberProvider 默认 `spawn`，自定义 artworkDir 使用本机路径。配置字段与团队数据格式不因本次包名整理改变。

先安全备份再迁移。成员使用真实模型额度；工具策略由部署方声明，不能以改名绕过。不会自动修复损坏日志、删除历史事件或重发中断任务。旧会话损坏应独立诊断。

## 开发检查

以下命令按需手动执行。GitHub 验证仅保留手动触发，不再由 push、PR 或发布触发；标签发布直接使用已提交的构建产物，不依赖测试矩阵。已存在的 npm 版本跳过重复发布。本地 `prepublishOnly` 自动构建和验证钩子已移除，发布前是否构建与检查由维护者决定。插件运行时的权限确认与可选质量任务规则不变。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm verify
```

诊断器 `dsh-agent-teams-doctor` 只检查清单和依赖闭包，不证明运行行为或识别当前进程。真实宿主验收与 UI 检查需要另行执行。

## 来源与记录

基于 [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) (原作者 Relakkes / 程序员阿江). MIT. 保留上游 README、NOTICE 和历史发布说明。1.0.0 统一包名与版本，不表示已合并上游最新 HEAD。

- [1.0.0](release-notes/v1.0.0.md)
- [历史记录](https://github.com/Fish-under-sea/dsh-agent-teams-fish/tree/main/release-notes)
- [NOTICE](NOTICE.md)
