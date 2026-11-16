# 保存视图闭环验收

2026-11-16，Asia/Singapore。研究和首轮测试从11月15日跨日继续。
这是本地隔离合同验收，不是用户视觉接受、正式服务启用或真实模型验收。

## 实际完成

- 单用户workspace/project目录、已提交查询和已应用表格快照的保存/加载/更新/另存/删除。
- 严格v1定义、固定项目、CAS冲突、稳定创建ID和删除tombstone的前后端闭环。
- 未提交Basic/JQL不能保存；加载前保护查询草稿；编辑器保留dirty/native Back决策。
- 丢响应不自动写第二次，关闭/重开仍核对原ID。GET只说明当前资源状态，不冒充原请求回执，
  也不承诺unknown操作跨刷新持久化。
- 修正`project_unavailable`错误映射；401在JSON解析前清理，HTML代理错误也不会保留私有投影。
- 修复初始化render/订阅间的URL变化缺口。`startup-before/`是精确注入变化后的失败基线，
  最终32项专项的首项证明同一场景正确初始化项目和查询。
- 长状态移入页头下方同主题反馈区；320/360px分页两行，容量136px、模式96px。
  手机英文标题不再被长提示挤断，中文保存和焦点恢复均实际验证。

截图：[桌面目录](synthetic/saved-view-directory-window.png) /
[真实API加载](live/live-saved-view-loaded.png) /
[真实版本冲突](live/live-saved-view-conflict.png) /
[中文手机表单](synthetic/saved-views-mobile-chinese-form.png)。

长反馈对照：[修改前](mobile-feedback-before.png) /
[修改后](synthetic/saved-views-mobile-unknown-acknowledged.png)。
修改后另有几何断言：标题单行、反馈在页头之后、容量足宽、320px分页两行；
没有只以“文档不溢出”代替视觉检查。

## 最终证据

| 文件/目录 | 检查 | PNG |
| --- | ---: | ---: |
| `frontend-tests.json` | 36测试文件，794项通过 | - |
| `python-tests.xml` | 406项通过 | - |
| `build.log` | TypeScript与Vite生产构建通过 | - |
| `synthetic/verification.json` | 32项保存视图/初始化/权限/响应/手机专项 | 26 |
| `live/verification.json` | 8项实际HTTP/API/SQLite闭环 | 3 |
| `full/verification.json` | 58项整站及现有控制合同 | 60 |
| `layout/report.json` | 26项可见布局/多样式/响应式 | 18 |
| `navigation/verification.json` | 9项历史导航/dirty/busy/401 | 9 |

共116张最终生产PNG；两张修改前/失败基线图另计。所有最终浏览器报告无pageerror。
`dev-smoke/`另保存5173当前源码的手机未知结果1项/2PNG，只使用全API拦截，
不计入生产截图；它不代表原4180保存视图接口已启用。
32项合成写入仅修改脚本内存；真实API与整站共用全新
`/tmp/mybot-astryx-workbench.DpRbts`测试目录，Provider为FakeProvider，Backend为MockTransport。
保存视图实际API专项前后Run数量不变，没有模型测试、运行/重试/控制请求。
原4180/5173没有重启或数据写入；结束时5173保存视图路由仍实际404。临时4187/5176已停止。

本轮后端源码没有新改动，406是本次实际复跑，不引用上一批当新结果。
保留既有>500KB构建警告和Starlette/httpx迁移提醒，未为通过测试而升级依赖。
Chrome尺寸/合成事件不等于Safari、真实输入法或实体设备。

## 中途发现

- 必填字段的实际名称含Required，测试改为具名、有限匹配，不移除可访问性检查。
- 提交时Astryx将required Dialog变为alertdialog；原测试等dialog出现导致延迟fixture
  拖到15秒。现在同时识别两个角色，明确验证busy形态，并在真实超时前释放响应。
- 手机adaptive菜单是具名dialog内的button列表，不是桌面menuitem；按真实角色操作。
- 空JQL合法保留`jql=`，不是必须删除参数。另存切换到新的Save view标题并附copy名称。
- 未等应用就绪的live脚本曾出现URL/DOM不一致；没有只加等待后宣布修复。
  单独构造订阅前变化得到可重复失败基线，再修Workbench初始化同步并重跑完整导航。
- 开发r2有一次空body，未当作成功或断言其根因。稳定生产构建的最终报告全部重新执行。
- 初版截图中长反馈把Tasks挤断且320px分页截断，随后重构反馈位置和窄屏分页，
  再重建/重跑全部最终报告。较早`prod-final`等路径不是本证据中的最终构建。

中途文件保留在`/tmp/mybot-saved-views-*`对应轮次；本目录只收最终报告和明确标注的基线。
合同：[ADR-0010](../../../docs/decisions/ADR-0010-private-saved-views.md)。

## 复现与启用

用现有Playwright/Chrome，无新安装：

```bash
cd frontend
pnpm exec vitest run
pnpm build
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5173/ \
node scripts/verify-saved-views.mjs
```

完整专项不设置`SAVED_VIEWS_SCENARIO`。实际API脚本必须使用
`frontend/README.md`的全新fixture、测试令牌及5176预览，不能指向用户4180：

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node scripts/verify-saved-views-live.mjs
```

Python使用`.venv/bin/python -m pytest`；本机旧pytest启动脚本的shebang仍指向搬迁前目录，
没有为测试擅自重建用户虚拟环境。

主服务启用仍需独立确认。步骤、备份、活跃/排队任务和Worker门槛见
[启用检查](../../../docs/SAVED_VIEWS_ACTIVATION.md)。
本轮不新增团队ACL、Cindy接力、IM/邮箱、任意DAG或代码执行权限。
