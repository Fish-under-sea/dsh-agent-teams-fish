import assert from 'node:assert/strict'
import test from 'node:test'
import {
  memberRoleSlug,
  vendorSlug,
  resolveMemberArtwork,
  ROLE_LABELS,
  formatArtPreviewCaption,
} from '../lib/client/artwork.js'

/**
 * 岗位匹配正例：8 个成员岗位各至少一条真实中文角色文字命中。
 * 匹配顺序（优先级）在 artwork.ts 的 ROLE_ART 中有注释说明：
 * data / researcher 前置，因为它们的关键词（数据/分析/指标、研究/调研）
 * 可能与 engineer 等岗位重叠；qa 在 security 之前，"代码质量审查"先命中 qa；
 * security 在 designer 之后，避免 "设计/安全" 类复合词被误吞。
 */
const ROLE_CASES = [
  { text: '埋点统计与报表指标开发', expected: 'data' },
  { text: '调研竞品资料与情报', expected: 'researcher' },
  { text: '代码质量审查与冒烟回归', expected: 'qa' },
  { text: '架构模块接口与运行时装配', expected: 'engineer' },
  { text: '视觉界面样式与动效', expected: 'designer' },
  { text: '安全合规风控与权限审计', expected: 'security' },
  { text: '说明手册教程与文案撰写', expected: 'docs' },
  { text: '部署发布上线与流水线编排', expected: 'operator' },
]

/** 负例：不得牵强命中，必须返回 null。 */
const NEGATIVE_CASES = [
  // 「音频」相关文本自 2026-10-05 起命中 audio 桶（它是正式岗位词），故不再作为负例。
  'BPM 主时钟',
  'Loop Pad 触发、混音总线、录音导出',
]

/** 本机白名单路由 + T1 别名：必须命中预期厂商。 */
const VENDOR_CASES = [
  { provider: 'bailian-he', model: 'qwen3.7-plus', expected: 'qwen' },
  { provider: 'bailian', model: 'qwen3.8-flash', expected: 'qwen' },
  { provider: 'bailian', model: 'deepseek-v4.1-flash', expected: 'deepseek' },
  { provider: 'atria', model: 'glm-5.3', expected: 'glm' },
  { provider: 'bailian', model: 'kimi-k2.7-code', expected: 'kimi' },
  { provider: 'bailian', model: 'qwen3.8-max', expected: 'qwen' },
  { provider: 'atria', model: 'minimax-m3', expected: 'minimax' },
  { provider: 'bailian', model: 'glm-5.3', expected: 'glm' },
  { provider: 'bailian-he', model: 'qwen3.6-plus', expected: 'qwen' },
  // T1 别名补充
  { provider: 'tencent', model: 'hunyuan-a13b', expected: 'hunyuan' },
  { provider: 'tencent', model: 'hy-mt2-pro', expected: 'hunyuan' },
  { provider: 'zai', model: 'glm-4-9b-chat', expected: 'glm' },
  { provider: 'openai', model: 'gpt-4o', expected: 'gpt' },
  { provider: 'xai', model: 'grok-3-beta', expected: 'grok' },
  { provider: 'google', model: 'gemini-2.5-pro', expected: 'gemini' },
  // 2026-10-08 扩展的 6 个厂商
  { provider: 'meta', model: 'llama-4-scout', expected: 'meta' },
  { provider: 'mistral', model: 'mistral-large-latest', expected: 'mistral' },
  { provider: 'mistral', model: 'mistralai/mixtral-8x22b', expected: 'mistral' },
  { provider: 'rwkv', model: 'rwkv-7-g1', expected: 'rwkv' },
  { provider: 'volcengine', model: 'doubao-seed-1.6', expected: 'seed' },
  { provider: 'bytedance', model: 'seed-oss-36b', expected: 'seed' },
  { provider: 'baidu', model: 'ernie-4.5-turbo', expected: 'ernie' },
  { provider: 'qianfan', model: 'wenxin-4', expected: 'ernie' },
  // 2026-10-08 修复（病根一）：尾随 \b 卡住「名字 + 数字」的 id —— \bhunyuan\b 匹配不了
  // hunyuan3/hunyuan4，\brwkv\b 匹配不了 rwkv7，\bseed\b 匹配不了 seed1.6，
  // \babab\b 匹配不了 abab6.5s，\bchatglm\b 匹配不了 chatglm3-6b。
  // 混元线上真实踩到：模型 id 是 hunyuan3 / hy3 时整队掉兜底鲸鱼头像。
  { provider: 'tencent', model: 'hunyuan3', expected: 'hunyuan' },
  { provider: 'tencent', model: 'hunyuan4', expected: 'hunyuan' },
  { provider: 'rwkv', model: 'rwkv7', expected: 'rwkv' },
  { provider: 'rwkv', model: 'rwkv5-world', expected: 'rwkv' },
  { provider: 'volcengine', model: 'seed1.6', expected: 'seed' },
  { provider: 'atria', model: 'abab6.5s-chat', expected: 'minimax' },
  { provider: 'atria', model: 'abab7-chat-preview', expected: 'minimax' },
  { provider: 'atria', model: 'hailuo-02', expected: 'minimax' },
  { provider: 'zai', model: 'chatglm3-6b', expected: 'glm' },
  { provider: 'bailian', model: 'qwq-32b', expected: 'qwen' },
  // 混元「hy」家族：hy3 / hy-3 / hy_1.5 / hy-1.8b 都要认（用户口径：混元多用 hy）
  { provider: 'tencent', model: 'hy3', expected: 'hunyuan' },
  { provider: 'tencent', model: 'hy-3-preview', expected: 'hunyuan' },
  { provider: 'tencent', model: 'hy_1.5', expected: 'hunyuan' },
  // 2026-10-08 修复（病根二）：JS 的 \b 只认 ASCII \w，\b混元\b 这类**永远不成立**
  // —— 中文别名此前全是死分支。中文 id 现在不带 \b。
  { provider: 'tencent', model: '混元', expected: 'hunyuan' },
  { provider: 'bailian', model: '通义千问', expected: 'qwen' },
  { provider: 'zai', model: '智谱清言', expected: 'glm' },
  { provider: 'volcengine', model: '豆包', expected: 'seed' },
  { provider: 'baidu', model: '文心一言', expected: 'ernie' },
  { provider: 'baidu', model: '千帆', expected: 'ernie' },
  // mistral 家族补齐：magistral / pixtral / voxtral / ministral 此前全部漏命中
  { provider: 'mistral', model: 'magistral-small-2509', expected: 'mistral' },
  { provider: 'mistral', model: 'pixtral-large-2411', expected: 'mistral' },
  { provider: 'mistral', model: 'voxtral-mini-2507', expected: 'mistral' },
  { provider: 'mistral', model: 'ministral-8b', expected: 'mistral' },
]

