// 自校准测试：确认诊断插桩在"引擎编译方式"下能正常执行。
//   正例：打过补丁的文件 → 调用 bz_bingquan.content，应写入 game.__bzTrace 且不抛错
//   反例：把插桩里的 game 改成不存在的变量（复现用户报的 ReferenceError）→ 必须抛错
// 只有两个方向都符合预期，这个补丁才可信。
import fs from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const SRC = fs.readFileSync(FILE, 'utf8')

function mkArr (init = []) {
  const a = init.slice()
  for (const [k, f] of [['contains', function (x) { return this.indexOf(x) !== -1 }], ['add', function (x) { if (this.indexOf(x) === -1) this.push(x); return this }]]) {
    Object.defineProperty(a, k, { value: f, enumerable: false })
  }
  return a
}
function loadLib (src) {
  const lib = { config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() }, translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(), imported: { character: {}, card: {} } }
  const GET = { name: (c) => (c && c.name) || c, type: () => 'trick', translation: (x) => (typeof x === 'string' ? x : (x && x.name) || 'X'), cnNumber: (n) => String(n), attitude: () => 1, itemtype: () => 'card', info: () => ({}) }
  const game = {
    log () {}, players: [], hasPlayer () { return false }, delay () {}, delayx () {}, __bzTrace: undefined,
    import (type, fn) {
      if (type === 'extension') { game._ext = fn(lib, game, {}, GET, {}, {}); return game._ext }
      const obj = fn(lib, game, {}, GET, {}, {})
      if (obj && obj.name) lib.imported.character[obj.name] = obj
      return obj
    },
  }
  new Function('game', 'lib', 'ui', 'get', 'ai', '_status', src)(game, lib, {}, GET, {}, {})
  game._ext.precontent.call(game._ext)
  return { lib, game }
}

