#!/usr/bin/env node
/*
 * parsex-audit.mjs —— 全库技能 content 的「编译体检」
 *
 * 不猜、不启发式：对每个技能的 content 源码，**真的跑一遍引擎的 parsex 算法**
 * （照抄 game.js:12094-12133），然后统计编译结果里是否还有残留的 'step N' 字面量。
 *
 * 残留 = 该处替换被 parsex 的 try/catch 静默跳过 = 该步骤退化为惰性字符串、
 *        状态机整体错位，但文件照常加载、不报错。
 *
 * 用法：node parsex-audit.mjs <character目录> <index目录> [扩展目录...]
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const IDX = process.argv[3] || 'atlas/index';
const EXTRAS = process.argv.slice(4);

/* ---------- 照抄 game.js:12097 的注释剥离 ---------- */
const COMMENT_RE = /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg;

/* ---------- 照抄 game.js:12104-12129 的 step 替换 ---------- */
/* isGenerator：generator content 走 game.js:12164 的独立分支，**不做源码编译**，天然免疫 step 陷阱 */
function parsex(skillName, fnSrc, isGenerator) {
  if (isGenerator) {
    return { leftover: [], leftoverCount: 0, K: null, note: 'generator 分支：不编译源码' };
  }
  let str = fnSrc.toString().replace(COMMENT_RE, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);
  const leftover = [];
  let skip = 0, K = 0;

  if (str.indexOf('step 0') === -1) {
    return { leftover: [], leftoverCount: 0, K: null, note: '无 step 0（走单步分支）' };
  }
  for (let k = 0; k < 99; k++) {
    const reg = new RegExp(`['"]step ${k}['"]`);
    const m = str.slice(skip).match(reg);
    if (m == null) { K = k; break; }
    const insertStr = k === 0 ? `switch(step){case 0:` : `break;case ${k}:`;
    const abs = skip + m.index;
    const copy = str.slice(0, abs) + insertStr + str.slice(abs + m[0].length);
    try {
      new Function(copy);
      str = copy;
      skip = abs + insertStr.length;
    } catch (e) {
      leftover.push({ k, reason: e.message });
      k--;
      skip = abs + m[0].length;
    }
  }
  // 编译结果里仍存在的 step 字面量
  const rest = (str.match(/['"]step \d+['"]/g) || []);
  return { leftover, leftoverCount: rest.length, rest, K, compiled: str };
}

/* ---------- 字符串/注释感知的括号配对 ---------- */
/* braceStart 直接给「函数体开括号」的下标（不再 indexOf，避免命中参数里的 { player }） */
function findFunctionBody(text, braceStart) {
  if (braceStart < 0 || text[braceStart] !== '{') return null;
  let depth = 0, i = braceStart;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < text.length) { if (text[i] === '\\') { i += 2; continue; } if (text[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { open: braceStart, close: i }; }
    i++;
  }
  return null;
}

// 支持三种写法：content:function(...){ / content:function*(...){ / content(...){
// 结尾的 \{ 是函数体开括号；generator 由 function 后的 * 判定
const CONTENT_RE = /(?<![a-zA-Z_$])(content)\s*(?::\s*function\s*(\*)?\s*|(\*)\s*)?\([^)]*\)\s*\{/g;

function extractContents(src) {
  const out = [];
  let m;
  CONTENT_RE.lastIndex = 0;
  while ((m = CONTENT_RE.exec(src)) !== null) {
    // [过滤1] 跳过整行被 // 注释掉的 content（如十周年UI markskill.js 的 // content:function(storage,player){）
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    if (src.slice(lineStart, m.index).indexOf('//') !== -1) continue;
    // [过滤2] 跳过扩展壳自己的启用回调 content:function(config, pack){}
    //         它由 game.loadExtension 调用，**永远不会经过 parsex**，不是技能 content
    if (/\(\s*config\b/.test(m[0])) continue;

    const braceStart = m.index + m[0].length - 1;
    const body = findFunctionBody(src, braceStart);
    if (body) {
      const isGenerator = !!(m[2] || m[3]);
      out.push({ text: src.slice(m.index, body.close + 1), at: m.index, isGenerator });
    }
  }
  return out;
}

/* ---------- 扫描 ---------- */
const targets = [];
const packs = JSON.parse(fs.readFileSync(path.join(IDX, 'packs.json'), 'utf8')).filter((p) => p.packName);
for (const p of packs) {
  const src = fs.readFileSync(path.join(SRC, p.file), 'utf8');
  targets.push({ label: p.file, src, skills: p.skills });
}
for (const dir of EXTRAS) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    targets.push({ label: path.join(path.basename(dir), f), src: fs.readFileSync(path.join(dir, f), 'utf8'), skills: null });
  }
}

let totalSkills = 0, withSteps = 0, broken = 0, generators = 0, asyncCount = 0;
const brokenList = [];

for (const t of targets) {
  // 按技能切分：优先用 packs.json 的行区间；否则按 content 出现位置归属最近的上方标识符
  const contents = extractContents(t.src);
  for (const c of contents) {
    totalSkills++;
    if (/content\s*(?::\s*async\s*function\s*|:\s*async\s+|async\s+)\S*/.test(c.text)) asyncCount++;
    if (c.isGenerator) { generators++; continue; }   // generator 分支不做源码编译，天然免疫
    const stepN = (c.text.match(/['"]step ([1-9][0-9]*)['"]/g) || []).length;
    if (!stepN) continue;
    withSteps++;
    const r = parsex('?', c.text, false);
    if (r.leftoverCount > 0 || (r.leftover && r.leftover.length)) {
      broken++;
      const line = t.src.slice(0, c.at).split('\n').length;
      brokenList.push({ file: t.label, line, stepN, K: r.K, leftoverCount: r.leftoverCount, reasons: [...new Set((r.leftover || []).map((x) => x.reason))] });
    }
  }
}

console.log(`扫描 ${targets.length} 个文件`);
console.log(`含 content 的技能数：${totalSkills}`);
console.log(`  ├ generator content（不编译源码）：${generators}`);
console.log(`  ├ 疑似 async content（琉璃版不支持）：${asyncCount}`);
console.log(`  └ 含 'step >=1' 的技能：${withSteps}`);
console.log(`❌ 编译后仍有残留 step 字面量（= 状态机错位）：${broken}`);
console.log('');
if (brokenList.length) {
  console.log('文件'.padEnd(34) + '行'.padStart(7) + 'step数'.padStart(7) + '  残留  结束步K  原因');
  for (const b of brokenList.slice(0, 60)) {
    console.log(b.file.padEnd(34) + String(b.line).padStart(7) + String(b.stepN).padStart(7) + String(b.leftoverCount).padStart(6) + String(b.K).padStart(8) + '  ' + b.reasons.join(' | '));
  }
  if (brokenList.length > 60) console.log(`... 共 ${brokenList.length} 项`);
}

// 退出码：有状态机错位的技能即 1 —— 旧版恒返回 0，接不了 CI。
// ⚠ 注意本工具**只建模了 else 分支**。old 分支（疾速模式）下无 generator 判定、无 try/catch，
//   同一批技能里会有一部分直接 SyntaxError 硬崩。要覆盖 old 分支请用
//   verify-extension.mjs / lint-extension.mjs 的 C1（那两处是双分支的）。
process.exit(broken > 0 ? 1 : 0);
