# 会话与调度组（#103 / #160 / #176）修复与验收报告 — 2026-10-10

- 工作区：`/Users/nanmi/.codex/worktrees/issue-session-scheduler/dsh-agent-teams`（本人 worktree）
- 分支：`codex/issues-20261010-sessions`；baseline = `1e1c624fd2e909008aa5228a004706b3e4460670`
- 宿主（baseline 与 candidate 完全相同）：`@deepseek-ai/dsh@0.2.0-rc.2`（npm 精确产物，`pnpm install --frozen-lockfile`），真实 Loader profile：`dsh-base + dsh-web-app + @nanmicoder/dsh-agent-teams`
- 模型路由：用户已有登录的 `deepseek-account / deepseek-flash / max`（未填写任何 API key，未读取/复制凭据）；隔离 `DSH_HOME` = `/private/tmp/agentteams-issues-20261010/sessions/home`，仅 `credentials.path` 指向已有认证存储
- 运行环境：macOS arm64，Node `v26.7.0`，pnpm `10.33.0`
- 证据根目录：`/private/tmp/agentteams-issues-20261010/sessions/`（`baseline/`、`candidate/`、`logs/`、`drivers/`、`repro/`）

本报告只陈述本轮实测到的内容。所有"失败 → 修复 → 同一 case 通过"的链路都给出命令与退出码；不能复现的部分单独列出，不作修复声明。

---

## 0. 结论摘要

| Issue | 结论 | 依据 |
| --- | --- | --- |
| #103 | 报告描述的"无条件重铸 attemptId"在当前 baseline（0.1.22 / 宿主 0.2.0-rc.2）**已修复**，真实运行稳定；评论中剩余的 running/idle 交错竞态**本轮无法用真实组件复现**，因此**撤回**我先前的调度改动，不在本分支合入 | §1 |
| #160 | 插件侧写入路径已改为"按宿主存储代次选择来源"，旧代次写入不再产生不可迁移日志；历史坏日志由新增的**可审查恢复工具**处理（保留源代次字节 + 备份 + 不可覆盖发布），已在真实宿主上验证"拒载 → 修复 → 可读" | §2 |
| #176 | 队长身份沿 fork 链解析（含冷父链、多层 fork 的持久化解析），成员生命周期操作按"成员持久父会话（记录 captain）"发包并在其冷掉时通过公开 controller attach/resume；成员 fork、跨 workspace 无越权 | §3 |

---

## 1. #103 Scheduler 重铸 attemptId

### 1.1 真实功能路径：报告的场景在 baseline 上已不成立

命令（真实宿主 + 真实模型 + 真实磁盘工作区）：

```sh
LAB_BASE=http://127.0.0.1:3111 node drivers/issue-103-live.mjs <work-root> baseline/issue-103-live.json baseline r1
```

过程：真实队长（deepseek-flash）创建并批准运行中的团队；成员真实 claim `t1`、置 `in_progress` 后结束本轮，此时**仍持有 open attempt**；随后队长真实调用 `agent_teams_create_task`（触发 `kickTeam`）；最后队长让成员用**最初拿到的 attempt_id** 完成 `t1`。

结果（`baseline/issue-103-live.json`）：

- `attemptStableAcrossKick: true`（attempt=1、attemptId 不变）
- 成员用原 attempt_id 完成：`finalStatus: "completed"`、`finalAttempt: 1`
- 退出码 0

即当前 baseline 的 parked 闸门（`b3a2017`）已经在真实运行中阻止了报告描述的重复轮换。

### 1.2 评论中剩余的 running/idle 交错竞态：真实组件无法复现

先按评论给出的路径用**真实编译产物 + 真实磁盘状态**做了一个交错夹具（`drivers/issue-103-interleave.mjs`，宿主 agent registry 为桩），baseline 确实出现一次轮换（attempt 1 → 2，并额外发出一次恢复派发），candidate 保持不变。**该夹具依赖桩注册表，按用户与主管要求不计入验收，也未新增/提交任何桩测试。**

