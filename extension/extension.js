'use strict';
// ============================================================
// 无名杀扩展：天地归一（武将包：谋郭嘉·魂）
// 标准写法：扩展壳 + precontent 内 game.import('character')（雷霆万钧同款）
// 武将数组挂全部技能（含隐藏子技能），保证触发与被展示
// ============================================================
game.import("extension", function (lib, game, ui, get, ai, _status) {
	return {
		name: '天地归一',
		editable: false,
		precontent: function () {
			var pkg;
			game.import('character', function () {
				// ---- 包内闭包辅助 ----
				var findCeTarget = function () {
					for (var i = 0; i < game.players.length; i++) {
						if (game.players[i].hasMark('mgj_ce')) {
							return game.players[i];
						}
					}
					return null;
				};
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
					},
					skill: {
						// ============ 定策 ============
						mgj_dingce: {
							forced: true,
							trigger: { global: 'gameStart', player: 'enterGame' },
							filter: function (event, player) {
								if (event.name != 'enterGame' && event.name != 'gameStart') return false;
								return player.hasSkill('mgj_dingce') && !player.hasMark('mgj_ce_bound');
							},
							content: function () {
								'step 0'
								player.chooseTarget('选择一名其他角色获得「策」', function (card, player, target) {
									return target != player;
								}).set('ai', function () { return 1; });
								'step 1'
								if (result.targets && result.targets.length) {
									var target = result.targets[0];
									target.addMark('mgj_ce', 1);
									player.addMark('mgj_ce_bound', 1);
									game.log(player, '令', target, '获得了标记', '#g【策】');
								}
								else {
									var nb = player.getNext();
									if (nb && nb != player) {
										nb.addMark('mgj_ce', 1);
										player.addMark('mgj_ce_bound', 1);
										game.log(player, '令', nb, '获得了标记', '#g【策】');
									}
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
								var source = get.player(event.source);
								var target = get.player(event.player);
								if (!source || !target) return false;
								if (isSoul(source) && target.hasMark('mgj_ce')) return true;
								if (isSoul(target) && source.hasMark('mgj_ce')) return true;
								return false;
							},
							content: function () {
								event.cancel();
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
								var ce = findCeTarget();
								'step 0'
								if (!ce) { event.finish(); return; }
								player.chooseBool('是否移除「策」标记？').set('ai', function () { return false; });
								'step 1'
								if (result.bool) {
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
							content: function () {
								var ce = findCeTarget();
								'step 0'
								if (!ce) { event.finish(); return; }
								// 效果1：回复体力（限一次）
								if (ce.countMark('mgj_picked1') < 1) {
									player.chooseBool('给「策」添加效果【回复体力】（限一次）？').set('ai', function () { return true; });
									'step 1'
									if (result.bool) {
										ce.addMark('mgj_eff1', 1);
										ce.addMark('mgj_picked1', 1);
										game.log(player, '给「策」添加了效果', '#g【回复体力】');
									}
									'step 2'
								} else {
									'step 1'
									'step 2'
								}
								// 效果2：额外执行一个出牌阶段（不摸牌，限一次）
								if (ce.countMark('mgj_picked2') < 1) {
									player.chooseBool('给「策」添加效果【额外执行一个出牌阶段：不摸牌】（限一次）？').set('ai', function () { return true; });
									'step 3'
									if (result.bool) {
										ce.addMark('mgj_eff2', 1);
										ce.addMark('mgj_picked2', 1);
										game.log(player, '给「策」添加了效果', '#g【额外出牌阶段】');
									}
									'step 4'
								} else {
									'step 3'
									'step 4'
								}
								// 效果3：使用牌造成的伤害+1（限一次，永久）
								if (ce.countMark('mgj_picked3') < 1) {
									player.chooseBool('给「策」添加效果【使用牌造成的伤害+1】（限一次，永久）？').set('ai', function () { return true; });
									'step 5'
									if (result.bool) {
										ce.addMark('mgj_eff3_perm', 1);
										ce.addMark('mgj_picked3', 1);
										game.log(player, '给「策」添加了效果', '#g【伤害+1】');
									}
									'step 6'
								} else {
									'step 5'
									'step 6'
								}
								// 效果4：跳过一次弃牌阶段
								player.chooseBool('给「策」添加效果【跳过一次弃牌阶段】？').set('ai', function () { return true; });
								'step 7'
								if (result.bool) {
									ce.addMark('mgj_eff4_perm', 1);
									game.log(player, '给「策」添加了效果', '#g【跳过弃牌阶段】');
								}
								event.finish();
							},
						},
						// —— 铸策·愈：回合开始回复体力 ——
						mgj_eff1: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseBegin' },
							filter: function (event, player) {
								return player.hasMark('mgj_ce') && player.countMark('mgj_eff1') > 0;
							},
							content: function () {
								if (player.countMark('mgj_eff1') > 0) {
									player.recover(1);
									player.removeMark('mgj_eff1', 1);
									game.log(player, '消耗了「策」效果', '#g【回复体力】');
								}
								event.finish();
							},
						},
						// —— 铸策·再战：额外执行一个出牌阶段（不摸牌） ——
						mgj_extra_phase: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseBegin' },
							filter: function (event, player) {
								return player.hasMark('mgj_ce') && player.countMark('mgj_eff2') > 0;
							},
							content: function () {
								var next = player.phaseUse();
								event.next.remove(next);
								trigger.getParent().next.unshift(next);
								player.removeMark('mgj_eff2', 1);
								game.log(player, '消耗了「策」效果', '#g【额外出牌阶段】');
							},
						},
						// —— 铸策·锐：使用牌造成的伤害+1（单目标） ——
						mgj_boost: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { source: 'damageBegin' },
							filter: function (event, player) {
								if (!player.hasMark('mgj_ce') || player.countMark('mgj_eff3_perm') < 1) return false;
								if (!event.card) return false;
								var info = get.info(event.card);
								if (!info || info.selectTarget != 1) return false;
								return true;
							},
							content: function () {
								event.damage += 1;
							},
						},
						// —— 铸策·逸：跳过一次弃牌阶段 ——
						mgj_skip: {
							forced: true,
							sub: true,
							popup: false,
							trigger: { player: 'phaseDiscardBefore' },
							filter: function (event, player) {
								return player.hasMark('mgj_ce') && player.countMark('mgj_eff4_perm') > 0;
							},
							content: function () {
								trigger.cancel();
								player.removeMark('mgj_eff4_perm', 1);
								game.log(player, '消耗了「策」效果', '#g【跳过弃牌阶段】');
							},
						},

						// ============ 沥血 ============
						mgj_lixue: {
							forced: true,
							trigger: { player: ['damageEnd', 'recover'] },
							filter: function (event, player) {
								return findCeTarget() != null;
							},
							content: function () {
								var ce = findCeTarget();
								var x = ce ? ceX(ce) : 0;
								player.draw(x + 1, 'nodelay');
								if (ce) ce.draw(x + 1, 'nodelay');
								event.finish();
							},
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
