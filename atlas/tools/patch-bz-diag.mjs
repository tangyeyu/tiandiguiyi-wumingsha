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
    const base = `${indent}try { game.__bzTrace = game.__bzTrace || []; if (game.__bzTrace.length < 400) game.__bzTrace.push('${skillId}|' + (${tnExpr}) + '|step ${n}|引擎step=' + step + '|event.step=' + event.step + '|兵=' + (player && player.countMark ? player.countMark('bz_bing') : '?')); } catch (e) { }`
    const seq = `${indent}try { game.__bzStep = (game.__bzStep || 0) + 1; } catch (e) { }`
    // ★ 每个 'step N' 处都顺带冒一条气泡：这样**游戏一开始**就能看到反馈，
    //   不必等到末步。用于回答最关键的问题：这个技能的 content 到底有没有被执行。
    //   ★ 同时把引擎传进来的 `step`（第 2 个形参）与 event.step 都打出来：
    //     两者不一致 ⇒ event.goto() 改的不是主循环读的那个 step（goto 失效）；
    //     一致 ⇒ goto 没问题，是步骤分派没建立起来。
    const bubble = `${indent}try { if (player && player.say && (player === game.me || !lib.config.no_any_chat)) player.say('【BZ】${skillId} ' + (${tnExpr}) + ' 到 step ${n}（引擎传step=' + step + ' event.step=' + event.step + ' 兵' + (player && player.countMark ? player.countMark('bz_bing') : '?') + '）'); } catch (eb) { }`
    return `\n${base}\n${seq}\n${bubble}\n${indent}'step ${n}'`
  })
  // ★★ 汇总行放在**最后一个步骤的开头**，不是末尾！★★
  //   第一版插在最后一个步骤的 `event.finish(); return;` **之后** —— 那是死代码，
  //   虽然 node --check 能过（语法合法），但永远不会执行 ⇒ 战报/文件里什么都看不到。
  //   放在末步开头的好处：只要执行到最后一个步骤就一定会输出一行，
  //   于是"卡死时最后一行"既包含已走完的步数，也包含正在走的这一步。
  //
  // ★ 输出四条路，且**互不牵连**（前一条失败不影响后一条）：
  //   ① player.say —— 角色头顶气泡，游戏自己画的，**不依赖文件/控制台/面板**，最可靠
  //   ② game.log   —— 战报
  //   ③ 写文件写不进去由第 ④ 条兜住（上一版把错误吞在 catch 里，导致"文件不存在"
  //      这种反馈毫无信息量：appendFileSync 的失败原因必须回显出来）
  //   ④ player.say 回显写入失败原因
  if (count > 0) {
    const lastStepIdx = out.lastIndexOf("'step ")
    if (lastStepIdx !== -1) {
      const nl = out.indexOf('\n', lastStepIdx)
      const I = '\t'.repeat(9)
      const summary = `
${I}// ── BZ 诊断（多路输出，各自独立 try，互不牵连）──
${I}var _bzMsg = null, _bzErr = '';
${I}try {
${I}\tgame.__bzStep = (game.__bzStep || 0) + 1;
${I}\tgame.__bzTrace = game.__bzTrace || [];
${I}\tgame.__bzTrace.push('${skillId}|' + (${tnExpr}) + '|进入末步');
${I}\t_bzMsg = '【BZ】${skillId} ' + (${tnExpr}) + ' ' + game.__bzStep + '步:' + game.__bzTrace.join(' → ');
${I}\tgame.__bzStep = 0; game.__bzTrace = [];
${I}} catch (e0) { _bzMsg = '【BZ】统计失败:' + e0.message; }
${I}try { game.log(_bzMsg); } catch (e2) { }
${I}// 气泡是本地玩家专属通道：game.js:23419 对非 game.me 且开了 no_any_chat 时会静默 return，
${I}// 所以这里先判断"气泡到底会不会显示"，不会显示就走文件 + 把原因回报到战报。
${I}var _bzBubble = false;
${I}try { _bzBubble = !!(player && player.say && (player === game.me || !lib.config.no_any_chat)); } catch (e5) { }
${I}if (_bzBubble) { try { player.say(_bzMsg); } catch (e1) { _bzBubble = false; } }
${I}var _bzPaths = ['C:/bz-diag.log', 'C:/Users/luoti/Desktop/bz-diag.log', 'C:/Users/luoti/Desktop/dsh/bz-diag.log'];
${I}var _bzOk = false;
${I}for (var _bzI = 0; _bzI < _bzPaths.length && !_bzOk; _bzI++) {
${I}\ttry {
${I}\t\trequire('fs').appendFileSync(_bzPaths[_bzI], new Date().toLocaleTimeString() + '  ' + _bzMsg + '\\n');
${I}\t\t_bzOk = true;
${I}\t} catch (e3) { _bzErr += ' [' + _bzPaths[_bzI] + ': ' + e3.message + ']'; }
${I}}
${I}if (!_bzOk) { try { game.log('【BZ】所有路径都写不进去' + _bzErr); } catch (e6) { } }
${I}if (!_bzBubble && _bzOk) { try { game.log('【BZ】气泡通道不可用(非game.me或no_any_chat已开)，已写文件'); } catch (e7) { } }`
      out = out.slice(0, nl) + summary + out.slice(nl)
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
console.log('\n下一步：重启游戏 → 用诸葛亮开一局，然后看诸葛亮头顶的【BZ】气泡：')
console.log('  · **进游戏立刻就该冒一条**（roundStart 的 step 0），例如')
console.log('      【BZ】bz_bingquan roundStart 到 step 0（兵0）')
console.log('  · 之后每走到一个步骤都会再冒一条；卡住时**最后一条气泡就是死点**（它停在那儿不消失）')
console.log('  · 如果从头到尾一条都没有 ⇒ 这个技能的 content 根本没被执行，问题在触发/过滤层')
console.log('  · 气泡默认只有诸葛亮是"你"（game.me）时才显示；若你玩的是别的角色，')
console.log('    看 C:\\bz-diag.log 或右侧战报，两者内容相同')
console.log('把最后 5~8 条发我（截图即可）。')
console.log('\n还原：node atlas/tools/bz-diag.mjs off')