test('8 个成员岗位正例命中正确 role token', () => {
  for (const { text, expected } of ROLE_CASES) {
    assert.equal(memberRoleSlug('成员', text), expected, `期望 "${text}" 命中 ${expected}`)
  }
})

test('"代码质量审查"因 qa 排在 security 之前而命中 qa', () => {
  assert.equal(memberRoleSlug('成员', '代码质量审查'), 'qa')
})

test('负例保持未命中，返回 null', () => {
  for (const text of NEGATIVE_CASES) {
    assert.equal(memberRoleSlug('成员', text), null, `"${text}" 不应被牵强命中`)
  }
})

test('作者/写手与音频、视频都命中对应岗位（不再掉兜底头像）', () => {
  // 实机复现过的漏词：成员名/角色写成 *-author 时旧规则只认 writer，整队掉厂商通用大图。
  assert.equal(memberRoleSlug('成员', '插件详情页写手 plugin-author'), 'docs')
  assert.equal(memberRoleSlug('成员', '首页与安装页作者 home-author'), 'docs')
  assert.equal(memberRoleSlug('成员', '音频引擎：程序化音色合成'), 'audio')
  assert.equal(memberRoleSlug('成员', '视频渲染与剪辑'), 'video')
})

test('厂商矩阵命中正确厂商（含 2026-10-08 新增的 6 个）', () => {
  for (const { provider, model, expected } of VENDOR_CASES) {
    assert.equal(vendorSlug({ provider, model }), expected, `${provider}/${model} 应命中 ${expected}`)
  }
})

test('hy 前缀命中混元，含 hy 的英文单词不被误识别', () => {
  assert.equal(vendorSlug({ provider: 'tencent', model: 'hy-mt2-pro' }), 'hunyuan')
  // 非腾讯 provider 时，含 hy 的英文单词不应被识别为混元。
  assert.equal(vendorSlug({ provider: 'some', model: 'hypothesis' }), undefined)
  assert.equal(vendorSlug({ provider: 'some', model: 'physics' }), undefined)
})

test('放宽 hy / stral 后仍不吞无关词（provider 与 model 两侧都验）', () => {
  for (const model of ['hypothesis', 'physics', 'hybrid-1', 'hyperbolic', 'orchestral-music', 'metadata-model']) {
    assert.equal(vendorSlug({ provider: 'some', model }), undefined, `${model} 不应被误识别`)
  }
  // provider 叫 hyperbolic（真实存在的推理服务商）时，仍按 model 判厂商。
  assert.equal(vendorSlug({ provider: 'hyperbolic', model: 'meta-llama/Llama-3.3-70B' }), 'meta')
  assert.equal(vendorSlug({ provider: 'hyperbolic', model: 'hy3' }), 'hunyuan')
})

