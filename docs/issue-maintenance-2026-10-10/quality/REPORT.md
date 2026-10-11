# 质量闭环修复报告 — #161 / #174 / #175 / #183

- 日期：2026-10-10（Asia/Shanghai，写盘时间以文件系统时间为准）
- Worktree：`/Users/nanmi/.codex/worktrees/issue-quality-loop/dsh-agent-teams`
- 分支：`codex/issues-20261010-quality`
- 基线 commit：`1e1c624fd2e909008aa5228a004706b3e4460670`
- 宿主：`@deepseek-ai/dsh@0.2.0-rc.2`（本仓库 devDependencies；`node_modules/.pnpm` 内 289 个 `@deepseek-ai/*` 包目录，与主管 4e55 worktree 的同一列表 `diff` 为空 → baseline/candidate 同宿主同依赖闭包）
- Node `v26.7.0`，pnpm `10.33.0`
- 模型路由：`deepseek-account` / `deepseek-flash` / `reasoningEffort=max`（复用既有账号登录；未配置、未读取、未输出任何 API key/token）

## 1. 结论速览

| Issue | 是否复现 | 是否修复 | 原 case 重跑 | 真实模型路径 |
| --- | --- | --- | --- | --- |
| #161 review pass 不绑定它审过的 revision | 是（baseline 真实盘改写后仍 `Delivery: ok`） | 是 | 12/12 通过 | 是（同一输入 baseline `Delivery: ok` vs candidate `Delivery: blocked`；面板 UI 已用 Ego 实测） |
| #174 自动生成的 repair 工单冻结在生成时刻 | 是（旧 API 无任何过期标记） | 是 | 18/18 通过 | 是（status 与派工 prompt 都点名 stale 的 cited path，见 §9.2） |
| #175 findings 因果链缺失 + verification 不自动修复 | 是（baseline 失败 verification 只留 `failed without a follow-up repair`，循环停死） | 是 | 7/7 通过 | 是（同一输入 candidate 自动 repair + 复验 + review 全部完成，`Delivery: ok` 且无假 blocker，见 §9.3） |
| #183 默认排除路径派生 repair 合同不可满足 | 是（baseline repair 合同不可满足、成员报 blocker、永不 escalation） | 是 | 7/7 通过 | 是（candidate 不生成 repair、escalation 带原因） |

测试与验收产物：

- 新增仓库回归（`node --test`，纯函数 + 真实临时磁盘）：`scripts/quality-gates-content-bound.test.mjs`、`scripts/quality-gates-work-order.test.mjs`、`scripts/quality-gates-repair-wiring.test.mjs`、`scripts/quality-gates-excluded-scope.test.mjs`
- baseline TAP（改 src 之前，全部 exit=1）：`/private/tmp/agentteams-issues-20261010/quality/evidence/baseline-{161,174,175,183}.tap`（分别 6/4/5/4 个 not ok）
- candidate TAP（rebuild 之后同一 case）：`.../candidate-{161,174,175,183}.tap`（0 not ok）
- 真实模型证据：`.../evidence/gate-{candidate,baseline}-requests.jsonl`、各 workspace 的 `.agent-teams/*/team.json`、`dsh-home{,-baseline}/sessions/**/session.v4.jsonl`、`panel-audit-check.mjs`
- 仓库整体回归：`pnpm verify` → 见 §6

## 2. 原始失败（baseline 实际行为，exit code 非 0）

改源码之前，用**当时已导出的 API**加**真实磁盘写入/改写/删除**构造 case，四个文件全部 exit=1：

- #161（`quality-gates-content-bound.test.mjs`，6 not ok）。原始现象：实现任务 `changedPaths: ['lib/stats.js','test/stats.test.js','package.json']`，review `verdict=pass`；随后真实改写 `lib/stats.js`、真实追加 `test/stats.test.js`、真实删除 `package.json`，`canDeclareDelivery(team)` 仍返回 `{"ok":true,"blockers":[]}`，`describeQualityLoop(team)` 仍返回 `{"state":"deliverable","deliverable":true,"summary":"All required work and quality gates passed. The captain may report delivery."}`。
- #174（`quality-gates-work-order.test.mjs`，4 not ok）。旧 API 生成的 repair 轮：acceptance 原样保留 `lib/stats.js:2` 行号锚点，任务无 `contractSnapshot`，改盘后 `describeQualityLoop` 没有任何过期提示。
- #175（`quality-gates-repair-wiring.test.mjs`，5 not ok）。失败 verification 的 `planQualityFollowUp` 返回 `created: []`；生成的 repair 没有到失败 gate 的因果记录；`canDeclareDelivery` 对已修复下游的 findings 报 `failed without a follow-up repair`。
- #183（`quality-gates-excluded-scope.test.mjs`，4 not ok）。`repairScopeFromFindings` 返回 `['src/secrets/redactor.ts','src/app/']`，而 `classifyChangedPath('src/secrets/redactor.ts', …)` 为 `out_of_scope` → 合同不可满足。

