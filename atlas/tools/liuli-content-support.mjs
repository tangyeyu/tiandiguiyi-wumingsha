#!/usr/bin/env node
/*
 * liuli-content-support.mjs
 * 忠实复刻琉璃版 game.js:12070-12133 的 parsex 三分支，判定各类 content 写法能否编译。
 *
 * 结论用途：判断官方 docs 推荐的 async content 能否用于琉璃版 5.5。
 */

const GeneratorFunction = (function* () {}).constructor;
const AsyncFunction = (async function () {}).constructor;

const COMMENT_RE = /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg;

/* ── game.js:12094-12134 的 Legacy() ── */
function Legacy(func) {
  let str = func.toString().replace(COMMENT_RE, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);

  if (str.indexOf('step 0') === -1) {
    str = '{if(event.step==1) {event.finish();return;}\n' + str;
  } else {
    let skip = 0;
    for (let k = 0; k < 99; k++) {
      const reg = new RegExp(`['"]step ${k}['"]`);
      const result = str.slice(skip).match(reg);
      if (result == null) break;
      const insertStr = k === 0 ? `switch(step){case 0:` : `break;case ${k}:`;
      const copy = str.slice(0, skip + result.index) + insertStr + str.slice(skip + result.index + result[0].length);
      try {
        new Function(copy);
        str = copy;
        skip += result.index + insertStr.length;
      } catch (error) {
        k--;
        skip += result.index + result[0].length;
      }
    }
    str = `if(event.step==${'K'}){event.finish();return;}`.replace("'K'", 'K') + str;
  }
  // 真实实现没有 try/catch —— 语法错误会直接抛出
  return new Function('event', 'step', 'source', 'player', 'target', 'targets',
    'card', 'cards', 'skill', 'forced', 'num', 'trigger', 'result',
    '_status', 'lib', 'game', 'ui', 'get', 'ai', str);
}

/* ── game.js:12135-12163 的 switch(typeof item) ── */
function parsex(item) {
  const kind =
    item instanceof GeneratorFunction ? 'generator' :
    item instanceof AsyncFunction ? 'async' :
    typeof item === 'function' ? 'plain-function' : typeof item;

  switch (typeof item) {
    case 'object':
      if (Array.isArray(item)) return { kind: 'array', note: 'ArrayCompiler 分支' };
      throw new Error('NYI: Parse Common Object');
    case 'function':
      if (item instanceof GeneratorFunction) {
        // generator 分支：直接调用 item(event, {...})，不做源码编译
        return { kind, note: '走 generator 分支，不编译源码' };
      }
      // 关键：async function 不是 GeneratorFunction → 掉进 Legacy()
      Legacy(item);
      return { kind, note: '走 Legacy() 源码编译分支' };
    default:
      return { kind, note: '按 lib.element.content[名字] 查表' };
  }
}

const cases = {
  '普通 step content（单步，无 step 0）': function () { player.draw(2); },
  '普通 step content（多步 step 0..1）': function () { 'step 0'; player.draw(2); 'step 1'; player.discard(); },
  '普通 step content（嵌套在 if 内）': function () { 'step 0'; if (1) { 'step 1'; } },
  'generator content': function* (event, { player }) { const r = yield player.draw(2); },
  'async content（无 await）': async function (event, trigger, player) { player.draw(2); },
  'async content（含 await）': async function (event, trigger, player) { await player.draw(2); },
  'async content（含 await + forResult）': async function (event, trigger, player) { const r = await player.chooseBool().forResult(); },
};

console.log('content 写法'.padEnd(40) + '类型'.padEnd(16) + '结果');
console.log('-'.repeat(100));
for (const [name, fn] of Object.entries(cases)) {
  let res;
  try {
    const r = parsex(fn);
    res = `✅ 可编译   [${r.note}]`;
  } catch (e) {
    res = `❌ 抛错     ${e.constructor.name}: ${e.message}`;
  }
  const kind = fn instanceof GeneratorFunction ? 'GeneratorFunction'
    : fn instanceof AsyncFunction ? 'AsyncFunction' : 'Function';
  console.log(name.padEnd(40) + kind.padEnd(16) + res);
}
