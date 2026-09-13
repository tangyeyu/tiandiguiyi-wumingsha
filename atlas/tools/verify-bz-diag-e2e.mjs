// 端到端验证诊断插桩：用 Legacy 的编译方式编译并**真的执行**末步，
// 检查 ① 消息是否送到 game.log ② 是否真的写了文件 ③ 写文件失败是否被回显。
// 三个方向都造：正例（正常写入）、反例（fs 抛错 → 必须回显）、无插桩（必须什么都不做）。
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

/** 在受控环境里跑一个技能的末步 */
function runFinalStep (src, { fsThrows, dumpCompiled }) {
  if (dumpCompiled) {
    // 先把 content 取出来看看 Legacy 到底编成了什么
    const lib0 = { config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() }, translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(), imported: { character: {}, card: {} } }
    const GET0 = { name: (c) => (c && c.name) || c, translation: (x) => (typeof x === 'string' ? x : (x && x.name) || 'X'), info: () => ({}) }
    const game0 = { log () {}, players: [], import (t, fn) { if (t === 'extension') { game0._ext = fn(lib0, game0, {}, GET0, {}, {}); return game0._ext } const o = fn(lib0, game0, {}, GET0, {}, {}); if (o && o.name) lib0.imported.character[o.name] = o; return o } }
    new Function('game', 'lib', 'ui', 'get', 'ai', '_status', src)(game0, lib0, {}, GET0, {}, {})
    game0._ext.precontent.call(game0._ext)
    const body = lib0.imported.character.tiandiguiyi.skill.bz_bingquan.content.toString()
    // 复刻 Legacy 的 step 替换，把内部字符串打出来
    let str = body.slice(body.indexOf('{') + 1)
    let skip = 0, k = 0
    const traceRepl = []
    for (k = 0; k < 99; k++) {
      const reg = new RegExp(`['"]step ${k}['"]`)
      const result = str.slice(skip).match(reg)
      if (result == null) break
      const insertStr = k === 0 ? 'switch(step){case 0:' : `break;case ${k}:`
      let copy = str
      copy = copy.slice(0, skip + result.index) + insertStr + copy.slice(skip + result.index + result[0].length)
      try { new Function(copy); str = copy; skip += result.index + insertStr.length; traceRepl.push(`${k}:OK`) } catch (e) { k--; skip += result.index + result[0].length; traceRepl.push(`${k}:FAIL(${e.message.slice(0, 30)})`) }
    }
    console.log('    [debug] step 替换过程 =', traceRepl.join(' '))
    console.log('    [debug] 最终 k =', k)
    const ci = str.indexOf('case 16:')
    console.log('    [debug] case16 片段 =', JSON.stringify(str.slice(ci, ci + 200)))
    return null
  }
  const written = []
  const logged = []
  const sad = []
  const lib = { config: { all: { characters: mkArr() }, characters: mkArr(), hiddenCharacterPack: [], forbidai: mkArr() }, translate: {}, character: {}, characterPack: {}, skill: {}, skilllist: mkArr(), imported: { character: {}, card: {} } }
  const GET = { name: (c) => (c && c.name) || c, type: () => 'trick', translation: (x) => (typeof x === 'string' ? x : (x && x.name) || 'X'), cnNumber: (n) => String(n), attitude: () => 1, itemtype: () => 'card', info: () => ({}) }
  const game = {
    log (...a) { logged.push(a.join(' ')) }, players: [], hasPlayer () { return false },
    import (type, fn) {
      if (type === 'extension') { game._ext = fn(lib, game, {}, GET, {}, {}); return game._ext }
      const obj = fn(lib, game, {}, GET, {}, {})
      if (obj && obj.name) lib.imported.character[obj.name] = obj
      return obj
    },
  }
  // 装 mock 全局：编译后的 content 在全局作用域求值，require/game/lib/get 都必须能从全局拿到
  const prevRequire = globalThis.require
  const prevGame = globalThis.game
  const prevLib = globalThis.lib
  const prevGet = globalThis.get
  globalThis.game = game
  globalThis.lib = lib
  globalThis.get = GET
  globalThis.require = (m) => {
    if (m !== 'fs') throw new Error('unexpected module ' + m)
    return { appendFileSync (p, s) { if (fsThrows) throw new Error('EACCES: 模拟无写权限'); written.push({ p, s }) } }
  }
  try {
    new Function('game', 'lib', 'ui', 'get', 'ai', '_status', src)(game, lib, {}, GET, {}, {})
    game._ext.precontent.call(game._ext)
    const pkg = lib.imported.character.tiandiguiyi
    const skill = pkg && pkg.skill && pkg.skill.bz_bingquan
    if (!skill) return { error: '取不到 bz_bingquan' }
    if (process.env.BZ_E2E_DEBUG) {
      const cs = skill.content.toString()
      const ci = cs.indexOf("'step 16'")
      console.log('    [debug] content 长度=', cs.length, ' 含 step16=', ci !== -1)
      console.log('    [debug] content 尾部=', JSON.stringify(cs.slice(-320)))
    }
    const fn = legacyCompile(skill.content.toString())
    if (process.env.BZ_E2E_DEBUG) {
      const cs = skill.content.toString()
      console.log('    [debug] 源码里 "步:" 出现次数=', (cs.match(/步:/g) || []).length)
      console.log('    [debug] 源码里 _bzMsg 出现次数=', (cs.match(/_bzMsg/g) || []).length)
    }
    const player = {
      storage: { bz_bing_gained: 0, bz_bing_carry: -1 }, marks: {}, skills: ['bz_bingquan'],
      isIn: () => true, hasSkill: () => false, addSkill () {}, removeSkill () {}, addTempSkill () {},
      addMark () {}, removeMark () {}, countMark () { return 0 }, countCards: () => 0, draw () {},
      say (s) { sad.push(s) },
    }
    // ★ 必须从 step 0 按引擎语义驱动：goto(n) 置 step=n-1，主循环再 ++；
    //   直接塞 step=15 是错的——兵权的步骤是 0/3/4/14/16（没有 15），
    //   switch 落到 default 什么都不做，于是"没输出"是测试自己的假象。
    const ev = { step: 0, finished: false, next: [], triggername: 'phaseEnd', finish () { this.finished = true }, goto (n) { this.step = n - 1 }, redo () { this.step-- }, getParent: () => ({}), trigger () {} }
    game.players = [player]
    let guard = 0
    const stepLog = []
    while (!ev.finished && guard++ < 60) {
      stepLog.push(ev.step)
      if (ev.next.length) {
        const q = ev.next.shift()
        q._result = q.name === 'chooseControl' ? { control: (q.controls || [])[0] } : { bool: false }
        ev.result = q._result
      } else {
        try {
          fn(ev, ev.step, undefined, player, undefined, undefined, undefined, undefined, 'bz_bingquan', true, undefined, ev, ev._result, {}, lib, game, {}, {}, {})
        } catch (e) {
          if (process.env.BZ_E2E_DEBUG) console.log(`    [debug] step ${ev.step} 抛错: ${e.message}`)
          break
        }
      }
      if (ev.finished) break
      ev.step++
    }
    if (process.env.BZ_E2E_DEBUG) console.log('    [debug] steps=', stepLog.join(','), ' finished=', ev.finished, ' logged=', logged.length, ' written=', written.length)
    return { written, logged, sad, steps: guard }
  } finally {
    if (prevRequire === undefined) delete globalThis.require; else globalThis.require = prevRequire
    if (prevGame === undefined) delete globalThis.game; else globalThis.game = prevGame
    if (prevLib === undefined) delete globalThis.lib; else globalThis.lib = prevLib
    if (prevGet === undefined) delete globalThis.get; else globalThis.get = prevGet
  }
}