（此前一版 case 依赖“新模块不存在”，主管指出不能算原故障复现；上表已全部改为旧 API + 真实盘行为证据，同一输入两侧可跑。）

## 3. 修复内容

### #161 内容绑定 verdict（src/artifacts.ts、src/workspace-audit.ts、src/quality-gates.ts、src/tools.ts、src/scheduler.ts、src/snapshot.ts）

1. **记录被判定的 revision**：review/requirements/verification 在 claim 时由 scheduler 写入 `verdictStartSnapshot`（真实 sha256/size/mtime）；close 时 `bindClosingVerdict` 读当前 scope，比较 claim 快照得到 `reviewedDuringDrift`，并写入 `reviewedTaskId`/`reviewedAttempt`/`reviewedArtifacts`/`reviewedScope`/`reviewedGaps`。评审期间被别人改文件 → verdict 不能声称绑定稳定 revision（blocker，除非被更晚的 sound verdict 覆盖）。
2. **交付按当前字节判定**：`canDeclareDelivery(team, audit)` / `describeQualityLoop(team, audit)` 新增可选 `audit`（纯函数不读盘，由调用方传入当前字节）。`src/workspace-audit.ts` 的 `auditTeamWorkspace` 是**唯一**读盘入口。
3. **多表面一致**：`agent_teams_status`（含 `Gate warnings` 段）与 Web 活动面板路由 `/plugins/dsh-agent-teams/state`（`TeamActivitySnapshot.delivery`/`loopState`/`deliverable` + 每任务 `verdictStale`，客户端面板以 `data-verdict-stale` 虚线告警渲染，不再显示裸 pass）都走同一个 audit。
4. **收敛而非永久阻塞**：被后续合法 repair + 新 pass 覆盖的历史 pass 只报 warning（`superseded by <id>`）；verification 漂移也必须由更晚且内容绑定、覆盖漂移路径的有效 verdict 覆盖，才能降为 warning；否则要求复验并阻塞交付（§11）。
5. **边界显式化**：broad scope 下新出现的文件若从未被审 → blocker（`appeared under the reviewed scope … never reviewed`）；review 时不可读 → `reviewedGaps` → blocker；pre-fix 历史记录没有绑定 → 明确 warning「无法确认当前字节」，不冒充已审核；当前 audit 自身不完整（超 cap / 不可读 / 非法 scope）→ blocker。

### #174 工单快照 + 过期标记（src/quality-gates.ts、src/tools.ts、src/scheduler.ts）

- 生成的 repair 记录 `contractSnapshot`（对 `contractPaths` 真实读盘），`contractStaleness`/`workOrderWarnings` 在文件被改/删/新建后报出「工单生成时是另一个工作区」；`agent_teams_status` 与派发 prompt（`assignmentPrompt(..., workOrderWarnings)`）都会带出该警告，成员被要求按内容锚点定位、目标不存在就报 blocker。
- 生成的 acceptance 用 `stripLineAnchors` 去掉 `file:12` / `file:503-505` 这类必然漂移的行号；描述里明确写「插件没有核实 finding 的断言（目标数量、符号是否仍存在、产品是否支持该操作）」。

### #175 因果链与 verification 自动修复（src/quality-gates.ts、src/tools.ts、src/types.ts）

- 失败 `verification` 与失败 `review` 走同一套 findings → repair → re-check 循环：生成 `repair` + **同类 re-check**（verification 失败生成 `verification-round-N`），acceptance 由该任务真实失败证据（failed acceptanceResults / commandsRun）派生。
- 因果关系记录在**专用字段** `findingSourceTaskIds`，而不是 `dependencies`：`unsatisfiedDependencies` 只接受 `completed` 依赖，失败任务永远不满足 → 把失败 gate 写进 dependencies 会让 repair 永久无法被 claim（已用 `unsatisfiedDependencies` 直接证明，见 `quality-gates-repair-wiring.test.mjs`）。这偏离 issue 建议的字面做法，理由与证据见 §7。
- `canDeclareDelivery` 识别四种「已闭环」联系方式（source、dependency 边、`findingSourceTaskIds`、`sourceFindingIds` 交集），不再对已修复/已复验的 findings 报假 `failed without a follow-up repair`；escalated 摘要额外列出「真正未解决的 gate」。

