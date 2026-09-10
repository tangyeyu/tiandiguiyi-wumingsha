#!/usr/bin/env node
/*
 * parsex-probe.mjs —— 把引擎的 parsex 编译逻辑抽出来，实测指定 content 编译后的形态
 *
 * 逻辑照抄 琉璃版 5.5 game/game.js:12094-12133（Legacy 分支），
 * 唯一改动：不真正 new Function（避免副作用），只在替换后做语法校验。
 *
 * 用法：node parsex-probe.mjs <扩展js路径> <技能名> [起始行 结束行]
 */

import fs from 'node:fs';

const [file, skillName, a, b] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

// 粗略取出该技能对象的源码行范围（用于观察），编译测试用整段 content 文本
const from = a ? +a : 1;
const to = b ? +b : lines.length;
let body = lines.slice(from - 1, to).join('\n');

// 抠出 content:function(){ ... } 的函数源码文本
function extractFunction(text) {
  const m = /content\s*:\s*function\s*\([^)]*\)\s*\{/.exec(text);
  if (!m) return null;
  const braceStart = text.indexOf('{', m.index + m[0].length - 1);
  let depth = 0, j = braceStart;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return text.slice(m.index, j).trim();
}

const fnText = extractFunction(body);
if (!fnText) { console.error('未找到 content:function'); process.exit(1); }

// ── 照抄 game.js:12097 ── 去注释
let str = fnText.toString()
  .replace(/((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg, '$2')
  .trim();

// ── 照抄 game.js:12099 ── 切掉签名
str = str.slice(str.indexOf('{') + 1);

// ── 照抄 game.js:12104-12129 ── step 替换
const trace = [];
let skip = 0;
for (let k = 0; k < 99; k++) {
  const reg = new RegExp(`['"]step ${k}['"]`);
  const m = str.slice(skip).match(reg);
  if (m == null) { trace.push(`k=${k}: 未找到 -> break (最终 K=${k})`); break; }
  const insertStr = k === 0 ? `switch(step){case 0:` : `break;case ${k}:`;
  const abs = skip + m.index;
  trace.push(`k=${k}: 在偏移 ${abs} 处替换 ${m[0]} -> ${insertStr}`);
  const copy = str.slice(0, abs) + insertStr + str.slice(abs + m[0].length);
  try {
    new Function(copy);            // 语法校验（不执行）
    str = copy;
    skip = abs + insertStr.length;
  } catch (e) {
    trace.push(`      语法非法，跳过该处：${e.message}`);
    k--;
    skip = abs + m[0].length;
  }
}

console.log('=== parsex 替换轨迹 ===');
trace.forEach((t) => console.log('  ' + t));
console.log('');
console.log('=== 剩余未被替换的 step 字面量（应为 0 个）===');
const leftover = str.match(/['"]step \d+['"]/g);
console.log(leftover ? leftover.join(', ') : '（无）');
console.log('');
console.log('=== 编译后 else 分支附近（观察是否留下惰性字符串）===');
// 打印包含 else 的段落
const idx = str.indexOf('} else {');
if (idx < 0) console.log('（未找到 else）');
else {
  str.slice(idx, idx + 220).split('\n').forEach((l) => { if (l.trim()) console.log('  ' + l.trim()); });
}
console.log('');
console.log('=== 编译后是否只剩单份 case（重复 case 检查）===');
const cases = (str.match(/case \d+:/g) || []);
console.log('  ' + cases.join(' '));
const dup = cases.filter((c, i) => cases.indexOf(c) !== i);
console.log('  重复 case：' + (dup.length ? [...new Set(dup)].join(', ') : '（无）'));
