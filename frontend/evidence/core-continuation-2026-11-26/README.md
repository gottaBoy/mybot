# 核心研发成果接续

日期：2026-11-26，Asia/Singapore。
合同：[ADR-0028](../../../docs/decisions/ADR-0028-explicit-prior-artifact-context.md)。
本批继续用户授权的核心交付，并与此前未提交的ADR-0025/0026/0027一起提交。

## 用户可以完成的工作

任务会话保存补充要求，点“安排下一轮”，在资料步骤“选择已有成果”，
选同Task前轮报告、Diff或真实测试结果，核对正文与来源后继续模型/资源确认。
准备时冻结选中的内容，下一研究Run沿用该快照，运行中可追溯来源Run/Artifact与hash。
选择和预览不会启动模型；变更选择需重新核对，执行仍需新的同意。

限3项、单项32KiB、合计64KiB，不截断冒充完整引用。目录20项分页，只返回元数据；
空/超大成果明确不可选。不同Task、未结束Run、重复/错误hash与过期预览均拒绝。
准备后原成果变化不会改写已冻结输入。人工接受、模型成功和真实测试结论分别保留。
设备一次授权仍只启动同一个owner候选，摘要增加引用数量，没有开放正文或文件访问权。

这是把前轮成果作为下一研究Run的明确输入；没有将旧patch自动应用到新coding副本，
没有自动发送全部会话、长期记忆、任意Shell、原项目写入或部署。
更多运行时/测试profile与任务分解/依赖仍是待办。

## 运行与验证范围

- 前端全量2217项/76文件；后续191项相关合同再验通过。
- Python全量1245项通过；后补设备引用摘要/执行用例后17项专项通过。
  后者含全量之后新增的1项，不把它改写为一次1246项全量运行。
- `pnpm build`通过，保留Starlette/httpx弃用与大chunk提醒。
  最终app JS206.35kB/gzip65.68、CSS39.89/7.50；
  CodingRunDialog9.24/4.06、RunWorkspace23.09/8.77、TaskWorkspace34.16/11.34。
  相比上一批app197.45/63.19有所增加，没有宣称Bootstrap或总传输量减少。
- 专项使用`verify-coding.mjs`后在同一新fixture运行`verify-task-artifacts.mjs`；
  综合工作台使用独立新fixture。主入口另作GET-only验证。

最终报告：

- [真实编码/测试闭环](coding/verification.json)
- [明确成果引用](references/verification.json)
- [综合工作台](workbench/verification.json)
- [真实补丁](coding/actual.patch)
- [真实测试记录](coding/actual-test-attempts.json)
- [下一轮冻结的成果原文](references/frozen-references.json)

最终coding10项/15PNG、引用7项/9PNG、综合58项/61PNG，加主入口10只读，
共85浏览器检查、85最终fixturePNG；最终pageerror/外部HTTP均0。
编码与引用同一fresh fixture为`/tmp/mybot-astryx-workbench.XhArHf`，
独立综合为`/tmp/mybot-astryx-workbench.kTLpcU`。

专项重新执行mybot路径校验需求，真实基线4测试/2失败，第一次修改1失败，
第二次修改4通过。复制源文件与不变测试未被改写，导出patch只作`git apply --check`。
随后明确引用最终Diff2与真实测试2，按原prepared/execute记录继续；新研究Run保留精确原文。
编码响应使用注入fixture，研究使用FakeProvider；文件修改、隔离、测试、持久化和API都真实。
这不证明真实Codex或付费模型的生成质量/费用，也没有自动调用正式模型。

截图使用真实fixture的三style双mode、英文1440与中文390、reduced motion；
没有导出正式项目正文、凭证、环境、摘要hash或主入口截图。不是物理设备/Safari/IME认证。

## 失败保留

- `failures/tab-locator`：脚本把实际Conversation分段控件当成了Task conversation页签，
  未进入业务操作；修正为既有Task URL。
- `failures/prepared-locator`：页头和消息都有“继续确认”入口，未限定会话区域造成严格定位歧义。
- `failures/locale-init`：测试init脚本每次reload覆盖语言/主题，中文按钮等待失败。
  修正为仅初始化缺失偏好；该轮截图不作为多主题证据。
- `failures/pending-route`：未知提示会在请求等待时出现；脚本过早unroute，
  中断仍在处理的模拟丢响应handler，Node未正常退出，未产生最终JSON。
  保留控制台和已完成画面，最终改为等待拦截完成再解除。
- 视觉复查发现原turn notice采用flex把正文挤成列，补充专用纵向排版并在最终构建重验。
  失败画面和新画面分开，不把早期成功检查拼接为最终专项结果。

## 本机启用

原4180 PID940971经identity/cwd/env内存核验、空闲检查、一致备份、
私有副本Store演练和原表原列比对后，优雅更新为PID2393603。
同一命令/cwd/环境，主5173保留，`task_artifact_references=true`。
私有备份`.runtime/backups/before-devices-20261126T012355Z/`，目录700、DB/log600；
旧PID绑定脚本不可重跑，不热覆盖数据库回退。

桌面英文与中文手机共10项GET-only通过，0写请求/外部HTTP/pageerror。
浏览器后再次按原表原列比对全部原行相同：
1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event；
TaskTurns/coding_jobs/设备/执行授权为空，Workflow草稿1/version0/op0。
没有正式保存补充、引用准备、测试、模型调用或凭证读取。
原119/9/110不变。
临时4187/4188/5176/5177均已停止，主4180/5173保留。
