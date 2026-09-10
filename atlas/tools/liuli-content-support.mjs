#!/usr/bin/env node
/*
 * liuli-content-support.mjs —— 琉璃版 5.5 的 content 写法支持矩阵
 *
 * ★ 重要：琉璃版 parsex 有**两条分支**，由 localStorage 的 finalParsex 决定
 *   （game.js:12070-12071）。两条分支的行为完全不同，必须分别判定：
 *
 *   [A] finalParsex == 'old'  （game.js:12072-12090）
 *       纯正则替换；**无 generator 判断**；**无 try/catch**
 *       → generator 会被 str.slice(str.indexOf('{')+1) 从解构参数处切错位 → SyntaxError 硬报错
 *       → 嵌套 'step N' 也会硬报错
 *
 *   [B] 其他值（else 分支，game.js:12091-12189）
 *       gnc.isGeneratorFunc 命中 → generator 走独立分支（不编译源码，可用）
 *       普通函数 → Legacy()，**带 try/catch** → 非法替换被静默跳过（技能静默失效）
 *
 * 用法：node liuli-content-support.mjs
 */

const GeneratorFunction = (function* () {}).constructor;
const AsyncFunction = (async function () {}).constructor;
const gnc = { is: { generatorFunc: (item) => item instanceof GeneratorFunction } };

const COMMENT_RE = /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg;

const PARAMS = ['event', 'step', 'source', 'player', 'target', 'targets',
  'card', 'cards', 'skill', 'forced', 'num', 'trigger', 'result',
  '_status', 'lib', 'game', 'ui', 'get', 'ai'];

/* ══════ [A] finalParsex == 'old' ══════ */
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
  return new Function(...PARAMS, str);          // 无 try/catch
}

/* ══════ [B] else 分支 ══════ */
function Legacy(func) {
  let str = func.toString().replace(COMMENT_RE, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);
  if (str.indexOf('step 0') == -1) {
    str = '{if(event.step==1) {event.finish();return;}\n' + str;
  } else {
    let skip = 0;
    for (let k = 0; k < 99; k++) {
      const reg = new RegExp(`['"]step ${k}['"]`);
      const result = str.slice(skip).match(reg);
      if (result == null) break;
      const insertStr = k === 0 ? `switch(step){case 0:` : `break;case ${k}:`;
      const copy = str.slice(0, skip + result.index) + insertStr + str.slice(skip + result.index + result[0].length);
      try { new Function(copy); str = copy; skip += result.index + insertStr.length; }
      catch (error) { k--; skip += result.index + result[0].length; }   // 静默跳过
    }
    str = `if(event.step==${'K'}){event.finish();return;}` + str;
  }
  return new Function(...PARAMS, str);
}

function parsexElse(item) {
  switch (typeof item) {
    case 'object':
      if (Array.isArray(item)) return { kind: 'array', fn: null };
      throw new Error('NYI: Parse Common Object');
    case 'function':
      if (gnc.is.generatorFunc(item)) {
        let gen, lastEvent;
        return {
          kind: 'generator', fn: (event, step, source, player, target, targets, card, cards, skill, forced, num, trigger, result) => {
            if (!gen) gen = item(event, { event, step, source, player, target, targets, card, cards, skill, forced, num, trigger, result });
            const res = gen.next((lastEvent && ('result' in lastEvent)) ? lastEvent.result : null);
            if (res.done) event.finish(); else lastEvent = res.value;
          }
        };
      }
      return { kind: 'Legacy', fn: Legacy(item) };
    default:
      return { kind: 'string-lookup', fn: null };
  }
}

/* ══════ 测试用例 ══════ */
const cases = {
  '普通函数，无 step（单步）': function () { player.draw(2); },
  '普通函数，step 顶格（0..1）': function () { 'step 0'; player.draw(2); 'step 1'; player.recover(); },
  '普通函数，step 顶格（0..7）': function () {
    'step 0'; player.chooseBool('a');
    'step 1'; if (result.bool) { }
    'step 2'; player.chooseBool('b');
    'step 3'; if (result.bool) { }
    'step 4'; player.chooseBool('c');
    'step 5'; if (result.bool) { }
    'step 6'; player.chooseBool('d');
    'step 7'; if (result.bool) { }
  },
  '普通函数，step 嵌在 if 内': function () { 'step 0'; if (1) { 'step 1'; } },
  '普通函数，step 重复': function () { 'step 0'; a(); 'step 3'; b(); 'step 3'; c(); 'step 4'; d(); },
  'generator（无解构参数）': function* () { var r = yield player.chooseBool('x'); },
  'generator（解构参数 { player }）': function* (event, { player }) { var r = yield player.chooseBool('x'); },
  'async（含 await）': async function (event, trigger, player) { await player.draw(2); },
};

console.log('content 写法'.padEnd(36) + '类型'.padEnd(18) + 'A: finalParsex=old'.padEnd(26) + 'B: else 分支');
console.log('-'.repeat(112));

for (const [name, fn] of Object.entries(cases)) {
  const type = fn instanceof GeneratorFunction ? 'GeneratorFunction'
    : fn instanceof AsyncFunction ? 'AsyncFunction' : 'Function';

  let a;
  try { parsexOld(fn); a = '✅ 可编译'; }
  catch (e) { a = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 30); }

  let b;
  try { const r = parsexElse(fn); b = '✅ 可编译 [' + r.kind + ']'; }
  catch (e) { b = '❌ ' + e.constructor.name + ': ' + e.message.slice(0, 30); }

  console.log(name.padEnd(36) + type.padEnd(18) + a.padEnd(26) + b);
}

console.log('');
console.log('注：[A] 抛错 = 技能事件创建时硬报错（可见）；[B] 若非法替换被静默跳过，会编译"成功"但状态机错位（不可见）。');
console.log('    [B] 中「普通函数，step 嵌在 if 内」/「step 重复」两项请再看 parsex-audit.mjs 的残留统计。');
