# atlas/tools · 武将扩展工具链

面向**无名杀 · 琉璃版 5.5** 的武将包静态分析工具。所有工具都只依赖 Node 内置模块，
无 npm 依赖，无硬编码绝对路径。

核心目标：把「**游戏照常启动、日志干干净净、技能就是不生效**」这一类问题，
在写代码阶段就静态抓出来。

---

## 快速开始

```bash
# ① 建索引（只需在游戏版本更新后跑一次）
node atlas/tools/index-packs.mjs "<游戏>/resources/app/character" atlas/index

# ② 体检你的扩展 —— 一条命令跑完九项
node atlas/tools/lint-extension.mjs extension/extension.js \
     --app "<游戏>/resources/app" \
     --index atlas/index

# ③ 更严格的 CI 用法：WARN 也算失败 + 机器可读
node atlas/tools/lint-extension.mjs extension/extension.js --app <app> --index atlas/index --strict --json
```

`<游戏>` 指 `C:\Users\<你>\Desktop\三国杀·琉璃版5.5【电脑版】（修复清正）` 之类。

---

## 工具体系

### 入口

| 工具 | 说明 |
|---|---|
| **`lint-extension.mjs`** | ★ **统一体检入口**，九项检查一次跑完，带退出码与 JSON 输出 |
| `verify-extension.mjs` | C1 专项视图（只查双分支编译），输出更细的逐字段表格 |
| `mock-load.mjs` | 离线 mock 加载扩展，复刻引擎注册链，断言 `lib.character` / `lib.skill` / `lib.translate` 的落地结果 |

### 索引（体检的下游数据基础）

| 工具 | 说明 |
|---|---|
| `index-packs.mjs` | 词法扫描 `character/` 下全部武将包 → `packs.json` / `packs.md` |
| `classify-skills.mjs` | 37 项特征普查 → `census.*` / `samples.md` |
| `check-collisions.mjs` | 命名空间体检：技能名重复 / 武将 id 重复 / 悬空引用 / 孤儿技能 → `collisions.*` |
| `extract-skill.mjs` | 按 `包:技能` 抽单个技能源码，便于精读 |

### 专项

| 工具 | 说明 |
|---|---|
| **`idiom.mjs`** | ★ **范式抽取器**：从全库 5000+ 个技能里挖「做 X 的标准写法」 |
| `parsex-audit.mjs` | 全库扫描 `content` 的 `step` 残留（**只建模 else 分支**） |
| `parsex-probe.mjs` | 单个技能的 parsex 替换轨迹 |
| `sim-content.mjs` | 复刻分支判定 + 真跑 generator |
| `liuli-content-support.mjs` | 8 种 content 写法的双分支支持矩阵 |

### 视觉（兜底）

| 工具 | 说明 |
|---|---|
| `see.ps1` + `see-prompts.json` | 用本地 llama.cpp 的 Qwen2-VL 看图。**仅当模型路由切到非视觉模型时使用** —— 原生 `read_image` 精度远高于 2B 本地模型 |

### 写操作（不属于只读体检）

| 工具 | 说明 |
|---|---|
| `patch-zuan-line.mjs` | 祖安武将指示线 404 补丁 / 还原（原地改文件，自动备份） |

### 共享库

| 文件 | 说明 |
|---|---|
| **`parsex-model.mjs`** | ★ 双分支 parsex 的**忠实模型** + 源码抽取 / 闭包扫描工具函数 |

> 历史上 parsex 编译算法在 5 个工具里各有一份独立实现、`COMMENT_RE` 逐字复制 4 处、
> content 抽取器两份且**过滤规则不同**（同一扩展在两个工具里会抽到不同数量的 content）。
> 现在统一收敛到 `parsex-model.mjs`，新工具请直接 import，不要另起炉灶。

### 浏览器控制台脚本（非 node CLI）

