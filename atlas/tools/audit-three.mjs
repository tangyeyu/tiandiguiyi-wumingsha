// 三将技能现状清点：步骤号 / goto / 状态位 / 临时技闸门 / 静默标志
//   node atlas/tools/audit-three.mjs extension/extension.js
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const SRC = readFileSync(FILE, 'utf8')
const lines = SRC.split('\n').map((l) => l.replace(/\r$/, ''))

// 目标技能（三将的卡面技能 + 其子技能）
const PREFIX = ['bz_', 'mzy_', 'mpx_']
// 找出每个技能块
const head = /^\t{6}([A-Za-z_$][\w$]*):\s*\{\s*$/
const blocks = []
for (let i = 0; i < lines.length; i++) {
  const m = head.exec(lines[i])
  if (!m) continue
  if (!PREFIX.some((p) => m[1].startsWith(p))) continue
  // 块结束：下一个 6-tab 键 或 数组收尾
  let end = lines.length - 1
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\t{6}[A-Za-z_$][\w$]*:\s*\{\s*$/.test(lines[j])) { end = j - 1; break }
    if (/^\t{5}\},?\s*$/.test(lines[j])) { end = j; break }
  }
  blocks.push({ name: m[1], start: i, end })
}

console.log(`三将相关技能块：${blocks.length} 个\n`)
const rows = []
for (const b of blocks) {
  const text = lines.slice(b.start, b.end + 1).join('\n')
  const steps = []
  for (let j = b.start; j <= b.end; j++) {
    const m = /^\s+'step (\d+)'\s*$/.exec(lines[j])
    if (m) steps.push(Number(m[1]))
  }
  const contiguous = steps.length === 0 || steps.every((n, k) => n === k)
  const gotos = []
  for (let j = b.start; j <= b.end; j++) {
    const m = /event\.goto\(\s*(\d+)\s*\)/.exec(lines[j])
    if (m) gotos.push(Number(m[1]))
  }
  const hasTrigger = /\btrigger\s*:/.test(text)
  const hasContent = /\bcontent\s*:/.test(text)
  const silent = /popup\s*:\s*false/.test(text)
  const forced = /forced\s*:\s*true/.test(text)
  const direct = /direct\s*:\s*true/.test(text)
  const gates = [...text.matchAll(/addTempSkill\('([\w$]+)'/g)].map((m) => m[1])
  const initFn = /\binit\s*:/.test(text)
  rows.push({ b, steps, contiguous, gotos, hasTrigger, hasContent, silent, forced, direct, gates, initFn })
}

const fmt = (s) => (s.length ? s.join(',') : '—')
console.log('技能'.padEnd(20) + '步骤'.padEnd(18) + '连续  goto      静默  forced direct init  临时技')
for (const r of rows) {
  const flags = [
    r.contiguous ? ' ✓  ' : ' ✗  ',
    (r.gotos.length ? fmt(r.gotos) : '—').padEnd(9),
    (r.silent ? 'Y' : '-').padEnd(4),
    (r.forced ? 'Y' : '-').padEnd(7),
    (r.direct ? 'Y' : '-').padEnd(7),
    (r.initFn ? 'Y' : '-').padEnd(5),
    r.gates.length ? r.gates.join(',') : '—',
  ].join(' ')
  console.log(r.b.name.padEnd(20) + fmt(r.steps).padEnd(18) + flags)
}

const bad = rows.filter((r) => !r.contiguous)
console.log(`\n步骤号不连续：${bad.length} 个 —— ${bad.map((r) => r.b.name).join(', ')}`)
const risky = rows.filter((r) => r.hasTrigger && r.hasContent && !r.forced && !/\benable\s*:/.test(lines.slice(r.b.start, r.b.end + 1).join('\n')))
console.log(`trigger+content 但非 forced（高频时机需复核）：${risky.length} 个 —— ${risky.map((r) => r.b.name).join(', ')}`)
const gateUsers = rows.filter((r) => r.gates.length)
console.log(`用临时技当闸门：${gateUsers.length} 个 —— ${gateUsers.map((r) => `${r.b.name}(${r.gates.join('/')})`).join(', ')}`)
