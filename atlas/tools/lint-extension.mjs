#!/usr/bin/env node
/*
 * lint-extension.mjs —— 武将扩展**统一体检入口**
 *
 * 一次跑完十项检查，把所有「不报错但一定是错的」问题摆出来。
 * 这些坑的共同特征：**游戏照常启动、日志干干净净、技能就是不生效**。
 *
 * 用法：
 *   node atlas/tools/lint-extension.mjs <extension.js>
 *         [--index atlas/index]      启用跨包重名检测（需先跑 index-packs.mjs）
 *         [--cards]                  额外体检卡牌/装备字段
 *         [--strict]                 把 WARN 也当失败
 *         [--json]                   以 JSON 输出（便于 CI）
 *         [--quiet]                  只输出有问题的条目
 *
 * 退出码：0 = 无 ERROR；1 = 有 ERROR（--strict 时 WARN 也算）；2 = 用法错误
 *
 * ── 检查项一览 ─────────────────────────────────────────────
 *   S    整体语法
 *   C1   content / precontent 在 parsex 两条分支下编译（含残留标记）
 *   C2   闭包逃逸：content 里引用包级闭包变量（运行时 ReferenceError）
 *   C3   武将数组结构（琉璃版必须用数组形态，对象形态直接崩）
 *   C4   技能注册完整性（武将数组里的技能必须有定义）
 *   C5   译名完整性（武将名 / 技能名 / _info / 包名标签）
 *   C6   标记可见性（markSkill 无 intro 时不渲染）
 *   C7   跨包重名（需 --index）
 *   C8   触发时机（trigger 里的事件名是否真实存在，需 --index）
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  parsexOld, parsexElse, extractCompiledFields, extractObjectBlock, topLevelKeys,
  matchBrace, lineOf, stripCommentsAndStrings, topLevelDeclarations,
  referencesName, declaresLocally, SKILL_FIELDS, CARD_FIELDS,
} from './parsex-model.mjs';

/* ───────────────── 参数 ───────────────── */
const argv = process.argv.slice(2);
const opt = (name) => argv.includes(name);
const val = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const FILE = argv.find((a) => !a.startsWith('--') && !(argv[argv.indexOf(a) - 1] || '').match(/^--(index|app)$/));
const IDX = val('--index', null);
const APP = val('--app', null);
const CARDS = opt('--cards');
const STRICT = opt('--strict');
const JSON_OUT = opt('--json');
const QUIET = opt('--quiet');

if (!FILE) {
  console.error('用法: node lint-extension.mjs <extension.js> [--index atlas/index] [--cards] [--strict] [--json]');
  process.exit(2);
}
if (!fs.existsSync(FILE)) { console.error(`找不到文件：${FILE}`); process.exit(2); }

const src = fs.readFileSync(FILE, 'utf8');
const findings = [];   // {level:'ERROR'|'WARN'|'INFO', code, line?, msg, hint?}
const E = (code, msg, extra = {}) => findings.push({ level: 'ERROR', code, msg, ...extra });
const W = (code, msg, extra = {}) => findings.push({ level: 'WARN', code, msg, ...extra });
const I = (code, msg, extra = {}) => findings.push({ level: 'INFO', code, msg, ...extra });

/* ───────────────── S. 整体语法 ───────────────── */
let syntaxOk = true, syntaxErr = null;
try { new Function(src); } catch (e) { syntaxOk = false; syntaxErr = e; }