/* ── 复刻 game.js:12094-12134 的 Legacy()（只保留与 step 相关的部分） ── */
function legacyCompile (fnStr) {
  let str = fnStr.replace(/((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg, '$2').trim()
  str = str.slice(str.indexOf('{') + 1)
  if (str.indexOf('step 0') === -1) {
    str = '{if(event.step==1) {event.finish();return;}\n' + str
  } else {
    let skip = 0, k = 0
    for (k = 0; k < 99; k++) {
      const reg = new RegExp(`['"]step ${k}['"]`)
      const result = str.slice(skip).match(reg)
      if (result == null) break
      const insertStr = k === 0 ? 'switch(step){case 0:' : `break;case ${k}:`
      let copy = str
      copy = copy.slice(0, skip + result.index) + insertStr + copy.slice(skip + result.index + result[0].length)
      try { new Function(copy); str = copy; skip += result.index + insertStr.length } catch (e) { k--; skip += result.index + result[0].length }
    }
    str = `if(event.step==${k}){event.finish();return;}` + str
  }
  return new Function('event', 'step', 'source', 'player', 'target', 'targets', 'card', 'cards', 'skill', 'forced', 'num', 'trigger', 'result', '_status', 'lib', 'game', 'ui', 'get', 'ai', str)
}

function tryRun (label, src, expectThrow) {
  const { lib, game } = loadLib(src)
  const pkg = lib.imported.character.tiandiguiyi
  const skill = pkg && pkg.skill && pkg.skill.bz_bingquan
  if (!skill) { console.log(`  ❌ ${label}：取不到 bz_bingquan`); return false }
  const fn = legacyCompile(skill.content.toString())
  const player = {
    storage: { bz_bing_gained: 0, bz_bing_carry: -1 }, marks: {}, skills: ['bz_bingquan'],
    isIn: () => true, hasSkill: (s) => false, addSkill () {}, removeSkill () {}, addTempSkill () {},
    addMark () {}, removeMark () {}, countMark () { return 0 }, countCards: () => 0, draw () {},
  }
  const ev = { step: 0, finished: false, next: [], triggername: 'phaseBegin', finish () { this.finished = true }, goto (n) { this.step = n - 1 }, redo () { this.step-- }, getParent: () => ({}), trigger () {} }
  game.players = [player]
  try {
    fn(ev, ev.step, undefined, player, undefined, undefined, undefined, undefined, 'bz_bingquan', true, undefined, ev, ev._result, {}, lib, game, {}, {}, {})
    const tr = game.__bzTrace
    if (expectThrow) { console.log(`  ❌ ${label}：预期抛错但没有（trace=${JSON.stringify(tr)}）`); return false }
    if (!tr || !tr.length) { console.log(`  ❌ ${label}：没有写入 __bzTrace`); return false }
    console.log(`  ✅ ${label}：写入 ${tr.length} 条 → ${JSON.stringify(tr.slice(0, 2))}`)
    return true
  } catch (e) {
    if (expectThrow) { console.log(`  ✅ ${label}：如期抛错 → ${e.constructor.name}: ${e.message}`); return true }
    console.log(`  ❌ ${label}：意外抛错 → ${e.message}`)
    return false
  }
}

console.log('=== 诊断插桩自校准 ===')
let pass = 0, fail = 0
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅ PASS' : '❌ FAIL'} ${name}${detail ? ' —— ' + detail : ''}`) }

/* 正例：打过补丁的文件，用 Legacy 方式编译并调用，必须写入 __bzTrace 且不抛错 */
ok('正例：已打补丁的文件能写入 __bzTrace', tryRun('已打补丁的文件', SRC, false))

/* ★ 静态守卫（真实反例）：插桩行只允许引用 content 函数的形参 ——
   这正是我第一版翻车的原因（引用了包级闭包里的局部变量 trace，
   而 Legacy 用 new Function 编译，运行时看不到闭包）。这里逐行把插桩行里
   出现的标识符抠出来，任何不在白名单里的都判失败。 */
const ALLOWED = new Set(['game', 'event', 'player', 'try', 'catch', 'e', 'e1', 'e2', 'if', 'typeof', 'length', 'push', 'slice', 'join', 'log', 'countMark', 'bz_bing', 'bz_bingquan', 'bz_qingshi', 'bz_jiufa', 'bz_kongcheng', 'phaseBegin', 'Number', 'String', 'require', 'fs', 'appendFileSync', 'Date', 'toLocaleTimeString', '_ms', 'var'])
const BAD_WORDS = new Set(['trace', 'undefined_var', 'self'])
const lines = SRC.split('\n').filter((l) => l.includes('__bzTrace'))
ok('补丁确实插入了插桩行', lines.length > 0, `${lines.length} 行`)
const offenders = []
for (const l of lines) {
  // ★ 先剥掉字符串字面量内容再扫标识符：'step 3' / '【BZ诊断…' 里的词不是变量，
  //   不剥掉会把 step / BZ 误判成非法标识符（第一版就是这么误报的）。
  const codeOnly = l.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
  for (const m of codeOnly.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) {
    const id = m[1]
    if (BAD_WORDS.has(id)) { offenders.push(id); continue }
    if (ALLOWED.has(id)) continue
    offenders.push(id)   // 未列入白名单 ⇒ 可能是闭包局部变量或浏览器全局
  }
}
ok('插桩行不引用任何闭包局部变量 / 浏览器全局', offenders.length === 0, offenders.length ? [...new Set(offenders)].join(',') : '仅用 game/event/player')

/* ★ 汇总行的位置必须"可达"：它要在最后一个 'step N' 标签**之后**紧跟着出现，
   而不是落在末步的 event.finish(); return; 之后（那是死代码，语法合法但永不执行——
   第一版就是这个坑：node --check 能过，运行时战报里却一行都没有）。 */
const summaryLines = SRC.split('\n').filter((l) => l.includes('BZ诊断'))
ok('每个被插桩的技能都有一行战报汇总', summaryLines.length === 4, `${summaryLines.length} 行`)
const srcLines = SRC.split('\n')
const unreachable = []
for (let i = 0; i < srcLines.length; i++) {
  if (!srcLines[i].includes('BZ诊断')) continue
  // 往上找最近的 'step N'
  let stepIdx = -1
  for (let j = i - 1; j >= 0 && j > i - 14; j--) { if (/'step \d+'/.test(srcLines[j])) { stepIdx = j; break } }
  if (stepIdx === -1) { unreachable.push(`L${i + 1} 找不到所属步骤`); continue }
  // 汇总行与 step 标签之间不允许出现 return/finish（那就是不可达）
  let blocked = null
  for (let j = stepIdx + 1; j < i; j++) {
    if (/event\.finish\(\)|return\s*;/.test(srcLines[j])) { blocked = j + 1; break }
  }
  if (blocked) unreachable.push(`L${i + 1} 之前有 finish/return（L${blocked}）⇒ 不可达`)
}
ok('汇总行可达（不在末步的 finish/return 之后）', unreachable.length === 0, unreachable.length ? unreachable.join('; ') : '4 处均位于步骤开头')

/* 反向守卫自检：把插桩行人为改坏，上面的判据必须能抓到 */
const brokenSrc = SRC.replace(/game\.__bzTrace/g, 'trace.__bzTrace')
const brokenLines = brokenSrc.split('\n').filter((l) => l.includes('__bzTrace.push'))
const caught = brokenLines.some((l) => [...l.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)].some((m) => BAD_WORDS.has(m[1])))
ok('反例：把 game 换成闭包变量 trace ⇒ 静态判据必须抓到', caught, caught ? '已抓到' : '漏判')

/* 另一条反例：整条插桩删掉 ⇒ 正例判据必须失败（证明它真的在检测，不是恒真） */
ok('反例：补丁不存在时，正例判据必须失败', !tryRun('无插桩文件', SRC.replace(/\n[^\n]*__bzTrace\.push[^\n]*/g, ''), false))

console.log(`\n${fail === 0 ? '✅ 自校准通过' : '❌ 自校准失败'}（${pass} passed, ${fail} failed）`)
process.exit(fail === 0 ? 0 : 1)
