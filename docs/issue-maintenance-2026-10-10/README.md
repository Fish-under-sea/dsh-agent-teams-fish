# Issue maintenance — 2026-10-10 / 2026-10-11

Baseline: `1e1c624fd2e909008aa5228a004706b3e4460670`. Source: GitHub open issues and all retrieved comments, fetched 2026-10-10.

本轮读取了 44 个 open issue 及评论，选择 11 个有明确复现步骤的缺陷条目，并按用户后续授权纳入小范围功能 #59。跳过第三方插件/市场报告；其余功能按产品方向、改动范围和验收条件逐项评估。

当前结论：10 个缺陷有修复，#103 的原复现步骤在基线已通过，未合入无法在真实宿主成立的推测改动；#59 成员工具策略已完成真实启用与冷恢复验收。各分组在真实工作区使用已有 deepseek-account / deepseek-flash / max，没有配置或索取 API key。整合版本的最终真实验收已通过，并合回本地 main（仅本地；版本仍为 0.1.22）。

## Selected sessions

Each session uses an official Harness workspace registration, an isolated Git worktree and the existing desktop selection `deepseek-account / deepseek-flash / max`. The account service reuses the existing login store. No API key is configured, copied or requested.

| Group | Issues | Session | Workspace |
| --- | --- | --- | --- |
| card | [203](https://github.com/NanmiCoder/dsh-agent-teams/issues/203) | `session-c4e6479b-1442-4c16-af2a-7330f0dd7313` | `/Users/nanmi/.codex/worktrees/issue-card-203/dsh-agent-teams` |
| state-routes | [188](https://github.com/NanmiCoder/dsh-agent-teams/issues/188), [189](https://github.com/NanmiCoder/dsh-agent-teams/issues/189), [205](https://github.com/NanmiCoder/dsh-agent-teams/issues/205) | `session-c3c4d918-0d05-4aeb-9551-58442c6289a4` | `/Users/nanmi/.codex/worktrees/issue-state-routes/dsh-agent-teams` |
| quality | [161](https://github.com/NanmiCoder/dsh-agent-teams/issues/161), [174](https://github.com/NanmiCoder/dsh-agent-teams/issues/174), [175](https://github.com/NanmiCoder/dsh-agent-teams/issues/175), [183](https://github.com/NanmiCoder/dsh-agent-teams/issues/183) | `session-82830bfc-8e49-47de-8369-1d8abdb73ff2` | `/Users/nanmi/.codex/worktrees/issue-quality-loop/dsh-agent-teams` |
| sessions | [103](https://github.com/NanmiCoder/dsh-agent-teams/issues/103), [160](https://github.com/NanmiCoder/dsh-agent-teams/issues/160), [176](https://github.com/NanmiCoder/dsh-agent-teams/issues/176) | `session-26e9b319-217c-44bf-8e48-69b82f844112` | `/Users/nanmi/.codex/worktrees/issue-session-scheduler/dsh-agent-teams` |
| policies | [59](https://github.com/NanmiCoder/dsh-agent-teams/issues/59) | `session-3d744ff1-ad2d-482b-9ae4-41818a756cef` | `/Users/nanmi/.codex/worktrees/issue-tool-policies/dsh-agent-teams` |

The original #205 completion-loss claim was withdrawn by its reporter. Only the remaining post-settlement failure diagnosability issue is selected. #103 的原始无条件 attempt 轮换在当前基线已修复；评论中的狭窄竞态在真实宿主四轮尝试中未成立，因此保持现有调度逻辑。

## Triage of all open issues

| Issue | Decision | Reason |
| --- | --- | --- |
| [#230](https://github.com/NanmiCoder/dsh-agent-teams/issues/230) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#229](https://github.com/NanmiCoder/dsh-agent-teams/issues/229) [dsh-plugin.org / dsh-plugin-hub] plugin install failed: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#228](https://github.com/NanmiCoder/dsh-agent-teams/issues/228) 快起床支持v0.2.1-alpha.1，要不就自己开发了干翻你了，生产队的驴都比你勤快 | deferred | feature request or missing concrete reproduction |
| [#227](https://github.com/NanmiCoder/dsh-agent-teams/issues/227) 什么时候支持 V0.2.0-rc.2 | deferred | feature request or missing concrete reproduction |
| [#226](https://github.com/NanmiCoder/dsh-agent-teams/issues/226) [dsh-plugin.org / dsh-plugin-hub] plugin install failed: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#223](https://github.com/NanmiCoder/dsh-agent-teams/issues/223) agent团队优化建议 | deferred | feature request or missing concrete reproduction |
| [#222](https://github.com/NanmiCoder/dsh-agent-teams/issues/222) [dsh-plugin.org / dsh-plugin-hub] plugin install failed: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#221](https://github.com/NanmiCoder/dsh-agent-teams/issues/221) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#220](https://github.com/NanmiCoder/dsh-agent-teams/issues/220) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#217](https://github.com/NanmiCoder/dsh-agent-teams/issues/217) 团队和团队成员似乎不能自定义 | deferred | feature request or missing concrete reproduction |
| [#216](https://github.com/NanmiCoder/dsh-agent-teams/issues/216) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#211](https://github.com/NanmiCoder/dsh-agent-teams/issues/211) Evaluation evidence: does AgentTeams improve task success or end-to-end efficiency? | deferred | feature request or missing concrete reproduction |
| [#208](https://github.com/NanmiCoder/dsh-agent-teams/issues/208) [Feature] Per-member tool filtering (member toolFilter): one malformed tool schema should not break an entire model family | deferred | third-party trigger / attribution unresolved |
| [#207](https://github.com/NanmiCoder/dsh-agent-teams/issues/207) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#205](https://github.com/NanmiCoder/dsh-agent-teams/issues/205) [Bug] Member turn failure is recorded as task completed, and often leaves no failure record (panel still shows 18/18) | selected | explicit reproducible bug (comments considered) |
| [#203](https://github.com/NanmiCoder/dsh-agent-teams/issues/203) Client card recomputes teamId with an ASCII-only sanitizer while the server keeps Unicode: non-ASCII team names never match their live team | selected | explicit reproducible bug (comments considered) |
| [#202](https://github.com/NanmiCoder/dsh-agent-teams/issues/202) [dsh-plugin.org / dsh-plugin-hub] plugin distribution incomplete: nanmicoder/dsh-agent-teams | deferred | third-party hub report skipped |
| [#195](https://github.com/NanmiCoder/dsh-agent-teams/issues/195) Feature request: join barrier + auto-synthesize primitive for captain aggregation | deferred | feature request or missing concrete reproduction |
| [#190](https://github.com/NanmiCoder/dsh-agent-teams/issues/190) 子Agent上下文输入/compat不生效，不会对子Angent进行上下文压缩 | deferred | feature request or missing concrete reproduction |
| [#189](https://github.com/NanmiCoder/dsh-agent-teams/issues/189) [Bug] memberModel is paired with the captain's provider, so add_member fails with UNKNOWN_MODEL when they disagree | selected | explicit reproducible bug (comments considered) |
| [#188](https://github.com/NanmiCoder/dsh-agent-teams/issues/188) state: `line: -1` in a task finding bricks the entire team with an undiagnosable error (write/read contract drift, #105 class) | selected | explicit reproducible bug (comments considered) |
| [#184](https://github.com/NanmiCoder/dsh-agent-teams/issues/184) 配置是不是可以放到web上 | deferred | feature request or missing concrete reproduction |
| [#183](https://github.com/NanmiCoder/dsh-agent-teams/issues/183) [Bug] Repair rounds derived from findings on default-excluded paths (secrets/, .env.*) are unsatisfiable: derived inScope contains what the completion gate classifies out_of_scope | selected | explicit reproducible bug (comments considered) |
| [#176](https://github.com/NanmiCoder/dsh-agent-teams/issues/176) [Bug] Forking the captain session orphans the team: captain identity is pinned to the creating session id | selected | explicit reproducible bug (comments considered) |
| [#175](https://github.com/NanmiCoder/dsh-agent-teams/issues/175) [Bug] repair rounds are not wired to the findings they fix: false "failed without a follow-up repair", and auto-repair fires for reviews but not verifications | selected | explicit reproducible bug (comments considered) |
| [#174](https://github.com/NanmiCoder/dsh-agent-teams/issues/174) [Bug] auto-generated acceptance/In-scope for repair rounds is frozen at finding-generation time and silently goes stale (6 cases in one run) | selected | explicit reproducible bug (comments considered) |
| [#165](https://github.com/NanmiCoder/dsh-agent-teams/issues/165) feat: 建议补一份 dsh-plugin.json（dsh-std 声明清单，Community Admission v0.15） | deferred | feature request or missing concrete reproduction |
| [#162](https://github.com/NanmiCoder/dsh-agent-teams/issues/162) subagent复用率过高，导致上下文窗口膨胀 | deferred | feature request or missing concrete reproduction |
| [#161](https://github.com/NanmiCoder/dsh-agent-teams/issues/161) [Bug] "deliverable" can be true for bytes no review ever saw — a passing review is not bound to the revision it judged | selected | explicit reproducible bug (comments considered) |
| [#160](https://github.com/NanmiCoder/dsh-agent-teams/issues/160) [Bug] source.kind `agent-teams-command` 未在 DSH 0.1.5 的迁移白名单内，导致用过 /agent-teams 的历史会话升级后全部无法打开 | selected | explicit reproducible bug (comments considered) |
| [#151](https://github.com/NanmiCoder/dsh-agent-teams/issues/151) 死循环了，还好余额没充多少…… | deferred | third-party trigger / attribution unresolved |
| [#121](https://github.com/NanmiCoder/dsh-agent-teams/issues/121) [feat] 可以把图标加个替换的功能，让客户自由替换不同角色对应的图标吗 | deferred | feature request or missing concrete reproduction |
| [#117](https://github.com/NanmiCoder/dsh-agent-teams/issues/117) Describe the bug 使用多Agent团队任务后，Node进程内存只涨不跌，多次任务后触发OOM崩溃。 | deferred | feature request or missing concrete reproduction |
| [#114](https://github.com/NanmiCoder/dsh-agent-teams/issues/114) Feature Request: Prevent long-running AgentTeams members from accumulating excessive context | deferred | feature request or missing concrete reproduction |
| [#111](https://github.com/NanmiCoder/dsh-agent-teams/issues/111) An error message prevented deepseek-harness-desktop from starting. | deferred | third-party trigger / attribution unresolved |
| [#103](https://github.com/NanmiCoder/dsh-agent-teams/issues/103) [Bug] Scheduler regenerates attemptId for idle member owning open task, causing stale attempt errors | selected | explicit reproducible bug (comments considered) |
| [#97](https://github.com/NanmiCoder/dsh-agent-teams/issues/97) 希望增加：全局并发限制 (maxConcurrentWorkers) 并支持限流后自动恢复 | deferred | feature request or missing concrete reproduction |
| [#96](https://github.com/NanmiCoder/dsh-agent-teams/issues/96) 太烧token，能做成Agent 预设吗？ | deferred | feature request or missing concrete reproduction |
| [#76](https://github.com/NanmiCoder/dsh-agent-teams/issues/76) 子代理在额度耗尽时缺少降级 / 兜底机制，导致协作进度断裂 | deferred | feature request or missing concrete reproduction |
| [#71](https://github.com/NanmiCoder/dsh-agent-teams/issues/71) issue3-斜杠命令分发.md | deferred | feature request or missing concrete reproduction |
| [#70](https://github.com/NanmiCoder/dsh-agent-teams/issues/70) issue2-消息附件.md | deferred | feature request or missing concrete reproduction |
| [#62](https://github.com/NanmiCoder/dsh-agent-teams/issues/62) Sparse per-task probes and optional Parallel Emission | deferred | feature request or missing concrete reproduction |
| [#59](https://github.com/NanmiCoder/dsh-agent-teams/issues/59) Feature proposal: reusable per-member tool policies (allow/deny) | selected | User authorized bounded feature work; reuses host toolFilter with explicit live/cold acceptance |
| [#58](https://github.com/NanmiCoder/dsh-agent-teams/issues/58) Feature: Add pluggable visual status indicators for all agents | deferred | feature request or missing concrete reproduction |

## Phase ledger

| Phase | Status | Evidence |
| --- | --- | --- |
| Discovery and triage | completed | 44 open issues; 9 plugin-marketplace automated reports excluded |
| Isolated workspace/session creation | completed | Five official workspace registrations and five real Flash sessions |
| Original-case reproduction | completed | 各分组保存相同宿主与输入的 baseline/candidate；#103 原 case 两侧均正常 |
| Repair and same-case verification | completed | 各分组的真实模型/宿主/磁盘证据与永久回归见下方链接 |
| Independent review and local integration | completed | 全量 typecheck/verify、新增 121 项回归、最终包字节、真实冷 fork/策略恢复/交付漂移验收通过；本地 main fast-forward |

Full raw session logs and supervisor request provenance remain in `/private/tmp/agentteams-issues-20261010`; summaries only belong in this directory. No issue comments, closures, remote pushes or publication are part of this run.

## Feature assessment after user clarification

The user authorized feature increments when they fit the product direction, remain small, have concrete acceptance and preserve existing behavior. This authorization does not make every proposed architecture a small change.

| Request | Decision | Contract and implementation assessment |
| --- | --- | --- |
| #59 owner-configured member tool policies | implement | Existing host toolFilter seam; optional deployment policy; required coordination tools and captain deny invariants retained; live tool invocation and cold resume provide acceptance |
| #70 structured message attachments | defer as a separate iteration | Fits artifact handoff, but reliable delivery needs message schema, archive persistence, authenticated file access and preview/download together; adding only paths would not meet the requested behavior |
| #71 command localization and general dispatch | defer pending public host support | Exact 0.2.0-rc.2 CommandDescriptor/input hints are plain strings. commandUi contributions cannot shadow a host command; decorations change bare invocation, not row translation. General multi-skill dispatch belongs to the host. Avoid replacing the existing command flow |
| #97 global concurrency and automatic rate-limit recovery | defer as a scheduler iteration | Needs a shared permit budget, fair queue, failure release and separation of retryable rate limit from exhausted quota; a single maxMembers-like field cannot prove the full request |
| #114/#162 context lifecycle | defer pending a concrete workload | Existing host compaction and preset composition must be tested with a specified threshold/workload; automatic context rollover would alter durable member identity and task recovery |
| #195 join barrier and synthesis | defer as a protocol iteration | Existing task outputs and terminal notifications support captain aggregation; adding a barrier plus optional model synthesis changes wake/settlement semantics |
| #62 persistent probes/Parallel Emission | defer as independent protocol settings work | Persistent timers and intentionally parked attempts require their own lifecycle acceptance; not implied by this issue-fix run |
| #121/#58 custom artwork/status visuals | defer | Existing artwork contribution PRs and current per-member activity need a separate asset/packaging and UI acceptance pass |
| #217 configurable teams | existing capability; no rewrite | Profiles and staged roster/plan editing already provide owner-specified teams; the report does not include a failing case against those interfaces |
| #223 presets/model change/archive delete | defer as separate requests | Bundles three different product flows; archive deletion and route switching each need their own recovery and UI contract |
| #184 Web configuration | investigate on a specified setting | The requested configuration surface is unspecified; existing host plugin configuration must be distinguished from a new per-team editor |
| #165 community manifest | defer | Community admission metadata is separate from the current exact host/plugin runtime contract and this task's reproducible behavior scope |
| #76 multi-hop fallback/budget | defer | Single-hop fallback exists; the remaining multi-hop, cooldown and budget proposal changes scheduler and provider recovery contracts |
| #96 preset-based tool cost | defer pending remaining reproduction | Profiles are already present and progressive tool visibility is implemented; need a current measured case before another loading strategy |

The exact host command declarations and implementation inspected are the installed `@deepseek-ai/dsh-commands@0.2.0-rc.2` and `@deepseek-ai/dsh-client-ui-commands@0.2.0-rc.2` artifacts. No host source edits are part of the assessment.

## Results and independent review

| 分组 | 结论 | 证据 |
| --- | --- | --- |
| #203 | Unicode 团队 ID、创建结果元数据与旧记录卡片一致；不再出现 0 成员/历史幽灵项 | [card](card/REPORT.md)；主管真实 DOM 与包字节复核见 [card-live](independent/card-live.json)、[card-artifact](independent/card-artifact.json) |
| #188/#189/#205 | 非法数值 finding 不再砖整个团队；模型默认值与所属 provider 成对；任务结束后的真实 turn failure 有持久记录 | [state-routes](state-routes/REPORT.md)、[简要验收](state-routes/acceptance-summary.json)；永久 29 项回归主管重跑通过 |
| #161/#174/#175/#183 | verdict 绑定字节与 attempt；过期工单提示；失败 verification 自动修复/复验；不可满足的排除路径合同升级并给出原因 | [quality](quality/REPORT.md)、[真实验收](quality/real-model-acceptance.json)；主管 [浏览器](independent/quality-live.json) 与 [磁盘结论](independent/quality-artifacts.json) |
| #103/#160/#176 | #103 原 case 基线已正常；旧代次写入来源可迁移并提供不覆盖源的手动恢复工具；fork 身份含冷父链解析与原 captain 锚点恢复 | [sessions](sessions/REPORT.md) |
| #59 | owner 声明 allow/deny，成员只选择策略 ID；真实拒绝 write/bash，协调工具保留，冷恢复过滤器不漂移 | [policies](policies/REPORT.md) |

跨组 review 额外拦下并修复了：无字节证据的旧 pass 错误覆盖新漂移、小范围 pass 清掉大范围未重审改动、目录 symlink 越界枚举、owner 策略与内置 deny 同名时的静默放宽、恢复工具的备份覆盖和 RLE 帧长度错误。最终 review 还需要覆盖自动 repair 的文件，verification 漂移只有被有效的新 verdict 覆盖才能降为 warning；这项整合回归已通过真实模型与文件变更验证。

验证边界：当前主要真实宿主为 macOS arm64 / Web / DSH 0.2.0-rc.2。#189 使用现有第二 provider 的真实 catalog 与 captain Agent，但全部模型生成均走 Flash；#205 的失败由真实宿主 pre-step 故障注入触发，未声称复现真实账号 429。#160 在临时的实际存储产物上验证恢复，未改用户历史会话。未扩大到所有 OS/宿主/第三方 provider。

各分组修改 src、构建更新 lib，独立整合时重新生成产物并保留所有新回归入口。主分支用户原有未跟踪分析文档不属于本轮修改。

## Final integration acceptance

最终运行源码为 dd0f070545cf3be8cdff3a20a80757e4a38e21bd；后续提交仅整理证据与结论。报告工作区和原始日志保留在 /private/tmp/agentteams-issues-20261010，临时 managed worktree 完成后归档，可从本任务的 worktree 附件恢复。

- [整合验收摘要](integration/summary.json)：原实现修改 format.js，自动 repair 修改 sum.js，独立复验与只读 review 最终通过；review 实际绑定两份文件。
- [交付漂移证明](integration/drift-proof.json)：追加注释使字节变化但两套测试仍退出 0，真实宿主 status 同时阻断 review/verification 的漂移；恢复原字节后 Delivery 再次为 ok。
- [最终包字节比对](independent/integration-artifact.json)：全部 75 个 lib 文件及恢复工具均匹配最终 worktree；tarball SHA-256 为 c5de0b2e5e31b1013512d1ebc9d2234b38f462d0f2d05b6d1cad569a16b74268。
- 官方 Loader 的真实进程重启后，fork 模型回合读到原团队；从 fork 唤醒成员，普通成员实际写出新 marker，策略成员模型请求仍只有 8 个工具，普通成员仍有 30 个；captainSessionId 与两名成员的策略/过滤器均保持不变。

整合用例的初始角色/合同分配需要真实工具修正：只读成员无法执行 shell 复验，队长新增普通 verifier 并通过 reassign/amend 调整。此介入、先前驱动观测失败（错误 ScopeKey、等待了旧 idle、metadata 被摘要覆盖、误重复创建 staged 团队）均保留在原始证据，未冒充首次无介入成功。质量分组另有可满足合同下自动修复闭环的原 case 对照。最终冷恢复与漂移检查由主管直接沿用完成的真实团队核验，未重跑实现或伪造响应。

未修改第三方 Harness 源码、用户 provider 配置或用户历史会话；没有推送、发布、评论或关闭 GitHub issue。
