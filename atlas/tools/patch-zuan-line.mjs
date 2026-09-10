/*
 * patch-zuan-line.mjs —— 祖安武将「指示线」404 兜底补丁（v2）
 *
 * 问题：jingdianLineXy（经典）/ yulongLineXy（玉龙）两个风格目录里**只有 line.png**（线体），
 *       没有 0.png..7.png（线头帧序列）。而 zsPlayLineAnimation 用「名字里有没有 .」决定走
 *       静态图还是 8 帧序列 —— 这两个风格传的是纯目录名 → 被当成序列 → 每次画线 8 次 404。
 *
 * 补丁：把 `num_frame = 8;` 改成条件赋值 —— 该风格无帧序列时置 0，跳过线头帧请求。
 *       · 线体仍由后面的 div2 + line.png 正常绘制，特效功能不受影响
 *       · start() 只在 img.onload/onerror 回调里被调用；num_frame=0 时不会创建 img，
 *         因此 start() 永不执行，也就不会留下空转的 setInterval（无泄漏）
 *
 * v1 失败原因：v1 把插入点锚在 `var folder_frame = ...` 之后，但 5 处定义里
 * `num_frame = 8;` 与该行的先后顺序不一致，导致补丁插到了赋值之前、立刻被覆盖。
 * v2 直接改赋值本身，与顺序无关。
 *
 * 用法：node patch-zuan-line.mjs <祖安武将/extension.js> [--check] [--restore]
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.argv[2];
const CHECK = process.argv.includes('--check');
const RESTORE = process.argv.includes('--restore');
if (!FILE) { console.error('用法: node patch-zuan-line.mjs <extension.js> [--check] [--restore]'); process.exit(2); }

const MARK = '[zs-line-patch]';
const NOFRAME = "['jingdianLineXy', 'yulongLineXy'].indexOf(animation.image) != -1";
const RE = /^([ \t]*)num_frame = 8;[ \t]*$/;

if (RESTORE) {
  const dir = path.dirname(FILE);
  const baks = fs.readdirSync(dir).filter((f) => f.startsWith('extension.js.bak-')).sort();
  if (!baks.length) { console.error('找不到备份'); process.exit(1); }
  const src = path.join(dir, baks[0]);
  fs.copyFileSync(src, FILE);
  console.log(`已从 ${baks[0]} 恢复`);
  process.exit(0);
}

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

const hits = [];
const already = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf(MARK) !== -1) { already.push(i); continue; }
  if (RE.test(lines[i])) hits.push(i);
}

console.log(`文件：${FILE}`);
console.log(`待改 \`num_frame = 8;\` ${hits.length} 处：${hits.map((i) => i + 1).join(', ')}`);
console.log(`已打过补丁 ${already.length} 处`);

if (CHECK) { console.log('（--check 模式，不写入）'); process.exit(0); }
if (!hits.length) { console.log('无需修改'); process.exit(0); }

const bak = FILE + '.bak-' + new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
fs.copyFileSync(FILE, bak);
console.log(`已备份 -> ${path.basename(bak)}`);

for (const i of hits) {
  const indent = lines[i].match(/^([ \t]*)/)[1];
  lines[i] = indent + 'num_frame = (' + NOFRAME + ') ? 0 : 8; // ' + MARK
    + ' 该风格只有 line.png 线体、无数字帧序列，置 0 跳过线头帧请求以免 404 刷屏';
}

fs.writeFileSync(FILE, lines.join('\n'), 'utf8');
console.log(`已写入 ${hits.length} 处补丁，行数 ${src.split('\n').length} -> ${lines.length}`);