随后改为**真实组件**复现（`drivers/issue-103-race-live.mjs`，`baseline/issue-103-race-live.json`）：真实 Loader ctx、真实 agents registry、真实 Agent、真实队伍与成员、真实 `agent_teams_status` 工具执行（真实 `kickTeam`），并用插件自身的 FIFO 团队锁（`lib/state.js` 同一模块实例）编排两条真实状态边：

1. 成员 running 边已处理（baseline 在该边清掉进程内 marker）；
2. 驱动持有团队锁；
3. 真实执行 status 工具作为队长 → 其 kick 排在锁上；
4. 成员本轮结束 → idle 边排在 kick 之后；
5. 释放锁，让 kick 在"成员已空闲且仍持有 attempt"的状态下判定。

实测三轮（r2/r3/r4/r5）都**没有**触发轮换。定位到的原因：

- `kickMember` 的**可用性闸门**（`isMemberAvailable`）在 mailbox 阶段之前执行，只有"成员已变为空闲/句柄已释放"时才会进入后续 lock 段；而这段窗口就是宿主把状态置为 idle 到 idle 边 park 落盘之间的毫秒级区间；
- kick 从外闸门到 ticket 判定之间还要经过 mailbox lock 段与两次 `readTeam`（约数毫秒），而 park 路径更短且先启动 → **正常调度下 park 总先写入 marker**；
- 要让它翻转，必须让 idle 边处理器相对 kick 路径被"饿"掉（事件循环拥塞级别）——这属于调度饥饿，不是可从公开操作确定性触发的路径。

结论：**该狭窄竞态未能在真实活宿主上成立**。我此前对 `src/scheduler.ts` 的"running 边改为刷新 marker"改动属于未经真实再现的推测性修改，已按主管要求 `git checkout -- src/scheduler.ts` 撤回，本分支不含该改动。留下的真实证据：baseline 主路径结果、candidate 主路径结果、以及明确标注为"夹具（未计入验收）"的交错结果。

### 1.3 candidate 主路径回归

`candidate/issue-103-live.json`（同脚本、同宿主、同输入、candidate 构建）：`attemptStableAcrossKick: true`，成员用原 attempt_id 完成 `t1`。与 baseline 一致，说明本轮改动没有破坏已修复的主路径。

---

## 2. #160 `agent-teams-command` 与迁移白名单

### 2.1 原始失败（baseline，真实宿主 0.2.0-rc.2）

两级证据，均使用官方发布包与真实磁盘产物：

1. **格式包级**（`repro/issue-160-v2-source-kind.mjs`，退出码 0，`repro/issue-160/issue-160-result.json`）：
   - v2 日志（用官方 `releasedV2SessionFormatCodec.encodeHeader/encodeEvent` 真实编码）中含 `source.kind = "agent-teams-command"` → `SessionFormatUnsupportedMigrationError: cannot safely transform unclassified message source`
   - 同结构、kind=`user` 的对照 → `PASS v4, 6 events`
   - 原生 v4 日志携带同一 kind → `PASS v4, 5 events`（同一 kind 在 v4 合法，在 v2→v3 被拒）
   - 评论建议的插件侧写法 `{ kind: 'plugin', plugin: 'dsh-agent-teams' }` 在 v4 上**写入即被拒**：`SessionFormatError: format v4 message requires a producer-owned source kind`
2. **真实宿主冷读路径**（`sessionController.follow/page` 读取真实 session store）：
   - 未修复的 v2 会话：`SessionQueryError: failed to observe session ...: cannot safely transform unclassified message source; source v2 artifact remains unchanged`（首次记录于 `baseline/` 运行日志）
   - kind=`user` 的对照会话：迁移为 v4 并正常读出

影响面（只读统计，`repro/scan-corpus.mjs`，仅计数）：本机 `~/.dsh/sessions` 85 份存储代次为 **57×v4 + 28×v3，0 份 v0/v1/v2**，无 `agent-teams-command`；即本机没有被拒的历史会话。受影响的是在写 **格式 < v3 的宿主**上使用过 `/agent-teams` 的用户日志（例如本仓库仍列为 supported 的 `0.1.2-alpha.2`/`alpha.5`/`rc.1` 写 v0，`0.1.5-rc.1/rc.2/rc.3` 写 v3）。

