// ============================================================
// 极·马超 重制 + 三个实测 bug 修复（一次性历史生成器，保留作可复现档案）
//
// 用法: node tools/apply-machao-redesign.mjs <输入 extension.js> <输出 extension.js>
//
// 输入：那份「小重置版」—— 它与本仓库历史里的 `40457f9` **逐字节相同**，
//       因此随时可以从仓库自己重建输入，不依赖任何外部文件：
//         git show 40457f9:extension/extension.js > /tmp/brain-extension.js
//       再跑本脚本即可**复现**这次重制（输出应与当前 extension.js 一致）。
// 输出：tiandiguiyi/extension/extension.js
//
// ⚠️ 这是**一次性**生成器，不是能反复运行的构建步骤：它做的是「按字面量精确替换
//    + 断言命中次数」，只对 `40457f9` 那一版输入有意义。在已重制过的文件上再跑，
//    会因命中数不符而**主动中止**（不会写坏文件）。
//
// 设计口径（用户裁定「以新卡面/方案文档为准」）：
//   神威① 永久多摸一张牌（mx_cd，至多3）
//   神威② 本回合使用【杀】的次数+1（mx_cm，回合结束清零）
//   神威③ 获得一个「驭」
//   距离加成彻底移除
//   驭雷补上「任意角色回合结束时，若本回合有角色造成过雷属性伤害，你获得一个驭」
//
// 三个实测 bug（旧版就有，不是本次改动引入）：
//   B1 filter 的 useCard 分支末尾 `return false;` 吞掉了「使用【杀】」⇒ 雷击从不触发
//   B2 content 里两个 'step 1'（一嵌 if、一顶层）⇒ 引擎把 case 1 编到【杀】分支
//      ⇒ 答完获马对话框掉进【杀】分支直接 finish ⇒ 三个选项永不生效
//   B3 装备坐骑同时派发 equip 与 useCard ⇒ 两次对话框（回弹两次）
//
// 每条替换都断言命中次数正好等于预期；命中数不符就中止，不写文件。
// 完整背景见 docs/引擎开发手册.md 第 6 部分（实例档案：极·马超完整重制）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const DST = process.argv[3];
if (!SRC || !DST) {
  console.error('用法: node apply_machao_redesign.mjs <源文件> <目标文件>');
  process.exit(2);
}

const raw = fs.readFileSync(SRC, 'utf8');
const srcEol = raw.includes('\r\n') ? 'CRLF' : 'LF';
let text = raw.replace(/\r\n/g, '\n');
const eol = '\n';

const log = [];
let failed = 0;

function R(name, re, replacement, expected = 1) {
  const hits = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  const count = hits ? hits.length : 0;
  if (count !== expected) {
    console.error(`✗ [${name}] 命中 ${count} 次，预期 ${expected} 次 —— 中止`);
    failed++;
    return;
  }
  text = text.replace(re, replacement);
  log.push(`✓ [${name}] 命中 ${count} 次`);
}

