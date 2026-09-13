// 检测**同一张对象表内**的重复键（translate / skill / character 各自独立）。
//
// 为什么需要：JS 对象重复键不报错，后者静默覆盖前者 —— 表现为"某条译名/技能莫名失效"。
// 本次编辑就误产生过一次 `'bz_kongcheng'` 重复。
// ★ 第一版按"整文件 6-tab 层"去重，把 character / translate / characterIntro 三张表的
//   同名键（同一个人名出现在三张表里是正常的）全判成重复，误报 104 处 —— 已修正为按表分组。
//
//   node atlas/tools/audit-dup-keys.mjs extension/extension.js
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const lines = readFileSync(FILE, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''))

// 先切出所有"5 tab 开头的表头"作为分组边界
const tables = []
for (let i = 0; i < lines.length; i++) {
  const m = /^\t{5}([A-Za-z_$][\w$]*)\s*:\s*\{\s*$/.exec(lines[i])
  if (m) tables.push({ name: m[1], start: i })
}
for (let i = 0; i < tables.length; i++) tables[i].end = (i + 1 < tables.length ? tables[i + 1].start - 1 : lines.length - 1)

let total = 0
const dups = []
for (const t of tables) {
  const seen = new Map()
  let count = 0
  for (let i = t.start + 1; i <= t.end; i++) {
    const m = /^\t{6}('[^']+'|"[^"]+"|[A-Za-z_$][\w$]*)\s*:/.exec(lines[i])
    if (!m) continue
    count++
    const key = m[1].replace(/^['"]|['"]$/g, '')
    if (seen.has(key)) dups.push({ table: t.name, key, first: seen.get(key), second: i + 1 })
    else seen.set(key, i + 1)
  }
  total += count
  if (count) console.log(`  表 ${t.name.padEnd(18)} L${t.start + 1}~L${t.end + 1}  键 ${count} 个`)
}

console.log(`\n文件：${FILE}，共 ${tables.length} 张表 / ${total} 个键`)
if (!dups.length) {
  console.log('✅ 没有表内重复键。')
  process.exit(0)
}
console.log(`❌ 发现 ${dups.length} 处**表内**重复键（后者静默覆盖前者）：`)
for (const d of dups) console.log(`  [${d.table}] ${d.key}   L${d.first}  ←→  L${d.second}`)
process.exit(1)
