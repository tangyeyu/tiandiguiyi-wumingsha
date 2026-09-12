// 次数上限 mod 的 NaN 回归探针 —— 「自制武将只能用基本牌 / 陆逊只能用酒和杀 / 陆抗判定区失效后
// 用不了锦囊」是同一个根因：`cardUsable` mod 收到 undefined 的 num 时做了 `num + 99` ⇒ NaN。
//
// 引擎侧事实（当次核实 game.js / card 包）：
//   · lib.filter.cardUsable  —— game.js:33214-33238
//       var num=info.usable;                     // ← 牌定义里没有 usable 字段时就是 undefined
//       num=game.checkMod(card,player,num,'cardUsable',player);
//       if(typeof num!='number'){ return (typeof num=='boolean')?num:true; }   // ★ NaN 的 typeof 是 'number'，放行
//       if(player.countUsed(card)<num) return true;                            // ★ countUsed < NaN 恒为 false
//       ... cardUsableTarget 兜底 ...
//       return false;                                                          // ⇒ 该牌「不可使用」
//   · game.checkMod —— game.js:44285-44302：逐个 mod 调用并把返回值写回累加值（NaN 会被一路传出去）
//   · card 定义：全库只有【杀】card/standard.js:91 与【酒】card/extra.js:62 写了 usable:1；
//       锦囊（wuzhong standard.js:1017、shunshou standard.js:1206）与装备（qinggang standard.js:560）都没有该字段
//
// 两个方向都跑：
//   正例 = 仓库当前文件（mod 里有 `typeof num != 'number'` 归零守卫）→ 五张牌都必须可用
//   反例 = 把守卫删掉（回到 `num + 99`）→ 锦囊/装备必须变成不可用（= 用户报的症状）
//
// 用法：node atlas/tools/probe-cardusable-nan.mjs [extension.js 路径]
import fs from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const SRC = fs.readFileSync(FILE, 'utf8')

/* ── 卡牌样本（usable / 出处均当次核实）───────────────────────── */
const CARDS = [
  { name: 'sha', usable: 1, type: 'basic', src: 'card/standard.js:91  usable:1' },
  { name: 'jiu', usable: 1, type: 'basic', src: 'card/extra.js:62   usable:1' },
  { name: 'wuzhong', usable: undefined, type: 'trick', src: 'card/standard.js:1017 无 usable' },
  { name: 'shunshou', usable: undefined, type: 'trick', src: 'card/standard.js:1206 无 usable' },
  { name: 'qinggang', usable: undefined, type: 'equip', src: 'card/standard.js:560 无 usable' },
]

/* ── 把扩展装进 mock，拿 lib.skill（照 mock-load.mjs 的思路）── */
function mkArr (init = []) {
  const a = init.slice()
  for (const [k, f] of [['contains', function (x) { return this.indexOf(x) !== -1 }], ['add', function (x) { if (this.indexOf(x) === -1) this.push(x); return this }], ['addArray', function (x) { for (const i of x) this.add(i); return this }]]) {
    Object.defineProperty(a, k, { value: f, enumerable: false })
  }
  return a
}
function loadVariant (text) {
  const lib = {
    config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() },
    translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(), imported: { character: {}, card: {} },
  }
  const game = {
    log () {}, players: [], hasPlayer () { return false }, delay () {}, delayx () {},
    import (type, fn) {
      if (type === 'extension') { game._ext = fn(lib, game, {}, {}, {}, {}); return game._ext }
      const obj = fn(lib, game, {}, {}, {}, {})
      if (obj && obj.name) lib.imported.character[obj.name] = obj
      return obj
    },
  }
  new Function('game', 'lib', 'ui', 'get', 'ai', '_status', text)(game, lib, {}, {}, {}, {})
  game._ext.precontent.call(game._ext)
  return lib
}
const lib = loadVariant(SRC)

/* ── 把守卫删掉 = 把 bug 放回去（只删我加的两行守卫，其余一字不动）── */
const GUARD_LINES = [
  "\t\t\t\t\t\t\t\t\tif (num === false) return false;      // 别的技能已判定「不可使用」⇒ 不覆盖它\n",
  "\t\t\t\t\t\t\t\t\tif (typeof num != 'number') num = 0;  // 牌本身没有次数上限 ⇒ 当作 0 再加\n",
  "\t\t\t\t\t\t\t\t\tif (num === false) return false;\n",
  "\t\t\t\t\t\t\t\t\tif (typeof num != 'number') num = 0;\n",
  "\t\t\t\t\t\t\t\t\t\tif (num === false) return false;      // 别的技能已判定「不可使用」⇒ 不覆盖它\n",
  "\t\t\t\t\t\t\t\t\t\tif (typeof num != 'number') num = 0;  // 牌本身没有次数上限 ⇒ 当作 0 再加\n",
  "\t\t\t\t\t\t\t\t\t\tif (num === false) return false;\n",
  "\t\t\t\t\t\t\t\t\t\tif (typeof num != 'number') num = 0;\n",
]
let buggyText = SRC
let removed = 0
for (const line of GUARD_LINES) {
  while (buggyText.includes(line)) { buggyText = buggyText.replace(line, ''); removed++ }
}
const buggyLib = loadVariant(buggyText)