/* ───────────────── 结构抽取 ───────────────── */
const importBlock = (() => {
  const m = /game\s*\.\s*import\s*\(\s*['"(]*character['")]*\s*,\s*(?:function\s*\*?\s*[\w$]*\s*)?\([^)]*\)\s*\{/.exec(src)
    || /game\s*\.\s*import\s*\(\s*['"]character['"]\s*,\s*function\s*\(/.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length - 1);
  const close = matchBrace(src, open);
  if (close < 0) return null;
  return { text: src.slice(open, close + 1), open, close };
})();

const charBlock = extractObjectBlock(src, 'character');
const skillBlock = extractObjectBlock(src, 'skill');
const transBlock = extractObjectBlock(src, 'translate');
const introBlock = extractObjectBlock(src, 'characterIntro');

/** skill:{} 的顶层条目 → Map<name, blockText> */
function subEntries(block) {
  const map = new Map();
  if (!block) return map;
  const t = block.text;
  const keys = topLevelKeys(t);
  for (const k of keys) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w$.])(?:['"]${esc}['"]|\\b${esc}\\b)\\s*:\\s*\\{`);
    const m = re.exec(t);
    if (!m) { map.set(k, ''); continue; }
    const open = t.indexOf('{', m.index + m[0].length - 1);
    const close = matchBrace(t, open);
    map.set(k, close > 0 ? t.slice(open, close + 1) : '');
  }
  return map;
}
const skillEntries = subEntries(skillBlock);
const skillNames = new Set(skillEntries.keys());
const transKeys = new Set(transBlock ? topLevelKeys(transBlock.text) : []);
// ★ 译名不一定只写在 translate:{} 字面量里 —— 过程式赋值同样有效，且是**包名标签的唯一写法**
//   （因为 game.js:15160-15162 会把「键==包名」的那条改道成 <包名>_character_config，
//    而那个键根本不可能出现在 translate 字面量里）。漏掉这条会误报「缺包名标签」。
for (const m of src.matchAll(/lib\s*\.\s*translate\s*\[\s*['"]([^'"]+)['"]\s*\]\s*=/g)) transKeys.add(m[1]);
for (const m of src.matchAll(/lib\s*\.\s*translate\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g)) transKeys.add(m[1]);

/** 包的 name 字段 —— ★ 必须取 game.import('character') 回调里的那个。
 *  文件里通常还有外层扩展对象的 name（扩展名，中间带空格），先扫全文会抓错。 */
const pkgName = (() => {
  const scopeText = importBlock ? importBlock.text : src;
  const m = /(?<![\w$.])name\s*:\s*['"]([^'"]+)['"]/.exec(scopeText.replace(/^\s*\/\/.*$/gm, ''));
  return m ? m[1] : null;
})();

/** character 块的顶层条目 → Map<id, valueText> */
const charEntries = new Map();
if (charBlock) {
  for (const k of topLevelKeys(charBlock.text)) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w$.])(?:['"]${esc}['"]|\\b${esc}\\b)\\s*:\\s*`);
    const m = re.exec(charBlock.text);
    if (!m) continue;
    let i = m.index + m[0].length;
    // 取到下一个顶层逗号为止
    const start = i;
    let d = 0;
    while (i < charBlock.text.length) {
      const c = charBlock.text[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < charBlock.text.length) { if (charBlock.text[i] === '\\') { i += 2; continue; } if (charBlock.text[i] === q) { i++; break; } i++; }
        continue;
      }
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) break; d--; }
      else if (c === ',' && d === 0) break;
      i++;
    }
    charEntries.set(k, charBlock.text.slice(start, i));
  }
}

/* ───────────────── C1. 双分支编译 ───────────────── */
// ★ 只扫 skill:{}（以及 --cards 时的 card:{}）**内部**。
//   扩展对象自己顶层的 `precontent` 由 loadExtension 直接调用、**不经过 parsex**，
//   若整文件扫会产生假阳性（本工具第一版就踩了这个坑，见 git 历史）。
const fields = CARDS ? [...new Set([...SKILL_FIELDS, ...CARD_FIELDS])] : SKILL_FIELDS;
const scopes = [];
if (skillBlock) scopes.push({ block: skillBlock, label: 'skill' });
if (CARDS) { const cb = extractObjectBlock(src, 'card'); if (cb) scopes.push({ block: cb, label: 'card' }); }
const compiled = [];
for (const sc of scopes) {
  for (const f of extractCompiledFields(sc.block.text, fields)) {
    compiled.push({ ...f, line: lineOf(src, sc.block.open + f.index), scope: sc.label });
  }
}
if (compiled.length === 0) I('C1', '没在 skill:{} 内找到被 parsex 编译的字段（content / precontent）');
const c1rows = [];
for (const f of compiled) {
  let fn;
  try { fn = new Function('return (' + f.fnText.replace(/^[\w$]+\s*:\s*/, '') + ')')(); }
  catch (e) { E('C1', `第 ${f.line} 行 ${f.field} 无法还原为函数：${e.message}`, { line: f.line }); continue; }
  let a = null, b = null;
  try { parsexOld(fn); } catch (e) { a = `${e.constructor.name}: ${e.message}`; E('C1', `第 ${f.line} 行 ${f.field} 在 finalParsex='old'（疾速模式）下编译失败：${a}`, { line: f.line, hint: "old 分支无 try/catch —— 报了就是硬崩。检查是否用了 generator 或参数解构" }); }
  try {
    const r = parsexElse(fn);
    b = r.kind + (r.skipped ? ` ⚠${r.skipped}` : '');
    if (r.skipped) E('C1', `第 ${f.line} 行 ${f.field} 在 else 分支下残留 ${r.skipped} 处 'step N'（非法嵌套或重复）→ 该步骤永不切换`, { line: f.line, hint: '把 step N 提到 content 顶层；重复的删掉' });
  } catch (e) { b = null; E('C1', `第 ${f.line} 行 ${f.field} 在 else 分支下编译失败：${e.message}`, { line: f.line }); }
  c1rows.push({ line: f.line, field: f.field, gen: f.isGen, a: a ? '❌' : '✅', b: b || '❌' });
  if (f.isGen) W('C1', `第 ${f.line} 行 ${f.field} 是 generator —— 在 else 分支可用，但 old 分支必然失败`, { line: f.line });
}