test('resolveMemberArtwork：命中岗位 + 厂商 → 岗位-厂商组合图', () => {
  const result = resolveMemberArtwork({ name: '成员', role: '架构与接口设计', vendor: 'deepseek' })
  assert.equal(result.url, '/plugins/dsh-agent-teams/assets/member-deepseek-engineer-v2.png')
  assert.equal(result.full, '/plugins/dsh-agent-teams/assets/member-deepseek-engineer-full-v2.png')
  assert.equal(result.role, 'engineer')
  assert.equal(result.labelKey, 'member.role.engineer')
  assert.equal(result.isFallback, false)
})

test('resolveMemberArtwork：命中岗位但厂商未知 → 通用岗位图', () => {
  const result = resolveMemberArtwork({ name: '测试', role: '代码审查与冒烟', vendor: undefined })
  assert.equal(result.url, '/plugins/dsh-agent-teams/assets/member-qa-v2.png')
  assert.equal(result.full, '/plugins/dsh-agent-teams/assets/member-qa-full-v2.png')
  assert.equal(result.role, 'qa')
  assert.equal(result.isFallback, false)
})

test('resolveMemberArtwork：未命中岗位但厂商已知 → 厂商通用大图兜底', () => {
  const result = resolveMemberArtwork({ name: '节拍', role: 'BPM 主时钟', vendor: 'qwen' })
  assert.equal(result.url, '/plugins/dsh-agent-teams/assets/member-qwen-v2.png')
  assert.equal(result.full, '/plugins/dsh-agent-teams/assets/member-qwen-full-v2.png')
  assert.equal(result.role, null)
  assert.equal(result.labelKey, null)
  assert.equal(result.isFallback, true)
})

test('resolveMemberArtwork：未命中岗位且厂商未知 → null（首字母兜底）', () => {
  const result = resolveMemberArtwork({ name: '节拍', role: 'BPM 主时钟', vendor: undefined })
  assert.equal(result.url, null)
  assert.equal(result.full, null)
  assert.equal(result.role, null)
  assert.equal(result.labelKey, null)
  assert.equal(result.isFallback, false)
})

test('9 个岗位 token 的中文名与 labelKey 一致', () => {
  const expected = {
    engineer: '工程师',
    qa: '测试与质量',
    security: '安全与审计',
    researcher: '调研',
    designer: '设计与前端',
    docs: '文档与文案',
    data: '数据与分析',
    operator: '运维与发布',
    'team-lead': '队长',
  }
  for (const [token, label] of Object.entries(expected)) {
    assert.equal(ROLE_LABELS[token], label, `${token} 的中文名应为 ${label}`)
    const result = resolveMemberArtwork({ name: 'x', role: token === 'team-lead' ? 'captain' : label, vendor: 'deepseek' })
    if (token !== 'team-lead') {
      assert.equal(result.labelKey, `member.role.${token}`)
    }
  }
})

test('zhipu provider 变体命中 glm，非 zhipu 字符串不误命中', () => {
  assert.equal(vendorSlug({ provider: 'zhipu', model: 'chatglm-4' }), 'glm')
  assert.equal(vendorSlug({ provider: 'zhipu', model: 'glm-4' }), 'glm')
  assert.equal(vendorSlug({ provider: 'some', model: 'zhipu-chat' }), 'glm')
  assert.equal(vendorSlug({ provider: 'other', model: 'physics' }), undefined)
})

const mockT = (key) => {
  const map = {
    'member.art.rolePrefix': '岗位：',
    'member.art.fallbackLabel': '该岗位形象作者正在尽快适配',
    'member.role.engineer': '工程师',
  }
  return map[key] ?? key
}

test('formatArtPreviewCaption：队长预览只显示队长名，不使用兜底文案', () => {
  assert.equal(formatArtPreviewCaption({ name: '队长', labelKey: null, kind: 'captain', t: mockT }), '队长')
})

test('formatArtPreviewCaption：成员命中岗位时显示岗位前缀', () => {
  assert.equal(formatArtPreviewCaption({ name: '成员', labelKey: 'member.role.engineer', kind: 'member', t: mockT }), '成员 · 岗位：工程师')
})

test('formatArtPreviewCaption：成员未命中岗位时显示兜底文案', () => {
  assert.equal(formatArtPreviewCaption({ name: '音频', labelKey: null, kind: 'member', t: mockT }), '音频 · 该岗位形象作者正在尽快适配')
})

