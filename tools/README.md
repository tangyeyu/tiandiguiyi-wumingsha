# `tools/` —— 天地归一 扩展自身的验证套件

> 这四个工具是**这个扩展的"测试"**。本仓库没有测试框架，取而代之的是：
> 每个工具都是**词法/结构扫描**（`apply-machao-redesign.mjs` 例外，它写文件），
> **不执行目标代码**，所以可以在任何装了 Node 的机器上跑，不需要启动游戏。
>
> 背景约定见仓库根目录 `AGENTS.md` §三（**验证器必须先自校准**）：
> 只写正例不算验证 —— 必须能把 bug 人为放回去、让断言**失败**，否则是验证器坏了。

## 前置

只有 `verify-audio.mjs` 需要知道游戏装在哪（它要去读 `character/*.js` 和 `audio/skill/*.mp3`）：

```bash
# 三选一
node tools/verify-audio.mjs extension/extension.js --app "D:/某处/resources/app"
NONAME_APP="D:/某处/resources/app" node tools/verify-audio.mjs extension/extension.js
node tools/verify-audio.mjs extension/extension.js        # 用本机默认位置
```

路径找不到时**直接报错退出**（不静默跳过）。其余工具只需要扩展文件本身。

## 工具

| 工具 | 做什么 | 用法 |
|---|---|---|
| `verify-machao.mjs` | **极·马超 的 C1–C11 词法断言**：卡面文案不再提"距离加成"、必须体现三选一、`mx_cm` 由 `tdgx_turn_reset` 清零、驭雷触发键齐全、`drawN` 不得出现…… | `node tools/verify-machao.mjs <extension.js> [--label 名称]` |
| `verify-audio.mjs` | **台词接线实证核对**：逐个 `audio:'…'` 核「① 这字符串是真实技能名吗 → ② 该技能的 `audio` 字段是几 → ③ 对应 mp3 在磁盘上存在吗」，并顺带查角色 `[4]` 里的 `die:` 标签 | `node tools/verify-audio.mjs <extension.js> [--app <路径>]` |
| `compile-content.mjs` | 把引擎 `parsex` 的 **Legacy 分支逐字抄进来**，对指定技能的 `content` 做一次**真实编译**，打印生成的 `switch/case` 落点、每个 `'step N'` 的缩进、末步守卫 | `node tools/compile-content.mjs <extension.js> <技能名>` |
| `apply-machao-redesign.mjs` | **一次性历史生成器**：从 `40457f9` 那版输入可复现出极·马超的重制结果（字面量精确替换 + 命中数断言，不符即中止、不写文件） | `node tools/apply-machao-redesign.mjs <输入> <输出>` |

## 自校准（怎么证明这些工具不是摆设）

每个工具都在文件头写了自己的**正例与反例**。实际用到的反例：

```bash
# verify-machao：反例 = 重制前的仓库 HEAD 版 → 卡面文案 / 三选一 必须 FAIL
git show HEAD~N:extension/extension.js > /tmp/old.js
node tools/verify-machao.mjs /tmp/old.js

# verify-audio：反例 = 改语音之前的版本 → audio:'wuku' / audio:'shen_machao' 必须 FAIL
git show <改前提交>:extension/extension.js > /tmp/before.js
node tools/verify-audio.mjs /tmp/before.js
```

实测记录（2026-10-06）：

| 工具 | 反例结果 | 正例结果 |
|---|---|---|
| `verify-machao.mjs` | 草稿与仓库 HEAD 各 **2/11 FAIL** | **11/11 通过** |
| `verify-audio.mjs` | 改前版本 **2 项失败**（`wuku`、`rejizhi_lukang`） | 改后 **1 项失败**（只剩 `rejizhi_lukang`，已知未修项） |
| `compile-content.mjs` | 反例里 `case 1:` 落点错误可见 | `生成的 case 编号: 0, 1` |

## 改动后跑哪几个

| 改了什么 | 必须跑 |
|---|---|
| 任何技能实现 | `verify-machao.mjs`（若涉及马超）+ `check-encoding.mjs`（仓库根）+ `node --check` |
| 任何 `content` / `'step N'` | `compile-content.mjs`（**看清 case 落点**，别只看语法通不通） |
| 任何 `audio` / `die:` | `verify-audio.mjs` |
| 批量脚本生成/修改文件之后 | `check-encoding.mjs`（BOM / 行尾 / 语法 / 64KB 严格解码） |

## 相关文档

- [`docs/引擎开发手册.md`](../docs/引擎开发手册.md) **第 1 部分（硬规则清单）** —— 通用引擎契约（A–G 节），
  其中 **G 节**就是 `verify-audio.mjs` 所依据的语音解析链；写新技能前先看它的 A 节。
- [`docs/引擎开发手册.md`](../docs/引擎开发手册.md) **第 6 部分（极·马超重制档案）** —— 这些工具
  是在哪次改动里、为了抓什么 bug 写出来的，以及它们实际抓到了什么。
