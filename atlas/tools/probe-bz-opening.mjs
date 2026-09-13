// 复刻 atlas/tools/probe-cardusable-nan.mjs 的装载与判定，只把场景换成诸葛亮，
// 并额外检查：武将数组里有没有把 mod 型技能常驻挂上（本包历史事故：mod 常驻 ⇒ 只能用基本牌）。
import fs from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const SRC = fs.readFileSync(FILE, 'utf8')

function mkArr (init = []) {
  const a = init.slice()
  for (const [k, f] of [['contains', function (x) { return this.indexOf(x) !== -1 }], ['add', function (x) { if (this.indexOf(x) === -1) this.push(x); return this }], ['addArray', function (x) { for (const i of x) this.add(i); return this }]]) {
    Object.defineProperty(a, k, { value: f, enumerable: false })
  }
  return a
}
// ★ 关键：扩展里的 content 函数**闭包捕获的是 loadVariant 传给工厂的 get**，
//   所以必须把带 name/type 的 get 直接传给加载器，而不是事后挂全局。
const GET = {
  name: (c) => (c && c.name) || c,
  type: () => 'trick',
  translation: (x) => (typeof x === 'string' ? x : (x && x.name) || 'X'),
  cnNumber: (n) => String(n),
  attitude: () => 1,
  itemtype: () => 'card',
  info: () => ({}),
}
function loadVariant (text) {
  const lib = {
    config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() },
    translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(), imported: { character: {}, card: {} },
  }
  const game = {
    log () {}, players: [], hasPlayer () { return false }, delay () {}, delayx () {},
    import (type, fn) {
      if (type === 'extension') { game._ext = fn(lib, game, {}, GET, {}, {}); return game._ext }
      const obj = fn(lib, game, {}, GET, {}, {})
      if (obj && obj.name) lib.imported.character[obj.name] = obj
      return obj
    },
  }
  new Function('game', 'lib', 'ui', 'get', 'ai', '_status', text)(game, lib, {}, GET, {}, {})
  game._ext.precontent.call(game._ext)
  return lib
}
const lib = loadVariant(SRC)
const pkg = lib.imported.character.tiandiguiyi
if (!pkg) { console.error('未装载到 tiandiguiyi 包'); process.exit(2) }

/* ── 牌样本（与本包既有探针一致） ── */
const CARDS = [
  { name: 'sha', usable: 1, type: 'basic' },
  { name: 'jiu', usable: 1, type: 'basic' },
  { name: 'wuzhong', usable: undefined, type: 'trick' },
  { name: 'shunshou', usable: undefined, type: 'trick' },
  { name: 'qinggang', usable: undefined, type: 'equip' },
]

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
  let num = card.usable
  num = checkMod(l, card, player, num, 'cardUsable', player.skills)
  if (typeof num != 'number') return (typeof num == 'boolean') ? num : true
  if (player.countUsed(card) < num) return true
  return false
}
// mod.cardUsable 链里会调 get.name(card)（bz_bingquan_mod 就是这么写的），
// 所以模拟判定前先把 get 的最小子集装到全局，否则 mod 抛异常。
globalThis.get = Object.assign({
  name: (c) => (c && c.name) || c,
  type: () => 'trick',
  translation: (x) => (typeof x === 'string' ? x : (x && x.name) || 'X'),
  cnNumber: (n) => String(n),
  attitude: () => 1,
  itemtype: () => 'card',
}, globalThis.get || {})
function cardEnabled (l, card, player) {
  // mod.cardEnabled 的拦截（本包毁堰·手牌区用的就是这个）
  const arg = [card, player, true]
  for (const sk of player.skills) {
    const info = l.skill[sk]
    if (info && info.mod && info.mod.cardEnabled) {
      const r = info.mod.cardEnabled.apply(null, arg)
      if (typeof arg[arg.length - 1] != 'object' && r != undefined) arg[arg.length - 1] = r
    }
  }
  return arg[arg.length - 1]
}

/* ── 取出三个新将的武将数组（直接从 pkg.character 读，权威） ── */
const NAMES = { bing_zhugeliang: '兵·诸葛亮', tdgx_zhouyu: '名·周瑜', tdgx_peixiu: '名·裴秀' }
console.log('=== 武将数组（pkg.character）===')
for (const [id, label] of Object.entries(NAMES)) {
  const entry = pkg.character[id]
  console.log(`  ${label.padEnd(8)} hp=${entry ? entry[2] : '?'} 技能=[${(entry ? entry[3] : []).join(', ')}]`)
  if (entry && entry[3]) {
    const mods = entry[3].filter((s) => pkg.skill[s] && pkg.skill[s].mod)
    if (mods.length) console.log(`      !! 数组里含 mod 型技能（开局常驻）：${mods.join(', ')}`)
    const missing = entry[3].filter((s) => !pkg.skill[s])
    if (missing.length) console.log(`      !! 数组里引用了未定义的技能：${missing.join(', ')}`)
  }
}

/* ── 场景：诸葛亮开局（数组技能全在）+ 「本回合增益」快照两种取值 ── */
const bzSkills = pkg.character.bing_zhugeliang[3].slice()
const SCENARIOS = [
  { label: '诸葛亮开局（数组技能，storage 空）', skills: bzSkills, storage: {} },
  { label: '诸葛亮开局 + bz_bing_buff=0', skills: bzSkills, storage: { bz_bing_buff: 0 } },
  { label: '诸葛亮开局 + 兵权增益中（buff=3，mod 已挂）', skills: bzSkills.concat(['bz_bingquan_mod']), storage: { bz_bing_buff: 3 } },
  { label: '诸葛亮 + 情势闸门技能（bz_qingshi_used）', skills: bzSkills.concat(['bz_qingshi_used']), storage: {} },
  { label: '基线：不带任何 mod 技能', skills: ['mouguojia_soul', 'mgj_dingce'], storage: {} },
]

let fail = 0
for (const sc of SCENARIOS) {
  const player = { skills: sc.skills.slice(), storage: Object.assign({}, sc.storage), countUsed: () => 0 }
  console.log(`\n=== ${sc.label} ===`)
  const rows = CARDS.map((c) => ({
    c,
    usable: cardUsable(lib, c, player),
    enabled: cardEnabled(lib, c, player),
    raw: checkMod(lib, c, player, c.usable, 'cardUsable', sc.skills),
  }))
  for (const r of rows) {
    const rawTxt = r.raw === undefined ? 'undefined' : (Number.isNaN(r.raw) ? 'NaN' : String(r.raw))
    console.log(`  ${r.c.name.padEnd(9)} usable=${String(r.c.usable).padEnd(9)} mod→${rawTxt.padEnd(9)} 可用=${r.usable ? '是' : '否'} enabled=${r.enabled ? '是' : '否'}`)
  }
  const bad = rows.filter((r) => !r.usable || !r.enabled)
  if (bad.length) { console.log(`  ❌ 有 ${bad.length} 张牌被拦：${bad.map((r) => r.c.name).join(', ')}`); fail++ }
  else console.log('  ✅ 五张牌均可正常使用')
}

console.log(`\n${fail === 0 ? '✅ 诸葛亮开局不存在「牌被拦」问题' : `❌ 有 ${fail} 个场景存在拦截`}`)
process.exit(fail === 0 ? 0 : 1)
