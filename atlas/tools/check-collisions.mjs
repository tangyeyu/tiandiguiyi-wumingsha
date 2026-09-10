#!/usr/bin/env node
/*
 * check-collisions.mjs —— 命名空间体检
 *
 * 无名杀的 lib.skill / lib.character 是**全局命名空间**：所有武将包合并进同一张表，
 * 加载序在后者静默覆盖前者。因此下面三类问题都属于"技能写不对"的根因，且不会报错：
 *
 *   1. 技能名跨包重复 → 后加载的包覆盖先加载的，先加载的武将技能行为被改写
 *   2. 武将 id 跨包重复 → 同上，选将界面出现同一 id 的两种定义
 *   3. 悬空技能引用   → 武将数组里列了某技能名，但全库没有任何包定义它（技能永不发动）
 *
 * 用法：
 *   node atlas/tools/check-collisions.mjs <index目录> [输出目录] [--app <游戏app根目录>]
 *
 * 注意：技能定义**不只**存在于 character/ 下。引擎内建技能定义在 game/game.js，
 * 模式专属技能在 mode/*.js，扩展技能在 extension/**。若不提供 --app 做补充扫描，
 * 「悬空引用」会产生假阳性 —— 因此带上 --app 才能得到可信结论。
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const appIdx = argv.indexOf('--app');
const APP = appIdx >= 0 ? argv[appIdx + 1] : null;
const rest = argv.filter((a, i) => a !== '--app' && i !== appIdx + 1);

const IDX = rest[0] || path.resolve('atlas/index');
const OUT = rest[1] || IDX;

const packs = JSON.parse(fs.readFileSync(path.join(IDX, 'packs.json'), 'utf8'))
  .filter((p) => p.packName);

/* ---- 1. 技能名重复 ---- */
const skillDefs = new Map(); // name -> [{pack,file,line}]
for (const p of packs) {
  for (const s of p.skills) {
    if (!skillDefs.has(s.name)) skillDefs.set(s.name, []);
    skillDefs.get(s.name).push({ pack: p.packName, file: p.file, line: s.line });
  }
}
const dupSkills = [...skillDefs].filter(([, v]) => v.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

/* ---- 2. 武将 id 重复 ---- */
const charDefs = new Map();
for (const p of packs) {
  for (const c of p.characters) {
    if (!charDefs.has(c.name)) charDefs.set(c.name, []);
    charDefs.get(c.name).push({ pack: p.packName, file: p.file, line: c.line });
  }
}
const dupChars = [...charDefs].filter(([, v]) => v.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

/* ---- 3. 悬空技能引用 ---- */
const dangling = [];
for (const p of packs) {
  for (const c of p.characters) {
    for (const sk of c.skillRefs || []) {
      if (!skillDefs.has(sk)) dangling.push({ pack: p.packName, char: c.name, skill: sk, line: c.line });
    }
  }
}

/* ---- 补充扫描：character/ 之外的技能定义来源 ----
 * 引擎内建（game/game.js）、模式专属（mode/*.js）、扩展（extension/**）都会注册
 * 到同一个 lib.skill。不做这一步，「悬空引用」会误报。 */
const elsewhere = new Map(); // skillName -> [相对路径]
let scanned = 0;
if (APP) {
  const NAMES = new Set(dangling.map((d) => d.skill));
  const SKIP = new Set(['node_modules', '.git', 'Home', 'image', 'audio', 'font', 'cache']);
  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|ts|mjs)$/.test(e.name)) continue;
      let txt;
      try { txt = fs.readFileSync(full, 'utf8'); } catch { continue; }
      scanned++;
      for (const name of NAMES) {
        // 只认可"作为对象键定义"的形态，避免把引用/字符串当定义
        if (new RegExp(`(^|[\\s,{])${name}\\s*:\\s*(\\{|function|\\()`, 'm').test(txt)) {
          if (!elsewhere.has(name)) elsewhere.set(name, []);
          elsewhere.get(name).push(path.relative(APP, full).replace(/\\/g, '/'));
        }
      }
    }
  };
  walk(APP);
}

