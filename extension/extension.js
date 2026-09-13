'use strict';
// ============================================================
// 无名杀扩展：天地归一（武将包：谋郭嘉·魂）
//
// 架构：扩展壳 + precontent 内 game.import('character')（雷霆万钧同款）
//       武将数组挂全部技能（含隐藏子技能），保证触发与被展示
//
// 本版为**重写版**：仅修复实现错误，三个技能的效果、数值、文案一律未改。
//
// ── 写法选择（重要，勿再改回 generator）─────────────────
// 琉璃版 5.5 的 parsex 有**两条分支**，由 localStorage 的 finalParsex 决定
// （game.js:12070-12071）：
//
//   · finalParsex == 'old'（game.js:12072-12090）
//       纯正则替换、**无 generator 判断**、**无 try/catch**。
//       generator 函数会被 str.slice(str.indexOf('{')+1) 从解构参数 { player } 处切错位
//       → new Function 抛 SyntaxError（硬报错）。
//
//   · 其他值（else 分支，game.js:12091-12189）
//       先判 gnc.isGeneratorFunc → generator 走独立分支；普通函数走 Legacy()，
//       而 Legacy() 带 try/catch，非法替换会被**静默跳过**。
//
// 结论：**generator 写法只在 else 分支可用**。要让扩展在两种配置下都正常，
// 必须用「普通函数 + 'step N'」，且步骤标记一律顶格、不嵌套、不重复。
// 这正是本文件采用的写法。
//
// ── 铁律二：content 里**不能引用包闭包里的任何变量/函数** ─────────────
// parsex / Legacy() 会把 content 的函数**源码**抠出来，用
//     new Function('event','step',..., 'get','ai', str)
// 重新编译（game.js:12131）。新函数运行在**全局作用域**，
// 包闭包里定义的 findCeTarget / ceX / isSoul 等一律变成 undefined：
//     Uncaught ReferenceError: findCeTarget is not defined
//     at Object.eval [as content] (eval at Legacy (game.js:12131:14))
//
// 对比：**filter / check / ai 不经过编译**（lib.skill[k] 保存的是原函数对象），
// 所以它们可以安全地使用闭包函数。这就是"filter 正常、content 炸"的原因。
//
// 因此：凡是 content 里要用的辅助逻辑，一律**内联**，或挂到全局对象
// （lib / game / window）上 —— 绝不放进包闭包。
// filters 里仍用闭包版（更简洁），两者互不影响。
//
// ── 修复清单（详见 atlas/04-天地归一审计.md）────────────────
//  B1  mgj_zhuce     步骤标记写在 if/else 块内 → parsex 编译失败、13 个 step 全残留
//                    → 四个效果一个都不会被添加。改为「全部 step 提到 content 顶层」的
//                    顺序流（★ 不是 generator —— 见铁律一，疾速模式下 generator 会炸）。
//  B2  mgj_nohurt    get.player() 不接受参数，source/target 塌缩为同一对象
//                    → 判定恒 false。改为直接读 event.source / event.player。
//  B3  mgj_nohurt    event.cancel() 取消的是技能自身事件 → 改为 trigger.cancel()。
//  B4  mgj_eff1 / mgj_extra_phase / mgj_boost / mgj_skip
//                    filter 的 player 是技能拥有者（谋郭嘉），而 mgj_ce / mgj_eff* 标记
//                    都在「策」持有者身上 → 四个效果永不发动。
//                    改为 {global:...} 触发 + 用 trigger.player / event.source 指代持有者。
//  B5  mgj_boost     event.damage += 1 改的是引擎不读的字段
//                    → 改为 trigger.num += 1（game.js:41674 伤害值为 event.num）。
//  B6  mgj_lixue     漏 loseHpEnd → 「失去体力」不触发。已补。
//  B7  定策的"已决定"闸门  无技能定义的裸标记（取不到 intro，无法显示）
//                    → 改用 player.storage 上的一个布尔位（现名 mgj_dingce_done；
//                      B18 之前叫 mgj_ce_bound，"bound"在改为可选后已不再准确，
//                      因为它记录的是"玩家做过决定"而非"是否成功交出「策」"）。
//  B8  效果④命名 mgj_eff4_perm 含「永久」却会被消耗 —— 属命名瑕疵、无行为影响，
//                    按「只修 bug」原则**未改名**，保留原标记名以免影响既有存档/录像。
//  B9  mgj_ce_remove 在 die 事件内做玩家交互 —— 风险项而非已证缺陷，
//                    按「只修 bug」原则**未改时机**。
//  B10 mgj_zhuce     stepHead 使 var ce 每步重算 —— 顺序流天然只求值一次，
//                    属无害归一化（原实现每步重算亦非有意设计）。
//  B11 标记不可见    markSkill 在 lib.skill[标记名].intro 缺失时**直接 return**、
//                    不渲染任何标记（game.js:27412）→「策」与四个效果全看不见。
//                    补 4 个纯显示壳（mgj_ce / mgj_eff2 / mgj_eff3_perm / mgj_eff4_perm）
//                    + mgj_eff1 的 intro + 全部 *_bg 角标译名。
//  B12 定策不触发    gameStart 不保证派发、enterGame 只在 addFellow/restorePlayer 里由
//                    triggerEnter 创建（game.js:44881）→ ceBound 恒 false。
//                    触发时机放宽为 {global:['gameStart','gameDrawAfter'], player:'enterGame'}。
//  B13 四选一变四连发 mgj_zhuce 原来一次触发里把①②③④全 addMark 一遍，
//                    与卡面「添加以下其中一项效果」不符 → 改为 chooseControl 四选一，
//                    并用 mgj_picked1/2/3 实现①②③的「限一次」。
//  B14 ①②被误当消耗品 ①②③④ 中只有 ④ 是消耗品 ——「限一次」限制的是**添加**次数，
//                    不是**发动**次数，效果一旦添加即永久存在。
//                    原 mgj_eff1 / mgj_extra_phase 在发动后 removeMark（回一次血/多一个
//                    出牌阶段就没了，且 ceX() 凭空掉 1），已移除。
//                    另：② 的插队姿势由 trigger.getParent().next.unshift(next) 改回
//                    引擎惯用法 trigger.next.push(next)（全库 8 : 7 两派中的一支，
//                    判据在游戏主循环：trigger.next 在**步与步之间**被消费；
//                    ⚠ 早先「17 处全部一致」的说法是抽样代替普查的错误断言，已勘误）。
//  B16 mgj_skip      ④ 的标记活不过持有者的回合。原实现只在 phaseDiscardBefore 消耗标记，
//                    若弃牌阶段被别的东西跳过（player.skip('phaseDiscard')），该事件走
//                    game.js:41724 的 Skipped 分支、XBefore/XBegin 都不发射 → 标记不被消耗
//                    → 下一轮铸策再叠一个 → X 漂到 5，打破「一血最多5牌」的上界
//                    （X = ①②③+④ ≤ 4 ⇒ 摸 X+1 ≤ 5 张）。
//                    改为一技能监听两时机并分支：
//                      phaseDiscardBefore → trigger.cancel() + 消耗 1 个标记
//                      phaseLoopEnd       → 清空未使用的标记（X ≤ 4 的保证）
//                    分支依据是 event.triggername，**不是** trigger.name ——
//                    trigger 是真实事件（game.js:41675 trigger=event._trigger），
//                    时机名在 event.triggername（game.js:15554）。
//  B17 mgj_lixue    forced:true 是错的。卡面沥血写的是「锁定技，但你体力值发生变动时，
//                    **你可以**与拥有「策」的角色一起摸X+1张牌」——
//                    「你可以」= 可自选不发动，「锁定技」只是身份标签（防止被"封非锁定技"
//                    的效果封掉）。引擎里这本就是两个正交字段：
//                      get.is.locked()（game.js:64837-64845）只决定分类，
//                        64841 if(info.trigger&&info.forced) return true;
//                        64843 if(info.locked) return true;
//                        并被 game.js:60262 用来加「锁定技」字样；
//                      强制发动只看 forced：game.js:15415 不满足才走 chooseBool 询问。
//                    故改为 去掉 forced + 显式 locked:true。
//                    同时按卡面原文重写 mgj_zhuce_info / mgj_lixue_info
//                    （原 mgj_zhuce_info 是自行编的措辞，与卡面不符）。
//  B18 mgj_dingce   给「策」改为**可选**（用户需求）。原 forced:true 使开局强制选人，
//                    且 content 在未选目标时会兜底把「策」塞给下家 —— 两处都让玩家
//                    没有"不给"的权利。改法与 B17 一致：去掉 forced、保留 locked，
//                    由引擎在触发时走 chooseBool 询问（game.js:15415）。
//                    连带三处必须同步，否则会裂：
//                      ① 闸门语义变了 —— 旧 storage.mgj_ce_bound 只在"成功给出"时才置 true，
//                         而 trigger 挂了 gameStart + gameDrawAfter 两个时机，
//                         玩家一旦选择放弃，第二个时机必然再问一遍。
//                         故改为 player.storage.mgj_dingce_done（记录"已决定"，含放弃）。
//                      ② 去掉"未选则兜底给下家"—— 那是强制时代的补丁，
//                         会把玩家刚做出的放弃选择推翻。
//                      ③ content 改成单 step 顺序执行：parsex 在找不到任何 'step N' 时
//                         会补 `if(event.step==1){event.finish();return;}`
//                         （parsex-model.mjs:56），只有第 0 步会被执行，
//                         若把选人放在 'step 1' 则永远跑不到。
//                    卡面 mgj_dingce_info 与 characterIntro 同步为"你可以…；放弃则本局
//                    此技能不再生效"。
//  B19 mgj_lixue    去掉 filter 里的「必须存在「策」」要求。规则（用户明确）：
//                    **没有「策」时，体力值发生变动也应该摸一张牌**。
//                    原 filter 是 `findCeTarget() != null`，虽 content 里 `if (ce)` 的写法
//                    使 X=0 也能摸 1 张，但整局没有「策」时会被 filter 整体拦掉 ——
//                    那正是"必须持有策才摸牌"的来源。
//                    改动：删掉 filter（引擎里 filter 缺失即无条件通过，见 game.js:33060
//                    的 truthiness 判定），content 里 `if (ce)` 已天然处理"无策"分支：
//                      · 有「策」→ 自己与持有者各摸 X+1 张（X = 持有者的效果数）
//                      · 无「策」→ x 保持 0，自己摸 1 张
//                    连带：mgj_zhuce（铸策）content 开头就有 `if (!ce) { event.finish(); return; }`
//                    （本文件 407 行附近），无「策」时会自己静默结束，不需要跟着改；
//                    它挂在 phaseBegin 上、每回合都过闸门，但不会弹空对话框。
//                    卡面 mgj_lixue_info 与 characterIntro 同步。
// ============================================================
game.import("extension", function (lib, game, ui, get, ai, _status) {
	return {
		name: '天地归一',
		editable: false,
		precontent: function () {
			var pkg;
			game.import('character', function () {
				// ---- 包内闭包辅助 ----
				// 返回当前持有「策」标记的角色（同一时刻至多一人）；持有者死亡后自动为 null
				// ★★ 死亡玩家不在 game.players 里 —— die 的广播把玩家移出 game.players 并推进
				//   game.dead（game.js:21119-21120），标记则留在 player.storage 里（无人清理）。
				//   只遍历 game.players 会导致：持有者一死，「策」就"找不到"了，
				//   依赖 findCeTarget() 的 filter 全体恒 false（实测症状：持有者死后，
				//   自己体力值变动也不再摸牌）。所以必须连 game.dead 一起找。
				var findCeTarget = function () {
					for (var i = 0; i < game.players.length; i++) {
						if (game.players[i].hasMark('mgj_ce')) {
							return game.players[i];
						}
					}
					var dead = game.dead || [];
					for (var j = 0; j < dead.length; j++) {
						if (dead[j] && dead[j].hasMark('mgj_ce')) {
							return dead[j];
						}
					}
					return null;
				};
				// X = 「策」上已添加的效果数
				var ceX = function (ce) {
					return ce.countMark('mgj_eff1') + ce.countMark('mgj_eff2') +
						ce.countMark('mgj_eff3_perm') + ce.countMark('mgj_eff4_perm');
				};
				var isSoul = function (p) {
					return p && p.hasSkill('mgj_dingce');
				};

				pkg = {
					name: 'tiandiguiyi',
					character: {
						mouguojia_soul: ['male', 'wei', 4, [
							'mgj_dingce', 'mgj_zhuce', 'mgj_lixue',
							'mgj_nohurt', 'mgj_ce_remove', 'mgj_eff1',
							'mgj_extra_phase', 'mgj_boost', 'mgj_skip'
						]],
						// 转·曹髦。三个卡面技能 + 四个隐藏子技能（见心得 §4.3：
						// 技能必须列进本数组才会被触发，隐藏子技能同样要列）
						//
						// [4] 里的 'ext:天地归一/zhuan_caomao.jpg' 是**扩展武将配图的官方途径**：
						//   game.js:8932-8938 扫描 [4] 的每个值，遇到 ext: 前缀就赋值 extimage；
						//   game.js:8953  src = extimage.replace(/ext:/, 'extension/')
						//   ⇒ extension/天地归一/zhuan_caomao.jpg
						//   引擎源码里那行注释就是「这里是扩展武将逆转乾坤的关键」。
						//   这样图片随扩展走，拷给别人也不会丢；同时另存了一份到
						//   image/character/zhuan_caomao.jpg 作兜底（默认路径 game.js:8961）。
						// 立绘规格：本目录 1660 张图全是 1:1.83 竖版（138x253 / 300x550 / 200x367…），
						//   故原图 842x819 近方形已居中裁为 300x550 再入库。
						zhuan_caomao: ['male', 'wei', 4, [
							'cm_juejing', 'cm_juejing_draw', 'cm_juejing_ward',
							'cm_qiji', 'cm_qiji_guard', 'cm_qiji_seize',
							'cm_taozei'
						], ['ext:天地归一/zhuan_caomao.jpg']],
						// ==== 2026-09-12 新增四将（手写卡校准稿）====
						// 均为「神威技」类别首批武将，类别规则见 README「技能类别：神威技」：
						//   初始可用 1 次；你的首次击杀令使用次数 +1（该加成每局游戏限一次）。
						// 类别机制载体 tdgx_shenwei_kill / tdgx_turn_reset 为共用隐藏技，
						// 必须列进每个武将的技能数组（心得 §4.3：不列进数组就不会被触发）。
						// ⚠ 但这条只适用于 **trigger 型**子技能（filterTrigger 只查数组）；
						//   **mod 型**子技能绝不能列进数组——列了就是开局常驻：
						//   mlb_zhangwu_mod / lx_zhangcai_mod / dy_pozhu_turn 曾被错列，
						//   刘备「开局无限出杀」即由此而来（2026-09-13 修复）。
						//   mod 走动态挂载即可被 checkMod 读到：getSkills() 包含
						//   tempSkills（game.js 当次核实），addTempSkill/addSkill 挂载即生效。
						// 暂无立绘，[4] 缺省（引擎会补空数组，展平兜底里同样处理）。
						// 四将立绘：走与 zhuan_caomao 相同的 [4] + 'ext:' 官方途径
						//   game.js:8934 extimage=value → 8953 src=extimage.replace(/ext:/,'extension/')
						//   即 extension/天地归一/<文件>，图片随扩展走，拷给别人不丢。
						// 规格：300x550（比例 0.545），与本目录既有 1660 张图一致。
						// 原图是横构图（1.386 / 1.386 / 1.387 / 0.756），按"缩放至填满 + 居中裁切"处理：
						//   裁切版人物占满卡面（武将图惯例），代价是画面左右各被裁掉一部分
						//   （如陆逊原图左侧的蓝鹿不在卡面内）。如需改为完整构图，
						//   可换成"按宽度适配 + 模糊背景填充"（人物会小一圈）。
						tdgx_luxun: ['male', 'wu', 4, [
							'lx_lianying', 'lx_lianying_draw', 'lx_lianying_end',
							'lx_chiyang', 'lx_chiyang_end',
							'lx_qianxun', 'lx_zhangcai',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_luxun.jpg']],
						tdgx_liubei: ['male', 'shu', 4, [
							'mlb_rende', 'mlb_rende_reclaim', 'mlb_rende_draw',
							'mlb_rende_nullify', 'mlb_rende_give',
							'mlb_zhangwu', 'mlb_xinghan',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_liubei.jpg']],
						tdgx_duyu: ['male', 'qun', 4, [
							'dy_wuku', 'dy_wuku_qibei',
							'dy_pozhu', 'dy_pozhu_perm', 'dy_pozhu_check',
							'dy_zhenqiao', 'dy_zhenqiao_devour', 'dy_zhenqiao_boost',
							'dy_miewu',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_duyu.jpg']],
						tdgx_lukang: ['male', 'wu', 4, [
							'lkang_huiyan', 'lkang_hy_w', 'lkang_hy_a', 'lkang_hy_h3', 'lkang_hy_mod',
							'lkang_kangjin', 'lkang_kangjin_copy', 'lkang_kangjin_clear',
							'lkang_beishui',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_lukang.jpg']],
						// ==== 2026-09-13 新增三将（定稿见 docs/新将文本定稿-20260913.md）====
						// 兵·诸葛亮：兵权多段锁定技分装 4 个子技能（全部列进数组以便触发；
						// 转职时由 bz_bingquan_round 统一移除），情势为动态获得技能，
						// **不列进数组**（列了开局就有），由 addSkill 获得。
						bing_zhugeliang: ['male', 'shu', 4, [
							'bz_bingquan', 'bz_jiufa', 'bz_jiufa_track',
							'bz_kongcheng', 'bz_qingshi',
							'bz_bing'
						], ['ext:天地归一/bing_zhugeliang.jpg']],
						tdgx_zhouyu: ['male', 'wu', 4, [
							'mzy_yingzi', 'mzy_fanjian', 'mzy_yingyan',
							'mzy_shanmou', 'mzy_jichu',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_zhouyu.jpg']],
						tdgx_peixiu: ['male', 'qun', 4, [
							'mpx_xingtu', 'mpx_juezhi',
							'mpx_xietu', 'mpx_wantu',
							'mpx_tu', 'mpx_zengtu',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_peixiu.jpg']],
					},
					characterIntro: {
						mouguojia_soul: '谋郭嘉·魂。<br>定策：游戏开始时，你可以选择一名其他角色令其获得「策」（放弃发动则本技能本局不再生效），你与该角色相互间无法造成伤害；当你死亡时，可选择移除「策」。<br>铸策：你的回合开始时，给「策」添加一项效果（回复体力/额外执行一个出牌阶段（不摸牌）/使用牌造成的伤害+1/跳过一次弃牌阶段；前三项各限一次并永久存在，④不限次数但其标记在持有者回合结束时弃置）。<br>沥血：锁定技，当你体力值发生变动时，你可以摸X+1张牌（X为「策」的效果数，至多4）；若场上没有「策」，你摸一张牌。',
						zhuan_caomao: '转·曹髦。<br>决境：每轮开始时，令全场各摸一张牌，并将各自摸到的那张转为闪电对其自己使用（判定区已有闪电者跳过）；有人在闪电判定时你摸牌；你自己的闪电判定成功时免伤、清空全场判定区的闪电并永久失去决境。<br>奇技：锁定技，回合结束时夺取本回合未被你伤害过的角色各一张牌；受伤时可弃判定区牌免伤；有人受≥2点伤害时，你可摸X（体力值）或Y（全场判定区牌数）张。<br>讨贼：锁定技，每轮开始可把任意牌压入牌堆底，累计超过体力上限后即可无视次数与距离使用牌堆底的牌。',
						tdgx_luxun: '名·陆逊。<br>连营：锁定技，失去非使用打出的牌获「谦」（每2张得1个，向上取整）；没有手牌时摸至体力上限；出牌阶段开始时按「谦」数摸牌并弃谦；结束阶段视使用打出与弃牌情况摸牌。<br>炽炎：出牌阶段限X次（X为轮次），弃等同体力值的牌造成火焰伤害并可视为使用铁索连环；结束阶段按以此法造成的伤害对连环角色扩大打击。<br>谦逊：锁定技，受伤时按「谦」与体力上限的关系判定摸牌/减伤/免疫。<br>彰才（神威技）：发动后本回合使用牌无次数和距离限制。',
						tdgx_liubei: '名·刘备。<br>仁德：开局3个「仁」，回合开始收回全部「仁」，出牌阶段按「仁」数摸牌；有「仁」者被指定为目标时可付代价令此牌无效（每回合限一次）；结束阶段可把「仁」分配给不同角色。<br>章武（神威技）：回合开始时额外执行一个出牌阶段且本回合使用牌无次数限制。<br>兴汉（主公技）：开局多得1个「仁」；蜀势力角色对你造成的伤害免疫（每名角色每回合限1次）。',
						tdgx_duyu: '名·杜预。<br>武库：场上有人装备牌时获「备」并摸牌（上限5）；出牌阶段可耗「备」把一张牌当非装备牌使用（每回合限一次）。<br>破竹：每回合限一次选一种牌名，本回合无次数距离限制地使用；若以此造成过伤害则本局永久解锁。<br>振鞘：锁定技，装备武器时使用牌无法被响应；造成伤害时可令其免疫并夺取其装备区所有牌；用【杀】造成伤害时伤害+X（攻击范围-体力值，最小0）。<br>灭吴（神威技）：摸等同于「备」数+体力上限的牌。',
						tdgx_lukang: '名·陆抗。<br>毁堰：出牌阶段废除自己的一个区域换对应效果（武器/防具/进攻马/防御马/判定区/手牌区，六选一，各有一次性效果）。<br>抗晋：被体力不低于你的角色伤害时可弃牌判定免伤；造成伤害后可让一名角色的区域状态本轮与你相同，并恢复自己一个装备栏（每回合限两次）。<br>背水（神威技）：恢复所有已废除的区域。',
						bing_zhugeliang: '兵·诸葛亮。<br>兵权：每轮开始时场上所有其他武将可依次令你获得「兵」；回合开始时若「兵」不小于二，你本回合使用牌无距离限制且【杀】次数上限+X；若你本轮获得的「兵」不大于二，你失去兵权并获得情势。<br>九伐（限定技）：回合开始时，全场每名角色都使用/打出/失去过【杀】且你的体力值不为最多，你可以展示牌堆内所有基本牌并从中选(5+X)张无次数距离限制地使用或打出。<br>空城（转换技）：手牌数变为零或从零改变时转换形态；阴：发动技能时摸一张牌；阳：受到伤害时判定，锦囊牌令此伤害-1，否则弃一名角色一张牌。<br>情势（锁定技）：回合开始时摸X张牌（X为「兵」的数量，至少为1）；本回合使用前两张锦囊牌时可选：伤害+1，或多执行一次，并获得一个「兵」（每回合至多两个，三轮移除一次）。',
						tdgx_zhouyu: '名·周瑜。<br>英姿：回合开始时按体力与手牌状态执行效果（少体力摸三张/手牌多则本回合无限制/手牌少则回血补牌；体力或手牌等于上限则全部执行），触发后跳过弃牌阶段。<br>反间：观看一名角色的手牌并选一张，令另一名角色猜花色，猜错失去全部手牌（终止结算），猜对获得此牌并重复。<br>映炎：场上有人受到火焰伤害时，可弃牌波及相邻角色/令伤害+1/失去体力执行前两项；造成伤害可改为火焰伤害。<br>善谋（转换技）：发动技能后转换形态；阳面发动技能回复体力，阴面发动技能对一名角色造成伤害。<br>技出（神威技）：本回合发动技能后额外触发一次善谋的效果。',
						tdgx_peixiu: '名·裴秀。<br>行图：使用或打出牌结算后按手牌数与体力上限的关系执行（多则可弃牌摸牌/少则摸牌或拿其他角色一张牌/相等则爵制次数上限+1）。<br>爵制（每局限一次）：弃任意牌摸等量牌，杀次数上限+1并选一项（本局杀不可被响应/杀伤害+1/伤一名角色并加上限/令一人减上限）。<br>携图：结束阶段若发动行图次数大于体力上限获得「图」（持有者只能被【杀】造成伤害）；出牌阶段可弃「图」本回合使用牌无次数距离限制。<br>完图（神威技）：令至多两名其他角色获得「赠图」，你本回合每摸一张牌，其摸一张牌。',
					},
					translate: {
						'tiandiguiyi': '天地归一',
						'mouguojia_soul': '谋郭嘉·魂',
						'mgj_dingce': '定策',
						'mgj_dingce_info': '锁定技。游戏开始时，你可以选择一名其他角色，令其获得「策」标记；若你放弃发动，本局此技能不再生效。当你死亡时，你可以选择是否移除「策」。你与拥有「策」的角色相互间无法造成伤害。',
						'mgj_zhuce': '铸策',
						'mgj_zhuce_info': '回合开始时，你给「策」添加以下其中一项效果：1.回合开始时，恢复一点体力 2.回合开始时，执行一个额外的出牌阶段。 3.当你使用造成伤害时，若此牌指定的目标数为1，则此牌造成的伤害+1 4.跳过一次弃牌阶段（前三个选项限一次并永久存在）',
						'mgj_lixue': '沥血',
						'mgj_lixue_info': '锁定技。当你体力值发生变动时，你可以摸X+1张牌（X为「策」的效果数量）；若场上没有「策」，你摸一张牌。',
						'mgj_nohurt': '定策·却刃',
						'mgj_ce_remove': '定策·解策',
						'mgj_eff1': '铸策·愈',
						'mgj_extra_phase': '铸策·再战',
						'mgj_boost': '铸策·锐',
						'mgj_skip': '铸策·逸',
						// ── B11：标记文案 ──
						// 头像角标文字取自 lib.translate[标记名+'_bg']（game.js:27584），
						// 缺省时退化为 get.translation(标记名)[0] —— 即键名首字母（mgj_ce → 'm'）。
						// 此处显式给出，并补上标记名的译名（addMark 的日志文案也读 lib.translate）。
						'mgj_ce': '策',
						'mgj_ce_bg': '策',
						'mgj_eff1_bg': '愈',
						'mgj_eff2': '铸策·再战',
						'mgj_eff2_bg': '再',
						'mgj_eff3_perm': '铸策·锐',
						'mgj_eff3_perm_bg': '锐',
						'mgj_eff4_perm': '铸策·逸',
						'mgj_eff4_perm_bg': '逸',
						// ── 转·曹髦 ──（技能描述一律逐字照抄卡面）
						'zhuan_caomao': '转·曹髦',
						'cm_juejing': '决境',
						'cm_juejing_info': '每轮开始时，你令全场各摸一张牌，并将各自摸到的那张转为闪电对其自己使用（判定区内已有闪电者跳过）。当场上进行闪电判定时，你摸一张牌。当你进行闪电判定时，判定成功，你免疫此次伤害，并且你弃置在场角色判定区内的闪电，然后你失去技能「决境」。',
						'cm_qiji': '奇技',
						'cm_qiji_info': '锁定技。回合结束时，你获得此回合内你未对其造成伤害的角色区域内的一张牌。当你受到伤害时，你可以弃置自己判定区内的一张牌，并免疫此伤害。当场上有角色受到的伤害不小于两点，你可以执行以下选项的其中之一：①摸X张牌（X为你的体力值）；②摸Y张牌（Y为全场角色判定区内牌数的总和）。',
						'cm_taozei': '讨贼',
						'cm_taozei_info': '锁定技。每轮开始时，你可以将任意牌置于牌堆底。当你以此法放于牌堆底的牌大于你的体力上限，你可以无视次数、距离限制使用牌堆底的牌，直到无法使用此牌为止。',
						// 隐藏子技能（sub:true，刻意不给 _info —— lint 的 C5 对 sub 技能降级为 INFO）
						'cm_juejing_draw': '决境·察电',
						'cm_juejing_ward': '决境·渡劫',
						'cm_qiji_guard': '奇技·卸厄',
						'cm_qiji_seize': '奇技·趁危',
						// ── 2026-09-12 新增四将（武将名 / 技能名+描述 / 标记文案）──
						'tdgx_luxun': '名·陆逊',
						'tdgx_liubei': '名·刘备',
						'tdgx_duyu': '名·杜预',
						'tdgx_lukang': '名·陆抗',
						'bing_zhugeliang': '兵·诸葛亮',
						'tdgx_zhouyu': '名·周瑜',
						'tdgx_peixiu': '名·裴秀',
						'lx_lianying': '连营',
						'lx_lianying_info': '锁定技，每当你因非使用和打出而失去牌时，你获得X个「谦」标记（X为本次失去牌的数量的一半，向上取整）。当你没有手牌时，你将手牌摸至体力上限。出牌阶段开始时，你摸等同于「谦」数量的牌，并弃置所有的「谦」。结束阶段，若你使用或打出的牌数不大于你的体力值，你摸等同于你弃牌阶段弃置牌数的牌。',
						'lx_lianying_draw': '连营·清囊',
						'lx_lianying_end': '连营·复盘',
						'lx_chiyang': '炽炎',
						'lx_chiyang_info': '出牌阶段限X次（X为游戏轮次），你可以弃置等同于你当前体力值的牌，并对一名角色造成1点火焰伤害，然后你可以弃置一张牌，视为使用【铁索连环】。结束阶段，若你以此法造成的伤害不小于你的体力值，你可以对所有处于连环状态的角色造成1点火焰伤害，并弃置其装备区内的所有牌。',
						'lx_chiyang_end': '炽炎·燎原',
						'lx_qianxun': '谦逊',
						'lx_qianxun_info': '锁定技，当你受到伤害时：若你的「谦」小于体力上限，你进行一次判定，若结果为红色，你摸两张牌；若你的「谦」大于体力上限，你可以弃置等同于你体力值的「谦」，令此伤害-1；若你的「谦」等于体力上限，你免疫此伤害。',
						'lx_zhangcai': '彰才',
						'lx_zhangcai_info': '神威技，出牌阶段，你可以发动：本回合内，你使用牌无次数和距离限制。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'lx_zhangcai_mod': '彰才·纵横',
						'mlb_rende': '仁德',
						'mlb_rende_info': '游戏开始时，你获得3个「仁」标记。回合开始时，你收回场上所有的「仁」。出牌阶段开始时，你摸等同于你身上「仁」数量的牌。当一名拥有「仁」的角色被牌指定为目标时，你可以失去1点体力或弃置两张牌，令此牌无效（每回合限一次）。结束阶段，你可以将你身上的「仁」分配给任意不同的角色。',
						'mlb_rende_reclaim': '仁德·归心',
						'mlb_rende_draw': '仁德·施惠',
						'mlb_rende_nullify': '仁德·庇护',
						'mlb_rende_give': '仁德·布仁',
						'mlb_zhangwu': '章武',
						'mlb_zhangwu_info': '神威技，回合开始时，你可以发动：本回合你额外执行一个出牌阶段，且本回合使用牌无次数限制。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'mlb_zhangwu_mod': '章武·联营',
						'mlb_xinghan': '兴汉',
						'mlb_xinghan_info': '主公技，锁定技，游戏开始时，你额外获得一个「仁」。当蜀势力角色对你造成伤害时，你免疫此伤害（每名角色每回合限1次）。',
						'dy_wuku': '武库',
						'dy_wuku_info': '锁定技，当场上一名角色装备牌时，你获得一个「备」标记并摸一张牌（「备」上限为5）。出牌阶段限一次，你可以消耗一个「备」标记，将你区域内的一张牌当非装备牌使用或打出。',
						'dy_wuku_qibei': '武库·启备',
						// 子技能（sub）也补 _info：lint C5 只对 sub 技能降级为 INFO，
						// 缺 _info 会被判 WARN（C5 的判据是 lib.translate[skill+'_info'] 是否存在）。
						'dy_wuku_qibei_info': '出牌阶段或响应时（含无懈可击）：你可以消耗一个「备」标记，将一张牌当非装备牌（基本牌/普通锦囊/延时锦囊）使用或打出（从当前可合法使用的牌名中选择）。每回合限一次。',
						'dy_wuku_qibei_used': '启备·已用',
						'dy_wuku_qibei_used_info': '武库·启备本回合已使用的标记，回合结束自动消失。',
						'dy_pozhu': '破竹',
						'dy_pozhu_info': '出牌阶段限一次，你可以选择一种你手牌里有的牌名：本回合你使用此牌无次数和距离限制。若你本回合使用此牌造成过伤害，本局游戏你使用此牌名无次数和距离限制。',
						'dy_pozhu_turn': '破竹·势',
						'dy_pozhu_perm': '破竹·极',
						'dy_pozhu_check': '破竹·定势',
						'dy_zhenqiao': '振鞘',
						'dy_zhenqiao_info': '锁定技，当你装备着武器牌时，你使用的牌无法被响应。当你造成伤害时，你可以令此伤害免疫，并获得受伤角色装备区内的所有牌。当你使用【杀】对目标造成伤害时，此伤害+X（X为你的攻击范围-你的体力值，且X最小为0）。',
						'dy_zhenqiao_devour': '振鞘·吞甲',
						'dy_zhenqiao_boost': '振鞘·开锋',
						'dy_miewu': '灭吴',
						'dy_miewu_info': '神威技，出牌阶段，你可以发动：摸X张牌（X为你的「备」标记数+你的体力上限）。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'lkang_huiyan': '毁堰',
						'lkang_huiyan_info': '出牌阶段，你可以选择一个你的区域令其失效（每个区域整局只能选择一次），并获得对应效果：武器区——你造成的伤害+1；防具区——每回合你第一次受到伤害时，免疫此伤害；进攻马栏——你使用牌无法被响应；防御马栏——你摸两张牌；判定区——你无视距离且使用牌无次数限制（判定区内的牌被弃置）；手牌区——分配X点伤害给任意角色（X为你的体力值-1，且手牌视为不可使用）。',
						'lkang_hy_w': '毁堰·锋',
						'lkang_hy_a': '毁堰·御',
						'lkang_hy_h3': '毁堰·疾',
						'lkang_hy_mod': '毁堰·阵',
						'lkang_kangjin': '抗晋',
						'lkang_kangjin_info': '锁定技，当你受到体力值不小于你的角色造成的伤害时，你可以弃置一张牌并进行判定：若结果为红色，你免除此次伤害。当你造成伤害后，你可以令一名角色的一个区域状态本轮与你相同，然后你选择恢复你装备区内的一个栏位（每回合限两次）。',
						'lkang_kangjin_copy': '抗晋·同轨',
						'lkang_kangjin_clear': '抗晋·复轨',
						'lkang_beishui': '背水',
						'lkang_beishui_info': '神威技，出牌阶段，你可以发动：恢复你所有已失效的区域。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'bz_bingquan': '兵权',
						'bz_bingquan_info': '锁定技。每轮开始时，场上所有其他武将可以依次选择让你得到一个「兵」标记；回合开始时，若你拥有的「兵」不小于二，则你本回合使用牌无距离限制且使用【杀】的次数上限+X；若你于本轮获得的「兵」不大于二，你失去〖兵权〗并获得技能〖情势〗。（X为「兵」的数量）',
						'bz_bingquan_mod': '兵权·锋',
						'bz_bingquan_mod_info': '本回合你使用牌无距离限制，且使用【杀】的次数上限+X。',
						'bz_jiufa': '九伐',
						'bz_jiufa_info': '限定技。回合开始时，当场上每名角色于游戏开始至今均使用/打出/失去过【杀】，并且你的体力值不为最多，你可以展示牌堆内剩余的所有基本牌，然后你可以从中选择(5+X)张牌无使用次数和距离限制地使用或打出，未被选择的牌洗回牌堆。（X为「兵」的数量）',
						'bz_kongcheng': '空城',
						'bz_kongcheng_info': '转换技。条件：当你手牌数变为零或从零改变时，你转换阴阳形态。阴：当你发动技能时（含锁定技的自动触发），你摸一张牌。阳：当你受到伤害时，你进行一次判定：①若判定牌为锦囊牌，你令此伤害-1（至多减至0）；②若判定牌不为锦囊牌，你弃置一名角色的一张牌。<br>（游戏开始时你处于阴形态；角色牌面上的「空城」标记与技能提示会显示当前形态）',
						'bz_qingshi': '情势',
						'bz_qingshi_info': '锁定技。回合开始时，你摸X张牌（X为「兵」的数量，且至少为1）；当你本回合使用前两张锦囊牌时，你可以选择以下选项执行：①本牌造成伤害+1（若此牌不造成伤害，则此项无效果）；②多执行一次。并获得一个「兵」。（你以此法每回合至多得到两个「兵」，你以此法获得的「兵」三轮移除一次）',
						'bz_qingshi_dmg': '情势·锐',
						'bz_qingshi_dmg_info': '此牌造成的伤害+1。',
						'bz_qingshi_used': '情势·闸',
						'bz_qingshi_used_info': '本回合你已通过〖情势〗得到过「兵」（每回合至多两次）。',
						'bz_bing': '兵',
						'bz_bing_info': '兵权的计数标记（X 为其数量）。',
						'mzy_yingzi': '英姿',
						'mzy_yingzi_info': '锁定技。回合开始时，若你满足相应的条件，你执行相应的效果：①体力值小于体力上限，你摸三张牌；②手牌数大于体力值，本回合你使用牌无次数和距离限制；③手牌数小于体力值，你回复1点体力，然后将手牌补至体力上限；④体力值或手牌数等于体力上限，无视①②③各自的触发条件，依次执行①②③的效果。若你此次触发的效果数不为零，本回合你跳过弃牌阶段。',
						'mzy_yingzi_mod': '英姿·弘',
						'mzy_yingzi_mod_info': '本回合你使用牌无次数和距离限制。',
						'mzy_fanjian': '反间',
						'mzy_fanjian_info': '出牌阶段限一次。你可以选择两名角色，观看其中一名角色的手牌并从中选择一张牌，令另一名角色猜测此牌的花色：若其猜错，其失去全部手牌，此流程终止；终止后，两名角色分别以本流程开始时的手牌数为基准，本流程中失去的牌数不小于2的角色失去1点体力；若其猜对，其获得此牌，并重复此流程，直到其中一名角色没有手牌。',
						'mzy_yingyan': '映炎',
						'mzy_yingyan_info': '锁定技。当场上一名角色受到火焰伤害时，你选择一项执行：①弃置一张牌，令该角色相邻的角色受到等同伤害；②弃置一张牌，令此伤害+1；③失去1点体力，然后执行①和②。当你造成伤害时，你可以将此伤害修改为火焰伤害。',
						'mzy_shanmou': '善谋',
						'mzy_shanmou_info': '转换技。当你发动技能后，你转换阴阳形态。阳：当你发动技能时，你回复1点体力；阴：当你发动技能时，你对一名角色造成1点伤害。',
						'mzy_jichu': '技出',
						'mzy_jichu_info': '神威技，出牌阶段，你可以发动：本回合内，当你发动技能后，你额外触发一次〖善谋〗的效果（被额外触发的效果不再引发〖技出〗）。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'mzy_jichu_effect': '技出·承',
						'mzy_jichu_effect_info': '当你发动技能后，你额外触发一次〖善谋〗的效果。',
						'mpx_xingtu': '行图',
						'mpx_xingtu_info': '锁定技。每当你使用或打出牌结算结束后：若你的手牌数大于体力上限，你可以弃置一张牌，然后你摸一张牌；若你的手牌数小于体力上限，你可以选择一项：摸一张牌，或获得其他一名角色区域内的一张牌；若你的手牌数等于体力上限，「爵制」本局游戏的使用次数上限+1。',
						'mpx_juezhi': '爵制',
						'mpx_juezhi_info': '每局游戏限一次，出牌阶段，你可以弃置任意数量的牌并摸等量的牌，然后你本局游戏使用【杀】的次数上限+1，并选择一项执行：①本局游戏你使用的【杀】无法被响应；②本局游戏你使用【杀】造成的伤害+1；③对一名角色造成1点伤害，然后你增加1点体力上限；④令一名角色减少1点体力上限并失去1点体力（若其体力值大于体力上限，其将体力值减至体力上限）。',
						'mpx_juezhi_mod': '爵制·烈',
						'mpx_juezhi_mod_info': '本局游戏你使用【杀】的次数上限+X（X为发动爵制时累加的次数）。',
						'mpx_xietu': '携图',
						'mpx_xietu_info': '锁定技。结束阶段，若你于本局游戏发动「行图」的次数大于体力上限，你获得一枚「图」。出牌阶段，你可以弃置「图」，则本回合你使用牌无次数和距离限制。「图」持有者的状态：持有「图」的角色只能被【杀】造成伤害。',
						'mpx_tu': '图',
						'mpx_tu_info': '携图的标记。持有「图」的角色只能被【杀】造成伤害；出牌阶段可弃置「图」，本回合使用牌无次数和距离限制。',
						'mpx_tu_burst': '携图·驰',
						'mpx_tu_burst_info': '本回合你使用牌无次数和距离限制。',
						'mpx_wantu': '完图',
						'mpx_wantu_info': '神威技，出牌阶段，你可以令至多两名角色各获得一枚「赠图」（「赠图」持有者不算「拥有图」，不获得携图的效果）。当你于本回合每摸一张牌后，每名拥有「赠图」的角色摸一张牌（与你的摸牌数量相同）。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
						'mpx_zengtu': '赠图',
						'mpx_zengtu_info': '完图授予的标记：裴秀于本回合每摸一张牌后，你摸一张牌。',
						'mpx_zengtu_flag': '赠图·联',
						'mpx_zengtu_flag_info': '裴秀于本回合每摸一张牌后，你摸一张牌。',
						'tdgx_shenwei_kill': '神威·首功',
						'tdgx_turn_reset': '神威·更始',
						// 新增标记的文案（markSkill 渲染依赖 intro；角标文字取 标记名+'_bg'）
						'lx_qian': '谦',
						'lx_qian_bg': '谦',
						'mlb_ren': '仁',
						'mlb_ren_bg': '仁',
						'dy_bei': '备',
						'dy_bei_bg': '备',
					},
					skill: {
						// ============ 定策 ============
						mgj_dingce: {
							locked: true,
							// ── 给「策」改为**可选**行为（去掉 forced）────────────────────
							// 与 B17（沥血）同一套写法：`locked` 与 `forced` 是两个正交字段 ——
							//   get.is.locked()（game.js:64837-64845）只决定技能**分类**（在技能栏
							//   显示「锁定技」字样、不被"封非锁定技"的效果封掉）；
							//   是否**强制发动**只看 forced：game.js:15415
							//   `if(!event.revealed&&!info.forced)` 不满足才走 chooseBool 询问分支。
							// 去掉 forced ⇒ 开局会给一次「是否发动【定策】」的选择：
							//   选"取消"= 本局不把「策」交给任何人（技能保持未生效）；
							//   选"确定"= 才进入选人。卡面文案同步改成"你可以…"。
							//
							// ── 触发时机（实测修正）──────────────────────────────
							// 原写法 { global:'gameStart', player:'enterGame' } 两半都可能失效：
							//  · enterGame：game.js:44881 triggerEnter 只在 addFellow / restorePlayer
							//    （中途加入、换将、复活）时创建，**开局流程不经过它**
							//  · gameStart：identity.js:355 在开局 step 5 末尾派发，能否被收集
							//    取决于那一刻本技能是否已注册进 lib.hook.globaltrigger
							//    （addSkillTrigger 在 addSkill 时注册，时机可能更晚）
							// 实测现象：技能已挂到玩家身上、content 可编译、闸门为真，
							// 但标记始终未写 —— 即 content 一次都没执行过。
							//
							// 加固：加 gameDrawAfter 兜底 —— 它在开局 step 6（game.gameDraw）之后，
							// 必然晚于玩家初始化与技能挂载。
							// ★ 两个时机都可能派发 ⇒ 必须有"已决定"闸门，否则玩家会被问两次。
							//   注意闸门要记录的是**决定**而不是"是否给出成功"：
							//   玩家选择放弃时同样要落闸，否则 gameDrawAfter 会再问一遍。
							trigger: { global: ['gameStart', 'gameDrawAfter'], player: 'enterGame' },
							filter: function (event, player) {
								// 去掉原来的 event.name 白名单 —— trigger 已限定时机，
								// 而原白名单只放行 gameStart / enterGame，会把 gameDrawAfter 兜底挡掉。
								// 同时给 storage 加保险（避免 storage 未初始化时抛错）。
								return !!(player.hasSkill('mgj_dingce') &&
									player.storage && !player.storage.mgj_dingce_done);
							},
							// 步骤标记一律写在本函数体顶层（不嵌套在 if/else 内）。
							// 这样在 parsex 的**两条分支**下都能正确编译：
							//   · finalParsex=='old' 分支（game.js:12072-12090）：纯正则替换、无 try/catch
							//   · Legacy() 分支（game.js:12094-12133）：带 try/catch，非法替换会被静默跳过
							// generator 写法只在 Legacy 分支可用，old 分支会把解构参数 { player } 当成函数体切错位。
							//
							// ── 「可以不给」由**引擎自带**的询问实现，content 不要自己再问一次 ──
							// 去掉 forced 后，引擎在触发事件自己的 "step 1" 里就会弹询问：
							//   game.js:15415  if(!event.revealed&&!info.forced){
							//   game.js:15456    var next=player.chooseBool(str);   ← 引擎的"是否发动"
							//   描述文字取 lib.translate[skill+'_info']（15473）⇒ 无需自己再写提示
							// 玩家点"取消"时，引擎在 "step 3" 直接结束：
							//   game.js:15503  if(result&&result.bool==false){ ...event.finish(); return; }
							//   ⇒ **content 根本不会被执行**，因此 content 不需要、也不应该再判一次"是否发动"。
							//
							// ★★ 曾经踩的坑（已修）：content 里自己又写了一个 chooseBool，并把它写成**单 step**
							//   顺序执行。但 content 在一次触发里**只执行一次**（引擎主循环 41806 之后
							//   event.step++ 就进下一步；触发事件在 15485 "step 2" 收尾），于是：
							//     · 自写的 chooseBool 返回后继续往下跑，
							//     · chooseTarget 只是**创建**了事件、还没等玩家选，
							//     · 函数尾部 reaches 隐式守卫（parsex 补的 if(event.step==1){event.finish();return;}）
							//   ⇒ 选人环节被跳过，「策」永远发不出去（实测症状：开局给不了策）。
							//   「创建事件」与「等结果」必须分成两个 step —— 见下方 step 0 / step 1。
							// ── 放弃时也要落闸：用引擎的 oncancel 钩子 ──
							// 玩家在引擎的"是否发动"询问里点"取消"时，content **完全不执行**
							// （game.js:15503 直接 event.finish(); return;），所以 content 里那句
							// `player.storage.mgj_dingce_done = true` 落不了闸。
							// 而 trigger 同时挂了 gameStart 与 gameDrawAfter 两个时机 ⇒
							// 玩家一放弃，第二个时机（gameDrawAfter）在 filter 里仍看到 done 为假，
							// 于是**再问一遍**。引擎为此提供了 oncancel：
							//   game.js:15504  if(info.oncancel) info.oncancel(trigger,player);
							oncancel: function (event, player) {
								if (player.storage) player.storage.mgj_dingce_done = true;
								game.log(player, '放弃了发动', '#g【定策】');
							},
							content: function () {
								'step 0'
								// 能走到这里 = 玩家已确认发动，直接选人。
								// 不用 'step N' 之外的隐式写法：步骤标记必须顶格在函数体最前。
								player.storage.mgj_dingce_done = true;
								// ★ 这里**不能**再兜底给下家 —— 旧实现在未选目标时强塞下家，
								//   那是"可选"改动前留下的补丁，会把玩家刚刚做出的放弃选择又推翻。
								player.chooseTarget('选择一名其他角色获得「策」', function (card, player, target) {
									return target != player;
								}).set('ai', function () { return 1; });
								'step 1'
								if (result && result.targets && result.targets.length) {
									var target = result.targets[0];
									target.addMark('mgj_ce', 1);
									game.log(player, '令', target, '获得了标记', '#g【策】');
								}
								event.finish();
							},
						},
						// —— 定策·却刃：相互免伤 ——
						mgj_nohurt: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { global: 'damageBegin' },
							filter: function (event) {
								// B2：原用 get.player(event.source) / get.player(event.player)，
								// 而 get.player() 不接受参数（game.js:62081 直接 return _status.event.player），
								// 导致 source 与 target 塌缩为同一对象、两行判定变成同一个恒 false 条件。
								var source = event.source;
								var target = event.player;
								if (!source || !target) return false;
								if (isSoul(source) && target.hasMark('mgj_ce')) return true;
								if (isSoul(target) && source.hasMark('mgj_ce')) return true;
								return false;
							},
							content: function () {
								// B3：技能 content 运行在新建事件中（game.js:15552-15555），
								// event 是技能自身事件，trigger 才是伤害事件 → 必须 trigger.cancel()
								trigger.cancel();
							},
						},
						// —— 定策·解策：死亡时移除 ——
						mgj_ce_remove: {
							sub: true,
							popup: false,
							// ── forceDie:true 是必须的（与 mgj_lixue 同源，同一个坑的第二次出现）──
							// die 的 content 时序（game.js:21064 起）：
							//   21109  player.classList.add('dead')      ← 先标记死亡
							//   21150  player.changeHp(-hp).forceDie=true
							//   21155  event.trigger('die')             ← 才触发本技能
							// 也就是说 {player:'die'} 这个时机**本质上就是"玩家已经死了"的时刻**。
							// 而 createTrigger 对死亡玩家直接 return：
							//   game.js:40320  if(player.isDead()&&!info.forceDie) return;
							// ⇒ 没有 forceDie 时本技能整体不触发，「是否移除「策」」的询问永不出现。
							// （边界：濒死但尚未真正 die 时玩家不算 dead，闸门放行、技能正常 ——
							//   所以旧版只在"真正阵亡"这条路上失效，而那正是它唯一有意义的场景。）
							forceDie: true,
							trigger: { player: 'die' },
							filter: function (event, player) {
								return isSoul(player) && findCeTarget() != null;
							},
							content: function () {
								// ★ 同 mgj_zhuce：content 被 new Function 重编译，不能引用闭包函数
								var ce = null;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].hasMark('mgj_ce')) { ce = game.players[i]; break; }
								}
								'step 0'
								if (!ce) { event.finish(); return; }
								player.chooseBool('是否移除「策」标记？').set('ai', function () { return false; });
								'step 1'
								if (result && result.bool) {
									ce.removeMark('mgj_ce', 1);
									game.log(player, '移除了', ce, '的标记', '#g【策】');
								}
								event.finish();
							},
						},

						// ============ 铸策 ============
						mgj_zhuce: {
							trigger: { player: 'phaseBegin' },
							filter: function (event, player) {
								return findCeTarget() != null;
							},
							// B1：原实现把 'step 1'..'step 7' 写在 if/else 块内。
							// parsex 把 'step N' 替换成 break;case N:，而 JS 禁止 case 标签出现在
							// switch 内嵌套的块中 → 该处替换非法：
							//   · finalParsex=='old' 分支（game.js:12072-12090）：无 try/catch → 直接抛 SyntaxError
							//   · Legacy() 分支（game.js:12094-12133）：有 try/catch → 静默跳过，
							//     13 个 step 全残留、结束步停在 K=1，content 退化为单个 case 0 直线代码：
							//     四个 chooseBool 在同一 step 内连续创建，其后的 if(result.bool)
							//     读到的仍是初值 {} → 四个效果一个都不会被添加
							//
							// 修法：步骤标记一律顶格，且**每一步都重复写自己的条件**。
							// 后者是必须的 —— 若第 N 步没弹询问，第 N+1 步的 result 会是上一步遗留的旧值，
							// 不重复条件就可能错误地"落实"一个根本没问过的效果。
							content: function () {
								// ★ content 会被 parsex/Legacy 用 new Function 重新编译（game.js:12131），
								//   新函数运行在**全局作用域** → 包闭包里的 findCeTarget / ceX 会变成 undefined。
								//   因此此处把查找逻辑内联，不引用任何闭包函数。
								//   （filter 不经过编译，仍可安全使用闭包函数）
								var ce = null;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].hasMark('mgj_ce')) { ce = game.players[i]; break; }
								}
								// ★ 语义修正（卡面一致性）：
								//   卡面写的是「你给「策」添加以下**其中一项**效果」——每回合只能选一项。
								//   原实现（以及本文件的上一版）是四项 chooseBool 依次询问、可全答"是"，
								//   每回合能拿满四项 —— 代码结构与原版一致，但与卡面不符。
								//   现改为真正的四选一：用一个 chooseControl 列出当前可选项。
								//
								// ★ 跨步数据必须挂在 event 上：每个 step 都是**独立编译的函数**，
								//   局部变量（含 stepHead 里的 var）不跨步共享。
								//
								// dsh-lint: ignore-mark mgj_picked1 mgj_picked2 mgj_picked3
								//   ↑ 上面三个是纯记账标记（记录①②③是否已被添加过），刻意不渲染到头像上。
								//     markSkill 在缺 intro 时会直接 return（game.js:27412-27417），
								//     正好借这个特性实现"不可见"；此处显式声明意图，免得被 lint-extension
								//     的 C6 反复提醒。
								'step 0'
								if (!ce) { event.finish(); return; }
								var keys = [];
								var labels = [];
								if (ce.countMark('mgj_picked1') < 1) { keys.push('mgj_eff1'); labels.push('①回复体力（限一次·永久）'); }
								if (ce.countMark('mgj_picked2') < 1) { keys.push('mgj_eff2'); labels.push('②额外出牌阶段（限一次·永久）'); }
								if (ce.countMark('mgj_picked3') < 1) { keys.push('mgj_eff3_perm'); labels.push('③伤害+1（限一次·永久）'); }
								keys.push('mgj_eff4_perm');
								labels.push('④跳过弃牌阶段');
								event.mgjKeys = keys;
								event.mgjLabels = labels;
								if (keys.length == 1) {
									// 前三项已全部用尽，只剩④ —— 免询问，直接落实
									event._result = { control: labels[0] };
								}
								else {
									player.chooseControl(labels)
										.set('prompt', '铸策：选择本回合给「策」添加的效果（每回合一项）')
										.set('ai', function () { return 0; });
								}
								'step 1'
								var idx = -1;
								if (result) {
									if (typeof result.index == 'number') idx = result.index;
									else if (result.control) idx = event.mgjLabels.indexOf(result.control);
								}
								if (idx < 0) idx = event.mgjLabels.length - 1; // 兜底：④
								var key = event.mgjKeys[idx];
								if (key == 'mgj_eff1') {
									ce.addMark('mgj_eff1', 1);
									ce.addMark('mgj_picked1', 1);
									game.log(player, '给「策」添加了效果', '#g【回复体力】');
								}
								else if (key == 'mgj_eff2') {
									ce.addMark('mgj_eff2', 1);
									ce.addMark('mgj_picked2', 1);
									game.log(player, '给「策」添加了效果', '#g【额外出牌阶段】');
								}
								else if (key == 'mgj_eff3_perm') {
									ce.addMark('mgj_eff3_perm', 1);
									ce.addMark('mgj_picked3', 1);
									game.log(player, '给「策」添加了效果', '#g【伤害+1】');
								}
								else {
									ce.addMark('mgj_eff4_perm', 1);
									game.log(player, '给「策」添加了效果', '#g【跳过弃牌阶段】');
								}
								event.finish();
							},
						},
						// —— 铸策·愈：回合开始回复体力 ——
						// B4：原 trigger:{player:'phaseBegin'} + filter 判 player.hasMark('mgj_ce')，
						// 但 player 是技能拥有者（谋郭嘉），而 mgj_ce / mgj_eff1 都在「策」持有者身上
						// → 条件恒 false、效果永不发动。改为监听全场、用 trigger.player 指代持有者。
						mgj_eff1: {
							forced: true,
							sub: true,
							popup: false,
							// B11：补 intro，使「愈」标记能真正渲染（markSkill 无 intro 时直接 return）
							intro: { name: '铸策·愈', content: '你的回合开始时回复1点体力（效果永久存在）。' },
							trigger: { global: 'phaseBegin' },
							filter: function (event) {
								var ce = findCeTarget();
								return ce != null && event.player == ce && ce.countMark('mgj_eff1') > 0;
							},
							content: function () {
								// ── B12：①③④ 的消耗语义（实测纠正）──────────────────
								// 卡面的「限一次」限制的是**添加**（只能添加一次，由 mgj_zhuce 的
								// mgj_picked1 守卫实现），不是**发动**次数。效果一旦添加即**永久存在**，
								// 与 ③【伤害+1】（原实现即永久）语义一致，也才与 ceX()「策中已添加的
								// 效果数量」这个恒增量吻合。原实现在这里 removeMark，回复一次后效果即消失、
								// 且 ceX() 凭空掉 1，属于把「限一次」误解为「一次性」。
								// 只有 ④【跳过一次弃牌阶段】是真正的消耗品（用一次扣一个）。
								//
								// 时机正确性：phaseBegin 在 phaseLoop 的 'step 7'
								// （game.js:15953-15956，注释即「回合开始后⑨」）触发，早于 'step 8'
								// 才创建的阶段序列（player[event.currentPhase]()，game.js:15965-15968），
								// 即 phaseBegin = 回合开始、每回合仅一次 —— 故永久化不会变成每阶段回血。
								var ce = trigger.player;
								if (ce.countMark('mgj_eff1') > 0) {
									ce.recover(1);
									game.log(ce, '「策」效果', '#g【回复体力】');
								}
								event.finish();
							},
						},
						// —— 铸策·再战：额外执行一个出牌阶段（不摸牌） ——
						mgj_extra_phase: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { global: 'phaseBegin' },
							filter: function (event) {
								var ce = findCeTarget();
								return ce != null && event.player == ce && ce.countMark('mgj_eff2') > 0;
							},
							content: function () {
								// ── B12：①永久化（同 mgj_eff1，不再 removeMark）
								// ── B12b：插队姿势改为 trigger.next.push(next) ──
								// ⚠ 勘误：早先这里写的是「本包 17 处全部是这个写法」——**那是错的**，
								//   我当时只读了 sb.js / jsrg.js 两处就推广到全库（抽样代替普查）。
								//   用 atlas/tools/idiom.mjs 做全库聚类后，真实分布是：
								//     event.next.remove → trigger.next.push          8 处
								//     event.next.remove → trigger.getParent() → next…  7 处
								//     其他机制（insertPhase / 直接 phaseUse）          2 处
								//   即 8 : 7，**不存在压倒性写法**，语料不能当判决用。
								//
								//   最终选 trigger.next.push 的依据是**引擎主循环语义**，不是票数：
								//   event.next 队列是在「当前事件每一步之间」被消费的（game.js 41700 附近）；
								//   trigger 是**触发事件自身**（game.js:41675 trigger=event._trigger，
								//   {player:'phaseBegin'} 的触发事件即 phaseLoop），所以挂 trigger.next 会落在
								//   phaseLoop 的 step 7（触发 phaseBegin）与 step 8（建立 phaseList 各阶段，
								//   game.js:15965-15968）之间 —— 正是「紧接着回合开始」；
								//   而 trigger.getParent().next 是父事件队列，要等 phaseLoop 整体跑完，
								//   即排到整个回合之后。同派先例：sb.js:3951 琉璃 / jsrg.js:317 离叛 /
								//   yijiang.js:7399 当先（卡面与②逐字同义）。
								var ce = trigger.player;
								var next = ce.phaseUse();
								event.next.remove(next);
								trigger.next.push(next);
								game.log(ce, '「策」效果', '#g【额外出牌阶段】');
							},
						},
						// —— 铸策·锐：使用牌造成的伤害+1（单目标） ——
						mgj_boost: {
							forced: true,
							sub: true,
							popup: false,
							// B4：原 {source:'damageBegin'} 只在自己是伤害来源时触发；
							// 效果应作用于「策」持有者造成的伤害 → 改监听全场并比对 event.source
							trigger: { global: 'damageBegin' },
							filter: function (event) {
								var ce = findCeTarget();
								if (ce == null || event.source != ce) return false;
								if (ce.countMark('mgj_eff3_perm') < 1) return false;
								if (!event.card) return false;
								// 卡面：仅「使用牌」造成的伤害，且单目标（排除南蛮/万箭等 AOE）
								var info = get.info(event.card);
								if (!info || info.selectTarget != 1) return false;
								return true;
							},
							content: function () {
								// B5：引擎的伤害值是 event.num（game.js:41674 var num=event.num），
								// event.damage 在 game.js 中出现 0 次 → 原写法是空操作
								trigger.num += 1;
							},
						},
						// —— 铸策·逸：跳过一次弃牌阶段（④，唯一真正的消耗品） ——
						//
						// ── B16：④ 的标记活不过持有者的回合 ────────────────────────
						// 设计语义（作者确认）：④ 添加次数不限，但标记在**持有者回合结束时被弃掉**，
						// 因此 mgj_eff4_perm 恒 ∈ {0,1} ⇒ X = ①②③ + ④ ≤ 4 ⇒ 沥血一次体力变动
						// 至多摸 X+1 = 5 张。「最多一血5牌」这个上界就是靠这条保证的。
						//
						// 原实现只在 phaseDiscardBefore 消耗标记，存在漏洞：
						//   若弃牌阶段被**别的东西**跳过（player.skip('phaseDiscard')），
						//   该事件会走 game.js:41724 的 `event.trigger(next.name+'Skipped')` 分支，
						//   而 XBefore / XBegin 都不发射（game.js:41747-41763）
						//   → 标记不被消耗、下一轮铸策再叠一个 → X 漂到 5，
						//   正好打破上面那个上界。故补 phaseLoopEnd 兜底清空。
						//
						// 时机可信度：phaseLoop 由 game.js:43537-43541 创建且 next.player=player；
						//   其 'End' 由 game.js:41714 的 event.name+'End' 合成 → 每回合恰好一次。
						//
						// 分支依据：★ 不能用 trigger.name —— trigger 是**真实事件**
						//   （phaseDiscard / phaseLoop，见 game.js:41675 trigger=event._trigger），
						//   触发时机名在 event.triggername（game.js:15554 next.triggername=...）。
						mgj_skip: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { global: ['phaseDiscardBefore', 'phaseLoopEnd'] },
							filter: function (event) {
								var ce = findCeTarget();
								return ce != null && event.player == ce && ce.countMark('mgj_eff4_perm') > 0;
							},
							content: function () {
								var ce = trigger.player;
								if (event.triggername == 'phaseDiscardBefore') {
									// 用到一次：取消该弃牌阶段并消耗一个标记
									// （取消弃牌阶段必须取消**触发源事件**）
									trigger.cancel();
									ce.removeMark('mgj_eff4_perm', 1, false);
									game.log(ce, '消耗了「策」效果', '#g【跳过弃牌阶段】');
								}
								else {
									// 回合结束：没用掉的标记一律弃置 —— 这是 X ≤ 4 的保证
									var n = ce.countMark('mgj_eff4_perm');
									if (n > 0) {
										ce.removeMark('mgj_eff4_perm', n, false);
										game.log(ce, '回合结束，弃掉了未使用的「策」效果', '#g【跳过弃牌阶段】');
									}
								}
							},
						},

						// ============ 沥血 ============
						// ── B17：可选发动 + 锁定技身份（两个正交字段）────────────────
						// 卡面原文：「锁定技，但你体力值发生变动时，**你可以**与拥有"策"的角色
						//            一起摸X+1张牌（X为"策"的效果数量）」
						// 「你可以」= 可选择不发动；「锁定技」= 只是身份标签，让**封非锁定技**
						// 的效果封不到它。引擎里这本来就是两个字段：
						//   get.is.locked()（game.js:64837-64845）只决定**分类**——
						//     64841  if(info.trigger&&info.forced) return true;
						//     64843  if(info.locked) return true;
						//     并被 game.js:60262 用来往技能栏加「锁定技」字样；
						//   而**强制发动**只看 forced：game.js:15415 `if(!event.revealed&&!info.forced)`
						//     不满足才走 chooseBool 询问分支。
						// 故原 `forced:true` 是错的（那会连"你可以"一起吃掉）；
						// 正确写法 = 去掉 forced + 显式 locked:true。
						mgj_lixue: {
							locked: true,
							// ── 触发时机：只用 changeHp ─────────────────────────────
							// 卡面写的是「体力值发生变动时」，而引擎里**唯一**忠于这句话的事件
							// 就是 changeHp：changeHp 的内容里 event.trigger('changeHp')
							// （game.js:21008），位于 player.hp 真的改完之后，且三条路径都汇到它：
							//   · damage     → player.changeHp(-num,false)（game.js:20833）
							//   · recover    → player.changeHp(num,false)（game.js:20924，num>0 才走，
							//                  所以体力已满时不会触发 —— 符合"没变动就不触发"）
							//   · loseHp     → player.changeHp(-num)（game.js:20945）
							//   · loseMaxHp 导致当前体力溢出也会经 changeHp 结算
							//
							// ★ 原写法 trigger:{player:['damageEnd','recover','loseHpEnd']} 里有两个死事件：
							//   · 'recover'    —— 全库没有任何 `.trigger('recover')`。recover 只是被
							//                     createEvent('recover')（game.js:26366）创建，
							//                     它的内容只发 changeHp，从不发 'recover'
							//                     ⇒ 监听它等于永不触发，这就是「回复体力不摸牌」的根因。
							//   · 'loseHpEnd'  —— 引擎里根本不存在这个事件（不存在 loseHp* 的合成后缀
							//                     发射），同样是死事件；而 loseHp 已经经 changeHp 覆盖。
							//   注：atlas/tools 的 C8 会放行这两个名字，因为 C8 的合法集同时收了
							//   createEvent 的名字 —— 被 create 但从未 trigger 的事件是它的盲区。
							//
							//   只挂 changeHp 也顺带避免了重复计数：若同时挂 damageEnd 与 changeHp，
							//   一次伤害会摸两次牌（damageEnd 一次、changeHp 一次）。
							//
							// ── 「变动一次只摸一张」（决定性确认，game.js）────────────────
							// 多点伤害/回复在引擎里是**整点一次结算**，不是逐点循环：
							//   · damage 内容里只有一处 player.changeHp(-num,false)（20833），
							//     num 是这次伤害的总点数 ⇒ 3→1 这种 2 点伤害只产生 1 次 changeHp
							//   · recover 内容里只有一处 player.changeHp(num,false)（20924）
							//   · loseHp 内容里只有一处 player.changeHp(-num)（20945）
							// 所以"一次变动 = 一次 changeHp = 摸一次牌"，无需额外去重。
							// 反证：全库其它 `player.hp=` 赋值只有 20991（changeHp 内容内部）、
							//   23660/35645/39037（初始化 / 重生 / 读档恢复）—— 真实体力变动
							//   一律经 changeHp，不存在绕开它直接改 hp 的战斗路径。
							//
							// ★ forceDie:true 是必须的：引擎在 createTrigger 里对死亡玩家直接 return
							//   （game.js:40320 `if(player.isDead()&&!info.forceDie) return;`），
							//   而"体力值变动"完全可能发生在自己濒死/已阵亡的结算途中。
							forceDie: true,
							trigger: { player: 'changeHp' },
							// ── B19：不再要求场上存在「策」──────────────────────────────
							// 规则（用户明确）：**没有「策」时，体力值发生变动也摸一张牌**。
							// 原 filter 是 `findCeTarget() != null`；虽然 content 里 `if (ce)` 的写法
							// 让 X=0 时本来就会摸 1 张，但**没有「策」的整局**会被 filter 整体拦掉 ——
							// 那正是"必须持有策才摸牌"的来源。
							// 去掉 filter 后：体力一变动就发动，摸牌数由 content 里的 ce 决定
							//   · 有「策」→ X+1 张（X = 持有者身上的效果数，与卡面一致）
							//   · 无「策」→ 1 张（X 视作 0）
							// 注：filter 字段缺失时该技能**无条件通过**触发闸门 ——
							//   game.js:33060 `if(info.filter&&!info.filter(event,player,name)){ return false; }`
							//   是 truthiness 判定：info.filter 为 undefined 时整个条件为假，不拦截。
							//   故直接删掉 filter 字段即可，不需要写一个恒真函数。
							content: function () {
								// ★ 同 mgj_zhuce：content 被 new Function 重编译，findCeTarget / ceX 均不可用
								//   必须与 findCeTarget 同一套查找（含 game.dead），否则 filter 放行了、
								//   content 却找不到持有者 ⇒ x 恒 0 且只有自己摸牌。
								var ce = null;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].hasMark('mgj_ce')) { ce = game.players[i]; break; }
								}
								if (!ce) {
									var dead = game.dead || [];
									for (var d = 0; d < dead.length; d++) {
										if (dead[d] && dead[d].hasMark('mgj_ce')) { ce = dead[d]; break; }
									}
								}
								// 没有「策」时 x 保持 0 ⇒ 下面就是"摸 1 张"（B19 的规则）
								var x = 0;
								if (ce) {
									x = ce.countMark('mgj_eff1') + ce.countMark('mgj_eff2') +
										ce.countMark('mgj_eff3_perm') + ce.countMark('mgj_eff4_perm');
								}
								player.draw(x + 1, 'nodelay');
								// 持有者已阵亡时：摸到的牌对它毫无意义（发不到它手上也没法用），
								// 改成「那份也一并由你摸」—— 与卡面的"一起摸"保持总量一致。
								// （死亡玩家本身也能 draw：draw 内容不检查 isAlive，牌会进它的手牌区。）
								if (ce) {
									if (ce.isAlive && ce.isAlive()) {
										ce.draw(x + 1, 'nodelay');
									}
									else {
										player.draw(x + 1, 'nodelay');
										game.log(player, '因「策」的持有者已阵亡，额外摸' + get.cnNumber(x + 1) + '张牌');
									}
								}
								event.finish();
							},
						},

						// ============ 转·曹髦 ============
						//
						// ⚠ 全部 content 遵守两条铁律（atlas/01-引擎契约.md §2.0）：
						//   铁律一：普通函数 + 'step N' 全在顶层，绝不用 generator / 参数解构
						//   铁律二：content 里读不到包级闭包变量，辅助逻辑一律就地展开
						// 跨步数据一律挂 event（§2.0.1：每个 step 是独立编译的函数体）。
						//
						// ── 决境 ──
						// 「每轮开始时」= roundStart：game.js:15857 / 34542 两处 event.trigger('roundStart')，
						//   由 15844-15846 的 isRound 判定驱动（轮到 _status.roundStart 那位玩家时）
						//   ⇒ 每轮恰好一次 ✓ 现有先例：game.js:34464、44184 的 trigger:{global:'roundStart'}
						//
						// ── 「全场各上闪电」为什么不会堆 ────────────────────────────
						// 引擎硬规则：判定区不能有同名的延时锦囊 ——
						//   canAddJudge（game.js:26826-26840）
						//     if(this.hasJudge(name)) return false;
						// 而 addJudgeNext（26841-26853）正是闪电「迁移到下家」的实现：
						//   绕一圈找不到能接收的玩家就 game.log(card,'进入了弃牌堆')。
						// 所以「每人至多一张闪电」是引擎保证的，不需要自己维护。
						// 而且这套机制与「每轮开始时」是配套的：闪电判定成功即弃置、
						//   判定失败则流转或进弃牌堆，场上闪电总量一直在减少，
						//   每轮补一次正好维持 —— 不是无限堆积。
						cm_juejing: {
							locked: true,
							forced: true,
							trigger: { global: 'roundStart' },
							filter: function (event, player) {
								return player.isIn();
							},
							content: function () {
								'step 0'
								// 记录**每个人**摸牌前的手牌，用于事后各自找出新摸到的那张。
								// 用 playerid 作键（不能把 Player 对象当普通 JS 对象键用）；
								// 全部挂 event —— 'step 0' 与 'step 1' 是独立编译的函数体，变量不跨步
								event.cmBefore = {};
								var ps = [];
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].isIn()) ps.push(game.players[i]);
								}
								event.cmPs = ps;
								for (var i = 0; i < ps.length; i++) {
									event.cmBefore[ps[i].playerid] = ps[i].getCards('h').slice(0);
								}
								game.log(player, '发动了', '#g【决境】');
								for (var i = 0; i < ps.length; i++) {
									ps[i].draw(1, 'nodelay');
								}
								'step 1'
								// 各自把刚摸到的那张转为闪电塞进自己的判定区。
								// 写法取自全库「转化牌塞判定区」的标准姿势（至少 3 处先例）：
								//   ddd.js:1234      target.addJudge({name:'bingliang'},[card]);
								//   jsrg.js:3338     event.targets[1].addJudge({name:link.viewAs},[link]);
								//   mobile.js:15340  同上
								// 用虚拟牌形式挂**实物牌**，才是卡面说的「将此牌转为」——
								// 真正进判定区的是那张摸到的牌本身，而不是另生成一张闪电。
								// 已有闪电的人由 canAddJudge 自动跳过（=「补满」语义）。
								var ps = event.cmPs || [];
								for (var i = 0; i < ps.length; i++) {
									var p = ps[i];
									if (!p.isIn()) continue;
									if (!p.canAddJudge('shandian')) continue;
									var before = event.cmBefore[p.playerid] || [];
									var now = p.getCards('h');
									var got = null;
									for (var a = 0; a < now.length; a++) {
										var found = false;
										for (var b = 0; b < before.length; b++) {
											if (before[b] == now[a]) { found = true; break; }
										}
										if (!found) { got = now[a]; break; }
									}
									if (got) p.addJudge({ name: 'shandian' }, [got]);
								}
							},
						},
						// 决境·察电：场上任何一张闪电判定时，你摸一张牌
						//
						// ★ 判「这张判定牌是不是闪电」必须用 viewAs||name，不能用 name：
						//   本技能体系里的闪电是用 addJudge({name:'shandian'}, [card]) 造的**转化牌**，
						//   实物牌是那张被摸到的手牌 —— 它的 .name 仍是自己原本的牌名（如 'sha'），
						//   'shandian' 存在 .viewAs 里。引擎自己读延时锦囊的有效名时永远用
						//   card.viewAs || card.name（game.js:26832 canAddJudge、26844 addJudgeNext），
						//   照抄这条才是对的。
						//   写 .name 的后果：条件恒 false，技能静默永不触发（实测症状：闪电判定不摸牌）。
						//   用 viewAs||name 同时兼容实物闪电（name='shandian'）与转化闪电（viewAs='shandian'）。
						//
						// event.card 是被判定对象本身：player.judge(card) 里
						//   game.js:26892-26894  next.card = 传入的牌，next.judge = get.judge(next.card)
						cm_juejing_draw: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { global: 'judgeBefore' },
							filter: function (event, player) {
								if (!player.isIn() || !player.hasSkill('cm_juejing')) return false;
								var c = event.card;
								if (!c) return false;
								return (c.viewAs || c.name) == 'shandian';
							},
							content: function () {
								player.draw(1);
								game.log(player, '因闪电判定摸一张牌');
							},
						},
						// 决境·渡劫：自己的闪电判定成功 → 免伤 + 清场闪电 + 永久失去决境
						cm_juejing_ward: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
								// ★ 同 cm_juejing_draw：延时锦囊的有效名在 viewAs||name
								if (!player.hasSkill('cm_juejing')) return false;
								if (event.nature != 'thunder') return false;
								var c = event.card;
								if (!c) return false;
								if ((c.viewAs || c.name) != 'shandian') return false;
								// ★★ 铁索连环传播过来的伤害必须排除。
								//   卡面写的是「当你**进行闪电判定**时判定成功」——只有自己头上那张闪电
								//   判定成功造成的伤害才算渡劫；别人被闪电劈中后经铁索传导到自己身上的
								//   那一下不算（否则会被链式误触，直接永久丢掉决境）。
								//   引擎机制（game.js:34766-34795 内部技能 _lianhuan）：
								//     链条把原始伤害的 cards / card / nature **原样**转给下家
								//     （event._args=[trigger.num,trigger.nature,trigger.cards,trigger.card]），
								//     所以传导伤害身上同样挂着那张闪电牌与 thunder 属性 —— 光看牌名分不出来。
								//   唯一的可靠判据是父事件名：原始伤害的父事件不是 _lianhuan*，
								//   传导伤害的父事件正是 _lianhuan / _lianhuan2。
								//   引擎自己就是这么判的（game.js:34809 用 trigger.getParent().notLink()），
								//   这里直接复用引擎提供的 event.notLink()（game.js:32253-32255）。
								return event.notLink();
							},
							content: function () {
								'step 0'
								// 防伤的唯一不变量写法：取消**触发源事件**。
								// idiom.mjs 查「防止伤害」：全库 19 处、16 种变体，
								// 唯一都出现的就是 trigger.cancel()（event.cancel() 取消的是技能自身事件）
								trigger.cancel();
								game.log(player, '免疫了闪电伤害，渡劫成功');
								'step 1'
								// 弃置**在场角色**判定区内的闪电（含因判定失败迁移到别人头上的那张）。
								// 这里同样必须 viewAs||name —— 判定区里的闪电是转化牌
								for (var i = 0; i < game.players.length; i++) {
									var p = game.players[i];
									if (!p.isIn()) continue;
									var js = p.getCards('j');
									for (var j = 0; j < js.length; j++) {
										if ((js[j].viewAs || js[j].name) == 'shandian') p.discard(js[j]);
									}
								}
								'step 2'
								player.removeSkill('cm_juejing');
								game.log(player, '失去了技能', '#g【决境】');
							},
						},

						// ── 奇技 ──
						// ① 回合结束时，夺取本回合未被你伤害过的角色各一张牌（锁定、必然发动）
						cm_qiji: {
							locked: true,
							forced: true,
							trigger: { player: 'phaseJieshuAfter' },
							filter: function (event, player) {
								for (var i = 0; i < game.players.length; i++) {
									var p = game.players[i];
									if (p == player || !p.isIn()) continue;
									// getHistory 天然按**本回合**分段；sourceDamage = 你造成的伤害
									if (player.getHistory('sourceDamage', function (evt) { return evt.player == p; }).length == 0) return true;
								}
								return false;
							},
							content: function () {
								var targets = [];
								for (var i = 0; i < game.players.length; i++) {
									var p = game.players[i];
									if (p == player || !p.isIn()) continue;
									// ★ 这里的内层匿名函数闭包捕获的是 content 体内的 var p，
									//   属**同一函数体**的局部变量，不是包级闭包 → 不受铁律二约束
									if (player.getHistory('sourceDamage', function (evt) { return evt.player == p; }).length == 0) targets.push(p);
								}
								if (!targets.length) { event.finish(); return; }
								game.log(player, '发动了', '#g【奇技】');
								for (var i = 0; i < targets.length; i++) {
									// 'hej' = 手牌/装备/判定三区任选一张（game.js:25380 的 position 参数）
									player.gainPlayerCard(targets[i], 'hej', true);
								}
							},
						},
						// ② 受伤时弃判定区一张牌免伤。卡面写「你可以」→ 非 forced + locked（同沥血 B17）
						cm_qiji_guard: {
							locked: true,
							sub: true,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
								// 与 content 保持同一套枚举（都走判定区 DOM 节点），避免两者判据不一致
								var node = player.node && player.node.judges;
								if (!node) return false;
								for (var i = 0; i < node.childNodes.length; i++) {
									var c = node.childNodes[i];
									if (!c || !c.name) continue;
									if (c.classList && (c.classList.contains('removing') || c.classList.contains('feichu'))) continue;
									// 与 content 的道具可用性保持一致：真的弃不掉的牌不算「可以选择」
									if (!lib.filter.canBeDiscarded(c, player, player)) continue;
									return true;
								}
								return false;
							},
							content: function () {
								'step 0'
								// ★★ 判定区必须走 choosePlayerCard，不能用 chooseCard。
								//   实测根因：chooseCard 只认手牌/装备两个区 ——
								//     ① 提示词拼装（game.js:17907-17909）只处理 position=='h'（手牌）
								//        与 =='e'（装备），**'j' 没有任何分支**；
								//     ② 内容函数 chooseCard（game.js:17877）从头到尾不读 event.position 去建
								//        卡牌按钮，也就是说 'j' 这个位置参数被静默忽略 →
								//        对话框里根本不会出现判定区的牌，玩家点不到任何东西。
								//   判定区的选择器只有 choosePlayerCard（game.js:18459-18468 / 18614-18623 /
								//   18793-18802 三处都是 choosePlayerCard），它自己有
								//   `else if(event.position[i]=='j')` 分支，会 build「判定区」标题 + 那些牌。
								//   本扩展自己的奇技①「夺取一张牌」用的 gainPlayerCard('hej') 也是同一族。
								//   filterButton 用 get.position(button.link)=='j'——引擎里判断一张牌的区
								//   就是 get.position 的固定用法。
								player.choosePlayerCard(player, 'j', '奇技：弃置一张判定区内的牌，并免疫此伤害')
									.set('filterButton', function (button) {
										return get.position(button.link) == 'j';
									})
									.set('ai', function (button) { return 10 - get.value(button.link); });
								'step 1'
								// 判定区的牌必须用 lose 送进弃牌堆，不能走 discard()：
								//   lose 的合法区检查是 getCards('hejsx')（game.js:26226，**含 'j'**），
								//   而 discard→lose 同样能走通；但 lose 的内容会调 ui.updatej(player)
								//   （game.js:20638）把判定区的 DOM 节点真正摘掉，这才是清理判定区的正路。
								//   实物牌 .name 与转化名 .viewAs 都不用管：lose 只按 DOM 节点移动。
								if (result.bool && result.cards && result.cards.length) {
									player.lose(result.cards, ui.discardPile, 'visible');
									// 防伤的唯一不变量写法：取消**触发源事件**
									// （idiom.mjs 查「防止伤害」：全库 19 处 16 种变体，
									//   唯一都出现的就是 trigger.cancel()）
									trigger.cancel();
									game.log(player, '发动了', '#g【奇技】');
								}
							},
						},
						// ③ 有人受 ≥2 点伤害时，二选一摸牌。「你可以」→ 非 forced
						cm_qiji_seize: {
							locked: true,
							sub: true,
							trigger: { global: 'damageEnd' },
							filter: function (event, player) {
								return player.isIn() && event.num >= 2;
							},
							content: function () {
								'step 0'
								var x = player.hp;
								var y = 0;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].isIn()) y += game.players[i].countCards('j');
								}
								event.cmX = x;
								event.cmY = y;
								player.chooseControl('①摸' + x + '张牌（X为你的体力值）', '②摸' + y + '张牌（Y为全场判定区内牌数的总和）')
									.set('prompt', '奇技：选择一项')
									.set('ai', function () { return 0; });
								'step 1'
								var idx = (result && typeof result.index == 'number') ? result.index : 0;
								player.draw(idx == 1 ? event.cmY : event.cmX);
								game.log(player, '发动了', '#g【奇技】');
							},
						},

						// ── 讨贼 ──
						// 牌堆顶/底（game.js:21521-21524 是引擎自带的实现）：
						//   ui.cardPile.insertBefore(card, ui.cardPile.firstChild)   → 牌堆顶（最先摸到）
						//   ui.cardPile.appendChild(card)                            → 牌堆底（最后摸到）
						// 故「牌堆底的牌」= ui.cardPile.lastChild
						cm_taozei: {
							locked: true,
							forced: true,
							trigger: { global: 'roundStart' },
							filter: function (event, player) {
								return player.isIn() && player.countCards('he') > 0;
							},
							content: function () {
								'step 0'
								player.chooseToDiscard('he', [1, Infinity], '讨贼：可将任意张牌置于牌堆底')
									.set('ai', function (card) { return -get.value(card); });
								'step 1'
								if (!result.bool || !result.cards || !result.cards.length) { event.finish(); return; }
								var cards = result.cards;
								if (typeof player.storage.cm_taozei_n != 'number') player.storage.cm_taozei_n = 0;
								player.storage.cm_taozei_n += cards.length;
								player.lose(cards, ui.cardPile, 'visible');
								for (var i = 0; i < cards.length; i++) ui.cardPile.appendChild(cards[i]);
								game.log(player, '将', get.cnNumber(cards.length), '张牌置于牌堆底（累计', player.storage.cm_taozei_n, '张）');
								'step 2'
								// 「以此法放于牌堆底的牌大于你的体力上限」→ 获得本轮的使用许可
								if (player.storage.cm_taozei_n <= player.maxHp) { event.finish(); return; }
								player.addTempSkill('cm_taozei_free');
								'step 3'
								// 循环：反复使用牌堆底的牌，直到无法使用为止
								if (!player.isIn()) { event.finish(); return; }
								var card = ui.cardPile.lastChild;
								if (!card || !card.name) { event.finish(); return; }
								// ★ 判「这张牌能不能用」要用 hasUseTarget，**不能**用 canUse(card, player)：
								//   canUse 的第二个参数是**目标**（game.js:27651-27659，最后一行
								//   lib.filter.targetEnabled(card,this,target)），传自己等于「能否对自己使用这张牌」——
								//   杀/决斗/顺手牵羊这类牌对自己非法 ⇒ 恒 false ⇒ 后续整段不执行。
								//   实测症状：讨贼达标后不触发从牌堆底使用牌。
								//   hasUseTarget（game.js:27660-27665）才是「场上存在某个合法目标」。
								//   distance=false 忽略距离，includecard=false 不再查次数（次数由 mod.cardUsable 放开）
								if (!player.hasUseTarget(card, false, false)) { event.finish(); return; }
								// 先从牌堆摘出，否则使用后那张牌还会留在牌堆里
								ui.cardPile.removeChild(card);
								event.cmCard = card;
								game.log(player, '讨贼：从牌堆底取用', card);
								// ★ 用 chooseUseTarget 而不是 chooseToUse：
								//   前者能把「用哪张牌」锁死成传入的这张（game.js:25034 next.card=...），
								//   后者会放玩家用手牌里的任意牌，与「使用牌堆底的牌」不符。
								//   字符串 'nodistance' → next.nodistance=true（game.js:25056-25057），
								//   正是卡面的「无视距离限制」。
								player.chooseUseTarget(card, 'nodistance');
								'step 4'
								if (result.bool) {
									// 已使用 → 引擎会把它送进弃牌堆
									game.updateRoundNumber();
									event.goto(3);
								}
								else {
									// 取消 → 把牌放回牌堆底，收工
									var back = event.cmCard;
									if (back) ui.cardPile.appendChild(back);
									event.finish();
								}
							},
						},
						// 「无视次数、距离限制」的载体：无名杀用 mod 实现，
						// 卡面要的两条正好各对应一个 —— cardUsable（次数）/ targetInRange（距离）。
						// mod 技能按惯例不进武将数组（它不靠触发，靠被拥有时被 getSkills 读到）
						cm_taozei_free: {
							charlotte: true,
							sub: true,
							mod: {
								// 返回 num+99 而非 Infinity —— 无名杀里大量先例用大常数，
								// 避免 Infinity 参与某些数值比较时出边界问题
								// ★★ num 可能是 undefined：**牌定义里没有 usable 字段时，引擎传进来的就是 undefined**
								//   （锦囊/装备全都没有这个字段；全库只有【杀】standard.js:91 和【酒】extra.js:62 写了 usable:1）。
								//   旧写法 `num + 99` 会算出 NaN，而引擎的守卫 `if(typeof num!='number')`
								//   放行 NaN（NaN 的 typeof 就是 'number'，game.js:33228），
								//   紧接着 `player.countUsed(card) < NaN` 恒为 false（game.js:33231）
								//   ⇒ **这张牌直接变成「不可使用」**。事故三连（陆逊只能用酒杀 / 陆抗判定区失效后
								//   用不了锦囊 / 自制武将有时只能用基本牌）同一个根因，详见 docs/四将开发笔记 §10。
								cardUsable: function (card, player, num) {
									if (num === false) return false;      // 别的技能已判定「不可使用」⇒ 不覆盖它
									if (typeof num != 'number') num = 0;  // 牌本身没有次数上限 ⇒ 当作 0 再加
									return num + 99;
								},
								targetInRange: function (card, player, target) { return true; },
							},
						},

						// ============ B11：标记显示壳（纯显示，无 trigger/content） ============
						// 「策」与铸策效果标记都直接挂在角色身上（通过 addMark），
						// 而 markSkill 在 lib.skill[标记名].intro 缺失时会**直接 return、不渲染任何标记**
						// （game.js:27412-27417）→ 玩家看不出「策」在谁身上、已有哪些效果。
						//
						// 下面四个是纯显示用空壳：不含任何逻辑，也**不在武将数组里**
						// （因此不会被任何人"拥有"，只提供 intro 供 markSkill 取用）。
						// 注意 mgj_eff2 / mgj_eff3_perm / mgj_eff4_perm 的标记名与技能名不同名
						// （技能分别是 mgj_extra_phase / mgj_boost / mgj_skip），故必须单独补壳。
						mgj_ce: {
							charlotte: true,
							sub: true,
							intro: { name: '策', content: '谋郭嘉·魂的「策」。你与其相互间无法造成伤害。' },
						},
						mgj_eff2: {
							charlotte: true,
							sub: true,
							intro: { name: '铸策·再战', content: '你的回合开始时，额外执行一个出牌阶段（不摸牌，效果永久存在）。' },
						},
						mgj_eff3_perm: {
							charlotte: true,
							sub: true,
							intro: { name: '铸策·锐', content: '你使用单目标牌造成的伤害+1（永久，不移去）。' },
						},
						mgj_eff4_perm: {
							charlotte: true,
							sub: true,
							intro: { name: '铸策·逸', content: '你的弃牌阶段开始时，移去此标记并跳过该阶段。若到你回合结束时仍未用掉，直接弃置（故至多同时存在 1 个）。' },
						},

						// ============================================================
						// ==== 2026-09-12 新增：神威技类别机制 + 四武将 ====
						//
						// 类别规则（用户定义，见 README）：神威技初始使用次数为 1；
						// 当你击杀一名角色时使用次数 +1，该加成每局游戏限触发一次
						// （即整局至多 2 次）。首杀充能为锁定效果。
						//
						// 记账位：player.storage.tdgx_sw[技能名] = 剩余次数（init 置 1）
						//        player.storage.tdgx_sw_bonus[技能名] = 是否已领过首杀加成
						// 各神威技的 filter 检查剩余次数、content 开头扣减 —— 引擎的
						// limited:true 只支持「一次性」，不适用于「1+首杀」模型，故手工记账。
						// ============================================================
						tdgx_shenwei_kill: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							// source 侧挂 dieAfter：event.source 即击杀者（先例 refresh.js:14226 等）
							trigger: { source: 'dieAfter' },
							filter: function (event, player) {
								if (event.source != player) return false;
								var list = ['lx_zhangcai', 'mlb_zhangwu', 'dy_miewu', 'lkang_beishui', 'mzy_jichu', 'mpx_wantu'];
								for (var i = 0; i < list.length; i++) {
									if (player.hasSkill(list[i]) && !(player.storage.tdgx_sw_bonus && player.storage.tdgx_sw_bonus[list[i]])) return true;
								}
								return false;
							},
							content: function () {
								var list = ['lx_zhangcai', 'mlb_zhangwu', 'dy_miewu', 'lkang_beishui', 'mzy_jichu', 'mpx_wantu'];
								for (var i = 0; i < list.length; i++) {
									var s = list[i];
									if (player.hasSkill(s) && !(player.storage.tdgx_sw_bonus && player.storage.tdgx_sw_bonus[s])) {
										if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
										if (!player.storage.tdgx_sw_bonus) player.storage.tdgx_sw_bonus = {};
										player.storage.tdgx_sw_bonus[s] = true;
										if (player.storage.tdgx_sw[s] == undefined) player.storage.tdgx_sw[s] = 1;
										player.storage.tdgx_sw[s]++;
										game.log(player, '击杀角色，', '#g【' + get.translation(s) + '】', '的使用次数+1');
									}
								}
							},
						},
						// 每回合开始的记账复位（幂等；多名持有者各自执行一次无害）：
						//  · mlb_rd_used / mlb_xh_log —— 刘备两个「每回合限一次」
						//  · lkang_kj_restore —— 陆抗抗晋「每回合回复区域限两次」
						//  · 回合拥有者的 lx_cy_used —— 陆逊炽炎「出牌阶段限X次」
						tdgx_turn_reset: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { global: 'phaseBegin' },
							content: function () {
								var ps = game.players.concat(game.dead || []);
								for (var i = 0; i < ps.length; i++) {
									var p = ps[i];
									if (!p.storage) continue;
									if (p.storage.mlb_rd_used) p.storage.mlb_rd_used = 0;
									if (p.storage.mlb_xh_log) p.storage.mlb_xh_log = {};
									if (p.storage.lkang_kj_restore) p.storage.lkang_kj_restore = 0;
								}
								if (trigger.player && trigger.player.storage) {
									trigger.player.storage.lx_cy_used = 0;
								}
							},
						},

						// ============ 名·陆逊 ============
						// 连营：失去牌分支 + 空手补牌分支（同一次 loseAfter 内结算）
						// ★ 判「非使用和打出」：useCard 与 respond 的 lose 都带 type=='use'
						//   （game.js:19152 / 20063），故 type!='use' 恰好排除使用与打出，
						//   弃置 / 被获得 / 被弃 / 顶装等全部计入 —— 与卡面语义一致。
						// ★ trigger 是 lose 事件（技能自身事件是 event），判 trigger.type。
						lx_lianying: {
							locked: true,
							forced: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { player: 'loseAfter' },
							filter: function (event, player) {
								return !!(event.cards && event.cards.length);
							},
							content: function () {
								if (trigger.type != 'use') {
									// ★ 获得数量（2026-09-13 用户校准）：X = 本次失去牌数 ÷ 2 向上取整
									//   （原为按次 +1）。filter 已保证 trigger.cards 非空 ⇒ qn ≥ 1。
									var qn = Math.ceil(trigger.cards.length / 2);
									player.addMark('lx_qian', qn);
									game.log(player, '获得了', get.cnNumber(qn), '个「谦」');
								}
								// ★「没有牌」口径修正（2026-09-13 用户校准）：没有**手牌**即触发，
								//   不再要求装备区/判定区全空（原先 hej 全空的判据导致"还有装备时
								//   失去最后一张手牌不摸"，即用户报的「有时候没有手牌后不能摸牌」）。
								if (player.countCards('h') == 0 && player.isIn()) {
									var n = player.maxHp - player.countCards('h');
									if (n > 0) {
										player.draw(n);
										game.log(player, '没有手牌，将手牌摸至体力上限');
									}
								}
							},
						},
						// 连营·清囊：出牌阶段开始时按「谦」摸牌并全弃
						lx_lianying_draw: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseUseBegin' },
							filter: function (event, player) {
								return player.countMark('lx_qian') > 0;
							},
							content: function () {
								var n = player.countMark('lx_qian');
								player.removeMark('lx_qian', n);
								player.draw(n);
								game.log(player, '摸了', get.cnNumber(n), '张牌并弃置了所有的「谦」');
							},
						},
						// 连营·复盘：结束阶段，使用+打出数 ≤ 体力值 → 摸弃牌阶段弃置数
						// 「弃牌阶段弃置的牌」判据：type=='discard' 且父链上有 phaseDiscard
						// （先例 diy.js:2445 evt.type!='discard'||evt.getParent('phaseDiscard')）
						lx_lianying_end: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseJieshuBegin' },
							filter: function (event, player) {
								var used = player.getHistory('useCard').length + player.getHistory('respond').length;
								if (used > player.hp) return false;
								var n = 0;
								var history = player.getHistory('lose');
								for (var i = 0; i < history.length; i++) {
									var evt = history[i];
									if (evt.type == 'discard' && evt.getParent('phaseDiscard') && evt.cards) n += evt.cards.length;
								}
								return n > 0;
							},
							content: function () {
								var n = 0;
								var history = player.getHistory('lose');
								for (var i = 0; i < history.length; i++) {
									var evt = history[i];
									if (evt.type == 'discard' && evt.getParent('phaseDiscard') && evt.cards) n += evt.cards.length;
								}
								player.draw(n);
								game.log(player, '摸了等同于弃牌阶段弃置牌数的', get.cnNumber(n), '张牌');
							},
						},
						// 炽炎①：出牌阶段主动技，限轮次次
						// ★ usable 只支持静态数字（game.js:15528），「X为游戏轮次」用
						//   storage.lx_cy_used 对照 game.roundNumber 手工实现；
						//   计数在回合开始由 tdgx_turn_reset 清零。
						lx_chiyang: {
							audio: 2,
							enable: 'phaseUse',
							filter: function (event, player) {
								if (player.countCards('he') < player.hp) return false;
								var used = player.storage.lx_cy_used || 0;
								return used < game.roundNumber;
							},
							content: function () {
								'step 0'
								if (player.storage.lx_cy_used == undefined) player.storage.lx_cy_used = 0;
								player.storage.lx_cy_used++;
								player.chooseToDiscard('he', player.hp, '炽炎：弃置' + get.cnNumber(player.hp) + '张牌（等同于当前体力值）')
									.set('ai', function (card) { return 6 - get.value(card); });
								'step 1'
								if (!result.bool || !result.cards || result.cards.length < player.hp) {
									player.storage.lx_cy_used--;
									event.finish(); return;
								}
								player.chooseTarget('炽炎：对一名角色造成1点火焰伤害', function (card, player, target) {
									return target.isIn();
								}).set('ai', function (target) {
									return get.damageEffect(target, _status.event.player, _status.event.player);
								});
								'step 2'
								if (result.bool && result.targets && result.targets.length) {
									event.lxTarget = result.targets[0];
									var dmg = event.lxTarget.damage(1, 'fire');
									dmg.lx_cy = true;
									player.line(event.lxTarget, 'fire');
									game.log(player, '对', event.lxTarget, '造成了1点火焰伤害');
								}
								else {
									event.finish(); return;
								}
								'step 3'
								if (player.countCards('he') > 0) {
									player.chooseToDiscard('he', 1, '炽炎：是否弃置一张牌，视为使用【铁索连环】？')
										.set('ai', function (card) { return 8 - get.value(card); });
								}
								'step 4'
								if (result && result.bool && result.cards && result.cards.length) {
									player.chooseUseTarget({ name: 'tiesuo', isCard: true }, '炽炎：视为使用【铁索连环】');
								}
							},
							ai: { order: 3, result: { player: 1 } },
						},
						// 炽炎·燎原：结束阶段，本回合以此法造成的火伤 ≥ 体力值 → 群伤连环角色
						lx_chiyang_end: {
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseJieshuBegin' },
							filter: function (event, player) {
								var total = 0;
								var history = player.getHistory('sourceDamage');
								for (var i = 0; i < history.length; i++) {
									if (history[i].lx_cy) total += history[i].num;
								}
								return total > 0 && total >= player.hp;
							},
							content: function () {
								'step 0'
								var ps = [];
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].isIn() && game.players[i].isLinked()) ps.push(game.players[i]);
								}
								event.lkPs = ps;
								if (!ps.length) { event.finish(); return; }
								for (var i = 0; i < ps.length; i++) {
									ps[i].damage(1, 'fire');
								}
								game.log(player, '对所有处于连环状态的角色造成了1点火焰伤害');
								'step 1'
								var ps = event.lkPs || [];
								for (var i = 0; i < ps.length; i++) {
									var es = ps[i].getCards('e');
									if (es.length) ps[i].discard(es);
								}
							},
						},
						// 谦逊：三分支（< 判定摸牌 / > 可弃谦减伤 / = 免疫），锁定自动结算
						lx_qianxun: {
							locked: true,
							forced: true,
							popup: false,
							trigger: { player: 'damageBegin' },
							content: function () {
								'step 0'
								var n = player.countMark('lx_qian');
								// 分支标记挂 event（跨步不共享局部变量）
								if (n == player.maxHp) {
									trigger.cancel();
									game.log(player, '的「谦」等同于体力上限，免疫了此伤害');
									event.finish(); return;
								}
								if (n < player.maxHp) {
									event.lkJudge = true;
									player.judge();
								}
								else {
									event.lkJudge = false;
									if (player.countMark('lx_qian') < player.hp) { event.finish(); return; }
									player.chooseBool('谦逊：是否弃置' + get.cnNumber(player.hp) + '个「谦」，令此伤害-1？')
										.set('ai', function () { return true; });
								}
								'step 1'
								if (event.lkJudge) {
									if (result && result.color == 'red') {
										player.draw(2);
										game.log(player, '判定为红色，摸两张牌');
									}
								}
								else if (result.bool) {
									player.removeMark('lx_qian', player.hp);
									trigger.num = Math.max(0, trigger.num - 1);
									game.log(player, '弃置了「谦」，令此伤害-1');
								}
							},
						},
						// 彰才（神威技）：发动后本局使用牌无次数与距离限制
						lx_zhangcai: {
							audio: 2,
							enable: 'phaseUse',
							skillAnimation: true,
							animationColor: 'orange',
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['lx_zhangcai'] == undefined) player.storage.tdgx_sw['lx_zhangcai'] = 1;
							},
							filter: function (event, player) {
								return !!(player.storage.tdgx_sw && player.storage.tdgx_sw['lx_zhangcai'] > 0)
									&& !player.hasSkill('lx_zhangcai_mod');
							},
							content: function () {
								player.storage.tdgx_sw['lx_zhangcai']--;
								// ★ 持续时间修正（2026-09-13 用户校准）：本回合，非本局——
								//   addTempSkill 缺省过期 ['phaseAfter','phaseBefore']（game.js:28663）
								//   = 回合结束自动移除，恢复神威技的次数门槛。
								player.addTempSkill('lx_zhangcai_mod');
								game.log(player, '发动了神威技', '#g【彰才】', '，本回合使用牌无次数和距离限制');
							},
							ai: { order: 8, result: { player: 1 } },
						},
						lx_zhangcai_mod: {
							charlotte: true,
							sub: true,
							mod: {
								// ★ 必须防 num === undefined（锦囊/装备没有 usable 字段）：
								//   直接 num+99 会得 NaN ⇒ 引擎 `countUsed(card) < NaN` 恒 false ⇒ 该牌不可使用。
								//   本技能常驻在名·陆逊的武将数组里 ⇒ 症状就是「陆逊只能使用酒和杀」。见笔记 §10。
								cardUsable: function (card, player, num) {
									if (num === false) return false;
									if (typeof num != 'number') num = 0;
									return num + 99;
								},
								targetInRange: function (card, player, target) { return true; },
							},
						},
						// 「谦」标记显示壳
						lx_qian: {
							charlotte: true,
							sub: true,
							intro: { name: '谦', content: '连营的计数标记。出牌阶段开始时按数量摸牌后全部弃置；受到伤害时与体力上限比较产生不同效果。' },
						},

						// ============ 名·刘备 ============
						// 仁德：开局发 3「仁」；主公额外 +1（兴汉的开局条款并入此处结算——
						// 兴汉自身 zhuSkill，非主公时引擎在触发链整体跳过其效果，不会重复发）
						// 时机三选一 + storage 闸门，同 mgj_dingce（gameStart 不保证派发、
						// enterGame 只在 addFellow/restorePlayer 创建，gameDrawAfter 兜底）
						mlb_rende: {
							locked: true,
							forced: true,
							popup: false,
							direct: true,
							trigger: { global: ['gameStart', 'gameDrawAfter'], player: 'enterGame' },
							filter: function (event, player) {
								return !player.storage.mlb_start_done;
							},
							content: function () {
								player.storage.mlb_start_done = true;
								player.addMark('mlb_ren', 3);
								game.log(player, '获得了三个「仁」标记');
								if (player.isZhu2()) {
									player.addMark('mlb_ren', 1);
									game.log(player, '发动主公技', '#g【兴汉】', '，额外获得一个「仁」');
								}
							},
						},
						// 仁德·归心：回合开始收回全场「仁」（只遍历在世玩家；死亡者标记滞留无效果）
						mlb_rende_reclaim: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { player: 'phaseBegin' },
							filter: function (event, player) {
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i] != player && game.players[i].hasMark('mlb_ren')) return true;
								}
								return false;
							},
							content: function () {
								var got = 0;
								for (var i = 0; i < game.players.length; i++) {
									var p = game.players[i];
									if (p != player && p.hasMark('mlb_ren')) {
										var n = p.countMark('mlb_ren');
										got += n;
										p.removeMark('mlb_ren', n);
									}
								}
								if (got > 0) {
									player.addMark('mlb_ren', got);
									game.log(player, '收回了全场的「仁」（共', get.cnNumber(got), '个）');
								}
							},
						},
						// 仁德·施惠：出牌阶段开始，按身上「仁」数摸牌
						mlb_rende_draw: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseUseBegin' },
							filter: function (event, player) {
								return player.countMark('mlb_ren') > 0;
							},
							content: function () {
								var n = player.countMark('mlb_ren');
								player.draw(n);
								game.log(player, '按「仁」的数量摸了', get.cnNumber(n), '张牌');
							},
						},
						// 仁德·庇护：有「仁」者被牌指定 → 付代价令此牌无效（每回合限一次）
						// ★ useCardToTargeted 是逐目标子事件，excluded 与父 useCard 事件共享
						//   （game.js:19463/19487）→ 把父事件的全部目标塞进 excluded
						//   即整张牌无效（sb.js:2463 同族写法）。非 forced：引擎先问是否发动。
						// ★ 每回合限一次的记账位 mlb_rd_used 由 tdgx_turn_reset 复位。
						mlb_rende_nullify: {
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { global: 'useCardToTargeted' },
							filter: function (event, player) {
								if (!player.isIn()) return false;
								if (player.storage.mlb_rd_used) return false;
								if (!event.card || event.player == player) return false;
								var target = event.target;
								return !!(target && target.hasMark('mlb_ren'));
							},
							content: function () {
								'step 0'
								event.lkTarget = trigger.target;
								event.lkCard = trigger.card;
								var controls = [];
								if (player.countCards('he') >= 2) controls.push('弃置两张牌');
								if (player.hp > 0) controls.push('失去一点体力');
								if (!controls.length) { event.finish(); return; }
								player.chooseControl(controls)
									.set('prompt', '仁德：令指定' + get.translation(event.lkTarget) + '的【' + get.translation(event.lkCard) + '】无效（代价二选一）')
									.set('ai', function () {
										var cs = _status.event.controls;
										if (cs.contains('弃置两张牌') && _status.event.player.countCards('he') > 3) return cs.indexOf('弃置两张牌');
										return cs.length - 1;
									});
								'step 1'
								var c = result && result.control;
								if (!c) { event.finish(); return; }
								player.storage.mlb_rd_used = 1;
								var use = trigger.getParent();
								if (use && use.excluded && use.targets) {
									use.excluded.addArray(use.targets);
								}
								game.log(player, '发动了', '#g【仁德】', '，令', event.lkCard, '无效');
								if (c == '弃置两张牌') event.lkDiscard = true;
								else player.loseHp(1);
								'step 2'
								if (event.lkDiscard) {
									player.chooseToDiscard('he', 2, true);
								}
							},
						},
						// 仁德·布仁：结束阶段把「仁」逐个分配给不同角色（每名至多持 1 个）
						mlb_rende_give: {
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseJieshuBegin' },
							filter: function (event, player) {
								if (player.countMark('mlb_ren') <= 0) return false;
								return game.hasPlayer(function (current) {
									return current != player && !current.hasMark('mlb_ren');
								});
							},
							content: function () {
								'step 0'
								event.lkLeft = player.countMark('mlb_ren');
								'step 1'
								if (!event.lkLeft || event.lkLeft <= 0) { event.finish(); return; }
								if (!game.hasPlayer(function (current) {
									return current != player && !current.hasMark('mlb_ren');
								})) { event.finish(); return; }
								player.chooseTarget('仁德：将一个「仁」分配给一名没有「仁」的角色（剩余' + event.lkLeft + '个）', function (card, player, target) {
									return target != player && !target.hasMark('mlb_ren');
								}).set('ai', function (target) {
									return get.attitude(_status.event.player, target);
								});
								'step 2'
								if (result.bool && result.targets && result.targets.length) {
									player.removeMark('mlb_ren', 1);
									result.targets[0].addMark('mlb_ren', 1);
									event.lkLeft--;
									game.log(player, '将一个「仁」分配给了', result.targets[0]);
									event.goto(1);
								}
								else { event.finish(); return; }
							},
						},
						// 章武（神威技）：回合开始额外出牌阶段 + 本回合使用牌无次数限制
						// 插队姿势与 mgj_extra_phase 同款（trigger.next.push，判据见心得 §4.6）
						mlb_zhangwu: {
							audio: 2,
							skillAnimation: true,
							animationColor: 'orange',
							trigger: { player: 'phaseBegin' },
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['mlb_zhangwu'] == undefined) player.storage.tdgx_sw['mlb_zhangwu'] = 1;
							},
							filter: function (event, player) {
								return !!(player.storage.tdgx_sw && player.storage.tdgx_sw['mlb_zhangwu'] > 0);
							},
							content: function () {
								player.storage.tdgx_sw['mlb_zhangwu']--;
								player.addTempSkill('mlb_zhangwu_mod');
								var next = player.phaseUse();
								event.next.remove(next);
								trigger.next.push(next);
								game.log(player, '发动了神威技', '#g【章武】', '，本回合额外执行一个出牌阶段，且使用牌无次数限制');
							},
						},
						mlb_zhangwu_mod: {
							charlotte: true,
							sub: true,
							mod: {
								// ★ 同 lx_zhangcai_mod：num 可能是 undefined（锦囊/装备没有 usable），
								//   直接 +99 得 NaN ⇒ 章武发动后反而用不了锦囊/装备。见笔记 §10。
								cardUsable: function (card, player, num) {
									if (num === false) return false;
									if (typeof num != 'number') num = 0;
									return num + 99;
								},
							},
						},
						// 兴汉（主公技）：蜀势力伤害免疫（每名角色每回合限 1 次）
						// mlb_xh_log[攻击者 playerid] 由 tdgx_turn_reset 每回合清空
						// ★ filter 再加一道 isZhu2 闸门：引擎只在玩家 init 时按 zhuSkill 过滤
						//   （game.js:22930-22933），实测非主公的刘备身上出现过该技能
						//   （获得路径未定位，可能被其他扩展改写 init）——这里兜底保证
						//   非主公必定不生效，与仁德开局 +1「仁」的 isZhu2 判定同口径。
						mlb_xinghan: {
							audio: 2,
							zhuSkill: true,
							locked: true,
							forced: true,
							popup: false,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
								if (!player.isZhu2()) return false;
								var source = event.source;
								if (!source || source == player) return false;
								if (source.group != 'shu') return false;
								if (player.storage.mlb_xh_log && player.storage.mlb_xh_log[source.playerid]) return false;
								return true;
							},
							content: function () {
								if (!player.storage.mlb_xh_log) player.storage.mlb_xh_log = {};
								player.storage.mlb_xh_log[trigger.source.playerid] = true;
								trigger.cancel();
								game.log(player, '发动了', '#g【兴汉】', '，免疫了', trigger.source, '造成的伤害');
							},
						},
						// 「仁」标记显示壳
						mlb_ren: {
							charlotte: true,
							sub: true,
							intro: { name: '仁', content: '名·刘备的「仁」标记。名·刘备的回合开始时收回全部「仁」；持有者被牌指定为目标时，其可付代价令此牌无效。' },
						},

						// ============ 名·杜预 ============
						// 武库①：全场有人装备牌 → +1「备」（上限5）并摸一张
						// ★ 时机用 global:'equipAfter'（shiji.js:4957 同款先例）
						// ★「上限为5」只约束「备」标记（2026-09-13 用户校准）：
						//   备满后上装备仍摸牌，只是不再获得标记（原先 filter 把
						//   摸牌和标记绑死，备满后什么都不给——用户实测报错点）。
						dy_wuku: {
							locked: true,
							forced: true,
							popup: false,
							direct: true,
							trigger: { global: 'equipAfter' },
							filter: function (event, player) {
								return player.isIn();
							},
							content: function () {
								if (player.countMark('dy_bei') < 5) {
									player.addMark('dy_bei', 1);
								}
								player.draw(1);
							},
						},
						// 武库·启备（实现整体对齐手杀 sp_duyu 的「灭吴」，shiji.js spmiewu 当次核实）：
						// 消耗一个「备」，将一张牌当一张基本牌或普通锦囊牌使用或打出。
						// · enable:['chooseToUse','chooseToRespond']（官方数组形态）：
						//   chooseToUse 命中出牌阶段窗口与无懈窗口，chooseToRespond 命中杀/闪打出。
						// · chooseButton 把「牌名选择」内嵌进技能流程：dialog 只列当前窗口
						//   **合法**的牌名（event.filterCard 逐名校验，vcard 对传递，
						//   规避 dialog.add 裸字符串数组的崩溃）；backup.viewAs 用选中的名字。
						// · 扣费与「每回合一次」标记在 backup.precontent 结算（官方同款）：
						//   removeMark('dy_bei',1) + addTempSkill('dy_wuku_qibei_used')，
						//   后者回合结束自动过期（addTempSkill 缺省 phaseAfter/phaseBefore）。
						// · 来源牌 position 'he'（卡面「区域内的一张牌」=手牌+装备区；
						//   chooseCard 不支持判定区，atlas C11）。
						dy_wuku_qibei: {
							audio: 'wuku',
							enable: ['chooseToUse', 'chooseToRespond'],
							filter: function (event, player) {
								if (!player.countMark('dy_bei') || !player.countCards('he') || player.hasSkill('dy_wuku_qibei_used')) return false;
								for (var i of lib.inpile) {
									var type = get.type2(i);
									// 非装备牌全集 = 基本 + 普通锦囊 + 延时锦囊（2026-09-13 用户校准：延时也放）
									if ((type == 'basic' || type == 'trick' || type == 'delay') && event.filterCard({ name: i }, player, event)) return true;
								}
								return false;
							},
							chooseButton: {
								dialog: function (event, player) {
									var list = [];
									for (var i of lib.inpile) {
										var name = i;
										if (name == 'sha') {
											// ★ 普通杀按钮必须先推（官方 spmiewu 同款）——漏了它，
											//   响应南蛮/决斗时列表里只有火杀雷杀，没有普通杀。
											if (event.filterCard({ name: name }, player, event)) list.push(['基本', '', 'sha']);
											for (var j of lib.inpile_nature) {
												if (event.filterCard({ name: name, nature: j }, player, event)) list.push(['基本', '', 'sha', j]);
											}
										}
										else if (get.type2(name) == 'trick' && event.filterCard({ name: name }, player, event)) list.push(['锦囊', '', name]);
										else if (get.type2(name) == 'delay' && event.filterCard({ name: name }, player, event)) list.push(['延时锦囊', '', name]);
										else if (get.type(name) == 'basic' && event.filterCard({ name: name }, player, event)) list.push(['基本', '', name]);
									}
									return ui.create.dialog('武库·启备', [list, 'vcard']);
								},
								filter: function (button, player) {
									return _status.event.getParent().filterCard({ name: button.link[2] }, player, _status.event.getParent());
								},
								check: function (button) {
									if (_status.event.getParent().type != 'phase') return 1;
									var player = _status.event.player;
									if (['wugu', 'zhulu_card', 'yiyi', 'lulitongxin', 'lianjunshengyan', 'diaohulishan'].contains(button.link[2])) return 0;
									return player.getUseValue({ name: button.link[2], nature: button.link[3] });
								},
								backup: function (links, player) {
									return {
										filterCard: true,
										audio: 'wuku',
										popname: true,
										check: function (card) { return 8 - get.value(card); },
										position: 'he',
										viewAs: { name: links[0][2], nature: links[0][3] },
										precontent: function () {
											player.removeMark('dy_bei', 1);
											player.addTempSkill('dy_wuku_qibei_used');
										},
									};
								},
								prompt: function (links, player) {
									return '武库·启备：将一张牌当做' + (get.translation(links[0][3]) || '') + get.translation(links[0][2]) + '使用或打出';
								},
							},
							hiddenCard: function (player, name) {
								if (!lib.inpile.contains(name)) return false;
								var type = get.type2(name);
								return (type == 'basic' || type == 'trick' || type == 'delay') && player.countMark('dy_bei') > 0 && player.countCards('he') > 0 && !player.hasSkill('dy_wuku_qibei_used');
							},
							ai: {
								order: 1,
								fireAttack: true,
								respondSha: true,
								respondShan: true,
								skillTagFilter: function (player) {
									if (!player.countMark('dy_bei') || !player.countCards('he') || player.hasSkill('dy_wuku_qibei_used')) return false;
								},
								result: { player: 1 },
							},
						},
						// 启备的一次额度标记：precontent 加、回合结束自动过期（addTempSkill 缺省）
						dy_wuku_qibei_used: {
							charlotte: true,
							sub: true,
							popup: false,
						},
						// 破竹：选手牌里的一个牌名 → 本回合无次数距离限制；造成过伤害 → 本局永久
						dy_pozhu: {
							audio: 2,
							enable: 'phaseUse',
							usable: 1,
							filter: function (event, player) {
								return player.countCards('h') > 0;
							},
							content: function () {
								'step 0'
								var names = [];
								var hs = player.getCards('h');
								for (var i = 0; i < hs.length; i++) {
									var nm = hs[i].viewAs || hs[i].name;
									if (!names.contains(nm)) names.push(nm);
								}
								event.dyNames = names;
								// ★ 同武库：[list,'vcard'] 对才是标准写法；裸字符串数组会让
								//   dialog.add 把第二个牌名当按钮 type，switch 无匹配而崩溃。
								player.chooseButton(['破竹：选择一种牌名（本回合使用无次数与距离限制）', [names, 'vcard']], true);
								'step 1'
								if (!result.bool || !result.links || !result.links.length) { event.finish(); return; }
								// vcard 按钮的 link 是 [type,'',name] 三元组，牌名取 [2]
								var dyname = (typeof result.links[0] == 'string') ? result.links[0] : result.links[0][2];
								player.storage.dy_pz_name = dyname;
								player.addTempSkill('dy_pozhu_turn');
								game.log(player, '发动了', '#g【破竹】', '，本回合使用【', '#y' + get.translation(dyname), '】无次数与距离限制');
							},
							ai: { order: 2, result: { player: 1 } },
						},
						// 破竹·势：本回合生效（addTempSkill 缺省 phaseAfter 过期 = 本回合，
						// game.js:28663）；onremove 清掉临时牌名（onremove 与 content 同为
						// 被编译字段，不得引用闭包）
						dy_pozhu_turn: {
							charlotte: true,
							sub: true,
							mod: {
								cardUsable: function (card, player, num) {
									if (player.storage.dy_pz_name && (card.viewAs || card.name) == player.storage.dy_pz_name) {
										// ★ 选中的牌名若没有 usable 字段（锦囊/装备全都没有），num 就是 undefined
										//   ⇒ 必须先归零再加，否则 NaN 会让「本应无次数限制」的牌反而不可用。见笔记 §10。
										if (num === false) return false;
										if (typeof num != 'number') num = 0;
										return num + 99;
									}
								},
								targetInRange: function (card, player, target) {
									if (player.storage.dy_pz_name && (card.viewAs || card.name) == player.storage.dy_pz_name) return true;
								},
							},
							onremove: function (player) {
								delete player.storage.dy_pz_name;
							},
						},
						// 破竹·极：永久解锁名单（storage.dy_pz_perm）的常驻 mod
						dy_pozhu_perm: {
							charlotte: true,
							sub: true,
							mod: {
								cardUsable: function (card, player, num) {
									if (player.storage.dy_pz_perm && player.storage.dy_pz_perm.contains(card.viewAs || card.name)) {
										// ★ 同 dy_pozhu_turn：num 可能是 undefined ⇒ 先归零再加，避免 NaN（见笔记 §10）
										if (num === false) return false;
										if (typeof num != 'number') num = 0;
										return num + 99;
									}
								},
								targetInRange: function (card, player, target) {
									if (player.storage.dy_pz_perm && player.storage.dy_pz_perm.contains(card.viewAs || card.name)) return true;
								},
							},
						},
						// 破竹·定势：回合结束检查「本回合以此牌名造成过伤害」→ 写入永久名单
						// （phaseJieshuBegin 早于临时技的 phaseAfter 过期，storage 还在）
						dy_pozhu_check: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { player: 'phaseJieshuBegin' },
							filter: function (event, player) {
								if (!player.storage.dy_pz_name) return false;
								var nm = player.storage.dy_pz_name;
								var history = player.getHistory('sourceDamage');
								for (var i = 0; i < history.length; i++) {
									var c = history[i].card;
									if (c && (c.viewAs || c.name) == nm) return true;
								}
								return false;
							},
							content: function () {
								var nm = player.storage.dy_pz_name;
								if (!player.storage.dy_pz_perm) player.storage.dy_pz_perm = [];
								if (!player.storage.dy_pz_perm.contains(nm)) player.storage.dy_pz_perm.push(nm);
								game.log(player, '本回合以【', '#y' + get.translation(nm), '】造成过伤害——本局游戏使用此牌名无次数与距离限制');
							},
						},
						// 振鞘①：装备武器时，使用牌无法被响应（directHit 共享数组，
						// 逐目标子事件上 add 即可覆盖该目标；yjzhenlve 同族）
						dy_zhenqiao: {
							locked: true,
							forced: true,
							direct: true,
							popup: false,
							trigger: { player: 'useCardToPlayered' },
							filter: function (event, player) {
								return player.getEquip(1) != null;
							},
							content: function () {
								trigger.directHit.add(trigger.target);
							},
						},
						// 振鞘·吞甲：造成伤害时改为免疫，并获得受伤角色装备区所有牌
						// （非 forced：引擎先问「是否发动」，content 直接落实，避免双重询问）
						dy_zhenqiao_devour: {
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { source: 'damageBegin' },
							filter: function (event, player) {
								var target = event.player;
								return !!(target && target != player && target.getCards('e').length > 0);
							},
							content: function () {
								var target = trigger.player;
								trigger.cancel();
								var es = target.getCards('e');
								if (es.length) player.gain(es, 'gain2');
								game.log(player, '发动了', '#g【振鞘】', '，免疫了此伤害并获得', target, '装备区内的所有牌');
							},
						},
						// 振鞘·开锋：【杀】伤害+X（X=攻击范围-体力值，最小0）
						// 落在杀造成伤害时结算（含转化杀，viewAs||name 判名 —— atlas C9）
						dy_zhenqiao_boost: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { source: 'damageBegin' },
							filter: function (event, player) {
								if (!event.card || (event.card.viewAs || event.card.name) != 'sha') return false;
								return player.getEquip(1) != null;
							},
							content: function () {
								var x = player.getAttackRange() - player.hp;
								if (x > 0) trigger.num += x;
							},
						},
						// 灭吴（神威技）：摸「备」数 + 体力上限（「备」不消耗）
						dy_miewu: {
							audio: 2,
							enable: 'phaseUse',
							skillAnimation: true,
							animationColor: 'orange',
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['dy_miewu'] == undefined) player.storage.tdgx_sw['dy_miewu'] = 1;
							},
							filter: function (event, player) {
								return !!(player.storage.tdgx_sw && player.storage.tdgx_sw['dy_miewu'] > 0);
							},
							content: function () {
								player.storage.tdgx_sw['dy_miewu']--;
								var x = player.countMark('dy_bei') + player.maxHp;
								player.draw(x);
								game.log(player, '发动了神威技', '#g【灭吴】', '，摸了', get.cnNumber(x), '张牌');
							},
							ai: { order: 9, result: { player: 1 } },
						},
						// 「备」标记显示壳
						dy_bei: {
							charlotte: true,
							sub: true,
							intro: { name: '备', content: '武库的计数标记（上限5）。出牌阶段可消耗一个，将一张牌当非装备牌使用。灭吴的摸牌数与其相关。' },
						},

						// ============ 名·陆抗 ============
						// 毁堰：废除自己一个区域换效果（每区域整局一次；被抗晋/背水恢复的栏可再选）
						// · 装备栏（武器/防具/进攻马/防御马）走引擎 disableEquip（自动弃置栏内牌）
						// · 判定区/手牌区走 storage.lkang_zone 状态位 + lkang_hy_mod 查询期干预
						// · storage.lkang_zone：{e1,e2,e3,e4,judge,hand}，true = 已废除
						lkang_huiyan: {
							audio: 2,
							enable: 'phaseUse',
							filter: function (event, player) {
								var z = player.storage.lkang_zone;
								if (!z) return true;
								return !(z.e1 && z.e2 && z.e3 && z.e4 && z.judge && z.hand);
							},
							content: function () {
								'step 0'
								if (!player.storage.lkang_zone) player.storage.lkang_zone = {};
								var z = player.storage.lkang_zone;
								var keys = [];
								var labels = [];
								if (!z.e1) { keys.push('e1'); labels.push('武器区（你造成的伤害+1）'); }
								if (!z.e2) { keys.push('e2'); labels.push('防具区（每回合首次受到伤害时免疫）'); }
								if (!z.e3) { keys.push('e3'); labels.push('进攻马（使用牌无法被响应）'); }
								if (!z.e4) { keys.push('e4'); labels.push('防御马（摸两张牌）'); }
								if (!z.judge) { keys.push('judge'); labels.push('判定区（无视距离且使用牌无次数限制）'); }
								if (!z.hand) { keys.push('hand'); labels.push('手牌区（分配X点伤害，X为体力值-1）'); }
								event.lkKeys = keys;
								event.lkLabels = labels;
								player.chooseControl(labels.concat('cancel2'))
									.set('prompt', '毁堰：选择一个区域令其失效')
									.set('ai', function () { return 0; });
								'step 1'
								// ★ 'cancel2' 是官方可取消 chooseControl 的标准写法（clan.js:2018-2033）：
								//   点「取消」时 result.control=='cancel2'，而旧写法读 result.index 并在
								//   非 number 时回退 idx=0 —— 取消后照样废除第一个区域，即「不能取消」。
								if (result && result.control == 'cancel2') { event.finish(); return; }
								var idx = (result && typeof result.index == 'number') ? result.index : -1;
								if (idx < 0 || idx >= event.lkKeys.length) { event.finish(); return; }
								var key = event.lkKeys[idx];
								var z = player.storage.lkang_zone;
								z[key] = true;
								event.lkJustHand = (key == 'hand');
								if (key == 'e1' || key == 'e2' || key == 'e3' || key == 'e4') {
									var sn = key.slice(1) - 0;
									player.disableEquip(sn);
									game.log(player, '发动了', '#g【毁堰】', '，废除了', get.translation('equip' + sn), '栏');
									if (key == 'e4') {
										player.draw(2);
										game.log(player, '摸了两张牌');
									}
								}
								else if (key == 'judge') {
									var js = player.getCards('j');
									if (js.length) player.lose(js, ui.discardPile, 'visible');
									// ★ 真·失效：走引擎原生开关 storage._disableJudge
									//   game.js:22013-22015  isDisabledJudge(){ return Boolean(this.storage._disableJudge); }
									//   game.js:26826         canAddJudge 第一行就是 `if(this.isDisabledJudge()) return false;`
									//   ⇒ 只弃置现有判定牌是**不够**的（后续延时锦囊照样能被放进判定区）；
									//     置位后引擎在**所有**放置路径上直接拒绝，与官方 _disableJudge 技能同一机制
									//     （game.js:14732 的 disableJudge content 就是 storage._disableJudge=true）。
									player.storage._disableJudge = true;
									// 归属标记：_disableJudge 是**引擎全局开关**，别的技能也可能合法废除判定区。
									// 恢复（抗晋/背水/轮清理）时只有它是我们设的才清，避免误恢复他人的废除。
									player.storage.lkang_judge_own = true;
									player.update();
									game.log(player, '发动了', '#g【毁堰】', '，废除了判定区');
								}
								else {
									game.log(player, '发动了', '#g【毁堰】', '，废除了手牌区');
								}
								'step 2'
								if (event.lkJustHand && player.hp > 1) {
									event.lkX = player.hp - 1;
									event.goto(3);
								}
								else { event.finish(); return; }
								'step 3'
								if (!event.lkX || event.lkX <= 0) { event.finish(); return; }
								player.chooseTarget('毁堰：对一名角色造成1点伤害（还可分配' + event.lkX + '点）', function (card, player, target) {
									return target.isIn();
								}).set('ai', function (target) {
									return get.damageEffect(target, _status.event.player, _status.event.player);
								});
								'step 4'
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].damage(1);
									event.lkX--;
									// ★ 这里必须 goto(3)（回到「再问一次 + 检查剩余点数」那一步），**不能 redo()**。
									//   引擎语义（当次核实 game.js）：
									//     goto(n)  game.js:31959-31961  this.step = n - 1
									//     redo()   game.js:31962-31964  this.step--
									//     step 的 +1 发生在 content **返回之后** —— game.js:41806 event.step++
									//   ⇒ goto(3) 让下一轮以 step 3 重入（先查 lkX、再重新询问）；
									//     而 redo() 让**本步（step 4）原地重跑**：既不重新询问、也不再检查 lkX。
									//   ⇒ redo() 的死循环成因（原先就是这行）：
									//     · content 的 result 形参取自 event._result（game.js:41676），
									//       而 damage 事件**不写 event.result**（damage content 全文无 result 赋值），
									//       引擎只在 event.result 为真时才回填父事件（game.js:41735-41738）
									//       ⇒ result 永远是 step 3 那次 chooseTarget 的旧结果，result.bool 恒真；
									//     · 唯一的终止判据「lkX 归零/取消」写在 step 3，redo() 回不到 step 3
									//       ⇒ lkX 一路减到负数也没人看，伤害对同一目标无限重复。
									//     每次伤害都会触发抗晋·同轨（damageEnd）⇒ 实机表现就是
									//     「可以无限让其他角色的区域失效，而且取消不掉」。
									//   ⇒ 改 goto(3) 后：每 1 点伤害都要重新指定目标（可取消），lkX 归零即结束。
									event.goto(3);
								}
								else { event.finish(); return; }
							},
							ai: { order: 5, result: { player: 1 } },
						},
						// 毁堰·锋：①武器区 —— 你造成的伤害+1
						lkang_hy_w: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { source: 'damageBegin' },
							filter: function (event, player) {
								return !!(player.storage.lkang_zone && player.storage.lkang_zone.e1);
							},
							content: function () {
								trigger.num++;
							},
						},
						// 毁堰·御：②防具区 —— 每回合第一次受到伤害时免疫
						// （本回合已完成的 damage 历史数为 0 ⇒ 这就是第一次）
						lkang_hy_a: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
								if (!(player.storage.lkang_zone && player.storage.lkang_zone.e2)) return false;
								return player.getHistory('damage').length == 0;
							},
							content: function () {
								trigger.cancel();
								game.log(player, '本回合首次受到伤害，免疫了此伤害');
							},
						},
						// 毁堰·疾：③进攻马 —— 使用牌无法被响应
						lkang_hy_h3: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { player: 'useCardToPlayered' },
							filter: function (event, player) {
								return !!(player.storage.lkang_zone && player.storage.lkang_zone.e3);
							},
							content: function () {
								trigger.directHit.add(trigger.target);
							},
						},
						// 毁堰·阵：⑤判定区/⑥手牌区失效的查询期干预 + 抗晋·同轨复制状态
						// · 判定区失效 → 无视距离 + 使用牌无次数限制
						// · 手牌区失效 → 手牌不可使用（cardEnabled 拦 'h'，可被弃/被获得）
						// · storage.lkang_copy 是抗晋复制来的「本轮」状态，轮开始清空
						lkang_hy_mod: {
							charlotte: true,
							sub: true,
							mod: {
								targetInRange: function (card, player, target) {
									if ((player.storage.lkang_zone && player.storage.lkang_zone.judge) || (player.storage.lkang_copy && player.storage.lkang_copy.judge)) return true;
								},
								cardUsable: function (card, player, num) {
									if ((player.storage.lkang_zone && player.storage.lkang_zone.judge) || (player.storage.lkang_copy && player.storage.lkang_copy.judge)) {
										// ★ 判定区失效的「使用牌无次数限制」正是在这里失效成反效果的地方：
										//   锦囊/装备没有 usable 字段 ⇒ num 是 undefined ⇒ 旧写法 num+99 = NaN
										//   ⇒ 引擎 `countUsed(card) < NaN` 恒 false ⇒ 锦囊/装备全部不可使用
										//   （用户报的「陆抗判定区失效后无法使用锦囊牌」）。见笔记 §10。
										if (num === false) return false;
										if (typeof num != 'number') num = 0;
										return num + 99;
									}
								},
								cardEnabled: function (card, player) {
									if ((player.storage.lkang_zone && player.storage.lkang_zone.hand) || (player.storage.lkang_copy && player.storage.lkang_copy.hand)) {
										if (get.position(card) == 'h') return false;
									}
								},
							},
						},
						// 抗晋①：受到体力值不低于你的角色的伤害 → 弃一张牌判定，红色免伤
						lkang_kangjin: {
							audio: 2,
							locked: true,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
								var source = event.source;
								if (!source || source == player) return false;
								if (source.hp < player.hp) return false;
								return player.countCards('he') > 0;
							},
							content: function () {
								'step 0'
								player.chooseToDiscard('he', 1, '抗晋：弃置一张牌并判定，若为红色则免除此次伤害')
									.set('ai', function (card) { return 5 - get.value(card); });
								'step 1'
								if (!result.bool) { event.finish(); return; }
								player.judge();
								'step 2'
								if (result && result.color == 'red') {
									trigger.cancel();
									game.log(player, '判定为红色，免疫了此伤害');
								}
							},
						},
						// 抗晋·同轨：造成伤害后，把你一个已失效区域的状态复制给一名角色（本轮），
						// 然后恢复你自己装备区四栏之一。非 forced：引擎先问是否发动。
						// ★ 只复制「已失效」区域（复制未失效区域无意义，即卡面"状态与你相同"的有效面）
						// ★ 装备栏复制只在目标该栏**原本可用**时执行（countEnabledSlot 判定，
						//   game.js:13317）：避免对已自废栏位的角色再 disable 后、轮末误恢复
						lkang_kangjin_copy: {
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							trigger: { source: 'damageEnd' },
							filter: function (event, player) {
								var z = player.storage.lkang_zone;
								if (!z) return false;
								return !!(z.e1 || z.e2 || z.e3 || z.e4 || z.judge || z.hand);
							},
							content: function () {
								'step 0'
								var z = player.storage.lkang_zone || {};
								var keys = [];
								var labels = [];
								if (z.e1) { keys.push('e1'); labels.push('武器区'); }
								if (z.e2) { keys.push('e2'); labels.push('防具区'); }
								if (z.e3) { keys.push('e3'); labels.push('进攻马'); }
								if (z.e4) { keys.push('e4'); labels.push('防御马'); }
								if (z.judge) { keys.push('judge'); labels.push('判定区'); }
								if (z.hand) { keys.push('hand'); labels.push('手牌区'); }
								event.lkKeys = keys;
								event.lkLabels = labels;
								player.chooseTarget('抗晋：选择一名角色，令其一个区域的状态本轮与你相同', function (card, player, target) {
									return target != player && target.isIn();
								}).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								'step 1'
								if (!result.bool || !result.targets || !result.targets.length) { event.finish(); return; }
								event.lkT = result.targets[0];
								player.chooseControl(event.lkLabels.concat('cancel2'))
									.set('prompt', '抗晋：选择复制状态的区域（你已失效的区域）')
									.set('ai', function () { return 0; });
								'step 2'
								// ★ 取消（'cancel2'）应中止本次同轨：复制还没发生，直接结束即可。
								//   旧写法取消后回退 idx=0，照样复制第一个区域（「不能取消」）。
								if (result && result.control == 'cancel2') { event.finish(); return; }
								var idx = (result && typeof result.index == 'number') ? result.index : -1;
								if (idx < 0 || idx >= event.lkKeys.length) { event.finish(); return; }
								var key = event.lkKeys[idx];
								var t = event.lkT;
								if (!t.storage.lkang_copy) t.storage.lkang_copy = {};
								if (key == 'e1' || key == 'e2' || key == 'e3' || key == 'e4') {
									var sn = key.slice(1) - 0;
									if (t.countEnabledSlot('equip' + sn) > 0) {
										t.disableEquip(sn);
										t.storage.lkang_copy[key] = true;
										game.log(t, '的' + event.lkLabels[idx] + '本轮失效');
									}
									else {
										game.log(t, '的' + event.lkLabels[idx] + '本已失效，复制无额外效果');
									}
								}
								else if (key == 'judge') {
									t.storage.lkang_copy.judge = true;
									// ★ 复制判定区失效必须同时置引擎开关，否则只是"弃掉现有判定牌"，
									//   后续延时锦囊照样能放进目标判定区（canAddJudge 只认 isDisabledJudge）。
									t.storage._disableJudge = true;
									t.storage.lkang_judge_own = true;
									var js = t.getCards('j');
									if (js.length) t.lose(js, ui.discardPile, 'visible');
									t.update();
									game.log(t, '的判定区本轮失效');
								}
								else {
									t.storage.lkang_copy.hand = true;
									game.log(t, '的手牌区本轮失效（手牌不可使用）');
								}
								'step 3'
								// ★ 每回合回复区域限两次（2026-09-13 用户校准）：计数
								//   storage.lkang_kj_restore 由 tdgx_turn_reset 在每个回合开始清零。
								//   用尽后本次同轨只保留前面的复制部分，跳过恢复。
								event.lkUsed = player.storage.lkang_kj_restore || 0;
								if (event.lkUsed >= 2) { event.finish(); return; }
								var z = player.storage.lkang_zone || {};
								var keys = [];
								var labels = [];
								if (z.e1) { keys.push('e1'); labels.push('武器区'); }
								if (z.e2) { keys.push('e2'); labels.push('防具区'); }
								if (z.e3) { keys.push('e3'); labels.push('进攻马'); }
								if (z.e4) { keys.push('e4'); labels.push('防御马'); }
								if (!keys.length) { event.finish(); return; }
								event.lkRKeys = keys;
								player.chooseControl(labels.concat('cancel2'))
									.set('prompt', '抗晋：恢复你装备区内的一个栏位（每回合限两次，还可恢复' + (2 - event.lkUsed) + '次）')
									.set('ai', function () { return 0; });
								'step 4'
								// ★ 取消恢复只跳过恢复本身（此时复制已按卡面生效），不得回退到第一个栏位
								if (result && result.control == 'cancel2') { event.finish(); return; }
								var idx = (result && typeof result.index == 'number') ? result.index : -1;
								if (idx < 0 || idx >= event.lkRKeys.length) { event.finish(); return; }
								var key = event.lkRKeys[idx];
								player.storage.lkang_kj_restore = event.lkUsed + 1;
								player.storage.lkang_zone[key] = false;
								player.enableEquip(key.slice(1) - 0);
								player.update();
								game.log(player, '恢复了', get.translation('equip' + key.slice(1)), '栏');
							},
						},
						// 抗晋·复轨：每轮开始清理「本轮」复制状态（幂等，多名持有者只清一次）
						lkang_kangjin_clear: {
							forced: true,
							locked: true,
							charlotte: true,
							sub: true,
							popup: false,
							direct: true,
							trigger: { global: 'roundStart' },
							filter: function (event, player) {
								for (var i = 0; i < game.players.length; i++) {
									var c = game.players[i].storage && game.players[i].storage.lkang_copy;
									if (c && (c.e1 || c.e2 || c.e3 || c.e4 || c.judge || c.hand)) return true;
								}
								return false;
							},
							content: function () {
								for (var i = 0; i < game.players.length; i++) {
									var p = game.players[i];
									var c = p.storage && p.storage.lkang_copy;
									if (!c) continue;
									if (c.e1) p.enableEquip(1);
									if (c.e2) p.enableEquip(2);
									if (c.e3) p.enableEquip(3);
									if (c.e4) p.enableEquip(4);
									// 判定区的复制状态也要在本轮结束时还回去（同 2 处判据：只清自己设的）
									if (c.judge && p.storage.lkang_judge_own) {
										p.storage._disableJudge = false;
										p.storage.lkang_judge_own = false;
									}
									p.storage.lkang_copy = {};
									p.update();
								}
								game.log('新的一轮：抗晋·同轨的复制状态已恢复');
							},
						},
						// 背水（神威技）：恢复所有已失效区域（四装备栏 + 判定/手牌状态位）
						lkang_beishui: {
							audio: 2,
							enable: 'phaseUse',
							skillAnimation: true,
							animationColor: 'orange',
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['lkang_beishui'] == undefined) player.storage.tdgx_sw['lkang_beishui'] = 1;
							},
							filter: function (event, player) {
								if (!(player.storage.tdgx_sw && player.storage.tdgx_sw['lkang_beishui'] > 0)) return false;
								var z = player.storage.lkang_zone;
								if (!z) return false;
								return !!(z.e1 || z.e2 || z.e3 || z.e4 || z.judge || z.hand);
							},
							content: function () {
								player.storage.tdgx_sw['lkang_beishui']--;
								player.enableEquip([1, 2, 3, 4]);
								// ★ 判定区的失效走引擎 storage._disableJudge（见毁堰处注释）。
								//   只清**本技能设的**（lkang_judge_own）：_disableJudge 是引擎全局开关，
								//   别的技能可能合法废除判定区，无条件清零会误恢复它。
								if (player.storage.lkang_judge_own) {
									player.storage._disableJudge = false;
									player.storage.lkang_judge_own = false;
								}
								player.storage.lkang_zone = {};
								player.update();
								game.log(player, '发动了神威技', '#g【背水】', '，恢复了所有已失效的区域');
							},
							ai: { order: 6, result: { player: 1 } },
						},

						// 合并式实现：兵权一个技能覆盖 roundStart（转职/清兵/送兵）、phaseEnd
						// （摸X）、phaseUseBegin（兵≥2 本回合增益）三个时机，content 内按
						// event.triggername 分支；九伐兼并杀见闻追踪（独立静默子技能）。
						// 「发动技能」探针 = logSkill 时机（game.js:27175，静默内部技能不算）。
						bz_bing: {
							charlotte: true,
							sub: true,
							intro: { name: '兵', content: '兵权的计数标记（X 为其数量）。' },
						},
						bz_bingquan: {
							locked: true,
							forced: true,
							charlotte: true,
							popup: false,
							direct: true,
							trigger: { global: 'roundStart', player: ['phaseBegin', 'phaseEnd'] },
							init: function (player) {
								// 首轮豁免：第一轮还没有「上一轮获得的兵」可判，用 -1 当"暂不判定"哨兵。
								// （若用 99 当哨兵，roundStart 会把它重置成 0，phaseBegin 紧接着
								//   就会把 0<=2 判成"该失去兵权"，首轮必掉技能。）
								player.storage.bz_bing_gained = 0;
								player.storage.bz_bing_carry = -1;
							},
							filter: function (event, player) { return player.isIn(); },
							content: function () {
								// ★★ 步骤号必须**连续**（0,1,2,3,4,5）★★
								//   实测事故：旧版写成 0/3/4/14/16（不连续），游戏里诸葛亮直接卡死。
								//   诊断插桩显示「引擎传 step=169407 且不断增长」——
								//   step 无限增长 = event.finish() 从未被调用 = 内容里那个
								//   "末步守卫" 根本没建立起来 ⇒ event.goto(3) 自然也无效，
								//   于是只剩第一段代码被反复执行（游戏卡在 roundStart）。
								//   引擎的步骤机制是：parsex 把 'step N' 逐个替换成 `break;case N:`，
								//   并在开头补 `if(event.step==末步+1){event.finish();return;}`。
								//   编号一断，替换链就建不起来，整个 switch 落空。
								//   ⇒ 本技能一律用连续编号，并且不再使用 goto。
								'step 0'
								if (event.triggername == 'phaseEnd') {
									// 回合结束时：只清掉本回合增益快照。
									// ★ 不再清「兵」：正文已把移除交给〖情势〗（三轮一次），
									//   兵权这边清掉会让情势的兵永远攒不住。
									player.storage.bz_bing_buff = 0;
									event.finish(); return;
								}
								if (event.triggername == 'phaseBegin') {
									// 回合开始时：兵≥2 给增益 → 转职判定。
									// ★ 摸X张牌已按正文移到〖情势〗，此处不再摸牌。
									//   （"你拥有的兵" = 本轮 roundStart 里别人刚送进来的兵 +
									//     情势留下的未到期兵，两者都在身上。）
									var x14 = player.countMark('bz_bing');
									if (x14 >= 2) {
										player.storage.bz_bing_buff = x14;
										player.addTempSkill('bz_bingquan_mod');
										game.log(player, '本回合使用牌无距离限制，且【杀】的使用次数上限+', get.cnNumber(x14));
									}
									// 转职判定读 roundStart 之前快照下来的"上一轮获得的兵数"，
									// -1 = 首轮豁免。
									var g14 = player.storage.bz_bing_carry;
								if (typeof g14 == 'number' && g14 >= 0 && g14 <= 2) {
										game.log(player, '本轮获得的「兵」不大于二，失去了', '#g【兵权】', '并获得', '#g【情势】');
										player.removeSkill('bz_bingquan');
										if (!player.hasSkill('bz_qingshi')) player.addSkill('bz_qingshi');
										// ★ 情势的"每回合闸门"必须在这里清一次：它靠自己的 phaseBegin 清零，
										//   但获得情势的这个回合，情势的 phaseBegin 已经跑过了（当时还没这技能）
										//   ⇒ 闸门会带着上一手的状态进入下一回合，表现为"只有第一张锦囊能触发"。
										player.storage.bz_qs_opts = 0;
										player.storage.bz_qs_used = 0;
										player.storage.bz_qs_gained = 0;
									}
									event.finish(); return;
								}
								// roundStart：先快照上一轮的获得数，再重置本轮计数与座位下标
								var prev = player.storage.bz_bing_gained;
								player.storage.bz_bing_carry = (typeof prev == 'number' && prev >= 0) ? prev : -1;
								player.storage.bz_bing_gained = 0;
								player.storage.bz_ask_seat = 0;
								'step 1'
								// 逐个问其他角色是否给兵。每次进入本步推进一个座位：
								// 跳过自己与已离场者，问到人就弹询问并等下一步；问完就结束。
								var i = player.storage.bz_ask_seat || 0;
								var asked = false;
								while (!asked) {
									if (i >= game.players.length) { event.finish(); return; }
									var cur = game.players[i];
									if (cur == player || !cur.isIn()) { i++; continue; }
									event.gzCur = cur;
									// ★ ai 回调纯闭包：不读 _status.event（其内容随引擎上下文变化）
									var gzOwner = player;
									var gzCur = cur;
									cur.chooseBool('兵权：是否令' + get.translation(player) + '获得一个「兵」？')
										.set('ai', function () {
											return get.attitude(gzCur, gzOwner) > 0;
										});
									asked = true;
								}
								'step 2'
								if (result.bool) {
									player.addMark('bz_bing', 1);
									player.storage.bz_bing_gained = (player.storage.bz_bing_gained || 0) + 1;
									game.log(event.gzCur, '令', player, '获得了一个「兵」');
								}
								player.storage.bz_ask_seat = (player.storage.bz_ask_seat || 0) + 1;
							},
						},
						bz_bingquan_mod: {
							charlotte: true, sub: true,
							onremove: function (player) { player.storage.bz_bing_buff = 0; },
							mod: {
								targetInRange: function () { return true; },
								cardUsable: function (card, player, num) {
									if (get.name(card) == 'sha') {
										if (num === false) return false;
										if (typeof num != 'number') num = 0;
										// 读快照而不是当场兵数：出牌阶段时兵可能已被清空
										return num + (player.storage.bz_bing_buff || 0);
									}
								},
							},
						},
						bz_jiufa: {
							audio: 2,
							limited: true,
							skillAnimation: true,
							animationColor: 'water',
							trigger: { player: 'phaseBegin' },
							init: function (player) { player.storage.bz_jiufa = false; },
							filter: function (event, player) {
								// 四个门槛，任一条不成立就不发动。条件满足却不触发时，
								// 靠 player.storage.bz_jiufa_why 自报是**哪一条**挡住的
								// （战报里会打印），避免只能猜。
								if (player.storage.bz_jiufa) {
									player.storage.bz_jiufa_why = '已发动过';
									return false;
								}
								for (var i = 0; i < game.players.length; i++) {
									if (!game.players[i].storage.bz_sha_seen) {
										player.storage.bz_jiufa_why = '未见过【杀】: ' + get.translation(game.players[i]);
										game.log(player, '【九伐·诊断】暂不可发动：', get.translation(game.players[i]), '尚未使用/打出/失去过【杀】');
										return false;
									}
								}
								var max = 0;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].hp > max) max = game.players[i].hp;
								}
								if (player.hp >= max) {
									player.storage.bz_jiufa_why = '体力为最多(' + player.hp + '/' + max + ')';
									game.log(player, '【九伐·诊断】暂不可发动：你的体力值是最多的（', player.hp, '/', max, '）');
									return false;
								}
								var basics = 0;
								for (var i = 0; i < ui.cardPile.childElementCount; i++) {
									var node = ui.cardPile.childNodes[i];
									if (get.name(node) && get.type(get.name(node)) == 'basic') { basics++; }
								}
								if (!basics) {
									player.storage.bz_jiufa_why = '牌堆内无基本牌';
									game.log(player, '【九伐·诊断】暂不可发动：牌堆里没有基本牌');
									return false;
								}
								player.storage.bz_jiufa_why = '可发动（' + basics + ' 张基本牌）';
								return true;
							},
							content: function () {
								'step 0'
								player.storage.bz_jiufa = true;
								var x = player.countMark('bz_bing');
								event.pool = [];
								for (var i = 0; i < ui.cardPile.childElementCount; i++) {
									var node = ui.cardPile.childNodes[i];
									if (get.name(node) && get.type(get.name(node)) == 'basic') event.pool.push(node);
								}
								event.count = 5 + x;
								game.log(player, '发动了限定技', '#g【九伐】', '，展示了牌堆内所有的基本牌');
								// ★ 保险：牌堆基本牌为空/解析异常时不弹空选择框（用户报「进度条但没选项」）
								if (!event.pool.length) { event.finish(); return; }
								'step 1'
								if (event.count <= 0 || !event.pool.length) { event.finish(); return; }
								player.chooseCardButton(event.pool, '九伐：从中选择一张基本牌使用（还可选择' + event.count + '张）')
									.set('ai', function (button) {
										return _status.event.player.getUseValue(button.link);
									});
								'step 2'
								if (!result.bool || !result.links || !result.links.length) { event.finish(); return; }
								var card = result.links[0];
								event.pool.remove(card);
								event.count--;
								player.chooseUseTarget(card, '九伐：是否使用' + get.translation(card) + '？（无次数和距离限制）');
								'step 3'
								event.goto(1);
							},
						},
						// 杀见闻追踪器：必须独立静默（forced+direct+popup:false）。不可并入九伐——
						// 九伐带 skillAnimation 且非 forced，合并后每次有人用/弃【杀】都会空放
						// 一次全屏技能动画且无任何选项（用户实测「一进游戏就技能进度条但没选项」）。
						bz_jiufa_track: {
							forced: true, locked: true, charlotte: true, sub: true, popup: false, direct: true,
							trigger: { global: ['useCardAfter', 'respondAfter', 'loseAfter'] },
							filter: function (event, player) {
								var cards = event.cards || (event.card ? [event.card] : []);
								for (var i = 0; i < cards.length; i++) {
									if (get.name(cards[i]) == 'sha') return true;
								}
								return false;
							},
							content: function () {
								var p = trigger.player;
								if (!p.storage.bz_sha_seen) p.storage.bz_sha_seen = true;
							},
						},
						bz_kongcheng: {
							forced: true, locked: true, charlotte: true, sub: true, popup: false, direct: true,
							// ★ 触发时机扩展（为了"同批次只摸一次"的限流）：
							//   phaseBegin / useCard 是"玩家新动作"的边界，用来重置批次。
							trigger: { player: ['loseAfter', 'gainAfter', 'logSkill', 'damageBegin'], global: ['phaseBegin', 'useCard'] },
							// ★ 接引擎原生"转换技"：zhuanhuanji:true 会让技能被识别为转换技
							//   （game.js:60267 归入"转换技"标签）；当前形态存放在
							//   player.storage.bz_kongcheng（true=阳 / false=阴）——
							//   这个键名**必须**与技能名同名，因为引擎调用
							//   intro.content 时传的是 player.storage[技能名]（game.js:28208-28211）。
							//   翻转请统一走 player.changeZhuanhuanji('bz_kongcheng')：
							//   它会翻转 storage、广播牌面翻转动画、并刷新标记（game.js:22209-22218）。
							// ★ 用 mark:true（**不要**用 mark:'character'）——原版转换技就是 mark:true，
							//   见 clan.js:569 钟琰「观骨」：zhuanhuanji:true + mark:true + intro.content。
							//   mark:'character' 会走引擎的 markSkillCharacter（game.js:28227），
							//   而那个分支传的是 `caption`（来自 info.intro.name，且引擎误写成 info.name），
							//   十周年UI 扩展的 markCharacter 拿它当**角色 id** 去 `name.indexOf(...)`，
							//   于是直接抛 `TypeError: name.indexOf is not a function` 并把选将/初始化打断。
							//   mark:true 走的是普通标记路径，intro.content(storage) 照样按形态显示。
							zhuanhuanji: true,
							// 引擎的"是否处于阳面"判定（game.js:64963-64971）
							zhuanhuanji2: function (skill, player) { return !!player.storage.bz_kongcheng; },
							mark: true,
							marktext: '空城',
							intro: {
								name: '空城',
								// storage 就是 player.storage.bz_kongcheng（记得引擎传的是 storage[技能名]）
								content: function (storage) {
									return storage
										? '转换技（当前·阳）。你受到伤害时进行一次判定：①若判定牌为锦囊牌，你令此伤害-1（至多减至0）；②若判定牌不为锦囊牌，你弃置一名角色的一张牌。'
										: '转换技（当前·阴）。你发动技能时摸一张牌。（当你手牌数变为零或从零改变时转换形态）';
								},
							},
							init: function (player) {
								// 正文要求"游戏一开始就是阴形态" ⇒ false = 阴。
								// （旧版用 bz_kc_yin 且初始化成 false 却按"true=阴"判，导致开局落在阳面、
								//   阴面的摸牌永不触发——用户实测「空城一直不触发」。）
								if (typeof player.storage.bz_kongcheng != 'boolean') player.storage.bz_kongcheng = false;
								if (typeof player.storage.bz_kc_batch != 'number') player.storage.bz_kc_batch = 0;   // 同批次限流闸门
								player.storage.bz_kc_nonzero = true;   // 手牌"非零"状态（开局有手牌）
							},
							filter: function (event, player) {
								// ★★ 不要依赖 event.triggername ★★
								//   实测（气泡诊断）：filter 收到的第一个参数上
								//   `triggername` 是 **undefined**，而 `name` 是真实的时机名
								//   （例：`evt=logSkill tn=undefined`）。
								//   所以按时机名分派一律失效 —— 这里改用 name 优先、triggername 兜底。
								var tn = event.triggername;
								if (tn == undefined) tn = event.name;
								if (!player.isIn()) return false;
								// ★★ 开局前一律不触发 ★★
								//   引擎在 gameStart **之前**也会派发 logSkill（初始化/发牌阶段
								//   各锁定技的自动触发都算），于是空城·阴会在"游戏还没开始"
								//   时被喂一堆牌（用户实测：开局就摸了 7 张）。
								//   判据用引擎自己在 trigger 里用的同一个标志：_status.gameStarted
								//   （game.js:32321 在 gameStart 时置 true）。
								if (!_status.gameStarted) return false;
								if (tn == 'loseAfter' || tn == 'gainAfter') return true;
								// 批次边界：玩家的新动作（新回合 / 新打出一张牌）⇒ 重开一批
								if (tn == 'phaseBegin' || tn == 'useCard') {
									player.storage.bz_kc_batch = 0;
									return false;
								}
								// 阴（storage=false）：发动技能后摸一张，但**同一批只摸一次**
								if (tn == 'logSkill') return !player.storage.bz_kongcheng && !player.storage.bz_kc_batch;
								// 阳（storage=true）：受到伤害时判定
								if (tn == 'damageBegin') return !!player.storage.bz_kongcheng && event.num > 0;
								return false;
							},
							content: function () {
								'step 0'
								// content 里 triggername 是可靠的（引擎在 game.js:15554 显式设置），
								// 但这里同样做 name 兜底，避免两条路径不一致时行为分叉。
								var tn = event.triggername;
								if (tn == undefined) tn = event.name;
								// 双保险：即使 filter 因时序被绕过，content 也不在开局前生效
								if (!_status.gameStarted) { event.finish(); return; }
								if (tn == 'loseAfter' || tn == 'gainAfter') {
									var now = player.countCards('h') > 0;
									if (now != player.storage.bz_kc_nonzero) {
										player.storage.bz_kc_nonzero = now;
										// 走引擎原生翻转：同时更新 storage、动画与标记
										player.changeZhuanhuanji('bz_kongcheng');
										game.log(player, '发动了', '#g【空城】', '，转换为', '#g' + (player.storage.bz_kongcheng ? '阳' : '阴') + '态');
									}
									event.finish(); return;
								}
								if (tn == 'logSkill') {
									player.draw(1);
									// 落批次闸门：同一批（连续自动结算）只摸这一次
									player.storage.bz_kc_batch = 1;
									game.log(player, '【空城·阴】：发动技能后摸了一张牌');
									event.finish(); return;
								}
								player.judge();
								'step 1'
								var tname = result && result.name;
								var isTrick = tname && (get.type(tname) == 'trick' || get.type(tname) == 'delay');
								if (isTrick) {
									if (trigger.num > 0) {
										trigger.num--;
										game.log(player, '判定为锦囊牌，此伤害-1');
									}
									event.finish(); return;
								}
								game.log(player, '判定不为锦囊牌');
								player.chooseTarget(true, '空城：弃置其他一名角色的一张牌', function (card, player, target) {
									return target != player && target.countCards('he') > 0;
								}).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								'step 2'
								if (result.bool && result.targets && result.targets.length) {
									player.discardPlayerCard(result.targets[0], 'he', true);
								}
							},
						},
						bz_qingshi: {
							locked: true,
							forced: true,
							charlotte: true,
							popup: false,
							direct: true,
							trigger: { player: 'useCardBegin', global: 'phaseBegin' },
							init: function (player) {
								// 显式初始化三个状态位，避免依赖 undefined 的隐式语义：
								//   bz_qs_opts   本回合已执行的选项次数（上限 2）
								//   bz_qs_used   本回合是否已经因情势拿过兵（每回合至多 2 次）
								//   bz_qs_gained 本回合已因此获得的兵数（上限 2）
								//   bz_qs_rounds 兵的剩余轮数（3 → 0 时清兵）
								if (typeof player.storage.bz_qs_opts != 'number') player.storage.bz_qs_opts = 0;
								if (typeof player.storage.bz_qs_used != 'number') player.storage.bz_qs_used = 0;
								if (typeof player.storage.bz_qs_gained != 'number') player.storage.bz_qs_gained = 0;
								if (typeof player.storage.bz_qs_rounds != 'number') player.storage.bz_qs_rounds = 0;
							},
							filter: function (event, player) {
								// ★ 同空城：filter 里 triggername 可能是 undefined（实测），用 name 兜底。
								var tn = event.triggername;
								if (tn == undefined) tn = event.name;
								if (tn == 'phaseBegin') return player.isIn();
								if (!event.card) return false;
								var tt = get.type(get.name(event.card));
								if (tt != 'trick' && tt != 'delay') return false;
								// ★ 兜底：闸门是"本回合"的状态，正常情况下由 phaseBegin 清零。
								//   但若本回合 phaseBegin 时还没拿到情势（例如本回合才因兵权失去而获得情势），
								//   闸门会带着旧回合的 1 进来 ⇒ 表现就是"只有第一张锦囊能触发"。
								//   这里发现"计数为 0 但闸门仍是 1"（即本回合还没执行过任何一次），
								//   就判定闸门是脏的，就地清掉。
								if (player.storage.bz_qs_used && !(player.storage.bz_qs_opts || 0)) {
									player.storage.bz_qs_used = 0;
									player.storage.bz_qs_gained = 0;
								}
								if ((player.storage.bz_qs_opts || 0) >= 2) return false;
								if (player.storage.bz_qs_used) return false;
								return true;
							},
							content: function () {
								'step 0'
								// ★ 同空城：content 里 triggername 可靠（game.js:15554），name 兜底
								var qtn = event.triggername;
								if (qtn == undefined) qtn = event.name;
								if (qtn == 'phaseBegin') {
									// 每回合把「本回合」的两个闸门一起清零：
									//   bz_qs_opts = 本回合已执行的选项次数（上限 2）
									//   bz_qs_used = 本回合是否已经通过情势拿过兵（上限 2，见 step 1）
									player.storage.bz_qs_opts = 0;
									player.storage.bz_qs_used = 0;
									player.storage.bz_qs_gained = 0;
									// ★ 回合开始时摸X张牌（X = 兵数，且**至少为 1**）：
									//   兵权还在时兵数可能为 0，但正文要求至少摸一张，故取 max(1, 兵数)。
									var qx = player.countMark('bz_bing');
									if (qx < 1) qx = 1;
									player.draw(qx);
									game.log(player, '「情势」：摸', get.cnNumber(qx), '张牌（兵数', player.countMark('bz_bing'), '）');
									// 「兵」满三轮后移除：计时器在获得首个兵时置 3，
									// 每次本人回合开始减一，减到 0 即清空并复位。
									var left = player.storage.bz_qs_rounds;
									if (typeof left == 'number' && left > 0) {
										left--;
										player.storage.bz_qs_rounds = left;
										if (left == 0) {
											var qn = player.countMark('bz_bing');
											if (qn > 0) {
												player.removeMark('bz_bing', qn);
												game.log(player, '「情势」所得的「兵」已满三轮，移除了', get.cnNumber(qn), '个「兵」');
											}
										}
									}
									event.finish(); return;
								}
								player.chooseControl(['①此牌造成的伤害+1', '②此牌额外结算一次', 'cancel2'])
									.set('prompt', '情势：【' + get.translation(trigger.card) + '】结算开始，选择一项执行')
									.set('ai', function () { return 0; });
								'step 1'
								if (result.control == 'cancel2') { event.finish(); return; }
								// 玩家点了取消：不执行任何选项，但**闸门要落下** ——
								// 否则同一张锦囊会反复弹询问（选中即消耗一次"前两张"的额度）。
								player.storage.bz_qs_opts = (player.storage.bz_qs_opts || 0) + 1;
								player.storage.bz_qs_used = 1;
								// ★ 兵的上限与「选中几项」无关：本轮选了一项也要落一次闸，
								//   且兵权时期的 bz_bing_gained 不参与这里的判定（两者互斥）。
								var qg = player.storage.bz_qs_gained || 0;
								if (qg < 2) {
									player.addMark('bz_bing', 1);
									player.storage.bz_qs_gained = qg + 1;
									if (typeof player.storage.bz_qs_rounds != 'number' || player.storage.bz_qs_rounds <= 0) {
										player.storage.bz_qs_rounds = 3;
									}
									game.log(player, '获得了一个「兵」（情势所得 ' + (qg + 1) + '/2）');
								}
								if (result.control.indexOf('①') == 0) {
									player.addTempSkill('bz_qingshi_dmg');
									player.storage.bz_qs_use = trigger;
								} else {
									// ★ createEvent 会自动把事件压入当前队列（game.js:40348）——
									//   必须先 event.next.remove 再排入 useCard 完成后，
									//   否则同一事件在两个队列各执行一次 ⇒ 额外结算×2
									//   （官方同款套路：game.js:27189-27191 logSkill 重排队）。
									var next = player.useCard(trigger.card, trigger.cards ? trigger.cards.slice(0) : [], (trigger.targets || []).slice(0));
									event.next.remove(next);
									trigger.next.push(next);
								}
							},
						},
						bz_qingshi_used: {
							charlotte: true, sub: true, popup: false,
							// ★ 已弃用：原本当作"每回合闸门"的临时技能，实测会导致
							//   "只有第一张锦囊牌能触发情势"（闸门没被清掉）。
							//   现在闸门改为 storage.bz_qs_used，由 phaseBegin 清零。
							//   保留本条目是为了兼容老存档里已经挂上的临时技能。
							onremove: function (player) { player.storage.bz_qs_gained = 0; },
						},
						bz_qingshi_dmg: {
							forced: true, locked: true, charlotte: true, sub: true, popup: false, direct: true,
							trigger: { source: 'damageBegin2' },
							filter: function (event, player) {
								var uc = event.getParent('useCard');
								return uc && player.storage.bz_qs_use && uc == player.storage.bz_qs_use;
							},
							content: function () {
								trigger.num++;
								game.log(player, '「情势」：此牌伤害+1');
							},
							onremove: function (player) { delete player.storage.bz_qs_use; },
						},

						// ============ 名·周瑜 ============
						mzy_yingzi: {
							locked: true,
							forced: true,
							charlotte: true,
							trigger: { player: 'phaseBegin' },
							filter: function (event, player) { return player.isIn(); },
							content: function () {
								'step 0'
								event.mzyCount = 0;
								event.mzyAll = (player.hp == player.maxHp || player.countCards('h') == player.maxHp);
								'step 1'
								if (event.mzyAll || player.hp < player.maxHp) {
									player.draw(3);
									event.mzyCount++;
									game.log(player, '发动了', '#g【英姿】', '①，摸三张牌');
								}
								'step 2'
								if (event.mzyAll || player.countCards('h') > player.hp) {
									player.addTempSkill('mzy_yingzi_mod');
									event.mzyCount++;
									game.log(player, '发动了', '#g【英姿】', '②，本回合使用牌无次数和距离限制');
								}
								'step 3'
								if (event.mzyAll || player.countCards('h') < player.hp) {
									if (player.hp < player.maxHp) player.recover(1);
									var n = player.maxHp - player.countCards('h');
									if (n > 0) player.draw(n);
									event.mzyCount++;
									game.log(player, '发动了', '#g【英姿】', '③，回复1点体力并将手牌补至体力上限');
								}
								'step 4'
								if (event.mzyCount > 0) {
									player.skip('phaseDiscard');
									game.log(player, '跳过了本回合的弃牌阶段');
								}
							},
						},
						mzy_yingzi_mod: {
							charlotte: true, sub: true,
							mod: {
								targetInRange: function () { return true; },
								cardUsable: function (card, player, num) {
									if (num === false) return false;
									if (typeof num != 'number') num = 0;
									return num + 99;
								},
							},
						},
						mzy_fanjian: {
							audio: 2,
							enable: 'phaseUse',
							usable: 1,
							filter: function (event, player) {
								return game.hasPlayer(function (current) {
									return current != player && current.countCards('h') > 0;
								});
							},
							content: function () {
								'step 0'
								player.chooseTarget([2, 2], true, '反间：选择两名角色').set('ai', function (target) {
									return target.countCards('h') > 0 ? get.attitude(_status.event.player, target) : 0;
								});
								'step 1'
								if (!result.bool || !result.targets || result.targets.length != 2) { event.finish(); return; }
								event.fjT = result.targets.slice(0);
								event.fjA0 = event.fjT[0].countCards('h');
								event.fjB0 = event.fjT[1].countCards('h');
								var labels = [get.translation(event.fjT[0]), get.translation(event.fjT[1])];
								var controls = [];
								if (event.fjT[0].countCards('h') > 0) controls.push(labels[0]);
								if (event.fjT[1].countCards('h') > 0) controls.push(labels[1]);
								if (!controls.length) { event.finish(); return; }
								event.fjLabels = controls;
								player.chooseControl(controls)
									.set('prompt', '反间：选择观看哪一名角色的手牌')
									.set('ai', function () { return 0; });
								'step 2'
								if (!result.control) { event.finish(); return; }
								var vi = event.fjLabels.indexOf(result.control);
								if (vi < 0) { event.finish(); return; }
								event.fjView = event.fjT[vi];
								event.fjGuess = event.fjT[1 - vi];
								if (event.fjView.countCards('h') == 0) { event.finish(); return; }
								'step 3'
								// 安全兜底：观看者已无手牌则直接进入终止结算
								if (event.fjView.countCards('h') == 0) { event.goto(7); return; }
								player.chooseCardButton(event.fjView.getCards('h'), '反间：观看并选择其中一张牌', true);
								'step 4'
								if (!result.bool || !result.links || !result.links.length) { event.finish(); return; }
								event.fjCard = result.links[0];
								event.fjGuess.chooseControl(['红色', '黑色'])
									.set('prompt', '反间：猜测此牌的花色')
									.set('ai', function () { return Math.random() < 0.5 ? 0 : 1; });
								'step 5'
								var guess = result.control;
								var real = get.color(event.fjCard) == 'red' ? '红色' : '黑色';
								if (guess == real) {
									game.log(event.fjGuess, '猜对了，获得了一张牌');
									event.fjGuess.gain(event.fjCard, event.fjView);
									event.goto(6);
								}
								else {
									game.log(event.fjGuess, '猜错了，失去了全部手牌');
									var hs = event.fjGuess.getCards('h');
									if (hs.length) event.fjGuess.discard(hs);
									event.goto(7);
								}
								'step 6'
								// ★ 终止判定必须在队列结算之后：gain/discard 是入队事件，
								//   步骤边界才落地——同一步内 countCards 仍是旧值，观看者的
								//   最后一张牌被拿走时检测不到 ⇒ 技能不终止（用户实测）。
								if (event.fjView.countCards('h') == 0 || event.fjGuess.countCards('h') == 0) { event.goto(7); }
								else { event.goto(3); }
								'step 7'
								for (var i = 0; i < event.fjT.length; i++) {
									var t = event.fjT[i];
									var n0 = (i == 0 ? event.fjA0 : event.fjB0);
									var lost = n0 - t.countCards('h');
									if (lost >= 2) {
										t.loseHp(1);
										game.log(t, '失去了' + get.cnNumber(lost) + '张牌，失去1点体力');
									}
								}
							},
						},
						mzy_yingyan: {
							locked: true,
							forced: true,
							charlotte: true,
							trigger: { global: 'damageBegin2', source: 'damageBegin1' },
							filter: function (event, player) {
								// ★ filter 里 triggername 可能是 undefined（实测），name 兜底
								var mtn = event.triggername;
								if (mtn == undefined) mtn = event.name;
								if (!player.isIn()) return false;
								if (mtn == 'damageBegin1') return event.nature != 'fire';
								if (event.nature != 'fire') return false;
								return player.countCards('he') > 0 || player.hp > 0;
							},
							content: function () {
								// 步骤号连续 0..5，且全部在函数体顶层。
								// ★ 旧版把第二个 'step 1' 写在了 `if (event.triggername == 'damageBegin1') {`
								//   块**内部**：parsex 把步骤标签替换成 `break;case N:` 时 break 落在块内，
								//   生成的代码语法非法 ⇒ 该处替换被跳过、步骤机错位（C1 报
								//   "Unexpected token 'case'"）。现在改为"顶层判条件 + 用 event.mzMode 分派"。
								'step 0'
								if (event.triggername == 'damageBegin1') {
									// 我造成伤害时：可把这次伤害改为火焰伤害，然后结束。
									event.mzMode = 'src';
									player.chooseBool('映炎：是否将此伤害修改为火焰伤害？').set('ai', function () { return true; });
									return;
								}
								// 场上有人受到火焰伤害时：三选一
								event.mzMode = 'dmg';
								event.mzT = trigger.player;
								event.mzNum = trigger.num;
								event.mzSrc = trigger.source;
								var controls = [];
								if (player.countCards('he') > 0) {
									controls.push('①弃置一张牌，令相邻角色受到等同伤害');
									controls.push('②弃置一张牌，令此伤害+1');
								}
								if (player.hp > 0 && player.countCards('he') >= 2) controls.push('③失去1点体力，执行①和②');
								if (!controls.length) { event.finish(); return; }
								player.chooseControl(controls)
									.set('prompt', '映炎：' + get.translation(event.mzT) + '受到火焰伤害，选择一项执行')
									.set('ai', function () { return 0; });
								return;
								'step 1'
								if (event.mzMode == 'src') {
									if (result.bool) {
										trigger.nature = 'fire';
										game.log(player, '将此伤害修改为了火焰伤害');
									}
									event.finish(); return;
								}
								if (!result.control) { event.finish(); return; }
								event.mzDo1 = result.control.indexOf('①') == 0 || result.control.indexOf('③') == 0;
								event.mzDo2 = result.control.indexOf('②') == 0 || result.control.indexOf('③') == 0;
								if (!event.mzDo1 && !event.mzDo2) { event.finish(); return; }
								return;
								'step 2'
								// ①与②都要"弃置一张牌"，故本步无条件询问
								player.chooseCard('he', true, '映炎：弃置一张牌');
								return;
								'step 3'
								if (!result.cards || !result.cards.length) { event.finish(); return; }
								player.discard(result.cards);
								if (!event.mzDo1) {
									// 只选了②：弃牌后直接令此伤害+1
									trigger.num++;
									game.log(player, '令此伤害+1');
									event.finish(); return;
								}
								// 选了①（或③）：再令相邻角色受到等同伤害
								player.chooseTarget(true, '映炎：选择一名与该角色相邻的角色', function (card, player, target) {
									var d = _status.event.mzT;
									return target != d && target.isIn() && (target == d.next || target == d.previous);
								}).set('mzT', event.mzT).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								return;
								'step 4'
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].damage(event.mzNum, event.mzSrc, 'fire');
									game.log(player, '令', result.targets[0], '受到了等同的火焰伤害');
								}
								if (!event.mzDo2) { event.finish(); return; }
								// ③ 的第二段：再弃一张牌令此伤害+1
								player.chooseCard('he', true, '映炎：弃置一张牌');
								return;
								'step 5'
								if (result.cards && result.cards.length) {
									player.discard(result.cards);
									trigger.num++;
									game.log(player, '令此伤害+1');
								}
							},
						},
						mzy_shanmou: {
							locked: true,
							forced: true,
							charlotte: true,
							popup: false,
							direct: true,
							trigger: { player: 'logSkill' },
							filter: function (event, player) { return player.isIn(); },
							content: function () {
								// ★ 旧版把 'step 1' 写在了 `else { ... }` 块**内部** ——
								//   parsex 替换成 `break;case N:` 时 break 落在块内，生成代码非法，
								//   该处替换被跳过 ⇒ 步骤机错位（C1 报 Unexpected token 'case'）。
								//   现在：阴面选人放 step 0（顶层），结算伤害放 step 1（顶层）。
								'step 0'
								if (!player.storage.mzy_shanmou_yin) {
									if (player.hp < player.maxHp) {
										player.recover(1);
										game.log(player, '【善谋·阳】：回复了1点体力');
									}
									player.storage.mzy_shanmou_yin = !player.storage.mzy_shanmou_yin;
									event.finish(); return;
								}
								// 阴面：对一名角色造成1点伤害
								player.chooseTarget(true, '善谋：对一名角色造成1点伤害', function (card, player, target) {
									return target.isIn();
								}).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								return;
								'step 1'
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].damage(1, player);
									game.log(player, '【善谋·阴】：对', result.targets[0], '造成了1点伤害');
								}
								player.storage.mzy_shanmou_yin = !player.storage.mzy_shanmou_yin;
							},
						},
						mzy_jichu: {
							audio: 2,
							enable: 'phaseUse',
							forced: true, locked: true, charlotte: true, popup: false, direct: true,
							trigger: { player: 'logSkill' },
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['mzy_jichu'] == undefined) player.storage.tdgx_sw['mzy_jichu'] = 1;
							},
							filter: function (event, player) {
								if (event.triggername == 'logSkill') {
									return player.hasSkill('mzy_jichu_effect') && player.isIn();
								}
								return !!(player.storage.tdgx_sw && player.storage.tdgx_sw['mzy_jichu'] > 0);
							},
							content: function () {
								// ★ 旧版把 'step 1' 嵌套在 else 块内（同善谋的毛病）⇒ 替换失败、步骤机错位。
								//   现在：阴面选人放 step 0，结算伤害放 step 1，两步都在顶层。
								'step 0'
								if (event.triggername == 'logSkill') {
									// 额外触发：结算善谋当前面的效果，不翻转状态（2026-09-13 修正，
									//   善谋本体在同一次发动上已效果+翻转各一次，技出·承再翻转
									//   会导致状态原地踏步、阴面强制选人框每次发动都弹出）
									if (!player.storage.mzy_shanmou_yin) {
										if (player.hp < player.maxHp) {
											player.recover(1);
											game.log(player, '【技出】额外触发【善谋·阳】：回复了1点体力');
										}
										event.finish(); return;
									}
									// 阴面：对一名角色造成1点伤害
									player.chooseTarget(true, '技出：善谋——对一名角色造成1点伤害', function (card, player, target) {
										return target.isIn();
									}).set('ai', function (target) {
										return -get.attitude(_status.event.player, target);
									});
									return;
								}
								player.storage.tdgx_sw['mzy_jichu']--;
								player.addTempSkill('mzy_jichu_effect');
								game.log(player, '发动了神威技', '#g【技出】', '，本回合当你发动技能后，额外触发一次「善谋」的效果');
								event.finish(); return;
								'step 1'
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].damage(1, player);
									game.log(player, '【技出】额外触发【善谋·阴】：对', result.targets[0], '造成了1点伤害');
								}
							},
							ai: { order: 8, result: { player: 1 } },
						},
						mzy_jichu_effect: {
							charlotte: true, sub: true,
						},

						// ============ 名·裴秀 ============
						mpx_xingtu: {
							locked: true,
							forced: true,
							charlotte: true,
							popup: false,
							direct: true,
							trigger: { player: ['useCardAfter', 'respondAfter'] },
							filter: function (event, player) { return player.isIn(); },
							content: function () {
								'step 0'
								player.storage.mpx_xingtu_count = (player.storage.mpx_xingtu_count || 0) + 1;
								var hs = player.countCards('h');
								var mx = player.maxHp;
								if (hs > mx) { event.goto(1); }
								else if (hs < mx) { event.goto(3); }
								else {
									player.storage.mpx_juezhi_extra = (player.storage.mpx_juezhi_extra || 0) + 1;
									game.log(player, '「爵制」本局游戏的使用次数上限+1');
									event.finish(); return;
								}
								'step 1'
								if (player.countCards('he') == 0) { event.finish(); return; }
								player.chooseToDiscard('he', 1, '行图：是否弃置一张牌并摸一张牌？')
									.set('ai', function (card) { return 5 - get.value(card); });
								'step 2'
								if (result.bool) {
									player.draw(1);
									game.log(player, '弃置了一张牌并摸了一张牌');
								}
								event.finish(); return;
								'step 3'
								player.chooseControl(['摸一张牌', '获得其他一名角色区域内的一张牌', 'cancel2'])
									.set('prompt', '行图：选择一项')
									.set('ai', function () { return 0; });
								'step 4'
								if (result.control == 'cancel2' || !result.control) { event.finish(); return; }
								if (result.control == '摸一张牌') {
									player.draw(1);
									event.finish(); return;
								}
								player.chooseTarget(true, '行图：获得其他一名角色区域内的一张牌', function (card, player, target) {
									return target != player && target.countCards('hej') > 0;
								}).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								'step 5'
								if (result.bool && result.targets && result.targets.length) {
									player.gainPlayerCard(result.targets[0], 'hej', true);
								}
							},
						},
						mpx_juezhi: {
							audio: 2,
							enable: 'phaseUse',
							forced: true, locked: true, charlotte: true, popup: false, direct: true,
							trigger: { player: 'useCardToPlayered', source: 'damageBegin2' },
							filter: function (event, player) {
								// ★ filter 里 triggername 可能是 undefined（实测），name 兜底
								var jtn = event.triggername;
								if (jtn == undefined) jtn = event.name;
								if (jtn == 'useCardToPlayered') return event.card && get.name(event.card) == 'sha' && player.storage.mpx_juezhi_opt1 == true;
								if (jtn == 'damageBegin2') return event.card && get.name(event.card) == 'sha' && player.storage.mpx_juezhi_opt2 == true;
								if ((player.storage.mpx_juezhi_usedtimes || 0) >= 1 + (player.storage.mpx_juezhi_extra || 0)) return false;
								return player.countCards('he') > 0;
							},
							content: function () {
								'step 0'
								if (event.triggername == 'useCardToPlayered') {
									var use = event.getParent('useCard');
									if (use && use.directHit && !use.directHit.contains(trigger.target)) {
										use.directHit.push(trigger.target);
										game.log(use.card, '不可被', trigger.target, '响应');
									}
									event.finish(); return;
								}
								if (event.triggername == 'damageBegin2') {
									trigger.num++;
									event.finish(); return;
								}
								player.storage.mpx_juezhi_usedtimes = (player.storage.mpx_juezhi_usedtimes || 0) + 1;
								player.chooseToDiscard('he', [1, Infinity], true, '爵制：弃置任意数量的牌并摸等量的牌');
								'step 1'
								var n = (result.cards && result.cards.length) ? result.cards.length : 0;
								if (n > 0) player.draw(n);
								if (!player.storage.mpx_sha_bonus) player.storage.mpx_sha_bonus = 0;
								player.storage.mpx_sha_bonus++;
								player.addSkill('mpx_juezhi_mod');
								game.log(player, '本局游戏使用【杀】的次数上限+1（当前合计+', player.storage.mpx_sha_bonus, '）');
								'step 2'
								player.chooseControl(['①本局游戏你使用的【杀】无法被响应', '②本局游戏你使用【杀】造成的伤害+1', '③对一名角色造成1点伤害，然后你增加1点体力上限', '④令一名角色减少1点体力上限'])
									.set('prompt', '爵制：选择一项执行')
									.set('ai', function () { return 1; });
								'step 3'
								// ★ 旧版把 'step 4' / 'step 5' 分别嵌在 else-if / else 块内部 ——
								//   替换成 `break;case N:` 时 break 落在块内、代码非法，替换被跳过
								//   ⇒ 步骤机错位（C1 报 Unexpected token 'case'）。
								//   现在：①②本步结算完就 finish；③④把选人放这里，结算放顶层 step 4 / step 5。
								var c = result.control;
								if (c == undefined) { event.finish(); return; }
								if (c.indexOf('①') == 0) {
									player.storage.mpx_juezhi_opt1 = true;
									game.log(player, '获得了', '#g【爵制·锐】', '：本局游戏你使用的【杀】无法被响应');
									event.finish(); return;
								}
								if (c.indexOf('②') == 0) {
									player.storage.mpx_juezhi_opt2 = true;
									game.log(player, '获得了', '#g【爵制·猛】', '：本局游戏你使用【杀】造成的伤害+1');
									event.finish(); return;
								}
								if (c.indexOf('③') == 0) {
									event.mpxMode = 'hp';
									player.chooseTarget(true, '爵制：对一名角色造成1点伤害', function (card, player, target) {
										return target.isIn();
									}).set('ai', function (target) {
										return -get.attitude(_status.event.player, target);
									});
									return;
								}
								event.mpxMode = 'maxhp';
								player.chooseTarget(true, '爵制：令一名角色减少1点体力上限并失去1点体力', function (card, player, target) {
									return target.isIn();
								}).set('ai', function (target) {
									return -get.attitude(_status.event.player, target);
								});
								return;
								'step 4'
								// ③：对一名角色造成1点伤害，然后你增加1点体力上限
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].damage(1, player);
								}
								player.gainMaxHp(1);
								game.log(player, '增加了1点体力上限');
								event.finish(); return;
								'step 5'
								// ④：令一名角色减少1点体力上限（体力值高于上限则减至上限）
								if (result.bool && result.targets && result.targets.length) {
									result.targets[0].loseMaxHp(1);
									if (result.targets[0].hp > 0) result.targets[0].loseHp(1);
								}
								event.finish(); return;
							},
						},
						mpx_juezhi_mod: {
							charlotte: true, sub: true,
							mod: {
								cardUsable: function (card, player, num) {
									if (get.name(card) != 'sha') return;
									if (num === false) return false;
									if (typeof num != 'number') num = 0;
									return num + (player.storage.mpx_sha_bonus || 0);
								},
							},
						},
						mpx_xietu: {
							forced: true, locked: true, charlotte: true, direct: true, popup: false,
							enable: 'phaseUse',
							trigger: { player: ['phaseJieshuBegin', 'damageBegin2'] },
							filter: function (event, player) {
								// ★ filter 里 triggername 可能是 undefined（实测），name 兜底
								var xtn = event.triggername;
								if (xtn == undefined) xtn = event.name;
								if (xtn == 'phaseJieshuBegin') {
									// 诊断：结束阶段把行图计数写进战报，避免“满足了条件”各说各话
									game.log(player, '【携图】判定：行图已发动', (player.storage.mpx_xingtu_count || 0), '次 / 体力上限', player.maxHp);
									return !player.hasMark('mpx_tu') && player.isIn() && (player.storage.mpx_xingtu_count || 0) > player.maxHp;
								}
								if (xtn == 'damageBegin2') return player.hasMark('mpx_tu') && player.isIn();
								return false;
							},
							content: function () {
								'step 0'
								if (event.triggername == 'phaseJieshuBegin') {
									player.addMark('mpx_tu', 1);
									game.log(player, '获得了「图」');
									event.finish(); return;
								}
								if (event.triggername == 'damageBegin2') {
									if (!event.card || get.name(event.card) != 'sha') {
										trigger.cancel();
										game.log(player, '持有「图」，只能被【杀】造成伤害，取消了此伤害');
									}
									event.finish(); return;
								}
								player.removeMark('mpx_tu', 1);
								player.addTempSkill('mpx_tu_burst');
								game.log(player, '弃置了「图」，本回合使用牌无次数和距离限制');
							},
							ai: { order: 9, result: { player: 1 } },
						},
						mpx_tu: {
							charlotte: true, sub: true,
							intro: { name: '图', content: '持有「图」的角色只能被【杀】造成伤害；出牌阶段可弃置「图」，本回合使用牌无次数和距离限制。' },
						},
						mpx_tu_burst: {
							charlotte: true, sub: true,
							mod: {
								targetInRange: function () { return true; },
								cardUsable: function (card, player, num) {
									if (num === false) return false;
									if (typeof num != 'number') num = 0;
									return num + 99;
								},
							},
						},
						mpx_wantu: {
							audio: 2,
							enable: 'phaseUse',
							forced: true, locked: true, charlotte: true, popup: false, direct: true,
							trigger: { player: 'gainAfter' },
							init: function (player) {
								if (!player.storage.tdgx_sw) player.storage.tdgx_sw = {};
								if (player.storage.tdgx_sw['mpx_wantu'] == undefined) player.storage.tdgx_sw['mpx_wantu'] = 1;
							},
							filter: function (event, player) {
								if (event.triggername == 'gainAfter') {
									if (!event.getParent('draw')) return false;
									return game.hasPlayer(function (current) {
										return current != player && current.isIn() && current.hasSkill('mpx_zengtu_flag');
									});
								}
								return !!(player.storage.tdgx_sw && player.storage.tdgx_sw['mpx_wantu'] > 0) && game.hasPlayer(function (current) {
									return current != player && current.isIn();
								});
							},
							content: function () {
								'step 0'
								if (event.triggername == 'gainAfter') {
									var n = (trigger.cards && trigger.cards.length) ? trigger.cards.length : 1;
									for (var i = 0; i < game.players.length; i++) {
										var cur = game.players[i];
										if (cur != player && cur.isIn() && cur.hasSkill('mpx_zengtu_flag')) {
											cur.draw(n);
										}
									}
									game.log(player, '触发「完图」，拥有「赠图」的角色各摸了', get.cnNumber(n), '张牌');
									event.finish(); return;
								}
								player.storage.tdgx_sw['mpx_wantu']--;
								player.chooseTarget([1, 2], true, '完图：令至多两名其他角色获得「赠图」', function (card, player, target) {
									return target != player && target.isIn();
								}).set('ai', function (target) {
									return get.attitude(_status.event.player, target) > 0 ? 1 : 0;
								});
								'step 1'
								if (result.bool && result.targets && result.targets.length) {
									for (var i = 0; i < result.targets.length; i++) {
										result.targets[i].addMark('mpx_zengtu', 1);
										result.targets[i].addTempSkill('mpx_zengtu_flag');
									}
									game.log(player, '令', result.targets, '获得了「赠图」');
								}
							},
							ai: { order: 7, result: { player: 1 } },
						},
						mpx_zengtu: {
							charlotte: true, sub: true,
							intro: { name: '赠图', content: '裴秀于本回合每摸一张牌后，你摸一张牌。' },
						},
						mpx_zengtu_flag: {
							charlotte: true, sub: true,
						},
					},
					// ── 动态技能说明：转换技显示"当前形态" ──
					// 引擎在 game.js:62155 的 get.skillInfoTranslation 里查这里：
					//     if(player && lib.dynamicTranslate[name]) return lib.dynamicTranslate[name](player,name);
					// 另有 game.js:15472（发动时的提示）与 58645（技能详情弹窗）也读它。
					// 只写"当前形态"那一句 —— 两边都写全会看不清重点。
					dynamicTranslate: {
						bz_kongcheng: function (player) {
							return player.storage.bz_kongcheng
								? '转换技（当前·阳）。你受到伤害时进行一次判定：①若判定牌为锦囊牌，你令此伤害-1（至多减至0）；②若判定牌不为锦囊牌，你弃置一名角色的一张牌。'
								: '转换技（当前·阴）。你发动技能时摸一张牌。（当你手牌数变为零或从零改变时转换形态）';
						},
					},
				};
				return pkg;
			});
			// ============ 包名注册三连（雷霆万钧同款，选将界面可见/可选的关键） ============
			if (!lib.config.all.characters.contains('tiandiguiyi')) {
				lib.config.all.characters.push('tiandiguiyi');
			}
			if (!lib.config.characters.contains('tiandiguiyi')) {
				lib.config.characters.add('tiandiguiyi');
			}
			lib.translate['tiandiguiyi_character_config'] = '天地归一';
			// ============ 保底：手动展平（注册链漏跑时兜底，幂等） ============
			//
			// ★ 为什么必须自己展平 ──────────────────────────────────────
			// 非 extension 的 game.import(type, content) 只做一件事：
			//     lib.imported[type][content2.name] = content2;  delete content2.name;
			//   （game.js:37529-37534）—— **它不碰 lib.character / lib.skill / lib.translate**。
			// 真正的展平发生在启动期的**一次性**循环里（game.js:15126-15181，
			//   读 lib.imported.character → 逐包写入 lib[j][k]），
			// 而 lib.imported.character 在 game.js:11541 就被 delete 掉了，
			// 扩展的 precontent 又是在那之后才执行的（扩展加载循环 game.js:11550 起）。
			// ⇒ precontent 里 import 的包**不保证**被展平；技能能不能用、名字能不能显示，
			//   全看是否赶上了那一趟。这里手动补一遍，与引擎逻辑对齐、且幂等。
			//
			// ★ 另外两条必须知道的引擎行为 ────────────────────────────────
			//  1) game.js:15160-15162：translate 的键**恰好等于包名**时，引擎不会写
			//     lib.translate[包名]，而是写成 lib.translate[包名+'_character_config']。
			//     → 'tiandiguiyi':'天地归一' 会被改道，故上面手动补 _character_config。
			//  2) 所有写入都用 `== undefined` 守卫，绝不覆盖已有定义 —— 若展平已跑过，
			//     这里全部跳过；若没跑过，这里补上。两种时序结果一致。
			if (pkg) {
				// ── 技能：lib.skill[name] ──
				if (pkg.skill) {
					for (var sk in pkg.skill) {
						if (lib.skill[sk] == undefined) lib.skill[sk] = pkg.skill[sk];
					}
				}
				// ── 译名：lib.translate[key]（★ 名字能不能显示就看这里） ──
				if (pkg.translate) {
					for (var tk in pkg.translate) {
						if (lib.translate[tk] == undefined) lib.translate[tk] = pkg.translate[tk];
					}
				}
				// ── 动态技能说明：lib.dynamicTranslate[skill] ──
				// 与 skill/translate 同理：precontent 里 import 的包**不保证**被引擎展平，
				// 这里手动补一遍（幂等、带 undefined 守卫）。缺失时转换技就只显示静态 _info，
				// 不会崩 —— 只是看不到"当前形态"。
				if (pkg.dynamicTranslate) {
					if (!lib.dynamicTranslate) lib.dynamicTranslate = {};
					for (var dk in pkg.dynamicTranslate) {
						if (lib.dynamicTranslate[dk] == undefined) lib.dynamicTranslate[dk] = pkg.dynamicTranslate[dk];
					}
				}
				// ── 武将简介：lib.characterIntro[name] ──
				if (pkg.characterIntro) {
					if (!lib.characterIntro) lib.characterIntro = {};
					for (var ik in pkg.characterIntro) {
						if (lib.characterIntro[ik] == undefined) lib.characterIntro[ik] = pkg.characterIntro[ik];
					}
				}
				// ── 武将本体 + 技能清单 ──
				if (pkg.character) {
					for (var cid in pkg.character) {
						if (!lib.character[cid]) lib.character[cid] = pkg.character[cid];
						// 引擎会给 [4] 补空数组（game.js:15146-15148），缺了会在
						// game.js:22842 的 info[4].contains(...) 上崩，故同样补上
						if (!lib.character[cid][4]) lib.character[cid][4] = [];
						var skl = lib.character[cid][3];
						for (var si = 0; si < skl.length; si++) {
							if (!lib.skilllist.contains(skl[si])) lib.skilllist.add(skl[si]);
						}
					}
				}
			}
		},
	};
});