| 文件 | 说明 |
|---|---|
| `diagnose-in-game.js` | 粘进游戏 DevTools 控制台，在**运行期**打印 `lib.translate` / `lib.skill` / `lib.hookmap` 实况 |

---

## `lint-extension.mjs` 九项检查

| 代号 | 检查 | 为什么值得查 |
|---|---|---|
| **S** | 整体语法 | 基础 |
| **C1** | `content` / `precontent` 在 parsex **两条分支**下编译 + 残留 `'step N'` 统计 | 只建模一条分支会得出完全相反的结论；残留 step 是**静默**的状态机错位 |
| **C2** | **闭包逃逸**：`content` 引用了包级闭包变量 | `content` 经 `new Function` 在全局作用域重建 → 运行时 `ReferenceError`。这是最难自查的一类，因为 `filter` 里用同样的写法却完全正常 |
| **C3** | 武将数组结构 `[sex, group, hp, [技能], [标签]]` | 对象形态会让引擎按 `[3]`/`[4]` 取值时崩 |
| **C4** | 技能注册完整性 | 武将数组引用了不存在的技能 → 永不发动 |
| **C5** | 译名完整性（武将名 / 技能名 / `_info` / `<包名>_character_config`） | 缺译名 → 名字位**空白**（不是报错） |
| **C6** | 标记可见性（`markSkill` 需要 `intro`） | 无 `intro` 直接 `return`，头像上什么标记都不显示 |
| **C7** | 跨包重名（需 `--index`） | `lib.skill` 是全局命名空间，加载序在后者**静默覆盖**前者 |
| **C8** | 触发时机白名单（需 `--app`） | 拼错事件名 → 注册照做、filter 永不调用、**零日志** |
| **C9** | 转化牌名字比较漏 `viewAs` | `addJudge({name:'shandian'},[card])` 造的是**转化牌**，`.name` 仍是实物牌名、`'shandian'` 在 `.viewAs` 里 ⇒ `.name == 'shandian'` 恒 false、技能静默不触发（实测症状：闪电判定不摸牌、零报错） |
| **C10** | `canUse` 第二参数误当「是否忽略」 | `canUse(card, target, distance, includecard)` 的第二个参数是**目标**（末行走 `lib.filter.targetEnabled`）。写 `player.canUse(card, player, false)` 等于问「能否对**自己**使用」，杀/决斗/顺手牵羊对自己非法 ⇒ 恒 false、后续整段不执行（实测症状：讨贼达标后不触发从牌堆底使用牌）。判「能不能用」应改 `hasUseTarget(card, false, false)` |

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 无 ERROR（`--strict` 时还要求无 WARN） |
| `1` | 有 ERROR |
| `2` | 用法错误 / 文件读不到 |

### 静音

```js
// dsh-lint: ignore-mark mgj_picked1 mgj_picked2
```
一行可写多个名字，用于声明「这个标记是刻意不可见的纯记账标记」。

---

## 两处容易踩的工具设计要点

### 1. 只扫 `skill:{}` 内部，不要扫全文件

扩展对象**顶层**的 `precontent` 由 `loadExtension` 直接调用、**不经过 parsex**；
只有 `skill:{}` 里各技能的 `content` / `precontent` 才被编译
（`game.js:15254 / 15555 / 16423 / 16604`）。整文件扫会产生假阳性。

### 2. 合法触发时机**不只是字面量**

`game.js:41702-41763` 对任意名为 `X` 的事件**动态合成** 6 个时机点：

| 时机 | 合成方式 | 行 |
|---|---|---|
| `XBefore` | `event.trigger(event.name+'Before')` | 41749 |
| `XBegin` | `event.trigger(event.name+'Begin')` | 41762 |
| `XEnd` | `event.trigger(event.name+'End')` | 41714 |
| `XAfter` | `event.trigger(event.name+'After')` | 41719 |
| `XOmitted` | `event.trigger(event.name+'Omitted')` | 41709 |
| `XSkipped` | `event.trigger(next.name+'Skipped')` | 41725 |

