#!/usr/bin/env node
/*
 * sim-content.mjs —— 运行期模拟：复刻琉璃版 parsex 的分支判定与 content 调用
 *
 * 目的：在不启动游戏的前提下，回答「这个 content 走哪条编译分支、能不能跑起来」。
 *
 * 用法：node atlas/tools/sim-content.mjs <extension.js 路径>
 */

import fs from 'node:fs';

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node sim-content.mjs <extension.js>'); process.exit(2); }

/* ══════ 1. 复刻 game.js:338-375 的 gnc ══════ */
const GeneratorFunction = (function* () {}).constructor;
const gnc = { is: { generatorFunc: (item) => item instanceof GeneratorFunction } };

/* ══════ 2. 复刻 game.js:12070-12190 的 parsex ══════ */
const COMMENT_RE = /((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg;

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
      try { new Function(copy); str = copy; skip += result.index + insertStr.length; }
      catch (error) { k--; skip += result.index + result[0].length; }
    }
    str = `if(event.step==${'K'}){event.finish();return;}` + str;
  }
  return new Function('event', 'step', 'source', 'player', 'target', 'targets',
    'card', 'cards', 'skill', 'forced', 'num', 'trigger', 'result',
    '_status', 'lib', 'game', 'ui', 'get', 'ai', str);   // 真实实现无 try/catch
}

function parseX(item) {
  switch (typeof item) {
    case 'object':
      if (Array.isArray(item)) return { branch: 'array', fn: null };
      throw new Error('NYI: Parse Common Object');
    case 'function':
      if (gnc.is.generatorFunc(item)) {
        let gen, lastEvent;
        const wrapper = (event, step, source, player, target, targets, card, cards, skill, forced, num, trigger, result, _status, lib, game, ui, get, ai) => {
          if (!gen) gen = item(event, { event, step, source, player, target, targets, card, cards, skill, forced, num, trigger, result });
          const res = gen.next((lastEvent && ('result' in lastEvent)) ? lastEvent.result : null);
          if (res.done) event.finish();
          else lastEvent = res.value;
        };
        return { branch: 'generator', fn: wrapper };
      }
      return { branch: 'Legacy', fn: Legacy(item) };
    default:
      return { branch: 'string-lookup', fn: null };
  }
}

/* ══════ 3. 装载扩展（复用 mock-load 的思路） ══════ */
function mkArr(init = []) {
  const a = init.slice();
  for (const [k, f] of [['contains', function (x) { return this.indexOf(x) !== -1 }], ['add', function (x) { if (this.indexOf(x) === -1) this.push(x); return this }], ['addArray', function (x) { for (const i of x) this.add(i); return this }]]) {
    Object.defineProperty(a, k, { value: f, enumerable: false });
  }
  return a;
}
const lib = {
  config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() },
  translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(),
  imported: { character: {}, card: {} },
};
const game = {
  log() {}, players: [], hasPlayer() { return false; },
  import(type, fn) {
    if (type === 'extension') { game._ext = fn(lib, game, {}, {}, {}, {}); return game._ext; }
    const obj = fn(lib, game, {}, {}, {}, {});
    if (obj && obj.name) lib.imported.character[obj.name] = obj;
    return obj;
  },
};
new Function('game', 'lib', 'ui', 'get', 'ai', '_status', fs.readFileSync(FILE, 'utf8'))(game, lib, {}, {}, {}, {});
game._ext.precontent.call(game._ext);

const pkg = lib.imported.character['tiandiguiyi'];
const skills = pkg.skill;

/* ══════ 4. 逐个 content 判定分支 ══════ */
console.log('=== 技能 content 的编译分支判定 ===');
console.log('');
const skillNames = Object.keys(skills).filter((s) => typeof skills[s].content === 'function');
let bad = 0;
for (const name of skillNames) {
  const c = skills[name];
  let r;
  try {
    r = parseX(c.content);
    console.log(`  ✅ ${name.padEnd(20)} 分支=${r.branch.padEnd(16)} 源声明=${c.content.constructor.name}`);
  } catch (e) {
    bad++;
    console.log(`  ❌ ${name.padEnd(20)} 分支=Legacy            ⇒ ${e.constructor.name}: ${e.message}`);
  }
}
console.log('');
console.log(`带 content 的技能 ${skillNames.length} 个，编译失败 ${bad} 个`);

/* ══════ 5. 真正调用一次 generator content，看会不会走到 yield ══════ */
console.log('');
console.log('=== 模拟调用（看 generator 是否真的执行到 yield）===');
console.log('');
for (const name of ['mgj_dingce', 'mgj_zhuce', 'mgj_ce_remove']) {
  const sk = skills[name];
  if (!sk) { console.log(`  ${name}: 不存在`); continue; }
  const r = parseX(sk.content);
  if (r.branch !== 'generator') { console.log(`  ${name}: 非 generator 分支（${r.branch}），跳过`); continue; }

  const calls = [];
  const fakePlayer = {
    name: '谋郭嘉·魂', storage: {}, playerid: 1,
    chooseTarget(...a) { calls.push(['chooseTarget', a[0]]); return { set() { return this; } }; },
    chooseBool(...a) { calls.push(['chooseBool', a[0]]); return { set() { return this; } }; },
    hasSkill() { return true; }, hasMark() { return false; }, countMark() { return 0; },
  };
  const fakeEvent = {
    step: 0, next: [], _result: {}, finished: false, name,
    player: fakePlayer, skill: name,
    finish() { this.finished = true; calls.push(['event.finish']); },
  };
  try {
    r.fn(fakeEvent, 0, undefined, fakePlayer, undefined, undefined, undefined, undefined,
      name, undefined, undefined, undefined, undefined, {}, lib, game, {}, {}, {});
    console.log(`  ${name}: 首次调用后 → ${calls.length ? '✅ 已执行到 ' + JSON.stringify(calls[0][0]) : '⚠ 未产生任何调用（可能提前 return）'}`);
    if (calls.length) console.log(`         参数：${JSON.stringify(calls[0][1])}`);
  } catch (e) {
    console.log(`  ${name}: ❌ ${e.constructor.name}: ${e.message}`);
  }
}
