#!/usr/bin/env node
/*
 * extract-skill.mjs —— 按 <包>:<技能> 精确抽取技能源码
 *
 * 依赖 index-packs.mjs 生成的 packs.json（其中的行号区间）。
 * 用途：让「引用某个技能」变成可复现操作 —— 报告里写 `<包>:<技能>@<文件>:<行>`
 *       任何人一条命令即可取出同一段源码。
 *
 * 用法：
 *   node atlas/tools/extract-skill.mjs <character目录> <index目录> <包>:<技能> [...]
 *   node atlas/tools/extract-skill.mjs ... --no-line-numbers
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const NO_NUM = argv.includes('--no-line-numbers');
const args = argv.filter((a) => a !== '--no-line-numbers');

const [SRC, IDX, ...queries] = args;
if (!SRC || !IDX || !queries.length) {
  console.error('用法: node extract-skill.mjs <character目录> <index目录> <包>:<技能> [...]');
  process.exit(2);
}

const packs = JSON.parse(fs.readFileSync(path.join(IDX, 'packs.json'), 'utf8'));
const byPack = new Map(packs.filter((p) => p.packName).map((p) => [p.packName, p]));

const cache = new Map();
function linesOf(file) {
  if (!cache.has(file)) {
    cache.set(file, fs.readFileSync(path.join(SRC, file), 'utf8').split('\n'));
  }
  return cache.get(file);
}

for (const q of queries) {
  const i = q.lastIndexOf(':');
  const packName = q.slice(0, i);
  const skillName = q.slice(i + 1);

  const pack = byPack.get(packName);
  let owner = pack;
  let sk = pack && pack.skills.find((s) => s.name === skillName);
  let crossPack = null;

  // 技能是全局命名空间（lib.skill）—— 武将可以合法引用定义在别的包里的技能。
  // 因此本包找不到时，回退到全库搜索，并明确报出真正的定义位置。
  if (!sk) {
    const hits = [];
    for (const p of byPack.values()) {
      const hit = p.skills.find((s) => s.name === skillName);
      if (hit) hits.push({ pack: p, sk: hit });
    }
    if (hits.length) {
      owner = hits[0].pack;
      sk = hits[0].sk;
      crossPack = hits;
    }
  }

  if (!sk) {
    const pool = pack ? pack.skills : [...byPack.values()].flatMap((p) => p.skills);
    const near = pool.filter((s) => s.name.includes(skillName)).map((s) => s.name).slice(0, 8);
    console.log(`### ${q}\n\n全库中未找到技能 \`${skillName}\`。${near.length ? '相近：' + near.join(', ') : ''}\n`);
    continue;
  }

  const lines = linesOf(owner.file);
  const end = sk.endLine ?? sk.line;
  const body = lines.slice(sk.line - 1, end);
  const width = String(end).length;

  const owners = owner.characters
    .filter((c) => (c.skillRefs || []).includes(skillName))
    .map((c) => c.name);

  console.log(`### ${packName}:${skillName}`);
  console.log('');
  console.log(`- 位置：\`${owner.file}:${sk.line}-${end}\`（${end - sk.line + 1} 行）`);
  if (crossPack && packName !== owner.packName) {
    console.log(`- ⚠ 该技能**不**定义在包 \`${packName}\` 中（包内引用属全局命名空间），实际定义于包 \`${owner.packName}\``);
    if (crossPack.length > 1) {
      console.log(`- ⚠ **同名重复定义 ${crossPack.length} 处**：${crossPack.map((h) => `\`${h.pack.packName}\`@${h.pack.file}:${h.sk.line}`).join('、')} —— 加载序在后者覆盖前者`);
    }
  }
  console.log(`- 定义所在包：\`${owner.packName}\``);
  console.log(`- 引用武将：${owners.length ? owners.map((o) => '`' + o + '`').join('、') : '（无直接引用，多为衍生/子技能）'}`);
  console.log('');
  console.log('```js');
  body.forEach((ln, k) => {
    const n = sk.line + k;
    console.log(NO_NUM ? ln : String(n).padStart(width) + ' | ' + ln);
  });
  console.log('```');
  console.log('');
}
