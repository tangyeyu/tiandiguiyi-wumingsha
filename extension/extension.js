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
							'lx_qianxun', 'lx_zhangcai', 'lx_zhangcai_mod',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_luxun.jpg']],
						tdgx_liubei: ['male', 'shu', 4, [
							'mlb_rende', 'mlb_rende_reclaim', 'mlb_rende_draw',
							'mlb_rende_nullify', 'mlb_rende_give',
							'mlb_zhangwu', 'mlb_zhangwu_mod', 'mlb_xinghan',
							'tdgx_shenwei_kill', 'tdgx_turn_reset'
						], ['ext:天地归一/tdgx_liubei.jpg']],
						tdgx_duyu: ['male', 'qun', 4, [
							'dy_wuku', 'dy_wuku_use', 'dy_wuku_respond',
							'dy_pozhu', 'dy_pozhu_turn', 'dy_pozhu_perm', 'dy_pozhu_check',
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
					},
					characterIntro: {
						mouguojia_soul: '谋郭嘉·魂。<br>定策：游戏开始时，你可以选择一名其他角色令其获得「策」（放弃发动则本技能本局不再生效），你与该角色相互间无法造成伤害；当你死亡时，可选择移除「策」。<br>铸策：你的回合开始时，给「策」添加一项效果（回复体力/额外执行一个出牌阶段（不摸牌）/使用牌造成的伤害+1/跳过一次弃牌阶段；前三项各限一次并永久存在，④不限次数但其标记在持有者回合结束时弃置）。<br>沥血：锁定技，当你体力值发生变动时，你可以摸X+1张牌（X为「策」的效果数，至多4）；若场上没有「策」，你摸一张牌。',
						zhuan_caomao: '转·曹髦。<br>决境：每轮开始时，令全场各摸一张牌，并将各自摸到的那张转为闪电对其自己使用（判定区已有闪电者跳过）；有人在闪电判定时你摸牌；你自己的闪电判定成功时免伤、清空全场判定区的闪电并永久失去决境。<br>奇技：锁定技，回合结束时夺取本回合未被你伤害过的角色各一张牌；受伤时可弃判定区牌免伤；有人受≥2点伤害时，你可摸X（体力值）或Y（全场判定区牌数）张。<br>讨贼：锁定技，每轮开始可把任意牌压入牌堆底，累计超过体力上限后即可无视次数与距离使用牌堆底的牌。',
						tdgx_luxun: '名·陆逊。<br>连营：锁定技，失去非使用打出的牌获「谦」；没有牌时摸至体力上限；出牌阶段开始时按「谦」数摸牌并弃谦；结束阶段视使用打出与弃牌情况摸牌。<br>炽炎：出牌阶段限X次（X为轮次），弃等同体力值的牌造成火焰伤害并可视为使用铁索连环；结束阶段按以此法造成的伤害对连环角色扩大打击。<br>谦逊：锁定技，受伤时按「谦」与体力上限的关系判定摸牌/减伤/免疫。<br>彰才（神威技）：发动后本局使用牌无次数和距离限制。',
						tdgx_liubei: '名·刘备。<br>仁德：开局3个「仁」，回合开始收回全部「仁」，出牌阶段按「仁」数摸牌；有「仁」者被指定为目标时可付代价令此牌无效（每回合限一次）；结束阶段可把「仁」分配给不同角色。<br>章武（神威技）：回合开始时额外执行一个出牌阶段且本回合使用牌无次数限制。<br>兴汉（主公技）：开局多得1个「仁」；蜀势力角色对你造成的伤害免疫（每名角色每回合限1次）。',
						tdgx_duyu: '名·杜预。<br>武库：场上有人装备牌时获「备」并摸牌（上限5）；出牌阶段可耗「备」把一张牌当非装备牌使用（每回合限一次）。<br>破竹：每回合限一次选一种牌名，本回合无次数距离限制地使用；若以此造成过伤害则本局永久解锁。<br>振鞘：锁定技，装备武器时使用牌无法被响应；造成伤害时可令其免疫并夺取其装备区所有牌；用【杀】造成伤害时伤害+X（攻击范围-体力值，最小0）。<br>灭吴（神威技）：摸等同于「备」数+体力上限的牌。',
						tdgx_lukang: '名·陆抗。<br>毁堰：出牌阶段废除自己的一个区域换对应效果（武器/防具/进攻马/防御马/判定区/手牌区，六选一，各有一次性效果）。<br>抗晋：被体力不低于你的角色伤害时可弃牌判定免伤；造成伤害后可让一名角色的区域状态本轮与你相同，并恢复自己一个装备栏。<br>背水（神威技）：恢复所有已废除的区域。',
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
						'lx_lianying': '连营',
						'lx_lianying_info': '锁定技，每当你因非使用和打出而失去牌时，你获得一个「谦」标记。当你没有牌时，你将手牌数摸至体力上限。出牌阶段开始时，你摸等同于「谦」数量的牌，并弃置所有的「谦」。结束阶段，若你使用或打出的牌数不大于你的体力值，你摸等同于你弃牌阶段弃置牌数的牌。',
						'lx_lianying_draw': '连营·清囊',
						'lx_lianying_end': '连营·复盘',
						'lx_chiyang': '炽炎',
						'lx_chiyang_info': '出牌阶段限X次（X为游戏轮次），你可以弃置等同于你当前体力值的牌，并对一名角色造成1点火焰伤害，然后你可以弃置一张牌，视为使用【铁索连环】。结束阶段，若你以此法造成的伤害不小于你的体力值，你可以对所有处于连环状态的角色造成1点火焰伤害，并弃置其装备区内的所有牌。',
						'lx_chiyang_end': '炽炎·燎原',
						'lx_qianxun': '谦逊',
						'lx_qianxun_info': '锁定技，当你受到伤害时：若你的「谦」小于体力上限，你进行一次判定，若结果为红色，你摸两张牌；若你的「谦」大于体力上限，你可以弃置等同于你体力值的「谦」，令此伤害-1；若你的「谦」等于体力上限，你免疫此伤害。',
						'lx_zhangcai': '彰才',
						'lx_zhangcai_info': '神威技，出牌阶段，你可以发动：本局游戏剩余时间内，你使用牌无次数和距离限制。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
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
						'dy_wuku_use': '武库·启备',
						// 子技能（sub）也补 _info：lint C5 只对 sub 技能降级为 INFO，
						// 缺 _info 会被判 WARN（C5 的判据是 lib.translate[skill+'_info'] 是否存在）。
						'dy_wuku_use_info': '出牌阶段限一次：消耗一个「备」标记，将你区域内的一张牌当非装备牌使用。',
						'dy_wuku_respond': '武库·启备（打出）',
						'dy_wuku_respond_info': '响应时：消耗一个「备」标记，将你区域内的一张牌当当前索要的非装备牌打出（牌名范围与「使用」相同，且与「使用」共用每回合一次的额度）。',
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
						'lkang_kangjin_info': '锁定技，当你受到体力值不小于你的角色造成的伤害时，你可以弃置一张牌并进行判定：若结果为红色，你免除此次伤害。当你造成伤害后，你可以令一名角色的一个区域状态本轮与你相同，然后你选择恢复你装备区内的一个栏位。',
						'lkang_kangjin_copy': '抗晋·同轨',
						'lkang_kangjin_clear': '抗晋·复轨',
						'lkang_beishui': '背水',
						'lkang_beishui_info': '神威技，出牌阶段，你可以发动：恢复你所有已失效的区域。<br>（神威技：初始可用1次；当你击杀一名角色时使用次数+1，该加成每局游戏限触发一次）',
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
								cardUsable: function (card, player, num) { return num + 99; },
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
								var list = ['lx_zhangcai', 'mlb_zhangwu', 'dy_miewu', 'lkang_beishui'];
								for (var i = 0; i < list.length; i++) {
									if (player.hasSkill(list[i]) && !(player.storage.tdgx_sw_bonus && player.storage.tdgx_sw_bonus[list[i]])) return true;
								}
								return false;
							},
							content: function () {
								var list = ['lx_zhangcai', 'mlb_zhangwu', 'dy_miewu', 'lkang_beishui'];
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
								}
								if (trigger.player && trigger.player.storage) {
									trigger.player.storage.lx_cy_used = 0;
									// 杜预「武库」的限次（使用与打出**共用一个额度**，故手工记账）
									trigger.player.storage.dy_wk_used = 0;
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
									player.addMark('lx_qian', 1);
								}
								if (player.countCards('hej') == 0 && player.isIn()) {
									var n = player.maxHp - player.countCards('h');
									if (n > 0) {
										player.draw(n);
										game.log(player, '已没有牌，将手牌摸至体力上限');
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
								player.addSkill('lx_zhangcai_mod');
								game.log(player, '发动了神威技', '#g【彰才】', '，本局游戏使用牌无次数和距离限制');
							},
							ai: { order: 8, result: { player: 1 } },
						},
						lx_zhangcai_mod: {
							charlotte: true,
							sub: true,
							mod: {
								cardUsable: function (card, player, num) { return num + 99; },
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
								cardUsable: function (card, player, num) { return num + 99; },
							},
						},
						// 兴汉（主公技）：蜀势力伤害免疫（每名角色每回合限 1 次）
						// mlb_xh_log[攻击者 playerid] 由 tdgx_turn_reset 每回合清空
						mlb_xinghan: {
							audio: 2,
							zhuSkill: true,
							locked: true,
							forced: true,
							popup: false,
							trigger: { player: 'damageBegin' },
							filter: function (event, player) {
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
						dy_wuku: {
							locked: true,
							forced: true,
							popup: false,
							direct: true,
							trigger: { global: 'equipAfter' },
							filter: function (event, player) {
								return player.isIn() && player.countMark('dy_bei') < 5;
							},
							content: function () {
								player.addMark('dy_bei', 1);
								player.draw(1);
							},
						},
						// 武库·启备：消耗「备」把一张牌当非装备牌**使用**（每回合限一次）
						// ★ 卡面「一张区域内的牌」落地为 手牌+装备区：chooseCard 不支持判定区
						//   （atlas C11：'j' 没有分支，判定区只能走 choosePlayerCard）。
						// ★ 转化用 get.autoViewAs({name}, [实体牌])（ddd.js:103 同族写法）；
						//   取消使用则不消耗「备」（removeMark 放在确认成功之后）。
						//
						// ★★ 限次改为手工记账 storage.dy_wk_used（原为 usable:1）：
						//   「使用」与「打出」必须**共用一个额度**（卡面写的是"出牌阶段限一次"），
						//   而打出走的是 viewAs 响应路径（dy_wuku_respond），**不经过** enabled/usable
						//   闸门检查（usable 只在 game.js:33066 的 trigger 判定链里生效），
						//   故引擎的 usable 字段管不住它 ⇒ 两处统一查同一个计数器。
						//   复位点挂在既有的 tdgx_turn_reset（每回合开始，含回合拥有者）。
						dy_wuku_use: {
							audio: 'wuku',
							enable: 'phaseUse',
							filter: function (event, player) {
								if (player.storage.dy_wk_used) return false;
								return player.countMark('dy_bei') > 0 && player.countCards('he') > 0;
							},
							content: function () {
								'step 0'
								player.chooseCard('he', '武库：选择一张牌，将其当非装备牌使用', true)
									.set('ai', function (card) { return 5 - get.value(card); });
								'step 1'
								if (!result.bool || !result.cards || !result.cards.length) { event.finish(); return; }
								event.dyCard = result.cards[0];
								var names = [];
								for (var i in lib.card) {
									var info = lib.card[i];
									if (!info) continue;
									var en = info.enable;
									if (!(en == 'phaseUse' || (en && en.contains && en.contains('phaseUse')))) continue;
									if (get.type(i, 'trick') == 'equip') continue;
									if (!names.contains(i)) names.push(i);
								}
								event.dyNames = names;
								if (!names.length) { event.finish(); return; }
								player.chooseButton(['武库：选择要视为使用的牌名', names], true);
								'step 2'
								if (!result.bool || !result.links || !result.links.length) { event.finish(); return; }
								event.dyName = result.links[0];
								player.chooseUseTarget(get.autoViewAs({ name: event.dyName }, [event.dyCard]), '武库：选择【' + get.translation(event.dyName) + '】的目标');
								'step 3'
								if (result.bool) {
									player.removeMark('dy_bei', 1);
									player.storage.dy_wk_used = 1;
									game.log(player, '消耗了一个「备」，将一张牌当', '#y【' + get.translation(event.dyName) + '】', '使用');
								}
							},
							ai: { order: 4, result: { player: 1 } },
						},
						// 武库·启备（打出）：响应期把一张牌当**任意非装备牌**打出。
						// ── 设计口径（两项待定的落地）──────────────────────────────
						// ① 打出时用什么牌名：**不预设白名单**，与「使用」同一口径 ——
						//    候选取自 lib.card 里全部 enable 含 phaseUse 的非装备牌名
						//    （即玩家自己选牌名），对齐原版武库的"当非装备牌使用或打出"。
						//    之所以不会变成"万能响应"：产出哪个牌名由 **viewAs 函数按当前索要**决定 ——
						//    响应窗口索要的牌名可从 `_status.event._args[0].name` 读到
						//    （全库 7 处调用全是 chooseToRespond({name:'sha'|'shan'})，
						//     如 hearth.js:8642 / yws.js:2388），且 chooseToRespond 会校验所选牌
						//     是否满足 filterCard（不满足会重新询问）⇒ 无法用【闪】去顶【杀】。
						//    ★ 与固定 viewAs 的关系：引擎在**响应可用性判定**时只拿固定 viewAs 比对
						//      （game.js:42931 `typeof info.viewAs!='function'` 才比对），函数形态会跳过该比对；
						//      因此 skill.enable 就是本武将视角的"有活可干"（持有「备」且本回合未用过）。
						// ② 使用与打出如何共用限次：共用同一个 storage.dy_wk_used（每回合 1 次），
						//    见 dy_wuku_use 注释。viewAs 技能不能有 content ⇒ 扣减写在 onrespond 里
						//    （game.js:20010-20012 在 respond 事件中调用 lib.skill[event.skill].onrespond）。
						// ── 机制依据 ──────────────────────────────────────────────
						//   形态照抄引擎自带的 aozhan_sha（game.js:34153-34179）：
						//   enable / filterCard / position / prompt / onrespond；
						//   viewAs 用函数形式（game.js:58671 在玩家确认选择后调用，此时可按索要取名）。
						dy_wuku_respond: {
							audio: 'wuku',
							enable: ['chooseToRespond'],
							filterCard: function (card, player) {
								return player.countMark('dy_bei') > 0 && !player.storage.dy_wk_used;
							},
							viewAs: function (cards, player) {
								// 产出「当前响应窗口索要的牌名」——这就是原版武库"当非装备牌"的语义：
								// 牌名取自 lib.card 的全部非装备牌名，但**实际用哪个由索要决定**
								// （读 _args[0].name，全库响应调用均为 chooseToRespond({name:'sha'|'shan'})）。
								// 读不到时兜底 'sha'。
								// ★ 为什么不在函数里开对话框让玩家手选牌名：viewAs 是在玩家点"确定"的
								//   UI 回调里同步求值的（game.js:58653 的 ok: handler → 58671 调用 viewAs），
								//   在那里再开对话框不安全（无先例，且可能卡住响应流程）。故不做手选。
								var need = '';
								try {
									var args = _status.event && _status.event._args;
									if (args && args[0] && args[0].name) need = args[0].name;
								} catch (e) { need = ''; }
								return { name: need || 'sha', isCard: true };
							},
							position: 'he',
							prompt: '武库：消耗一个「备」，将一张牌当非装备牌打出',
							check: function () { return 1 },
							onrespond: function (event, player) {
								player.removeMark('dy_bei', 1);
								player.storage.dy_wk_used = 1;
								game.log(player, '消耗了一个「备」，将一张牌当非装备牌打出');
							},
							ai: { respondSha: true, respondShan: true, order: 1 },
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
								player.chooseButton(['破竹：选择一种牌名（本回合使用无次数与距离限制）', names], true);
								'step 1'
								if (!result.bool || !result.links || !result.links.length) { event.finish(); return; }
								player.storage.dy_pz_name = result.links[0];
								player.addTempSkill('dy_pozhu_turn');
								game.log(player, '发动了', '#g【破竹】', '，本回合使用【', '#y' + get.translation(result.links[0]), '】无次数与距离限制');
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
									if (player.storage.dy_pz_name && (card.viewAs || card.name) == player.storage.dy_pz_name) return num + 99;
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
									if (player.storage.dy_pz_perm && player.storage.dy_pz_perm.contains(card.viewAs || card.name)) return num + 99;
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
								player.chooseControl(labels)
									.set('prompt', '毁堰：选择一个区域令其失效')
									.set('ai', function () { return 0; });
								'step 1'
								var idx = (result && typeof result.index == 'number') ? result.index : 0;
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
									if ((player.storage.lkang_zone && player.storage.lkang_zone.judge) || (player.storage.lkang_copy && player.storage.lkang_copy.judge)) return num + 99;
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
								player.chooseControl(event.lkLabels)
									.set('prompt', '抗晋：选择复制状态的区域（你已失效的区域）')
									.set('ai', function () { return 0; });
								'step 2'
								var idx = (result && typeof result.index == 'number') ? result.index : 0;
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
								var z = player.storage.lkang_zone || {};
								var keys = [];
								var labels = [];
								if (z.e1) { keys.push('e1'); labels.push('武器区'); }
								if (z.e2) { keys.push('e2'); labels.push('防具区'); }
								if (z.e3) { keys.push('e3'); labels.push('进攻马'); }
								if (z.e4) { keys.push('e4'); labels.push('防御马'); }
								if (!keys.length) { event.finish(); return; }
								event.lkRKeys = keys;
								player.chooseControl(labels)
									.set('prompt', '抗晋：恢复你装备区内的一个栏位')
									.set('ai', function () { return 0; });
								'step 4'
								var idx = (result && typeof result.index == 'number') ? result.index : 0;
								var key = event.lkRKeys[idx];
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