/* ───────────────── C2. 闭包逃逸 ───────────────── */
const closureNames = importBlock ? topLevelDeclarations(importBlock.text) : new Set();
for (const f of compiled) {
  const body = stripCommentsAndStrings(f.fnText);
  for (const name of closureNames) {
    if (!referencesName(body, name)) continue;
    if (declaresLocally(body, name)) continue;
    E('C2', `第 ${f.line} 行 ${f.field} 引用了包级闭包变量 \`${name}\` —— content 经 new Function 在**全局作用域**重建，运行时必然 ReferenceError`, {
      line: f.line,
      hint: '就地展开该辅助函数；filter/check/ai 不受此限（它们不经编译）',
    });
  }
}

/* ───────────────── C3. 武将数组结构 ───────────────── */
for (const [id, v] of charEntries) {
  const t = v.trim();
  if (t.startsWith('{')) {
    E('C3', `武将 \`${id}\` 用了**对象形态** —— 琉璃版引擎按 [3]/[4] 下标取值（game.js:15146/15156），对象形态直接崩`, { hint: '改成 [性别, 势力, 体力, [技能…], [标签…]]' });
    continue;
  }
  if (!t.startsWith('[')) { E('C3', `武将 \`${id}\` 的值不是数组：${t.slice(0, 30)}`); continue; }
  const parts = splitTop(t.slice(1, t.lastIndexOf(']') < 0 ? undefined : -1));
  if (parts.length < 4) { E('C3', `武将 \`${id}\` 只有 ${parts.length} 段，至少需要 4 段 [性别,势力,体力,[技能]]`); continue; }
  if (!parts[3].trim().startsWith('[')) { E('C3', `武将 \`${id}\` 的第 4 段不是技能数组（引擎读 [3]）：${parts[3].trim().slice(0, 24)}`); continue; }
  if (parts[4] && !parts[4].trim().startsWith('[')) W('C3', `武将 \`${id}\` 的第 5 段（标签 [4]）不是数组 —— 引擎会在 game.js:22842 调 info[4].contains() 崩`, { hint: '省略该段或写成 []' });
  // 技能引用
  const sk = parts[3].trim().slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  for (const s of sk) {
    if (!skillNames.has(s)) E('C4', `武将 \`${id}\` 引用了未定义的技能 \`${s}\``, { hint: '在 skill:{} 里补上定义，否则该技能永不发动' });
    if (!transKeys.has(s)) W('C5', `技能 \`${s}\` 缺译名（lib.translate['${s}']）`, { hint: '技能名会显示为原始 id' });
    // sub:true 的实现型子技能刻意不写描述，降级为 INFO，避免淹没真问题
    const blk = skillEntries.get(s) || '';
    const isSub = /(?<![\w$.])sub\s*:\s*true/.test(blk);
    if (!transKeys.has(s + '_info')) {
      const f = { code: 'C5', msg: `技能 \`${s}\` 缺描述（lib.translate['${s}_info']）`, hint: isSub ? '该技能标了 sub:true，通常是刻意不展示的实现子技能' : '技能面板会空白' };
      findings.push({ level: isSub ? 'INFO' : 'WARN', ...f });
    }
  }
}
if (charEntries.size === 0) W('C3', '没在源码里找到 character:{} 块（若包结构不同请忽略）');

