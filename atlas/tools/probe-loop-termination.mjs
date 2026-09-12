// 循环终止性回归探针 —— 毁堰⑥（手牌区）「分配 X 点伤害」会不会无限循环
//
// 事故来源（2026-09-12）：毁堰 step 4 用 `event.redo()` 回跳，实机表现为
//   「失去手牌区后造成伤害 → 可以无限让其他角色的区域失效，而且该效果无法取消」。
// 根因见 docs/四将开发笔记-20260912.md §7：redo() 只回退 step ⇒ 原地重跑 step 4，
// 既不重新询问、也不再检查 lkX，而 result（= event._result）永远是 step 3 的旧结果。
//
// 复刻琉璃版 game.js 的事件循环语义（行号当次核实）：
//   · 循环体：先处理 next 子事件 → 再处理 finished → 再执行 content → 最后 event.step++（game.js:41806）
//   · goto(n)  game.js:31959-31961   this.step = n - 1   ⇒ 下一轮以 step n 重入
//   · redo()   game.js:31962-31964   this.step--         ⇒ 下一轮**原地重入当前 step**
//   · content 收到的 result 参数 = event._result（game.js:41676）
//   · 子事件结束时：只有 event.result 为真才回填父事件（game.js:41735-41738）
//   · damage 事件的 content 全文没有 result 赋值 ⇒ 它不会覆盖父事件的 _result
//
// 跑两个真实 content：毁堰（lkang_huiyan）+ 抗晋·同轨（lkang_kangjin_copy，挂在 damageEnd 上）
// 两个方向都验：
//   正例 = 仓库当前文件（step 4 用 event.goto(3)）→ 必须终止，伤害数 = X，询问次数 = X
//   反例 = 把 bug 放回去（step 4 改回 event.redo()）→ 必须被判为不终止（伤害/询问远超 X）
//
// 用法：node atlas/tools/probe-loop-termination.mjs [extension.js 路径]
import fs from 'node:fs'
import { parsexOld } from './parsex-model.mjs'

const FILE = process.argv[2] || 'extension/extension.js'
const SRC = fs.readFileSync(FILE, 'utf8')

/* ── 从句法块里抠出函数体 ───────────────────────────────────── */
function braceBlock (src, start) {
  const open = src.indexOf('{', start)
  let d = 0
  for (let p = open; p < src.length; p++) {
    if (src[p] === '{') d++
    else if (src[p] === '}') { d--; if (d === 0) return src.slice(open, p + 1) }
  }
  throw new Error('未闭合的块')
}
function contentBody (name) {
  const key = SRC.search(new RegExp('\\n\\t+' + name + '\\s*:\\s*\\{'))
  if (key < 0) throw new Error('找不到技能 ' + name)
  const block = braceBlock(SRC, key)
  const ci = block.indexOf('content: function')
  if (ci < 0) throw new Error(name + ' 没有 content')
  return braceBlock(block, ci)
}
const compile = (body) => parsexOld({ toString: () => body })

const huiyanBody = contentBody('lkang_huiyan')
const kangjinBody = contentBody('lkang_kangjin_copy')

/* 把 bug 放回去：step 4 的那次跳转改回 redo()（step 2 的 goto(3) 保持不动） */
function buggyVariant (body) {
  const marker = 'event.goto(3);'
  const last = body.lastIndexOf(marker)
  if (last < 0) throw new Error('反例构造失败：content 里找不到 event.goto(3)')
  return body.slice(0, last) + 'event.redo();' + body.slice(last + marker.length)
}

/* ── 迷你引擎 ───────────────────────────────────────────────── */
const PARAMS = ['event', 'step', 'source', 'player', 'target', 'targets', 'card', 'cards',
  'skill', 'forced', 'num', 'trigger', 'result', '_status', 'lib', 'game', 'ui', 'get', 'ai']

function mkEvent (name, extra = {}) {
  return {
    name, step: 0, next: [], finished: false, _result: undefined,
    finish () { this.finished = true },
    goto (n) { this.step = n - 1 },            // game.js:31959-31961
    redo () { this.step-- },                   // game.js:31962-31964
    ...extra,
  }
}

