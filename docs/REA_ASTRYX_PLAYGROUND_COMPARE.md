# REA / Astryx Playground 对比报告

> 历史初始差异快照（2026-11-11），不作为当前完成度。2026-11-12 已修复 StyleX
> 编译、三层 Theme Editor、实时主题消息、隔离预览、恢复和布局；逐项当前结果见
> [REA_ASTRYX_THEME_EDITOR.md](REA_ASTRYX_THEME_EDITOR.md) 的 Delivery Verification。
> 下列百分比是旧估计，已弃用；以功能和实际验证结果为准。

## Current Delivery Snapshot (2026-11-12)

The local `#templates` slice now has the core Playground loop: Monaco with
self-hosted declarations, source-to-TSX compilation in an opaque preview
iframe, build/runtime error recovery, seven theme presets plus three-layer
Theme Editor, 58 on-demand template sources, hash restore/share, desktop/phone
views, and Targeting with literal-property source patching. `pnpm typecheck`,
84 frontend tests, and the production build pass; Chrome checks also cover
live edits, template switching, theme controls, Targeting, property Apply and
mobile layout.

It is a functional local reproduction, not a claim of byte-for-byte upstream
identity. Remaining differences are the breadth of upstream property metadata,
some upstream editor polish, and the preview bundle size.

## Initial Baseline (Historical)

以下结论描述 2026-11-11 的初始差异，保留用于审计对照；不代表
2026-11-12 当前实现：

`mybot/#templates` 当时不是 Astryx Playground 的本地复刻，而是一个“模板选择器 +
静态预览”的早期外壳。两者的视觉结构、运行时模型和交互能力差异很大。

当前实现的主要问题不是某几个间距或颜色不一致，而是 Playground 的核心契约没有实现：

1. `pg-*` 布局类没有任何 CSS 定义，页面不会形成 Astryx 的三段式工作区。
2. 代码编辑器只是 `textarea + 正则高亮`，编辑内容不会编译，也不会驱动右侧预览。
3. 右侧预览直接 import 已构建的模板组件，不是 Astryx 的隔离 iframe 运行时。
4. Theme 编辑器只有静态展示，`Components`、`Tokens` 页签不可用，Token 修改没有作用。
5. 当前路由调用缺少必需 props，`pnpm typecheck` 已失败。

因此当前完成度判断：

| 范围 | 当前完成度 |
| --- | ---: |
| Astryx Playground 视觉布局 | 约 10% |
| 可编辑代码到实时预览 | 约 0% |
| Theme Editor | 约 10% |
| 模板目录展示 | 约 60%（数量接近，行为不等价） |
| 安全、错误恢复、分享/导出 | 约 0%～20% |
| 可作为 Astryx Playground 使用 | 不满足 |

目标应是复制 Astryx Playground 的**结构和能力**，而不是继续修补当前静态模板页面。

## 对比基线

Astryx 源码位置：

- [`PlaygroundClient.tsx`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/PlaygroundClient.tsx)
- [`PreviewStage.tsx`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/PreviewStage.tsx)
- [`defaultCode.ts`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/defaultCode.ts)
- [`ThemeEditor.tsx`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/themeEditor/ThemeEditor.tsx)
- [`usePreviewFrame.tsx`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/usePreviewFrame.tsx)
- [`preview/page.tsx`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/preview/page.tsx)
- [`preview/runner.ts`](/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/preview/runner.ts)

mybot 当前实现：

- [`TemplatesPage.tsx`](/home/my/workspace/ainfra/mywork/mybot/frontend/src/TemplatesPage.tsx)
- [`styles.css`](/home/my/workspace/ainfra/mywork/mybot/frontend/src/styles.css)
- [`template-loaders.ts`](/home/my/workspace/ainfra/mywork/mybot/frontend/src/templates/template-loaders.ts)
- [`manifest.json`](/home/my/workspace/ainfra/mywork/mybot/frontend/src/templates/generated/manifest.json)
- [`App.tsx`](/home/my/workspace/ainfra/mywork/mybot/frontend/src/App.tsx)

