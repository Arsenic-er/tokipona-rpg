# tokipona

一款使用道本语（toki pona）表达构筑魔法的竖版 2D 像素动作 RPG。游戏采用手工地图、连续存档和可回访世界；玩家通过探索、战斗、环境改造、人物沟通与冥想练习学习语言。

项目目前处于设计与灰盒定义阶段，尚未初始化正式游戏代码。早期“描述场景—让伙伴重建—通过澄清修复误解”的方案保留为语言学习研究基线，并将作为任务、沟通和反馈机制的一部分，而不再单独定义完整游戏形态。

## 当前文档

- [中文游戏设计研究](docs/game-design-research-zh.md)
- [八份开发文档总索引](docs/design/README.md)
- [玩法 01：探索与任务](docs/design/gameplay/01-exploration-and-quests-zh.md)
- [玩法 02：咒语构筑（单词层数据库）](docs/design/gameplay/02-spell-construction-zh.md)
- [背景 01：世界规则](docs/design/world/01-world-rules-zh.md)
- [首个灰盒关卡：高位蓄水槽](docs/design/levels/ch01-length-cistern-graybox-zh.md)
- [GitHub 咒语构筑参考架构](docs/research/github-spell-construction-references-zh.md)

## 机器数据

- [首批单词咒语](data/spells/single-word-spells.v0.1.yaml)
- [长度构形参数](data/spells/length-profiles.v0.1.yaml)
- [高位蓄水槽任务](data/tasks/ch01-length-cistern.v0.1.yaml)

## 仓库边界

- 本仓库：可公开的游戏代码、测试、设计文档、内容 schema、可再分发的运行时资源。
- 私有 `tokipona-asset`：美术/音乐/配音源文件、工程文件、未发布素材、授权证明和资产清单。
- 私有仓库中的素材只有在许可允许分发且完成资产审查后，才可导出到本仓库。

## 状态与许可

本仓库目前没有选定软件许可证。`public repository` 不等于已经授予开源使用权；许可证应在技术栈、社区贡献方式和第三方数据依赖确定后再选择。
