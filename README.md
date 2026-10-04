# tokipona-rpg

一款使用道本语（toki pona）表达构筑魔法的横版 2D 像素动作 RPG。游戏采用连续存档和可回访世界；玩家通过探索、战斗、环境改造、人物沟通与冥想练习学习语言。

项目目前处于纵向切片开发阶段。当前森林试玩接到《水轮与碎片》小节：过溪、接工、修水轮、取得媒介与碎片、隐士引导实践、回村结算。材料模拟、完整施法、学习证据、软生存、交易和高位蓄水槽等更大的系统仍保留在工程中，不代表已经全部接入这条可玩路线。早期“描述场景—让伙伴重建—通过澄清修复误解”的方案保留为语言学习研究基线，并将作为任务、沟通和反馈机制的一部分，而不再单独定义完整游戏形态。

## 开发环境约定（2026-10-03）

后续源码编辑、依赖、构建、测试、结果和 Git 发布均在指定服务器完成，本机只作远程控制端。连接失败时检查已有 SSH / Tailscale，不自动改成本机开发。不要向本机下载源码、依赖、二进制或完整日志；具体文件回传须先取得用户明确同意。

当前服务器增量已接通工坊排水、隐士林地、地下入口、精密引水窗、蓄水室校准层、高位虹吸及顶层出口。虹吸通水后可乘双向升降机到顶层，从内侧放下回流道永久梯，返回工坊并回聚落说明变化；工坊也可沿捷径回访顶层。升降机支持空载呼叫、阻挡停机与中途存档；现场水工具路线不要求消耗 MP，原检修梯仍可通行。正式学习判据、阶段重置、旧矿道与其他位点仍待接入，不能视为完整 L-01 或完整第一章。人物与旧档保留，无需重开。详见 [续作与验证记录](docs/handoffs/2026-10-01-server-resume-zh.md)。本机旧 EXE 尚未包含这些增量，不能将服务器试玩通过写成离线包已交付。

校准盘新增 v2 分流水路：较短水段落入近端回收槽，默认水段接触远端水舌后引水进深盘；连续慢速短施法不再靠积水直接开阀，仍可用现场水箱解围。已经开始机关的 v1 旧档保留原物理版本，不重置 MP / 进度。上层虹吸另有 58 px 远距接触点与有限水箱，推进仍要求实际接水量；工具解法和有说明的施法均不计作正式语言掌握。

## 本地 Windows 试玩

本机最新版固定为 `exports/windows/tokipona-rpg-latest.exe`。这是内含运行时和私人候选素材的离线测试包，不依赖开发服务器或 Tailscale，不是公开发布包。

2026-09-17 森林地表第一轮重构：新开局的林间台阶改成长坡，聚落增加草地浅洼与平整房屋基础；地下土岩截面降低对比，植被落点对齐真实地面。旧档保留旧碰撞，新地形可通过「临时重玩」体验；水轮峡谷与地下关卡尚未重构。范围与验证见 [森林地表记录](docs/testing/2026-09-17-forest-surface-rebuild.md)。

2026-09-17 将常驻任务目标收进 `J` 任务日志，工务人与隐士改用不同轮廓和服饰。按 `Esc` →「独立魔法实验室」可试水、热、冷、沙、气流及已实现的组合；场内包含可破坏材料和锁定结构，不修改主游戏进度。实验室也可从 `magic-lab.html` 独立进入。热、冷、气流、水及冲击可作用于自己，紧贴沙土也能施法自救，仅保留身体内直接生成沙石的限制。详见 [任务日志与实验室记录](docs/testing/2026-09-17-journal-npcs-magic-lab.md) 和 [近身施法修订](docs/testing/2026-09-17-lab-self-cast.md)。

2026-09-16 更新建筑细节和不规则土岩层，加入 `M` 地图：当前场景／世界连接示意、右侧小地图和自动保存的探索黑幕。旧进度保留，旧档从更新后的当前位置开始绘图；平原等后续区域未开放。详见 [建筑与地图验证](docs/testing/2026-09-16-architecture-and-map.md)。

2026-09-14 已交付可连续完成的《水轮与碎片》第一章小节，非完整三小时第一章。已有开场档不清空：抵达聚落后选“进入聚落 · 水轮与碎片”；续篇开始后，重新打开默认入口自动恢复续篇。想从头体验新物理可按 J →“临时重玩（不改主存档）”。范围与验证见 [水轮与碎片小节记录](docs/testing/2026-09-14-waterwheel-episode.md)，实际 EXE 状态见 [本机交付记录](docs/testing/windows-offline-playtest.md)。