### #183 合同生成与完成门禁一致（src/quality-gates.ts）

- `repairScopeFromFindings` 剔除 `isDefaultExcludedPath` 命中的路径（谓词导出一份，门禁与派生共用）；全部路径都被排除的 finding 不再生成不可满足的 repair 轮，而是 escalation 并给出原因与 finding id（`planQualityFollowUp().reason`/`excludedFindings`，同时写入 captain 邮箱）。部分排除时只保留合法目标，acceptance/sourceFindingIds 同步收窄。
- 门禁侧语义零改动：`classifyChangedPath` 仍先判默认排除（`secrets/` 段、`.env*`、`.git`、`.dsh`、**`.agent-teams`**、`id_rsa*`）。

## 4. 原 case 重跑（candidate）

```
node --test --test-reporter=tap scripts/quality-gates-content-bound.test.mjs   -> EXIT=0  pass 12 fail 0
node --test --test-reporter=tap scripts/quality-gates-work-order.test.mjs      -> EXIT=0  pass 18 fail 0
node --test --test-reporter=tap scripts/quality-gates-repair-wiring.test.mjs   -> EXIT=0  pass  7 fail 0
node --test --test-reporter=tap scripts/quality-gates-excluded-scope.test.mjs  -> EXIT=0  pass  5 fail 0
pnpm typecheck                                                                -> EXIT=0
```

补充的真实文件/目录/symlink/cap case（均在上述文件内，非 mock）：

- 48 MiB 真实文件：sha256 与独立分块参考值一致，堆增长 < 16 MiB（`inspectPath` 改为 64 KiB 定长块流式 `openSync`/`readSync`/`hash.update`，常量内存，不再整文件读入）。
- 目录 symlink 逃逸 + symlink 成环：遍历不跟随（`readdirSync` dirent 判定）、显式路径用 `realpath` containment 校验，越界/不可解析记 `unreadable` 并说明原因。
- 非法 scope（`../`、`/etc/`、`~/…`、`C:\…`）：报 gap，绝不退化成整个 workspace。
- cap：`MAX_EXPANDED_ARTIFACTS=200` 被触发时产生 gap；**当前** audit 的 gap 会 block delivery（199 → 225 文件的真实增长 case，走 production 的 `auditTeamWorkspace`）。
- 权限：`chmod 000` 的文件记为 `unreadable`（≠ absent），当前 audit 因此不完整 → block。
- 缺失路径：生成时 `present:false`，之后真实创建 → drift。
- broad scope：`./` 展开不含 `secrets/`、`.env*`、`.agent-teams/`、`.git/`。

## 5. 真实 DeepSeek Flash 验收（官方 CLI + 真实磁盘工作区 + 真实团队）

隔离 profile：`/private/tmp/agentteams-issues-20261010/quality/dsh-home{,-baseline}/profiles/gate/`（`package.json` 带 name+version；`credentials.path` 指向既有认证存储，无任何 key/apiKeyEnv；`llm-pi-ai`/`llm-deepseek` disabled；`agent-default-model=deepseek-account/deepseek-flash/max`）。候选侧 plugin 软链到本 worktree，基线侧软链到 `git archive 1e1c624` 解出的产物（无 `lib/artifacts.js`）。观测插件 `observer.mjs` 只记录/校验请求路由并在非 `deepseek-account/deepseek-flash` 时抛错，不产生任何模型响应或团队状态。

| 场景 | 同输入 | baseline（1e1c624） | candidate |
| --- | --- | --- | --- |
| S-A：implementation → review(pass)，随后**外部真实改写** `lib/sum.js`（`53f09f70…` → `af01ed6d…`） | 相同 prompt、相同 `test/sum.test.js`（sha `a66af1e0…`）、相同 profile/宿主 | `Delivery: ok`；`Loop: deliverable — All required work and quality gates passed. The captain may report delivery.`；全程未提任何 hash（sha 提及 0 次） | 改写前 `Delivery: ok`；改写后 `Delivery: blocked (t2 (review) verdict covers a revision that no longer exists: lib/sum.js changed (sha256 53f09f70 -> af01ed6d) — re-review the current bytes…)`；`Loop: blocked` |
| S-B2：verification 真实失败（声明的 `node --test test/contract.test.js` 不存在，exit 1） | 相同 prompt/工作区 | 2 个任务；`Delivery: blocked (t2 failed without a follow-up repair; completed implementation has no passing review)`；**无**自动 repair | 4 个任务；自动生成 `t3 repair r2 fixes t2` + `t4 verification r2`（`t3` 带真实 `contractSnapshot`），status 逐字含 `t3 [failed] repair r2 fixes t2 … (deps: t1)`、`t4 [pending] verification r2 … (deps: t3)` |

