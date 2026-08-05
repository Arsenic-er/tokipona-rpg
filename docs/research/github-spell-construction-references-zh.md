# GitHub 咒语构筑参考架构

状态：研究摘录 v0.1  
更新：2026-08-05  
对应文档：[G-02｜咒语构筑：单词层数据库](../design/gameplay/02-spell-construction-zh.md)

## 1. 结论

本项目不应照搬某一个游戏的法术表。更合适的组合是：

```text
Ars Nouveau 的成分角色
+ Hex Casting 的类型检查
+ Noita 工具的解释树
+ Cataclysm-DDA 的效果参数
+ LibreLingo 的内容管线
+ Godot Resource 的运行时承载
```

对应到本作：

```text
toki pona 输入
→ 语言语义与来源
→ 游戏魔法亲和
→ 结构/上下文角色
→ 候选咒语树
→ 类型、安全与 MP 检查
→ 可见 CastPlan 预览
→ 世界执行
→ 学习证据与物理证据分别记录
```

## 2. 项目对照

| 项目 | 许可证/状态 | 值得借鉴 | 不采用或风险 | 本作适配 |
|---|---|---|---|---|
| [Hex Casting](https://github.com/FallingColors/HexMod) | MIT | 可编程施法、输入/输出类型、无效组合诊断；“获取信息”与“改变世界”分开 | 栈式编程的认知负担过高；不能把自然语言变成隐藏机器码 | 采用类型与安全检查、可解释错误；不向玩家暴露程序栈 |
| [Ars Nouveau](https://github.com/baileyholl/Ars-Nouveau) | 代码 LGPL-3.0；纹理和模型默认保留所有权 | `Form → Effect → Augment` 的角色槽与合法修饰范围 | glyph 职能较固定；资产不可直接复制 | 改为“语义核 → 属性/关系修饰 → 句法动作”，词的角色由结构与语境决定 |
| [Cataclysm-DDA 魔法 JSON](https://docs.cataclysmdda.org/JSON/MAGIC.html) | 主体 CC BY-SA 3.0，文件可能另有声明 | 把效果、形状、合法目标、能量来源、消耗、施法时间、等级曲线、附加效果分开 | 大量枚举依赖其游戏代码；直接复制会带来共享许可义务 | 自行设计 `effect / anchor / target / cost / physics / lifetime` 字段，不复制内容 |
| [Noita Wand Simulator](https://github.com/salinecitrine/noita-wand-simulator) | 未显示许可证；还读取 Noita 专有数据 | 将有序序列编译成 Action Tree，施放前展示消耗、修饰作用域和嵌套关系 | 无许可证即不能复制代码；Noita 法术表、图标和数据不可导入 | 只借鉴“解释树/施法预览”概念，完全自建解析器、数据和界面 |
| [Entity Spell System](https://github.com/Relintai/entity_spell_system) | MIT；Godot 4 支持仍标 WIP | 中央资源注册表、Spell/Aura/Entity 分离、统一 ID、服务器权威 | 需要重编译引擎，当前不适合作为依赖 | 借鉴 ID、版本、权威执行和资源注册表，不引入模块 |
| [Forge for Godot](https://github.com/gamesmiths-guild/forge-godot) | MIT；WIP、Godot C# only | attributes/effects/tags/abilities/events/cues 分层，资源与节点组合 | 技术栈和版本尚未冻结，且生产成熟度不足 | 借鉴“效果规格”和“表现 cue”分离；不提前选为依赖 |
| [GodotGAS](https://github.com/yulrun/godot-gas) | MIT；面向 Godot 4.6+ | `TargetData → EffectContext → EffectSpec`、严格标签、效果叠加策略、表现对象池 | 对首个纵向切片可能过重；当前引擎版本未选定 | 把目标、来源、效果规格和视听反馈拆开；先实现精简版数据契约 |
| [Godot Gameplay Abilities](https://godotengine.org/asset-library/asset/3847) | MIT；Godot 4.4 社群插件 | `Ability Resource + AbilityContainer`，包含授予、激活、取消、阻塞、冷却和持续生命周期 | 它解决通用技能生命周期，不解决语言解析与物理守恒 | 编译完成的 `CastPlan` 可交给能力容器执行，但词库不是技能表 |
| [LibreLingo](https://github.com/kantord/LibreLingo) | 软件 AGPL-3.0；2026-06 已归档；课程内容可另授权 | YAML 课程源、loader 校验、JSON 导出、多个可接受表达、间隔复习与进度 | 不应嵌入 AGPL 客户端代码，也不应依赖已归档上游 | 自建“人审 YAML → schema 校验 → 运行时资源/练习数据”的编译器 |
| [Godot Open RPG](https://github.com/gdquest-demos/godot-open-rpg) | MIT | RPG 的地图、对话、战斗、角色成长和 UI 模块边界 | 回合制示例，不能当实时竖版战斗底座 | 只参考模块边界和数据/场景分离 |
| [Veloren](https://github.com/veloren/veloren) | GPL-3.0 | 外部能力数据可调，运行时状态仍使用有限类型约束 | 工程过大；复制 GPL 代码会影响许可 | 采用“数据可调、执行类型封闭”的思想，不复制实现 |

## 3. 推荐的数据分层

不要把每个 toki pona 词写成一个完整技能。语义权威源应拆成五组：

```text
lexemes/       真实语言语义域、来源、社群变体
affordances/   世界允许词唤起的魔法亲和与安全接口
grammar/       单词、词组、o/li/e 结构与上下文角色
effects/       质量、热量、速度、范围、目标、MP、持续等物理规格
lessons/       解锁、冥想、检索练习、误解警告与学习证据
```

首版可以先放在一个 YAML 条目中，但字段必须维持这五个边界，后续再物理拆文件。

运行时不直接执行 YAML 条目。解析器先产生纯数据计划：

```yaml
cast_plan:
  semantic_head: telo
  modifiers: [kon]
  relation: tawa
  target_binding: focus_direction
  effects:
    - manifest_material
    - maintain_cohesion
    - apply_velocity
  costs:
    activation_mp: 10
    sustain_mp_per_second: 0.5
  safety:
    direct_attack: true
    minimum_expression_capacity: 3
  provenance:
    spell_ruleset_version: ""
    language_profile_version: ""
```

执行器在 `CastPlan` 通过前置条件、安全和 MP 检查后才一次性提交世界变化，避免半施法、重复退款和无限生成。

## 4. Godot 侧的建议

[Godot 官方 Resource 文档](https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html)把 Resource 定义为可保存、可嵌套、可在 Inspector 中编辑的纯数据容器，并支持版本控制友好的文本资源。

因此建议：

```text
Git 权威源：YAML（方便语言社群审阅差异）
构建阶段：schema 校验 + 引用解析 + 安全规则检查
Godot 产物：类型化 Custom Resource / .tres
运行阶段：CastPlan + 执行器
```

行为代码仍由受测试的执行组件负责；YAML/Resource 只声明允许的效果与参数，不能注入任意脚本。

## 5. 明确不借鉴

- 不复制 Noita 的法术名、图标、卡牌、数值、专有 Lua 数据或 wand 规则；
- 不把 `telo`、`kon`、`pona` 等永久固定成元素 glyph；
- 不允许任意三个词只因长度达标就生成攻击；
- 不让玩家直接管理栈、向量寄存器或低层程序状态；
- 不把所有例外塞进不断膨胀的 `effect` 枚举或巨大条件分支；
- 不在确认许可证兼容前引入上述仓库代码或资产；
- 不把语言课件的复习分数直接换算成攻击伤害。

## 6. 对 G-02 的直接影响

首批数据库固定七组核心字段：

```text
lexeme / language
magic_affordance / magic
runtime_default / world
type_signature / semantic_hooks
safety / constraints
pedagogy / misconception_guards
sources_and_review / source_refs + review
```

这使同一个词能在后续出现多种合法解释，同时仍维持确定的单词默认行为、可测试的安全边界和可追踪的语言来源。

## 7. 许可证工作原则

当前阶段只记录公开架构事实和原创抽象，不复制代码、数据、文案或资产。任何实际引入必须逐文件确认：

1. 仓库是否有明确许可证；
2. 代码、数据、文档和美术是否采用不同许可证；
3. 修改、静态/动态链接、网络服务、署名和相同方式共享义务；
4. 与未来 `tokipona` 仓库许可证及私有 `tokipona-asset` 的边界是否兼容；
5. 是否能用更小的自有实现替代依赖。

