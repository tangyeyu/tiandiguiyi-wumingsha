#!/usr/bin/env node
/*
 * classify-skills.mjs —— 技能范式普查 + 样例推荐
 *
 * 依赖 index-packs.mjs 生成的 packs.json（含每个技能的行号区间），
 * 按行切片后用特征标记做普查，不重复做词法分析。
 *
 * 用法：
 *   node atlas/tools/classify-skills.mjs <character目录> <index目录> [输出目录]
 *
 * 产出：
 *   <out>/census.md    各范式使用统计
 *   <out>/samples.md   每个范式「最小且最干净」的候选清单（文件:行 + 行数）
 *   <out>/census.json  机器可读
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const IDX = process.argv[3] || path.resolve('atlas/index');
const OUT = process.argv[4] || IDX;

if (!SRC) {
  console.error('用法: node classify-skills.mjs <character目录> <index目录> [输出目录]');
  process.exit(2);
}

const packs = JSON.parse(fs.readFileSync(path.join(IDX, 'packs.json'), 'utf8'));

/* ------------------------------------------------------------------ *
 * 特征表：每项 = { 名称, 判定正则, 说明 }
 * 正则只作用于「该技能自身的行区间」，不会跨技能误判。
 * ------------------------------------------------------------------ */
const FEATURES = [
  ['触发技', /\btrigger\s*:/, '声明 trigger，由引擎在对应事件点激活'],
  ['锁定技', /\bforced\s*:\s*true/, '强制发动，跳过询问'],
  ['主动技', /enable\s*:\s*['"]phaseUse['"]/, '出牌阶段主动发动'],
  ['限一次', /\busable\s*:/, '每阶段发动次数上限'],
  ['限定技', /\blimited\s*:\s*true/, '全局一次，配 awakenSkill'],
  ['觉醒技', /\bjuexingji\s*:\s*true/, '觉醒技标签，供检索与排除'],
  ['觉醒执行', /awakenSkill\(/, '退役自身并写入 awakenedSkills'],
  ['继承', /\binherit\s*:/, '复用另一技能的实现'],
  ['子技能', /\bsubSkill\s*:/, '派生 xxx_yyy，自动 sub=true'],
  ['转化技', /\bviewAs\s*:/, '声明"视为使用某牌"'],
  ['按钮选择', /\bchooseButton\s*:/, '以按钮组代替选牌'],
  ['不消耗牌', /selectCard\s*:\s*-1/, '零实体牌发动'],
  ['precontent 钩', /\bprecontent\s*:/, '转化技使用前的副作用钩子'],
  ['backup 派生', /\bbackup\s*:\s*function/, '由 chooseButton 生成转化技能'],
  ['sourceSkill', /\bsourceSkill\s*:/, '标注 backup 归属的主技能（防递归/供日志）'],
  ['mod 钩子', /\bmod\s*:\s*\{[\s\S]*?\b(ignoredHandcard|cardDiscardable|cardUsable|cardEnabled|targetEnabled|cardnumber|cardsuit|cardname|globalTo)/, '改写引擎规则查询（不产生事件，纯查询期干预）'],
  ['global 技', /\bglobal\s*:\s*['"]/, '给全场玩家挂载技能'],
  ['addSkillLog', /addSkillLog\(/, '授予技能并记入技能获得日志'],
  ['unique/gainable', /\bunique\s*:\s*true|\bgainable\s*:\s*true/, '参与"获得技能"体系（可被夺取/复制）'],
  ['direct 静默', /\bdirect\s*:\s*true/, '发动时不弹技能名，由 AI/条件直接生效'],
  ['locked 沉默', /\blocked\s*:\s*true/, '发动时不播放技能动画/配音'],
  ['shaRelated', /\bshaRelated\s*:\s*true/, '声明与【杀】相关（影响 AI 与牌堆查询）'],
  ['响应技', /\brespondTo\s*:|chooseToRespond/, '响应他人结算'],
  ['多步状态机', /['"]step\s+[1-9]\d*['"]/, '含 step>=1，说明有多步流程'],
  ['取消事件', /\.cancel\(\)/, '取消当前事件（如免伤）'],
  ['改写伤害', /event\.damage\s*(\+\+|--|[-+*/]?=)|\.baseDamage\s*(\+\+|--|[-+*/]?=)/, '直接调整伤害值'],
  ['改判定', /\bjudge2\s*:|\bfixedResult\b/, '干预判定结果'],
  ['标记', /addMark\(|markSkill\(|countMark\(|hasMark\(/, '使用标记显示与计数'],
  ['storage 状态', /\.storage[.\[]|storage\s*:/, '以 storage 存持久状态'],
  ['读原始触发', /\btrigger\./, '在 content 里回溯触发源事件'],
  ['用 result', /\bresult\.(bool|targets|control|cards|links)/, '读取上一步选择结果'],
  ['用 cards', /\bcards\.(filterInD|length)|\bcard\./, '处理事件牌集'],
  ['AI 权重', /\bai\s*:\s*\{[\s\S]*?\border\s*:/, '声明 AI 发动优先度'],
  ['check 函数', /\bcheck\s*:\s*function/, 'AI 是否发动的判定'],
  ['charlotte', /\bcharlotte\s*:\s*true/, '隐藏技能，不进技能表'],
  ['派生声明', /\bderivation\s*:/, '声明衍生技能，供展示与 AI'],
  ['动态占位', /\$\{/, '含模板串，属运行期生成'],
];

const census = new Map();
for (const [name] of FEATURES) census.set(name, []);

const skillIndex = [];

for (const pack of packs) {
  if (!pack.packName) continue;
  const full = path.join(SRC, pack.file);
  let src;
  try { src = fs.readFileSync(full, 'utf8'); } catch { continue; }
  const lines = src.split('\n');

  for (const sk of pack.skills) {
    if (!sk.endLine || sk.endLine < sk.line) continue;
    const body = lines.slice(sk.line - 1, sk.endLine).join('\n');
    const nLines = sk.endLine - sk.line + 1;
    const hits = [];
    for (const [name, re] of FEATURES) {
      if (re.test(body)) { hits.push(name); census.get(name).push({ pack: pack.packName, file: pack.file, skill: sk.name, line: sk.line, lines: nLines }); }
    }
    skillIndex.push({ pack: pack.packName, file: pack.file, skill: sk.name, line: sk.line, endLine: sk.endLine, lines: nLines, hits });
  }
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

const total = skillIndex.length;
const sizes = skillIndex.map((s) => s.lines).sort((a, b) => a - b);
const pct = (p) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))];

const clean = (s) => /^[a-z0-9_]+$/i.test(s.skill);

const censusRows = FEATURES.map(([name, , desc]) => {
  const list = census.get(name);
  const packs = new Set(list.map((x) => x.pack)).size;
  return `| ${name} | ${list.length} | ${((list.length / total) * 100).toFixed(1)}% | ${packs} | ${desc} |`;
});

const mdCensus = [
  '# 技能范式普查',
  '',
  `> 由 \`atlas/tools/classify-skills.mjs\` 自动生成。样本：**${total}** 个技能定义，跨 **${packs.filter((p) => p.packName).length}** 个武将包。`,
  '',
  '## 技能体量分布（行）',
  '',
  `- 中位数 **${pct(0.5)}**　P75 **${pct(0.75)}**　P90 **${pct(0.9)}**　P99 **${pct(0.99)}**　最大 **${sizes[sizes.length - 1]}**`,
  `- ≤10 行：**${sizes.filter((n) => n <= 10).length}** 个　≤30 行：**${sizes.filter((n) => n <= 30).length}** 个　>200 行：**${sizes.filter((n) => n > 200).length}** 个`,
  '',
  '> 读法：绝大多数技能是短小的。**先用最小范式写对，再叠加复杂度** —— 这正是本 atlas 的取样原则。',
  '',
  '## 范式使用统计',
  '',
  '| 范式 | 次数 | 占比 | 覆盖包数 | 说明 |',
  '|---|---:|---:|---:|---|',
  ...censusRows,
  '',
].join('\n');

fs.writeFileSync(path.join(OUT, 'census.md'), mdCensus, 'utf8');

/* 每个范式推荐「最小且干净」样例 */
const SAMPLES_PER_FEATURE = 14;
const sampleBlocks = [];

for (const [name, , desc] of FEATURES) {
  const list = census.get(name)
    .filter((x) => clean(x) && x.lines >= 6)
    .sort((a, b) => a.lines - b.lines);

  // 同一包最多取 2 个，保证跨包多样性
  const picked = [];
  const perPack = new Map();
  for (const x of list) {
    const c = perPack.get(x.pack) || 0;
    if (c >= 2) continue;
    perPack.set(x.pack, c + 1);
    picked.push(x);
    if (picked.length >= SAMPLES_PER_FEATURE) break;
  }

  sampleBlocks.push(
    `### ${name}`,
    '',
    `${desc}　—— 共 ${census.get(name).length} 处。`,
    '',
    '| 包 | 技能 | 位置 | 行数 |',
    '|---|---|---|---:|',
    ...picked.map((x) => `| \`${x.pack}\` | \`${x.skill}\` | \`${x.file}:${x.line}\` | ${x.lines} |`),
    ''
  );
}

const mdSamples = [
  '# 范式样例推荐（按体量升序，跨包去重）',
  '',
  '> 由 `atlas/tools/classify-skills.mjs` 自动生成。',
  '> 选取原则：**行数最少、技能名干净、同一包最多 2 个** —— 目的是拿到每个范式最纯粹的最小实现。',
  '',
  ...sampleBlocks,
].join('\n');

fs.writeFileSync(path.join(OUT, 'samples.md'), mdSamples, 'utf8');
fs.writeFileSync(path.join(OUT, 'census.json'), JSON.stringify({ total, sizes: { p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), max: sizes[sizes.length - 1] }, features: Object.fromEntries([...census].map(([k, v]) => [k, v.length])), skills: skillIndex }, null, 1), 'utf8');

console.log(`技能总数 ${total} | 中位行数 ${pct(0.5)} | 最大 ${sizes[sizes.length - 1]}`);
console.log('');
console.log('范式'.padEnd(16) + '次数'.padStart(6) + '  覆盖包');
for (const [name] of FEATURES) {
  const list = census.get(name);
  console.log(name.padEnd(16) + String(list.length).padStart(6) + '  ' + new Set(list.map((x) => x.pack)).size);
}
console.log('');
console.log(`输出 -> ${path.join(OUT, 'census.md')}`);
console.log(`输出 -> ${path.join(OUT, 'samples.md')}`);
