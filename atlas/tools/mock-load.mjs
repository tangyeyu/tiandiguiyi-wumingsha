#!/usr/bin/env node
/*
 * mock-load.mjs —— 离线 mock 加载无名杀扩展，验证注册链
 *
 * 目的：在不启动游戏的情况下，把扩展文件真的执行一遍，
 *       复现引擎的注册链，定位「武将无名 / 技能不触发」这类注册期故障。
 *
 * 用法：node atlas/tools/mock-load.mjs <extension.js 路径>
 */

import fs from 'node:fs';
import path from 'node:path';

const FILE = process.argv[2];
if (!FILE) { console.error('用法: node mock-load.mjs <extension.js>'); process.exit(2); }

/* ── 构造一个具备 Array.contains/.add 的数组（无名杀改过 Array.prototype） ── */
function mkArr(init = []) {
  const a = init.slice();
  Object.defineProperty(a, 'contains', { value: function (x) { return this.indexOf(x) !== -1; }, enumerable: false });
  Object.defineProperty(a, 'add', { value: function (x) { if (this.indexOf(x) === -1) this.push(x); return this; }, enumerable: false });
  Object.defineProperty(a, 'addArray', { value: function (x) { for (const i of x) this.add(i); return this; }, enumerable: false });
  Object.defineProperty(a, 'remove', { value: function (x) { const i = this.indexOf(x); if (i >= 0) this.splice(i, 1); return this; }, enumerable: false });
  return a;
}

const lib = {
  config: {
    all: { characters: mkArr(), cards: [], sgscharacters: mkArr() },
    characters: mkArr(),
    hiddenCharacterPack: [],
    forbidai: mkArr(),
  },
  translate: {},
  character: {},
  characterPack: {},
  skill: {},
  skilllist: mkArr(),
  imported: { character: {}, card: {} },
};

const logs = [];
const game = {
  log(...a) { logs.push(a.map((x) => (typeof x === 'object' ? (x.name || '[obj]') : String(x))).join(' ')); },
  import(type, fn) {
    if (type === 'extension') {
      const ext = fn(lib, game, {}, {}, {}, {});
      game._extension = ext;
      return ext;
    }
    // 引擎里 character 通道是「收集进 lib.imported.character[name]」
    const obj = fn(lib, game, {}, {}, {}, {});
    if (obj && obj.name) lib.imported.character[obj.name] = obj;
    return obj;
  },
  players: [],
  hasPlayer() { return false; },
  delay() {}, delayx() {},
};
const ui = {};
const get = { translation: (x) => lib.translate[x] || x, info: (x) => lib.skill[x] };
const ai = {};
const _status = {};

/* ── 执行扩展文件 ── */
const src = fs.readFileSync(FILE, 'utf8');
console.log(`装载：${path.basename(FILE)}（${(Buffer.byteLength(src) / 1024).toFixed(1)} KB）`);
console.log('');

let loadError = null;
try {
  // 扩展文件是脚本（非模块），用 Function 注入 mock 全局
  const run = new Function('game', 'lib', 'ui', 'get', 'ai', '_status', src);
  run(game, lib, ui, get, ai, _status);
} catch (e) {
  loadError = e;
}

console.log('=== ① 文件执行 ===');
if (loadError) {
  console.log(`  ❌ 抛错：${loadError.constructor.name}: ${loadError.message}`);
  console.log(loadError.stack.split('\n').slice(0, 4).map((l) => '     ' + l.trim()).join('\n'));
} else {
  console.log('  ✅ 无异常');
}
console.log(`  game.import('extension') 返回对象：${game._extension ? '有' : '无'}`);
if (game._extension) {
  console.log(`    name=${JSON.stringify(game._extension.name)}  editable=${game._extension.editable}  precontent=${typeof game._extension.precontent}`);
}

/* ── 执行 precontent（启用扩展时引擎会调它） ── */
console.log('');
console.log('=== ② precontent 执行 ===');
let pcError = null;
if (game._extension && typeof game._extension.precontent === 'function') {
  try { game._extension.precontent.call(game._extension); }
  catch (e) { pcError = e; }
  if (pcError) {
    console.log(`  ❌ 抛错：${pcError.constructor.name}: ${pcError.message}`);
    console.log(pcError.stack.split('\n').slice(0, 4).map((l) => '     ' + l.trim()).join('\n'));
  } else console.log('  ✅ 无异常');
} else console.log('  ⚠ 无 precontent');

/* ── 检查导入结果 ── */
console.log('');
console.log('=== ③ 导入到 lib.imported.character 的包 ===');
const packs = Object.keys(lib.imported.character);
console.log(`  ${packs.length} 个：${packs.join(', ') || '（无）'}`);

