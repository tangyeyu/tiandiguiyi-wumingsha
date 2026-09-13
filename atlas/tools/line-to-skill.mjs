// 把行号映射到所属技能名（用于把 parsex-audit 的报告落到具体技能上）
import { readFileSync } from 'node:fs'
const FILE = process.argv[2] || 'extension/extension.js'
const targets = process.argv.slice(3).map(Number)
const lines = readFileSync(FILE, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''))
const head = /^\t{6}([A-Za-z_$][\w$]*):\s*\{\s*$/
const heads = []
for (let i = 0; i < lines.length; i++) {
  const m = head.exec(lines[i])
  if (m) heads.push({ name: m[1], line: i + 1 })
}
for (const t of targets) {
  let owner = '(未找到)'
  for (const h of heads) if (h.line <= t) owner = h.name; else break
  const steps = []
  for (let j = 0; j < lines.length; j++) {
    const m = /^\s+'step (\d+)'\s*$/.exec(lines[j])
    if (m && j + 1 >= (heads.find((h) => h.name === owner) || {}).line) {
      const own = heads.filter((h) => h.line <= j + 1).pop()
      if (own && own.name === owner) steps.push(Number(m[1]))
    }
  }
  console.log(`L${t}  →  ${owner}   步骤号: ${steps.join(',')}`)
}