- 请求路由证据：candidate 124 次、baseline 71 次 `llm/stream`，**全部**为 `('deepseek-account','deepseek-flash')`（观测插件对其它路由直接抛错）。
- 活动面板/Web API 证据：`panel-audit-check.mjs` 用**真实 workspace + 真实 team.json**调用插件自己的 `collectTeamsActivity`，返回 `deliverable:false`、`loopState:"blocked"`、`delivery.blockers` 与 status 完全同一句，并对 `t2` 标出 `verdictStale`。
- 运行时长以真实时间计：S-A candidate 约 2 分钟 / 32 次请求；S-A baseline 约 2 分钟；S-B2 candidate 约 4 分钟；S-B2 baseline 约 3 分钟。

## 6. 仓库回归

- `pnpm verify`（完整 gate）→ EXIT=0（含 `verify:quality-gates`、`lifecycle-verify`、`stability-tdd`、`harness-compat-tdd`、`verify:corrupt-state`、`verify:web-routes`、`verify:release`、`verify:readme`、`verify:harness-contract`、`verify:compatibility` 等）
- 单独复核（日志在 `.../evidence/`）：`quality-gates-tdd.mjs` EXIT=0、`quality-gates-repair-scope.test.mjs`+`quality-gates-amend.test.mjs` 17/17、`issue-159.test.mjs` 9/9、`workspace-activity`/`corrupt-teamjson`/`capabilities`/`http-body` 全通过、`fallback-tdd`/`member-failure-tdd`/`stress-verify` EXIT=0。
- 既有断言 `tdd.loop.repair-depends-on-source-not-failed-review`（repair 依赖 source、**不**依赖失败 review）保持通过 —— 这正是 §175 采用专用因果字段而不是 dependencies 的原因。

## 7. 未覆盖范围与已知限制

1. **#183 已补真实模型路径**（§9.1）：真实 reviewer 在 `src/secrets/redactor.js` 开出 blocker finding，baseline 生成不可满足合同且成员实测报 blocker、永不 escalation；candidate 不生成 repair、带原因 escalation。仍**未**覆盖：finding 只指向 `.env.example`（本次真实 finding 落在 `secrets/` 段，`.env*` 规则仅有规则层 case）。
2. **#175 字面建议未照做**：把失败 gate 写进 `dependencies` 会让 repair 因 `unsatisfiedDependencies`（只认 `completed`）永久不可 claim。改为 `findingSourceTaskIds` 专用因果边 + 四种闭环识别；`planQualityFollowUp` 的 verification 分支依赖“失败任务自身证据”派生 acceptance。
3. **pre-fix 历史记录**（没有 `reviewedArtifacts`）：只能靠 `changedPaths` 的 mtime 判定“晚于 verdict 的写入”，以及“changedPath 已消失且无 digest 可确认”这类保守判定；无法区分“review 通过时文件就已缺失”。两处都会走 blocker，随后被后续 sound verdict 覆盖为 warning。
4. **mtime 规则有 1 ms 容差**（mtime 亚毫秒精度 vs 任务戳整毫秒）。同一毫秒内的写入不判漂移；内容 digest 判定无此问题。
5. **hard link 无法识别**：workspace 内指向外部 inode 的硬链接与普通文件不可区分（symlink 已处理）。
6. **大 scope 会被 block 而不是静默通过**：`inScope` 写成目录（如 `src/`）且文件数超过 200 时，verdict 只绑定前 200 个并带 `reviewedGaps`，当前 audit 也会带 gap → delivery 被 block，需 captain 收窄 inScope 或重审。这是按主管要求「cap 不能静默」的取舍。
7. **失败的 repair 会让其后 re-check 永久 pending**（S-B2 与 #183 baseline 真实运行观察到：`repair failed` → 后续 re-check/review 依赖永不满足；#183 baseline 甚至连 escalation 都没有）。交付面如实报 `… failed without a follow-up repair`，captain 可用 `agent_teams_amend_task`/重派介入；这是既有循环语义，本组未改（不属四个 issue 范围），保留为后续观察项。
8. 客户端面板已在**本分支自己的实例**（隔离 profile，127.0.0.1:3093，Ego Lite TaskSpace 13 / page p3）实测：`data-verdict-stale="true"` 命中 2 个元素、DAG 节点边框为 `dashed` 警告色、tooltip 含 sha256 变化说明（§9.4）。未在主管的 3081 GUI 上复核（该实例加载的是主管 worktree 的产物）。

