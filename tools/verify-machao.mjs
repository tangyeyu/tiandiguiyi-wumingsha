// ============================================================
// 极·马超 重制自检器（词法检查，不执行目标代码）
//
// 自校准要求（本仓库 AGENTS.md §三）：正例 + 反例
//   正例：out-extension.js（重制后）       -> 应全 PASS
//   反例：brain/extension.js（半成品草稿）  -> drawN / 三选一 / 驭雷触发键 应 FAIL
//   反例：仓库 HEAD 版（旧距离口径）        -> 卡面文案 / 三选一 应 FAIL
//
// 用法: node verify_machao.mjs <文件> [--label 名称]
// 退出码: 0=全部通过, 1=有失败项
// ============================================================

import fs from 'node:fs';

const file = process.argv[2];
const li = process.argv.indexOf('--label');
const label = li >= 0 ? process.argv[li + 1] : file;
if (!file) {
  console.error('用法: node verify_machao.mjs <文件> [--label 名称]');
  process.exit(2);
}

const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const results = [];
function check(name, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r === true || (r && r.ok === true);
    detail = (r && r.detail) || '';
  } catch (e) {
    ok = false;
    detail = 'EXC ' + e.message;
  }
  results.push({ name, ok, detail });
}

// 取出 tdgx_machao 的武将技能数组
function machaoSkills() {
  const m = text.match(/tdgx_machao: \['male', 'qun', 4, \[([\s\S]*?)\], \[/);
  if (!m) throw new Error('找不到 tdgx_machao 注册');
  return m[1].match(/'([a-z0-9_]+)'/g).map((s) => s.replace(/'/g, ''));
}
// 词法判定某技能是否有定义（技能对象顶层键，缩进 6 tab）
function definedSkill(name) {
  return new RegExp(`^\\t{6}${name}: \\{`, 'm').test(text);
}
// 截取某技能的源码块（按缩进配平）
function skillBlock(name) {
  const start = text.search(new RegExp(`^\\t{6}${name}: \\{`, 'm'));
  if (start < 0) return '';
  let i = text.indexOf('{', start);
  let d = 0;
  for (let k = i; k < text.length; k++) {
    if (text[k] === '{') d++;
    else if (text[k] === '}') {
      d--;
      if (d === 0) return text.slice(start, k + 1);
    }
  }
  return '';
}

check('C1 无未定义的 drawN（只允许 mxDrawN）', () => {
  const bad = text.replace(/mxDrawN/g, '').match(/\bdrawN\b/g);
  return { ok: !bad, detail: bad ? `出现 ${bad.length} 次` : 'ok' };
});

check('C2 武将数组里的技能全部有定义', () => {
  const arr = machaoSkills();
  const missing = arr.filter((s) => !definedSkill(s));
  return { ok: missing.length === 0, detail: `数组=[${arr.join(',')}] 缺定义=${missing.length ? missing.join(',') : '无'}` };
});

check('C3 mx_sha_limit 已注册且有 mod.cardUsable', () => {
  const inArr = machaoSkills().includes('mx_sha_limit');
  const b = skillBlock('mx_sha_limit');
  const hasMod = /cardUsable: function/.test(b);
  const readsCm = /storage\.mx_cm/.test(b);
  const guardZero = /if \(y <= 0\) return;/.test(b);
  return {
    ok: inArr && hasMod && readsCm && guardZero,
    detail: `入数组=${inArr} mod=${hasMod} 读mx_cm=${readsCm} 零值早退=${guardZero}`,
  };
});

check('C4 mx_shenwei_mod 已移除距离 mod', () => {
  const b = skillBlock('mx_shenwei_mod');
  // 必须锚定行首缩进：技能名本身以 mod 结尾，/mod: \{/ 会匹配到 `mx_shenwei_mod: {` 的尾巴。
  const hasMod = /^\t{7}mod: \{/m.test(b);
  const dist = /globalFrom|attackFrom|globalTo|attackTo|距离/.test(b);
  return { ok: !hasMod && !dist, detail: `mod块=${hasMod} 距离残留=${dist}` };
});

check('C5 神威获马为三选一（atk/def/yu）', () => {
  const b = skillBlock('mx_shenwei');
  const has3 = /keys\.push\('atk'\)/.test(b) && /keys\.push\('def'\)/.test(b) && /keys\.push\('yu'\)/.test(b);
  const branch = /pick == 'yu'/.test(b);
  return { ok: has3 && branch, detail: `三键=${has3} yu分支=${branch}` };
});

check('C6 雷击摸牌用已定义变量且真正摸到加成', () => {
  const b = skillBlock('mx_shenwei');
  const decl = /var mxBonus = player\.storage\.mx_cd \|\| 0;/.test(b);
  const calc = /var mxDrawN = n \+ mxBonus;/.test(b);
  const draw = /if \(mxDrawN > 0\) player\.draw\(mxDrawN\);/.test(b);
  return { ok: decl && calc && draw, detail: `声明bonus=${decl} 计算=${calc} 摸牌=${draw}` };
});

check('C7 驭雷触发键含 damageEnd 与 phaseEnd', () => {
  const b = skillBlock('mx_yulei');
  const t = b.match(/trigger: \{[\s\S]*?\},/);
  const s = t ? t[0] : '';
  return {
    ok: /'damageEnd'/.test(s) && /'phaseEnd'/.test(s),
    detail: s.replace(/\s+/g, ' ').slice(0, 120),
  };
});

check('C8 驭雷回合末充能有实际接线', () => {
  const b = skillBlock('mx_yulei');
  const set = /player\.storage\.mx_thunder_flag = true;/.test(b);
  const read = /if \(player\.storage\.mx_thunder_flag\) \{/.test(b);
  const dead = /mx_thunder_phase/.test(b);
  return { ok: set && read && !dead, detail: `打标记=${set} 结算=${read} 旧死变量残留=${dead}` };
});

check('C9 神威卡面文案不再提"距离加成"语义', () => {
  const m = text.match(/'mx_shenwei_info': '([^']*)'/);
  const v = m ? m[1] : '';
  // 注意：'无次数和距离限制' 里的「距离」是正当措辞，只查旧的"距离加成"语义。
  const bad = /距离[-+]1|计算与你的距离|计算与其他角色的距离|的攻击范围/.test(v);
  return { ok: v.length > 0 && !bad, detail: bad ? '仍含旧距离语义' : (v ? 'ok（' + v.slice(0, 36) + '…）' : '找不到') };
});

check('C10 卡面文案已提三选一（多摸/出杀次数/驭）', () => {
  const m = text.match(/'mx_shenwei_info': '([^']*)'/);
  const v = m ? m[1] : '';
  const a = /永久多摸一张牌/.test(v);
  const b2 = /使用【杀】的次数\+1/.test(v);
  const c = /获得一个&#39533;标记/.test(v);
  return { ok: a && b2 && c, detail: `多摸=${a} 出杀次数=${b2} 驭=${c}` };
});

check('C11 mx_cm 由 tdgx_turn_reset 清零', () => {
  const b = skillBlock('tdgx_turn_reset');
  return { ok: /if \(p\.storage\.mx_cm\) p\.storage\.mx_cm = 0;/.test(b), detail: 'ok' };
});

// ★ 2026-10-06 补：重制时只改了卡面 `mx_shenwei_info` / `mx_yulei_info`，
//   characterIntro（选将界面/介绍面板显示的简介）漏改 —— 于是名单界面还在教
//   "距离±1，各至多加三"那套已被移除的玩法。C9/C10 只看 `_info`，所以没拦住。
//   这条把简介也纳入断言；反例：改动前的仓库版本必须 FAIL。
check('C12 characterIntro 与卡面同步（无旧距离语义 / 有三选一 / 有回合末充能 / 印记全体结算）', () => {
  const m = text.match(/tdgx_machao: '极·马超。([^']*)'/);
  const v = m ? m[1] : '';
  const bad = /距离[-+]1|计算与你的距离|计算与其他角色的距离/.test(v);
  const trio = /永久多摸一张牌/.test(v) && /使用【杀】的次数\+1/.test(v) && /获得一个驭标记/.test(v);
  const tail = /任意角色的回合结束时，若本回合有角色造成过雷属性伤害，你获得一个驭标记/.test(v);
  // 与代码一致：4880-4889 是「场上所有带雷印记的角色各失去 1 点体力」，
  // 不是卡面写的「受伤角色」—— 2026-09-13 用户校准。
  const all = /所有拥有雷印记的角色失去1点体力并移去其雷印记/.test(v);
  return {
    ok: v.length > 0 && !bad && trio && tail && all,
    detail: `长度=${v.length} 旧距离语义=${bad} 三选一=${trio} 回合末充能=${tail} 全体结算=${all}`,
  };
});

const pass = results.filter((r) => r.ok).length;
console.log(`\n=== 自检报告：${label} ===`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`  ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