## 1. 布局和尺寸

| 项目 | Astryx Playground | mybot 当前实现 | 差异 |
| --- | --- | --- | --- |
| 页面容器 | `AppShell` 全高工作区，内容区 `height="100%"`、`overflow:hidden` | `pg-root` 未定义样式 | 页面不会形成稳定的全高双栏布局 |
| 桌面导航 | AppShell 的折叠 SideNav 图标轨道，桌面宽度约为 `var(--spacing-12) + var(--spacing-2)` | `pg-rail` 没有 CSS | 品牌、代码、主题图标没有固定轨道尺寸 |
| 左编辑器 | 默认 `440px`，可调整范围 `340px～760px`，带 Divider/ResizeHandle | 没有 ResizeHandle，也没有宽度规则 | 左右比例、拖拽和最小尺寸都不一致 |
| 右预览 | `flex:1` 填充剩余区域，Toolbar 与预览阶段独立 | `pg-right-panel` 未定义样式 | 预览无法稳定占满剩余空间 |
| 预览外框 | 桌面填充；Phone 为固定 `402 × 874 CSS px`；外层有 16px 横向、底部间距 | 只有 `is-phone` class，没有对应尺寸 CSS | 手机预览不是固定设备画布 |
| 全屏 | 预览 wrapper `position: fixed; inset: 0; z-index:50`，保留同一 iframe | `document.documentElement.requestFullscreen()`，没有退出按钮和状态 | 全屏后无法按 Astryx 方式退出/保持 channel |
| 编辑器 header | 48px 最小高度，桌面显示 Playground、Format code、Themes、Templates；移动端收缩 | header 类未定义 | 工具栏、按钮间距和移动行为均不一致 |
| 右侧 Toolbar | 左侧 Target element；中部亮暗、Desktop/Phone、Expand；右侧 build 状态、Export | 仅几个原生按钮 | 缺少状态区、对齐规则、提示和可访问名称 |

`mybot` 的 `styles.css` 中不存在 `pg-root`、`pg-rail`、`pg-left-panel`、`pg-preview-toolbar`、`pg-preview-area` 等类的定义。这是当前“样式问题很大”的首要原因，不是单纯主题 Token 偏差。

## 2. 代码编辑和预览运行时

### Astryx

- 使用 Monaco（动态加载，SSR 禁用），带真实 TypeScript/TSX 编辑体验。
- 使用仓库的 `.d.ts` 类型信息和 Monaco 主题。
- `Format code` 调用 Monaco 的 `formatDocument`，使用 Prettier；失败会显示错误 Toast。
- `code` 是单一事实源，同时驱动 Monaco、属性编辑器、URL hash 和 preview。
- 代码变更 debounce 400ms 后通过 `postMessage` 发给预览 iframe。
- 预览 iframe 内部加载自托管 TypeScript 编译器，执行 `TSX → CommonJS → React Component`。
- 编译错误和运行时错误会回传为 `preview-error`，右上角显示 Build error 和 Rebuild。

关键位置：`PlaygroundClient.tsx:17-31, 121-166, 399-428, 650-708`；`preview/page.tsx`；`preview/runner.ts`。

### mybot

- `CodeEditor` 是 textarea、`<pre>` 和手写正则高亮，不能提供语法诊断、补全、格式化或真实 TypeScript 类型。
- 选择模板时，代码被替换为：

  ```tsx
  // Template name
  // Generated from the local Astryx template catalog.

  export default function Example() {
    return <TemplatePreview />;
  }
  ```

- 右侧预览通过 `templateLoaders[selectedId]()` 直接导入已经打包的 React 模块。
- 修改 textarea 只改变文本，不会改变右侧组件。
- 没有 iframe、sandbox、postMessage、编译器、错误边界通信或 Build 状态。

关键位置：`TemplatesPage.tsx:82-116, 180-199`。

**结论：当前代码编辑区是“展示源码”，不是 Playground 编辑器。**