## 8. 产物与提交

- 源码/构建产物本地提交见 `result.json` 的 `commit` 字段；未推送、未发布、未关闭 issue、未在 GitHub 评论、未合并回 main（由主管独立核验后合并）。
- 大量日志保留在 `/private/tmp/agentteams-issues-20261010/quality/`（`evidence/`、`ws/`、`dsh-home*/`、`plugin-baseline/`），未写入仓库。

## 9. 补充验收（主管复核后追加，commit `ff17686`）

### 9.1 #183 真实模型路径（baseline vs candidate，同输入）

工作区含真实缺陷 `src/secrets/redactor.js`（`console.log` 直写明文）与 `.env.example`；review 任务 objective 要求逐行审查并「在 finding 里写明确切文件」。两侧 prompt/工作区/宿主闭包完全相同。

- **baseline**：真实 reviewer 开出 `F1`（blocker，`file=src/secrets/redactor.js`）→ 插件自动生成 `t3 repair`，`inScope ['src/secrets/redactor.js','console/stream']`，acceptance 要求删除该文件第 7 行 → 真实 repair 成员回复逐字：
  `BLOCKED — unsatisfiable repair contract (DSH issue #183) … src/secrets/redactor.js -> classifyChangedPath(...) = out_of_scope (isDefaultExcludedPath: any path with a 'secre…`
  → `t3 failed`、`t4 pending` 永久、`escalated: None`（不 escalation）。
- **candidate**（干净工作区）：真实 reviewer 开出 `F1`（blocker）+ `F2`（low），均 `file=src/secrets/redactor.js` → **只创建了 `t1 implementation` + `t2 review`，没有 repair 轮**；`escalated: True`，captain 邮箱逐字：
  `Quality-gate loop escalated after t2 (review verdict=needs_revision). Automatic repair/review stopped. Reason: every finding of t2 cites only default-excluded paths (src/secrets/redactor.js, src/secrets/redactor.js); the completion gate classifies them out_of_scope, so no honest repair contract exists — a human must decide. Findings left for the user (default-excluded paths, not a member's to edit): F1, F2.`
  status 逐字：`Delivery: blocked (team requires escalation resolution; …)` / `Loop: escalated … Genuinely unresolved gates: t2 (review); …`。
- 机械同输入对照（`evidence/i183-contract-proof.mjs`，分别 import 两个 build 的 `lib/quality-gates.js`）：
  - baseline generator → `created: [repair(inScope ['src/secrets/redactor.js','console/stream']), review]`、`escalated: false`；`classifyChangedPath('src/secrets/redactor.js', …) = out_of_scope`；`evaluateQualityCompletion(...) = {ok:false, error:"repair cannot complete: src/secrets/redactor.js is out_of_scope"}`。
  - candidate generator → `created: []`、`escalated: true`、`reason` + `excludedFindings: ['F1']`。
- 这次真实运行还暴露并修掉了一个我原先漏掉的点：requiredFix 里的散文片段 `console/stream` 不是真实文件，却会让“全部路径都被默认排除”的 finding 看起来可执行。现在 `planQualityFollowUp(team, closed, { pathExists })` 只把**存在**的路径（或 finding 自己的 `file`）计为可执行目标，工具层用 `workspacePathExists` 提供该判定；新增两条 case 固定该行为。

### 9.2 #174 真实变更后 status/派工输出点名 stale 路径（candidate，真实模型）

自动 `t5 repair` 生成时快照 `lib/sum.js` sha256 `16336470…`；在 `t5` 仍为 **pending**（engineer 正忙于 `t2 bench`）时，对同一路径写入真实变更 → `8a8d304c…`：

- status 输出（captain 逐字）：`Gate warnings (delivery is not blocked, but these recorded verdicts or generated work orders no longer describe the current bytes):` + `t5 work order was generated before: lib/sum.js changed (sha256 16336470 -> 8a8d304c). Its auto-generated acceptance/inScope describe the workspace as it was then: locate the cited code by content anchor, and amend the contract if the target is gone.`
- 派工 prompt（repair 成员会话逐字）：`Before you edit anything: this auto-generated work order was derived from a workspace that has since changed.` + 同一行 `t5 work order was generated before: lib/sum.js changed (sha256 16336470 -> 8a8d304c)`。

