/*
 * parsex-model.mjs —— 琉璃版 parsex 的**共享忠实模型**
 *
 * 教训来源：只建模一条分支会得出完全相反的结论。本模块把 game.js:12070-12189
 * 的两条分支原样复刻一份，供 verify-extension / lint-extension 等工具共用，
 * 避免每个工具各写一份、各错一处。
 *
 * ── 忠实度对照（改这里前请先复核行号）──────────────────────────
 *   old  分支 game.js:12072-12089  —— 不剥注释、无 generator 判定、无 try/catch
 *   else 分支 game.js:12091-12189  —— 先剥注释、有 gnc.isGeneratorFunc 判定、
 *                                     Legacy() 内含 try/catch（非法处静默跳过）
 *
 * ── 引擎到底编译哪些字段？（等价于「哪些字段被喂给 setContent」）──
 * setContent 是 parsex 的**唯一**调用点（game.js:31991-32006）。
 * 逐个调用点核对后，实际会被编译的字段如下：
 *
 *   技能 skill.name
 *     content      game.js:15254 / 15555      ← 主战场
 *     precontent   game.js:16423 / 16604      ← 极易被漏掉
 *   卡牌 card.name
 *     content         game.js:19560 / 19856
 *     contentBefore   game.js:19503 / 19826
 *     contentAfter    game.js:19611 / 19905
 *     effect          game.js:13237 / 16113
 *     cancel          game.js:13220 / 16104
 *   装备 card.name（装备牌专属）
 *     onEquip         game.js:13524 / 13531
 *     onLose          game.js:20714 / 20722 / 28523
 *     replaceEquip    game.js:13489
 *
 * 除此之外的字段（filter / check / ai / init / intro / trigger / …）**不经过 new Function**，
 * 是当普通函数直接调用的 —— 闭包完好、参数正常。这条区别见 01-引擎契约.md 铁律二。
 */

/* else 分支用的剥注释正则（game.js:12097 原样搬过来） */
export const COMMENT_RE =
  /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/gm;

/* new Function 的形参表，两条分支一致（game.js:12087-12089） */
export const PARAMS = [
  'event', 'step', 'source', 'player', 'target', 'targets', 'card', 'cards',
  'skill', 'forced', 'num', 'trigger', 'result', '_status', 'lib', 'game', 'ui', 'get', 'ai',
];

const GeneratorFunction = (function* () {}).constructor;
export const isGeneratorFunc = (x) => x instanceof GeneratorFunction;

/**
 * [A] finalParsex == 'old'（UI 里的「疾速模式」）
 * 对应 game.js:12072-12089。没有任何容错 —— 编译不过就抛。
 */
export function parsexOld(item) {
  let str = item.toString();
  str = str.slice(str.indexOf('{') + 1);
  if (str.indexOf('step 0') == -1) {
    str = '{if(event.step==1) {event.finish();return;}' + str;
  } else {
    for (var k = 1; k < 99; k++) {
      if (str.indexOf('step ' + k) == -1) break;
      str = str.replace(new RegExp("'step " + k + "'", 'g'), 'break;case ' + k + ':');
      str = str.replace(new RegExp('"step ' + k + '"', 'g'), 'break;case ' + k + ':');
    }
    str = str.replace(/'step 0'|"step 0"/, 'if(event.step==' + k + '){event.finish();return;}switch(step){case 0:');
  }
  if (!str) str = '';
  return new Function(...PARAMS, str);
}

/**
 * [B] else 分支。对应 game.js:12091-12189。
 * generator 直接放行（引擎走 gnc.of 协程化，不经过 Legacy）；
 * 普通函数走 Legacy，非法替换处被 try/catch 静默跳过（这是最阴的坑）。
 * @returns {{kind:'generator'|'Legacy', ok:true, skipped:number}}
 */
