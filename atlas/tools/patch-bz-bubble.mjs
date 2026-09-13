// 诊断气泡 v2：把「到底哪个 event 打到了 filter」和「技能在不在身上」都冒出来。
// 每条都带玩家名（诸葛亮 即可），文本尽量短。
//
//   node atlas/tools/patch-bz-bubble.mjs <部署目录的 extension.js>
//   node atlas/tools/bz-diag.mjs off
import fs from 'node:fs'

const FILE = process.argv[2]
if (!FILE || !fs.existsSync(FILE)) { console.error('用法：node atlas/tools/patch-bz-bubble.mjs <extension.js>'); process.exit(2) }
let SRC = fs.readFileSync(FILE, 'utf8')
if (SRC.includes('【KZ】')) { console.log('已打过气泡补丁，跳过。'); process.exit(0) }

/** 冒气泡。带玩家名，短文本。 */
const bubble = (expr) =>
  `try { var _me = (typeof game !== 'undefined' && game.me) ? game.me : null; if (player && player.say && (!_me || player === _me)) player.say('【KZ】' + (${expr})); } catch (_eb) { }`

function bubbleBefore (src, needle, expr, label) {
  const idx = src.indexOf(needle)
  if (idx === -1) { console.error(`!! 锚点不匹配：${label}`); process.exit(2) }
  const lineStart = src.lastIndexOf('\n', idx) + 1
  const indent = /^\s*/.exec(src.slice(lineStart))[0]
  return src.slice(0, lineStart) + indent + bubble(expr) + '\n' + src.slice(lineStart)
}
function bubbleAfterBrace (src, needle, expr, label) {
  // 在含 needle 的那一行之后插入
  const idx = src.indexOf(needle)
  if (idx === -1) { console.error(`!! 锚点不匹配：${label}`); process.exit(2) }
  const lineEnd = src.indexOf('\n', idx) + 1
  const lineStart = src.lastIndexOf('\n', idx) + 1
  const indent = /^\s*/.exec(src.slice(lineStart))[0]
  return src.slice(0, lineEnd) + indent + bubble(expr) + '\n' + src.slice(lineEnd)
}

/* 空城 filter：把 event 的真实身份也报出来 */
SRC = bubbleBefore(SRC,
  `// 阴（storage=false）：发动技能后摸一张`,
  "'[空]evt=' + (event && event.name) + ' tn=' + (event && event.triggername) + ' 阴=' + player.storage.bz_kongcheng + ' 手=' + player.countCards('h')",
  '空城 filter')

/* 空城 init：确认初始化跑过、以及技能是否在身上 */
SRC = bubbleAfterBrace(SRC,
  "if (typeof player.storage.bz_kongcheng != 'boolean') player.storage.bz_kongcheng = false;",
  "'[空]init 阴=' + player.storage.bz_kongcheng",
  '空城 init')

/* 兵权 roundStart：确认 roundStart / phaseBegin 时机是否送到，以及技能持有情况 */
SRC = bubbleBefore(SRC,
  `player.storage.bz_ask_seat = 0;`,
  "'[权]roundStart 权=' + player.hasSkill('bz_bingquan') + ' 势=' + player.hasSkill('bz_qingshi') + ' 兵=' + player.countMark('bz_bing')",
  '兵权 roundStart')

/* ★ 关键判据：把诸葛亮**实际持有的技能清单**（getSkills 含 tempSkills/additionalSkills）冒出来。
   这一条能直接回答"情势到底在不在身上"。 */
SRC = bubbleBefore(SRC,
  `player.storage.bz_ask_seat = 0;`,
  "'[权]持有技能=' + (player.getSkills ? player.getSkills().join('/') : '无getSkills')",
  '兵权 roundStart 技能清单')

SRC = bubbleBefore(SRC,
  `var g14 = player.storage.bz_bing_carry;`,
  "'[权]phaseBegin 权=' + player.hasSkill('bz_bingquan') + ' 势=' + player.hasSkill('bz_qingshi') + ' 兵=' + player.countMark('bz_bing') + ' carry=' + player.storage.bz_bing_carry",
  '兵权 phaseBegin')

/* 兵权 phaseBegin 之后的技能清单（转职是否真的换过来了） */
SRC = bubbleBefore(SRC,
  `var g14 = player.storage.bz_bing_carry;`,
  "'[权]phaseBegin前技能=' + (player.getSkills ? player.getSkills().join('/') : '-')",
  '兵权 phaseBegin 技能清单')

/* 情势 filter：event 身份 + 闸门 */
SRC = bubbleBefore(SRC,
  `if ((player.storage.bz_qs_opts || 0) >= 2) return false;`,
  "'[势]evt=' + (event && event.name) + ' tn=' + (event && event.triggername) + ' 牌=' + (event && event.card ? get.translation(event.card) : '-') + ' opts=' + player.storage.bz_qs_opts + ' used=' + player.storage.bz_qs_used",
  '情势 filter')

/* 情势 phaseBegin：摸牌前 */
SRC = bubbleBefore(SRC,
  `player.draw(qx);`,
  "'[势]phaseBegin摸' + qx + ' 兵=' + player.countMark('bz_bing')",
  '情势摸牌')

/* 情势 init：确认拿到情势时初始化跑过 */
SRC = bubbleAfterBrace(SRC,
  `if (typeof player.storage.bz_qs_used != 'number') player.storage.bz_qs_used = 0;`,
  "'[势]init opts=' + player.storage.bz_qs_opts + ' used=' + player.storage.bz_qs_used",
  '情势 init')

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
fs.copyFileSync(FILE, `${FILE}.bak-bub-${stamp}`)
fs.writeFileSync(FILE, SRC, 'utf8')
console.log('气泡诊断 v2 已写入：' + FILE)
console.log('备份：' + `${FILE}.bak-bub-${stamp}`)
console.log(`插桩点：${(SRC.match(/【KZ】/g) || []).length} 处`)