### 9.3 #175 真正闭环（可满足合同，同输入 baseline vs candidate）

工作区（预先存在测试）：`test/format.test.js`（impl 的 verify，初始失败但可修）+ `test/contract.test.js`（verify 的 verify，因 `lib/sum.js` 真实缺陷 `a - b` 失败）+ engineer 的长 bench 任务（制造观察窗口）。impl 的 `inScope ["lib/","test/"]`，repair 派生 scope 允许所需路径。

- **candidate**：`t3 verification failed` → 自动 `t5 repair` + `t6 verification`（`t5` 带真实 `contractSnapshot`，并记录 `findingSourceTaskIds: ['t3']`）→ `t5 completed`、`t6 completed`、pre-planned `t4 review` 被重接后 `completed` → 最终逐字 `Delivery: ok` / `Loop: deliverable — All required work and quality gates passed. The captain may report delivery.`，且 `t3 failed without a follow-up repair` 出现 **0 次**（原报告的假 blocker 不再出现）。
- **baseline（同输入）**：`t3 verification failed` 后**无任何**后续任务，`t4 review` 永久 pending，`escalated: None`，逐字 `Delivery: blocked (t3 failed without a follow-up repair; t4 (review) is not completed)` / `Loop: running — Work remains…`。

### 9.4 面板 UI 实测（Ego Lite，TaskSpace 13，本分支自己的实例）

在自己的隔离实例（`127.0.0.1:3093`，加载本分支构建）上打开 S-A 会话的「团队协作」面板：

- DOM：`[data-verdict-stale="true"]` 命中 2 个元素（任务 chip `t2`、DAG 节点 `t2 · review-round-1`）。
- 视觉：DAG 节点 `border-style: dashed`、边框为警告色（与 `t1 impl` 的实线绿框形成对比），pass 不再呈现为“全绿”。
- tooltip 逐字含：`t2 · review-round-1 · review · r1 · pass · ⚠ t2 (review) verdict covers a revision that no longer exists: lib/sum.js changed (sha256 53f09f70 -> af01ed6d) — re-review the current bytes; do not report this revision as verified · deepseek-account/deepseek-flash`。
- 截图：`/private/tmp/agentteams-issues-20261010/quality/evidence/panel-stale-verdict.png`。

### 9.5 复核后仍保留的未覆盖项

- finding 只指向 `.env.example` 的真实模型 run 未跑（规则层 case 已覆盖 `.env*`）。
- 失败的 repair 之后 re-check 永久 pending（§7.7）未改。
- pre-fix 历史记录、mtime 1 ms 容差、hard link 三项限制不变。
- 主管 3081 GUI 未复核（本分支只用自建实例与自建 profile 验证）。

## 10. 独立复核后的三处内容绑定修正（新 commit）

独立 review 在内容绑定代码里发现三处真实缺陷。三处都用**真实临时目录/真实字节**的永久 case 固定，并先在 `1d0048c` 的 `lib/` 上跑成红色（`git archive 1d0048c lib` + 当前 case 文件，`node --test`），修正后转绿。

### 10.1 未绑定（无 artifact identity）的 verdict 不能充当 superseding evidence

`verdictAuditNotes` 之前把 `sound` 定义为「没有 drift 的 verdict」，而 pre-fix 历史记录（没有 `reviewedArtifacts`）本来就没有 drift 可算 → 它会进入 `sound`，被 `supersedes` 选中并输出「superseded by t7, which binds the current bytes」，把旧的有效 review 的 drift blocker 降级为 warning，Delivery 变 ok。

修正：新增 `bindsRecordedRevision` —— 只有**记录过 artifact、scope 完整（无 `reviewedGaps`）、评审期间未漂移（无 `reviewedDuringDrift`）、attempt 未变、且当前字节与记录一致**的 verdict 才能作为 superseding evidence。

- case：`#161 review: an unbound legacy pass cannot supersede a real drift blocker`（真实 A/B 文件；旧 pass 绑定 A+B，B 被真实改写，随后插入一个更晚、同 lineage、无 artifact 记录的 pass）。
- 红色证据（pre-fix）：`an unbound pass cleared a real drift blocker: {"ok":true,...}`；绿色（修正后）：`ok=false` 且 blocker 点名 `lib/b.js`，且不出现 `superseded by t7`。

### 10.2 supersession 必须覆盖真正漂移的路径，不能只靠 lineage/时间

