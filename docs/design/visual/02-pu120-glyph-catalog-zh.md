# V-02｜pu-120 字形、视觉域与激活目录

状态：完整视觉基线 v0.2（待用户与社群审阅）
机器真源：`data/language/pu-120-glyph-catalog.v0.2.json`
范围：严格 `pu-120`，UCSUR `U+F1900–U+F1977`

## 1. 范围修正

V-01 的 14 个词只是单字施法编译器的首批原型，不是全部 toki pona 基础词。完整首发范围为 120 个 canonical `wordId`：

- 120 个词全部可以发现、点亮、冥想、练习和参与组合；
- 120 个词全部具有透明底的 8 帧整字激活动画；
- 只有 `telo/seli/lete/kiwen/ko/kon` 六个白名单词可以单字产生安全物理变化；
- 其余 114 个单字当前只产生结构、感知、形态、轨迹或语义回响；
- `ali` 是 `ale` 的别写，不增加第 121 个发现槽；
- `namako/kin/oko` 与其他后 `pu` 字形不计入本轮 120，未来作为扩展内容单独审阅。

## 2. 四条独立状态轴

```text
discovery_state        unknown → discovered
visual_activation      dormant → activating → active
learning_state         discovered → grounded → produced → stabilized
solo_cast_policy       CAST_SAFE | CONTEXT_REQUIRED | DISABLED
```

字形点亮不等于语言掌握，也不等于获得单字物理魔法。玩家可以发现并激活一个字，但仍需在不同情境中练习，才能把它稳定用于自由组合。

## 3. 十个视觉域

十个域只负责颜色与视觉纹理分组，不是 toki pona 的权威语义分类，也不是词性或施法效果答案。每个词在数据中另有 `semanticFacets`、`availableRoles` 和至少两个 `soloCueVariants`；界面必须把单字回响标为游戏原型提示，不能把一种提示当作该词的完整定义。

| 域 | 数量 | 通用激活色 | 单字默认表现 |
|---|---:|---|---|
| `D_SYNTAX_BINDER` 语法绑定 | 15 | `#9AA3AA` | 表达槽位与结构回响 |
| `D_QUANTITY_LOGIC` 数量逻辑 | 12 | `#C6AE58` | 非碰撞逻辑环与数量节拍 |
| `D_MATTER_ENV` 物质环境 | 6 | `#8FAE72` | 材料特征回响；白名单词使用专属元素色 |
| `D_LIFE_ENTITY` 生命实体 | 16 | `#61B77A` | 非实体生命轮廓，不创造生命 |
| `D_CRAFT_OBJECT` 器物工艺 | 11 | `#C18B54` | 非实体蓝图，不生成成品或财富 |
| `D_ENERGY_FIELD` 能量场 | 7 | `#B27CC8` | 低能场共鸣，不生成无限能量 |
| `D_PROPERTY_FORM` 性质形态 | 17 | `#71A7C5` | 非碰撞形态投影 |
| `D_ACTION_PROCESS` 动作过程 | 13 | `#D08A45` | 轨迹预演，不自动作用于目标 |
| `D_SPACE_TIME` 时空关系 | 11 | `#718BCE` | 坐标与关系网格，不传送或停时 |
| `D_PERCEPTION_SOCIAL` 感知社会 | 12 | `#C47D9A` | 感知波纹，不读心或控制生物 |

十类颜色是默认视觉域色。V-01 的 14 个词继续使用 `P_LIQUID/P_HEAT/P_COLD/P_HARD/P_MOLDABLE/P_GAS/F_*/O_LENGTH` 专属覆盖；组合时操作词仍可继承实际受作用对象的颜色。颜色只帮助玩家导航与记忆，不得替代多情境练习。

## 4. 课程阶段

| 阶段 | 新字 | 累计 | 课程意图 |
|---|---:|---:|---|
| P0 | 12 | 12 | 序章材料、方向、观察和长度 |
| P1 | 18 | 30 | 主体、句法骨架与生存意图 |
| P2 | 24 | 54 | 关系、时空和语言结构 |
| P3 | 30 | 84 | 材料、控制、颜色、形态和度量 |
| P4 | 24 | 108 | 生态、生产、交易和文化 |
| P5 | 12 | 120 | 社会、身份、语用和元语言 |

`o` 在序章任务中可以作为 `early_preview_token` 提前使用，但正式课程阶段仍是 P1；这避免把“序章 12 字”悄悄变成 13 个正式发现字。

## 5. 视觉与运行时合同

- 每字 `32×32 px`，8 帧，统一整字亮度码 `32/48/72/96/128/164/208/255`；
- 120 字共 960 个动画格，按 canonical 词序与帧序打包进两张 `1024×1024` 页面；
- 每个字另外保存透明 APNG、8 帧横条、角色纹理遮罩和内切削边遮罩；
- 石、木、泥土和金属只在运行时提供槽影、切削、遮挡与反射；
- 彩色 GIF 与总览图只用于审阅，运行时真源仍是灰度亮度 atlas 加独立 palette；
- 120 个 Alpha 遮罩必须唯一，帧间逐像素相同，背景外像素完全透明。

## 6. 安全边界

单字禁止：创造生命、控制生物、直接攻击、自动治疗、传送、停时、制造财富或成品、读心以及生成无限能量。所有实际组合仍必须编译为 `CastPlan`，由质量、热量、速度、距离、持续时间、环境与能量来源结算。

## 7. 审阅状态

当前已经完成的是：120 词清单、码位、魔法域、课程阶段、颜色端点、透明 8 帧动画和分页图集。仍待审阅的是：

- 十个域的语义边界和颜色是否容易混淆；
- 每个非物理单字的回响是否提供了合适的学习反馈；
- 106 个新增词的首次发现位置与 grounding 任务；
- 颜色在色觉模拟和不同背景材质上的可读性；
- 最终激活时长与声音节拍。

## 8. 来源

- 字形码位：[Sitelen Pona UCSUR technical document](https://www.kreativekorp.com/ucsur/charts/sitelen.html)
- 单字施法原型：`data/spells/single-word-spells.v0.1.yaml`
- 学习状态与 120 字预算：`data/language/glyph-progression.v0.1.yaml`
- 字体：Sitelen Seli Kiwen Mono Juniko，SIL Open Font License 1.1；字体源保留在私有素材仓库。
