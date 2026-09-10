# 命名空间体检报告

> 由 `atlas/tools/check-collisions.mjs` 自动生成。
> `lib.skill` / `lib.character` 是**全局命名空间**：所有包合并进同一张表，
> 加载序在后者**静默覆盖**前者 —— 下面三类问题都不会抛错，只会表现成"技能莫名其妙不生效"。

## 摘要

| 检查项 | 数量 |
|---|---:|
| 技能定义总数 | 5223 |
| **技能名跨包重复** | 9 |
| 武将 id 跨包重复 | 0 |
| **真悬空技能引用** | 1 |
| 定义在 character/ 之外的被引用技能 | 2 |
| 未被任何武将显式引用的技能 | 1805 |

## 1. 技能名跨包重复（覆盖风险）

| 技能名 | 定义处 |
|---|---|
| `iwasawa_refenyin` | `diy`@`diy.js:10443`、`xianding`@`xianding.js:10110` |
| `iwasawa_fenyin` | `diy`@`diy.js:10509`、`xianding`@`xianding.js:10176` |
| `junkyuheng` | `diy`@`diy.js:17842`、`extra`@`extra.js:12859` |
| `junkdili` | `diy`@`diy.js:17890`、`extra`@`extra.js:12907` |
| `junkshengzhi` | `diy`@`diy.js:17962`、`extra`@`extra.js:12979` |
| `junkquandao` | `diy`@`diy.js:17999`、`extra`@`extra.js:13016` |
| `junkchigang` | `diy`@`diy.js:18022`、`extra`@`extra.js:13039` |
| `zhimeng` | `extra`@`extra.js:2818`、`xianjian`@`xianjian.js:3865` |
| `lingfeng` | `jiange`@`jiange.js:248`、`swd`@`swd.js:1473` |

## 2. 武将 id 跨包重复

无。

## 3. 技能引用解析情况

武将数组共引用 3421 个技能名，其中：

- 定义在本目录 `character/` 内：**3418**

- 定义在 `character/` 之外（引擎内建 / 模式专属 / 扩展）：**2**

- **全库无定义（真悬空）**：**1**


> 补充扫描已启用（`--app`），遍历 303 个 js/ts 文件确认外部定义。


### 3a. 定义在 character/ 之外（非缺陷）

这些技能由引擎或扩展注册，属正常跨来源引用。

| 技能名 | 定义处 | 引用武将 |
|---|---|---|
| `dualside` | `game/game.js` | `key_yusa`(diy)、`key_misa`(diy)、`ns_yanliang`(diy)、`ns_wenchou`(diy) |
| `qiwu` | `mode/boss.js` | `jg_pangtong`(jiange) |

### 3b. 真悬空引用（技能永不发动）

武将数组里列了技能名，但全库（含引擎/模式/扩展）都没有定义 —— 该技能**永远不会发动**，
且在选将界面会显示为一个空技能框。

| 缺失技能名 | 引用武将（包） |
|---|---|
| `zuijian` | `xk_fujianhan`(xiake:10) |

## 4. 未被显式引用的技能

共 1805 个。多数属正常：子技能（`xxx_yyy`）、
`inherit`/`group` 间接引用、`derivation` 衍生技、双将切换形态等。
仅当某个**应为主动技**的技能出现在此表时，才说明武将数组漏列（技能不会出现在技能框）。

<details><summary>展开清单</summary>

