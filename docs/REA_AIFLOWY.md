# AIFlowy：研究与 REA 分解

日期：2026-11-08。官方来源为用户给出的 `docs.aiflowy.tech`。

## 来源与身份

- 官方文档链接仓库 `gitee.com/aiflowy/aiflowy`；匿名远端 HEAD `b0868a356d96b28ce5d9fc5878a01cb17f28e921`。
- 本轮只核对远端身份、阅读在线文档，未 clone/读该 commit 的实现或 LICENSE；网页版本不推断与 HEAD 完全对应。
- 已读：产品介绍、技术说明、工作流介绍、工作流快速开始。
- 范围 E1；无安装、构建、数据库、模型、后台定时、REA 或本地能力验收。

```text
https://docs.aiflowy.tech/zh/product/info/what-is-aiflowy.html
https://docs.aiflowy.tech/zh/product/info/specification.html
https://docs.aiflowy.tech/zh/product/workflow/introduction.html
https://docs.aiflowy.tech/zh/product/workflow/quickstart.html
https://gitee.com/aiflowy/aiflowy
```

## 借鉴目标

- 流程/节点输入输出、版本、测试记录与具体运行分开。
- 等待/审批不是“执行完成”；编辑草稿不能更改旧运行。
- 作为后续模板/流程管理参考，不为此全量引入 Java 平台、另一个数据库或模仿界面。
- 文档列出开源版/商业版；功能/许可/依赖未核对完，不把整个产品范围当可直接复制。

## 分解顺序

1. clone 固定提交，先查根许可、模块版本、API/数据模型和调度/凭证边界；不执行安装脚本。
2. 对照一次 workflow definition/version→instance→node attempt→event/output，追等待、失败、重试、取消和副作用结果未知。
3. 若需要分析发布 Web bundle/JAR，先固定官方产物/hash，再用 REA 对应能力；不将 Java 后端当 JS 应用分析。
4. 未取得合适产物时保留源码阅读；REA 不是本次必须完成的 KPI。
5. 运行阶段仅独立合成库、fake model/连接器，无业务账号/外部模型；先验证重复触发、越权、取消/恢复，capture 保存 unknown。

mybot 输出：流程版本、实际步骤与运行证据的最小模型；首期只读运行关系，不先做通用拖拽编辑器。

clone 方法见 [手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)，实施位置见 [AI_AGENT_WORK.md](AI_AGENT_WORK.md)。
