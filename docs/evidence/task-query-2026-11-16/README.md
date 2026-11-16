# IZ-07.1 服务端任务查询API

日期：2026-11-16。范围：服务端只读查询合同，**不是前端已改为服务端分页，
不是IZ-07全部完成或生产性能认证**。

## 交付

- 新增`workbench/task_query.py`与`GET /api/tasks/query`。
- 复用严格SavedView查询/排序字段，支持项目/状态OR、字段间AND、文字检索、固定项目、
  最多3层排序、有限JQL排序、真实总数与20/50/100分页。
- Task按最近Run分类，历史失败不冒充当前失败；返回最小Run投影，不附运行上下文。
- 同一只读SQLite事务内计算总数/页数据；并发写入不可产生一个响应内的前后矛盾。
- 无重复参数/重复JSON键/未知值静默放过；非法查询与项目不可用明确422。
- 连接成功/失败都关闭，读查询不持有写锁；新增两个查询索引，无新依赖。

排序明确标识`unicode-natural-v1`，不声称与Astryx当前Intl.Collator逐字一致。
这一差异是前端迁移的验收项，当前没有偷换页面结果或增加第二套页面。
请求与响应字段、边界及代码来源见
[ADR-0011](../../decisions/ADR-0011-server-task-query.md)。

## 验证

`python-tests.xml`保存最终全量后端结果，71项新增任务查询测试加原406项，477项通过。
没有启动查询fixture的执行Worker；Provider.requests始终为空。
测试包括72个任务/分项目状态、额外历史记录、SQL相似文字、Unicode、JSON、页边界、
三层排序约束、并发未提交写、COUNT之后独立提交写及连接关闭。

首轮全量为476通过/1失败：连接关闭检查在主线程操作Worker线程创建的SQLite连接，
先触发了线程归属错误。改为在创建/关闭的同一Worker线程验证真实close，
没有修改生产`check_same_thread`或弱化关闭断言，最终全量重新执行。

数据测量仅用自动清理的全新临时库，不打开`.runtime`或用户数据，不发HTTP/模型请求：

| 合成任务 / Run | 默认首页中位数 | 项目范围自然排序 | 字面量文字检索 |
| --- | ---: | ---: | ---: |
| 2,000 / 4,800 | 15.80ms | 6.48ms | 16.70ms |
| 20,000 / 48,000 | 172.45ms | 68.01ms | 183.07ms |

每场景3次，本机SQLite3.45.1。首页均返回20项、响应约8–9KB；JSON原始值见
`benchmark-2000.json`与`benchmark-20000.json`。并行系统负载、缓存与硬件影响数值；
不是HTTP延迟、界面耗时、压测SLO或所有查询性能保证。
文字检索仍需扫描匹配范围，查询并非O(1)。

本项没有前端源码改动，794项前端与构建是本轮提交基线前实际复跑的结果，
不算本API新增前端验收。保留Starlette/httpx提醒；没有为测试升级依赖。
当前4180未重启，新路由实际404，保存视图原有接口保持已启用。

## 复现

在仓库根目录：

```bash
.venv/bin/python -m pytest -q tests/test_task_query.py
.venv/bin/python -m pytest -q
PYTHONPATH=. .venv/bin/python tests/benchmark_task_query.py --tasks 2000 --samples 3
PYTHONPATH=. .venv/bin/python tests/benchmark_task_query.py --tasks 20000 --samples 3
```

基线成果`f9e5484`已推送origin/main。此项完成后独立提交并推送，不强推、不提交私有备份。
后续IZ-07.2前端严格client/并发/URL/分页接入，IZ-07.3缩减Bootstrap和Inspector历史查询，
IZ-07.4生产构建浏览器及性能测量仍待完成。原119/110统计不因子项或测试数量改变。