### 2.2 插件侧修复（新写入不再产生不可迁移日志）

`src/harness-compat.ts` 新增 `agentTeamsSource()`：

- 宿主 `SESSION_FORMAT_VERSION >= 3` → 继续 mint 生产者自有 kind（`agent-teams-command` / `agent-teams`），这是现行宿主文档化的 merge-extensible 契约；
- 宿主存储代次 < 3 → 写发布版 plugin wrapper `{ kind: 'plugin', plugin: '@nanmicoder/dsh-agent-teams' }`，它在 v2→v3 白名单内、并能被 v3→v4 迁移正常改写。

`src/command.ts` 的两条注入分支（profile 解析失败分支与正常激活分支）与 `src/harness-compat.ts` 的两条成员投递路径（queue/steer）统一走该函数。

**范围声明**：这一半只阻止**将来**在旧宿主上写出新坏日志；它**不能**修复已经写好的旧日志（迁移在读路径、插件加载之前执行，且 catalog 由直接 import 组装，插件无法介入）。

### 2.3 历史坏日志的安全恢复（新增工具，已独立 review 收紧）

新增 `scripts/legacy-session-source-repair.mjs`（+ `scripts/legacy-session-source-repair.test.mjs`，已接入 `pnpm verify`）：

- 默认**只读演练**，`--apply` 才发布；
- **已可严格迁移的代次直接 no-op**（`skipped: "already-readable"`），只处理真正因本插件历史 kind 被拒的日志，不批量改写其它来源；
- 源代次**永不修改**：先用 `COPYFILE_EXCL` 生成字节相同备份（已存在则拒绝），再做任何发布；
- 只把白名单外的 `source.kind` 规范化为发布版 wrapper；**该 wrapper 的来源审计只接受 `kind` 与 `plugin` 两个成员**，所以历史 source 上的额外元数据（如 `goal`）**不会**进入新代次——工具会在报告里列出被规范化的字段名（`normalizedDroppedSourceFields`），它们仍完整保留在未改动的源代次与备份中。消息内容、事件顺序与其它行值逐字保留；
- 迁移与校验使用**已安装的官方 catalog**（`createSessionFormatCatalogWithChildren([])`），编码使用官方 current encoder；产物先写临时文件、从字节回读校验，再用 `link()` **不可覆盖**发布（`EEXIST` 即拒绝），不会让半截 v4 被宿主优先读到；
- 多帧 zstd 容器按 **RFC 8878 帧长**逐帧测量（Node 的 zstd API 只解第一帧，且按 magic 搜索会被压缩载荷误命中）；block 载荷长度按 block type 决定（RLE 块载荷恒为 1 字节，见 RFC 8878 §3.1.1.2.2/3），读取器已在**真实 store 产物**上验证：`repro/validate-frame-reader.mjs` 读取 38 份真实 `session.v*.jsonl.zstd` 共 1814 行，0 失败。

独立 review 后的两处收紧（提交 `d64bc21`，红→绿证据见下）：

1. **备份独占性**：`COPYFILE_EXCL` 之前错误地从 `node:zlib` 的 `constants` 取（实际为 `undefined`），导致已存在的旧 backup 会被覆盖。现改为 `node:fs` 的 `fsConstants.COPYFILE_EXCL`；回归测试在"尚无当前代次"的目录预置不同字节的旧 backup，`--apply` 必须拒绝，且旧 backup 与源代次逐字节不变。红证据（旧脚本，`baseline/160-tool-prescript-red.log`）：`an existing backup is never overwritten and blocks the repair` → `AssertionError: Missing expected exception`。
2. **RLE block 载荷长度**：`zstdFrameLength` 之前无条件按 `Block_Size` 前进，使合法 RLE 帧被误判截断。现按 block type 取载荷长度（RLE = 1 字节）。回归测试覆盖：合法 RLE 帧（`Buffer.from([0x28,0xb5,0x2f,0xfd,0x20,5,(5<<3)|3,0,0,0x61])` → `aaaaa`）、raw+RLE+compressed 拼接日志、以及截断尾部必须抛错。红证据：旧脚本上该测试 → `Error: corrupt Zstandard session log: truncated final frame`。
3. 临时当前代次文件改为 `wx` 独占创建（中断残留不会被覆盖）；移除 `--no-backup`（每次都保留独占备份），`sourceUnchanged`/`backupUnchanged` 改为发布前后真实 SHA-256 比对，而不再是"同一个文件读两次"的恒等式。

