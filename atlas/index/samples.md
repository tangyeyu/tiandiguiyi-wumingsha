# 范式样例推荐（按体量升序，跨包去重）

> 由 `atlas/tools/classify-skills.mjs` 自动生成。
> 选取原则：**行数最少、技能名干净、同一包最多 2 个** —— 目的是拿到每个范式最纯粹的最小实现。

### 触发技

声明 trigger，由引擎在对应事件点激活　—— 共 3644 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `riki_nvzhuang` | `diy.js:9040` | 7 |
| `diy` | `xiongzi` | `diy.js:17405` | 7 |
| `gujian` | `yuling5` | `gujian.js:2609` | 7 |
| `gujian` | `yuling6` | `gujian.js:2616` | 7 |
| `hearth` | `peiyu2` | `hearth.js:3727` | 7 |
| `hearth` | `mobao3` | `hearth.js:4442` | 7 |
| `mobile` | `tiansuan2_damage` | `mobile.js:9854` | 7 |
| `offline` | `fenyong` | `offline.js:8431` | 7 |
| `ow` | `shouge` | `ow.js:2330` | 7 |
| `standard` | `rende1` | `standard.js:950` | 7 |
| `swd` | `liaoyuan3` | `swd.js:5680` | 7 |
| `xianjian` | `leiyu2` | `xianjian.js:2463` | 7 |
| `xianjian` | `lingxue` | `xianjian.js:2548` | 7 |
| `yijiang` | `zuoding3` | `yijiang.js:8414` | 7 |

### 锁定技

强制发动，跳过询问　—— 共 1842 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `riki_nvzhuang` | `diy.js:9040` | 7 |
| `diy` | `xiongzi` | `diy.js:17405` | 7 |
| `xianjian` | `lingxue` | `xianjian.js:2548` | 7 |
| `collab` | `dcfaqi2` | `collab.js:3366` | 8 |
| `gujian` | `jiehuo2` | `gujian.js:2527` | 8 |
| `hearth` | `yushou_leiouke` | `hearth.js:3242` | 8 |
| `hearth` | `chuidiao` | `hearth.js:5542` | 8 |
| `jiange` | `chiying2` | `jiange.js:220` | 8 |
| `ow` | `shanxian2` | `ow.js:3394` | 8 |
| `refresh` | `xinjiefan2` | `refresh.js:6549` | 8 |
| `shiji` | `gebo` | `shiji.js:3490` | 8 |
| `sp` | `yongsi2` | `sp.js:22225` | 8 |
| `sp` | `weizhong` | `sp.js:22793` | 8 |
| `swd` | `huajin2` | `swd.js:2478` | 8 |

### 主动技

出牌阶段主动发动　—— 共 947 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `offline` | `zymoucheng` | `offline.js:5845` | 10 |
| `swd` | `shengshou` | `swd.js:5152` | 12 |
| `yxs` | `zhijie` | `yxs.js:803` | 12 |
| `extra` | `jilue_wansha` | `extra.js:9591` | 13 |
| `yingbian` | `pozhu` | `yingbian.js:3281` | 13 |
| `diy` | `liangce` | `diy.js:16586` | 14 |
| `diy` | `noda_xunxin` | `diy.js:8825` | 15 |
| `sp` | `spniluan` | `sp.js:11815` | 15 |
| `swd` | `zaowu` | `swd.js:1924` | 15 |
| `gujian` | `zuiji` | `gujian.js:1139` | 16 |
| `hearth` | `yushou_huofu` | `hearth.js:3225` | 17 |
| `hearth` | `aoshu` | `hearth.js:3344` | 18 |
| `sp` | `qiangwu` | `sp.js:20824` | 18 |
| `xianjian` | `guiyuan` | `xianjian.js:3423` | 18 |

### 限一次

每阶段发动次数上限　—— 共 828 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `hearth` | `yushou_leiouke` | `hearth.js:3242` | 8 |
| `sp2` | `nhguizhu` | `sp2.js:4359` | 9 |
| `offline` | `zymoucheng` | `offline.js:5845` | 10 |
| `shenhua` | `qiangxix` | `shenhua.js:5851` | 11 |
| `sp` | `xisheng` | `sp.js:18688` | 11 |
| `sp2` | `zhihu` | `sp2.js:6695` | 11 |
| `tw` | `twxiongjun` | `tw.js:2432` | 11 |
| `yxs` | `zhexian` | `yxs.js:2794` | 11 |
| `sp` | `neifa_use` | `sp.js:12689` | 12 |
| `yxs` | `zhijie` | `yxs.js:803` | 12 |
| `extra` | `jilue_wansha` | `extra.js:9591` | 13 |
| `diy` | `liangce` | `diy.js:16586` | 14 |
| `hearth` | `bingdong` | `hearth.js:5906` | 14 |
| `xianjian` | `fanling` | `xianjian.js:1365` | 14 |

### 限定技

