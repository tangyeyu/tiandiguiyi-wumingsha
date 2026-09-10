#!/usr/bin/env node
/*
 * idiom.mjs —— 范式抽取器：从全库 5000+ 个技能里挖「做 X 的标准写法」
 *
 * 为什么需要它
 * ────────────
 * 无名杀技能写错，绝大多数不是逻辑问题，而是**引擎约定**问题：
 * 「额外出牌阶段要挂到 trigger.next 还是 trigger.getParent().next？」
 * 「跳过弃牌阶段该监听哪个时机？」「锁定技但可选怎么表达？」
 * 这些约定在 5000+ 个技能里已经被重复过成千上万次 —— **统计先例比推理引擎行为可靠**。
 *
 * 实例：铸策②「额外出牌阶段」最初写成 trigger.getParent().next.unshift(next)。
 * 第一次修正时我只读了 sb.js / jsrg.js 两处，就断言「全库 17 处一致」——**抽样代替普查**。
 * 用本工具做全库聚类后，真实分布是 8 : 7 两派（不存在压倒性写法）。
 * 语料是证据，不是判决。
 *
 * 用法
 * ────
 *   node atlas/tools/idiom.mjs --idiom "额外出牌阶段"      # 查内置惯用法
 *   node atlas/tools/idiom.mjs --find "phaseUse\\("        # 按正则找技能
 *   node atlas/tools/idiom.mjs --mine --top 25             # 无监督挖矿（全库高频写法）
 *
 *   --char <character目录>   武将包源码目录（首次给一次，之后会缓存）
 *   --index <目录>           默认 atlas/index
 *   --show N                 每个聚类展示的样例数（默认 4）
 *   --snippet                打印主导写法的完整源码（可抄）
 *   --outliers               只关心少数派（写错往往就藏在这里）
 *   --json
 *
 * 退出码：0 正常；1 未找到；2 用法/IO 错误
 */

import fs from 'node:fs';
import path from 'node:path';
import { stripCommentsAndStrings } from './parsex-model.mjs';

/* ─────────── 参数 ─────────── */
const argv = process.argv.slice(2);
const opt = (n) => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const IDX = val('--index', path.resolve('atlas/index'));
const SHOW = parseInt(val('--show', '4'), 10);
const TOP = parseInt(val('--top', '25'), 10);
const JSON_OUT = opt('--json');
const SNIPPET = opt('--snippet');
const OUTLIERS_ONLY = opt('--outliers');

/* ─────────── 定位武将包源码目录 ─────────── */
// 不硬编码绝对路径：优先 --char，其次读上次缓存的 .char-dir
const CHAR_CACHE = path.join(IDX, '.char-dir');
let CHAR = val('--char', null);
if (!CHAR && fs.existsSync(CHAR_CACHE)) CHAR = fs.readFileSync(CHAR_CACHE, 'utf8').trim();
function usage(msg) {
  console.error(msg);
  console.error('\n用法: node atlas/tools/idiom.mjs --idiom <名称> | --find <正则> | --mine [--top N]');
  console.error('      [--char <character目录>] [--index <目录>] [--show N] [--snippet] [--outliers] [--json]');
  process.exit(2);
}
if (!CHAR) usage('缺少 --char <character目录>（首次运行需要，之后会缓存在 atlas/index/.char-dir）');
if (!fs.existsSync(CHAR)) usage(`character 目录不存在：${CHAR}`);
try { fs.writeFileSync(CHAR_CACHE, CHAR, 'utf8'); } catch { /* 缓存失败不影响主流程 */ }

const packsFile = path.join(IDX, 'packs.json');
if (!fs.existsSync(packsFile)) usage(`找不到 ${packsFile}（先跑 index-packs.mjs）`);
const packs = JSON.parse(fs.readFileSync(packsFile, 'utf8'));

/* ─────────── 载入语料：按 line/endLine 切片 ─────────── */
const corpus = [];   // {pack, file, name, line, endLine, text}
for (const p of packs) {
  const f = path.join(CHAR, p.file);
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (const s of (p.skills || [])) {
    if (!s.line) continue;
    const end = s.endLine || Math.min(s.line + 80, lines.length);
    const text = lines.slice(s.line - 1, end).join('\n');
    corpus.push({ pack: p.packName || p.file, file: p.file, name: s.name, line: s.line, endLine: end, text });
  }
}

