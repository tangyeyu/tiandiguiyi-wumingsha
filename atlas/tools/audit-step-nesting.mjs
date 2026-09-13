// 检测"步骤标签嵌在块内部"的技能 —— 这是除"编号不连续"之外的第二类步骤机杀手。
//
// 规则：content 是 `content: function () {`，它的**函数体顶层**缩进是 8 个 tab。
//   'step N' 出现在 8 tab  → 顶层，合法
//   'step N' 出现在 >8 tab → 嵌在 if/else/for 等块里 ⇒ parsex 替换成 `break;case N:`
//                            时 break 落在块内 ⇒ 生成的代码非法 ⇒ 该处替换被跳过，
//                            步骤机错位（实测 C1 报 "Unexpected token 'case'"）。
//
//   node atlas/tools/audit-step-nesting.mjs extension/extension.js
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const lines = readFileSync(FILE, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''))

const head = /^\t{6}([A-Za-z_$][\w$]*):\s*\{\s*$/
const skills = []
for (let i = 0; i < lines.length; i++) {
  const m = head.exec(lines[i])
  if (!m) continue
  let end = lines.length - 1
  for (let j = i + 1; j < lines.length; j++) {
    if (head.test(lines[j])) { end = j - 1; break }
    if (/^\t{5}\},?\s*$/.test(lines[j])) { end = j; break }
  }
  skills.push({ name: m[1], start: i, end })
}

console.log(`技能块：${skills.length}\n`)
const bad = []
for (const sk of skills) {
  // 找 content 的起点，以其后第一个 'step' 的缩进作为"顶层缩进"的参照
  let contentLine = -1
  for (let j = sk.start; j <= sk.end; j++) {
    if (/^\t{7}content:\s*function\s*\(\s*\)\s*\{\s*$/.test(lines[j])) { contentLine = j; break }
  }
  if (contentLine < 0) continue
  const steps = []
  for (let j = contentLine + 1; j <= sk.end; j++) {
    const m = /^(\t+)'step (\d+)'\s*$/.exec(lines[j])
    if (m) steps.push({ line: j + 1, tabs: m[1].length, n: Number(m[2]) })
    // 内容函数结束（回到 7 tab 的 `},`）
    if (/^\t{7}\},?\s*$/.test(lines[j])) break
  }
  if (!steps.length) continue
  const base = 8          // content 函数体顶层缩进
  const nested = steps.filter((s) => s.tabs > base)
  if (nested.length) {
    bad.push({ name: sk.name, nested, all: steps })
  }
}

if (!bad.length) {
  console.log('✅ 没有发现嵌套的步骤标签。')
  process.exit(0)
}
console.log(`❌ 发现 ${bad.length} 个技能把步骤标签写在了块内部：\n`)
for (const b of bad) {
  console.log(`  ${b.name}   步骤 ${b.all.map((s) => s.n).join(',')}`)
  for (const n of b.nested) {
    console.log(`      ⚠ L${n.line}  'step ${n.n}'  缩进 ${n.tabs} tab（顶层应为 8）——嵌在块内`)
  }
}
console.log(`\n修法：把该步骤的代码改成"顶层判条件 + 在步骤内分派"，
即把嵌套的 if 提到步骤外层，用 `+ '`if (event.step …)` 或普通条件在每一步重新判一次。')
process.exit(1)