const danglingBySkill = new Map();
for (const d of dangling) {
  if (!danglingBySkill.has(d.skill)) danglingBySkill.set(d.skill, []);
  danglingBySkill.get(d.skill).push(d);
}

// 区分"真悬空"与"定义在 character/ 之外"
const trulyDangling = [];
const resolvedElsewhere = [];
for (const [skill, refs] of danglingBySkill) {
  if (elsewhere.has(skill)) resolvedElsewhere.push({ skill, refs, where: elsewhere.get(skill) });
  else trulyDangling.push({ skill, refs });
}

/* ---- 4. 孤儿技能（有定义但无人引用） ---- */
const referenced = new Set();
for (const p of packs) {
  for (const c of p.characters) for (const sk of c.skillRefs || []) referenced.add(sk);
  for (const s of p.skills) {
    // 子技能 xxx_yyy / 衍生 / 继承 都可能被间接引用，保守处理：只统计显式 _ 派生
  }
}
const orphanSkills = [...skillDefs.keys()].filter((n) => !referenced.has(n));

/* ---- 输出 ---- */
fs.mkdirSync(OUT, { recursive: true });

const L = [];
L.push('# 命名空间体检报告', '');
L.push('> 由 `atlas/tools/check-collisions.mjs` 自动生成。');
L.push('> `lib.skill` / `lib.character` 是**全局命名空间**：所有包合并进同一张表，');
L.push('> 加载序在后者**静默覆盖**前者 —— 下面三类问题都不会抛错，只会表现成"技能莫名其妙不生效"。');
L.push('');
L.push('## 摘要', '');
L.push('| 检查项 | 数量 |');
L.push('|---|---:|');
L.push(`| 技能定义总数 | ${skillDefs.size} |`);
L.push(`| **技能名跨包重复** | ${dupSkills.length} |`);
L.push(`| 武将 id 跨包重复 | ${dupChars.length} |`);
L.push(`| **真悬空技能引用** | ${trulyDangling.length} |`);
L.push(`| 定义在 character/ 之外的被引用技能 | ${resolvedElsewhere.length} |`);
L.push(`| 未被任何武将显式引用的技能 | ${orphanSkills.length} |`);
L.push('');

L.push('## 1. 技能名跨包重复（覆盖风险）', '');
if (!dupSkills.length) L.push('无。', '');
else {
  L.push('| 技能名 | 定义处 |', '|---|---|');
  for (const [name, list] of dupSkills.slice(0, 120)) {
    L.push(`| \`${name}\` | ${list.map((d) => `\`${d.pack}\`@\`${d.file}:${d.line}\``).join('、')} |`);
  }
  if (dupSkills.length > 120) L.push('', `> 共 ${dupSkills.length} 项，上表为前 120 项。完整数据见 \`collisions.json\`。`);
  L.push('');
}

L.push('## 2. 武将 id 跨包重复', '');
if (!dupChars.length) L.push('无。', '');
else {
  L.push('| 武将 id | 定义处 |', '|---|---|');
  for (const [name, list] of dupChars.slice(0, 120)) {
    L.push(`| \`${name}\` | ${list.map((d) => `\`${d.pack}\`@\`${d.file}:${d.line}\``).join('、')} |`);
  }
  if (dupChars.length > 120) L.push('', `> 共 ${dupChars.length} 项，上表为前 120 项。`);
  L.push('');
}

L.push('## 3. 技能引用解析情况', '');
L.push(`武将数组共引用 ${referenced.size} 个技能名，其中：`, '');
L.push(`- 定义在本目录 \`character/\` 内：**${referenced.size - danglingBySkill.size}**`, '');
L.push(`- 定义在 \`character/\` 之外（引擎内建 / 模式专属 / 扩展）：**${resolvedElsewhere.length}**`, '');
L.push(`- **全库无定义（真悬空）**：**${trulyDangling.length}**`, '');
L.push('');
if (APP) {
  L.push(`> 补充扫描已启用（\`--app\`），遍历 ${scanned} 个 js/ts 文件确认外部定义。`, '');
} else {
  L.push('> ⚠ 未提供 `--app`，下表**未**排除引擎内建与扩展中定义的技能，可能含假阳性。', '');
}
L.push('');