let pass = 0, fail = 0
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✅ PASS' : '❌ FAIL'} ${n}${d ? ' —— ' + d : ''}`) }
const PREFIX = '【BZ】bz_bingquan'

console.log('=== 端到端：执行末步（正例：fs 正常）===')
if (process.env.BZ_E2E_DUMP) { runFinalStep(SRC, { fsThrows: false, dumpCompiled: true }) }
const A = runFinalStep(SRC, { fsThrows: false })
ok('末步执行未抛错', !A.error, A.error || '')
ok('写入了文件', (A.written || []).length > 0, (A.written || []).map((w) => w.p).join(','))
ok('文件内容含【BZ】诊断行', (A.written || []).some((w) => w.s.includes(PREFIX)), JSON.stringify((A.written || [])[0] || {}).slice(0, 160))
ok('战报也收到了同一行', (A.logged || []).some((l) => l.includes(PREFIX)), JSON.stringify((A.logged || [])[0] || '').slice(0, 120))
ok('气泡也收到了同一行', (A.sad || []).some((l) => l.includes(PREFIX)), JSON.stringify((A.sad || [])[0] || '').slice(0, 120))

console.log('\n=== 端到端：反例（fs 抛错 ⇒ 必须回显失败原因）===')
const B = runFinalStep(SRC, { fsThrows: true })
ok('写文件失败时不应静默', (B.logged || []).some((l) => l.includes('写不进去') || l.includes('EACCES')), (B.logged || []).join(' | ').slice(0, 220))

console.log('\n=== 端到端：反例（无插桩 ⇒ 不应写任何文件）===')
// 用**原始仓库文件**做对照（它没有插桩），比"删行"可靠：
//   删行会破坏 try/catch 配对，反而制造语法错误（这正是上一版测试炸掉的原因）。
const RAW = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : null
if (RAW) {
  const C = runFinalStep(RAW, { fsThrows: false })
  ok('未插桩的原始文件不写任何文件', !C.error && (C.written || []).length === 0, C.error || `written=${(C.written || []).length}`)
} else {
  console.log('  （跳过：未提供对照文件作为第 3 个参数）')
}

console.log(`\n${fail === 0 ? '✅ 端到端通过' : '❌ 端到端失败'}（${pass} passed, ${fail} failed）`)
process.exit(fail === 0 ? 0 : 1)
