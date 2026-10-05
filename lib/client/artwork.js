/**
 * Shared character artwork lookup for the activity panel and the conversation
 * card: role keywords pick the role, and a member's model vendor picks which
 * character wears it. The captain always uses the lead artwork.
 *
 * Only the most specific slug is requested here. The host degrades a missing
 * combination along `vendor+role → role → vendor → packaged whale`, so a
 * vendor this list does not know still gets the role artwork instead of a
 * broken image.
 * @module dsh-agent-teams/client/artwork
 */
/** Artwork route prefix served by the plugin host half. */
export const ART_BASE = '/plugins/dsh-agent-teams/assets/';
/** Role token per role keyword, in match order.
 *
 * 优先级说明（越靠前越先匹配）：
 * 1. data / researcher 前置，因为它们的关键词（埋点/统计/报表/指标、调研/资料/情报）
 *    容易与 engineer 等岗位重叠，先排可避免被 engineer 的“开发/代码”等广义词吞掉。
 *    data 桶补充了“连击/计分/得分/评分/分数”——这些词只出现在战局/计分等量化场景，
 *    不会与 QA/合规 语境的“判定”等宽泛词混淆，因此放在最前也不会误抢。
 * 2. qa 在 security 之前，这样“代码质量审查”会先命中 qa；否则“审查”会被 security 抢走。
 * 3. security 在 designer 之后，避免“设计安全”类复合词被 security 抢先。
 * 4. engineer 范围较广，放在 qa/security 之后，避免把“质量/审计”类词误吞。
 */
const ROLE_ART = [
    // audio / video 是最窄的桶，必须前置：否则「视频渲染」会被 engineer 的「渲染/实现」吞掉。
    [/\baudio\b|sound|\bvoice\b|music|\btts\b|音频|语音|音效|音乐|配音/, 'audio'],
    [/\bvideo\b|\bfilm\b|movie|animat|\bclip\b|视频|影片|剪辑|动画|字幕/, 'video'],
    [/data|analys|metric|performance|埋点|统计|报表|指标|数据|分析|性能|连击|计分|得分|评分|分数/, 'data'],
    [/resear|investig|explor|study|调研|研究|调查|探索|资料|情报/, 'researcher'],
    // Match compound QA titles (for example "QA Engineer") before the broad
    // engineer bucket, otherwise an eight-role roster repeats the engineer art.
    // 注意：这里刻意**不**匹配成员名里的 "reviewer"——qa 排在 security 之前，
    // 名称规则会把 "Security Reviewer" 这类身份抢成 qa，使 member-security 图不可达
    // （仓库自检 scripts/verify.mjs 的 packaging contract 会当场抓住）。审查类成员
    // 由角色文字里的「质量/验证」命中 qa，纯「审查/审计」则落 security，语义更准。
    [/\bqa\b|test|verif|quality|校验|核验|体检|回归|冒烟|测试|质量|验证/, 'qa'],
    [/engineer|dev\b|server|backend|\bapi\b|runtime|watcher|contract|架构|模块|接口|运行时|装配|工程|后端|服务|开发|代码|编程|实现/, 'engineer'],
    [/design|\bui\b|\bux\b|front|theme|accessib|视觉|界面|样式|皮肤|动效|设计|前端|主题|无障碍|美术|插画|立绘|出图|绘制|美工|交互/, 'designer'],
    [/secur|audit|risk|threat|review|合规|风控|权限|审计|安全|审查|风险/, 'security'],
    [/docs|writer|author|edit|readme|product|spec|说明|手册|教程|文案|撰写|写作|作者|写手|文档|规范/, 'docs'],
    [/release|\bbuild\b|deploy|\bops\b|\bci\b|ship|coordin|部署|发布|上线|流水线|调度|编排|构建|运维|协调/, 'operator'],
];
/**
 * Vendor token per provider/model id, in match order. The model id is the
 * reliable half: one provider (`bailian`) serves several vendors.
 *
 * These tokens must stay identical to `ARTWORK_VENDORS` in the host half
 * (`../artwork-source.ts`); a token the host rejects would 404 the image.
 */
