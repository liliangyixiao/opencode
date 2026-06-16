# 执行观察增强设计

## 目标

增强会话执行观察面板，让用户能快速理解 Agent 正在做什么、哪里失败、每个工具调用具体代表什么。本轮只使用前端现有的 `Message` 和 `Part` 数据，不修改后端协议、SDK 类型或同步行为。

## 当前状态

执行观察面板已经能展示 reasoning、工具调用和 task/subagent 调用，并支持分类过滤、选中执行项、查看详情和调整侧边栏宽度。当前详情视图主要是原始 JSON 加输出文本，标题栏按钮只表达面板是否打开。

## 范围

本轮新增：

- 运行中执行项的实时耗时显示。
- 运行中、失败、已完成、等待中执行项数量统计。
- 常见工具的可读详情分区：`bash`、`read`、`grep`、`apply_patch`、`task`。
- 更明显的失败项样式和复制错误操作。
- 标题栏执行观察按钮根据当前会话 activity 状态展示状态，失败优先于运行中。
- 覆盖状态计数、错误提取和工具详情模型的单元测试。

本轮不新增搜索、Markdown 导出、主时间线联动、后端字段、SDK schema 变更或嵌套子 Agent 执行树。

## 数据模型

`packages/app/src/pages/session/session-activity.ts` 继续作为 SDK 数据到 UI 友好 activity 数据的转换边界。

`SessionActivitySummary` 扩展状态计数：

- `runningCount`
- `errorCount`
- `completedCount`
- `pendingCount`

`SessionActivityItem` 扩展可选结构化详情数据：

- `detailSections`：有序详情分区，包含 `label`、可选 `value`、可选 `code` 和可选 `tone`。
- `errorText`：失败项的标准化错误文本。
- `startedAt`：可用时记录开始时间戳。
- `endedAt`：可用时记录结束时间戳。

现有 `detail` 字符串保留，作为未知工具和面板兼容展示的 fallback。

## 工具详情映射

映射逻辑会检查 `ToolPart.state.input`、不同状态下的输出字段和工具名。

`bash` 详情分区：

- 命令：来自 `input.command`。
- 工作目录：来自 `input.cwd` 或同等字段。
- 输出：来自完成状态的输出。
- 错误：来自失败状态的错误文本。

`read` 详情分区：

- 文件路径：来自常见路径字段，如 `filePath`、`path` 或 `file`。
- 读取范围：来自 `offset`、`limit` 等字段。
- 输出或 fallback 详情文本。

`grep` 详情分区：

- 搜索词：来自 `input.pattern`。
- 搜索路径：来自 `input.path`。
- 文件过滤：来自 `input.include`。
- 输出文本。

`apply_patch` 详情分区：

- Patch 内容：来自 input 或 raw/detail 文本。
- 修改文件摘要：尽量从 patch header 中解析。
- 失败时显示错误文本。

`task` 详情分区：

- 子 Agent 描述。
- Prompt。
- 输出或错误。

未知工具保留通用 input/output/error 分区，确保每条执行项都有可用详情视图。

## UI 行为

执行观察摘要保留现有 Agent、Model、工具数和总耗时，并增加运行中、失败、已完成、等待中的紧凑计数标签。为降低噪音，计数为 0 的标签可以隐藏。

运行中执行项显示实时耗时。面板挂载时可以使用轻量 interval signal 刷新展示。已完成和失败项使用 activity model 中固定的 `durationMs`。

失败项在时间线和详情面板中使用更明显的视觉强调。详情面板在存在 `errorText` 时显示复制错误按钮。复制失败可以静默忽略，也可以复用附近已有 toast 模式；不引入新的全局错误系统。

标题栏执行观察按钮使用同一份前端数据计算当前会话 activity summary。tooltip 展示简短状态，例如 `执行观察：1 个运行中，1 个失败`。失败状态优先于运行中状态。没有失败也没有运行中时，保持当前打开/关闭按钮行为。

## 文件

预计修改文件：

- `packages/app/src/pages/session/session-activity.ts`
- `packages/app/src/pages/session/session-activity-panel.tsx`
- `packages/app/src/pages/session/session-activity.test.ts`
- `packages/app/src/components/session/session-header.tsx`

如果布局相关逻辑发生变化，可以补充 helper 测试，但本轮不计划做布局重构。

## 测试

在 `packages/app` 运行定向测试：

```sh
bun test src/pages/session/session-activity.test.ts src/pages/session/helpers.test.ts
```

在 `packages/app` 运行类型检查：

```sh
bun typecheck
```

如果实现后需要桌面端打包，单独执行既有生产打包流程。

## 验收标准

- 面板打开时，运行中执行项展示实时耗时。
- 摘要区展示从当前 activity items 派生的状态计数。
- 常见工具渲染可读详情分区，而不是只显示原始 JSON。
- 失败项暴露标准化错误文本，并提供复制错误操作。
- 标题栏执行观察按钮能表达当前会话失败或运行中状态。
- 现有 activity 分类过滤继续可用。
- 定向测试和 app 类型检查通过。