export function parsexElse(item) {
  if (typeof item === 'function' && isGeneratorFunc(item)) {
    return { kind: 'generator', ok: true, skipped: 0 };
  }
  let str = item.toString().replace(COMMENT_RE, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);
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
      try {
        new Function(copy);
        str = copy;
        skip += m.index + ins.length;
      } catch (e) {
        // ★ 静默跳过：标记原样留在源码里，那个步骤永远不会切换
        k--;
        skip += m.index + m[0].length;
      }
    }
    str = `if(event.step==K){event.finish();return;}` + str;
  }
  const rest = (str.match(/['"]step \d+['"]/g) || []).length;
  return { kind: 'Legacy', ok: true, skipped: rest };
}

/* ────────────────────── 源码抽取 ────────────────────── */

/** 从 text[open]（必须是 '{'）开始做 brace matching，返回配对 '}' 的下标；失败返回 -1。
 *  会跳过注释与字符串。 */
export function matchBrace(text, open) {
  let d = 0, i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < text.length) { if (text[i] === '\\') { i += 2; continue; } if (text[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
    i++;
  }
  return -1;
}

export const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/** 默认体检的技能字段集（= 引擎真正会 parsex 的技能字段） */
export const SKILL_FIELDS = ['content', 'precontent'];
/** 卡牌 / 装备字段集，仅在 --cards 时启用 */
export const CARD_FIELDS = ['content', 'contentBefore', 'contentAfter', 'effect', 'cancel', 'onEquip', 'onLose', 'replaceEquip'];

/**
 * 抽取被 parsex 编译的字段定义。
 * 只认「字段名 : [function[*]] ( ... ) {」这种**函数字面量**形态 ——
 * 因此 `intro:{ content: '……文本……' }` 这类字符串不会被误抓。
 * @param {string} src 源码
 * @param {string[]} fields 字段名集合
 * @returns {{line:number, field:string, isGen:boolean, fnText:string, index:number}[]}
 */
export function extractCompiledFields(src, fields = SKILL_FIELDS) {
  const alt = fields.map((f) => f.replace(/\$/g, '\\$')).join('|');
  // (?<![\w$.]) 排除 `lib.element.content:` 这类成员访问
  const RE = new RegExp(`(?<![\\w$.])(${alt})\\s*:\\s*(function\\s*\\*?\\s*)?\\([^)]*\\)\\s*\\{`, 'g');
  const out = [];
  let m;
  while ((m = RE.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    out.push({
      line: lineOf(src, m.index),
      field: m[1],
      isGen: !!(m[2] && m[2].includes('*')),
      fnText: src.slice(m.index, close + 1),
      index: m.index,
    });
  }
  return out;
}

/** 定位 `key: {` 并返回该对象块的源码与起止下标（找不到返回 null） */
export function extractObjectBlock(src, key) {
  const re = new RegExp(`(?<![\\w$.])${key}\\s*:\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const close = matchBrace(src, open);
  if (close < 0) return null;
  return { text: src.slice(open, close + 1), open, close, index: m.index };
}

/** 取对象块里**顶层**的键名（深度 1）。支持 'k': / "k": / k: 三种写法。 */
export function topLevelKeys(blockText) {
  const keys = [];
  let d = 0, i = 0;
  const n = blockText.length;
  while (i < n) {
    const c = blockText[i];
    if (c === '/' && blockText[i + 1] === '/') { while (i < n && blockText[i] !== '\n') i++; continue; }
    if (c === '/' && blockText[i + 1] === '*') { i += 2; while (i < n && !(blockText[i] === '*' && blockText[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      // 在深度 1 上，字符串后紧跟 ':' 即为键
      const q = c; let j = i + 1;
      while (j < n) { if (blockText[j] === '\\') { j += 2; continue; } if (blockText[j] === q) break; j++; }
      const val = blockText.slice(i + 1, j);
      let k = j + 1;
      while (k < n && /\s/.test(blockText[k])) k++;
      if (d === 1 && blockText[k] === ':') keys.push(val);
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') { d++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { d--; i++; continue; }
    if (d === 1 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(blockText[j])) j++;
      let k = j;
      while (k < n && /\s/.test(blockText[k])) k++;
      if (blockText[k] === ':') keys.push(blockText.slice(i, j));
      i = j;
      continue;
    }
    i++;
  }
  return keys;
}

/** 去掉注释与字符串字面量（用于标识符扫描，避免把注释里的名字算成引用） */
export function stripCommentsAndStrings(text) {
  return text
    .replace(COMMENT_RE, (mm, cmt, other) => (cmt ? ' ' : other))
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');
}

/**
 * 在给定源码里找**顶层**声明（深度 1）的变量 / 函数名。
 * 用来收集「包级闭包变量」—— 这些名字在 content 内部必然是 undefined。
 */
export function topLevelDeclarations(blockText) {
  const names = new Set();
  const body = blockText;
  let d = 0, i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) { if (body[i] === '\\') { i += 2; continue; } if (body[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '/' && body[i + 1] === '/') { while (i < n && body[i] !== '\n') i++; continue; }
    if (c === '/' && body[i + 1] === '*') { i += 2; while (i < n && !(body[i] === '*' && body[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{' || c === '(' || c === '[') { d++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { d--; i++; continue; }
    if (d === 1) {
      const rest = body.slice(i);
      let mm;
      if ((mm = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/.exec(rest))) {
        names.add(mm[1]); i += mm[0].length; continue;
      }
      if ((mm = /^function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(rest))) {
        names.add(mm[1]); i += mm[0].length; continue;
      }
    }
    i++;
  }
  return names;
}

/** 标识符是否在该段代码里被当作名字使用（整词匹配，排除成员访问与属性名） */
export function referencesName(strippedText, name) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  return re.test(strippedText);
}

/** 该段代码是否**自己声明**了同名局部变量/函数/形参（声明了就说明不是逃逸引用） */
export function declaresLocally(strippedText, name) {
  const esc = name.replace(/\$/g, '\\$');
  if (new RegExp(`(?:var|let|const|function)\\s*\\*?\\s*${esc}\\b`).test(strippedText)) return true;
  return false;
}