之前旧 pass 覆盖 A+B、B 改动、新 pass 只审 A，也会把 B 的 drift 降为 warning。现在 `supersedes` 之外还要求 `coversDrift`：**每一个带路径的 drift 路径都必须在新 verdict 记录的 artifact 集合内**；不带路径的结构性问题（scope 缺口、评审期间漂移、目标被重新 attempt）只有在「同一 target 当前 attempt 的、sound 的、同 lineage 的」verdict 下才能清除。

- case：`#161 review: a narrower new pass cannot clear drift on a path it never reviewed`（真实 A/B；窄审 A 的新 pass → 仍 blocked 且点名 `lib/b.js`；正向对照：覆盖 A+B 的新 pass → `ok=true` 且旧 pass 报 `superseded by t9`）。
- 红色证据（pre-fix）：`a narrower review cleared unreviewed drift: {"ok":true,...}`。

### 10.3 目录前缀的 containment 必须在枚举之前检查

`readArtifactScope` 的「显式目录」分支（含尾斜杠的 pattern，如 `escape/`）直接调用 `walkDirectory`，绕过了 `inspectPath` 里的 realpath containment：当 `escape` 是指向工作区外目录的 symlink 时，`readdirSync` 会把**外部目录的名字与结构**枚举进来（单个文件读取随后会被拒，但名字已泄漏、`nested/` 已被遍历）。

修正：`walkDirectory` 在枚举前先用 `realpathSync` + `insideRoot` 校验前缀自身；不存在记 gap（`does not exist`），不可解析记 gap（broken/cyclic），越界记 gap（`resolves outside the workspace`），一律不枚举。嵌套前缀来自已校验父目录的非 symlink 条目，构造上仍在工作区内。

- case：`#174/#161: a directory pattern that is a symlink out of the workspace is never enumerated`（真实临时目录 + 真实 symlink + 外部目录里的真实文件；同时覆盖 `escape/`、`escape`、`escape/nested/` 与 `snapshotWorkspacePaths`）。
- 红色证据（pre-fix）：`enumerated outside names: [{"path":"escape/host-only-secret.js",...},{"path":"escape/nested/deeper.js",...}]`；绿色（修正后）：`artifacts=[]` + `gaps` 含 `… resolves outside the workspace; refusing to enumerate it`。

### 10.4 本轮的验证状态

- 四个 case 文件：161 14/14、174 19/19、175 7/7、183 7/7，全部 EXIT=0；`pnpm typecheck` EXIT=0；`pnpm verify` EXIT=0（`evidence/pnpm-verify-final3.log`）。
- 修正未触及 #161/#174/#175/#183 的功能路径，只收紧绑定与枚举的安全边界；上一节 §9 的真实模型与浏览器验收结果不受影响（它们跑在收紧前的构建上，行为在这些路径上一致：run 中没有任何 unbound verdict 被当作 superseding evidence，也没有使用越界目录 pattern）。

## 11. 收尾（新 commit）

### 11.1 新回归已接入仓库验证链

`package.json` 的 `verify:quality-gates` 现在同时运行 `quality-gates-tdd.mjs`、`quality-gates-repair-scope`、`quality-gates-amend` 以及本组四个新 case 文件（content-bound / work-order / repair-wiring / excluded-scope）。该链随 `pnpm verify` 一起执行，不再依赖手工调用。

- `pnpm verify:quality-gates` → EXIT=0，**64 tests pass / 0 fail**（17 条既有 + 47 条新增：content-bound 14、work-order 19、repair-wiring 7、excluded-scope 7）。
- `pnpm verify`（全量 gate）→ EXIT=0；`pnpm typecheck` → EXIT=0；`pnpm build` → EXIT=0；`pnpm install --frozen-lockfile` → EXIT=0。

### 11.2 验收资料入库（大日志仍留在 /tmp）

- `docs/issue-maintenance-2026-10-10/quality/real-model-acceptance.json`：sanitized 摘要（环境、模型路由、四个真实场景的逐字关键行、请求计数、面板 DOM/视觉证据、artifact 与 TAP 的 sha256、未覆盖项、`lib` 哈希与 `git-artifact-stamp.json`）。已核对不含 token / API key / 凭据内容。
- `docs/issue-maintenance-2026-10-10/quality/panel-stale-verdict.png`：本分支自有实例上面板显示 stale verdict 的截图（sha256 `f53d102443f15d51a4c1d7f18c537596f753b531c937f08be0257db0a6ceb83b`）。
- 原始日志、workspace、profile、baseline 插件树仍在 `/private/tmp/agentteams-issues-20261010/quality/`，供独立复核（未入库）。

### 11.3 lib 与源码一致性核对

