# 工作台可见排版整改

日期：2026-11-15，Asia/Singapore。用户在“页面没有变化”的反馈后授权本轮整改。
范围是实时 React 工作台及复用它的项目任务页，不是全站改版或新增 Agent 执行能力。

## 前后对照

同一份合成数据：3 个项目、32 个任务，包含成功、运行中、失败、暂停和未运行。
不读取用户工作区、账号或模型内容。Before 来自修改前的 5173 开发入口，After 来自
同机 5176 生产构建；相同视口、语言、样式、密度、初始 URL 和 fixture。

| 视口 | 修改前搜索宽度 | 修改后搜索宽度 | 对照 |
| --- | ---: | ---: | --- |
| 1440 × 1000 | 135.3px | 484.3px | [之前](before/desktop.png) / [之后](after/desktop.png) |
| 1024 × 900 | 143.3px | 284.3px | [之前](before/tablet.png) / [之后](after/tablet.png) |
| 390 × 844 | 114.3px | 202.0px | [之前](before/mobile.png) / [之后](after/mobile.png) |

详情：[桌面之前](before/desktop-inspector.png) /
[桌面之后](after/desktop-inspector.png) /
[手机之后](after/mobile-inspector.png)。

可见变化：

- 页头分开呈现标题、当前范围和真实结果数，不再全部挤成一行。
- 查询行只放搜索、条件、Basic/JQL、提交与清除；全局快速查找保持独立。
- 结果工具栏左侧切换任务/看板/运行记录，右侧管理列与排序。打开详情后，列工具仍在
  表格右上，不跨到 Inspector 上方。
- 手机用 Astryx adaptive Selector 切换 Basic/JQL，视图控件移出页头和查询行。
- 筛选栏增加真实状态图标，详情重排为项目/编号、标题、状态/入口、目标、验收、文件、历史。
- 英文触控密度的桌面分页选择器增宽，避免原有截断。

代价：舒适密度的表格起点比旧版下移约 80px，用独立工具带换取可用搜索宽度和层级。
没有新增指标卡、演示页面、主题分支、组件库或依赖。视觉仍待用户评审。

## 验证

| 报告 | 结果 | 截图 |
| --- | --- | ---: |
| `frontend-tests.json` | 35 文件、781 项通过 | - |
| `build.log` | TypeScript、Vite build 通过；原有 >500KB 警告保留 | - |
| `after/report.json` | 26 项：布局、查询提交、窄屏模式键盘操作、视图切换 | 18 |
| `full/verification.json` | 58 项综合回归，10 路由 × 3 视口、表单、密度、主题和控制合同 | 60 |
| `advanced/verification.json` | 30 项多选/排序/列配置与非法条件 | 24 |
| `drafts/query-drafts-verification.json` | 15 项草稿与提交/导航 | 9 |
| `project/project-workspace-verification.json` | 16 项固定项目合同 | 6 |
| `continuity/list-continuity-verification.json` | 10 项列表选择/双轴滚动/焦点/401清理 | 6 |

生产报告合计 123 张 PNG，修改前另有 6 张，不混作同一版本。所有最终浏览器报告无
pageerror。连续性修复已在本轮通过最终 unit/build/生产浏览器检查，仍仅为内存恢复，
不承诺刷新持久化。新版 5173 也另以全 API 拦截方式复测 26 项通过。

综合测试只写全新 `/tmp/mybot-astryx-workbench.K4mtWR`，Provider 是 FakeProvider，
Backend 是 MockTransport。其他专项全 API 拦截，只读；没有真实模型/账号调用或正式数据写入。
原 4180/5173 服务未重启。保存视图 API 未在原 4180 启用，本报告不是其专项验收。
Python 本轮未重跑，406 是上一批后端基线。Chrome 尺寸/合成 IME 不代表 Safari 或实体设备。

中途检查没有当作通过：开发热更新期间的动态 import 失败；综合 fixture 的令牌/目录前缀
不匹配；三个脚本仍在旧查询行定位 Columns/未应用。已按实际新区域更新定位并重跑，
保留原有查询结果、URL、焦点、密度和权限断言，没有删除行为检查。
中途记录在 `/tmp/mybot-visible-advanced/` 和 `/tmp/mybot-visible-production/` 对应非最终轮次。

## 复现

使用已安装的 Playwright 和 Chrome，不安装新依赖：

```bash
cd frontend
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5173/ \
WORKBENCH_EVIDENCE_DIR=/tmp/mybot-visible-check \
node scripts/verify-workbench-layout.mjs
```

`LAYOUT_PHASE=before` 只用于修改前留证，当前源码不会生成旧界面。
完整回归必须用全新测试目录、`astryx-browser-fixture` 测试令牌和
`tests/browser_server.py` 的隔离服务，不得指向用户的 4180 后端。