## 3. 模板加载和目录

### 数量

mybot `manifest.json` 当前有 58 个模板条目，分类覆盖 AI Chat、Dashboard、Content、Form、Gallery、Login、Settings、Shell、Table、Tools，数量与 Astryx 发布目录大体接近。

### 关键行为差异

| 能力 | Astryx | mybot |
| --- | --- | --- |
| 模板来源 | generated template registry 中的完整 `source` 字符串 | `manifest.json` 只提供元数据；预览代码来自本地编译模块 |
| 模板进入编辑器 | 将完整 source 放入 Monaco，并去除版权头 | 放入 `TemplatePreview` 占位代码 |
| 当前编辑保护 | 加载模板前弹 `ConfirmDialog`，防止覆盖用户代码 | 选择后立即覆盖 |
| 主题 Showcase | 显式置于 Templates 首项，即使从 overview 隐藏 | 仅作为普通 manifest 项 |
| 选择排序 | 按 `category · name` 排序，保证目录稳定 | 按 manifest 原顺序 |
| 预览状态 | 由用户代码编译得出 | 由固定 import 模块得出 |

应把模板源代码作为运行时数据接入，而不是只保留已编译组件。

## 4. Theme Editor

### Astryx 的实际能力

`ThemeEditor` 有三层：

1. **Base Styles**
   - Colors、Typography、Corner Radius、Spacing、Element Size、Duration 等。
   - 支持数字输入和预设 Toggle。
   - 支持 type scale、radius scale、spacing scale、size scale、duration scale。
   - 支持 unified preset。
   - 检测并提示 token scale 是否同心/一致。
2. **Components**
   - 读取组件 token。
   - 支持按组件选择器修改值。
   - 支持任意 CSS property 自定义 override。
   - 覆盖层顺序：seeded component override → token-derived override → freeform override。
3. **Advanced**
   - 按 Colors、Spacing、Radius、Typography、Size、Elevation、Duration、Easing 分组编辑原始 token。
   - Color 有色板；Spacing/Radius/Type 有实时形状或文字预览。

每次 token/组件修改都会 `defineTheme`，然后通过 `preview-theme` 发到 iframe。

关键位置：`ThemeEditor.tsx:93-144, 150-223, 225-278`；`BaseStylesPanel.tsx`；`ComponentTokensPanel.tsx`；`RawTokensPanel.tsx`。

### mybot 当前能力

`TemplatesPage.tsx:140-160` 只有五行静态信息：

- Mode
- Accent
- Surface
- Radius
- Typography

三个 tab 都是按钮，但只有 `Theme` 显示为 active，`Components` 和 `Tokens` 无状态、无事件、无面板。Accent/Surface 是固定色块，Radius/Typography 是固定文本。没有 token 状态，也没有将主题应用到预览。

**结论：当前 Theme Editor 不能算编辑器，只是说明面板。**

## 5. 预览工具栏和交互状态

| 状态/操作 | Astryx | mybot |
| --- | --- | --- |
| 亮暗模式 | 独立于 docsite mode，推送到 iframe；自定义主题切换模式仍保留 | 只切换外层 `Theme`；预览模块可能有自己的 mode |
| Target element | Crosshair 开启 targeting，预览 DOM 标注 `data-pg-id`，点击后打开属性 badge/popover | 无 |
| Viewport | `SegmentedControl`，Desktop/Phone | 原生按钮，缺少 Astryx 控件状态样式 |
| Build 状态 | idle/building/finished/error，完成后淡出；error 可 Rebuild | 无 |
| Preview ready | iframe handshake + startup timeout | 无 |
| Share | 压缩代码写入 `#code=...`，复制 canonical URL | 只导出当前 textarea 文本文件 |
| Export | Popover 内复制 Share URL，同时输入 theme name 并下载 `defineTheme` TS 文件 | `Export` 直接下载 textarea；没有主题导出 |
| Fullscreen | 可退出，预览 iframe 不重建 | 只调用浏览器 fullscreen，没有退出按钮 |
| 模板切换保护 | `ConfirmDialog` | 无确认 |
| Loading | Monaco/iframe/编译均有明确 loading/error | 仅模板 import 时显示 Loading preview |