所以 `damageBegin` = `damage`+`Begin`、`damageEnd` = `damage`+`End`、
`phaseDiscardBefore` = `phaseDiscard`+`Before` 全部合法。
C8 的白名单因此是 `字面量 ∪ {基名+后缀}`；漏掉这条合成规则会把一大批正常技能误判。

---

## `idiom.mjs` · 范式抽取器

**为什么要它**：无名杀技能写错，绝大多数不是逻辑问题，而是**引擎约定**问题。
这些约定在 5000+ 个技能里已被重复过成千上万次 —— **普查语料比推理引擎行为可靠**。

```bash
node atlas/tools/idiom.mjs --char "<游戏>/resources/app/character" --idiom "额外出牌阶段"
node atlas/tools/idiom.mjs --find "phaseDiscardBefore"        # 按正则找
node atlas/tools/idiom.mjs --mine --top 25                     # 全库高频 3-gram 挖矿
# 常用开关：--show N / --snippet / --outliers / --json
```

`--char` 首次给一次即可，会缓存在 `atlas/index/.char-dir`。

内置惯用法：`额外出牌阶段` `跳过弃牌阶段` `伤害+1` `防止伤害` `加标记` `限定技`
`觉醒技` `锁定技但可选发动` `拼点` `额外回合` `转换技` `观看牌堆并排序`

### 三条设计要点（都是踩出来的）

1. **锚定聚类，不是行窗口。**
   要先找到**匹配的那个调用链**当锚点，再取 `chains[anchor .. anchor+2]`。
   用固定行窗口会把前置的无关调用（`player.phaseDraw` 之类）混进来，
   17 个技能碎成 14 类，等于没聚。

2. **锚定窗口必须用不去重的调用序列。**
   技能里前面若已出现 `event.next.remove`，去重版会让它从锚点之后的窗口里消失，
   签名被截断成 `player.phaseUse` 就没了，不同写法会被错误并箱（实测误并 3 个）。

3. **多数派不等于正确。**
   工具在最大派不过半时会明确输出「⚠ 无压倒性写法」，并提示按引擎语义判断。
   实例：`额外出牌阶段` 全库 17 处，`trigger.next.push` 8 处 vs
   `trigger.getParent().next` 7 处 —— **47%，没有标准答案**，
   最终选哪支靠 `event.next` 队列的消费时机语义，不靠票数。

---

## 已知限制

- **C8** 基于 `--app` 范围内的**静态字面量**。动态构造的事件名（变量拼出来的）会被漏掉，
  因此是 WARN 而非 ERROR。
- **`parsex-audit.mjs` 只建模 else 分支**。要覆盖 old 分支（疾速模式）请用
  `verify-extension.mjs` / `lint-extension.mjs` 的 C1 —— 那两处是双分支的。
- **`mock-load.mjs` 的断言里写死了 `tiandiguiyi` / `mouguojia_soul`**，它本质是本仓库的
  回归夹具，不适合直接拿去验别的扩展。通用体检请用 `lint-extension.mjs`。
- **C2 是名字级启发式**：它比对「包级声明名」与「`content` 体内的整词引用」，
  不做出作用域解析。极少数情况（例如靠 `with` 或动态 `eval`）可能误判，但没有漏报风险。

---

## 典型工作流

```bash
GAME="<游戏目录>/resources/app"

# 写完一个武将，提交前：
node atlas/tools/lint-extension.mjs extension/extension.js --app "$GAME" --index atlas/index

# 只想看编译兼容性：
node atlas/tools/verify-extension.mjs extension/extension.js

# 怀疑某个技能不发动，先查事件名是否合法：
node atlas/tools/lint-extension.mjs extension/extension.js --app "$GAME" 2>&1 | grep C8

# 改了引擎版本后重建索引：
node atlas/tools/index-packs.mjs "$GAME/character" atlas/index
node atlas/tools/check-collisions.mjs atlas/index atlas/index --app "$GAME"
```
