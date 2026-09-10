#!/usr/bin/env node
/*
 * verify-extension.mjs —— 扩展级双分支编译校验（C1 专项）
 *
 * 教训来源：只建模 parsex 的一条分支会得出完全相反的结论。
 * 本工具对 skill:{} 内**每一个被 parsex 编译的字段**（content / precontent）
 * 分别在两条分支下编译，任一失败即报错，并设置退出码 —— 可直接接 CI。
 *
 * 用法：node atlas/tools/verify-extension.mjs <extension.js> [--json]
 * 退出码：0 = 全部通过；1 = 有失败或残留；2 = 用法/读取错误
 *
 * 完整的十项体检请用 lint-extension.mjs（本工具是它的 C1 专项视图）。
 */

import fs from 'node:fs';
import { parsexOld, parsexElse, extractCompiledFields, extractObjectBlock, lineOf, SKILL_FIELDS } from './parsex-model.mjs';

const FILE = process.argv[2];
if (!FILE || FILE.startsWith('--')) {
  console.error('用法: node atlas/tools/verify-extension.mjs <extension.js> [--json]');
  process.exit(2);
}
if (!fs.existsSync(FILE)) { console.error(`找不到文件：${FILE}`); process.exit(2); }
const JSON_OUT = process.argv.includes('--json');

const src = fs.readFileSync(FILE, 'utf8');

// ★ 只扫 skill:{} 内部 —— 扩展对象顶层的 precontent 由 loadExtension 直接调用、
//   不经过 parsex，整文件扫会产生假阳性（本工具旧版正是在这里和 parsex-audit 分歧的）。
const skillBlock = extractObjectBlock(src, 'skill');
if (!skillBlock) {
  console.error('没找到 skill:{} 块 —— 若这不是武将扩展请改用 lint-extension.mjs --cards');
  process.exit(2);
}
const found = extractCompiledFields(skillBlock.text, SKILL_FIELDS)
  .map((f) => ({ ...f, line: lineOf(src, skillBlock.open + f.index) }));

const rows = [];
let failA = 0, failB = 0, skipB = 0;
for (const f of found) {
  let fn;
  try { fn = new Function('return (' + f.fnText.replace(/^[\w$]+\s*:\s*/, '') + ')')(); }
  catch (e) { rows.push({ line: f.line, field: f.field, a: '还原失败', b: '还原失败', err: e.message }); failA++; continue; }

  let a, b;
  try { parsexOld(fn); a = '✅ 可编译'; } catch (e) { a = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 30); failA++; }
  try {
    const r = parsexElse(fn);
    b = '✅ ' + r.kind + (r.skipped ? ` ⚠ 残留${r.skipped}处` : '');
    if (r.skipped) skipB++;
  } catch (e) { b = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 30); failB++; }
  rows.push({ line: f.line, field: f.field, gen: f.isGen, a, b });
}

const bad = failA > 0 || failB > 0 || skipB > 0;
if (JSON_OUT) {
  console.log(JSON.stringify({ file: FILE, fields: found.length, failA, failB, skipB, rows }, null, 2));
} else {
  const L = [];
  L.push(`文件：${FILE}（${(Buffer.byteLength(src) / 1024).toFixed(1)} KB）`);
  L.push(`skill:{} 内找到被 parsex 编译的字段 ${found.length} 个`);
  L.push('');
  L.push('行'.padStart(6) + '  类型'.padEnd(18) + 'A: old 分支'.padEnd(32) + 'B: else 分支');
  L.push('-'.repeat(98));
  for (const r of rows) {
    L.push(String(r.line).padStart(6) + '  ' + (r.gen ? 'GeneratorFunction' : 'Function').padEnd(18)
      + String(r.a).padEnd(32) + r.b);
  }
  L.push('');
  L.push(`A(old) 失败 ${failA} 个　B(else) 失败 ${failB} 个　B 有残留 ${skipB} 个`);
  L.push(bad
    ? '❌ 存在兼容问题，见上表（退出码 1）'
    : '✅ 两条分支下均无问题 —— 该扩展在 finalParsex 任一取值下都能正常编译');
  console.log(L.join('\n'));
}
process.exit(bad ? 1 : 0);