function runEvent (root, env, maxSteps = 400) {
  const stack = [root]
  let steps = 0
  while (stack.length) {
    if (++steps > maxSteps) return { terminated: false, steps }
    const ev = stack[stack.length - 1]
    if (ev.next.length) {
      const child = ev.next.shift()
      child.parent = ev
      stack.push(child)
      continue
    }
    if (ev.finished) {
      stack.pop()
      const parent = stack[stack.length - 1]
      if (parent && ev.result) parent._result = ev.result   // game.js:41735-41738
      continue
    }
    if (typeof ev.content === 'function') {
      if (process.env.PROBE_DEBUG) console.log(`    [loop] run content step=${ev.step} name=${ev.name}`)
      ev.content(...PARAMS.map((k) => env.argFor(ev, k)))
    }
    ev.step++                                              // game.js:41806
  }
  return { terminated: true, steps }
}

/* ── 一次完整演练：毁堰⑥ + 真实抗晋·同轨 ───────────────────── */
function scenario ({ body, targetAnswers, hp = 4, label }) {
  const trace = []
  const current = { event: null }
  let askedHuiyan = 0
  let kangjinRuns = 0
  let damageCount = 0
  const invalidated = new Set()   // 被抗晋「复制失效」的角色

  const victim = {
    name: 'victim', hp: 4, storage: {}, isIn: () => true,
    countEnabledSlot: () => 1, disableEquip () {}, enableEquip () {}, update () {},
    getCards: () => [], lose () {}, draw () {},
  }
  const lkang = {
    name: 'lkang', hp, maxHp: 4, storage: { lkang_zone: {} },
    countEnabledSlot: () => 1, disableEquip () {}, enableEquip () {}, update () {},
    getCards: () => [], lose () {}, draw () {}, countMark: () => 0,
  }

  const get = { translation: (x) => x, cnNumber: (n) => String(n), damageEffect: () => 1 }
  const game = { log () {}, players: [lkang, victim], hasPlayer: () => true, updateRoundNumber () {} }
  const owner = () => current.event

  const setChain = (ev) => { ev.set = function () { return this }; return ev }
  // 询问事件：内容一次性把脚本答案写进 result 并结束（≡ 引擎的 chooseXxx 子事件）
  const ask = (name, answer) => {
    const ev = mkEvent(name)
    ev.content = function () { this.result = answer; this.finish() }
    owner().next.push(ev)      // ≡ 引擎把 chooseXxx 建成当前事件的子事件
    if (process.env.PROBE_DEBUG) console.log(`    [ask] ${name} → owner=${owner() && owner().name} answer=${JSON.stringify(answer)}`)
    return ev
  }

  lkang.chooseControl = () => {
    // 毁堰选区域（labels 顺序 e1..e4,judge,hand ⇒ index 5 = 手牌区）；抗晋选区域取 index 0
    const isHuiyan = owner() && owner().name === 'skill:lkang_huiyan'
    return setChain(ask('chooseControl', { index: isHuiyan ? 5 : 0 }))
  }
  lkang.chooseTarget = () => {
    const isHuiyan = owner() && owner().name === 'skill:lkang_huiyan'
    if (!isHuiyan) return setChain(ask('chooseTarget', { bool: true, targets: [victim] }))
    askedHuiyan++
    const yes = targetAnswers.length ? targetAnswers.shift() : true
    return setChain(ask('chooseTarget', yes ? { bool: true, targets: [victim] } : { bool: false }))
  }

  // 抗晋·同轨 的真实 content（trigger: source 'damageEnd'）
  const kangjinEvent = () => {
    const ev = mkEvent('skill:lkang_kangjin_copy', { player: lkang, source: lkang, skill: 'lkang_kangjin_copy' })
    ev.content = compile(kangjinBody)
    // 只在「还有已失效区域」时才触发（与 skill.filter 一致）
    const z = lkang.storage.lkang_zone
    if (!z || !(z.e1 || z.e2 || z.e3 || z.e4 || z.judge || z.hand)) return null
    return ev
  }

  // 伤害事件：结算伤害 → damageEnd 里跑一次抗晋·同轨（★ 不写 result，忠实于引擎）
  const makeDamage = (target, source) => {
    const dmg = mkEvent('damage', { player: target, source })
    dmg.content = function () {
      if (this.step === 0) {
        damageCount++
        trace.push(`  伤害 #${damageCount} → ${target.name}`)
        const kj = kangjinEvent()
        if (kj) { kangjinRuns++; this.next.push(kj) }
        return
      }
      this.finish()      // ★ 不写 this.result —— 与引擎一致（damage content 全文无 result 赋值）
    }
    return dmg
  }
  victim.damage = () => { const ev = makeDamage(victim, lkang); owner().next.push(ev); return ev }
  lkang.damage = () => { const ev = makeDamage(lkang, victim); owner().next.push(ev); return ev }

  const root = mkEvent('skill:lkang_huiyan', { player: lkang, skill: 'lkang_huiyan' })
  root.content = compile(body)

  const env = {
    argFor (ev, key) {
      switch (key) {
        case 'event': current.event = ev; return ev          // content 的第一实参 ⇒ owner() 随之切换
        case 'step': return ev.step
        case 'player': return ev.player
        case 'target': return ev.target
        case 'targets': return ev.targets
        case 'skill': return ev.skill
        case 'result': return ev._result                     // game.js:41676
        case '_status': return { event: ev }
        case 'lib': return {}
        case 'game': return game
        case 'ui': return { discardPile: {} }
        case 'get': return get
        default: return undefined
      }
    },
  }

  current.event = root
  const res = runEvent(root, env)

  // 抗晋把「失效状态」复制给了谁 —— 直接读状态位（与实现一致）
  const copy = victim.storage.lkang_copy
  if (copy && (copy.e1 || copy.e2 || copy.e3 || copy.e4 || copy.judge || copy.hand)) invalidated.add(victim.name)

  return { label, terminated: res.terminated, steps: res.steps, askedHuiyan, kangjinRuns, damageCount, invalidated: invalidated.size, trace }
}