// 把某技能的 content 整块换掉（按缩进配平定位），用于大结构改写
function replaceContentBlock(skill, newSrc) {
  const s = text.search(new RegExp(`^\\t{6}${skill}: \\{`, 'm'));
  if (s < 0) throw new Error(`找不到技能 ${skill}`);
  const c = text.indexOf('content: function', s);
  if (c < 0) throw new Error(`${skill} 找不到 content`);
  let i = text.indexOf('{', c), d = 0, end = -1;
  for (let k = i; k < text.length; k++) {
    if (text[k] === '{') d++;
    else if (text[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  if (end < 0) throw new Error(`${skill} content 配平失败`);
  const old = text.slice(s, end + 1);
  const oldContent = old.slice(old.indexOf('content: function'));
  const headLen = old.indexOf('content: function');
  const newStart = s + headLen;
  text = text.slice(0, s) + old.slice(0, headLen) + newSrc + text.slice(end + 1);
  log.push(`✓ [${skill} content 整块替换] ${oldContent.split('\n').length} 行 -> ${newSrc.split('\n').length} 行`);
  // 返回新块在 text 里的确切区间：自检必须用它，不能再用括号配平去反推
  //（配平会被字符串/注释里的括号带偏，之前就踩过一次）。
  return { start: newStart, end: newStart + newSrc.length };
}
let mxShenweiContentSpan = null;

// ── E1 武将数组：加入 mx_sha_limit ──────────────────────────────────────
R('E1 注册 mx_sha_limit', /^(\t+)'mx_shenwei_horse',$/m,
  (m, ind) => `${ind}'mx_sha_limit',${eol}${ind}'mx_shenwei_horse',`);

// ── E2 修正过时注释 ────────────────────────────────────────────────────
R('E2 注释与实现对齐',
  /\/\/ 不接神威技类别次数机制；无每回合复位项 ⇒ 不列 tdgx_turn_reset。/,
  '// 不接神威技类别次数机制；但 ②「本回合使用【杀】的次数+1」需要每回合清零' + eol +
  '\t\t\t\t\t\t// mx_cm，故列入 tdgx_turn_reset。');

// ── E3 神威卡面文案 ────────────────────────────────────────────────────
R('E3 mx_shenwei_info 改为新口径',
  /('mx_shenwei_info': )'[^']*',/,
  (_m, p1) => p1 + [
    `'锁定技。当你使用或打出【杀】时，你可以对一名角色造成1点&#38647;属性伤害，并摸X张牌`,
    `（X为你攻击范围内的人数与你已累积的神威摸牌加成之和）。当你获得进攻马或防御马时，你选择一项执行：`,
    `（一）神威永久多摸一张牌（至多累积3次）；（二）本回合你使用【杀】的次数+1（回合结束清零）；`,
    `（三）获得一个&#39533;标记。你可以将任意一张坐骑牌转化为任意牌使用或打出（无次数和距离限制）。',`,
  ].join(''));

// ── E8a/E8b mx_shenwei_mod 去掉距离 mod，改纯展示壳 ────────────────────
R('E8a 距离注释',
  /\/\/ 距离加成落地：attackRange（自己攻击范围）\/ globalFrom（他人到自己的距离）/,
  '// 神威·驰：纯展示壳（摸牌加成 mx_cd / 本回合出杀次数加成 mx_cm 都由结算路径直接读，无需 mod）');
R('E8b mx_shenwei_mod 去距离 mod',
  /marktext: '骑',[\s\S]*?mod: \{[\s\S]*?attackTo: function \(from, to, dist\) \{\s*return dist \+ \(to\.storage\.mx_cm \|\| 0\);\s*\},\s*\},\s*\},/,
  [
    `marktext: '驰',`,
    `\t\t\t\t\t\t\tintro: {`,
    `\t\t\t\t\t\t\t\tname: '神威·驰',`,
    `\t\t\t\t\t\t\t\tcontent: function (storage, player) {`,
    `\t\t\t\t\t\t\t\t\treturn '神威永久摸牌加成：+' + (player.storage.mx_cd || 0) + '；本回合出杀次数加成：+' + (player.storage.mx_cm || 0);`,
    `\t\t\t\t\t\t\t\t},`,
    `\t\t\t\t\t\t\t},`,
    `\t\t\t\t\t\t},`,
  ].join(eol));

// ── E9 新技能 mx_sha_limit ─────────────────────────────────────────────
R('E9 新增 mx_sha_limit',
  /(\n)(\t{6})(\/\/ 马转任意牌：照武库·启备的官方灭吴范式)/,
  (_m, nl, ind, cmt) => [
    `${nl}${ind}// 神威·骁：②「本回合使用【杀】的次数+1」的落地实现。`,
    `${nl}${ind}//   · mod 必须纯查询（引擎高频调用，不得有副作用）——见 atlas/02-范式库.md`,
    `${nl}${ind}//   · num 可能是 undefined（无 usable 字段的牌）⇒ 先归零再加，否则 NaN 会让牌反而不可用`,
    `${nl}${ind}//   · 无加成时直接 return（= 不改动引擎原值），避免影响无限次等特例——同 dy_pozhu_turn`,
    `${nl}${ind}//   · 清零点：mx_cm 由 tdgx_turn_reset 在每个回合开始时归零`,
    `${nl}${ind}mx_sha_limit: {`,
    `${nl}${ind}\tcharlotte: true,`,
    `${nl}${ind}\tsub: true,`,
    `${nl}${ind}\tmod: {`,
    `${nl}${ind}\t\tcardUsable: function (card, player, num) {`,
    `${nl}${ind}\t\t\tif (get.name(card) != 'sha') return;`,
    `${nl}${ind}\t\t\tvar y = (player.storage && player.storage.mx_cm) || 0;`,
    `${nl}${ind}\t\t\tif (y <= 0) return;`,
    `${nl}${ind}\t\t\tif (num === false) return false;`,
    `${nl}${ind}\t\t\tif (typeof num != 'number') num = 0;`,
    `${nl}${ind}\t\t\treturn num + y;`,
    `${nl}${ind}\t\t},`,
    `${nl}${ind}\t},`,
    `${nl}${ind}},`,
    `${nl}${ind}${cmt}`,
  ].join(''));

// ── E10 驭雷：补 damageEnd / phaseEnd 接线 ─────────────────────────────
R('E10a 驭雷触发键补 damageEnd/phaseEnd',
  /trigger: \{ player: 'damageBegin2', source: 'damageSource', global: 'phaseBefore' \},/,
  `trigger: { player: 'damageBegin2', source: 'damageSource', global: ['damageEnd', 'phaseBefore', 'phaseEnd'] },`);
R('E10b 驭雷 filter：phaseEnd 改用回合标记',
  /if \(tn == 'phaseEnd'\) return player\.isIn\(\) && player\.storage\.mx_thunder_phase == event;/,
  `if (tn == 'phaseEnd') return player.isIn() && !!player.storage.mx_thunder_flag;`);
R('E10c 驭雷 content：damageEnd 打标记',
  /player\.storage\.mx_thunder_phase = event\.getParent\('phase'\);\s*event\.finish\(\); return;/,
  `player.storage.mx_thunder_flag = true;${eol}\t\t\t\t\t\t\t\t\tevent.finish(); return;`);
R('E10d 驭雷 content：phaseEnd 结算充能',
  /if \(player\.storage\.mx_thunder_phase == trigger\) \{\s*delete player\.storage\.mx_thunder_phase;[\s\S]*?game\.log\(player, '【驭雷】：本回合有雷属性伤害造成，获得了', get\.cnNumber\(player\.countMark\('mx_yu'\)\), '个「驭」'\);\s*\}/,
  [
    `if (player.storage.mx_thunder_flag) {`,
    `\t\t\t\t\t\t\t\t\tdelete player.storage.mx_thunder_flag;`,
    `\t\t\t\t\t\t\t\t\tif (!player.hasSkill('mx_yu')) player.addSkill('mx_yu');`,
    `\t\t\t\t\t\t\t\t\tplayer.addMark('mx_yu', 1);`,
    `\t\t\t\t\t\t\t\t\tgame.log(player, '【驭雷】：本回合有角色造成过雷属性伤害，获得了', get.cnNumber(player.countMark('mx_yu')), '个「驭」');`,
    `\t\t\t\t\t\t\t\t\tgame.trySkillAudio('mx_yulei', player, true);`,
    `\t\t\t\t\t\t\t\t}`,
  ].join(eol));

// ── E11 tdgx_turn_reset 缩进归位 ───────────────────────────────────────
R('E11 tdgx_turn_reset 缩进归位',
  /^(\t{9})(\t+)if \(p\.storage\.mx_cm\) p\.storage\.mx_cm = 0;$/m,
  (_m, proper) => `${proper}if (p.storage.mx_cm) p.storage.mx_cm = 0;`);

// ── E12 translate 补 mx_sha_limit ──────────────────────────────────────
R('E12 mx_sha_limit 译名', /('mx_yulei': '驭雷',)/,
  (_m, p1) => `'mx_sha_limit': '神威·骁',${eol}\t\t\t\t\t\t${p1}`);

// ── E13 技能块头注释 ───────────────────────────────────────────────────
R('E13 技能块头注释更新口径',
  /\/\/   距离加成经 mx_shenwei_mod（attackRange\/globalFrom，storage 驱动，\s*\/\/   各至多 \+3）；转化无次数距离由 backup 内联 mod 承担。/,
  [
    `//   三选一走 chooseControl（内部键 + choiceList）：①mx_cd 永久多摸一张牌（至多3）`,
    `//   ②mx_cm 本回合出杀次数+1（tdgx_turn_reset 每回合清零，mod 由 mx_sha_limit 承担）`,
    `//   ③获得一个「驭」；旧的距离加成已按用户口径（2026-10-06）彻底移除。`,
    `//   转化无次数距离由 backup 内联 mod 承担。`,
  ].join(eol));

// ── E16 【B1】filter：删掉 useCard 分支末尾吞掉【杀】的 return false ────
R('E16 [B1] filter 不再吞掉使用【杀】',
  /(if \(c2 && \(get\.subtype\(c2\) == 'equip3' \|\| get\.subtype\(c2\) == 'equip4'\)\) return true;\s*\})\s*return false;\s*(\}\s*\/\/ 使用或打出【杀】)/,
  (_m, loop, tail) => [
    loop,
    `\t\t\t\t\t\t\t\t\t// ★ [B1 修复] 这里**不能** return false：使用【杀】走的也是 useCard，`,
    `\t\t\t\t\t\t\t\t\t//   一旦在此早退，下面的【杀】判定永远够不到（旧版实测：用杀不触发神威）。`,
    `\t\t\t\t\t\t\t\t\t//   非马牌非杀的情形由下面的判定自然排除。`,
    tail,
  ].join(eol));

