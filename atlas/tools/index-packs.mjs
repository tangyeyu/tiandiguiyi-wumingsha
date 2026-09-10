#!/usr/bin/env node
/*
 * index-packs.mjs —— 无名杀武将包结构扫描器
 *
 * 设计原则：**绝不执行目标代码**。只做词法切分 + 括号配对，
 * 因为 character/*.js 在加载期会读 window/lib/game 且含第三方式全局，
 * eval 化必然污染且不可靠。
 *
 * 用法：
 *   node atlas/tools/index-packs.mjs <character目录> [输出目录]
 *
 * 产出：
 *   <out>/packs.json   机器可读全量索引（包名/武将/技能/行号）
 *   <out>/packs.md     人读汇总表
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3] || path.resolve('atlas/index');

if (!SRC) {
  console.error('用法: node index-packs.mjs <character目录> [输出目录]');
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * 1. 词法切分
 * ------------------------------------------------------------------ */

const PUNCT3 = ['===', '!==', '**=', '<<=', '>>=', '...', '>>>'];
const PUNCT2 = [
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**',
];

// 判断 `/` 是否应视为正则字面量起始。
// 依据：前一个有意义的记号不是"值"（标识符/数字/字符串/右括号）时，`/` 只能是正则。
function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.type === 'num' || prev.type === 'str') return false;
  if (prev.type === 'ident') return prev.value === 'return' || prev.value === 'typeof' ||
    prev.value === 'case' || prev.value === 'in' || prev.value === 'of' ||
    prev.value === 'do' || prev.value === 'else' || prev.value === 'void' ||
    prev.value === 'delete' || prev.value === 'instanceof' || prev.value === 'new';
  if (prev.type === 'punct') return !(prev.value === ')' || prev.value === ']' || prev.value === '}');
  return true;
}

function tokenize(src) {
  const toks = [];
  let i = 0, line = 1, depth = 0;
  const n = src.length;
  let prev = null;

  const push = (type, value, start, end) => {
    const t = { type, value, line, depth, start, end };
    toks.push(t);
    prev = t;
    return t;
  };

  while (i < n) {
    const c = src[i];

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }

    // 行注释
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // 块注释
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // 字符串（含模板串；模板串里的 ${} 不展开，整体当一个 str 记号 —— 对本工具足够）
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      const start = i;
      i++;
      let buf = '';
      while (i < n) {
        if (src[i] === '\\') { buf += src[i + 1] ?? ''; if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') line++;
        buf += src[i];
        i++;
      }
      push('str', buf, start, i);
      continue;
    }

    // 正则字面量
    if (c === '/' && regexAllowed(prev)) {
      let j = i + 1, ok = false, inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        const start = i;
        i = j + 1;
        while (i < n && /[a-z]/.test(src[i])) i++; // flags
        push('regex', src.slice(start, i), start, i);
        continue;
      }
    }

    // 标识符 / 关键字
    if (/[A-Za-z_$\u00a0-\uffff]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$\u00a0-\uffff]/.test(src[i])) i++;
      push('ident', src.slice(start, i), start, i);
      continue;
    }

    // 数字
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const start = i;
      while (i < n && /[0-9a-fA-FxXoObBeE._]/.test(src[i])) i++;
      push('num', src.slice(start, i), start, i);
      continue;
    }

    // 括号：闭合记号沿用与开启记号相同的 depth
    if (c === '{' || c === '[' || c === '(') {
      const start = i;
      push('punct', c, start, ++i);
      depth++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      const start = i;
      push('punct', c, start, ++i);
      continue;
    }

    // 多字符运算符
    const three = src.substr(i, 3);
    if (PUNCT3.includes(three)) { const s = i; push('punct', three, s, i += 3); continue; }
    const two = src.substr(i, 2);
    if (PUNCT2.includes(two)) { const s = i; push('punct', two, s, i += 2); continue; }

    const s = i;
    push('punct', c, s, ++i);
  }

  return toks;
}

/* ------------------------------------------------------------------ *
 * 2. 基于记号的结构提取
 * ------------------------------------------------------------------ */

const OPEN = { '{': '}', '[': ']', '(': ')' };

// 从 toks[i]（必须是开启括号）找到配对闭合记号的索引
function match(toks, i) {
  const open = toks[i].value;
  const close = OPEN[open];
  const d = toks[i].depth;
  for (let j = i + 1; j < toks.length; j++) {
    if (toks[j].value === close && toks[j].depth === d) return j;
  }
  return -1;
}