const VENDOR_ART = [
    [/\bdeepseek\b/, 'deepseek'],
    [/\bqwen[0-9a-z-]*\b|\btongyi\b|\b通义\b/, 'qwen'],
    [/\bchatglm\b|\bglm\b|\bzai\b|\bz\.ai\b|\bzhipu\b|\b智谱\b/, 'glm'],
    [/\bkimi\b|\bmoonshot\b/, 'kimi'],
    [/\bclaude\b|\banthropic\b/, 'claude'],
    [/\bgemini\b|\bgemma\b|\bgoogle\b/, 'gemini'],
    [/\bgrok\b|\bxai\b|\bx\.ai\b/, 'grok'],
    [/\bgpt\b|\bchatgpt\b|\bopenai\b|\bcodex\b|\bo[1-9]\b/, 'gpt'],
    [/\bhunyuan\b|\b混元\b|\btencent\b|\bhy-\w/, 'hunyuan'],
];
/** Chinese label map for role tokens.
 * Used by tests and as a reference lookup; the UI itself uses `labelKey` + `t()` for i18n.
 */
export const ROLE_LABELS = {
    engineer: '工程师',
    qa: '测试与质量',
    security: '安全与审计',
    researcher: '调研',
    designer: '设计与前端',
    docs: '文档与文案',
    data: '数据与分析',
    operator: '运维与发布',
    audio: '音频与语音',
    video: '视频与动画',
    'team-lead': '队长',
};
/**
 * Captain artwork. The vendor-specific name is requested first, and a custom
 * `team-lead-v2.png` still answers it through the host's degradation chain, so
 * the captain can be themed per vendor while one plain override keeps working.
 *
 * It deliberately avoids the packaged slug: that URL existed before any custom
 * directory did and had been served with a 24h cache, so a browser that already
 * held it kept replaying the packaged whale instead of asking for the override.
 * A name the browser has never seen cannot be shadowed by stale bytes.
 */
export const LEAD_ART = `${ART_BASE}team-lead-deepseek-v2.png`;
/** Large-preview artwork for the captain; degrades to {@link LEAD_ART}. */
export const LEAD_FULL_ART = `${ART_BASE}team-lead-deepseek-full-v2.png`;
/** Status action artwork per member activity. */
export const ACTION_ART = {
    working: `${ART_BASE}action-working-v2.png`,
    idle: `${ART_BASE}action-sleeping-v2.png`,
    unknown: `${ART_BASE}action-thinking-v2.png`,
};
/**
 * Vendor token behind a member's model route, when this build knows it.
 * @param member - a snapshot member carrying its `provider`/`model` route.
 * @returns the vendor token, or undefined to keep the role artwork.
 */
export function vendorSlug(member) {
    if (member === undefined)
        return undefined;
    const route = `${member.provider ?? ''} ${member.model ?? ''}`.toLowerCase().trim();
    if (route === '')
        return undefined;
    for (const [pattern, vendor] of VENDOR_ART) {
        if (pattern.test(route))
            return vendor;
    }
    return undefined;
}
/**
 * Strip directory-like and file-like tokens from role text.
 * Directory names (e.g. `team-site-test/`) contain `/` or `\`; file names
 * (e.g. `verify.ps1`, `curl.exe`, `HTML/CSS/JS`) contain a dot-extension.
 * These tokens are artifacts of the member's prompt / workspace, not role
 * nouns, and must not participate in role matching.
 */
function stripPathTokens(text) {
    return text
        .split(/\s+/)
        .filter((token) => !/[\/\\]/.test(token) && !/\.\w{1,6}$/.test(token))
        .join(' ');
}
/**
 * Role token for a member identity, or null when no role matches.
 * @param name - the member's display name.
 * @param role - the member's role text.
 */