全局一次，配 awakenSkill　—— 共 145 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `jiezhong` | `refresh.js:5685` | 14 |
| `mobile` | `friendfangqiu` | `mobile.js:3284` | 17 |
| `xinghuoliaoyuan` | `xinfu_songsang` | `xinghuoliaoyuan.js:225` | 17 |
| `sp2` | `decadexushen` | `sp2.js:6527` | 18 |
| `standard` | `zhongyi` | `standard.js:1087` | 19 |
| `mobile` | `spdaizui` | `mobile.js:7466` | 20 |
| `xianding` | `dccunsi` | `xianding.js:2414` | 21 |
| `xinghuoliaoyuan` | `xinfu_zengdao` | `xinghuoliaoyuan.js:806` | 21 |
| `offline` | `psqibu` | `offline.js:4537` | 22 |
| `shiji` | `zjjuxiang` | `shiji.js:225` | 22 |
| `sp2` | `recuorui` | `sp2.js:5487` | 22 |
| `xianding` | `dcruxian` | `xianding.js:3280` | 22 |
| `clan` | `clanbaozu` | `clan.js:811` | 23 |
| `yijiang` | `duanwan` | `yijiang.js:730` | 23 |

### 觉醒技

觉醒技标签，供检索与排除　—— 共 77 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `xsqianxin` | `refresh.js:3634` | 15 |
| `diy` | `godan_xiaoyuan` | `diy.js:6532` | 16 |
| `diy` | `tenzen_lingyu` | `diy.js:3821` | 17 |
| `sb` | `sbdujiang` | `sb.js:7906` | 17 |
| `yingbian` | `zhaotao` | `yingbian.js:3264` | 17 |
| `extra` | `sbaiyin` | `extra.js:9409` | 18 |
| `mobile` | `moucuan` | `mobile.js:8598` | 18 |
| `refresh` | `qianxin` | `refresh.js:13662` | 18 |
| `xianding` | `dcgusuan` | `xianding.js:8697` | 18 |
| `xianding` | `mengqing` | `xianding.js:10620` | 18 |
| `yingbian` | `dezhang` | `yingbian.js:706` | 18 |
| `extra` | `pro_baiyin` | `extra.js:9390` | 19 |
| `mobile` | `xinfu_longyuan` | `mobile.js:15787` | 19 |
| `shenhua` | `zaoxian` | `shenhua.js:3780` | 19 |

### 觉醒执行

退役自身并写入 awakenedSkills　—— 共 281 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `olzaoxian` | `refresh.js:7446` | 9 |
| `gujian` | `xunjian_old` | `gujian.js:580` | 14 |
| `refresh` | `jiezhong` | `refresh.js:5685` | 14 |
| `diy` | `godan_xiaoyuan` | `diy.js:6532` | 16 |
| `xianjian` | `shenwu` | `xianjian.js:106` | 16 |
| `diy` | `tenzen_lingyu` | `diy.js:3821` | 17 |
| `mobile` | `friendfangqiu` | `mobile.js:3284` | 17 |
| `sb` | `sbdujiang` | `sb.js:7906` | 17 |
| `xinghuoliaoyuan` | `xinfu_songsang` | `xinghuoliaoyuan.js:225` | 17 |
| `yingbian` | `zhaotao` | `yingbian.js:3264` | 17 |
| `extra` | `sbaiyin` | `extra.js:9409` | 18 |
| `mobile` | `moucuan` | `mobile.js:8598` | 18 |
| `sp2` | `decadexushen` | `sp2.js:6527` | 18 |
| `xianding` | `dcgusuan` | `xianding.js:8697` | 18 |

### 继承

复用另一技能的实现　—— 共 79 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `rexiansi` | `refresh.js:2511` | 6 |
| `offline` | `yjzhenlve` | `offline.js:5910` | 7 |
| `refresh` | `reweizhong` | `refresh.js:490` | 7 |
| `sp` | `luoyan_tianxiang` | `sp.js:18008` | 8 |
| `sp` | `luoyan_liuli` | `sp.js:18016` | 8 |
| `diy` | `noname_retieji` | `diy.js:11432` | 9 |
| `diy` | `noname_jiang` | `diy.js:11441` | 9 |
| `shenhua` | `ollianhuan5` | `shenhua.js:2956` | 9 |
| `shenhua` | `qiangxix` | `shenhua.js:5851` | 11 |
| `mobile` | `rw_tengjia3` | `mobile.js:15156` | 13 |
| `mobile` | `rw_bagua_skill` | `mobile.js:15042` | 16 |
| `yingbian` | `xinchoufa` | `yingbian.js:2907` | 17 |
| `extra` | `xinbaiyin` | `extra.js:1835` | 19 |
| `swd` | `shending` | `swd.js:9608` | 21 |

### 子技能

派生 xxx_yyy，自动 sub=true　—— 共 1099 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `zhenwei_three` | `sp.js:12992` | 15 |
| `refresh` | `olkanpo` | `refresh.js:1221` | 16 |
| `mobile` | `rejiuchi` | `mobile.js:11760` | 19 |
| `refresh` | `rezhijian` | `refresh.js:14004` | 19 |
| `ddd` | `dddfusi` | `ddd.js:1692` | 21 |
| `diy` | `nsshijun` | `diy.js:14674` | 21 |
| `sp2` | `chuaili` | `sp2.js:3093` | 22 |
| `hearth` | `oldmalymowang` | `hearth.js:6181` | 23 |
| `xianjian` | `tanhua` | `xianjian.js:992` | 23 |
| `extra` | `pro_wuhun` | `extra.js:8080` | 24 |
| `hearth` | `malymowang` | `hearth.js:6157` | 24 |
| `sp` | `sanku` | `sp.js:6252` | 24 |
| `swd` | `mufeng` | `swd.js:4465` | 24 |
| `offline` | `vtbyanli` | `offline.js:3150` | 25 |