// 收集 objOpen..objClose 之间、深度为 objDepth+1 的顶层键 -> {key: {openTokIdx, closeTokIdx}}
function objectKeys(toks, openIdx) {
  const closeIdx = match(toks, openIdx);
  if (closeIdx < 0) return { closeIdx: -1, keys: new Map() };
  const inner = toks[openIdx].depth + 1;
  const keys = new Map();
  let expectKey = true;
  for (let j = openIdx + 1; j < closeIdx; j++) {
    const t = toks[j];
    if (t.depth !== inner) continue;
    if (t.value === ',' && t.type === 'punct') { expectKey = true; continue; }
    if (!expectKey) continue;
    // key 形式：ident: / str:
    if ((t.type === 'ident' || t.type === 'str') && toks[j + 1] &&
        toks[j + 1].type === 'punct' && toks[j + 1].value === ':') {
      let valOpen = -1, valClose = -1;
      const v = toks[j + 2];
      if (v && v.type === 'punct' && OPEN[v.value] && v.depth === inner) {
        valOpen = j + 2;
        valClose = match(toks, valOpen);
      }
      keys.set(t.value, { keyTok: j, line: t.line, valOpen, valClose });
      j += 1;
      expectKey = false;
      continue;
    }
    // shorthand / spread 等：跳过
    expectKey = false;
  }
  return { closeIdx, keys };
}

// 把一个数组字面量按「顶层逗号」切成若干元素，返回每个元素的记号索引区间
function arrayElementRanges(toks, arrOpen) {
  const arrClose = match(toks, arrOpen);
  if (arrClose < 0) return { arrClose: -1, ranges: [], inner: -1 };
  const inner = toks[arrOpen].depth + 1;
  const ranges = [];
  let seg = [];
  for (let j = arrOpen + 1; j < arrClose; j++) {
    const t = toks[j];
    if (t.depth < inner) break;
    if (t.depth === inner && t.type === 'punct' && t.value === ',') { ranges.push(seg); seg = []; continue; }
    seg.push(j);
  }
  if (seg.length) ranges.push(seg);
  return { arrClose, ranges, inner };
}

// 定位所有 game.import('<target>', ...) 调用
function findImports(toks) {
  const found = [];
  for (let i = 0; i + 4 < toks.length; i++) {
    if (toks[i].type !== 'ident' || toks[i].value !== 'game') continue;
    if (toks[i + 1]?.value !== '.' || toks[i + 2]?.value !== 'import') continue;
    if (toks[i + 3]?.value !== '(') continue;
    const arg = toks[i + 4];
    if (arg?.type !== 'str') continue;
    const callOpen = i + 3;
    const callClose = match(toks, callOpen);
    // 回调体：字符串之后第一个位于「调用括号内部」的 '{'
    // 关键：body 花括号在 game.import( ... ) 之内，故其 depth = callOpen.depth + 1
    // （函数参数表 (...) 自己开合一次，depth 已还原）
    let bodyOpen = -1;
    for (let j = i + 5; j < callClose; j++) {
      if (toks[j].value === '{' && toks[j].depth === toks[callOpen].depth + 1) { bodyOpen = j; break; }
    }
    found.push({ target: arg.value, callLine: toks[i].line, bodyOpen, callClose });
  }
  return found;
}