/* ─────────── 实现签名 ─────────── */
// 取「点号调用链」的有序去重列表，例如
//   player.phaseUse → event.next.remove → trigger.next.push
// 保留完整链条（**不做接收者归一化**）：trigger.next.push 与
// event.next.remove 的差别正是我们要暴露出来的东西。
const RESERVED = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
  'do', 'else', 'delete', 'void', 'in', 'of', 'case', 'with', 'await', 'yield',
  'instanceof', 'throw', 'try', 'class', 'super', 'this',
]);
function chainsOf(text, dedupe = true) {
  const stripped = stripCommentsAndStrings(text);
  const seen = new Set(), out = [];
  for (const m of stripped.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)) {
    const c = m[1];
    if (RESERVED.has(c)) continue;
    if (!c.includes('.') && /^(?:Number|String|Boolean|Array|Object)$/.test(c)) continue;
    if (dedupe) {
      if (seen.has(c)) continue;
      seen.add(c);
    }
    out.push(c);
  }
  return out;
}

/**
 * 整技能签名 —— 只适合**小技能**。
 * 大技能里 idiom 只占几行，整段签名会各自唯一、聚不起来（第一版的坑：
 * 「额外出牌阶段」17 个技能聚成 17 类，等于没聚）。
 */
function signature(text) { return chainsOf(text).join(' → '); }

/**
 * 窗口签名 —— 真正用于聚类的那个。
 * 定位正则命中的**行**，只取该行前后若干行参与签名，
 * 这样聚的才是「这个 idiom 怎么写」，而不是「这个技能还干了别的什么」。
 */
function signatureWindow(text, re, beforeLines = 5, afterLines = 7) {
  const lines = text.split('\n');
  let hitLine = -1;
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    if (re.test(lines[i])) { hitLine = i; break; }
  }
  if (hitLine < 0) {                       // 跨行匹配：退回整段
    re.lastIndex = 0;
    if (!re.test(text)) return '';
    return signature(text);
  }
  const from = Math.max(0, hitLine - beforeLines);
  const to = Math.min(lines.length, hitLine + afterLines + 1);
  return chainsOf(lines.slice(from, to).join('\n')).join(' → ');
}

/**
 * 锚定签名 —— 真正用于聚类的那个。
 *
 * 先用正则找到**匹配的那个调用链**当锚点，再取 `chains[anchor .. anchor+forward]`。
 * 这样聚的是「这个 idiom 本身怎么写」，而不是「这个技能顺带还调了什么」。
 *   额外出牌阶段 → player.phaseUse → event.next.remove → trigger.next.push
 * 行窗口是行不通的：同一行附近常有前置的无关调用（player.phaseDraw 等），
 * 会把 17 个技能碎成 14 类，等于没聚。
 *
 * 匹配目标是字符串而非调用时（如 phaseDiscardBefore），锚定失败，
 * 退回 signatureWindow 的行窗口。
 */
function signatureAnchored(text, re, forward = 2) {
  // ★ 必须用**不去重**的完整调用序列：技能里前面若已出现过 event.next.remove，
  //   去重版会让它从锚点之后的窗口里消失，签名被截断成 player.phaseUse 就没了，
  //   于是不同写法被错误并箱（第一版实测把 3 个 getParent 派误并成「player.phaseUse」）。
  const chains = chainsOf(text, false);
  for (let i = 0; i < chains.length; i++) {
    re.lastIndex = 0;
    if (re.test(chains[i]) || re.test(chains[i] + '(')) {
      return chains.slice(i, i + forward + 1).join(' → ');
    }
  }
  return signatureWindow(text, re);
}

/* ─────────── 聚类 ─────────── */
function cluster(items, re) {
  const by = new Map();
  for (const it of items) {
    const sig = re ? signatureAnchored(it.text, re) : signature(it.text);
    if (!by.has(sig)) by.set(sig, []);
    by.get(sig).push(it);
  }
  return [...by].map(([sig, list]) => ({ sig, list, n: list.length }))
    .sort((a, b) => b.n - a.n || a.sig.localeCompare(b.sig));
}

/**
 * n-gram 挖矿 —— 全库高频「调用序列片段」。
 * 这是 --mine 的正确形态：整技能签名必然各自唯一，而 3-gram 能捞出
 * 「event.next.remove → trigger.next.push」这类跨技能反复出现的写法。
 */