/* ───────────────── C5. 译名（武将 / 包名） ───────────────── */
for (const id of charEntries.keys()) {
  if (!transKeys.has(id)) E('C5', `武将 \`${id}\` 缺译名 —— game.js:22838 无条件执行 node.name.innerHTML=get.slimName(id)，取不到就**返回空串**，名字位空白`, { hint: `translate 里加 '${id}': '中文名'` });
}
if (pkgName) {
  if (!transKeys.has(pkgName + '_character_config')) {
    W('C5', `缺包名标签 lib.translate['${pkgName}_character_config']（选将界面显示 undefined）`, { hint: 'game.js:15160-15162：translate 的键==包名时引擎会把它改道成 <包名>_character_config，不会写 lib.translate[包名]' });
  }
}
// 未使用的 translate 键（多半是笔误）
for (const k of transKeys) {
  if (k.endsWith('_info') || k.endsWith('_bg') || k.endsWith('_character_config') || k.endsWith('_ab')) continue;
  if (charEntries.has(k) || skillNames.has(k) || k === pkgName) continue;
  if (!/(^|_)/.test(k)) continue;
  W('C5', `译名键 \`${k}\` 既不是武将也不是技能（拼写错误？）`);
}

/* ───────────────── C6. 标记可见性 ───────────────── */
const MARK_CALL = /(?:addMark|countMark|hasMark|removeMark|markSkill|unmarkSkill|numMark)\s*\(\s*['"]([^'"]+)['"]/g;
const markNames = new Set();
let mm;
while ((mm = MARK_CALL.exec(src)) !== null) markNames.add(mm[1]);
// 静音语法：// dsh-lint: ignore-mark a b c   （一行可写多个名字）
const ignoredMarks = new Set(
  (src.match(/dsh-lint:\s*ignore-mark([^\n\r*]*)/g) || [])
    .flatMap((s) => s.replace(/dsh-lint:\s*ignore-mark/, '').trim().split(/[\s,]+/))
    .filter(Boolean)
);

for (const name of markNames) {
  // 可见的两种途径：① 本身就是带 intro 的技能；② 存在同名显示壳
  const own = skillEntries.get(name);
  const selfIntro = own && /(?<![\w$.])intro\s*:/.test(own);
  const shell = skillEntries.get(name);
  const shellIntro = shell && /(?<![\w$.])intro\s*:/.test(shell);
  if (selfIntro || shellIntro) continue;

  // 只用来记账的标记（storage 语义）通常是刻意隐藏的，降级为 INFO
  const onlyCount = new RegExp(`(?:countMark|removeMark|hasMark)\\s*\\(\\s*['"]${name}['"]`).test(src)
    && !new RegExp(`markSkill\\s*\\(\\s*['"]${name}['"]`).test(src);
  if (ignoredMarks.has(name)) continue;
  if (onlyCount) I('C6', `标记 \`${name}\` 无 intro 也无显示壳 —— 不会出现在头像上（若属刻意记账可加注释 dsh-lint: ignore-mark ${name} 静音）`);
  else W('C6', `标记 \`${name}\` 无 intro 也无显示壳 —— markSkill 在 game.js:27412-27417 会**直接 return、不渲染任何标记**`, { hint: `补一个 { charlotte:true, sub:true, intro:{...} } 显示壳，并把名字加进翻译表；角标另需 translate['${name}_bg']` });
}

/* ───────────────── C7 / C8. 需要索引的部分 ───────────────── */
let idxPacks = null, idxCollisions = null;
if (IDX) {
  try {
    idxPacks = JSON.parse(fs.readFileSync(path.join(IDX, 'packs.json'), 'utf8'));
    try { idxCollisions = JSON.parse(fs.readFileSync(path.join(IDX, 'collisions.json'), 'utf8')); } catch {}
  } catch (e) { W('C7', `读不到索引 ${IDX}/packs.json，跳过重名检测（先跑 index-packs.mjs）`); }
}
if (idxPacks) {
  const knownSkills = new Map(), knownChars = new Map();
  for (const p of idxPacks) {
    for (const s of (p.skills || [])) if (!knownSkills.has(s.name)) knownSkills.set(s.name, p.packName || p.file);
    for (const c of (p.characters || [])) if (!knownChars.has(c.name || c.id)) knownChars.set(c.name || c.id, p.packName || p.file);
  }
  for (const s of skillNames) if (knownSkills.has(s)) E('C7', `技能名 \`${s}\` 与已有包 ${knownSkills.get(s)} 重复 —— lib.skill 是全局命名空间，加载序在后者静默覆盖前者`);
  for (const c of charEntries.keys()) if (knownChars.has(c)) E('C7', `武将 id \`${c}\` 与已有包 ${knownChars.get(c)} 重复`);
}

/* ───────────────── C8. 触发时机白名单（--app） ───────────────── */
// 引擎侧的事件闸门是 lib.hookmap（game.js:32324 `if(!lib.hookmap[name]&&!lib.config.compatiblemode) return;`），
// 而 lib.hookmap 只被「真实发射过的事件」点亮。若技能写了一个不存在/拼错的事件名：
//   注册照做、filter 永不调用、content 永不执行、**日志零输出**。
//
// ★★ 关键：合法时机名**不只是**字面量。game.js:41702-41763 对任意名为 X 的事件
//    动态合成 6 个时机点，所以白名单必须 = 字面量 ∪ {基名+后缀}：
//       XBefore  event.name+'Before'   (41749)
//       XBegin   event.name+'Begin'    (41762)
//       XEnd     event.name+'End'      (41714)
//       XAfter   event.name+'After'    (41719)
//       XOmitted event.name+'Omitted'  (41709)
//       XSkipped next.name+'Skipped'   (41725)
//    例：damageBegin = damage+Begin、damageEnd = damage+End、
//        phaseDiscardBefore = phaseDiscard+Before —— 都合法。
//    漏掉这条合成规则会把大量正常技能误判（本工具第一版就整批误报了 5 个）。
const EVENT_SUFFIXES = ['Before', 'Begin', 'End', 'After', 'Omitted', 'Skipped'];
const triggerNames = new Map();   // event name -> skill names
const getTriggerBlock = (blk) => {
  const m = /(?<![\w$.])trigger\s*:\s*\{/.exec(blk);
  if (!m) return null;
  const open = blk.indexOf('{', m.index + m[0].length - 1);
  const close = matchBrace(blk, open);
  return close > 0 ? blk.slice(open, close + 1) : null;
};
for (const [sk, blk] of skillEntries) {
  const tb = getTriggerBlock(blk);
  if (!tb) continue;
  // trigger 块里除键名外的字符串字面量就是事件名（键名都是不带引号的标识符）
  for (const m of tb.matchAll(/['"]([A-Za-z_$][\w$]*)['"]/g)) {
    if (!triggerNames.has(m[1])) triggerNames.set(m[1], []);
    triggerNames.get(m[1]).push(sk);
  }
}
let validEvents = null;
if (APP) {
  const bases = new Set(), literals = new Set();
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) walk(p, depth + 1); continue; }
      if (!e.name.endsWith('.js')) continue;
      let t; try { t = fs.readFileSync(p, 'utf8'); } catch { continue; }
      for (const m of t.matchAll(/\.trigger\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) literals.add(m[1]);
      for (const m of t.matchAll(/createEvent\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) bases.add(m[1]);
    }
  };
  for (const sub of ['game', 'mode', 'character', 'extension']) walk(path.join(APP, sub), 0);

  validEvents = new Set([...literals, ...bases]);
  for (const b of bases) for (const sfx of EVENT_SUFFIXES) validEvents.add(b + sfx);

  for (const [evt, skills] of triggerNames) {
    if (validEvents.has(evt)) continue;
    W('C8', `触发时机 \`${evt}\`（用于 ${skills.join('/')}）在全库中**从未被发射过** —— 技能会静默地永不触发`, {
      hint: `多半是拼写错误。合法名 = 字面量（.trigger('X')）或 基名+${EVENT_SUFFIXES.join('/')}`
        + `；本检查基于 --app 范围内的静态字面量，动态构造的事件名可能被漏掉`,
    });
  }
}

/* ───────────────── C9. 转化牌名字比较漏 viewAs ───────────────── */
// 实测症状：闪电判定时不摸牌，**零报错**，filter 恒 false。
// 根因：延时锦囊的有效名是 viewAs||name，不是 name ——
//   引擎自己就一直这么读：game.js:26832 canAddJudge、
//   26844 addJudgeNext 都是 `card.viewAs || card.name`。
//   而 addJudge({name:'shandian'},[card]) 造的是**转化牌**：
//   实物牌是那张被摸到的手牌，.name 仍是它原本的名字（如 'sha'），
//   'shandian' 存在 .viewAs 里 ⇒ `event.card.name == 'shandian'` 恒为 false。
//
// 判据（精确、低误报）：本文件若用 { name: 'X' } 造过虚拟牌/转化牌，
// 则别处再出现 `.name == 'X'` 就高度可疑。
const virtualNames = new Set();
for (const m of src.matchAll(/(?:addJudge|autoViewAs|viewAs)\s*\(\s*\{\s*name\s*:\s*['"]([^'"]+)['"]/g)) virtualNames.add(m[1]);
for (const m of src.matchAll(/\bviewAs\s*:\s*\{\s*name\s*:\s*['"]([^'"]+)['"]/g)) virtualNames.add(m[1]);
for (const [sk, blk] of skillEntries) {
  for (const m of blk.matchAll(/\.name\s*[!=]==?\s*['"]([^'"]+)['"]/g)) {
    const nm = m[1];
    if (!virtualNames.has(nm)) continue;
    // 已经写成 viewAs||name 的不算（往前看一段，够覆盖同一行的写法）
    const around = blk.slice(Math.max(0, m.index - 70), m.index + m[0].length);
    if (/viewAs/.test(around)) continue;
    W('C9', `技能 \`${sk}\` 用 \`.name == '${nm}'\` 判牌名，但本文件用 {name:'${nm}'} 造过转化牌 —— `
      + `转化牌的 .name 仍是实物牌名，'${nm}' 在 .viewAs 里 ⇒ 条件恒 false、技能静默不触发`, {
      hint: `改为 (card.viewAs || card.name) == '${nm}'（引擎自己的读法：game.js:26832 / 26844）`,
    });
  }
}

/* ───────────────── C10. canUse 的第二个参数是「目标」不是「是否忽略」───────────────── */
// 实测症状：讨贼达标后不触发从牌堆底使用牌，零报错。
// 根因：player.canUse(card, player, false) —— 第二参数是**目标**
//   game.js:27651-27659  canUse:function(card,target,distance,includecard){
//       ...
//       return lib.filter[...](card,this,target);   // ← 目标合法性
//   }
//   传自己 = 「能否对**自己**使用这张牌」，杀/决斗/顺手牵羊这类牌对自己非法 ⇒ 恒 false。
//   想忽略距离应该传第三参数 distance=false，想判「这张牌能不能用」应该用
//   hasUseTarget（game.js:27660-27665，遍历全场找合法目标）。
// 判据：接收者与第二个实参是**同一个标识符** → 高度可疑（偶尔是对自己用桃的正当检查，
//   故只报 WARN 并要求人工确认，不判 ERROR）。
for (const [sk, blk] of skillEntries) {
  for (const m of blk.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*canUse\s*\(\s*([^,()]+?)\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    if (m[1] !== m[3]) continue;   // 接收者与目标不是同一个 → 正常
    W('C10', `技能 \`${sk}\` 写了 \`${m[1]}.canUse(…, ${m[3]}, …)\` —— `
      + `canUse 的第二个参数是**目标**（game.js:27651-27659 末行走 lib.filter.targetEnabled），`
      + `传自己等于「能否对自己使用这张牌」，杀/决斗/顺手牵羊一类对自己非法 ⇒ 恒 false、后续整段不执行`, {
      hint: '判「这张牌能不能用」改用 hasUseTarget(card, false, false)；要忽略距离应传第三参数 distance=false',
    });
  }
}

/* ───────────────── 输出 ───────────────── */
const byCode = (c) => findings.filter((f) => f.code === c);
const errs = findings.filter((f) => f.level === 'ERROR');
const warns = findings.filter((f) => f.level === 'WARN');
const infos = findings.filter((f) => f.level === 'INFO');

if (JSON_OUT) {
  console.log(JSON.stringify({ file: FILE, syntaxOk, fields: compiled.length, findings }, null, 2));
} else {
  const L = [];
  L.push(`文件：${FILE}（${(Buffer.byteLength(src) / 1024).toFixed(1)} KB）`);
  L.push('');
  const mark = (n, ok, detail) => L.push(`${ok ? '✅' : '❌'} ${n.padEnd(22)} ${detail}`);
  const skip = (n, why) => L.push(`⏭  ${n.padEnd(22)} ${why}`);

  if (!syntaxOk) { L.push(`❌ S 语法                 ${syntaxErr.constructor.name}: ${syntaxErr.message}`); }
  else mark('S 语法', true, '整体可解析');

  const c1bad = byCode('C1').filter((f) => f.level === 'ERROR').length;
  mark(`C1 编译（双分支）`, c1bad === 0, c1bad === 0 ? `${compiled.length} 个被编译字段，两条分支全部通过` : `${c1bad} 项失败`);
  if (!QUIET) for (const r of c1rows) L.push(`     └ 行 ${String(r.line).padStart(4)}  ${r.field.padEnd(14)} A:${r.a}  B:${r.b}`);

  const c2 = byCode('C2');
  mark('C2 闭包逃逸', c2.length === 0, c2.length === 0 ? `扫描 ${closureNames.size} 个包级变量，无逃逸` : `${c2.length} 处`);

  const c3 = byCode('C3').filter((f) => f.level === 'ERROR');
  mark('C3 武将数组结构', c3.length === 0, c3.length === 0 ? `${charEntries.size} 个武将，结构合法` : `${c3.length} 项不合法`);

  const c4 = byCode('C4');
  mark('C4 技能注册', c4.length === 0, c4.length === 0 ? `${skillNames.size} 个技能全部可解析` : `${c4.length} 项悬空引用`);

  const c5 = byCode('C5');
  mark('C5 译名完整性', c5.filter((f) => f.level === 'ERROR').length === 0, c5.length === 0 ? `${transKeys.size} 个译名键，无缺失` : `${c5.length} 项待补`);

  const c6 = byCode('C6');
  mark('C6 标记可见性', c6.filter((f) => f.level === 'WARN').length === 0, c6.length === 0 ? `${markNames.size} 个标记均有显示路径` : `${c6.length} 个不可见`);

  if (idxPacks) { const c7 = byCode('C7'); mark('C7 跨包重名', c7.length === 0, c7.length === 0 ? `已比对 ${idxPacks.length} 个包，无重名` : `${c7.length} 处重名`); }
  else skip('C7 跨包重名', '需 --index <atlas/index>');

  if (validEvents) {
    const c8 = byCode('C8');
    mark('C8 触发时机', c8.length === 0, c8.length === 0 ? `${triggerNames.size} 个事件名均在白名单内（含合成后缀，共 ${validEvents.size} 个合法名）` : `${c8.length} 个事件名不存在`);
  } else skip('C8 触发时机', '需 --app <游戏app根目录>');

  const c9 = byCode('C9');
  mark('C9 转化牌名字', c9.length === 0,
    c9.length === 0
      ? (virtualNames.size ? `${virtualNames.size} 个虚拟牌名的比较均正确处理了 viewAs` : '本文件未造过虚拟牌')
      : `${c9.length} 处漏了 viewAs`);

  const c10 = byCode('C10');
  mark('C10 canUse 参数', c10.length === 0, c10.length === 0 ? '无「目标误当忽略」的调用' : `${c10.length} 处可疑`);

  L.push('');
  if (findings.length === 0) {
    L.push('🟢 全部通过');
  } else {
    const order = { ERROR: 0, WARN: 1, INFO: 2 };
    const icon = { ERROR: '❌', WARN: '⚠️ ', INFO: 'ℹ️ ' };
    for (const f of findings.slice().sort((a, b) => order[a.level] - order[b.level])) {
      L.push(`${icon[f.level]} [${f.code}]${f.line ? ` 行${f.line}` : ''} ${f.msg}`);
      if (f.hint) L.push(`        ↳ ${f.hint}`);
    }
  }
  L.push('');
  L.push(`${errs.length} ERROR / ${warns.length} WARN / ${infos.length} INFO`);
  L.push(errs.length === 0 && (!STRICT || warns.length === 0) ? '✅ 体检通过' : '❌ 体检未通过');
  console.log(L.join('\n'));
}

function splitTop(t) {
  const out = [];
  let d = 0, cur = '', i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; cur += c; i++;
      while (i < t.length) { cur += t[i]; if (t[i] === '\\') { i += 2; cur += t[i - 1]; continue; } if (t[i] === q) { i++; break; } i++; }
      continue;
    }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  out.push(cur);
  return out;
}

process.exit(errs.length === 0 && (!STRICT || warns.length === 0) ? 0 : 1);
