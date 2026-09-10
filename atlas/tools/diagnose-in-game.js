/* ============================================================
 * diagnose-in-game.js —— 在游戏里一键诊断「天地归一」扩展
 *
 * 用法：
 *   1. 打开游戏（进到主界面即可，不必开局）
 *   2. 按 Ctrl + Shift + I 打开开发者工具 → 切到「Console / 控制台」
 *   3. 把本文件全部内容粘贴进去，回车
 *   4. 把输出整段复制回来
 *
 * 只读，不修改任何游戏状态。
 * ============================================================ */
(function () {
	const L = [];
	const w = (s) => L.push(s);
	const ok = (b) => (b ? '✅' : '❌');
	const j = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };

	w('===== 天地归一 诊断 =====');
	w('');

	// 0. 基本环境
	w('【0】环境');
	w('  ' + ok(!!window.game) + ' window.game 存在');
	w('  ' + ok(!!window.lib) + ' window.lib 存在');
	w('  版本 = ' + j((window.lib && lib.config && lib.config.version) || '?'));
	w('');

	// 1. 扩展是否被引擎加载
	w('【1】扩展加载状态');
	const menuKey = 'extension_天地归一';
	w('  ' + ok(!!(lib.extensionMenu && lib.extensionMenu[menuKey])) + ' lib.extensionMenu["' + menuKey + '"] 存在（扩展被扫描到）');
	const extOn = lib.config.extensions && lib.config.extensions.contains ? lib.config.extensions.contains('天地归一') : (lib.config.extensions || []).indexOf('天地归一') >= 0;
	w('  ' + ok(extOn) + ' lib.config.extensions 含「天地归一」 → ' + j(lib.config.extensions));
	w('');

	// 2. 角色包是否被导入（precontent 是否跑过）
	w('【2】角色包导入（precontent 是否执行）');
	const imported = Object.keys(lib.imported.character || {});
	w('  ' + ok(imported.indexOf('tiandiguiyi') >= 0) + ' lib.imported.character 的键 = ' + j(imported));
	const pkg = (lib.imported.character || {}).tiandiguiyi;
	if (pkg) {
		w('     包内 character 键 = ' + j(Object.keys(pkg.character || {})));
		w('     包内 skill 键数 = ' + Object.keys(pkg.skill || {}).length);
		w('     包内 translate 键数 = ' + Object.keys(pkg.translate || {}).length);
	}
	w('');

	// 3. 展平结果
	w('【3】展平结果（选将界面读这里）');
	w('  ' + ok(!!lib.character.mouguojia_soul) + ' lib.character.mouguojia_soul = ' + j(lib.character.mouguojia_soul));
	w('  ' + ok(!!lib.translate.mouguojia_soul) + ' lib.translate.mouguojia_soul = ' + j(lib.translate.mouguojia_soul));
	w('  ' + ok(!!lib.translate.tiandiguiyi_character_config) + ' lib.translate.tiandiguiyi_character_config = ' + j(lib.translate.tiandiguiyi_character_config));
	w('  ' + ok(!!lib.characterPack.tiandiguiyi) + ' lib.characterPack.tiandiguiyi 存在');
	w('');

	// 4. 技能注册
	w('【4】技能注册（lib.skill）');
	const want = ['mgj_dingce', 'mgj_zhuce', 'mgj_lixue', 'mgj_nohurt', 'mgj_ce_remove', 'mgj_eff1', 'mgj_extra_phase', 'mgj_boost', 'mgj_skip', 'mgj_ce', 'mgj_eff2', 'mgj_eff3_perm', 'mgj_eff4_perm'];
	want.forEach(function (s) {
		const info = lib.skill[s];
		w('  ' + ok(!!info) + ' ' + s.padEnd(16) + ' 存在=' + !!info + '  trigger=' + j(info && info.trigger) + '  content类型=' + (info && typeof info.content));
	});
	w('  skilllist 含 mgj_dingce = ' + ok(lib.skilllist && lib.skilllist.contains && lib.skilllist.contains('mgj_dingce')));
	w('');

	// 5. ★ 触发闸门（本次最可疑的一环）
	w('【5】★ 触发闸门 lib.hookmap（game.js:32324 会在闸门为假时直接 return）');
	w('  ' + ok(!!lib.hookmap.gameStart) + ' lib.hookmap["gameStart"]      = ' + j(lib.hookmap.gameStart) + '   ← 若为 false/undefined，gamestart 时点会被整个跳过');
	w('  ' + ok(!!lib.hookmap.enterGame) + ' lib.hookmap["enterGame"]      = ' + j(lib.hookmap.enterGame));
	w('  ' + ok(!!lib.hookmap.phaseBegin) + ' lib.hookmap["phaseBegin"]     = ' + j(lib.hookmap.phaseBegin));
	w('  ' + ok(!!lib.hookmap.damageBegin) + ' lib.hookmap["damageBegin"]   = ' + j(lib.hookmap.damageBegin));
	w('  ' + ok(!!lib.hookmap.phaseDiscardBefore) + ' lib.hookmap["phaseDiscardBefore"] = ' + j(lib.hookmap.phaseDiscardBefore));
	w('  globaltrigger["gameStart"] = ' + j(lib.hook && lib.hook.globaltrigger && lib.hook.globaltrigger.gameStart));
	w('');

	// 6. 玩家侧：技能是否真的挂上了
	w('【6】玩家侧技能挂载（开局后才有意义）');
	if (!game.players || !game.players.length) {
		w('  （尚未开局，跳过。若要查这一项，请开局后再跑一次）');
	} else {
		game.players.forEach(function (p) {
			const has = p.hasSkill && p.hasSkill('mgj_dingce');
			if (has || (p.name && String(p.name).indexOf('mouguojia') >= 0)) {
				w('  玩家 ' + (p.name || '?') + ' playerid=' + p.playerid);
				w('    hasSkill(mgj_dingce) = ' + ok(has));
				w('    skills 里的 mgj_*   = ' + j((p.skills || []).filter(function (s) { return s.indexOf('mgj_') === 0; })));
				w('    storage.mgj_ce_bound = ' + j(p.storage && p.storage.mgj_ce_bound));
				w('    hasMark(mgj_ce)      = ' + (p.hasMark ? p.hasMark('mgj_ce') : '?'));
			}
		});
		const marked = game.players.filter(function (p) { return p.hasMark && p.hasMark('mgj_ce'); });
		w('  全场持有「策」标记者 = ' + j(marked.map(function (p) { return p.name; })));
	}
	w('');

	// 7. 报错收集提示
	w('【7】若上面某项为 ❌，请把【Console 面板里所有红色的报错】一并复制回来');
	w('     特别是形如「游戏出错：xxx」或 Uncaught SyntaxError / TypeError 的行');

	const text = L.join('\n');
	console.log(text);
	try { copy(text); console.log('\n（以上内容已复制到剪贴板）'); } catch (e) {}
	return text;
})();