### 转化技

声明"视为使用某牌"　—— 共 277 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `niluanx` | `sp.js:12863` | 7 |
| `swd` | `ningjian1` | `swd.js:6704` | 8 |
| `swd` | `ningjian2` | `swd.js:6712` | 8 |
| `offline` | `zymoucheng` | `offline.js:5845` | 10 |
| `offline` | `chixin1` | `offline.js:7879` | 11 |
| `sp` | `xisheng` | `sp.js:18688` | 11 |
| `shenhua` | `lianhuan3` | `shenhua.js:2988` | 12 |
| `xianding` | `lvli5` | `xianding.js:12305` | 12 |
| `yxs` | `zhijie` | `yxs.js:803` | 12 |
| `shenhua` | `ollianhuan3` | `shenhua.js:2965` | 13 |
| `yingbian` | `pozhu` | `yingbian.js:3281` | 13 |
| `diy` | `liangce` | `diy.js:16586` | 14 |
| `diy` | `noda_xunxin` | `diy.js:8825` | 15 |
| `standard` | `qixi` | `standard.js:1641` | 15 |

### 按钮选择

以按钮组代替选牌　—— 共 132 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `rexiansi2` | `refresh.js:2517` | 31 |
| `yingbian` | `smyyingshi` | `yingbian.js:1645` | 33 |
| `shenhua` | `jixi` | `shenhua.js:3799` | 42 |
| `extra` | `zuoxing` | `extra.js:7155` | 46 |
| `sp2` | `yujue` | `sp2.js:6615` | 46 |
| `shiji` | `rezuici` | `shiji.js:5308` | 47 |
| `yingbian` | `wanyi` | `yingbian.js:998` | 48 |
| `gwent` | `lanquan` | `gwent.js:3448` | 51 |
| `tw` | `twqingce` | `tw.js:5983` | 51 |
| `diy` | `nsdaizhanx` | `diy.js:12364` | 52 |
| `mobile` | `xinzhilve` | `mobile.js:16451` | 52 |
| `yijiang` | `paiyi` | `yijiang.js:10771` | 55 |
| `diy` | `ao_diegui` | `diy.js:8441` | 56 |
| `swd` | `jilve` | `swd.js:3650` | 56 |

### 不消耗牌

零实体牌发动　—— 共 108 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `oldcihuai2` | `sp.js:19875` | 12 |
| `xianding` | `lvli5` | `xianding.js:12305` | 12 |
| `sp` | `aocai_backup` | `sp.js:21920` | 14 |
| `diy` | `noda_xunxin` | `diy.js:8825` | 15 |
| `yingbian` | `recaiwang_equip` | `yingbian.js:1233` | 17 |
| `xianding` | `mansi_viewas` | `xianding.js:12522` | 19 |
| `yingbian` | `recaiwang_hand` | `yingbian.js:1212` | 21 |
| `extra` | `shouli_backup` | `extra.js:5580` | 22 |
| `mobile` | `xinzhilve_use` | `mobile.js:16656` | 22 |
| `offline` | `yjtuicheng` | `offline.js:6155` | 22 |
| `offline` | `psshouli_backup` | `offline.js:3559` | 23 |
| `refresh` | `decadechunlao` | `refresh.js:7655` | 23 |
| `xianjian` | `huxi` | `xianjian.js:2053` | 24 |
| `hearth` | `jianren` | `hearth.js:7805` | 27 |

### precontent 钩

转化技使用前的副作用钩子　—— 共 85 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `aocai_backup` | `sp.js:21920` | 14 |
| `sp` | `zhenyi_club` | `sp.js:23962` | 18 |
| `extra` | `shouli_backup` | `extra.js:5580` | 22 |
| `offline` | `yjtuicheng` | `offline.js:6155` | 22 |
| `tw` | `twyingji_wuxie` | `tw.js:10410` | 22 |
| `offline` | `psshouli_backup` | `offline.js:3559` | 23 |
| `refresh` | `decadechunlao` | `refresh.js:7655` | 23 |
| `xianjian` | `huxi` | `xianjian.js:2053` | 24 |
| `clan` | `clanxumin` | `clan.js:1276` | 29 |
| `refresh` | `rexiansi2` | `refresh.js:2517` | 31 |
| `diy` | `misuzu_nongyin` | `diy.js:7129` | 33 |
| `yingbian` | `xianwan` | `yingbian.js:1169` | 38 |
| `shiji` | `dbzhuifeng` | `shiji.js:2219` | 41 |
| `jsrg` | `jsrgzhangdeng` | `jsrg.js:878` | 44 |

### backup 派生

