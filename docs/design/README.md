# 道本语魔法 RPG：八份开发文档总索引

状态：结构基线 v0.8<br>
更新：2026-08-06

## 当前方向

本项目是一款手工设计地图、连续存档、无单局时限的竖版 2D 像素动作 RPG。玩家以道本语表达构筑和施放魔法，在探索、战斗、环境改造、人物沟通与冥想练习中学习语言。

> 2026-08-21 起正在进行世界观与产品边界复审。最新访谈决定、未决项及与本基线的潜在冲突记录于[《世界观与产品边界决策日志》](world/00-worldbuilding-decision-log-zh.md)。在访谈结论获批并迁移到正式规格前，本页旧基线不作静默覆盖。

Q1–Q178 访谈已于 2026-08-28 收口；内部冲突、首章迁移阻断和实施顺序见[《世界观与森林第一章一致性审计》](world/02-worldbuilding-consistency-audit-zh.md)。正式迁移完成前，本文其余旧基线仍不得静默覆盖新决定。

世界结构与系统关系中的规范术语以仓库根目录的 [`CONTEXT.md`](../../CONTEXT.md) 为准，避免继续混用“大地区”“地点场景”和“地图”。

服务器到期前的代码、计划、素材边界、已知缺口与恢复步骤见[《2026-08-22 开发快照交接》](../handoffs/2026-08-22-server-expiry-snapshot-zh.md)。

明确排除：roguelike 清档循环、程序生成主地图、限时轮次、连续打卡惩罚、唯一译文判定、把答题正确直接换算成攻击伤害。

此前的《中文游戏设计研究》仍是证据与风险基线；本目录记录当前 RPG 方向的可执行规格。发生冲突时，以本目录中状态为“已批准”的较新决策为准。

## 八份文档

### 玩法侧

| 编号 | 文档 | 解决的问题 | 状态 |
|---|---|---|---|
| G-01 | [探索与任务](gameplay/01-exploration-and-quests-zh.md) | 玩家去哪里、做什么、如何形成探索—表达—反馈—成长循环 | 初稿 |
| G-02 | [咒语构筑：单词层数据库](gameplay/02-spell-construction-zh.md) | 词、短语、句法、指代与法器如何组成可执行魔法 | 单词层初稿·逐词审阅中 |
| G-03 | [实际运用：软生存与动物经济](gameplay/03-survival-and-wildlife-economy-zh.md) | 饱食、口渴、狩猎、加工、售卖怎样与战斗、生态和学习边界协同 | 系统规格 v0.1 |
| G-04 | [反馈与成长](gameplay/06-feedback-and-growth-zh.md) | 冥想、间隔复习、能力成长、失败修复与长期留存 | 实现候选 v0.2 |

### 背景侧

| 编号 | 文档 | 解决的问题 | 状态 |
|---|---|---|---|
| W-01 | [世界规则](world/01-world-rules-zh.md) | 世界怎样运转、语言为何能施法、系统允许和禁止什么 | 初稿 |
| W-02 | 历史与冲突 | 魔法传统、定言运动、灾变与当代冲突如何形成 | 待写 |
| W-03 | 地区与人物 | 地区生态、聚落、组织、职业、人物关系与任务资源 | 待写 |
| W-04 | 玩家旅程 | 主角身份、章节推进、关键选择和结局状态 | 待写 |

### 灰盒关卡规格

| ID | 文档 | 机器数据 | 状态 |
|---|---|---|---|
| L-01 | [高位蓄水槽](levels/ch01-length-cistern-graybox-zh.md) | [任务 YAML](../../data/tasks/ch01-length-cistern.v0.1.yaml) | 灰盒规格 v0.1 |
| LP-01 | [溪谷世界识读序章](levels/ch01-world-literacy-prologue-graybox-zh.md) | [章节 YAML](../../data/chapters/ch01-world-literacy-prologue.v0.1.yaml) · [地区 YAML](../../data/world/regions/valley-prologue.v0.1.yaml) · [生态 YAML](../../data/ecology/valley-prologue.v0.1.yaml) · [需求 YAML](../../data/player/survival-needs.v0.1.yaml) · [动物经济 YAML](../../data/economy/wildlife-products.v0.1.yaml) · [WAL YAML](../../data/persistence/cross-save-wal.v0.1.yaml) | 跨场景灰盒 v0.1 |