if (resolvedElsewhere.length) {
  L.push('### 3a. 定义在 character/ 之外（非缺陷）', '');
  L.push('这些技能由引擎或扩展注册，属正常跨来源引用。', '');
  L.push('| 技能名 | 定义处 | 引用武将 |', '|---|---|---|');
  for (const r of resolvedElsewhere) {
    const who = r.refs.slice(0, 4).map((d) => `\`${d.char}\`(${d.pack})`).join('、');
    L.push(`| \`${r.skill}\` | ${r.where.slice(0, 3).map((w) => '`' + w + '`').join('、')} | ${who}${r.refs.length > 4 ? ` 等 ${r.refs.length} 个` : ''} |`);
  }
  L.push('');
}

L.push('### 3b. 真悬空引用（技能永不发动）', '');
if (!trulyDangling.length) L.push('无。', '');
else {
  L.push('武将数组里列了技能名，但全库（含引擎/模式/扩展）都没有定义 —— 该技能**永远不会发动**，');
  L.push('且在选将界面会显示为一个空技能框。', '');
  L.push('| 缺失技能名 | 引用武将（包） |', '|---|---|');
  for (const r of trulyDangling.sort((a, b) => b.refs.length - a.refs.length)) {
    const who = r.refs.map((d) => `\`${d.char}\`(${d.pack}:${d.line})`).join('、');
    L.push(`| \`${r.skill}\` | ${who} |`);
  }
  L.push('');
}

L.push('## 4. 未被显式引用的技能', '');
L.push(`共 ${orphanSkills.length} 个。多数属正常：子技能（\`xxx_yyy\`）、`);
L.push('\`inherit\`/\`group\` 间接引用、\`derivation\` 衍生技、双将切换形态等。');
L.push('仅当某个**应为主动技**的技能出现在此表时，才说明武将数组漏列（技能不会出现在技能框）。');
L.push('');
L.push('<details><summary>展开清单</summary>', '');
L.push(orphanSkills.slice(0, 400).map((n) => '`' + n + '`').join('、'));
L.push('', '</details>', '');

fs.writeFileSync(path.join(OUT, 'collisions.md'), L.join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'collisions.json'), JSON.stringify({
  dupSkills: dupSkills.map(([n, v]) => ({ name: n, defs: v })),
  dupChars: dupChars.map(([n, v]) => ({ name: n, defs: v })),
  trulyDangling: trulyDangling.map((r) => ({ skill: r.skill, refs: r.refs })),
  resolvedElsewhere: resolvedElsewhere.map((r) => ({ skill: r.skill, where: r.where, refs: r.refs })),
  orphanCount: orphanSkills.length,
}, null, 1), 'utf8');

console.log(`技能定义 ${skillDefs.size} | 技能名重复 ${dupSkills.length} | 武将 id 重复 ${dupChars.length}`);
console.log(`引用技能名 ${referenced.size} | 真悬空 ${trulyDangling.length} | 定义在 character/ 之外 ${resolvedElsewhere.length} | 未被显式引用 ${orphanSkills.length}`);
console.log(APP ? `补充扫描 ${scanned} 个文件` : '（未提供 --app，悬空判定可能含假阳性）');
console.log(`输出 -> ${path.join(OUT, 'collisions.md')}`);
console.log('');
if (trulyDangling.length) {
  console.log('真悬空引用:');
  for (const r of trulyDangling) console.log(`  ${r.skill.padEnd(20)} <- ${r.refs.map((d) => d.char + '(' + d.pack + ':' + d.line + ')').join(', ')}`);
  console.log('');
}
console.log('技能名重复 TOP 15:');
for (const [name, list] of dupSkills.slice(0, 15)) {
  console.log(`  ${name.padEnd(24)} ${list.length} 处  ${list.map((d) => d.pack + ':' + d.line).join(' | ')}`);
}