export function memberRoleSlug(name, role) {
    // Match only against the member's name and the cleaned role description;
    // path/file tokens in the role text are intentionally ignored so that
    // directory names and filenames do not pollute role matching.
    const identity = `${name} ${stripPathTokens(role)}`.toLowerCase();
    for (const [pattern, art] of ROLE_ART) {
        if (pattern.test(identity))
            return art;
    }
    return null;
}
/**
 * Unified artwork resolver. Implements the client-side degradation chain:
 * role+vendor → role → vendor → initial-letter fallback.
 *
 * - If a role matches, request `member-<vendor>-<role>-v2.png` (or the generic
 *   role image when the vendor is unknown).
 * - If no role matches but the vendor is known, request the vendor-generic
 *   `member-<vendor>-v2.png` and mark it as a fallback.
 * - If neither role nor vendor is known, return null so the caller can fall back
 *   to the initial-letter badge.
 * @param options - member display name, role text, and optional vendor token.
 */
export function resolveMemberArtwork({ name: _name, role, vendor, }) {
    const slug = memberRoleSlug(_name, role);
    if (slug !== null) {
        return {
            url: vendor === undefined
                ? `${ART_BASE}member-${slug}-v2.png`
                : `${ART_BASE}member-${vendor}-${slug}-v2.png`,
            full: vendor === undefined
                ? `${ART_BASE}member-${slug}-full-v2.png`
                : `${ART_BASE}member-${vendor}-${slug}-full-v2.png`,
            role: slug,
            labelKey: `member.role.${slug}`,
            isFallback: false,
        };
    }
    if (vendor !== undefined) {
        return {
            url: `${ART_BASE}member-${vendor}-v2.png`,
            full: `${ART_BASE}member-${vendor}-full-v2.png`,
            role: null,
            labelKey: null,
            isFallback: true,
        };
    }
    return {
        url: null,
        full: null,
        role: null,
        labelKey: null,
        isFallback: false,
    };
}
/** Format the caption under the enlarged member/leader artwork preview. */
export function formatArtPreviewCaption({ name, labelKey, kind, t, }) {
    if (kind === 'captain')
        return name;
    if (labelKey !== null)
        return `${name} · ${t('member.art.rolePrefix')}${t(labelKey)}`;
    return `${name} · ${t('member.art.fallbackLabel')}`;
}
/**
 * Member artwork URL, or null when no role matches (initial-letter fallback).
 * @param name - the member's display name.
 * @param role - the member's role text.
 * @param vendor - optional vendor token from {@link vendorSlug}.
 * @returns the artwork URL, or null when unmatched.
 */
export function memberArtUrl(name, role, vendor) {
    const slug = memberRoleSlug(name, role);
    if (slug === null)
        return null;
    return vendor === undefined
        ? `${ART_BASE}member-${slug}-v2.png`
        : `${ART_BASE}member-${vendor}-${slug}-v2.png`;
}
/**
 * Vendor brand mark URL for the state badge, or null when the vendor is
 * unknown (the badge then keeps the packaged activity art). A missing file is
 * not fatal: the caller falls back on the image's error event.
 * @param vendor - vendor token from {@link vendorSlug}.
 */
export function brandArtUrl(vendor) {
    return vendor === undefined ? null : `${ART_BASE}brand-${vendor}.svg`;
}
/**
 * Large-preview artwork URL for the same member. Safe to request even when no
 * `-full` file exists: the host degrades to the avatar art.
 * @param name - the member's display name.
 * @param role - the member's role text.
 * @param vendor - optional vendor token from {@link vendorSlug}.
 * @returns the large-preview URL, or null when no role matched.
 */
export function memberFullArtUrl(name, role, vendor) {
    const slug = memberRoleSlug(name, role);
    if (slug === null)
        return null;
    return vendor === undefined
        ? `${ART_BASE}member-${slug}-full-v2.png`
        : `${ART_BASE}member-${vendor}-${slug}-full-v2.png`;
}
