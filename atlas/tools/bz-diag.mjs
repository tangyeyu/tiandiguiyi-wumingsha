// 「诸葛亮卡死」诊断补丁的开关（node 版；.ps1 被 PS5.1 的 GBK 读法搞坏过，故弃用）。
//
//   打补丁：node atlas/tools/bz-diag.mjs on
//   还原　：node atlas/tools/bz-diag.mjs off
//
// 补丁内容见 patch-bz-diag.mjs 头注：在诸葛亮各技能的每个步骤边界插 trace，
// 轨迹记入 window.game.__bzTrace；卡住时打印它即可看到"最后执行到哪一步"。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DEST = 'C:\\Users\\luoti\\Desktop\\三国杀·琉璃版5.5【电脑版】（修复清正）\\resources\\app\\extension\\天地归一'
const target = path.join(DEST, 'extension.js')
const action = (process.argv[2] || '').toLowerCase()

if (!fs.existsSync(DEST)) { console.error('找不到部署目录：' + DEST); process.exit(2) }

if (action === 'on') {
  execFileSync(process.execPath, [path.join(here, 'patch-bz-diag.mjs'), target], { stdio: 'inherit' })
} else if (action === 'off') {
  const baks = fs.readdirSync(DEST)
    .filter((n) => n.startsWith('extension.js.bak-diag-'))
    .map((n) => ({ n, t: fs.statSync(path.join(DEST, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (!baks.length) { console.error('找不到 extension.js.bak-diag-*，无法还原'); process.exit(2) }
  fs.copyFileSync(path.join(DEST, baks[0].n), target)
  console.log(`已还原：${baks[0].n}  ->  extension.js`)
} else {
  console.log('用法：node atlas/tools/bz-diag.mjs on|off')
  process.exit(1)
}
