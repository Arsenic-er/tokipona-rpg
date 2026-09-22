# 2026-09-23 · 服务器到期前项目恢复快照

用户要求先把当前工作上传 Git。本次仅整理、验证和备份，不继续扩展玩法，不清空玩家进度，不改动已认可的步态。

## 权威位置与分支

| 内容 | 仓库 | 恢复分支 |
| --- | --- | --- |
| 代码、设计、开发日志、测试与构建脚本 | `Arsenic-er/tokipona-rpg`（公开） | `main` |
| 人物、背景候选、原始素材、截图与审阅证据 | `Arsenic-er/tokipona-asset`（私有） | `codex/glyph-activation-assets-v0.1` |

两仓本次备份前的基线分别为 `2f59e6576a21a0e61adc7ecb66def96674354eb0` 与 `af2f71881ef598d4ed025e5629688fa41883a9c3`。最新工作在本机，不在旧服务器的开发预览目录中。不要使用服务器旧分支覆盖当前 `main`，也不要将私有素材分支误认成私有库 `main`。

## 本次保存的近期进度

- 《水轮与碎片》可玩小节：过溪、聚落接工、修复水轮、取得受损媒介与森林碎片、隐士引导及 `telo` 实践、回村结算与住宿。保留原任务、学习和 MP 系统。
- 石块与木料的实际像素轮廓、建筑细节、不同 NPC 外观、J 任务日志、M 当前场景／世界地图及探索黑幕。
- 独立魔法实验室、可破坏材料与锁定结构、有限组合和近身施法／沙埋自救；实验场不写入主存档。
- `woodland-v2` 森林坡地与聚落草地：新地形只用于新开局和临时重玩，旧存档保留原地面碰撞。实际溪沟任务带保持原逻辑与材料。
- 离线 Windows 构建及开场／续篇 fresh、restore 验证流程。现有人物 v0.6 和背景 v0.3 仍为私有候选。
- 六组 2026-09-14 至 2026-09-17 的私有审阅目录，共 76 份数据条目及逐文件 manifest，另有各组说明；本次重新核对字节数和 SHA-256 全部一致。归档路径禁用 Git 换行转换，避免跨平台检出改变已登记的字节。

开发记录：

- [石木轮廓](../testing/2026-09-14-forest-body-silhouettes.md)
- [水轮与碎片小节](../testing/2026-09-14-waterwheel-episode.md)
- [建筑与地图](../testing/2026-09-16-architecture-and-map.md)
- [日志、NPC 与实验室](../testing/2026-09-17-journal-npcs-magic-lab.md)
- [近身施法](../testing/2026-09-17-lab-self-cast.md)
- [森林地表重构](../testing/2026-09-17-forest-surface-rebuild.md)

## 服务器核查与额外归档

通过已有 SSH／Tailscale 连接检查了本项目服务器代码仓、素材仓及世界尺度工作区。三个工作区均无未提交文件；旧代码分支提交 `b2834d8`、`2e2a710` 已被公开远端 `main` 包含，旧素材 `4fa1a35` 已被私有远端历史包含。

额外发现 2026-08-06 的 stash `0efe01a9af8d8bfb9741bb4a27c8c801fe753d9e`：10 份早期设计文档／数据。本次不应用旧 stash，使用完整 Git bundle 保留全部旧代码引用及该 stash，归档到私有库：

`archive/server-expiry/2026-09-23/server-game.bundle`

大小 3,251,216 B，SHA-256 `8806737861ff79032851e6913c3a3761581107cad83c0fc63b3270c6fd0540be`。恢复说明与 manifest 放在同目录。这不是整台服务器镜像；其他项目、系统凭证、服务配置和临时依赖不在本任务范围内。

## 本次验证与既往测试的区别

2026-09-23 重新运行并通过：`content:check`、`assets:check`、`typecheck`、公开 `build`（含包体预算）及正常换行配置下的 Git 差异空白检查。检查待提交文本的常见凭证模式未发现匹配；此检查不等于全面安全审计。

公开资源边界仍为 `safe_blocked_pending_external_approval`，不是已授权公开分发私有美术。首屏 JS 1,061,594 B／22 请求，最大单块 324,505 B，未提升预算。

2026-09-17 已完成相关单元 54 文件／349 项、同轮浏览器 19 项及最终 14 项复测，并有最终便携包原生检查记录。本次是备份，未重跑全量单元、浏览器或原生通关，不把既往结果标为本次重新执行。

## 从新机器恢复开发

安装 Git、Node 22.13 或更高的 22.x、项目锁定的 pnpm 11.19.0；私有库需要原有账户访问权限。将两仓放在同一级目录：

```sh
git clone --branch main https://github.com/Arsenic-er/tokipona-rpg.git toki-pona
git clone --branch codex/glyph-activation-assets-v0.1 https://github.com/Arsenic-er/tokipona-asset.git tokipona-asset
cd toki-pona
pnpm install --frozen-lockfile
pnpm run content:check
pnpm run assets:check
pnpm run build
```

公开浏览器入口为 `chapter-one.html`，实验室为 `magic-lab.html`。公开构建有意不包含私有候选美术。在 Windows 上运行 `pnpm run desktop:latest`，现有构建流程会校验同级私有仓中的人物及背景、运行独立测试，再输出最新版便携 EXE；不需要恢复旧服务器。

## 本机试玩文件与排除项

本机唯一交付：`exports/windows/tokipona-rpg-latest.exe`，92,866,906 B，SHA-256 `4B3BD3AD2DCFE0B08B9BF2CA76CC622D8B0B7EEA2A553815E998F25175DA3200`。本次复核文件哈希一致，未重新打包。它未签名，包含私有候选，**不上传公开 Git**；本次两仓 Git 备份保存重建所需代码、锁文件、脚本及素材，不上传 EXE 二进制。

不提交 `node_modules`、`dist`、`.codex-tmp`、`exports`、本地素材缓存、密钥、令牌或真实玩家存档。玩家数据 `%APPDATA%/tokipona-rpg` 留在本机，未删除、迁移或上传。

## 下一步边界

目前是可玩的小章节闭环，**不是完整三小时第一章**。地表重构仍待用户目测验收；水轮工坊溪谷水系、隐士林地地形、地下蓄水廊／后续位点、建筑室内和进一步生态扩展尚未完成。后续从这些真实缺口继续，不能把备份成功写成玩法或美术全部验收通过。