- `node scripts/git-artifacts.mjs` → `Git artifacts match source and build settings.`（EXIT=0）。
- `lib/git-artifact-stamp.json`：`source 4cc1271e…`、`output aef2d57f…`。
- 关键产物 sha256：`lib/quality-gates.js ad6305da…`、`lib/artifacts.js b54a0a54…`、`lib/workspace-audit.js 0ee95370…`、`lib/tools.js f95f5c25…`、`lib/client.js 5bdeff44…`（完整列表见 §11.2 的 JSON）。

### 11.4 状态

四个 issue（#161 / #174 / #175 / #183）修复完成，原 case 重跑、真实 DeepSeek Flash 路径、面板 UI 均已验收；本 session 到此保持 idle，不再改代码，等待主管独立核验与整合。

## 12. 整合期发现的 #161 × #175 交叉遗漏（新 commit）

主管整合时用本 session 保存的真实 S-BC candidate `team.json` 复现出一条交叉遗漏：

```
t1 implementation.changedPaths = ['lib/format.js']
t5 repair.changedPaths         = ['lib/sum.js']        (自动轮)
t6 verification.reviewedScope  = ['lib/sum.js']        (自动复验)
t4 review.dependencies         = ['t6']  reviewedTaskId = 't1'  reviewedScope = ['lib/format.js']
```

预先计划的 review 被重接到复验之后，却仍只绑定最初的 source 文件；同时漂移的 verification 被无条件降级为 warning。因此在闭环之后再真实改动 `lib/sum.js` 时，**当前字节没有任何有效 review/gate 证据，Delivery 仍然是 ok**。

### 12.1 修正一：verdict 绑定覆盖整条被判定的 lineage

`verdictScopePatterns` 现在沿 `dependencies` + `reviewedTaskId`/`sourceTaskId` 求出闭包（`verdictLineageTasks`），收集闭包内**所有** implementation/repair 的 `changedPaths`；没有 changedPaths 时回退到闭包内的 `inScope` 模式，再单文件也没有才用 deliverables。于是被重接的 review 同时绑定 `lib/format.js`（原 source）与 `lib/sum.js`（causal repair），不会为了“换成 repair”而丢掉原 source 覆盖。该函数同时用于 claim 快照与 close 绑定，生产路径自动生效。

### 12.2 修正二：漂移的 verification 不再无条件降级

`verdictAuditNotes` 里 verification 特例改为：**只有被真正更晚、content-bound、且覆盖全部漂移路径的 sound verdict supersede 时**才是 warning（既有的 `covering` 分支，正常 repair + 新 review 的收敛依然成立）；没有这种证据时它是 **blocker**，要求重新复验，不得宣称已交付。review/requirements 的行为不变。

### 12.3 永久真实文件系统回归（红 → 绿）

新增 `scripts/quality-gates-cross-binding.test.mjs`（4 条，真实临时工作区 + 真实 symlink-free 文件读写，无 mock Context/模型），并接入 `verify:quality-gates`：

1. 重接后的 review 绑定 `['lib/format.js','lib/sum.js']`；
2. 闭环后真实改写 `lib/sum.js` → `Delivery` 必须 blocked 且 blocker 点名该文件；
3. 旧形态（review 只绑 format，即真实 S-BC artifact 的形状）→ 漂移的 verification 必须 block（`t6 … lib/sum.js`）；
4. 正向对照：更晚且同时绑定两者的 sound review → `ok=true`，旧 gate 报 `superseded by t9`。

红证据（`git archive HEAD`(=f7c8358) 的 `lib/` + 本 case，`node --test`）：

```
not ok 1 … the review scope lost a judged artifact: ["lib/format.js"]
not ok 2 … a changed gate input was still delivered: {"ok":true,"blockers":[],"warnings":["t6 (verification) verdict covers a revision that no longer exists: lib/sum.js changed (sha256 a8753d5f -> ebd90c2e) — re-verify …"]}
not ok 3 … a drifted verification was demoted to a warning: {"ok":true,…}
# pass 1 / fail 3
```

修正后：同文件 `4 pass / 0 fail`；`pnpm verify:quality-gates` → **68 pass / 0 fail**（17 既有 + 51 新增）；`pnpm typecheck`、`pnpm verify` → EXIT=0。

### 12.4 未重跑的部分

按指示不再重跑已完成的一次性真实 lab（S-A / S-B2 / S-BC / S-C2 / #183 的 baseline & candidate 运行均已记录并保留在 `/private/tmp`）；主管整合后的真实 case 会重新走完整 loop。§7、§9.5、§12 的未覆盖项保持不变。
