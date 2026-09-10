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
//                    → 四个效果一个都不会被添加。改为 generator 顺序流。
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
//  B10 mgj_zhuce     stepHead 使 var ce 每步重算 —— generator 天然只求值一次，
//                    属无害归一化（原实现每步重算亦非有意设计）。
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
				var findCeTarget = function () {
					for (var i = 0; i < game.players.length; i++) {
						if (game.players[i].hasMark('mgj_ce')) {
							return game.players[i];
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
					},
					characterIntro: {
						mouguojia_soul: '谋郭嘉·魂。<br>定策：游戏开始时，你选择一名其他角色令其获得「策」，你与该角色相互间无法造成伤害；当你死亡时，可选择移除「策」。<br>铸策：你的回合开始时，给「策」添加一项效果（回复体力/额外执行一个出牌阶段（不摸牌）/使用牌造成的伤害+1/跳过一次弃牌阶段；前三项各限一次并永久存在）。<br>沥血：锁定技，当你体力值发生变动时，你与「策」各摸X+1张牌（X为「策」的效果数）。',
					},
					translate: {
						'tiandiguiyi': '天地归一',
						'mouguojia_soul': '谋郭嘉·魂',
						'mgj_dingce': '定策',
						'mgj_dingce_info': '锁定技。游戏开始时，你选择一名其他角色令其获得「策」标记。当你死亡时，你可以选择是否移除「策」。你与拥有「策」的角色相互间无法造成伤害。',
						'mgj_zhuce': '铸策',
						'mgj_zhuce_info': '你的回合开始时，你给「策」添加以下其中一项效果：①给「策」添加【回复体力】（限一次）；②给「策」添加【额外执行一个出牌阶段：不摸牌】（限一次）；③给「策」添加【使用牌造成的伤害+1】（限一次，永久）；④给「策」添加【跳过一次弃牌阶段】。',
						'mgj_lixue': '沥血',
						'mgj_lixue_info': '锁定技。当你体力值发生变动时，你与拥有「策」的角色各摸X+1张牌（X为「策」的效果数量）。',
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
								'step 0'
								if (!ce) { event.finish(); return; }
								var keys = [];
								var labels = [];
								if (ce.countMark('mgj_picked1') < 1) { keys.push('mgj_eff1'); labels.push('①回复体力（限一次）'); }
								if (ce.countMark('mgj_picked2') < 1) { keys.push('mgj_eff2'); labels.push('②额外出牌阶段（限一次）'); }
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
							intro: { name: '铸策·愈', content: '你的回合开始时回复1点体力，然后移去此标记。' },
							trigger: { global: 'phaseBegin' },
							filter: function (event) {
								var ce = findCeTarget();
								return ce != null && event.player == ce && ce.countMark('mgj_eff1') > 0;
							},
							content: function () {
								var ce = trigger.player;
								if (ce.countMark('mgj_eff1') > 0) {
									ce.recover(1);
									ce.removeMark('mgj_eff1', 1);
									game.log(ce, '消耗了「策」效果', '#g【回复体力】');
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
								var ce = trigger.player;
								// 额外出牌阶段的插队姿势（作者心得 §4.6，经验证有效）：
								// phaseUse() 默认排到事件流末尾，需先摘出、再插到当前流程队首
								var next = ce.phaseUse();
								event.next.remove(next);
								trigger.getParent().next.unshift(next);
								ce.removeMark('mgj_eff2', 1);
								game.log(ce, '消耗了「策」效果', '#g【额外出牌阶段】');
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
						// —— 铸策·逸：跳过一次弃牌阶段 ——
						mgj_skip: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { global: 'phaseDiscardBefore' },
							filter: function (event) {
								var ce = findCeTarget();
								return ce != null && event.player == ce && ce.countMark('mgj_eff4_perm') > 0;
							},
							content: function () {
								// 取消弃牌阶段必须取消触发源事件（此处原实现即正确）
								trigger.cancel();
								var ce = trigger.player;
								ce.removeMark('mgj_eff4_perm', 1);
								game.log(ce, '消耗了「策」效果', '#g【跳过弃牌阶段】');
							},
						},

						// ============ 沥血 ============
						mgj_lixue: {
							forced: true,
							// B6：loseHp 是独立事件（game.js:26455 createEvent('loseHp')），
							// 「失去体力」不产生 damage 事件 → 原文只挂 damageEnd/recover 会漏掉它，
							// 与卡面「体力值发生变动」不符。补 loseHpEnd。
							trigger: { player: ['damageEnd', 'recover', 'loseHpEnd'] },
							filter: function (event, player) {
								return findCeTarget() != null;
							},
							content: function () {
								// ★ 同 mgj_zhuce：content 被 new Function 重编译，findCeTarget / ceX 均不可用
								var ce = null;
								for (var i = 0; i < game.players.length; i++) {
									if (game.players[i].hasMark('mgj_ce')) { ce = game.players[i]; break; }
								}
								var x = 0;
								if (ce) {
									x = ce.countMark('mgj_eff1') + ce.countMark('mgj_eff2') +
										ce.countMark('mgj_eff3_perm') + ce.countMark('mgj_eff4_perm');
								}
								player.draw(x + 1, 'nodelay');
								if (ce) ce.draw(x + 1, 'nodelay');
								event.finish();
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
							intro: { name: '铸策·再战', content: '你的回合开始时，额外执行一个出牌阶段（不摸牌），然后移去此标记。' },
						},
						mgj_eff3_perm: {
							charlotte: true,
							sub: true,
							intro: { name: '铸策·锐', content: '你使用单目标牌造成的伤害+1（永久，不移去）。' },
						},
						mgj_eff4_perm: {
							charlotte: true,
							sub: true,
							intro: { name: '铸策·逸', content: '你的弃牌阶段开始时，移去此标记并跳过该阶段。' },
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
			// ============ 保底：手动展平 + 技能清单（注册链漏跑时兜底，幂等） ============
			if (pkg && pkg.character) {
				for (var cid in pkg.character) {
					if (!lib.character[cid]) lib.character[cid] = pkg.character[cid];
					for (var si = 0; si < pkg.character[cid][3].length; si++) {
						var skn = pkg.character[cid][3][si];
						if (!lib.skilllist.contains(skn)) lib.skilllist.add(skn);
					}
				}
			}
		},
	};
});