function ngramMine(corpus, n = 3) {
  const by = new Map();
  for (const s of corpus) {
    const cs = chainsOf(s.text);
    for (let i = 0; i + n <= cs.length; i++) {
      const key = cs.slice(i, i + n).join(' → ');
      if (!by.has(key)) by.set(key, { n: 0, samples: [] });
      const e = by.get(key);
      e.n++;
      if (e.samples.length < 5) e.samples.push(`${s.file}:${s.line} ${s.name}`);
    }
  }
  return [...by].map(([sig, e]) => ({ sig, ...e })).sort((a, b) => b.n - a.n);
}

/* ─────────── 内置惯用法目录 ─────────── */
// 每一条都对应 atlas 里已经过源码验证的引擎约定
const IDIOMS = {
  '额外出牌阶段': {
    match: /\.phaseUse\s*\(/,
    expect: /trigger\.next\.push/,
    warn: /getParent/,
    note: '在技能里插入一个额外的出牌阶段。全库存在两个流派：'
      + 'trigger.next.push（挂到**触发事件自身**的 next 队列 —— 主循环在**每步之间**消费该队列(g 41700 附近)，'
      + 'phaseLoop 的 step 7 触发完 phaseBegin 后即回到队列，故落在 step 8 建立阶段序列之前）；'
      + 'trigger.getParent().next.push / .unshift（挂到**父事件**队列，时机靠后）。两派并存，判据见前。',
  },
  '跳过弃牌阶段': {
    match: /phaseDiscardBefore/,
    note: '监听 phaseDiscardBefore 并 trigger.cancel()',
  },
  '伤害+1': {
    match: /damageBegin\d?[\s\S]{0,200}\.num\s*\+?=/,
    note: '改的是 trigger.num（event.damage 在引擎里出现 0 次）。damage 的 content 全程不重算 num',
  },
  '防止伤害': {
    match: /damageBegin\d?[\s\S]{0,200}\.cancel\s*\(/,
    note: 'trigger.cancel() 取消伤害事件；event.cancel() 取消的是技能自身事件',
  },
  '加标记': { match: /\.addMark\s*\(/, note: '标记要能显示，必须给同名技能一个 intro（markSkill 无 intro 直接 return）' },
  '限定技': { match: /\blimited\s*:\s*true/, note: '限定技：limited + 标记/一次性' },
  '觉醒技': { match: /\bjuexingji\s*:\s*true/, note: '觉醒技' },
  '锁定技但可选发动': { match: /\blocked\s*:\s*true/, note: 'locked 只是身份标签；强制发动只看 forced —— 两者正交' },
  '拼点': { match: /chooseToCompare/, note: '拼点' },
  '额外回合': { match: /insertPhase\s*\(/, note: '插入阶段/回合' },
  '转换技': { match: /zhuanhuanji/, note: '转换技' },
  '观看牌堆并排序': { match: /chooseToGuanxing/, note: '观星式看牌排牌' },
};

/* ─────────── 输出辅助 ─────────── */
const pad = (s, n) => String(s).padEnd(n);
function fmtCluster(c, total) {
  const pct = ((c.n / total) * 100).toFixed(0);
  return `${c.n}/${total} (${pct}%)  ${c.sig || '(无调用)'}`;
}
function exemplars(list, n) {
  return list.slice(0, n).map((e) => `      ${e.file}:${e.line}  ${e.name}`).join('\n');
}

/* ─────────── 子命令 ─────────── */
const out = [];

if (opt('--idiom')) {
  const key = val('--idiom');
  if (!IDIOMS[key]) {
    console.error(`未知惯用法「${key}」。可用：${Object.keys(IDIOMS).join(' / ')}`);
    process.exit(2);
  }
  const def = IDIOMS[key];
  const hits = corpus.filter((s) => { def.match.lastIndex = 0; return def.match.test(s.text); });
  if (!hits.length) { console.error(`「${key}」在全库中 0 命中`); process.exit(1); }
  const cl = cluster(hits, def.match);

  if (JSON_OUT) {
    console.log(JSON.stringify({ idiom: key, hits: hits.length, clusters: cl.map((c) => ({ n: c.n, sig: c.sig, samples: c.list.slice(0, SHOW).map((e) => `${e.file}:${e.line} ${e.name}`) })) }, null, 2));
  } else {
    out.push(`═══ 惯用法：${key} ═══`);
    if (def.note) out.push(def.note);
    out.push(`全库命中 ${hits.length} 个技能，聚成 ${cl.length} 种写法`);
    out.push('');
    const main = cl[0];
    // ★ 语料只是证据，不是判决。多数派也可能整体写歪，
    //   而且常见情况是**根本没有压倒性写法**（这里额外出牌阶段就是 8:6）。
    //   没有过半就不许说「主导写法」——那是把 6/17 的少数派说成标准。
    const clear = main.n > hits.length / 2;
    if (!clear) {
      out.push(`⚠ 无压倒性写法：最大派也只占 ${main.n}/${hits.length}（${((main.n / hits.length) * 100).toFixed(0)}%）`);
      out.push('  → 必须按引擎语义判断，不要盲抄多数派。');
      out.push('');
    }
    out.push(`${clear ? '主导写法' : '最大派'}  ${fmtCluster(main, hits.length)}`);
    out.push(exemplars(main.list, SHOW));
    if (def.expect) {
      const ok = def.expect.test(main.sig);
      const counter = def.warn && def.warn.test(main.sig);
      out.push(`  判据：${ok ? '✅ 与引擎惯用法一致' : counter ? '⚠ 与已知正确姿势不符 —— 见下方说明' : '❓ 与已知判据不符'}（期望匹配 ${def.expect}）`);
    }
    const expected = cl.filter((c) => def.expect && def.expect.test(c.sig));
    if (def.expect && expected.length) {
      const tot = expected.reduce((a, c) => a + c.n, 0);
      out.push(`  符合判据的总计：${tot}/${hits.length}（聚成 ${expected.length} 种尾巴）`);
    }
    if (cl.length > 1) {
      out.push('');
      out.push(`其余 ${cl.length - 1} 种写法：`);
      for (const c of cl.slice(1)) {
        const flag = def.warn && def.warn.test(c.sig) ? '  ⚠ 已知不推荐' : '';
        out.push(`  ${fmtCluster(c, hits.length)}${flag}`);
        out.push(exemplars(c.list, SHOW));
      }
    }
    if (SNIPPET) {
      const e = main.list[0];
      out.push('');
      out.push(`── 主导写法完整源码（${e.file}:${e.line}-${e.endLine}，技能 ${e.name}）──`);
      out.push(e.text);
    }
  }
}

else if (opt('--find')) {
  const re = new RegExp(val('--find'), 'm');
  const hits = corpus.filter((s) => re.test(stripCommentsAndStrings(s.text)) || re.test(s.text));
  if (!hits.length) { console.error(`--find ${val('--find')} 全库 0 命中`); process.exit(1); }
  const cl = cluster(hits, re);
  if (JSON_OUT) {
    console.log(JSON.stringify({ pattern: val('--find'), hits: hits.length, clusters: cl.map((c) => ({ n: c.n, sig: c.sig, samples: c.list.slice(0, SHOW).map((e) => `${e.file}:${e.line} ${e.name}`) })) }, null, 2));
  } else {
    out.push(`═══ 正则查找：${val('--find')} ═══`);
    out.push(`命中 ${hits.length} 个技能，聚成 ${cl.length} 种写法`);
    out.push('');
    for (const c of cl.slice(0, 12)) {
      out.push(`${fmtCluster(c, hits.length)}`);
      out.push(exemplars(c.list, SHOW));
    }
    if (cl.length > 12) out.push(`... 其余 ${cl.length - 12} 种（用 --json 看全）`);
  }
}

else if (opt('--mine')) {
  const N = parseInt(val('--n', '3'), 10);
  const grams = ngramMine(corpus, N);
  if (JSON_OUT) {
    console.log(JSON.stringify({ total: corpus.length, n: N, top: grams.slice(0, TOP) }, null, 2));
  } else {
    out.push(`═══ 全库高频调用序列 ${N}-gram TOP ${TOP}（共 ${corpus.length} 个技能）═══`);
    out.push('每条都是「写法」而非「技能」—— 跨技能反复出现的片段就是引擎惯用法');
    out.push('');
    for (const g of grams.slice(0, TOP)) {
      out.push(`${String(g.n).padStart(5)}×  ${g.sig}`);
      out.push(`        ${g.samples.slice(0, 3).join('   ')}`);
    }
  }
}

else usage('需要 --idiom / --find / --mine 之一');

if (!JSON_OUT) console.log(out.join('\n'));
