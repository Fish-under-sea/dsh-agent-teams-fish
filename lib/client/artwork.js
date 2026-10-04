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
/** Role token per role keyword, in match order. */
const ROLE_ART = [
    [/data|analys|metric|performance|数据|分析|指标|性能/, 'data'],
    [/resear|investig|explor|study|研究|调查|探索|调研/, 'researcher'],
    // Match compound QA titles (for example "QA Engineer") before the broad
    // engineer bucket, otherwise an eight-role roster repeats the engineer art.
    [/\bqa\b|test|verif|quality|测试|质量|验证/, 'qa'],
    [/engineer|dev\b|server|backend|\bapi\b|runtime|watcher|contract|工程|后端|服务|接口|开发|代码|编程/, 'engineer'],
    [/design|\bui\b|\bux\b|front|theme|accessib|设计|前端|主题|无障碍/, 'designer'],
    [/secur|audit|risk|threat|review|安全|审计|审查|风险/, 'security'],
    [/docs|writer|product|spec|撰写|文案|写作|文档|规范/, 'docs'],
    [/release|\bbuild\b|deploy|\bops\b|\bci\b|ship|coordin|发布|构建|部署|运维|协调/, 'operator'],
];
/**
 * Vendor token per provider/model id, in match order. The model id is the
 * reliable half: one provider (`bailian`) serves several vendors.
 *
 * These tokens must stay identical to `ARTWORK_VENDORS` in the host half
 * (`../artwork-source.ts`); a token the host rejects would 404 the image.
 */
const VENDOR_ART = [
    [/deepseek/, 'deepseek'],
    [/qwen|tongyi|通义/, 'qwen'],
    [/chatglm|\bglm\b|zai|z\.ai|智谱/, 'glm'],
    [/kimi|moonshot/, 'kimi'],
    [/claude|anthropic/, 'claude'],
    [/gemini|gemma|google/, 'gemini'],
    [/grok|\bxai\b|x\.ai/, 'grok'],
    [/gpt|chatgpt|openai|codex/, 'gpt'],
    [/hunyuan|混元|tencent/, 'hunyuan'],
];
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
 * Role token for a member identity, or null when no role matches.
 * @param name - the member's display name.
 * @param role - the member's role text.
 */
export function memberRoleSlug(name, role) {
    const identity = `${name} ${role}`.toLowerCase();
    for (const [pattern, art] of ROLE_ART) {
        if (pattern.test(identity))
            return art;
    }
    return null;
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