// ── E16b 【B3】equip 分支去重（同一个动作会派发 equip + useCard 两个事件）──
R('E16b [B3] 装备去重：使用装备走 useCardAfter',
  /(if \(event\.name == 'equip'\) \{\s*\/\/ 获得坐骑：cards 里的马牌\*\*当前归属者是自己\*\*才算)/,
  (_m, head) => [
    head,
    `\t\t\t\t\t\t\t\t\t// ★ [B3 修复] 装备牌是"使用"的 ⇒ 同一个动作同时派发 equip 与 useCard 两个事件，`,
    `\t\t\t\t\t\t\t\t\t//   若两条都处理就会弹两次对话框。本路径只负责"非使用获得"（顺手牵羊/移动装备等），`,
    `\t\t\t\t\t\t\t\t\t//   由 useCard 引起的那次交给 useCardAfter 分支。`,
    `\t\t\t\t\t\t\t\t\tif (event.getParent && event.getParent('useCard')) return false;`,
  ].join(eol));

// ── E17 【B2】mx_shenwei.content 整块重写（步骤号只留在顶层） ───────────
mxShenweiContentSpan = replaceContentBlock('mx_shenwei', [
  `\t\t\t\t\t\t\tcontent: function () {`,
  `\t\t\t\t\t\t\t\t'step 0'`,
  `\t\t\t\t\t\t\t\t// ★ 原始事件字段在 trigger 上（content 的 event 是技能事件，无 card）`,
  `\t\t\t\t\t\t\t\tvar _mxHorse = (event.triggername == 'useCardAfter' && trigger.card && (get.subtype(trigger.card) == 'equip3' || get.subtype(trigger.card) == 'equip4'));`,
  `\t\t\t\t\t\t\t\t// ★ [B2 修复] 分支必须在**顶层**判定并存进技能事件：`,
  `\t\t\t\t\t\t\t\t//   'step N' 只能出现在函数体顶层。旧版把 'step 1' 写在 if 里，引擎的`,
  `\t\t\t\t\t\t\t\t//   parsex 用 try{new Function} 逐个试位，嵌套那个（case 出现在 switch 的`,
  `\t\t\t\t\t\t\t\t//   内嵌块）通不过校验被跳过 ⇒ case 1 落到了【杀】分支，于是答完获马`,
  `\t\t\t\t\t\t\t\t//   对话框后执行的是【杀】分支的代码、读到 chooseControl 的结果就 finish`,
  `\t\t\t\t\t\t\t\t//   ⇒ 三个选项永不生效（旧版实测）。`,
  `\t\t\t\t\t\t\t\tevent.mxHorse = !!(event.triggername == 'equipAfter' || _mxHorse);`,
  `\t\t\t\t\t\t\t\tif (event.mxHorse) {`,
  `\t\t\t\t\t\t\t\t\t// —— 运行时诊断：获马瞬间落盘当前加成值（必须走 game./lib. 前缀，包级闭包里没有裸 bzDiag2）——`,
  `\t\t\t\t\t\t\t\t\ttry {`,
  `\t\t\t\t\t\t\t\t\t\t(game.bzDiag2 || lib.bzDiag2)('【神威获马】mx_cd(永久摸牌加成)=' + (player.storage.mx_cd || 0) + ' | mx_cm(本回合出杀次数)=' + (player.storage.mx_cm || 0) + ' | 有mx_sha_limit=' + player.hasSkill('mx_sha_limit'));`,
  `\t\t\t\t\t\t\t\t\t} catch (eDg) {`,
  `\t\t\t\t\t\t\t\t\t\ttry { (game.bzDiag2 || lib.bzDiag2)('神威获马诊断异常: ' + eDg.message); } catch (e2) { }`,
  `\t\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\t\t// ★ chooseControl 防弹版（clan.js:2018 官方模式）：controls 传内部键`,
  `\t\t\t\t\t\t\t\t\t//（atk/def/yu/cancel2），显示文本走 choiceList —— result.control`,
  `\t\t\t\t\t\t\t\t\t// 恒为内部键，十周年UI 重写样式不影响判定。`,
  `\t\t\t\t\t\t\t\t\tvar keys = [], labels = [];`,
  `\t\t\t\t\t\t\t\t\tif ((player.storage.mx_cd || 0) < 3) { keys.push('atk'); labels.push('神威永久多摸一张牌'); }`,
  `\t\t\t\t\t\t\t\t\tif ((player.storage.mx_cm || 0) < 3) { keys.push('def'); labels.push('本回合使用【杀】的次数+1'); }`,
  `\t\t\t\t\t\t\t\t\tkeys.push('yu');`,
  `\t\t\t\t\t\t\t\t\tlabels.push('获得一个「驭」');`,
  `\t\t\t\t\t\t\t\t\tkeys.push('cancel2');`,
  `\t\t\t\t\t\t\t\t\tlabels.push('放弃（本次不生效）');`,
  `\t\t\t\t\t\t\t\t\tplayer.chooseControl(keys)`,
  `\t\t\t\t\t\t\t\t\t\t.set('choiceList', labels)`,
  `\t\t\t\t\t\t\t\t\t\t.set('prompt', '神威：你获得了坐骑，选择一项执行')`,
  `\t\t\t\t\t\t\t\t\t\t.set('ai', function () { return 'atk'; });`,
  `\t\t\t\t\t\t\t\t} else {`,
  `\t\t\t\t\t\t\t\t\t// 使用或打出【杀】：对一名角色造成 1 点雷伤 + 摸（攻击范围内人数 + 神威加成）`,
  `\t\t\t\t\t\t\t\t\tplayer.chooseTarget('神威：对一名角色造成1点雷属性伤害', function (card, player, target) {`,
  `\t\t\t\t\t\t\t\t\t\treturn target.isIn();`,
  `\t\t\t\t\t\t\t\t\t}).set('ai', function (target) {`,
  `\t\t\t\t\t\t\t\t\t\treturn -get.attitude(_status.event.player, target);`,
  `\t\t\t\t\t\t\t\t\t});`,
  `\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\t'step 1'`,
  `\t\t\t\t\t\t\t\tif (event.mxHorse) {`,
  `\t\t\t\t\t\t\t\t\tvar pick = result.control;`,
  `\t\t\t\t\t\t\t\t\tif (pick == 'atk') {`,
  `\t\t\t\t\t\t\t\t\t\tplayer.storage.mx_cd = (player.storage.mx_cd || 0) + 1;`,
  `\t\t\t\t\t\t\t\t\t\tplayer.markSkill('mx_shenwei_mod');`,
  `\t\t\t\t\t\t\t\t\t\tgame.log(player, '【神威】：你的杀多摸1张牌（永久，当前+' + player.storage.mx_cd + '）');`,
  `\t\t\t\t\t\t\t\t\t} else if (pick == 'def') {`,
  `\t\t\t\t\t\t\t\t\t\tplayer.storage.mx_cm = (player.storage.mx_cm || 0) + 1;`,
  `\t\t\t\t\t\t\t\t\t\tplayer.markSkill('mx_shenwei_mod');`,
  `\t\t\t\t\t\t\t\t\t\tgame.log(player, '【神威】：本回合使用【杀】的次数+1');`,
  `\t\t\t\t\t\t\t\t\t} else if (pick == 'yu') {`,
  `\t\t\t\t\t\t\t\t\t\tif (!player.hasSkill('mx_yu')) player.addSkill('mx_yu');`,
  `\t\t\t\t\t\t\t\t\t\tplayer.addMark('mx_yu', 1);`,
  `\t\t\t\t\t\t\t\t\t\tgame.log(player, '【神威】：获得了一个「驭」（当前' + get.cnNumber(player.countMark('mx_yu')) + '个）');`,
  `\t\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\t\t// ★ 语音：mx_shenwei 是 direct 技能，引擎的自动播放在`,
  `\t\t\t\t\t\t\t\t\t//   game.js:37360 的 if(info.direct&&!directaudio) return; 处被跳过，`,
  `\t\t\t\t\t\t\t\t\t//   所以要"发动了就出声"必须自己调，第三参 true 即 directaudio。`,
  `\t\t\t\t\t\t\t\t\t//   （官方同类用法：character/yijiang.js:13214 game.trySkillAudio('xiansi2',event.target,true)）`,
  `\t\t\t\t\t\t\t\t\tif (pick != 'cancel2') game.trySkillAudio('mx_shenwei', player, true);`,
  `\t\t\t\t\t\t\t\t\tevent.finish(); return;`,
  `\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\tif (!result.bool || !result.targets || !result.targets.length) {`,
  `\t\t\t\t\t\t\t\t\t// 未选目标（可取消）——跳过雷伤；卡面"你可以对一名角色…"整体可选。`,
  `\t\t\t\t\t\t\t\t\tevent.finish(); return;`,
  `\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\tevent.mxT = result.targets[0];`,
  `\t\t\t\t\t\t\t\tevent.mxT.damage(1, player, 'thunder');`,
  `\t\t\t\t\t\t\t\tvar n = 0;`,
  `\t\t\t\t\t\t\t\tfor (var i = 0; i < game.players.length; i++) {`,
  `\t\t\t\t\t\t\t\t\tvar c = game.players[i];`,
  `\t\t\t\t\t\t\t\t\tif (c != player && c.isIn() && player.inRange(c)) n++;`,
  `\t\t\t\t\t\t\t\t}`,
  `\t\t\t\t\t\t\t\tvar mxBonus = player.storage.mx_cd || 0;`,
  `\t\t\t\t\t\t\t\tvar mxDrawN = n + mxBonus;`,
  `\t\t\t\t\t\t\t\tif (mxDrawN > 0) player.draw(mxDrawN);`,
  `\t\t\t\t\t\t\t\tgame.log(player, '【神威】：对', event.mxT, '造成1点雷属性伤害，并摸了', get.cnNumber(mxDrawN), '张牌（范围内' + n + '人＋神威加成' + mxBonus + '）');`,
  `\t\t\t\t\t\t\t\t// ★ 语音：发动了就出声（用杀触发神威造成雷伤同样算"发动"）`,
  `\t\t\t\t\t\t\t\tgame.trySkillAudio('mx_shenwei', player, true);`,
  // 末行只到 content 的收尾 `}` 为止：紧跟其后的 `,` 属于原文件，由 text.slice(end+1) 带回来。
  // （这里多写一个逗号就会变成 `},,` —— 已踩过一次。）
  `\t\t\t\t\t\t\t}`,
].join(eol));

// ── E15 开机自检：改测新机制（旧断言测的是已删除的距离 mod） ───────────
R('E15 开机自检马超单测改为测新机制',
  /\/\/ —— 极·马超 mod 单测（mock 数据直接调函数，验证四键逻辑）——[\s\S]*?【马超单测】异常: ' \+ eMx\.message \+ '\\n'\);\s*\n\s*\}/,
  [
    `// —— 极·马超 mod 单测（mock 直接调函数：验证「本回合出杀次数+1」的落地，旧距离断言已废弃）——`,
    `\t\t\t\ttry {`,
    `\t\t\t\t\tvar _mx = pkg.skill && pkg.skill.mx_sha_limit;`,
    `\t\t\t\t\tvar _mxm = pkg.skill && pkg.skill.mx_shenwei_mod;`,
    `\t\t\t\t\tvar _d = [];`,
    `\t\t\t\t\t_d.push('mx_sha_limit=' + !!_mx);`,
    `\t\t\t\t\t_d.push('hasCardUsable=' + !!(_mx && _mx.mod && _mx.mod.cardUsable));`,
    `\t\t\t\t\t_d.push('mx_shenwei_mod残留mod=' + !!(_mxm && _mxm.mod) + '(期望false)');`,
    `\t\t\t\t\tif (_mx && _mx.mod && _mx.mod.cardUsable) {`,
    `\t\t\t\t\t\tvar _p0 = { storage: {} };`,
    `\t\t\t\t\t\tvar _p1 = { storage: { mx_cm: 2 } };`,
    `\t\t\t\t\t\t_d.push('无加成(1)->' + _mx.mod.cardUsable({ name: 'sha' }, _p0, 1) + '(期望undefined=不改引擎原值)');`,
    `\t\t\t\t\t\t_d.push('加成2(1)->' + _mx.mod.cardUsable({ name: 'sha' }, _p1, 1) + '(期望3)');`,
    `\t\t\t\t\t\t_d.push('加成2(undefined)->' + _mx.mod.cardUsable({ name: 'sha' }, _p1, undefined) + '(期望2)');`,
    `\t\t\t\t\t\t_d.push('非杀->' + _mx.mod.cardUsable({ name: 'shan' }, _p1, 1) + '(期望undefined)');`,
    `\t\t\t\t\t}`,
    `\t\t\t\t\trequire('fs').appendFileSync('C:/bz-diag.log', new Date().toLocaleTimeString() + '  【马超单测】' + _d.join(' | ') + '\\n');`,
    `\t\t\t\t} catch (eMx) {`,
    `\t\t\t\t\trequire('fs').appendFileSync('C:/bz-diag.log', new Date().toLocaleTimeString() + '  【马超单测】异常: ' + eMx.message + '\\n');`,
    `\t\t\t\t}`,
  ].join(eol));

// ── E18 台词：全部借用官方「神马超」(shen_machao) 的语音 ───────────────
// 引擎解析链（game.js:37380-37414）：
//   audio 是字符串且 lib.skill[该字符串] 存在 ⇒ 跳到那个技能，取其 audio 字段
//   最终 audio 为数字 N ⇒ 播 audio/skill/<技能名><1..N>.mp3（随机）
//   audio 为非 'ext:' 开头的字符串 ⇒ 直接 return（无声）
// 旧代码写 audio:'shen_machao' —— 那是角色 id 不是技能名 ⇒ 落进 return，完全无声。
// 神马超的技能是 shouli(授勠, audio:2) / hengwu(横骛, audio:2)；
// 游戏自己就靠“指向技能名”借用（psshouli:{audio:'shouli'}、pshengwu:{audio:'hengwu'}）。
R('E18a 阵亡台词借用神马超',
  /\], \['ext:天地归一\/tdgx_machao\.jpg'\]\],/,
  `], ['ext:天地归一/tdgx_machao.jpg', 'die:die/shen_machao']],`);