const pkg = lib.imported.character['tiandiguiyi'];
if (!pkg) {
  console.log('  ❌ 未找到包 tiandiguiyi —— 武将包根本没被导入！');
} else {
  console.log(`  ✅ name=${pkg.name}`);
  console.log(`  character 键：${Object.keys(pkg.character || {}).join(', ')}`);
  console.log(`  skill 键数：${Object.keys(pkg.skill || {}).length}`);
  console.log(`  translate 键数：${Object.keys(pkg.translate || {}).length}`);
}

/* ── 复刻引擎注册链（game.js:15126-15167 的关键分支）── */
console.log('');
console.log('=== ④ 复刻注册链（game.js:15126+ 的数组下标分支）===');
function registerLikeEngine(characterMap) {
  const problems = [];
  for (const i in characterMap) {
    const pack = characterMap[i];
    if (pack.character) {
      const existing = lib.characterPack[i];
      if (existing) Object.assign(existing, pack.character);
      else lib.characterPack[i] = pack.character;
    }
    if (pack.forbid && pack.forbid.contains && pack.forbid.contains(lib.config.mode)) continue;
    if (pack.mode && pack.mode.contains && !pack.mode.contains(lib.config.mode)) continue;
    for (const j in pack) {
      if (j === 'mode' || j === 'forbid' || j === 'characterSort') continue;
      const grp = pack[j];
      if (!grp || typeof grp !== 'object') continue;
      for (const k in grp) {
        if (j === 'character') {
          // ★ 引擎在这里按位置下标操作：character[i][j][k][4] / [k][3].length
          const ent = grp[k];
          try {
            if (!ent[4]) ent[4] = [];
            if (ent[4].contains && (ent[4].contains('boss') || ent[4].contains('hiddenboss'))) lib.config.forbidai.add(k);
            for (let l = 0; l < ent[3].length; l++) lib.skilllist.add(ent[3][l]);
          } catch (e) {
            problems.push(`character ${k}：${e.constructor.name}: ${e.message}`);
          }
        }
        if (j === 'translate' && k === i) lib.translate[k + '_character_config'] = grp[k];
        else {
          if (lib[j] && lib[j][k] === undefined) lib[j][k] = grp[k];
        }
      }
    }
  }
  return problems;
}

if (pkg) {
  const probs = registerLikeEngine(lib.imported.character);
  if (probs.length) probs.forEach((p) => console.log(`  ❌ ${p}`));
  else console.log('  ✅ 注册链无异常');
}

/* ── 展平 + 断言 ── */
for (const i in lib.characterPack) {
  for (const j in lib.characterPack[i]) lib.character[j] = lib.character[j] || lib.characterPack[i][j];
}

console.log('');
console.log('=== ⑤ 关键断言 ===');
const assert = (ok, label, extra = '') => console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  → ' + extra : ''}`);

assert(!!lib.character['mouguojia_soul'], '武将 mouguojia_soul 已展平进 lib.character');
assert(lib.translate['mouguojia_soul'] === '谋郭嘉·魂', '译名 mouguojia_soul', JSON.stringify(lib.translate['mouguojia_soul']));
assert(lib.translate['tiandiguiyi_character_config'] === '天地归一', '包名标签', JSON.stringify(lib.translate['tiandiguiyi_character_config']));

const wantSkills = ['mgj_dingce', 'mgj_zhuce', 'mgj_lixue', 'mgj_nohurt', 'mgj_ce_remove', 'mgj_eff1', 'mgj_extra_phase', 'mgj_boost', 'mgj_skip'];
const missingSkill = wantSkills.filter((s) => !lib.skill[s]);
assert(!missingSkill.length, '9 个技能全部注册进 lib.skill', missingSkill.length ? '缺：' + missingSkill.join(',') : '');

const arr = lib.character['mouguojia_soul'];
if (Array.isArray(arr)) {
  assert(arr[3] && arr[3].length === 9, '武将数组[3] 技能数', String(arr[3] && arr[3].length));
  assert(Array.isArray(arr[4]), '武将数组[4] 为数组（引擎要 .concat / .contains）', JSON.stringify(arr[4]));
} else {
  console.log('  ❌ 武将不是数组式 —— 引擎注册链会崩');
}

// 技能名 ↔ 译名 成对
const paired = wantSkills.filter((s) => lib.translate[s] && lib.translate[s + '_info']);
assert(paired.length === wantSkills.length, '技能名与 _info 成对', `${paired.length}/${wantSkills.length}`);

console.log('');
console.log('=== ⑥ translate 全量（排查空名）===');
for (const k of Object.keys(lib.translate).sort()) {
  const v = lib.translate[k];
  console.log(`  ${k.padEnd(28)} = ${JSON.stringify(v)}`);
}

if (logs.length) {
  console.log('');
  console.log(`=== ⑦ 运行期 game.log（${logs.length} 条）===`);
  logs.slice(0, 10).forEach((l) => console.log('  ' + l));
}