**发布与调用**：恢复工具 `scripts/legacy-session-source-repair.mjs` 已加入 `package.json#files`，`pnpm pack` 产物内含该入口（内容 sha256 与仓库一致 `ca8d4170…`），并已在"从安装布局调用"下实测：

```
# 仓库内
node scripts/legacy-session-source-repair.mjs --session-dir <session-dir> [--apply]
# 安装后（profile 或工程 node_modules）
node node_modules/@nanmicoder/dsh-agent-teams/scripts/legacy-session-source-repair.mjs --session-dir <session-dir> [--apply]
```

要求该位置能解析到 Harness 依赖闭包（至少 `@deepseek-ai/dsh-session`），即 checkout 的 node_modules 或已安装 profile 的 node_modules。

真实宿主端到端验证（源字节保留 + 发布 + 宿主可读）：

```
未修复会话 session-160-refused：
  SessionQueryError: failed to observe session "session-160-refused":
  cannot safely transform unclassified message source; source v2 artifact remains unchanged
同一 v2 产物（独立会话 id）--apply（修复后工具）：
  normalizedSources=1, normalizedDroppedSourceFields=["goal"], events=6,
  applied=true, sourceUnchanged=true, backupUnchanged=true,
  backup=session.v2.jsonl.zstd.pre-160-repair.bak
  source 与 backup sha256 完全一致：6e1341a86017d783943d4ab7bf5107823f0d6183b5ace32f9562843eaa0bacca
同一目录预置旧 backup 的字节（"stale"）后再次 --apply：exit 1，旧 backup 与源代次均未改变
修复后 host 读取：ok=true，消息文本保留，归属显示为 plugin:dsh-agent-teams
```

> 全程只在 `/private/tmp/agentteams-issues-20261010/sessions/` 的 fixture 目录上操作，未写入用户真实 `~/.dsh/sessions`，未覆盖任何源代次。

---

## 3. #176 fork 后队长身份

### 3.1 原始失败（baseline，真实宿主）

`baseline/issue-176-baseline.json`、`logs/fork-baseline-read.json`：真实队长会话创建（并批准为 running 的）团队后，用宿主 `sessionController.fork` 分叉；分叉会话调用 `agent_teams_status` 得到 `you do not lead or belong to any active team yet`，而 `team.json` 完好、`captainSessionId` 仍指向原会话。

### 3.2 修复

- 新增 `src/lineage.ts`：`header.parentSession` 向上解析 fork 链。**授权路径用持久化解析**——每一跳先看驻留会话，否则用官方 `sessionPersistence.stat()` 读存储头；`sessions`/`sessionPersistence` 通过官方可选访问 `ctx.get(name)` 取得（未声明 `inject` 也不抛契约错误）。
- 队长身份判定：记录 captain 本身，或**非 subagent 的 fork 后代**；成员永远不因父链获得队长身份，成员的后代同样不获得（`teamLeadMatch` 内显式排除）。
- 接入点：`state.ts` 两个查找函数（可选 `LeadIdentity`）、`tools.ts` 全部队长授权闸门与 `participantIdentityOf`、`mailbox.ts`（队长邮件准入 + `to: captain` 回执）、`scheduler.ts`（状态边、captain 侧 requeue）、`capabilities.ts`（队长/成员提示与工具限制）、`index.ts`（Web 路由）。
- 工具错误可区分：无队伍匹配且调用方是 fork 时，错误里附带 `this session is a fork of <parent>; no active team ... is led by that session or by a lead session in its lineage`。

