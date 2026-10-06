// ============================================================
// 只读诊断：把游戏引擎的 parsex（Legacy 分支）原样抄过来，
// 对 mx_shenwei / mx_yulei 的 content 做一次真实编译，打印生成的 switch/case 结构。
// 目的是看清「两个 'step 1'」到底被编成了什么。
// 不修改任何文件。
// ============================================================

import fs from 'node:fs';

const file = process.argv[2];
const skillName = process.argv[3];
if (!file || !skillName) {
  console.error('用法: node compile_content.mjs <extension.js> <skill名>');
  process.exit(2);
}
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// ── 取某技能的源码块（缩进配平）────────────────────────────
function skillBlock(name) {
  const start = text.search(new RegExp(`^\\t{6}${name}: \\{`, 'm'));
  if (start < 0) throw new Error('找不到技能 ' + name);
  let i = text.indexOf('{', start), d = 0;
  for (let k = i; k < text.length; k++) {
    if (text[k] === '{') d++;
    else if (text[k] === '}') { d--; if (d === 0) return text.slice(start, k + 1); }
  }
  throw new Error('配平失败');
}

// ── 从技能块里取 content: function ... { ... } 的完整源码 ──
function contentSource(block) {
  const m = block.match(/(?:^|\n)(\t+)content: function \([^)]*\) \{/);
  if (!m) throw new Error('找不到 content');
  const start = block.indexOf(m[0].trim(), m.index);
  const src = block.slice(start);
  let i = src.indexOf('{'), d = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(0, k + 1); }
  }
  throw new Error('content 配平失败');
}

// ── 引擎 game.js:12094-12133 的 Legacy 算法（逐字照抄）────────
function Legacy(func) {
  var str = func.toString().replace(/((?:(?:^[ \t]*)?(?:\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/(?:[ \t]*\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/)))?|\/\/(?:[^\\]|\\(?:\r?\n)?)*?(?:\r?\n(?=[ \t]*(?:\r?\n|\/\*|\/\/))|(?=\r?\n))))+)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:\r?\n|[\s\S])[^\/"'\\\s]*)/mg, '$2').trim();
  str = str.slice(str.indexOf('{') + 1);
  if (str.indexOf('step 0') == -1) {
    str = '{if(event.step==1) {event.finish();return;}\n' + str;
  } else {
    var skip = 0;
    for (var k = 0; k < 99; k++) {
      var reg = new RegExp(`['"]step ${k}['"]`);
      var result = str.slice(skip).match(reg);
      if (result == null) break;
      var insertStr;
      if (k == 0) insertStr = `switch(step){case 0:`;
      else insertStr = `break;case ${k}:`;
      var copy = str;
      copy = copy.slice(0, skip + result.index) + insertStr + copy.slice(skip + result.index + result[0].length);
      try {
        new Function(copy);
        str = copy;
        skip += result.index + insertStr.length;
      } catch (error) {
        k--;
        skip += result.index + result[0].length;
      }
    }
    str = `if(event.step==${k}){event.finish();return;}` + str;
  }
  return str;
}

const block = skillBlock(skillName);
const src = contentSource(block);

console.log(`===== ${skillName} content 源码里的 'step N' 出现情况 =====`);
const steps = src.match(/'step \d+'/g) || [];
console.log('  出现顺序: ' + (steps.join(', ') || '(无)'));
// 每处 step 的缩进层级
const lines = src.split('\n');
for (const [i, ln] of lines.entries()) {
  const m = ln.match(/^(\t*)'step (\d+)'/);
  if (m) console.log(`  第 ${i + 1} 行: 缩进 ${m[1].length} 个 tab  'step ${m[2]}'`);
}

console.log(`\n===== 引擎实际编译出的函数体（前 60 行）=====`);
const fn = eval('(' + src.replace(/^content:\s*/, '') + ')');
const compiled = Legacy(fn);
const out = compiled.split('\n');
out.slice(0, 60).forEach((l, i) => console.log(String(i + 1).padStart(3) + ' | ' + l));

console.log(`\n===== 编译器落点检查 =====`);
const cases = [...compiled.matchAll(/case (\d+):/g)].map((m) => Number(m[1]));
console.log('  生成的 case 编号: ' + cases.join(', '));
const leftover = compiled.match(/['"]step \d+['"]/g);
console.log('  未被编译、仍是惰性字符串的 step: ' + (leftover ? leftover.join(', ') : '(无)'));
const guard = compiled.match(/^if\(event\.step==(\d+)\)/);
console.log('  末步守卫: event.step==' + (guard ? guard[1] : '?'));
