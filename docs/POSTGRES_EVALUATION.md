# PostgreSQL 候选只读检查

日期：2026-11-13。用户提供两个正在运行的容器并询问选择；本轮只检查非敏感元数据，
没有数据库连接、业务表读取、建库、改密码、重启或迁移。

## 检查结果

| 容器 | 配置镜像 | `postgres --version` | 状态 | 宿主机端口 | 网络 |
| --- | --- | --- | --- | --- | --- |
| mattermost-db | postgres:15-alpine | 15.19 | healthy | 无发布，只有 5432/tcp | agent-delivery-platform_default |
| sub2api-postgres | postgres:18-alpine，`docker ps` 显示镜像 ID | 18.6 | healthy | 无发布，只有 5432/tcp | sub2api-deploy_sub2api-network |

- 两者均 `unless-stopped`，未配置容器级 Memory/NanoCPU 限额。
- 单次 `docker stats --no-stream` 显示资源占用较低，但这不是容量、慢查询或高峰压测。
- Mattermost 数据为命名卷；sub2api 同时有 `/var/lib/postgresql` 卷与
  `/var/lib/postgresql/data` 绑定挂载。`postgres -C data_directory` 的配置解析结果为
  `/var/lib/postgresql/data`。没有据此宣称备份、恢复或数据库内容已验收。
- 不读取容器完整环境、密码、角色列表、业务数据库、备份内容或日志。

## 建议，不是已执行的决定

1. 首选 mybot 独立 PostgreSQL 18 实例、独立持久卷和专用角色，降低与现有应用共担
   升级、重启、连接数和资源风险。
2. 若只能二选一，倾向 sub2api-postgres 的 18 系列；仍需建立独立 `mybot` 数据库和
   非超级用户角色，不使用 sub2api 或 Mattermost 的原业务库/账号。
3. 不建议为 mybot 改动 Mattermost 的数据库版本、网络或现有数据。
4. 当前 Python 后端仍使用 SQLite Store，不能仅填写一个 PostgreSQL URL 就声称
   接入成功。需要存储适配、schema/data migration、事务/幂等/恢复/撤销合同回归，
   再单独确认迁移和停机窗口。

截至本轮核对，官方于 2026-11-12 发布了 18.7、15.20 等安全修补版本。采用前需评估
备份与补丁，不自动更新现有容器。官方来源：

```text
https://www.postgresql.org/about/news/postgresql-187-1712-1616-1520-1425-and-19-rc-2-released-3442/
https://www.postgresql.org/support/versioning/
```

后端语言建议仍为 Python/FastAPI 控制面，Rust 为后续经测量确认的设备节点/系统模块候选；
这不是用户已批准全量重写或新增基础服务的授权。