/* ── 三个场景 ───────────────────────────────────────────────── */
const A = scenario({ body: huiyanBody, targetAnswers: [], label: '正例 A：现行实现（goto(3)），一路选目标' })
const B = scenario({ body: huiyanBody, targetAnswers: [true, false], label: '正例 B：现行实现（goto(3)），第 2 次取消' })
const C = scenario({ body: buggyVariant(huiyanBody), targetAnswers: [], label: '反例 C：把 bug 放回去（redo()），一路选目标' })

for (const r of [A, B, C]) {
  console.log(`\n=== ${r.label} ===`)
  console.log(r.trace.slice(0, 10).join('\n') + (r.trace.length > 10 ? `\n  …（共 ${r.trace.length} 行）` : ''))
  console.log(`  终止=${r.terminated}  步数=${r.steps}  毁堰询问=${r.askedHuiyan}  抗晋发动=${r.kangjinRuns}  造成伤害=${r.damageCount}  被复制失效的角色数=${r.invalidated}`)
}

console.log('\n=== 断言 ===')
let pass = 0; let fail = 0
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅ PASS' : '❌ FAIL'} ${name}${detail ? ' —— ' + detail : ''}`) }
ok('正例 A 终止（循环有界）', A.terminated)
ok('正例 A 伤害数 = X（hp4 ⇒ X=3）', A.damageCount === 3, `实际 ${A.damageCount}`)
ok('正例 A 询问次数 = 伤害数 = 抗晋发动次数', A.askedHuiyan === 3 && A.kangjinRuns === 3, `毁堰询问 ${A.askedHuiyan} / 抗晋发动 ${A.kangjinRuns}`)
ok('正例 B 第 2 次取消后立即结束（该效果可取消）', B.terminated && B.damageCount === 1 && B.askedHuiyan === 2, `伤害 ${B.damageCount} / 询问 ${B.askedHuiyan}`)
ok('反例 C 被判为不终止（bug 仍在 ⇒ 探针必须失败）', C.terminated === false, `步数 ${C.steps}（保护上限）`)
ok('反例 C 伤害与「抗晋·同轨」失效次数远超 X（无限循环 + 无限失效的直接证据）', C.damageCount > 3 && C.kangjinRuns > 3, `伤害 ${C.damageCount} / 抗晋 ${C.kangjinRuns}`)

console.log(`\n${fail === 0 ? '✅ 探针通过' : '❌ 探针失败'}（${pass} passed, ${fail} failed）`)
process.exit(fail === 0 ? 0 : 1)