`chenliuwushi`、`DE_qinyong`、`DE_suilin`、`ruyijingubang_skill`、`ruyijingubang_effect`、`dcfaqi2`、`spduyi2`、`dcyingshen`、`suiliejingubang_skill`、`suiliejingubang_unequip`、`suiliejingubang_unequip2`、`suiliejingubang_wushuang`、`suiliejingubang_damage`、`dddxunxun`、`dddfusi_global`、`dddxiaoxing`、`dddlangzhi`、`dddfuyi`、`tomoyo_changshi`、`kiyu_xianyu`、`seira_yinyuan`、`mia_fengfa`、`kotarou_rewrite_damage`、`kotarou_rewrite_recover`、`kotarou_rewrite_sha`、`kotarou_rewrite_block`、`tenzen_yixing`、`tenzen_lingyu`、`tenzen_tianquan`、`kyouko_gongmian_use`、`kyouko_gongmian_discard`、`kotomi_qinji2`、`kotomi_chuanxiang2`、`misuzu_zhongyuan`、`chihaya_liewu2`、`chihaya_huairou`、`chihaya_youfeng_true`、`chihaya_youfeng_false`、`rumi_shuwu2`、`rumi_shuwu3`、`hiroto_huyu2`、`hiroto_huyu_gain`、`hiroto_zonglve`、`shizuku_sizhi2`、`shiroha_yuzhao_umi`、`shiroha_guying_temp`、`jojiro_shensu1`、`jojiro_shensu2`、`jojiro_shensu4`、`kotori_yumo_damage`、`kotori_yumo_gain`、`kotori_skill_wei`、`kotori_skill_shu`、`kotori_skill_wu`、`kotori_skill_qun`、`kotori_skill_key`、`kotori_skill_jin`、`kotori_qunxin_temp`、`kotori_yumo_wei`、`kotori_yumo_shu`、`kotori_yumo_wu`、`kotori_yumo_qun`、`kotori_yumo_key`、`kotori_yumo_jin`、`kotori_huazhan2`、`yuu_lveduo2`、`yuu_lveduo3`、`yuu_lveduo4`、`shiori_huijuan_discard`、`miki_hydrogladiator_skill`、`miki_binoculars`、`kud_qiaoshou_backupx`、`kud_qiaoshou_equip`、`kud_qiaoshou_end`、`kud_chongzhen`、`misuzu_zhongxing_haruko`、`kamome_suitcase`、`kamome_jieban_phase`、`nao_duyin2`、`nao_shouqing2`、`nao_shouqing3`、`shiorimiyuki_tingxian1`、`shiorimiyuki_tingxian2`、`kyoko_jingce`、`kyoko_shelie`、`kyoko_zhiheng`、`yuzuru_bujin`、`yuzuru_bujin2`、`yuzuru_kunfen`、`yuzuru_quji`、`yuzuru_wangsheng`、`ao_diegui`、`noda_xunxin2`、`hinata_qiulve_clear`、`riki_chongzhen`、`yuiko_fenglun2`、`doruji_feiqu_ai`、`akane_yifu2`、`akane_yifu3`、`sasami_baoqiu`、`sasami_gongqing`、`sasami_funan`、`sunohara_chengshuang_phase`、`shiina_retieji`、`inari_baiwei_shan`、`inari_baiwei_draw`、`saya_nodis`、`saya_judge`、`kanata_shuangche`、`haruka_kanata`、`tsumugi_huilang2`、`yui_lieyin0`、`yui_lieyin1`、`yui_yinhang`、`yoshino_fail`、`kengo_weishang_sha`、`kengo_weishang_shan`、`kengo_guidui2`、`iwasawa_refenyin`、`iwasawa_fenyin`、`yukine_magic`、`riki_xueshang`、`umi_shiroha`、`noname_retieji`、`noname_jiang`、`noname_duocai2`、`nsbizhao2`、`nsfuzhou_num`、`nsweiyuan2`、`nsweiyuan_use_backup`、`nsweiyuan_use`、`nsjuxian2`、`nsliegong`、`nsguolie2`、`nslongyue_ai`、`nsxianhai_round`、`nsshengyan2`、`nsshengyan3`、`nsdaizhanx`、`nsdaizhany`、`nsjiquan_mark`、`nsdiemou`、`nszhihuang`、`nszhihuang_damage`、`junktaoluan2`、`junktaoluan3`、`junktaoluan4`、`junktaoluan5`、`junktaoluan_backup`、`nsfengli_draw`、`nsfengli_clear`、`nsfengli2`、`nsfengli_use`、`ns_xiandao1`、`ns_xiandao2`、`ns_chuanshu2`、`ns_chuanshu3`、`nsfuhuo2`、`nscangxi2`、`liangce2`、`fuchou2`、`kangyin2`、`zhucheng2`、`zaiqix`、`diyzaiqi`、`diykuanggu`、`diyduanliang`、`diyduanliang1`、`diyduanliang2`、`luweiyan2`、`yaliang`、`xiongzi`、`honglian`、`zonghuo`、`shaoying`、`tiangong`、`tiangong2`、`xicai`、`diyjianxiong`、`ciqiu_dying`、`diyqiangxi`、`junkshengzhi`、`junkquandao`、`junkchigang`、`helasisy_lock`、`kk_lock`、`hlss_yueyin`、`hlss_yueyin2`、`hlss_xiangxing`、`hlss_fengqi`、`hlss_fengqi2`、`hlss_jifeng`、`hlss_jifeng2`、`hlss_gaiming`、`kk_yuanshen`、`kk_qidong`、`kk_aiwan`、`kk_miyou`、`xinjilve`、`wuling`、`youyi`、`mbwuqinxi`、`dccuixin`、`twgongxin2`、`shouli_backup`、`changandajian_equip5`、`changandajian_destroy`、`hina_shenshi`、`hina_shenshi_yingbian`、`hina_xingzhi`、`tspowei1`、`tspowei2`、`tspowei3`、`shenzhu`、`dangmo`、`shuishi`、`zuoxing`、`sghuishi`、`boss_juejing2`、`huoxin_control`、`huoxin2`、`shiki_omusubi`、`kagari_zongsi`、`caopi_xingdong`、`tianxing`、`olzhiti2`、`olduorui2`、`wuhun2`、`wuhun21`、`wuhun22`、`wuhun23`、`pro_wuhun`、`new_wuhun`、`pro_feiying`、`pro_guixin`、`new_guixin`、`pro_shenfen`、`ol_shenfen`、`ol_wuqian`、`pro_wumou`、`wumou`、`pro_qinyin`、`qinyin`、`pro_baonu`、`baonu`、`shenfen`、`pro_wuqian`、`wuqian`、`pro_renjie`、`pro_renjie1`、`pro_renjie2`、`renjie`、`renjie2`、`pro_baiyin`、`sbaiyin`、`pro_jilue`、`pro_guicai`、`jilue`、`jilue_guicai`、`jilue_fangzhu`、`jilue_wansha`、`jilue_zhiheng`、`jilue_jizhi`、`pro_wushen`、`wushen`、`wuhun`、`wuhun3`、`wuhun4`、`wuhun5`、`wuhun6`、`guixin`、`qixing`、`qixing2`、`pro_dawu`、`dawu`、`dawu2`、`dawu3`、`pro_kuangfeng`、`kuangfeng`、`kuangfeng2`、`pro_yeyan`、`yeyan`、`longhun`、`longhun1`、`longhun2`、`longhun3`、`longhun4`、`juejing`、`relonghun`、`pro_juejing`、`xinjuejing`、`pro_shelie`、`pro_gongxin`、`shelie`、`pro_nzry_longnu`、`nzry_longnu`、`pro_nzry_jieying`、`nzry_jieying`、`g_nzry_jieying`、`pro_nzry_junlve`、`nzry_junlve`、`nzry_cuike`、`pro_nzry_dinghuo`、`nzry_dinghuo`、`pro_drlt_duorui`、`pro_duorui_clear`、`drlt_duorui`、`duorui_clear`、`drlt_duorui1`、`pro_drlt_zhiti`、`pro_drlt_zhiti_sha`、`drlt_zhiti`、`g_drlt_zhiti`、`pro_drlt_poxi`、`drlt_poxi`、`drlt_poxi1`、`drlt_jieying_mark`、`drlt_jieying`、`pro_drlt_jieying_mark`、`pro_drlt_jieying`、`dclishi`、`_gifting`、`zc26_zhuge_skill`、`zc26_bagua_skill`、`zc26_lingling_skill`、`zc26_zhuge_card`、`zc26_bagua_card`、`zc26_lingling_card`、`xunjian_old`、`tongtian`、`meiying2`、`meiying3`、`xidie2`、`mingkong2`、`xiuhua_old`、`shahun2`、`yanjia_old`、`jizhan`、`qianjun`、`xuanning1`、`xuanning2`、`yangming2`、`jiehuo_old`、`jiehuo2`、`yuling1`、`yuling2`、`yuling3`、`yuling4`、`yuling5`、`yuling6`、`sqlongyin`、`sqlongnu`、`sqlonghuo`、`gwmaoxian_hengsaite_sha`、`gw_xianzumaijiu`、`gwmaoxian_old`、`gwminxiang_old`、`gwjingtian2`、`gwzhongmo`、`g_gw_yewu`、`gwliedi`、`gwqinwu2`、`huanshu2`、`huanshu3`、`jielue_old`、`jielue2`、`gwjushi2`、`junchi_old`、`hupeng2`、`hupeng3`、`hupeng4`、`hunmo2`、`hunmo3`、`kuanglie2`、`nuhou_old`、`gwzhanjiang2`、`gwzhanjiang3`、`gwchuanxin_old`、`gwchuanxin`、`xuezhou_hp`、`xuezhou_hp2`、`hunmo_old`、`hunmo_old2`、`buwendingyibian_ai1`、`buwendingyibian_ai2`、`buwendingyibian_lose`、`oldhuanjue`、`hsxiujian`、`hshuanling_old`、`hshuanling_old2`、`hstianqi_dalian`、`hstianqi_shali`、`zhaochao2`、`shouwang2`、`qingtian_old`、`qianfu2`、`lieyang2`、`mengye_old`、`mengye2`、`mengye3`

</details>