/* ── 忠实复刻引擎的次数上限判定 ─────────────────────────────── */
function checkMod (l, card, player, value, name, skills) {
  const arg = [card, player, value]
  for (const sk of skills) {
    const info = l.skill[sk]
    if (info && info.mod && info.mod[name]) {
      const result = info.mod[name].apply(null, arg)
      if (typeof arg[arg.length - 1] != 'object' && result != undefined) arg[arg.length - 1] = result
    }
  }
  return arg[arg.length - 1]
}
function cardUsable (l, card, player) {
  // game.js:33214-33238（本扩展没有 updateUsable:'phaseUse' 的牌，故略去该分支）
  let num = card.usable
  num = checkMod(l, card, player, num, 'cardUsable', player.skills)
  if (typeof num != 'number') return (typeof num == 'boolean') ? num : true
  if (player.countUsed(card) < num) return true
  return false      // 本扩展没有 cardUsableTarget 类 mod
}

/* ── 场景 ───────────────────────────────────────────────────── */
const SCENARIOS = [
  { label: '名·陆逊（彰才·纵横常驻武将数组）', skills: ['lx_lianying', 'lx_chiyang', 'lx_qianxun', 'lx_zhangcai', 'lx_zhangcai_mod', 'tdgx_shenwei_kill', 'tdgx_turn_reset'], storage: {} },
  { label: '名·陆抗（判定区已失效）', skills: ['lkang_huiyan', 'lkang_hy_mod', 'lkang_kangjin', 'lkang_kangjin_copy', 'lkang_beishui'], storage: { lkang_zone: { judge: true } } },
  { label: '名·刘备（章武发动后，临时技 mlb_zhangwu_mod）', skills: ['mlb_rende', 'mlb_zhangwu', 'mlb_zhangwu_mod', 'mlb_xinghan'], storage: {} },
  { label: '杜预（破竹选了【无中生有】）', skills: ['dy_wuku', 'dy_pozhu', 'dy_pozhu_turn', 'dy_pozhu_perm'], storage: { dy_pz_name: 'wuzhong', dy_pz_perm: mkArr([]) } },
  { label: '转·曹髦（讨贼解锁后，临时技 cm_taozei_free）', skills: ['cm_juejing', 'cm_qiji', 'cm_taozei', 'cm_taozei_free'], storage: {} },
  { label: '基线：不带任何 mod 技能（模拟器自校准用）', skills: ['mouguojia_soul', 'mgj_dingce'], storage: {} },
]

const results = []
for (const sc of SCENARIOS) {
  const mk = (l) => {
    const player = { skills: sc.skills.slice(), storage: Object.assign({}, sc.storage), countUsed: () => 0 }
    return CARDS.map((c) => ({ card: c, ok: cardUsable(l, c, player), raw: checkMod(l, c, player, c.usable, 'cardUsable', sc.skills) }))
  }
  results.push({ sc, fixed: mk(lib), buggy: mk(buggyLib) })
}

/* ── 输出 + 断言 ─────────────────────────────────────────────── */
console.log(`扩展：${FILE}（删掉守卫的副本用于反例，共删 ${removed} 行守卫）\n`)
for (const r of results) {
  console.log(`=== ${r.sc.label} ===`)
  console.log('  牌        类型    usable    现行实现（mod 返回值 → 判定）      反例：删掉守卫（mod 返回值 → 判定）')
  for (let i = 0; i < CARDS.length; i++) {
    const f = r.fixed[i]; const b = r.buggy[i]
    const fmt = (raw) => (raw === undefined ? 'undefined' : (Number.isNaN(raw) ? 'NaN' : String(raw)))
    console.log(`  ${f.card.name.padEnd(9)} ${f.card.type.padEnd(6)}  ${String(f.card.usable).padEnd(9)} ${fmt(f.raw).padEnd(9)} → ${(f.ok ? '可用' : '不可用').padEnd(12)} ${fmt(b.raw).padEnd(9)} → ${b.ok ? '可用' : '不可用'}`)
  }
  console.log('')
}

let pass = 0; let fail = 0
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅ PASS' : '❌ FAIL'} ${name}${detail ? ' —— ' + detail : ''}`) }
console.log('=== 断言 ===')
ok('模拟器自校准：无 mod 时五张牌全可用', results[5].fixed.every((x) => x.ok))
for (const r of results.slice(0, 5)) {
  ok(`现行实现 · ${r.sc.label} ⇒ 五张牌全可用`, r.fixed.every((x) => x.ok),
    r.fixed.map((x) => `${x.card.name}:${x.ok ? '可用' : '不可用'}`).join(' '))
  ok(`反例（删掉守卫）· ${r.sc.label} ⇒ 复现「只有 basic 可用」`, r.buggy.some((x) => !x.ok) && r.buggy[0].ok && r.buggy[1].ok,
    r.buggy.map((x) => `${x.card.name}:${x.ok ? '可用' : '不可用'}`).join(' '))
}
console.log(`\n${fail === 0 ? '✅ 探针通过' : '❌ 探针失败'}（${pass} passed, ${fail} failed）`)
process.exit(fail === 0 ? 0 : 1)
