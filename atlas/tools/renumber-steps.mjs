// 把每个技能 content 里的步骤号**重排成连续编号**（0,1,2,…），并同步改写 goto 目标。
//
// 为什么必须连续（本次卡死事故的根因）：
//   引擎 parsex 从 0 开始逐个替换 `'step N'` → `break;case N:`，**遇到第一个不存在的编号就停**
//   （`str.indexOf('step '+k) == -1 → break`）。步骤号一旦断开（例如 0/3/4/14/16），
//   后面的步骤根本不会被编成 case，开头的 `if(event.step==末步+1){finish}` 也按错误的
//   末步号来生成 ⇒ event.finish() 永不被调用 ⇒ 主循环把同一段代码无限重复执行。
//   实测症状：诸葛亮 roundStart 卡死，诊断气泡显示「引擎传 step=169407 且持续增长」。
//
// 用法：
//   node atlas/tools/renumber-steps.mjs extension/extension.js            # 只报告
//   node atlas/tools/renumber-steps.mjs extension/extension.js --apply    # 真正改写（自动备份）
import fs from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const APPLY = process.argv.includes('--apply')
const SRC = fs.readFileSync(FILE, 'utf8')
const lines = SRC.split('\n')

/** 用净化文本定位技能块边界（注释/字符串里的括号不算） */
function sanitize (ls) {
  let state = 'code', depth = 0
  const out = []
  for (const l of ls) {
    let s = ''
    for (let i = 0; i < l.length; i++) {
      const c = l[i], n = l[i + 1]
      if (state === 'line') { s += ' '; continue }
      if (state === 'block') { if (c === '*' && n === '/') { s += '  '; i++; state = 'code'; continue } s += ' '; continue }
      if (state === 'sq' || state === 'dq') {
        const q = state === 'sq' ? "'" : '"'
        if (c === '\\') { s += '  '; i++; continue }
        if (c === q) { state = 'code'; s += c; continue }
        s += ' '; continue
      }
      if (state === 'tpl') {
        if (c === '\\') { s += '  '; i++; continue }
        if (c === '`') { state = 'code'; s += '`'; continue }
        s += ' '; continue
      }
      if (c === '/' && n === '/') { state = 'line'; s += '  '; i++; continue }
      if (c === '/' && n === '*') { state = 'block'; s += '  '; i++; continue }
      if (c === "'") { state = 'sq'; s += c; continue }
      if (c === '"') { state = 'dq'; s += c; continue }
      if (c === '`') { state = 'tpl'; s += c; continue }
      s += c
    }
    if (state === 'line') state = 'code'
    out.push(s)
    for (const c of s) { if (c === '{') depth++; else if (c === '}') depth-- }
    out[out.length - 1] = s
  }
  return out
}
const clean = sanitize(lines)
const depthEnd = []
{
  let d = 0
  for (let i = 0; i < clean.length; i++) { for (const c of clean[i]) { if (c === '{') d++; else if (c === '}') d-- } depthEnd[i] = d }
}

// 找出所有技能块
const skillHead = /^\t{6}([A-Za-z_$][\w$]*):\s*\{\s*$/
const skills = []
for (let i = 0; i < lines.length; i++) {
  const m = skillHead.exec(lines[i])
  if (!m) continue
  const base = i === 0 ? 0 : depthEnd[i - 1]
  let end = -1
  for (let j = i + 1; j < lines.length; j++) if (depthEnd[j] === base) { end = j; break }
  if (end > i) skills.push({ name: m[1], start: i, end })
}

const report = []
const edits = []   // {lineIdx, newText}
for (const sk of skills) {
  const stepLines = []
  for (let j = sk.start; j <= sk.end; j++) {
    const m = /^(\s*)'step (\d+)'\s*$/.exec(lines[j])
    if (m && lines[j].indexOf("'step") === m[1].length) stepLines.push({ idx: j, indent: m[1], n: Number(m[2]) })
  }
  if (!stepLines.length) continue
  const orig = stepLines.map((s) => s.n)
  const contiguous = orig.every((n, k) => n === k)
  if (contiguous) continue                       // 已经连续，不动
  // gap 之后的步骤在引擎里根本没被编成 case：报出来
  const firstGapAfter = (() => { for (let k = 0; k < orig.length; k++) if (orig[k] !== k) return k; return -1 })()
  report.push(`  ${sk.name.padEnd(22)} 步骤 ${orig.join(',')} → ${orig.map((_, k) => k).join(',')}` +
    (firstGapAfter > 0 ? `   ⚠ 从第 ${firstGapAfter} 个起（旧号 ${orig[firstGapAfter]}）在引擎里没有 case` : ''))
  const map = new Map()
  stepLines.forEach((s, k) => map.set(s.n, k))
  // 改写 step 标签
  stepLines.forEach((s, k) => edits.push({ idx: s.idx, text: `${s.indent}'step ${k}'` }))
  // 改写 goto 目标
  for (let j = sk.start; j <= sk.end; j++) {
    if (!/event\.goto\(\s*\d+\s*\)/.test(lines[j])) continue
    edits.push({ idx: j, text: lines[j].replace(/event\.goto\(\s*(\d+)\s*\)/g, (full, d) => {
      const t = map.get(Number(d))
      return t === undefined ? full : `event.goto(${t})`
    }) })
  }
}

console.log(`文件：${FILE}`)
console.log(`技能块：${skills.length} 个`)
console.log(report.length ? '\n需要重排的技能：\n' + report.join('\n') : '\n所有技能的步骤号都已连续，无需改动。')

if (!report.length) process.exit(0)
if (!APPLY) { console.log('\n（只报告，未改写。加 --apply 真正写入）'); process.exit(0) }

// 应用（按行号倒序替换，避免索引漂移）
edits.sort((a, b) => b.idx - a.idx)
let out = lines.slice()
for (const e of edits) out[e.idx] = e.text
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
fs.copyFileSync(FILE, `${FILE}.bak-renumber-${stamp}`)
fs.writeFileSync(FILE, out.join('\n'), 'utf8')
console.log(`\n已写入（备份 ${FILE}.bak-renumber-${stamp}），共 ${edits.length} 处改动。`)
