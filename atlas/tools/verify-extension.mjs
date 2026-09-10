#!/usr/bin/env node
/*
 * verify-extension.mjs —— 扩展级双分支校验
 *
 * 教训来源：只建模 parsex 的一条分支会得出完全相反的结论。
 * 琉璃版 parsex 由 localStorage.finalParsex 分两条分支（game.js:12070-12091），
 * 本工具对扩展里**每一个 content** 分别在两条分支下编译，任一失败即报错。
 *
 * 用法：node atlas/tools/verify-extension.mjs <extension.js 路径>
 */

import fs from 'node:fs';

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node verify-extension.mjs <extension.js>'); process.exit(2); }

const GeneratorFunction = (function* () {}).constructor;
const gnc = { is: { generatorFunc: (x) => x instanceof GeneratorFunction } };
const COMMENT_RE = /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg;
const PARAMS = ['event', 'step', 'source', 'player', 'target', 'targets', 'card', 'cards', 'skill', 'forced', 'num', 'trigger', 'result', '_status', 'lib', 'game', 'ui', 'get', 'ai'];

/* [A] finalParsex == 'old' —— 无 generator 判断、无 try/catch */
function parsexOld(item) {
  let str = item.toString();
  str = str.slice(str.indexOf('{') + 1);
  if (str.indexOf('step 0') == -1) {
    str = '{if(event.step==1) {event.finish();return;}' + str;
  } else {
    for (var k = 1; k < 99; k++) {
      if (str.indexOf('step ' + k) == -1) break;
      str = str.replace(new RegExp("'step " + k + "'", 'g'), "break;case " + k + ":");
      str = str.replace(new RegExp('"step ' + k + '"', 'g'), "break;case " + k + ":");
    }
    str = str.replace(/'step 0'|"step 0"/, 'if(event.step==' + k + '){event.finish();return;}switch(step){case 0:');
  }
  if (!str) str = '';
  return new Function(...PARAMS, str);
}

/* [B] else 分支 —— generator 单列；普通函数走 Legacy（带 try/catch，非法处被静默跳过） */
function parsexElse(item) {
  if (typeof item === 'function' && gnc.is.generatorFunc(item)) return { kind: 'generator', ok: true };
  let str = item.toString().replace(COMMENT_RE, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);
  let skipped = 0;
  if (str.indexOf('step 0') == -1) {
    str = '{if(event.step==1) {event.finish();return;}\n' + str;
  } else {
    let skip = 0;
    for (let k = 0; k < 99; k++) {
      const reg = new RegExp(`['"]step ${k}['"]`);
      const m = str.slice(skip).match(reg);
      if (m == null) break;
      const ins = k === 0 ? 'switch(step){case 0:' : `break;case ${k}:`;
      const copy = str.slice(0, skip + m.index) + ins + str.slice(skip + m.index + m[0].length);
      try { new Function(copy); str = copy; skip += m.index + ins.length; }
      catch (e) { skipped++; k--; skip += m.index + m[0].length; }
    }
    str = `if(event.step==${'K'}){event.finish();return;}` + str;
  }
  const rest = (str.match(/['"]step \d+['"]/g) || []).length;
  const fn = new Function(...PARAMS, str);
  return { kind: 'Legacy', ok: true, skipped: rest };
}

/* ---------- 取扩展里的全部 content ---------- */
const src = fs.readFileSync(FILE, 'utf8');
const RE = /(?<![a-zA-Z_$])content\s*:\s*(function\s*\*?\s*)?\([^)]*\)\s*\{/g;
function bodyEnd(text, open) {
  let d = 0, i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < text.length) { if (text[i] === '\\') { i += 2; continue; } if (text[i] === q) { i++; break; } i++; } continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return i; }
    i++;
  }
  return -1;
}
const found = [];
let m;
while ((m = RE.exec(src)) !== null) {
  const open = m.index + m[0].length - 1;
  const close = bodyEnd(src, open);
  if (close < 0) continue;
  const line = src.slice(0, m.index).split('\n').length;
  const isGen = !!(m[1] && m[1].includes('*'));
  const text = src.slice(m.index, close + 1);
  found.push({ line, isGen, fnText: text.replace(/^content\s*:\s*/, 'content: ') });
}

/* ---------- 逐条编译 ---------- */
console.log(`文件：${FILE}（${(Buffer.byteLength(src) / 1024).toFixed(1)} KB）`);
console.log(`找到 content 定义 ${found.length} 个`);
console.log('');
console.log('行'.padStart(6) + '  类型'.padEnd(18) + 'A: old 分支'.padEnd(30) + 'B: else 分支');
console.log('-'.repeat(96));

let failA = 0, failB = 0, skipB = 0;
for (const f of found) {
  // 把源码文本还原成真函数，才能走 instanceof 判定
  let fn;
  try { fn = new Function('return (' + f.fnText.replace(/^content:\s*/, '') + ')')(); }
  catch (e) { console.log(String(f.line).padStart(6) + '  ❌ 还原失败 ' + e.message); continue; }

  const t = f.isGen ? 'GeneratorFunction' : 'Function';
  let a, b;
  try { parsexOld(fn); a = '✅ 可编译'; } catch (e) { a = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 26); failA++; }
  try { const r = parsexElse(fn); b = '✅ ' + r.kind + (r.skipped ? ` ⚠ 残留${r.skipped}处` : ''); if (r.skipped) skipB++; }
  catch (e) { b = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 26); failB++; }

  console.log(String(f.line).padStart(6) + '  ' + t.padEnd(18) + a.padEnd(30) + b);
}

console.log('');
console.log(`A(old) 失败 ${failA} 个　B(else) 失败 ${failB} 个　B 有残留 ${skipB} 个`);
console.log(failA === 0 && failB === 0 && skipB === 0
  ? '✅ 两条分支下均无问题 —— 该扩展在 finalParsex 任一取值下都能正常编译'
  : '❌ 存在兼容问题，见上表');
