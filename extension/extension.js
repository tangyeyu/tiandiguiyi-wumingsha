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
//  B7  mgj_ce_bound  无技能定义的裸标记（取不到 intro，无法显示）
//                    → 改用 player.storage.mgj_ce_bound。
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
					},
					characterIntro: {
						mouguojia_soul: '谋郭嘉·魂。<br>定策：游戏开始时，你选择一名其他角色令其获得「策」，你与该角色相互间无法造成伤害；当你死亡时，可选择移除「策」。<br>铸策：你的回合开始时，给「策」添加一项效果（回复体力/额外执行一个出牌阶段（不摸牌）/使用牌造成的伤害+1/跳过一次弃牌阶段；前三项各限一次并永久存在，④不限次数但其标记在持有者回合结束时弃置）。<br>沥血：锁定技，当你体力值发生变动时，你与「策」各摸X+1张牌（X为「策」的效果数，至多4）。',
						zhuan_caomao: '转·曹髦。<br>决境：每轮开始时，令全场各摸一张牌，并将各自摸到的那张转为闪电对其自己使用（判定区已有闪电者跳过）；有人在闪电判定时你摸牌；你自己的闪电判定成功时免伤、清空全场判定区的闪电并永久失去决境。<br>奇技：锁定技，回合结束时夺取本回合未被你伤害过的角色各一张牌；受伤时可弃判定区牌免伤；有人受≥2点伤害时，你可摸X（体力值）或Y（全场判定区牌数）张。<br>讨贼：锁定技，每轮开始可把任意牌压入牌堆底，累计超过体力上限后即可无视次数与距离使用牌堆底的牌。',
					},
					translate: {
						'tiandiguiyi': '天地归一',
						'mouguojia_soul': '谋郭嘉·魂',
						'mgj_dingce': '定策',
						'mgj_dingce_info': '锁定技。游戏开始时，你选择一名其他角色令其获得「策」标记。当你死亡时，你可以选择是否移除「策」。你与拥有「策」的角色相互间无法造成伤害。',
						'mgj_zhuce': '铸策',
						'mgj_zhuce_info': '回合开始时，你给「策」添加以下其中一项效果：1.回合开始时，恢复一点体力 2.回合开始时，执行一个额外的出牌阶段。 3.当你使用造成伤害时，若此牌指定的目标数为1，则此牌造成的伤害+1 4.跳过一次弃牌阶段（前三个选项限一次并永久存在）',
						'mgj_lixue': '沥血',
						'mgj_lixue_info': '锁定技。当你体力值发生变动时，你可以与拥有「策」的角色一起摸X+1张牌（X为「策」的效果数量）。',
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
					},
					skill: {
						// ============ 定策 ============
						mgj_dingce: {
							forced: true,
							// ── 触发时机（实测修正）──────────────────────────────
							// 原写法 { global:'gameStart', player:'enterGame' } 两半都可能失效：
							//  · enterGame：game.js:44881 triggerEnter 只在 addFellow / restorePlayer
							//    （中途加入、换将、复活）时创建，**开局流程不经过它**
							//  · gameStart：identity.js:355 在开局 step 5 末尾派发，能否被收集
							//    取决于那一刻本技能是否已注册进 lib.hook.globaltrigger
							//    （addSkillTrigger 在 addSkill 时注册，时机可能更晚）
							// 实测现象：技能已挂到玩家身上、content 可编译、闸门为真，
							// 但 mgj_ce_bound 始终为 false —— 即 content 一次都没执行过。
							//
							// 加固：加 gameDrawAfter 兜底 —— 它在开局 step 6（game.gameDraw）之后，
							// 必然晚于玩家初始化与技能挂载。mgj_ce_bound 保证只会真正选一次，
							// 因此多挂一个时机不会重复触发。
							trigger: { global: ['gameStart', 'gameDrawAfter'], player: 'enterGame' },
							filter: function (event, player) {
								// 去掉原来的 event.name 白名单 —— trigger 已限定时机，
								// 而原白名单只放行 gameStart / enterGame，会把 gameDrawAfter 兜底挡掉。
								// 同时给 storage 加保险（避免 storage 未初始化时抛错）。
								return !!(player.hasSkill('mgj_dingce') &&
									player.storage && !player.storage.mgj_ce_bound);
							},
							// 步骤标记一律写在本函数体顶层（不嵌套在 if/else 内）。
							// 这样在 parsex 的**两条分支**下都能正确编译：
							//   · finalParsex=='old' 分支（game.js:12072-12090）：纯正则替换、无 try/catch
							//   · Legacy() 分支（game.js:12094-12133）：带 try/catch，非法替换会被静默跳过
							// generator 写法只在 Legacy 分支可用，old 分支会把解构参数 { player } 当成函数体切错位。
							content: function () {
								'step 0'
								player.chooseTarget('选择一名其他角色获得「策」', function (card, player, target) {
									return target != player;
								}).set('ai', function () { return 1; });
								'step 1'
								var target = null;
								if (result && result.targets && result.targets.length) {
									target = result.targets[0];
								}
								else {
									// 未选（或超时）：兜底给下家
									var nb = player.getNext();
									if (nb && nb != player) target = nb;
								}
								if (target) {
									target.addMark('mgj_ce', 1);
									player.storage.mgj_ce_bound = true;
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
							//   代价：多点伤害/多点回复会按"每次体力变动"各触发一次（酒杀=2 次），
							//   这与卡面「体力值发生变动时」的字面读法一致。
							//
							// ★ forceDie:true 是必须的：引擎在 createTrigger 里对死亡玩家直接 return
							//   （game.js:40320 `if(player.isDead()&&!info.forceDie) return;`），
							//   而"体力值变动"完全可能发生在自己濒死/已阵亡的结算途中。
							forceDie: true,
							trigger: { player: 'changeHp' },
							filter: function (event, player) {
								return findCeTarget() != null;
							},
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