由 chooseButton 生成转化技能　—— 共 124 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `rexiansi2` | `refresh.js:2517` | 31 |
| `shenhua` | `jixi` | `shenhua.js:3799` | 42 |
| `extra` | `zuoxing` | `extra.js:7155` | 46 |
| `sp2` | `yujue` | `sp2.js:6615` | 46 |
| `shiji` | `rezuici` | `shiji.js:5308` | 47 |
| `yingbian` | `wanyi` | `yingbian.js:998` | 48 |
| `gwent` | `lanquan` | `gwent.js:3448` | 51 |
| `tw` | `twqingce` | `tw.js:5983` | 51 |
| `diy` | `nsdaizhanx` | `diy.js:12364` | 52 |
| `mobile` | `xinzhilve` | `mobile.js:16451` | 52 |
| `yijiang` | `paiyi` | `yijiang.js:10771` | 55 |
| `diy` | `ao_diegui` | `diy.js:8441` | 56 |
| `swd` | `jilve` | `swd.js:3650` | 56 |
| `mobile` | `scstaoluan` | `mobile.js:4669` | 57 |

### sourceSkill

标注 backup 归属的主技能（防递归/供日志）　—— 共 7 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `aocai_backup` | `sp.js:21920` | 14 |
| `extra` | `shouli_backup` | `extra.js:5580` | 22 |
| `offline` | `psshouli_backup` | `offline.js:3559` | 23 |
| `sp` | `olqifan_backup` | `sp.js:1271` | 25 |
| `sp2` | `dcdianlun` | `sp2.js:11616` | 90 |
| `xianding` | `dcchaozhen` | `xianding.js:3737` | 109 |
| `jsrg` | `jsrgwentian` | `jsrg.js:4411` | 221 |

### mod 钩子

改写引擎规则查询（不产生事件，纯查询期干预）　—— 共 441 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `yuiko_fenglun2` | `diy.js:9135` | 6 |
| `refresh` | `rexianzhen3` | `refresh.js:9618` | 6 |
| `shenhua` | `tianyi3` | `shenhua.js:6038` | 6 |
| `yijiang` | `xianzhen3` | `yijiang.js:6733` | 6 |
| `diy` | `yui_lieyin0` | `diy.js:10195` | 7 |
| `extra` | `pro_feiying` | `extra.js:8183` | 7 |
| `huicui` | `xibing2` | `huicui.js:9197` | 7 |
| `huicui` | `remumu2` | `huicui.js:9313` | 7 |
| `mobile` | `juliao` | `mobile.js:10606` | 7 |
| `mobile` | `rejiangchi3` | `mobile.js:11650` | 7 |
| `offline` | `spfuluan2` | `offline.js:7424` | 7 |
| `old` | `old_fuyin` | `old.js:882` | 7 |
| `ow` | `zhanlong2` | `ow.js:2489` | 7 |
| `refresh` | `rezongshi_paoxiao` | `refresh.js:7876` | 7 |

### global 技

给全场玩家挂载技能　—— 共 967 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `olzhiba` | `refresh.js:10010` | 6 |
| `shenhua` | `nzry_lijun` | `shenhua.js:2071` | 6 |
| `yijiang` | `zhaofu` | `yijiang.js:7880` | 6 |
| `yingbian` | `ruilve` | `yingbian.js:2639` | 6 |
| `hearth` | `yufa3` | `hearth.js:5140` | 7 |
| `refresh` | `xinhuangtian` | `refresh.js:4669` | 7 |
| `shenhua` | `zhiba` | `shenhua.js:3906` | 7 |
| `yijiang` | `zuoding3` | `yijiang.js:8414` | 7 |
| `shiji` | `gebo` | `shiji.js:3490` | 8 |
| `swd` | `funiao2` | `swd.js:7698` | 8 |
| `extra` | `lingce` | `extra.js:6665` | 9 |
| `sp2` | `nhguizhu` | `sp2.js:4359` | 9 |
| `xianding` | `lvli3` | `xianding.js:12275` | 9 |
| `diy` | `yuzuru_bujin` | `diy.js:7961` | 10 |

### addSkillLog

