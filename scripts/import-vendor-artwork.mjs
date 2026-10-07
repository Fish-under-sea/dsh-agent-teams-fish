// 把 <from> 目录里的厂商美术导入插件包 assets/agent-teams/。
// 包内目录的查找**只认候选链里的名字**（host 端对内置目录不做 -v2 别名回退），
// 所以所有无 -v2 的源文件必须补上后缀，否则「文件在包里但请求永远落空」。
// 用法：node import-vendor-artwork.mjs --from <dir> [--apply]
import { readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDORS = ['deepseek', 'qwen', 'glm', 'kimi', 'claude', 'gemini', 'grok', 'gpt', 'hunyuan'];
const ROLES = ['engineer', 'qa', 'security', 'researcher', 'designer', 'docs', 'data', 'operator'];
const V = `(?:${VENDORS.join('|')})`;
const RULES = [
  // 厂商 + 岗位、厂商通用、厂商立绘：补 -v2
  [new RegExp(`^member-(${V})-(${ROLES.join('|')})\\.png$`, 'u'), (m) => `member-${m[1]}-${m[2]}-v2.png`],
  [new RegExp(`^member-(${V})-v2\\.png$`, 'u'), (m) => `member-${m[1]}-v2.png`],
  [new RegExp(`^member-(${V})-full-v2\\.png$`, 'u'), (m) => `member-${m[1]}-full-v2.png`],
  // 队长立绘：候选链要的是 team-lead-<vendor>-v2.png
  [new RegExp(`^team-lead-(${V})\\.png$`, 'u'), (m) => `team-lead-${m[1]}-v2.png`],
  [new RegExp(`^brand-(${V})\\.svg$`, 'u'), (m) => `brand-${m[1]}.svg`],
];

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
if (fromIndex === -1 || args[fromIndex + 1] === undefined) {
  console.error('usage: node import-vendor-artwork.mjs --from <dir> [--apply]');
  process.exit(2);
}
const apply = args.includes('--apply');
const sourceDir = resolve(args[fromIndex + 1]);
await stat(sourceDir); // 源目录不存在时直接失败，避免导入 0 个文件还报成功
const targetDir = fileURLToPath(new URL('../assets/agent-teams/', import.meta.url));
await mkdir(targetDir, { recursive: true });

const sources = (await readdir(sourceDir)).sort();
const plan = [];
const skipped = [];
const unknown = [];
for (const name of sources) {
  if (name.endsWith('.md') || name.includes('_dummy_')) {
    skipped.push(name);
    continue;
  }
  // 包内基线（内置鲸鱼队长）永远由仓库自己管，外部目录不得覆盖。
  if (name === 'team-lead-v2.png') {
    skipped.push(`${name} (内置基线，交给仓库维护)`);
    continue;
  }
  let target;
  for (const [pattern, rename] of RULES) {
    const match = pattern.exec(name);
    if (match !== null) {
      target = rename(match);
      break;
    }
  }
  if (target === undefined) {
    unknown.push(name);
    continue;
  }
  plan.push({ name, target });
}
if (unknown.length > 0) {
  console.error(`无法识别的文件（不猜命名，请先归类）：${JSON.stringify(unknown)}`);
  process.exit(2);
}
console.log(`${apply ? '导入' : '预演'}：${plan.length} 个文件 ${apply ? '→' : '将写入'} ${targetDir}`);
console.log(`跳过：${skipped.length} 个（${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ', …' : ''}）`);
const renamed = plan.filter(entry => entry.name !== entry.target);
console.log(`其中需要改名：${renamed.length} 个，例如 ${renamed.slice(0, 3).map(e => `${e.name} → ${e.target}`).join('；')}`);
if (!apply) {
  console.log('未写入任何文件（加 --apply 才落地）。');
  process.exit(0);
}
for (const { name, target } of plan) await copyFile(join(sourceDir, name), join(targetDir, target));
console.log(`完成：写入 ${plan.length} 个文件。`);