// 在回调体内找到顶层 `return { ... }`
function findReturnObject(toks, bodyOpen) {
  const bodyClose = match(toks, bodyOpen);
  if (bodyClose < 0) return -1;
  const inner = toks[bodyOpen].depth + 1;
  for (let j = bodyOpen + 1; j < bodyClose; j++) {
    const t = toks[j];
    if (t.depth !== inner || t.type !== 'ident' || t.value !== 'return') continue;
    const nxt = toks[j + 1];
    if (nxt && nxt.type === 'punct' && nxt.value === '{' && nxt.depth === inner) return j + 1;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * 3. 主流程
 * ------------------------------------------------------------------ */

const files = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .sort();

const report = [];
const detail = {};

for (const file of files) {
  const full = path.join(SRC, file);
  const src = fs.readFileSync(full, 'utf8');
  const toks = tokenize(src);
  const imports = findImports(toks);

  const entry = {
    file,
    bytes: Buffer.byteLength(src, 'utf8'),
    lines: src.split('\n').length,
    imports: imports.map((x) => x.target),
    packName: null,
    characters: [],
    skills: [],
    notes: [],
  };

  const charImport = imports.find((x) => x.target === 'character');
  if (!charImport) {
    entry.notes.push(imports.length ? `非 character 包（${entry.imports.join(',')}）` : '未找到 game.import 调用');
    report.push(entry);
    continue;
  }
  if (charImport.bodyOpen < 0) {
    entry.notes.push('回调体未定位到（可能写法非常规）');
    report.push(entry);
    continue;
  }

  const pkgOpen = findReturnObject(toks, charImport.bodyOpen);
  if (pkgOpen < 0) {
    entry.notes.push('未找到 return 对象');
    report.push(entry);
    continue;
  }

  const { keys } = objectKeys(toks, pkgOpen);

  if (keys.has('name')) {
    const k = keys.get('name');
    const v = toks[k.keyTok + 2];
    if (v?.type === 'str') entry.packName = v.value;
  }

  for (const field of ['character', 'skill']) {
    if (!keys.has(field)) continue;
    const slot = keys.get(field);
    if (slot.valOpen < 0) { entry.notes.push(`${field} 非字面量对象`); continue; }
    const inner = objectKeys(toks, slot.valOpen);
    for (const [name, info] of inner.keys) {
      const rec = { name, line: info.line, endLine: null };
      if (info.valClose >= 0) rec.endLine = toks[info.valClose].line;
      if (field === 'character') {
        // 武将数组：[性别, 势力, 体力, 技能数组, 包名数组, ...]
        // 必须按「顶层逗号」切元素再取第 4 项，否则会把嵌套数组/对象的字符串一并吞掉
        const arrOpen = info.valOpen;
        if (arrOpen >= 0 && toks[arrOpen].value === '[') {
          const { ranges, inner } = arrayElementRanges(toks, arrOpen);
          const lit = (idx) => {
            if (!ranges[idx]) return null;
            const j = ranges[idx][0];
            return toks[j].type === 'str' || toks[j].type === 'num' ? toks[j].value : null;
          };
          rec.gender = lit(0);
          rec.group = lit(1);
          rec.hp = lit(2);
          const sk = ranges[3];
          if (sk) {
            const j0 = sk[0];
            if (toks[j0].type === 'punct' && toks[j0].value === '[') {
              const skills = [];
              const skClose = match(toks, j0);
              for (let j = j0 + 1; j < skClose; j++) {
                if (toks[j].type === 'str' && toks[j].depth === toks[j0].depth + 1) skills.push(toks[j].value);
              }
              rec.skillRefs = skills;
            } else if (toks[j0].type === 'str') {
              rec.skillRefs = [toks[j0].value];
            } else {
              rec.dynamic = true; // window.getStrength(...) 之类
            }
          }
          const pk = ranges[4];
          if (pk && toks[pk[0]].type === 'punct' && toks[pk[0]].value === '[') {
            const groups = [];
            const pkClose = match(toks, pk[0]);
            for (let j = pk[0] + 1; j < pkClose; j++) {
              if (toks[j].type === 'str' && toks[j].depth === toks[pk[0]].depth + 1) groups.push(toks[j].value);
            }
            rec.groups = groups;
          }
        } else {
          rec.dynamic = true;
        }
        entry.characters.push(rec);
      } else {
        entry.skills.push(rec);
      }
    }
  }

  report.push(entry);
}

/* ------------------------------------------------------------------ *
 * 4. 输出
 * ------------------------------------------------------------------ */

fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, 'packs.json'), JSON.stringify(report, null, 1), 'utf8');

const totalChars = report.reduce((a, e) => a + e.characters.length, 0);
const totalSkills = report.reduce((a, e) => a + e.skills.length, 0);
const totalLines = report.reduce((a, e) => a + e.lines, 0);

const rows = report.map((e) =>
  `| \`${e.file}\` | ${e.packName ?? '—'} | ${e.lines} | ${e.characters.length} | ${e.skills.length} | ${e.notes.join('；') || ''} |`
);

const md = [
  '# 无名杀武将包结构总览',
  '',
  '> 由 `atlas/tools/index-packs.mjs` 自动生成。词法级扫描，不执行目标代码。',
  '',
  `- 扫描目录：\`${SRC}\``,
  `- 文件数：**${report.length}**　总行数：**${totalLines}**`,
  `- 武将数：**${totalChars}**　技能数：**${totalSkills}**`,
  '',
  '| 文件 | 包名 | 行数 | 武将 | 技能 | 备注 |',
  '|---|---|---:|---:|---:|---|',
  ...rows,
  '',
].join('\n');

fs.writeFileSync(path.join(OUT, 'packs.md'), md, 'utf8');

console.log(`扫描 ${report.length} 个文件 | 总行数 ${totalLines}`);
console.log(`武将 ${totalChars} | 技能 ${totalSkills}`);
console.log(`输出 -> ${path.join(OUT, 'packs.json')}`);
console.log(`输出 -> ${path.join(OUT, 'packs.md')}`);
console.log('');
console.log('文件'.padEnd(24) + '包名'.padEnd(20) + '行数'.padStart(7) + '武将'.padStart(7) + '技能'.padStart(7) + '  备注');
for (const e of report.slice().sort((a, b) => b.characters.length - a.characters.length)) {
  console.log(
    e.file.padEnd(24) +
    String(e.packName ?? '—').padEnd(20) +
    String(e.lines).padStart(7) +
    String(e.characters.length).padStart(7) +
    String(e.skills.length).padStart(7) +
    '  ' + e.notes.join('；')
  );
}
