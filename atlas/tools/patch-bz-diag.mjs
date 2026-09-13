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

/* ── 在每个顶层 'step N' 之前插一行记录，并在技能末尾追加一行汇总 ──
   只用 game / player / event 三个 content 形参，不依赖任何闭包变量。
   为什么要"汇总一行"：卡死时战报就停在那儿，最后一行即死点；
   而每个技能一行汇总（而不是每步一行）不会把战报冲爆。 */
function instrumentSkill (src, skillId, tnExpr) {
  const headRe = new RegExp(`\\n(\\t{6})${skillId}: \\{`)
  const m = headRe.exec(src)
  if (!m) return { src, count: 0, summary: false }
  const start = m.index
  const rest = src.slice(start + m[0].length)
  const endRel = rest.search(/\n\t{6}[A-Za-z_$][\w$]*: \{/)
  const end = endRel === -1 ? src.length : start + m[0].length + endRel
  const block = src.slice(start, end)
  let count = 0
  let out = block.replace(/\n(\t{8})'step (\d+)'/g, (full, indent, n) => {
    count++
    const base = `${indent}try { game.__bzTrace = game.__bzTrace || []; if (game.__bzTrace.length < 400) game.__bzTrace.push('${skillId}|' + (${tnExpr}) + '|step ${n}|兵=' + (player && player.countMark ? player.countMark('bz_bing') : '?')); } catch (e) { }`
    const seq = `${indent}try { game.__bzStep = (game.__bzStep || 0) + 1; } catch (e) { }`
    return `\n${base}\n${seq}\n${indent}'step ${n}'`
  })
  // 汇总行：必须落在 **content 函数体内部**、最后一个 'step N' 之后。
  // 定位方式：取最后一个 'step N' 的位置，再往后找第一个单独成行的内容函数收尾
  // ——即 "\n\t\t\t\t\t\t\t}" （7 个 tab），它属于 content: function () { ... }。
  if (count > 0) {
    const lastStepIdx = out.lastIndexOf("'step ")
    const tail = out.slice(lastStepIdx)
    const closeRel = tail.search(/\n\t{7}\}/)
    if (closeRel !== -1) {
      const at = lastStepIdx + closeRel
      const summary = `\n\t\t\t\t\t\t\t\ttry { game.log('【BZ诊断·${skillId}】' + (${tnExpr}) + ' 共执行 ' + (game.__bzStep || 0) + ' 步 —— ' + (game.__bzTrace || []).slice(-6).join(' → ')); game.__bzStep = 0; game.__bzTrace = []; } catch (e) { }`
      out = out.slice(0, at) + summary + out.slice(at)
    }
  }
  return { src: src.slice(0, start) + out + src.slice(end), count, summary: count > 0 }
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
console.log('\n下一步：重启游戏 → 用诸葛亮开一局 →走到卡住那一刻，看游戏里的「战报」：')
console.log('  · 每次技能走完会有一行  【BZ诊断·技能名】时机 共执行 N 步 —— …')
console.log('  · **卡住时最后一行就是死点**；如果连一行都没有，说明死点不在诸葛亮这四个技能里')
console.log('把最后 5~8 行【BZ诊断】截图或抄给我即可（不需要 F12 控制台）。')
console.log('\n还原：node atlas/tools/bz-diag.mjs off')