关卡规格不是新的顶层设计文档编号；它把 G-01 的任务意图、G-02 的咒语构筑和 W-01 的世界规则绑定为可实现、可重放的内容实例。

玩法侧循环为 `探索与任务 → 咒语构筑 → 实际运用 → 反馈与成长 → 新探索`。背景侧循环为 `世界规则 → 历史与冲突 → 地区与人物 → 玩家旅程 → 世界规则的新理解`。

## 文档权威边界

- 玩法文档定义玩家目标、任务编排、前置能力、难度、反馈节奏、学习证据和任务指标。
- 世界文档定义世界状态、对象能力、动作前置条件与效果、语言解释状态、歧义处理、确定性转换和版本重放。
- 玩法文档只可通过 `rule_id` 引用世界规则，不得复制并改写物理或语言规则。
- 世界规则不得出现“某任务特例”“新手关特殊处理”或奖励数值。
- 示例均为非规范性内容；构建工具必须以 schema 和契约测试为准。
- 若字段、版本或规则发生冲突，内容构建必须失败，不得静默选择一方。

许可证、隐私、内容审核、数据保留、部署安全与资产授权将进入独立治理/工程文档，不占上述八份产品开发文档的编号。

## 共享术语

| 术语 | 统一定义 |
|---|---|
| 场景 `scene` | 一个可版本化的世界状态模板。 |
| 任务 `task` | 初始状态、玩家角色、限制和目标谓词的组合。 |
| 尝试 `attempt` | 从读取固定快照到完成、放弃或过期。死亡与读档不自动结束尝试。 |
| 回合 `exchange` | 一次观察、表达、解释和世界反馈；不是倒计时战斗回合。 |
| 表达 `utterance` | 玩家提交的道本语输入。 |
| 解释 `interpretation` | 系统由表达与语境得到的一个或多个候选意图。 |
| 动作 `action` | 对世界状态提出的结构化操作。 |
| 修复 `repair` | 歧义、误解或失败后产生的澄清或新表达。 |
| 有效表达 | 通过当前语言配置的结构检查；不等于自然、唯一或任务成功。 |
| 任务成功 | 指定目标谓词在世界状态上为真；不等于已经掌握语言。 |
| 掌握 | 跨时间、跨情境积累的学习证据，不能由单次答对判定。 |
| 有意义互动 | 至少一次表达产生世界后果或引发有效修复，不能按字数或消息数定义。 |

“正确答案”不是顶层概念。系统必须分别描述结构有效性、语境可解释性、交际充分性和任务结果。

## 跨文档契约 v0.1

任务实例提交给世界规则：

```text
task_id
task_schema_version
world_ruleset_version
language_profile_version
lexicon_version
initial_state_snapshot
player_role
enabled_rule_ids
enabled_words_and_particles
goal_predicates
task_constraints
expiry_and_fallback_policy
```

世界规则对一次表达返回：

```text
utterance_id
interpretation_status
candidate_interpretations
selected_or_requested_action
state_transition
goal_predicate_results
feedback_code
evidence_trace
world_event_ids
```

`interpretation_status` 只能是：

- `parsed_grounded`：可解析，且能映射到当前世界；
- `parsed_ambiguous`：存在多个合理解释，需要选择或澄清；
- `parsed_out_of_scope`：语言可能成立，但当前世界或法器没有对应能力；
- `unparseable`：不符合当前语言配置；
- `system_unknown`：系统无法可靠判断。

禁止用单一的 `wrong` 覆盖这些状态。

共享事件名称：

```text
task_started
observation_presented
utterance_submitted
interpretation_returned
world_state_changed
repair_requested
task_completed
task_abandoned
task_expired
transfer_check_completed
```

