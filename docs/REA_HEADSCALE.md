# Headscale：多端网络与 REA 分解

日期：2026-11-08。用户指定 `juanfont/headscale`。

## 身份与阅读范围

- 远端观察 HEAD：`48416ce0894ef7bef0ef9c064609b4aa76a0d9b6`。
- 已读官方仓库介绍和 stable 文档首页、客户端/DERP 等说明；E1 文档，未 clone/审计该 HEAD 实现。
- HEAD 与 stable 文档不保证同版本。未来安装应选明确 release、校验产物/hash，不自动装 main。
- 无安装、VPN 登录、节点注册、网络接口/路由/DNS/防火墙变更、服务或端口暴露。

```text
https://github.com/juanfont/headscale
https://headscale.net/stable/
https://headscale.net/stable/about/clients/
https://headscale.net/stable/ref/derp/
```

## 产品位置

Headscale 是自托管 Tailscale 控制服务器的候选。它解决受授权设备如何进入私网，**不是** Agent 会话库、任务调度器、文件同步服务或应用登录系统。

```text
手机 / Pad / Linux / Windows / macOS 的兼容客户端
                      |
        可选自托管 tailnet（Headscale 控制）
                      |
            受限 HTTPS 应用入口
                      |
       mybot 的设备会话 / 项目授权 / 控制 API
```

Headscale 本身不替代设备端客户端。控制面与实际数据路径分开：直连不可用时可能需要 DERP；控制服务器自托管不等于全链路零第三方依赖或永远 P2P。完全私有方案还需验证 relay、DNS、身份提供方、客户端版本与实际网络路径。

网络设备撤销与 mybot 会话撤销必须分别处理；能进入 tailnet 不代表能看全部项目/调用工具。仍需应用 token/设备会话、明确 Host 和 HTTPS，不使用 `WORKBENCH_ALLOWED_HOSTS=*`。

## 验证顺序

1. 选择固定 release，核对客户端兼容矩阵、TLS/域名、持久化/备份和升级，记录未支持功能。
2. 固定官方二进制或镜像摘要与许可。完整 Go 源码用普通工具；不对 Go ELF 强行使用 JS 专用 REA。
3. 只在独立实验网络/虚拟机做注册、撤销、过期、ACL、重启；不得直接改变当前宿主路由或登录现有 tailnet。
4. REA 若用于进程取证，只记录隔离探针/回执，先核对工具支持；REA 不是网络隔离或流量审计工具。
5. 分别验直连与 DERP fallback、断网重连、控制服务器暂不可达、设备休眠；无法判断路径就记 unknown，不标“纯 P2P”。
6. 使用合成 mybot HTTP 服务验证可达/拒绝，再在明确授权后做 HTTPS 应用入口与真机往返。

本轮没有上述运行证据。实际 VPN/跨网实验需另确认，不能借研究自动注册设备、改网络配置或使用业务凭证。

## 采用/不采用条件

- 已有满足目标的 VPN 时不再建 Headscale；它不是第一步会话 UI 的依赖。
- 完全自托管控制面确有必要、客户端与运维可接受时再采用。
- 用户需要临时手机访问而无维护条件时，先比较已有私网/受限 HTTPS 入口，不因“开源”增加运维平台。

对应 [实施路线](AGENT_INTEGRATION_ROADMAP.md) 第三步；Agent/任务能力仍由 mybot 与选定后端负责。