原 Windows 打包入口 `pnpm run desktop:latest` 保留，但按上述新约定不再默认在用户本机执行。未来离线包需先建立服务器端构建及 Windows 验收链路，验证成功且获准回传后才替换唯一同名文件；失败时保留现有包。不得把存档目录当作旧版本清理目标。

桌面存档固定在 `%APPDATA%/tokipona-rpg`，与 EXE 分离；浏览器存档保持原样，两者不会自动合并。`F11` 或 `Alt+Enter` 切换全屏。包未签名，仅供本机测试，不要求关闭系统安全功能。详细边界见 [Windows 离线包说明](docs/testing/windows-offline-playtest.md)。

## 设计与开发文档

- [2026-09-17：森林坡地与聚落地表第一轮重构](docs/testing/2026-09-17-forest-surface-rebuild.md)
- [2026-09-17：实验室近身施法与沙埋自救](docs/testing/2026-09-17-lab-self-cast.md)
- [2026-09-17：任务日志、角色辨识与独立魔法实验室](docs/testing/2026-09-17-journal-npcs-magic-lab.md)
- [2026-09-16：建筑、地层与探索地图](docs/testing/2026-09-16-architecture-and-map.md)
- [2026-09-14：水轮与碎片可玩小节](docs/testing/2026-09-14-waterwheel-episode.md)
- [2026-09-14：溪岸石木轮廓与接触面开发记录](docs/testing/2026-09-14-forest-body-silhouettes.md)
- [中文游戏设计研究](docs/game-design-research-zh.md)
- [八份开发文档总索引](docs/design/README.md)
- [玩法 01：探索与任务](docs/design/gameplay/01-exploration-and-quests-zh.md)
- [玩法 02：咒语构筑（单词层数据库）](docs/design/gameplay/02-spell-construction-zh.md)
- [玩法 03：软生存与动物素材经济](docs/design/gameplay/03-survival-and-wildlife-economy-zh.md)
- [玩法 04：反馈与成长](docs/design/gameplay/06-feedback-and-growth-zh.md)
- [背景 01：世界规则](docs/design/world/01-world-rules-zh.md)
- [首个灰盒关卡：高位蓄水槽](docs/design/levels/ch01-length-cistern-graybox-zh.md)
- [前三小时跨场景灰盒：溪谷世界识读序章](docs/design/levels/ch01-world-literacy-prologue-graybox-zh.md)
- [GitHub 咒语构筑参考架构](docs/research/github-spell-construction-references-zh.md)

服务器迁移与继续开发请先看 [2026-10-01 新服务器与工坊续作记录](docs/handoffs/2026-10-01-server-resume-zh.md)，包含后续的落水／排水沟守恒、旧档兼容和关闸修订。此前的 [2026-09-23 项目恢复快照](docs/handoffs/2026-09-23-server-expiry-snapshot-zh.md) 保留两仓备份、旧服务器 stash 和离线重建步骤。

## 机器数据

- [首批单词咒语](data/spells/single-word-spells.v0.1.yaml)
- [长度构形参数](data/spells/length-profiles.v0.1.yaml)
- [首个攻击签名与 MU/EU 物理伤害模型](data/spells/attack-signatures.v0.1.yaml)
- [饱食度与口渴度](data/player/survival-needs.v0.1.yaml)
- [动物尸体、加工与聚落市场](data/economy/wildlife-products.v0.1.yaml)
- [跨存档 WAL 与单调世界时钟](data/persistence/cross-save-wal.v0.1.yaml)
- [高位蓄水槽任务](data/tasks/ch01-length-cistern.v0.1.yaml)
- [世界识读序章编排](data/chapters/ch01-world-literacy-prologue.v0.1.yaml)
- [溪谷序章地区拓扑](data/world/regions/valley-prologue.v0.1.yaml)
- [溪谷序章动物生态](data/ecology/valley-prologue.v0.1.yaml)

## 仓库边界

- 本仓库：可公开的游戏代码、测试、设计文档、内容 schema、可再分发的运行时资源。
- 私有 `tokipona-asset`：美术/音乐/配音源文件、工程文件、未发布素材、授权证明和资产清单。
- 私有仓库中的素材只有在许可允许分发且完成资产审查后，才可导出到本仓库。

## 状态与许可

本仓库目前没有选定软件许可证。`public repository` 不等于已经授予开源使用权；许可证应在技术栈、社区贡献方式和第三方数据依赖确定后再选择。