## 6. 移动端行为

### Astryx

- 断点：`(max-width: 768px)`。
- 顶部 `TopNav` 中显示品牌、Preview/Code/Theme 三个图标 Tab、Share。
- 同一时刻只显示一个 panel：
  - Preview：全宽、full-bleed iframe。
  - Code：全宽 Monaco。
  - Theme：全宽 ThemeEditor。
- 移动端 Code header 只保留 Format code；Themes/Templates 只在桌面显示。
- Phone 设备预览在桌面才显示固定 `402 × 874` 画布；移动设备本身直接 full-bleed。

### mybot

- 现有 CSS 只有 `@media (max-width: 900px)` 的模板列表规则，没有 `pg-root` 的移动工作区规则。
- 没有 Preview/Code/Theme 三段移动切换 Tab。
- 编辑器、模板菜单和预览工具栏不会按 Astryx 的移动约束收缩。
- 没有 full-bleed 与固定手机画布的区分。

## 7. 安全与隔离

Astryx 预览使用：

- 新 iframe generation。
- 生产环境 `sandbox="allow-scripts"`，不授予 `allow-same-origin`。
- nonce URL + `MessageChannel` handshake。
- 预览代码不能访问父页面 DOM、cookie 或 storage。
- 预览页面导航/重载后 channel 失效并触发恢复。

mybot 当前直接在主 React 树 import 并渲染模板。因为模板是仓库内可信源码，这种方式对静态模板本身可用，但不满足“用户可编辑任意 TSX 并在本地执行”的安全边界。实现可编辑 Playground 前必须先确定：

1. 是否只允许受控 Astryx 模块集合；
2. 是否采用 iframe sandbox；
3. 是否自托管 TypeScript 编译器；
4. 是否阻止用户代码访问 `/api`、父页面和 storage。

## 8. 当前阻塞和缺口清单

### P0：必须先修

1. **恢复编译**：`App.tsx:201-205` 调用 `TemplatesPage` 时缺少 `mode` 和 `onModeChange`。当前 `pnpm typecheck` 输出：

   ```text
   src/App.tsx(204,10): error TS2739:
   Type '{ onBack: () => void; }' is missing the following properties ...
   ```

2. **补齐 Playground layout CSS**：为 `pg-root`、`pg-rail`、`pg-left-panel`、`pg-right-panel`、`pg-preview-toolbar`、`pg-preview-area`、`pg-code-*` 等定义稳定尺寸、flex/grid、overflow、暗色变量和移动断点。
3. **代码与预览建立真实数据链**：不要再直接渲染 selected template module；必须让编辑器 source 经过编译后驱动预览。

### P1：核心能力

4. 接入 Monaco（或等价编辑器），补 TSX 语法、诊断、自动布局和格式化。
5. 搭建 `/playground/preview` iframe runner，使用 self-hosted TypeScript compiler。
6. 实现 `preview-code`、`preview-theme`、`preview-ready`、`preview-rendered`、`preview-error` 通信。
7. 将完整模板 source 接入 Templates 菜单，选择前显示覆盖确认。
8. 实现 ThemeEditor 三 tab、scale/preset、component overrides、raw token editor，并实时推送主题。
9. 实现 URL hash 压缩分享和 hashchange 恢复。
10. 实现 Build 状态、Rebuild、loading、compiler/runtime error。
11. 实现桌面 ResizeHandle、PreviewStage 402×874 phone、全屏退出。

### P2：完整度和体验

12. 实现 targeting overlay + property editor。
13. 主题导出 `defineTheme` 文件、分享 URL popover 和模板导出。
14. 完善移动 TopNav（三 Tab + Share）。
15. 加入键盘、焦点、ARIA、错误恢复、无障碍和视觉回归测试。

