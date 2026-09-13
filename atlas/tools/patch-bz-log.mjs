// 给部署副本打「情势/空城 为什么没触发」的运行时日志（可逆）。
// 做法：按**内容行**逐条替换（不靠整块缩进匹配，第一版就是死在这上面）。
// 只在 filter / content 入口追加一行写 C:\bz-diag.log，不改任何逻辑。
//
//   node atlas/tools/patch-bz-log.mjs <部署目录的 extension.js>
//   node atlas/tools/bz-diag.mjs off      # 还原
import fs from 'node:fs'

const FILE = process.argv[2]
if (!FILE || !fs.existsSync(FILE)) { console.error('用法：node atlas/tools/patch-bz-log.mjs <extension.js>'); process.exit(2) }
let SRC = fs.readFileSync(FILE, 'utf8')
if (SRC.includes('__bzLog')) { console.log('已打过日志补丁，跳过。'); process.exit(0) }

const logStmt = (tag, expr) =>
  `try { game.__bzLog = game.__bzLog || []; var _s = '${tag} ' + (${expr}); if (game.__bzLog.length < 500) game.__bzLog.push(_s); try { require('fs').appendFileSync('C:/bz-diag.log', new Date().toLocaleTimeString() + '  ' + _s + '\\n'); } catch (_e1) { } } catch (_e2) { }`

/** 在包含 needle 的行**之前**插入一条日志（保留原缩进） */
function logBefore (src, needle, tag, expr, label) {
  const idx = src.indexOf(needle)
  if (idx === -1) { console.error(`!! 锚点不匹配：${label}`); process.exit(2) }
  const lineStart = src.lastIndexOf('\n', idx) + 1
  const indent = /^\s*/.exec(src.slice(lineStart))[0]
  return src.slice(0, lineStart) + indent + logStmt(tag, expr) + '\n' + src.slice(lineStart)
}

/* 空城：init / filter（在判定前插一条，记下时机与状态）/ content 入口 */
SRC = logBefore(SRC,
  "if (typeof player.storage.bz_kongcheng != 'boolean') player.storage.bz_kongcheng = false;",
  '[空城init]', "'阴=' + player.storage.bz_kongcheng", '空城 init')

SRC = logBefore(SRC,
  `// 阴（storage=false）：发动技能后摸一张`,
  '[空城filter]', "'时机=' + event.triggername + ' 阴=' + player.storage.bz_kongcheng + ' 手牌=' + player.countCards('h') + ' 在场=' + player.isIn()", '空城 filter 入口')

/* 情势：phaseBegin 入口 / filter 判定 / 摸牌处 */
SRC = logBefore(SRC,
  `// 每回合把「本回合」的两个闸门一起清零：`,
  '[情势phaseBegin]', "'进入时机=' + event.triggername", '情势 phaseBegin')

SRC = logBefore(SRC,
  `if ((player.storage.bz_qs_opts || 0) >= 2) return false;`,
  '[情势filter]', "'评估 opts=' + player.storage.bz_qs_opts + ' used=' + player.storage.bz_qs_used + ' gained=' + player.storage.bz_qs_gained + ' 兵=' + player.countMark('bz_bing') + ' 牌=' + get.translation(event.card)", '情势 filter')

SRC = logBefore(SRC,
  `player.draw(qx);`,
  '[情势摸牌]', "'摸' + qx + ' 张（兵=' + player.countMark('bz_bing') + '）'", '情势摸牌')

/* 兵权：roundStart 起点 / phaseBegin 转职判定处 */
SRC = logBefore(SRC,
  `player.storage.bz_ask_seat = 0;`,
  '[兵权roundStart]', "'开始 asked=' + player.storage.bz_ask_seat + ' 有兵权=' + player.hasSkill('bz_bingquan') + ' 有情势=' + player.hasSkill('bz_qingshi')", '兵权 roundStart')

SRC = logBefore(SRC,
  `var g14 = player.storage.bz_bing_carry;`,
  '[兵权phaseBegin]', "'兵=' + player.countMark('bz_bing') + ' carry=' + player.storage.bz_bing_carry + ' 有兵权=' + player.hasSkill('bz_bingquan') + ' 有情势=' + player.hasSkill('bz_qingshi')", '兵权 phaseBegin')

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
fs.copyFileSync(FILE, `${FILE}.bak-log-${stamp}`)
fs.writeFileSync(FILE, SRC, 'utf8')
const n = (SRC.match(/__bzLog/g) || []).length
console.log('日志补丁已写入：' + FILE)
console.log('备份：' + `${FILE}.bak-log-${stamp}`)
console.log(`插桩点：${n} 处`)
console.log('\n下一步：重启游戏 → 用诸葛亮开一局（用两张锦囊、发动几次技能）→ 打开 C:\\bz-diag.log')
console.log('还原：node atlas/tools/bz-diag.mjs off')