## 五个必须闭合的循环

1. 教学：可理解观察 → 主动表达 → 解释 → 可见后果 → 澄清/重述 → 完成 → 简短反思 → 延迟平行任务。
2. 世界执行：输入 → 解析 → 候选解释 → 前置条件检查 → 状态转换/歧义响应 → 事件记录 → 持久化。
3. 探索：发现异常 → 获取线索 → 尝试多种路径 → 世界改变 → 解锁捷径/人物状态 → 回访。
4. 内容发布：编写 → schema 校验 → 可达性检查 → 预览重放 → 固定版本发布 → 复盘修订。
5. 指标：学习证据 → 对应事件 → 计算方式 → 失败解释 → 延迟迁移题。

## 全项目共同禁区

- 不用唯一译文字符串决定成功。
- 不把“可解析”“自然”“对方理解”“目标完成”混为一体。
- 不在歧义时静默执行危险动作。
- 不由 LLM、客户端或社群点赞最终裁决语言正确性。
- 不允许剧情脚本绕过规则直接改变关键世界状态。
- 不把语言失误换成永久掉级、清档或嘲讽。
- 不用纯图标让玩家永久绕开道本语表达。
- MVP 不开放通用 UGC、全球排行榜或无限自由文本施法。

## 第一阶段共同冻结项

- 平台方向：浏览器/PWA 优先的 2D 游戏；实际引擎仍待技术验证。
- 世界结构：手工地图、连续存档、可回访、非 roguelike。
- 第一章语言：14 个候选内容词；`suli/lili` 成对保留宽语义，但元素召唤只映射到唯一 `LENGTH` 轴，不再提供整体 `SIZE` 模式。正式结构为 `o`、`li`、`e`，`la` 从第二章开始教学。
- 长度灰盒：五类可延展元素统一采用 1/2/4 格的较短/默认/较长形态，截面按元素固定；默认形态表示“不添加尺度修饰词”，不是 toki pona 中的“标准长度”。数值源为 [`data/spells/length-profiles.v0.1.yaml`](../../data/spells/length-profiles.v0.1.yaml)。
- 首攻灰盒：`attack.water.forceful_motion.v0.1` 的规范化语义图、证据图、MP 报价与 MU/EU 动能伤害模型以 [`data/spells/attack-signatures.v0.1.yaml`](../../data/spells/attack-signatures.v0.1.yaml) 为机器权威；词汇熟练度不得进入伤害公式。
- 软生存与动物经济：饱食/口渴不致死且不读取语言或 MP；动物死亡生成唯一尸体，肉皮经幂等加工进入低收益聚落市场，主线与语言成长均不要求狩猎。机器权威为[需求 YAML](../../data/player/survival-needs.v0.1.yaml)、[动物经济 YAML](../../data/economy/wildlife-products.v0.1.yaml)和[WAL YAML](../../data/persistence/cross-save-wal.v0.1.yaml)。
- 首个关卡实例：L-01 用观察回声、精密安全窗、两格接水阀和高位虹吸依次检验默认基线、`lili`、主动省略尺度词与 `suli`；正确直达路径耗费 21/24 MP，工具旁路可推进剧情但不伪造语言证据。
- 攻击门槛：三词 `N o tawa` 是低速实用控制；直接攻击至少需要四个有效词、获准攻击签名与足够物理预算，任意四词不自动攻击。
- 序章节奏：第一章开头约三小时以世界识读为主，主线必须击杀数为 0；三小时只是内容预算，不是现实时间门。聚落、水轮、检修渠、L-01、巢旁路与回流构成可回访闭环。
- 攻击资格：序章末只在无生命靶标上验证首个攻击签名；资格读取非战斗动作、改述、延迟取回、未见迁移与物理预算，不读取击杀、金币、现实时间或机械重复。攻击未解锁不阻挡和平推进。
- 语言裁决：规则解析器与明确语义接口；LLM 只能用于离线分析或辅助建议，不能最终裁决。
- 内容规模：首章纵向切片优先，不提前制作完整世界。