授予技能并记入技能获得日志　—— 共 72 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sb` | `sbdujiang` | `sb.js:7906` | 17 |
| `yingbian` | `zhaotao` | `yingbian.js:3264` | 17 |
| `diy` | `yuzuru_deyi` | `diy.js:8225` | 18 |
| `extra` | `pro_baiyin` | `extra.js:9390` | 19 |
| `xianding` | `dcmoucheng` | `xianding.js:5947` | 19 |
| `yijiang` | `zbaijiang` | `yijiang.js:13412` | 19 |
| `jsrg` | `jsrghuilie` | `jsrg.js:4121` | 20 |
| `offline` | `pksanchen` | `offline.js:3712` | 21 |
| `shiji` | `spsanchen` | `shiji.js:5572` | 21 |
| `xianding` | `dccunsi` | `xianding.js:2414` | 21 |
| `huicui` | `zhuangrong` | `huicui.js:8698` | 22 |
| `refresh` | `rejuyi` | `refresh.js:468` | 22 |
| `sp` | `olximo` | `sp.js:5367` | 24 |
| `diy` | `seira_yuanying` | `diy.js:2185` | 26 |

### unique/gainable

参与"获得技能"体系（可被夺取/复制）　—— 共 255 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `olzhiba` | `refresh.js:10010` | 6 |
| `shenhua` | `nzry_lijun` | `shenhua.js:2071` | 6 |
| `yijiang` | `zhaofu` | `yijiang.js:7880` | 6 |
| `yingbian` | `ruilve` | `yingbian.js:2639` | 6 |
| `refresh` | `xinhuangtian` | `refresh.js:4669` | 7 |
| `shenhua` | `zhiba` | `shenhua.js:3906` | 7 |
| `swd` | `pingshen` | `swd.js:2910` | 9 |
| `ow` | `mengji` | `ow.js:857` | 11 |
| `gujian` | `xunjian_old` | `gujian.js:580` | 14 |
| `mobile` | `dczhonggu` | `mobile.js:3728` | 14 |
| `diy` | `nscangxi` | `diy.js:14728` | 16 |
| `standard` | `jiuyuan` | `standard.js:1568` | 16 |
| `swd` | `xuying` | `swd.js:8879` | 16 |
| `xianjian` | `shenwu` | `xianjian.js:106` | 16 |

### direct 静默

发动时不弹技能名，由 AI/条件直接生效　—— 共 1258 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `nscangjian` | `diy.js:15347` | 10 |
| `hearth` | `yuanzheng` | `hearth.js:5281` | 10 |
| `yxs` | `taiji` | `yxs.js:524` | 10 |
| `diy` | `kotomi_qinji` | `diy.js:4279` | 11 |
| `mobile` | `dagongche_ban` | `mobile.js:919` | 12 |
| `ow` | `ziyu` | `ow.js:3268` | 12 |
| `sp` | `olxiaoxi` | `sp.js:1689` | 12 |
| `mobile` | `yingjian` | `mobile.js:16237` | 13 |
| `yxs` | `yxs_fanji2` | `yxs.js:115` | 13 |
| `ddd` | `dddweiqiu` | `ddd.js:3682` | 14 |
| `swd` | `rexue` | `swd.js:5138` | 14 |
| `yingbian` | `buchen` | `yingbian.js:1631` | 14 |
| `ow` | `mujing_old` | `ow.js:2423` | 15 |
| `refresh` | `rejigong` | `refresh.js:5850` | 15 |

### locked 沉默

发动时不播放技能动画/配音　—— 共 83 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `shenhua` | `bazhen` | `shenhua.js:5476` | 6 |
| `yijiang` | `zhaofu` | `yijiang.js:7880` | 6 |
| `diy` | `ns_xiandao` | `diy.js:13303` | 8 |
| `sp` | `yongsi` | `sp.js:22206` | 8 |
| `collab` | `dcjinjing` | `collab.js:2873` | 9 |
| `diy` | `miki_binoculars` | `diy.js:6863` | 9 |
| `sp` | `xionghuo` | `sp.js:23125` | 9 |
| `standard` | `wushuang` | `standard.js:2186` | 9 |
| `shenhua` | `huoshou` | `shenhua.js:4582` | 14 |
| `yijiang` | `enyuan` | `yijiang.js:12624` | 15 |
| `collab` | `suiliejingubang_damage` | `collab.js:4036` | 18 |
| `extra` | `olduorui2` | `extra.js:8041` | 23 |
| `gujian` | `yuling` | `gujian.js:2535` | 24 |
| `mobile` | `friendgongli` | `mobile.js:3307` | 24 |

### shaRelated

声明与【杀】相关（影响 AI 与牌堆查询）　—— 共 39 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `standard` | `wushuang` | `standard.js:2186` | 9 |
| `sp2` | `chuanyun` | `sp2.js:4162` | 13 |
| `shenhua` | `mengjin` | `shenhua.js:6163` | 16 |
| `sp` | `zniaoxiang` | `sp.js:20950` | 22 |
| `shenhua` | `lieren` | `shenhua.js:4710` | 24 |
| `diy` | `yui_jiang` | `diy.js:10135` | 27 |
| `mobile` | `relieren` | `mobile.js:9967` | 28 |
| `extra` | `pro_drlt_zhiti_sha` | `extra.js:12307` | 31 |
| `yijiang` | `xinpojun` | `yijiang.js:9186` | 31 |
| `jsrg` | `jsrgzhenqiao` | `jsrg.js:3836` | 32 |
| `sp` | `fengpo` | `sp.js:19338` | 34 |
| `diy` | `shiina_retieji` | `diy.js:9665` | 35 |
| `standard` | `tieji` | `standard.js:1354` | 37 |
| `refresh` | `repojun` | `refresh.js:9689` | 39 |

### 响应技

响应他人结算　—— 共 96 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `swd` | `ningjian1` | `swd.js:6704` | 8 |
| `swd` | `ningjian2` | `swd.js:6712` | 8 |
| `offline` | `chixin1` | `offline.js:7879` | 11 |
| `offline` | `chixin2` | `offline.js:7890` | 16 |
| `hearth` | `qiaodong` | `hearth.js:6999` | 17 |
| `yingbian` | `recaiwang_equip` | `yingbian.js:1233` | 17 |
| `diy` | `nsguanyong` | `diy.js:15772` | 18 |
| `diy` | `kengo_weishang_shan` | `diy.js:10365` | 19 |
| `mobile` | `xiaoxi_hansui` | `mobile.js:10883` | 20 |
| `ow` | `mujing` | `ow.js:2346` | 20 |
| `yingbian` | `recaiwang_hand` | `yingbian.js:1212` | 21 |
| `extra` | `longhun1` | `extra.js:10658` | 22 |
| `extra` | `longhun2` | `extra.js:10680` | 22 |
| `yxs` | `jimin` | `yxs.js:1417` | 23 |

### 多步状态机

含 step>=1，说明有多步流程　—— 共 2662 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `requji` | `refresh.js:403` | 11 |
| `yijiang` | `jieyue4` | `yijiang.js:6562` | 11 |
| `diy` | `godan_yuanyi` | `diy.js:6516` | 13 |
| `sp` | `oldianjun` | `sp.js:3804` | 13 |
| `zhuogui` | `nianrui` | `zhuogui.js:71` | 13 |
| `swd` | `mojian` | `swd.js:3994` | 14 |
| `yingbian` | `cheliji_sichengliangyu` | `yingbian.js:2017` | 14 |
| `offline` | `spzhaoxin` | `offline.js:7431` | 15 |
| `ow` | `xiyang` | `ow.js:605` | 15 |
| `ow` | `mujing_old` | `ow.js:2423` | 15 |
| `refresh` | `rejigong` | `refresh.js:5850` | 15 |
| `sp2` | `tuxing` | `sp2.js:6726` | 15 |
| `diy` | `haruko_zhuishi` | `diy.js:11034` | 16 |
| `gujian` | `fanshi` | `gujian.js:2009` | 16 |

### 取消事件

取消当前事件（如免伤）　—— 共 273 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `kamome_suitcase` | `diy.js:7187` | 9 |
| `swd` | `miles_xueyi` | `swd.js:8428` | 9 |
| `diy` | `nsjuxian2` | `diy.js:11937` | 10 |
| `swd` | `huanling2` | `swd.js:9411` | 10 |
| `mobile` | `xinfu_pdgyingshi2` | `mobile.js:15637` | 11 |
| `refresh` | `wulie2` | `refresh.js:8312` | 11 |
| `yxs` | `wluoyan` | `yxs.js:1253` | 11 |
| `gujian` | `yuling1` | `gujian.js:2559` | 12 |
| `sp` | `olzhennan2` | `sp.js:10856` | 12 |
| `xianding` | `hmmanyi` | `xianding.js:12496` | 12 |
| `extra` | `boss_juejing` | `extra.js:7330` | 13 |
| `shenhua` | `huoshou1` | `shenhua.js:4596` | 13 |
| `shenhua` | `juxiang1` | `shenhua.js:4685` | 13 |
| `ddd` | `dddweiqiu` | `ddd.js:3682` | 14 |

### 改写伤害

直接调整伤害值　—— 共 45 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `hanyong` | `sp.js:19169` | 10 |
| `sp` | `nuzhan2` | `sp.js:18549` | 15 |
| `mobile` | `xinzhanyi_basic1` | `mobile.js:14630` | 16 |
| `standard` | `jiuyuan` | `standard.js:1568` | 16 |
| `xianding` | `pilitoushiche` | `xianding.js:7307` | 17 |
| `collab` | `suiliejingubang_damage` | `collab.js:4036` | 18 |
| `shiji` | `spcunsi2` | `shiji.js:5118` | 19 |
| `xinghuoliaoyuan` | `kannan_eff` | `xinghuoliaoyuan.js:1428` | 27 |
| `shiji` | `yiyong` | `shiji.js:1311` | 29 |
| `sb` | `sbjiuyuan` | `sb.js:7588` | 31 |
| `tw` | `jintao` | `tw.js:13171` | 37 |
| `collab` | `dcwudao` | `collab.js:2394` | 42 |
| `offline` | `psoldshiyin` | `offline.js:4140` | 44 |
| `sp2` | `dcmffengshi` | `sp2.js:10555` | 44 |

### 改判定

干预判定结果　—— 共 9 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `hanzhan` | `refresh.js:8106` | 38 |
| `shenhua` | `xinhongyan` | `shenhua.js:6894` | 55 |
| `sp` | `zhenyi_spade` | `sp.js:23905` | 57 |
| `diy` | `nsqingde` | `diy.js:11526` | 75 |
| `tw` | `twqinghan` | `tw.js:14735` | 93 |
| `shiji` | `spyajun` | `shiji.js:904` | 101 |
| `shiji` | `mingfa` | `shiji.js:3002` | 115 |
| `diy` | `misuzu_zhongyuan` | `diy.js:4833` | 141 |
| `ddd` | `dddfenye` | `ddd.js:2561` | 430 |

### 标记

使用标记显示与计数　—— 共 692 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `rumi_shuwu3` | `diy.js:5328` | 8 |
| `diy` | `kotori_qunxin_temp` | `diy.js:6226` | 8 |
| `hearth` | `kuangluan3` | `hearth.js:4315` | 8 |
| `mobile` | `fengji2` | `mobile.js:13045` | 8 |
| `mobile` | `reqianxin3` | `mobile.js:14163` | 8 |
| `refresh` | `rejianchu2` | `refresh.js:8272` | 8 |
| `shenhua` | `nzry_lijun2` | `shenhua.js:2077` | 8 |
| `sp` | `wangzun2` | `sp.js:20480` | 8 |
| `yijiang` | `sidi3` | `yijiang.js:7294` | 8 |
| `sp` | `olwuniang2` | `sp.js:10770` | 9 |
| `standard` | `rewangzun2` | `standard.js:186` | 9 |
| `refresh` | `redanxin` | `refresh.js:4206` | 10 |
| `shenhua` | `fangquan3` | `shenhua.js:3470` | 10 |
| `shiji` | `qinzheng_count` | `shiji.js:5734` | 10 |

### storage 状态

以 storage 存持久状态　—— 共 1227 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `gujian` | `yuling5` | `gujian.js:2609` | 7 |
| `gujian` | `yuling6` | `gujian.js:2616` | 7 |
| `hearth` | `mobao3` | `hearth.js:4442` | 7 |
| `hearth` | `yufa3` | `hearth.js:5140` | 7 |
| `standard` | `rende1` | `standard.js:950` | 7 |
| `swd` | `liaoyuan3` | `swd.js:5680` | 7 |
| `xianjian` | `leiyu2` | `xianjian.js:2463` | 7 |
| `xianjian` | `zhuyue2` | `xianjian.js:3699` | 7 |
| `collab` | `dcfaqi2` | `collab.js:3366` | 8 |
| `diy` | `nsfengli2` | `diy.js:13132` | 8 |
| `mobile` | `tiansuan2` | `mobile.js:9777` | 8 |
| `mobile` | `fengji2` | `mobile.js:13045` | 8 |
| `refresh` | `rerende1` | `refresh.js:12519` | 8 |
| `sp` | `luoyan_tianxiang` | `sp.js:18008` | 8 |

### 读原始触发

在 content 里回溯触发源事件　—— 共 2049 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `diy` | `xiongzi` | `diy.js:17405` | 7 |
| `mobile` | `tiansuan2_damage` | `mobile.js:9854` | 7 |
| `offline` | `yjzhenlve` | `offline.js:5910` | 7 |
| `diy` | `asara_yingwei` | `diy.js:4406` | 8 |
| `hearth` | `yushou_leiouke` | `hearth.js:3242` | 8 |
| `swd` | `huajin2` | `swd.js:2478` | 8 |
| `swd` | `mailun31` | `swd.js:9237` | 8 |
| `xianjian` | `qianfang2` | `xianjian.js:3566` | 8 |
| `yxs` | `heqin2` | `yxs.js:1311` | 8 |
| `yxs` | `sanbanfu2` | `yxs.js:1099` | 9 |
| `extra` | `hina_shenshi_yingbian` | `extra.js:6346` | 10 |
| `gujian` | `jianwu` | `gujian.js:1680` | 10 |
| `gujian` | `xiuhua_old` | `gujian.js:2090` | 10 |
| `hearth` | `hsxiujian` | `hearth.js:656` | 10 |

### 用 result

读取上一步选择结果　—— 共 2119 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `zhuogui` | `nianrui` | `zhuogui.js:71` | 13 |
| `sp` | `aocai_backup` | `sp.js:21920` | 14 |
| `ow` | `mujing_old` | `ow.js:2423` | 15 |
| `refresh` | `rejigong` | `refresh.js:5850` | 15 |
| `mobile` | `rw_bagua_skill` | `mobile.js:15042` | 16 |
| `offline` | `zhenjue` | `offline.js:6726` | 16 |
| `diy` | `jojiro_shunying` | `diy.js:5999` | 17 |
| `diy` | `noda_xunxin2` | `diy.js:8840` | 17 |
| `jsrg` | `jsrgfeiyang` | `jsrg.js:2455` | 17 |
| `offline` | `vtbyuanli` | `offline.js:3208` | 17 |
| `yingbian` | `xinchoufa` | `yingbian.js:2907` | 17 |
| `sp2` | `nhguanyue` | `sp2.js:4401` | 18 |
| `sp2` | `langmie_damage` | `sp2.js:5468` | 18 |
| `swd` | `pingshen3` | `swd.js:2968` | 18 |

### 用 cards

处理事件牌集　—— 共 2012 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `rexianzhen3` | `refresh.js:9618` | 6 |
| `shenhua` | `tianyi3` | `shenhua.js:6038` | 6 |
| `yijiang` | `xianzhen3` | `yijiang.js:6733` | 6 |
| `diy` | `yui_lieyin1` | `diy.js:10202` | 7 |
| `diy` | `moshou` | `diy.js:17628` | 7 |
| `huicui` | `dcqizi` | `huicui.js:4186` | 7 |
| `huicui` | `remumu2` | `huicui.js:9313` | 7 |
| `mobile` | `rejiangchi3` | `mobile.js:11650` | 7 |
| `offline` | `spfuluan2` | `offline.js:7424` | 7 |
| `old` | `old_fuyin` | `old.js:882` | 7 |
| `ow` | `zhanlong2` | `ow.js:2489` | 7 |
| `refresh` | `rezongshi_paoxiao` | `refresh.js:7876` | 7 |
| `shenhua` | `lianhuan4` | `shenhua.js:3000` | 7 |
| `sp` | `zhuixi` | `sp.js:11432` | 7 |

### AI 权重

声明 AI 发动优先度　—— 共 1027 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `swd` | `zaowu` | `swd.js:1924` | 15 |
| `hearth` | `yushou_huofu` | `hearth.js:3225` | 17 |
| `swd` | `lingwu` | `swd.js:6325` | 17 |
| `yingbian` | `recaiwang_equip` | `yingbian.js:1233` | 17 |
| `hearth` | `aoshu` | `hearth.js:3344` | 18 |
| `sp` | `qiangwu` | `sp.js:20824` | 18 |
| `xianjian` | `guiyuan` | `xianjian.js:3423` | 18 |
| `diy` | `yiesheng` | `diy.js:16368` | 19 |
| `mobile` | `scsniqu` | `mobile.js:5183` | 19 |
| `refresh` | `shizhan` | `refresh.js:2626` | 19 |
| `shenhua` | `duanliang1` | `shenhua.js:4872` | 19 |
| `sp2` | `nhxianshou` | `sp2.js:4368` | 19 |
| `xianding` | `mansi_viewas` | `xianding.js:12522` | 19 |
| `yxs` | `fengyi` | `yxs.js:1968` | 19 |

### check 函数

AI 是否发动的判定　—— 共 1106 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `niluanx` | `sp.js:12863` | 7 |
| `swd` | `ningjian1` | `swd.js:6704` | 8 |
| `swd` | `ningjian2` | `swd.js:6712` | 8 |
| `diy` | `nsshuangxiong` | `diy.js:15763` | 9 |
| `jiange` | `sfanshi` | `jiange.js:16` | 10 |
| `offline` | `zymoucheng` | `offline.js:5845` | 10 |
| `refresh` | `olluanji` | `refresh.js:9909` | 10 |
| `offline` | `chixin1` | `offline.js:7879` | 11 |
| `gujian` | `yuling1` | `gujian.js:2559` | 12 |
| `refresh` | `shebian` | `refresh.js:9534` | 12 |
| `shenhua` | `lianhuan3` | `shenhua.js:2988` | 12 |
| `yxs` | `zhijie` | `yxs.js:803` | 12 |
| `hearth` | `qingtian` | `hearth.js:2031` | 13 |
| `mobile` | `ly_piliche` | `mobile.js:16438` | 13 |

### charlotte

隐藏技能，不进技能表　—— 共 825 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `refresh` | `rexianzhen3` | `refresh.js:9618` | 6 |
| `shenhua` | `tianyi3` | `shenhua.js:6038` | 6 |
| `yijiang` | `xianzhen3` | `yijiang.js:6733` | 6 |
| `mobile` | `tiansuan2_damage` | `mobile.js:9854` | 7 |
| `collab` | `dcfaqi2` | `collab.js:3366` | 8 |
| `mobile` | `tiansuan2` | `mobile.js:9777` | 8 |
| `refresh` | `new_repaoxiao2` | `refresh.js:11707` | 8 |
| `shenhua` | `dcwanglie2` | `shenhua.js:293` | 8 |
| `diy` | `junktaoluan3` | `diy.js:12904` | 9 |
| `sp` | `olwuniang2` | `sp.js:10770` | 9 |
| `sp` | `tuifeng3` | `sp.js:16717` | 9 |
| `yijiang` | `xintaoluan6` | `yijiang.js:2635` | 9 |
| `yingbian` | `g_hidden_ai` | `yingbian.js:3538` | 9 |
| `diy` | `kotarou_rewrite_block` | `diy.js:3723` | 10 |

### 派生声明

声明衍生技能，供展示与 AI　—— 共 211 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `sp` | `new_luoyan` | `sp.js:13475` | 10 |
| `diy` | `sasami_miaobian` | `diy.js:9327` | 14 |
| `diy` | `iwasawa_mysong` | `diy.js:10429` | 14 |
| `huicui` | `dcyouqi` | `huicui.js:2577` | 17 |
| `sb` | `sbdujiang` | `sb.js:7906` | 17 |
| `xinghuoliaoyuan` | `xinfu_songsang` | `xinghuoliaoyuan.js:225` | 17 |
| `yingbian` | `zhaotao` | `yingbian.js:3264` | 17 |
| `extra` | `sbaiyin` | `extra.js:9409` | 18 |
| `mobile` | `moucuan` | `mobile.js:8598` | 18 |
| `refresh` | `qianxin` | `refresh.js:13662` | 18 |
| `sp2` | `decadexushen` | `sp2.js:6527` | 18 |
| `xianding` | `dcgusuan` | `xianding.js:8697` | 18 |
| `xianding` | `mengqing` | `xianding.js:10620` | 18 |
| `xianjian` | `fenshi` | `xianjian.js:1744` | 18 |

### 动态占位

含模板串，属运行期生成　—— 共 70 处。

| 包 | 技能 | 位置 | 行数 |
|---|---|---|---:|
| `mobile` | `friendgongli` | `mobile.js:3307` | 24 |
| `mobile` | `dagongche_defense_skill` | `mobile.js:893` | 26 |
| `sp2` | `olsbqiwu` | `sp2.js:375` | 39 |
| `huicui` | `dcmoshou` | `huicui.js:1523` | 47 |
| `sb` | `sbqiaomeng` | `sb.js:613` | 47 |
| `sp2` | `dcjiwei` | `sp2.js:11706` | 55 |
| `extra` | `xinlianpo` | `extra.js:1854` | 59 |
| `tw` | `twjunsi` | `tw.js:15938` | 59 |
| `tw` | `twmiewei` | `tw.js:15487` | 60 |
| `sb` | `sbjinjiu` | `sb.js:1038` | 65 |
| `extra` | `dclinjie` | `extra.js:13205` | 68 |
| `xianding` | `dctongdao` | `xianding.js:857` | 68 |
| `xianding` | `dcyanzuo` | `xianding.js:103` | 76 |
| `offline` | `sxrmsigu` | `offline.js:429` | 79 |