/** t9 修复：美术/交互类文字应命中 designer */
test('美术管线、美术立绘、美工出图等文字命中 designer', () => {
  assert.equal(memberRoleSlug('artisan', '美术管线：把 9 张厂商原版大图抠图落盘'), 'designer')
  assert.equal(memberRoleSlug('art-pipeline', '美术管线：把 9 张厂商原版大图抠图落盘'), 'designer')
  assert.equal(memberRoleSlug('artist', '插画立绘与海报出图'), 'designer')
  assert.equal(memberRoleSlug('ui-art', '绘制皮肤、图标与界面素材'), 'designer')
})

test('交互层、交互设计等文字命中 designer', () => {
  assert.equal(memberRoleSlug('deckui', '交互层：双 Deck、黑胶搓碟、Hot Cue'), 'designer')
  assert.equal(memberRoleSlug('ux', '负责整体交互与原型'), 'designer')
})

/** t9 修复：路径/文件名污染不应导致误判 */
test('实现者角色含 team-site-test/ 目录和 HTML/CSS/JS 文件名时仍命中 engineer，不被误判为 qa', () => {
  assert.equal(memberRoleSlug('implementer', '实现者：产出 team-site-test/ 全部站点文件（HTML/CSS/JS）'), 'engineer')
})

test('kimi-engineer 角色含 team-site-test/ 目录时命中 engineer', () => {
  assert.equal(memberRoleSlug('kimi-engineer', '实现者 engineer：产出 team-site-test/ 全部站点文件（HTML/CSS/JS），零外部依赖'), 'engineer')
})

test('qwen-security 角色含 verify.ps1 文件名和 security/audit 自描述时命中 security，不被误判为 qa', () => {
  assert.equal(memberRoleSlug('qwen-security', '评审者 security/audit：独立复核交付物与 verify.ps1 真实性，给出 pass / needs_revision 与问题清单'), 'security')
})

/** t9 保留未命中：audio 不应被牵强命中 */
test('音频引擎命中 audio 岗位（2026-10-05 起有专属岗位，不再掉兜底图）', () => {
  assert.equal(memberRoleSlug('audio', '音频引擎：程序化音色合成、BPM 主时钟、Loop Pad 触发、混音总线、录音导出'), 'audio')
  assert.equal(memberRoleSlug('synth', '音频引擎：程序化音色合成、BPM 主时钟、Loop Pad 触发、混音总线、录音导出'), 'audio')
})

/** t9 负例：防止过度放宽 */
test('含 art 子串的英文单词不得误命中 designer', () => {
  assert.equal(memberRoleSlug('party', '聚会活动策划'), null)
  assert.equal(memberRoleSlug('cart', '购物车逻辑'), null)
  assert.equal(memberRoleSlug('chart', '图表组件库'), null)
  assert.equal(memberRoleSlug('start', '启动流程优化'), null)
})

test('路径型或文件型 token 单独出现时不会触发岗位匹配', () => {
  assert.equal(memberRoleSlug('foo', 'team-site-test/ verify.ps1 curl.exe HTML/CSS/JS'), null)
})

test('「测试平台/质量报表」按既定优先级命中 data（报表 在 qa 之前）', () => {
  assert.equal(memberRoleSlug('plat-qa', '测试平台与质量报表开发'), 'data')
})

/** t11 匹配收尾：战局/计分归入 data，音频保持未命中 */
test('战局层含连击、计分、准确度等文字命中 data', () => {
  assert.equal(memberRoleSlug('battle', '战局层：节拍准确度判定、连击加分、每 16 拍欢呼与中心结算飞向右上角'), 'data')
  assert.equal(memberRoleSlug('scorer', '战局层：节拍准确度判定、连击加分、每 16 拍欢呼与中心结算飞向右上角'), 'data')
})

test('视频与动画命中 video 岗位（不与 designer 的「动效」互抢）', () => {
  assert.equal(memberRoleSlug('video', '视频渲染与剪辑'), 'video')
  assert.equal(memberRoleSlug('anim', '逐帧动画与字幕'), 'video')
})

/** t11 反证负例：data 新词不能过度放宽 */
test('「判定 pass/fail」类测试文字仍落 qa，不被 data 抢走', () => {
  assert.equal(memberRoleSlug('tester', '判定 pass/fail 的测试用例'), 'qa')
})

test('「评估风险」类文字仍落 security，不被 data 抢走', () => {
  assert.equal(memberRoleSlug('risk', '评估风险与威胁'), 'security')
})

test('「结算报表」类文字按既有优先级命中 data（报表 keyword）', () => {
  assert.equal(memberRoleSlug('accounting', '结算报表开发'), 'data')
})
