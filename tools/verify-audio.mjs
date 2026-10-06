// ============================================================
// 台词接线验证器（对游戏资源做实证核对，不执行游戏代码）
//
// 校验三件事：
//   1) 扩展里每个 `audio: '<字符串>'` —— 该字符串必须是**真实存在的技能名**
//      （引擎 game.js:37382-37414：字符串且 lib.skill[该名] 存在才跳转；否则落到
//       `if (audioinfo.indexOf('ext:')!=0) return;` ⇒ 静默无声）
//   2) 被借用的技能，其 audio 字段解析出的音频文件必须真的存在
//   3) 角色 [4] 标签里的 `die:<路径>` 指向的音频必须存在
//
// 自校准：
//   正例 = 含台词版（应全 PASS）
//   反例 = 把改动前的版本跑一遍（如 audio:'shen_machao' / audio:'wuku' 不存在该技能 → 必须 FAIL）
//
// 用法: node tools/verify-audio.mjs <extension.js> [--app <游戏 resources/app>] [--label 名称]
//       --app 缺省读环境变量 NONAME_APP，再缺省用本机位置
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const li = process.argv.indexOf('--label');
const label = li >= 0 ? process.argv[li + 1] : file;
// 游戏根目录（resources/app）：--app <路径> 优先，其次环境变量 NONAME_APP，最后用本机默认位置
const ai = process.argv.indexOf('--app');
const APP = (ai >= 0 ? process.argv[ai + 1] : process.env.NONAME_APP)
  || 'C:/Users/luoti/Desktop/三国杀·琉璃版5.5【电脑版】（修复清正）/resources/app';
if (!file) {
  console.error('用法: node tools/verify-audio.mjs <extension.js> [--app <游戏 resources/app 路径>] [--label 名称]');
  process.exit(2);
}
if (!fs.existsSync(APP)) {
  console.error(`找不到游戏目录: ${APP}\n用 --app <路径> 指定，或设环境变量 NONAME_APP`);
  process.exit(2);
}

const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const rows = [];

// ── 收集游戏里所有角色文件的技能名（词法扫描：  <name>:{  形式）──────────
const charDir = path.join(APP, 'character');
const skillDefs = new Map();   // skillName -> 源标识
const skillSrc = new Map();    // skillName -> 该技能的源码文本来源
function scanDefs(src, tag) {
  for (const m of src.matchAll(/^[\t ]*([a-zA-Z_$][\w$]*)\s*:\s*\{/gm)) {
    if (!skillDefs.has(m[1])) { skillDefs.set(m[1], tag); skillSrc.set(m[1], src); }
  }
}
for (const f of fs.readdirSync(charDir)) {
  if (!f.endsWith('.js')) continue;
  scanDefs(fs.readFileSync(path.join(charDir, f), 'utf8'), f);
}
// ★ 扩展**自己**定义的技能也必须算数：天地归一的 zl_kongcheng / zyyi / zycf 等都是
//   包内技能名，只扫 character/*.js 会把它们误判成"游戏里没有这个技能"（已踩过）。
scanDefs(text, path.basename(file) + '（扩展自身）');
function skillAudioField(name) {
  const src = skillSrc.get(name);
  if (src == null) return null;
  const re = new RegExp(`^[\\t ]*${name}\\s*:\\s*\\{`, 'm');
  const i = src.search(re);
  if (i < 0) return null;
  let k = src.indexOf('{', i), d = 0, end = -1;
  for (let j = k; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) { end = j; break; } }
  }
  const body = src.slice(i, end + 1);
  const a = body.match(/(?:^|[{,\n])[ \t]*audio\s*:\s*([^,\n]+)/m);
  return a ? a[1].trim() : '(未写 audio)';
}

function audioFilesFor(name) {
  const dir = path.join(APP, 'audio', 'skill');
  const out = [];
  for (let n = 1; n <= 4; n++) {
    if (fs.existsSync(path.join(dir, `${name}${n}.mp3`))) out.push(`${name}${n}.mp3`);
  }
  if (fs.existsSync(path.join(dir, `${name}.mp3`))) out.push(`${name}.mp3`);
  return out;
}

let fail = 0;
console.log(`\n=== 台词接线验证：${label} ===`);

// ── 1) audio: '<字符串>' ────────────────────────────────────────────────
// 只认真正的字段形式 `audio: '...'`。
// 不能用宽松的 /audio\s*:\s*'([^']+)'/：扩展里有一句诊断代码
//   var raw = info ? info.audio : '(无技能信息)';
// 会被误当成 audio 字段（已踩过）。
const strAudios = [...text.matchAll(/(?:^|[{,\n])[ \t]*audio\s*:\s*'([^']+)'/gm)].map((m) => m[1]);
const uniq = [...new Set(strAudios)];
if (uniq.length === 0) {
  console.log('  （未发现字符串形式的 audio 字段）');
}
for (const name of uniq) {
  if (name.startsWith('ext:')) { console.log(`  · ext: 音频引用 ${name} —— 需人工核对扩展目录`); continue; }
  const defFile = skillDefs.get(name);
  const exists = !!defFile;
  let detail = '';
  let ok = exists;
  if (exists) {
    const af = skillAudioField(name);
    const files = audioFilesFor(name);
    detail = `技能存在于 ${defFile}，其 audio=${af}，音频文件 ${files.length ? files.join('/') : '缺失!'}`;
    if (!files.length) ok = false;
  } else {
    detail = '游戏里没有这个技能 ⇒ 引擎走到 `return` ⇒ 完全无声';
  }
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} audio:'${name}'  — ${detail}`);
}

// ── 2) 角色 [4] 里的 die: 标签 ──────────────────────────────────────────
const dieTags = [...text.matchAll(/'(die:[^']+)'/g)].map((m) => m[1]);
for (const tag of dieTags) {
  let p = tag.slice(4);                    // 'die:xxx' -> 'xxx'
  p = p.replace(/^ext:(.+)?\//, '../extension/$1/');
  let full;
  if (p.startsWith('../')) full = path.resolve(APP, 'audio', p);
  else full = path.join(APP, 'audio', p + '.mp3');
  const ok = fs.existsSync(full) || fs.existsSync(full.replace(/\.mp3$/, '.ogg'));
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} [4] 标签 '${tag}'  — ${ok ? '音频存在' : '找不到 ' + full}`);
}
if (dieTags.length === 0) console.log('  · 未发现 die: 标签（阵亡将走引擎默认：die/<角色id>.mp3 → 回落 die/<id下划线后段>.mp3）');

console.log(`  ${fail === 0 ? '全部通过' : fail + ' 项失败'}`);
process.exit(fail === 0 ? 0 : 1);