### 3.3 控制权/回报路由/恢复语义（明确策略）

- **控制权**：`team.json.captainSessionId` 是**唯一持久锚点，永不改写**（不做 adoption）。记录的 captain 与其任意层级的 fork 后代都是"lead 会话"，拥有全部队长权限；成员会话与其后代都不是。
- **成员生命周期（spawn/resume/drain/deliver）必须由成员的持久父会话发起**：Harness `subagents.authorizeLineage` 要求 `child.header.parentSession === parent.id`。因此所有成员操作都以**记录 captain**为父会话：它驻留时直接用；它冷掉时用公开 `workspaceRegistry.create` + `sessionController.create({sessionId})` 做 **attach/resume**（不产生模型请求、不改任何持久字段）；无法 resume（组合未挂载 controller，或 resume 失败）时工具给出显式错误，不会把归属悄悄迁到 fork（否则每次投递都会被宿主拒绝）。
- **回报路由**：成员发往 `captain` 的邮件仍以记录 captain 的 inbox 为持久归属；投递优先记录 captain 的驻留 Agent，否则回退到**最近的驻留 lead 后代**（`nearestLiveLead`），因此人在 fork 里也能收到；队长邮件准入对任何 lead 会话开放，谁先读到就标记已读。
- **原会话与 fork 同时存在**：两者都是 lead（记录 captain 是原会话时，fork 通过祖先匹配；反之亦然），都能读状态、改计划、建/改任务、发消息；`captainSessionId` 不变，因此成员回报不会因"另一个窗口"而丢。
- **恢复语义**：冷启动时 fork 仍按第 3.2 节持久解析祖先；`captainSessionId` 只在 `create_plan`/`approve` 等显式路径由真实 captain 写入，从不因身份解析而改写。

### 3.4 验收矩阵（candidate，真实宿主 + 真实模型）

`candidate/issue-176-matrix.json`。团队为 **running**（已批准，成员已 spawn 并持有 open task）：

| 场景 | 结果 |
| --- | --- |
| 同宿主、原会话仍在（warm fork） | fork `agent_teams_status` 解析到本队；fork `create_task` 成功且落盘 ✓ |
| 宿主重启后冷父链（记录 captain 未驻留，直接 fork） | `status` + `create_task` 均成功并落盘 ✓ |
| 多层 fork（fork 的 fork，中间会话与 captain 都未驻留） | 持久链经 `sessionPersistence.stat` 解析成功，`status` + `create_task` 落盘 ✓ |
| 冷 fork 向成员投递 | fork 发消息 → 记录 captain 被公开 API resume → 成员真实收到并执行（成员日志含 `COLD_FORK_DELIVERY_OK`）✓ |
| 成员会话本身尝试队长操作 | 成员工具集被限制，未产生新任务（`teamGotNoNewTask: true`）✓ |
| 成员会话的 fork | **公开 `sessionController.fork` 只接受普通会话地址**，无法分叉 subagent 会话（本项**未覆盖**，见 §5） |
| 跨 workspace | 另一 workspace 的会话 `status` 被拒（该 workspace 的 `.agent-teams` 无此队）✓ |
| 持久归属 | 全部操作后 `captainSessionId` 与初始一致（`unchanged: true`）✓ |

### 3.5 永久纯函数身份合同回归（新增，接口不变）

`scripts/lineage-identity.test.mjs`（接入 `pnpm verify:lineage-identity`，也在 `pnpm verify` 内）以**普通值**直接调用 `teamLeadMatch` / `isTopLevelSession`（不 mock Context/Agents/Registry/LLM），固定"权限只收不放"的方向：原 captain、任意层级 top-level fork 后代、普通 member/subagent、**已 removed 的 member 及其后代**、member 自己的 fork、无关 lineage、以及无 roster 行的精确 id 合同、`isTopLevelSession` 的三类头部。

