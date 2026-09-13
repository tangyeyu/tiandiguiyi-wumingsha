// 给部署目录的 extension.js 打「诸葛亮卡死」诊断补丁（可逆，自动备份）。
// 原理：在 bz_bingquan / bz_qingshi / bz_jiufa / bz_kongcheng 的每个步骤边界插一行
//   trace 调用，把 (技能, 时机, 步骤, 当时兵数) 记进 window.game.__bzTrace。
// 这样卡住时把 __bzTrace 打出来，就能看到"最后记录到哪一步"——直接定位死点。
//
// 用法：node atlas/tools/patch-bz-diag.mjs [extension.js 路径]
// 还原：把同目录生成的 extension.js.bak-diag-* 改回 extension.js
import fs from 'node:fs'
import path from 'node:path'

const FILE = process.argv[2] || 'extension/extension.js'
if (!fs.existsSync(FILE)) { console.error('找不到文件：' + FILE); process.exit(2) }
const SRC = fs.readFileSync(FILE, 'utf8')

if (SRC.includes('__bzTrace')) { console.log('该文件已经打过诊断补丁（含 __bzTrace），跳过。'); process.exit(0) }

/* ── 1) 注入 trace 工具函数（放在包级闭包辅助区） ── */
const HELPER_ANCHOR = '\t\t\t\tvar isSoul = function (p) {'
if (!SRC.includes(HELPER_ANCHOR)) { console.error('找不到注入锚点（isSoul）'); process.exit(2) }
const HELPER = `\t\t\t\t// ★ 诊断：把技能步骤轨迹记到 window.game.__bzTrace（卡死定位用，排查完请还原）
\t\t\t\tvar trace = function (skill, tn, step, player) {
\t\t\t\t\ttry {
\t\t\t\t\t\tvar g = (typeof window !== 'undefined' && window.game) ? window.game : game;
\t\t\t\t\t\tif (!g.__bzTrace) g.__bzTrace = [];
\t\t\t\t\t\tif (g.__bzTrace.length < 400) {
\t\t\t\t\t\t\tg.__bzTrace.push(skill + '|' + tn + '|step ' + step + '|兵=' + (player && player.countMark ? player.countMark('bz_bing') : '?'));
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t\tcatch (e) { }
\t\t\t\t};
${HELPER_ANCHOR}`

/* ── 2) 在每个 'step N' 之前插 trace（按技能区分） ── */
// 以技能对象为界切段，再在段内每个顶层 'step N' 前插入。
function instrumentSkill (src, skillId, tnExpr) {
  const headRe = new RegExp(`\\n(\\t{6})${skillId}: \\{`)
  const m = headRe.exec(src)
  if (!m) return { src, count: 0 }
  const start = m.index
  // 技能块结束 = 下一个 6 tab 的键
  const rest = src.slice(start + m[0].length)
  const endRel = rest.search(/\n\t{6}[A-Za-z_$][\w$]*: \{/)
  const end = endRel === -1 ? src.length : start + m[0].length + endRel
  let block = src.slice(start, end)
  let count = 0
  block = block.replace(/\n(\t{8})'step (\d+)'/g, (full, indent, n) => {
    count++
    return `\n${indent}trace('${skillId}', ${tnExpr}, ${n}, player);\n${indent}'step ${n}'`
  })
  return { src: src.slice(0, start) + block + src.slice(end), count }
}

const jobs = [
  ['bz_bingquan', "event.triggername"],
  ['bz_qingshi', "event.triggername"],
  ['bz_jiufa', "'phaseBegin'"],
  ['bz_kongcheng', "event.triggername"],
]
let out = SRC
out = out.replace(HELPER_ANCHOR, HELPER)
const report = []
for (const [id, tn] of jobs) {
  const r = instrumentSkill(out, id, tn)
  out = r.src
  report.push(`${id}: 插入 ${r.count} 处`)
}
if (report.every((r) => r.endsWith('0 处'))) { console.error('没有插入任何插桩，锚点可能不匹配'); process.exit(2) }

/* ── 3) 备份 + 写入 ── */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const bak = `${FILE}.bak-diag-${stamp}`
fs.copyFileSync(FILE, bak)
fs.writeFileSync(FILE, out, 'utf8')

console.log('诊断补丁已写入：' + FILE)
console.log('备份（还原用）：' + bak)
console.log(report.join('  '))
console.log('\n下一步：重启游戏 → 用诸葛亮开一局 → 卡住时在开发者控制台执行：')
console.log('   copy(JSON.stringify(game.__bzTrace))')
console.log('把复制到的内容发我。')
console.log('\n还原：把 "' + path.basename(bak) + '" 改名回 "extension.js"')