## 9. 建议的多 Agent 实施拆分

以下任务可以并行，但必须按依赖合并：

| Agent | 任务 | 依赖 | 验收 |
| --- | --- | --- | --- |
| A | `pg-*` 桌面/移动布局、Toolbar、ResizeHandle、PreviewStage CSS | P0.1 | 1440/1024/768/390 四个 viewport 不溢出，左右面板尺寸稳定 |
| B | Monaco + defaultCode + URL hash/share/format | P0.1 | 编辑 TSX 后状态、hash、编辑器值一致，格式化可用 |
| C | iframe preview runner、sandbox、postMessage、build/error/rebuild | B | 任意合法 TSX 变更实时渲染，编译错误可恢复 |
| D | ThemeEditor 三面板、token scales、component overrides、theme export | C 的消息协议 | 修改 token 后 iframe 即时变化，导出可编译 |
| E | 模板 source registry、模板菜单、覆盖确认、58 模板映射 | B/C | 选模板后编辑器显示完整 source，确认后预览真实渲染 |
| F | targeting/property editor | C | Crosshair 选中实例，修改 prop 回写 source 并重新编译 |
| G | Playwright 视觉和交互回归、无障碍检查 | A-F | 桌面/移动、暗色、全屏、错误恢复、模板切换均有证据 |

## 10. 目标验收标准

完成后 `#templates` 应满足：

- 桌面：左侧可拖拽编辑器（默认 440px），右侧实时预览填充剩余空间。
- 移动：顶部 Preview/Code/Theme 三 Tab；每个 Tab 只占满当前视口。
- 输入合法 TSX 后，400ms 内触发预览编译；预览不通过主页面执行用户代码。
- 选择 58 个模板中的任意一个，编辑器显示完整 source，而非 `TemplatePreview` 占位符。
- 主题修改至少覆盖 Base Styles、Components、Advanced 三层，并能影响预览。
- 预览工具栏具备暗色、Desktop/Phone、Fullscreen、Share、Export、Build 状态。
- 编译失败显示可理解的错误和 Rebuild，不会让页面永久停留在 Building。
- 刷新带 `#code=` 的 URL 可以恢复代码；模板/主题切换会保护未保存编辑。
- `pnpm typecheck`、`pnpm build`、Playwright 桌面/手机截图和关键交互测试全部通过。

## 11. 当前实现状态（2026-11-11）

本轮已经完成 Playground 壳层和部分交互：

- 56px icon rail、左编辑区、右预览区、工具栏、棋盘格预览舞台、Desktop/Phone
  响应式、暗色模式、全屏和 Export。
- 58 个模板完整 `.tsx` 源码通过 `import.meta.glob(..., {query: '?raw'})` 接入。
- 模板切换未保存确认、`#code=` raw-DEFLATE 分享链接读取、编辑内容 hash 同步。
- 已对照 `/home/my/workspace/ainfra/mywork/astryx` 的
  `PlaygroundClient`、`PreviewStage`、`ThemeEditor`、Monaco 和 iframe runner。

仍未达到完全复刻的关键缺口：

- 当前编辑器仍是 textarea 高亮，不是 Monaco。
- 编辑内容尚未经过 TypeScript 编译并驱动右侧预览。
- 预览仍是可信模板模块直引，不是 sandbox iframe + MessageChannel。
- Theme Editor 尚未实现 Base Styles / Components / Advanced 三层 token 编辑。
- Build 状态、Rebuild、targeting/property editor、preview-error 恢复尚未接通。

当前完成度：视觉/壳层约 75%，模板目录约 80%，实时用户 TSX 运行时仍约 0%。
已补安全最小 iframe runner：nonce + MessageChannel、ready/building/rendered/error/rebuild、
模板白名单和生产 `sandbox="allow-scripts"`；它只加载本地已生成模板，不执行编辑器
任意 TSX。后续仍需独立实现 Monaco + 自托管 TypeScript 编译器，才能达到 Astryx
Playground 的完整运行时能力。