写这组用例时发现一处合同缺口并做了最小收紧（`src/lineage.ts`，仅此一处判断）：此前"本会话 id 命中成员行"只排除**非 removed** 行，因此一个被移除成员的行若以 `inheritsLead` 为真的身份出现会经祖先链拿到队长身份。现任何列在成员行里的会话 id 都不再是 lead（不论状态），成员**参与权**仍由 team 查询里的 removed 过滤控制。该收紧不改变已验收的 #176 流程：收紧后重新完整跑了一遍真实宿主 fork matrix（warm/cold/多层/成员投递/成员无越权/跨 workspace/归属不变）全部通过（`candidate/issue-176-matrix-final.json` 摘要见 `docs/issue-maintenance-2026-10-10/sessions/evidence.json`）。

同宿主 `pnpm verify` 全套（含 lifecycle/capabilities/member-failure/quality-gates/harness-contract/lineage-identity/legacy-session-repair）通过：`0` 失败（`logs/candidate-verify-final4.log`，末尾 `Git artifacts match source and build settings.`）。

---

## 4. 证据索引

| 文件 | 内容 |
| --- | --- |
| `baseline/issue-103-live.json` / `candidate/issue-103-live.json` | #103 主路径（baseline / candidate，真实模型） |
| `baseline/issue-103-interleave.json` | #103 交错**夹具**（桩注册表，未计入验收） |
| `baseline/issue-103-race-live.json` | #103 真实组件交错尝试（未复现，含逐步记录） |
| `repro/issue-160/issue-160-result.json` | #160 格式包级失败矩阵 |
| `candidate/issue-160-repair-report.json`、`candidate/issue-160-hashes.txt`、`candidate/issue-160-host-read.txt` | #160 历史恢复工具在真实宿主上的验证与哈希 |
| `baseline/issue-176-baseline.json`、`logs/fork-baseline-read.json` | #176 原始失败 |
| `candidate/issue-176-matrix.json` | #176 验收矩阵（warm/cold/多层/成员/跨 workspace/归属） |
| `logs/candidate-verify-final2.log` | 全量 `pnpm verify`（candidate） |
| `progress.json`、`result.json` | 阶段进度与最终结果 |

---

## 5. 未覆盖 / 已知边界

1. **#103 狭窄竞态**：真实活宿主未能复现，speculative 调度改动已撤回；报告描述的原始 case 在 baseline 已修复。若维护者仍要堵该窗口，需要宿主提供可观察的"已 settle 但未 park"边界或允许调度侧串行化（本轮不动）。
2. **#160 历史日志**：
   - 只有"确因本插件历史 kind 被拒"的代次会被修复；修复后该条消息的归属为 `plugin:dsh-agent-teams`，历史 source 的额外字段（如 `goal`）不会进入新代次（源代次与备份逐字节保留）。
   - 插件侧改动只保证**新写入**在旧宿主上可迁移；旧日志仍需该工具（或宿主侧放宽白名单）才能打开。宿主白名单位于第三方 Harness 源码（`@deepseek-ai/dsh-session-format-v2-to-v3` 的 `assertSource`），本轮按约束未修改。
   - 本机 `~/.dsh/sessions` 无受影响样本，影响面结论来自只读计数 + 报告者语料，未做真实用户数据修复。
3. **#176**：
   - 公开 `sessionController.fork` 只接受普通会话地址，**成员会话的 fork 无法构造**，因此"成员 fork 不继承队长权限"只验证了成员本级（成员工具集限制 + 无新任务），未验证成员的 fork。
   - 冷 fork 的成员操作依赖组合暴露 `sessionController` + `workspaceRegistry`；二者缺失时工具返回显式错误（有界修复），不是"fork 可完全接管团队"。
   - fork 的跨 workspace 场景未能构造（`fork` 继承源会话 cwd），仅验证了不同 workspace 会话看不到该队。
   - `agent_teams_add_member` 在冷 fork 下会 resume 记录 captain 再派发；若该 resume 失败，成员 spawn 由调度器的"记录 captain 未驻留"分支记录为未生成（不会伪造成功）。
4. **模型/路由**：全部真实请求都走 `deepseek-account/deepseek-flash`（`/max`），没有使用 mock、scripted LLM、fixture 回答或 API-key 路由；纯函数调用与真实磁盘写入仅作为补充证据。

