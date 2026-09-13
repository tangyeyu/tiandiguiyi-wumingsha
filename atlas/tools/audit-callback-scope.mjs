// 检测 filter / ai / init / mod 等**非 content 回调**里是否引用了只存在于 content 的名字。
//
// 为什么需要（连续两次踩同一个坑）：
//   · filter 的形参只有 (event, player)；
//   · `trigger` 只在 **content** 里存在（引擎在 game.js:15553 设 next._trigger；
//     content 里还有 trigger 注入）；
//   · 在 filter 里写 `trigger` 会抛 ReferenceError，而引擎/UI 扩展会把异常吞掉，
//     后果是**技能静默失效**（不是报错停住，而是"什么都不发生"），极难发现。
//
//   node atlas/tools/audit-callback-scope.mjs extension/extension.js
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] || 'extension/extension.js'
const lines = readFileSync(FILE, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''))

// 每个技能块内，逐个回调字段收集其函数体文本
const head = /^\t{6}([A-Za-z_$][\w$]*):\s*\{\s*$/
const CALLBACKS = ['filter', 'ai', 'init', 'init2', 'check', 'onremove', 'oncancel', 'selectCard', 'checkTarget', 'filterCard', 'filterTarget', 'onsuccess', 'onuse']
// 这些名字只在 content 作用域里存在，绝不能在其它回调里裸用
const CONTENT_ONLY = ['trigger']
// 回调本身就有的形参（各回调不同，这里只求"不要裸用 content-only 名字"）
const SAFE_ARGS = {
  filter: ['event', 'player', 'target', 'targets', 'card', 'cards', 'skill', 'source'],
  ai: ['event', 'player', 'target', 'targets', 'card', 'cards', 'skill', 'source'],
  check: ['event', 'player', 'target', 'targets', 'card', 'cards', 'skill', 'source'],
  init: ['player', 'skill'],
  init2: ['player', 'skill'],
  onremove: ['player', 'skill'],
  oncancel: ['trigger', 'player'],   // ★ oncancel 是 (trigger, player) —— 官方惯例
  onuse: ['result', 'player', 'event'],
  onsuccess: ['result', 'player', 'event'],
  selectCard: ['card', 'player'],
  checkTarget: ['card', 'player', 'target'],
}

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

const problems = []
for (const sk of skills) {
  for (let i = sk.start; i <= sk.end; i++) {
    const m = /^\t{7}([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)\s*\{/.exec(lines[i])
    if (!m) continue
    const cb = m[1]
    if (!CALLBACKS.includes(cb)) continue
    const params = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    // 收集函数体（按大括号配对）
    let depth = 0, started = false, body = []
    for (let j = i; j <= sk.end; j++) {
      const l = lines[j]
      for (const c of l) { if (c === '{') { depth++; started = true } else if (c === '}') depth-- }
      body.push(l)
      if (started && depth <= 0) break
    }
    const text = body.join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')            // 去块注释（必须先于字符串，避免注释里的引号干扰）
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')       // 去行注释
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")        // 去字符串
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    for (const name of CONTENT_ONLY) {
      if (params.includes(name)) continue
      // 允许 trigger 出现在属性位置（x.trigger / trigger:）
      const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])\\s*(?!:)`, 'g')
      const hit = re.exec(text)
      if (hit) {
        problems.push({ skill: sk.name, cb, line: i + 1, name })
        break
      }
    }
  }
}

console.log(`文件：${FILE}   技能块：${skills.length}`)
if (!problems.length) {
  console.log('✅ 没有任何回调裸用 content-only 变量（trigger）。')
  process.exit(0)
}
console.log(`❌ 发现 ${problems.length} 处回调里裸用了 content-only 变量（会 ReferenceError + 静默失效）：`)
for (const p of problems) console.log(`  [${p.skill}] ${p.cb}() @L${p.line} 裸用 \`${p.name}\``)
process.exit(1)
