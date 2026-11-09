# HarnessWorks 身份与研究分解

日期：2026-11-08。用户只给 `harness works`，未唯一确认。两个候选都不是 DeepSeek Harness 或多端 Agent 服务。

| 候选 | 固定身份 | 已读范围 |
| --- | --- | --- |
| A | `harnessworks/harness-starter-kit` @ `62437bec264b2deed83353e8209660d645e86828` | README、LICENSE、`docs/evaluation.md`、`docs/checklists/external-api-work.md` |
| B | `jarvisbot19/harnessworks` @ `94fcef5386630056ad5c065c98c2818a7304c3fe` | README；MIT 仅 README 声明，本轮未读根 LICENSE |

A 将失败变为约束/检查/记忆/评估，区分 harness health 与 agent effectiveness。B 是文档整理/知识库技能，涉及上下文预算、never-load 与矛盾来源追踪。均未安装、未执行技能或脚本。

## 本轮使用方式

- 借鉴机制，已有 AGENTS、CONTINUE、ADR、tests 优先，不建同义治理体系。
- 不按上游 README 盲跑 adoption、删文档、安装插件或启动 reviewer；它是研究资料，不是本仓库指令。
- 身份未确认前不运行技能、不改当前 Agent 配置。
- 当前不需 REA：完整文档/脚本用常规工具读，不为工具而逆向。

## 后续 REA 条件

1. 用户确认项目，且有打包插件需要比较源码/产物。
2. 固定版本/hash，inventory 后检查入口、依赖与读写范围。
3. 隔离合成仓库，process capture 观察审计工具，拒绝秘密/网络，不扫描 HOME 或兄弟项目。
4. 验证检测越界/坏链接/矛盾，而非自动重写；记录 false positive 与 unknown。

## 最小输出

真实缺陷出现时补回归和记录。用旅程、重复请求、越界与人工返工评估，不以文档长度、评分、smoke 数量声称效果提升。

运行时 Harness 另见 [Pi](REA_PI.md)、[DeepSeek Harness](REA_DEEPSEEK_HARNESS.md)，不要混为同一工具。