---

## 6. 交付物与复核入口

- 可审阅小结：`docs/issue-maintenance-2026-10-10/sessions/evidence.json`（真实 matrix 结论 + 纯函数合同用例 + 恢复工具调用方式；不含大日志与凭据）
- 提交：`38a84b9f3133ccd12ce2740a865cb7850239bdad`（主体修复）、`5b21ccd`（报告）、`d64bc21`（#160 恢复工具 review 收紧）
  （分支 `codex/issues-20261010-sessions`，未合回 main、未推送、未发布）
- 打包哈希：`pnpm pack` → `/private/tmp/agentteams-issues-20261010/sessions/pack/nanmicoder-dsh-agent-teams-0.1.22.tgz`
  sha256 `10a48c2374ff9d30137b9dd7cca096d08bda8bd9139356cb4f23a9e817379372`
  （工具与测试不在 `files` 清单内，故本次脚本修复不改变 tarball 哈希）
- 构建产物：`lib/index.js` sha256 `095e9ffb118946d86aa13bb8dbb272662013d0e7c0ec3604745cfba4d4c928f5`；
  `lib/lineage.js` sha256 `a47c50b5a242976c3b74bcecbcfee6baae7046a4fb63c0ab7e87c1240d03d05a`
- 恢复工具：`scripts/legacy-session-source-repair.mjs` sha256 `ca8d4170a47bf09e5c110cffa745caa3535621a31ba7fb9e1b3106223f115a46`；
  回归 `scripts/legacy-session-source-repair.test.mjs` sha256 `ea31ce69e32241f18a33ffe78400e2b2561ccc76345eb2b0f70d97c48a6df52e`
- 全量回归日志：`logs/candidate-verify-final3.log`（含 `verify:legacy-session-repair`，0 失败）；`logs/candidate-verify-final2.log` 为收紧前一轮
- 红→绿证据：`baseline/160-tool-prescript-red.log`（旧脚本上两条新回归均失败：backup 覆盖未拒绝、合法 RLE 帧被判截断）
- 结果/进度：`/private/tmp/agentteams-issues-20261010/sessions/result.json`、`progress.json`

复核用实验台（全部在本人 key 目录内，未改动主管/其他组工作区）：

```sh
# 1) 运行台（精确宿主 0.2.0-rc.2 + 被测插件链接）
/private/tmp/agentteams-issues-20261010/sessions/lab/prepare-runtime.sh cand lab-cand 3121
cd /private/tmp/agentteams-issues-20261010/sessions
DSH_HOME=$PWD/home DSH_PERMISSION_MODE=danger-full-access DSH_TELEMETRY_DISABLED=1 \
  node runtime/node_modules/@deepseek-ai/dsh/lib/bin.js --profile lab-cand --no-open --port 3125

# 2) #176 验收矩阵（真实模型；cold 阶段前重启上面的宿主）
cd drivers
LAB_BASE=http://127.0.0.1:3121 node issue-176-fork-matrix.mjs <work-root> candidate/issue-176-matrix.json setup candidate <label>
# 重启宿主后
LAB_BASE=http://127.0.0.1:3121 node issue-176-fork-matrix.mjs <work-root> candidate/issue-176-matrix.json cold candidate <label>

# 3) #103 真实主路径 / 真实组件交错尝试
LAB_BASE=http://127.0.0.1:3121 node issue-103-live.mjs <work-root> candidate/issue-103-live.json candidate <label>
LAB_BASE=http://127.0.0.1:3121 node issue-103-race-live.mjs <work-root> candidate/issue-103-race-live.json candidate <label>

# 4) #160 历史恢复（只在 fixture 目录操作）
node /Users/nanmi/.codex/worktrees/issue-session-scheduler/dsh-agent-teams/scripts/legacy-session-source-repair.mjs \
  --session-dir <fixture-session-dir> --apply
```

`lab-base`/`lab-cand` 是本人隔离 home 内的实验实例（控制面 3111/3121，Web 3115/3125），不是用户 GUI 的替代服务；收尾时已停止。