R('E18b mx_shenwei 台词=授勠(2条)',
  /\n(\t{6})mx_shenwei: \{\n/,
  (_m, ind) => `\n${ind}mx_shenwei: {\n${ind}\taudio: 'shouli',\n`);
R('E18c mx_yulei 台词=横骛(2条)',
  /\n(\t{6})mx_yulei: \{\n/,
  (_m, ind) => `\n${ind}mx_yulei: {\n${ind}\taudio: 'hengwu',\n`);
R('E18d 驭马/转化 由无声改为借用授勠',
  /audio: 'shen_machao',/g,
  `audio: 'shouli',`, 2);

// ── E19 驭雷：同样改成「发动了就出声」 ──────────────────────────────────
// mx_yulei 也是 direct:true ⇒ 引擎自动播放在 game.js:37360 被跳过，需自己调。
const MX_AUDIO_NOTE = `${eol}\t\t\t\t\t\t\t\t\t// ★ direct 技能需自行播语音（第三参 true = directaudio）`;
R('E19a 驭雷·免雷 出声',
  /(game\.log\(player, '【驭雷】：免疫了雷属性伤害'\);)/,
  (m, g) => `${g}${MX_AUDIO_NOTE}${eol}\t\t\t\t\t\t\t\t\tgame.trySkillAudio('mx_yulei', player, true);`);
R('E19b 驭雷·造成雷伤 出声',
  /(game\.log\(player, '【驭雷】：获得了', get\.cnNumber\(player\.countMark\('mx_yu'\)\), '个驭标记'\);)/,
  (m, g) => `${g}${MX_AUDIO_NOTE}${eol}\t\t\t\t\t\t\t\t\tgame.trySkillAudio('mx_yulei', player, true);`);
R('E19c 驭雷·新回合 出声',
  /(game\.log\(player, '【驭雷】：消耗了五个驭标记，立即获得了一个额外的回合'\);)/,
  (m, g) => `${g}${MX_AUDIO_NOTE}${eol}\t\t\t\t\t\t\t\t\tgame.trySkillAudio('mx_yulei', player, true);`);

if (failed > 0) {
  console.error(`\n✗ 有 ${failed} 条替换未按预期命中，未写出文件。`);
  process.exit(1);
}

console.log(log.join('\n'));   // 先打印编辑日志，便于定位后续自检失败

// ── 写出前自检 ─────────────────────────────────────────────────────────
if (/\bdrawN\b/.test(text.replace(/mxDrawN/g, ''))) {
  console.error('✗ 自检失败：仍残留未定义的 drawN');
  process.exit(4);
}
const distLeft = text.match(/globalFrom|attackFrom|globalTo|attackTo/g);
if (distLeft) {
  console.error(`✗ 自检失败：仍残留距离 mod 键 ${distLeft.length} 处`);
  process.exit(7);
}
// [B1/B2/B3] 三处修复必须真实落地
{
  if (!mxShenweiContentSpan) {
    console.error('✗ 自检失败：mx_shenwei content 未替换');
    process.exit(8);
  }
  const body = text.slice(mxShenweiContentSpan.start, mxShenweiContentSpan.end);
  // 只数「整行就是 'step N'」的行 —— 注释里提到的 'step N' 不算（这里被自己的检查器坑过一次）
  const markerLines = body.split('\n').filter((l) => /^\t*'step \d+'$/.test(l.replace(/\s+$/, '')));
  const bad = markerLines.filter((l) => !/^\t{8}'step \d+'$/.test(l.replace(/\s+$/, '')));
  const all = markerLines.map((l) => l.trim());
  if (bad.length) {
    console.error(`✗ 自检失败：mx_shenwei.content 仍有非顶层 step 标记 ${bad.length} 处：${bad.map((l) => l.trim()).join(' ')}`);
    process.exit(9);
  }
  if (all.length !== 2 || all[0] !== "'step 0'" || all[1] !== "'step 1'") {
    console.error(`✗ 自检失败：step 标记应为 'step 0','step 1'，实际 ${all.join(',')}（共 ${all.length} 个）`);
    process.exit(10);
  }
  // B1：filter 里不得再有吞掉【杀】的早退
  const fs0 = text.search(/^\t{6}mx_shenwei: \{/m);
  const fc = text.indexOf('filter: function', fs0);
  let fi = text.indexOf('{', fc), fd = 0, fend = -1;
  for (let k = fi; k < text.length; k++) {
    if (text[k] === '{') fd++;
    else if (text[k] === '}') { fd--; if (fd === 0) { fend = k; break; } }
  }
  const filterBody = text.slice(fc, fend + 1);
  if (/return true;\s*\}\s*return false;\s*\}\s*\/\/ 使用或打出【杀】/.test(filterBody)) {
    console.error('✗ 自检失败：[B1] filter 仍在 useCard 分支末尾早退，【杀】会被吞掉');
    process.exit(11);
  }
  if (!/event\.getParent\('useCard'\)\) return false;/.test(filterBody)) {
    console.error("✗ 自检失败：[B3] filter 缺少 equip 去重（event.getParent('useCard')）");
    process.exit(12);
  }
  // B2：分支判定必须在顶层（event.mxHorse 存到技能事件上）
  if (!/\n\t{8}\} else \{\n/.test(body) || !/event\.mxHorse = /.test(body)) {
    console.error('✗ 自检失败：[B2] content 未改成「顶层记分支 + 步骤内分派」');
    process.exit(13);
  }
}

const out = text.replace(/\n/g, '\r\n');
fs.mkdirSync(path.dirname(DST), { recursive: true });
fs.writeFileSync(DST, out, 'utf8');

console.log(log.join('\n'));
console.log(`\n✓ 源行尾 ${srcEol} -> 输出 CRLF`);
console.log(`✓ 已写出 ${DST}  (${Buffer.byteLength(out, 'utf8')} bytes)`);
