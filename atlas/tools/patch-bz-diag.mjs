// 给部署目录的 extension.js 打「诸葛亮卡死」诊断补丁（可逆，自动备份）。
// 原理：在 bz_bingquan / bz_qingshi / bz_jiufa / bz_kongcheng 的每个步骤边界插一行
//   记录调用，把 (技能, 时机, 步骤, 当时兵数) 记进 window.game.__bzTrace。
// 这样卡住时把 __bzTrace 打出来，就能看到"最后记录到哪一步"——直接定位死点。
//
// ★★ 插桩必须只用 content 函数**自己的形参**（game / player / event）★★
//   第一版把工具函数声明在包级闭包里，结果游戏直接报
//   `Uncaught ReferenceError: trace is not defined`——
//   因为引擎是把 content 用 `new Function` 编译执行的（game.js:12131 Legacy），
//   闭包里的局部变量在运行时**看不到**。教训：content 里只能用它的形参 + 全局。
//
// 用法：node atlas/tools/patch-bz-diag.mjs [extension.js 路径]
// 还原：node atlas/tools/bz-diag.mjs off
import fs from 'node:fs'
import path from 'node:path'

const FILE = process.argv[2] || 'extension/extension.js'
if (!fs.existsSync(FILE)) { console.error('找不到文件：' + FILE); process.exit(2) }
const SRC = fs.readFileSync(FILE, 'utf8')

if (SRC.includes('__bzTrace')) { console.log('该文件已经打过诊断补丁（含 __bzTrace），跳过。'); process.exit(0) }

/* ── 在每个顶层 'step N' 之前插一行记录语句 ──
   只用 game / player / event 三个 content 形参，不依赖任何闭包变量。 */
function instrumentSkill (src, skillId, tnExpr) {
  const headRe = new RegExp(`\\n(\\t{6})${skillId}: \\{`)
  const m = headRe.exec(src)
  if (!m) return { src, count: 0 }
  const start = m.index
  const rest = src.slice(start + m[0].length)
  const endRel = rest.search(/\n\t{6}[A-Za-z_$][\w$]*: \{/)
  const end = endRel === -1 ? src.length : start + m[0].length + endRel
  const block = src.slice(start, end)
  let count = 0
  const out = block.replace(/\n(\t{8})'step (\d+)'/g, (full, indent, n) => {
    count++
    const line = `${indent}try { game.__bzTrace = game.__bzTrace || []; if (game.__bzTrace.length < 400) game.__bzTrace.push('${skillId}|' + (${tnExpr}) + '|step ${n}|兵=' + (player && player.countMark ? player.countMark('bz_bing') : '?')); } catch (e) { }`
    return `\n${line}\n${indent}'step ${n}'`
  })
  return { src: src.slice(0, start) + out + src.slice(end), count }
}

const jobs = [
  ['bz_bingquan', "event.triggername"],
  ['bz_qingshi', "event.triggername"],
  ['bz_jiufa', "'phaseBegin'"],
  ['bz_kongcheng', "event.triggername"],
]
let out = SRC
const report = []
for (const [id, tn] of jobs) {
  const r = instrumentSkill(out, id, tn)
  out = r.src
  report.push(`${id}: 插入 ${r.count} 处`)
}
if (report.every((r) => r.endsWith('0 处'))) { console.error('没有插入任何插桩，锚点可能不匹配'); process.exit(2) }

/* ── 备份 + 写入 ── */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const bak = `${FILE}.bak-diag-${stamp}`
fs.copyFileSync(FILE, bak)
fs.writeFileSync(FILE, out, 'utf8')

console.log('诊断补丁已写入：' + FILE)
console.log('备份（还原用）：' + bak)
console.log(report.join('  '))
console.log('\n下一步：重启游戏 → 用诸葛亮开一局 → 卡住时在控制台执行：')
console.log('   copy(JSON.stringify(game.__bzTrace))')
console.log('把复制到的内容发我。')
console.log('\n还原：node atlas/tools/bz-diag.mjs off')

