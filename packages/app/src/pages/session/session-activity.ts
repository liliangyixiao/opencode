import type { AssistantMessage, Message, Part, ToolPart } from "@opencode-ai/sdk/v2/client"

export type SessionActivityStatus = "pending" | "running" | "completed" | "error"
export type SessionActivityKind = "reasoning" | "tool" | "subagent"
export type SessionActivityFilter = "all" | "tool" | "subagent"
export type SessionActivityDetailTone = "default" | "error"

export type SessionActivityDetailSection = {
  label: string
  value?: string
  code?: string
  tone?: SessionActivityDetailTone
}

export type SessionActivityItem = {
  id: string
  kind: SessionActivityKind
  status: SessionActivityStatus
  title: string
  summary: string
  detail?: string
  detailSections: SessionActivityDetailSection[]
  errorText?: string
  durationMs?: number
  startedAt?: number
  endedAt?: number
  agent?: string
}

export type SessionActivitySummary = {
  agent?: string
  model?: string
  status: SessionActivityStatus
  toolCount: number
  subagentCount: number
  reasoningCount: number
  pendingCount: number
  runningCount: number
  completedCount: number
  errorCount: number
  elapsedMs?: number
}

export type SessionActivity = {
  summary: SessionActivitySummary
  items: SessionActivityItem[]
}

export function getSessionActivity(input: {
  messages: Message[]
  parts: Record<string, Part[] | undefined>
}): SessionActivity {
  const items = input.messages.flatMap((message) =>
    (input.parts[message.id] ?? []).flatMap((part) => itemFromPart(message, part)),
  )
  const lastAssistant = input.messages.findLast((message): message is AssistantMessage => message.role === "assistant")
  const running = items.some((item) => item.status === "running" || item.status === "pending")
  const errored = items.some((item) => item.status === "error")
  const firstStart = firstActivityTime(input.messages, input.parts)
  const lastEnd = lastActivityTime(input.messages, input.parts)
  const pendingCount = items.filter((item) => item.status === "pending").length
  const runningCount = items.filter((item) => item.status === "running").length
  const completedCount = items.filter((item) => item.status === "completed").length
  const errorCount = items.filter((item) => item.status === "error").length

  return {
    summary: {
      agent: lastAssistant?.agent,
      model: lastAssistant ? `${lastAssistant.providerID}/${lastAssistant.modelID}` : undefined,
      status: errored ? "error" : running ? "running" : "completed",
      toolCount: items.filter((item) => item.kind === "tool").length,
      subagentCount: items.filter((item) => item.kind === "subagent").length,
      reasoningCount: items.filter((item) => item.kind === "reasoning").length,
      pendingCount,
      runningCount,
      completedCount,
      errorCount,
      elapsedMs: firstStart && lastEnd ? lastEnd - firstStart : undefined,
    },
    items,
  }
}

export function filterSessionActivityItems(items: SessionActivityItem[], filter: SessionActivityFilter) {
  if (filter === "all") return items
  return items.filter((item) => item.kind === filter)
}

export function formatActivityDuration(ms: number | undefined) {
  if (ms === undefined) return "—"
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function itemFromPart(message: Message, part: Part): SessionActivityItem[] {
  if (part.type === "reasoning") {
    return [
      {
        id: part.id,
        kind: "reasoning",
        status: part.time.end ? "completed" : "running",
        title: "思考摘要",
        summary: firstLine(part.text) || "正在整理下一步操作",
        detail: part.text,
        detailSections: optionalSection({ label: "思考", code: part.text }),
        durationMs: part.time.end ? part.time.end - part.time.start : undefined,
        startedAt: part.time.start,
        endedAt: part.time.end,
        agent: message.role === "assistant" ? message.agent : undefined,
      },
    ]
  }

  if (part.type === "subtask") {
    return [
      {
        id: part.id,
        kind: "subagent",
        status: "pending",
        title: `子 Agent: ${part.agent}`,
        summary: part.description || firstLine(part.prompt) || "等待子任务执行",
        detail: part.prompt,
        detailSections: [
          ...optionalSection({ label: "描述", value: part.description }),
          ...optionalSection({ label: "Prompt", code: part.prompt }),
        ],
        agent: part.agent,
      },
    ]
  }

  if (part.type !== "tool") return []

  const item = toolItem(part)
  return [{ ...item, agent: message.role === "assistant" ? message.agent : item.agent }]
}

function toolItem(part: ToolPart): SessionActivityItem {
  const input = JSON.stringify(part.state.input, null, 2)
  const detail = toolDetail(part, input)
  const times = toolTimes(part)
  if (part.tool === "task") {
    return {
      id: part.id,
      kind: "subagent",
      status: part.state.status,
      title: toolTitle(part, "子 Agent"),
      summary: toolSummary(part),
      detail,
      detailSections: toolDetailSections(part, detail),
      errorText: toolErrorText(part),
      durationMs: toolDuration(part),
      ...times,
    }
  }

  return {
    id: part.id,
    kind: "tool",
    status: part.state.status,
    title: toolTitle(part, `工具: ${part.tool}`),
    summary: toolSummary(part),
    detail,
    detailSections: toolDetailSections(part, detail),
    errorText: toolErrorText(part),
    durationMs: toolDuration(part),
    ...times,
  }
}

function toolTitle(part: ToolPart, fallback: string) {
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return fallback
}

function toolSummary(part: ToolPart) {
  if (part.state.status === "pending") return firstLine(part.state.raw) || "等待工具输入"
  if (part.state.status === "running") return "正在执行"
  if (part.state.status === "error") return firstLine(part.state.error) || "执行失败"
  return firstLine(part.state.output) || "执行完成"
}

function toolDetail(part: ToolPart, input: string) {
  if (part.state.status === "pending") return [input, part.state.raw].filter(Boolean).join("\n\n")
  if (part.state.status === "running") return input
  if (part.state.status === "error") return [input, part.state.error].filter(Boolean).join("\n\n")
  return [input, part.state.output].filter(Boolean).join("\n\n")
}

function toolDuration(part: ToolPart) {
  if (part.state.status !== "completed" && part.state.status !== "error") return
  return part.state.time.end - part.state.time.start
}

function stringField(input: unknown, keys: string[]) {
  if (!input || typeof input !== "object") return
  return keys
    .map((key) => (input as Record<string, unknown>)[key])
    .find((value): value is string => typeof value === "string" && value.length > 0)
}

function optionalSection(section: SessionActivityDetailSection) {
  if (!section.value && !section.code) return []
  return [section]
}

function statusOutput(part: ToolPart) {
  if (part.state.status === "pending") return undefined
  if (part.state.status === "running") return undefined
  if (part.state.status === "error") return part.state.error
  return part.state.output
}

function toolErrorText(part: ToolPart) {
  if (part.state.status !== "error") return
  return firstLine(part.state.error) ? part.state.error : "执行失败"
}

function toolTimes(part: ToolPart) {
  if (part.state.status === "pending") return {}
  if (part.state.status === "running") return { startedAt: part.state.time.start }
  return { startedAt: part.state.time.start, endedAt: part.state.time.end }
}

function jsonSection(input: unknown) {
  if (!input || typeof input !== "object" || Object.keys(input).length === 0) return []
  return [
    {
      label: "输入",
      code: JSON.stringify(input, null, 2),
    },
  ]
}

function outputSection(part: ToolPart) {
  const output = statusOutput(part)
  if (!output) return []
  return [
    {
      label: part.state.status === "error" ? "错误" : "输出",
      code: output,
      tone: part.state.status === "error" ? ("error" as const) : undefined,
    },
  ]
}

function patchText(input: unknown, detail: string) {
  return stringField(input, ["patchText", "patch", "content"]) ?? detail
}

function changedFilesFromPatch(value: string) {
  return [
    ...new Set(
      value
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .flatMap((line) => {
          const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/)
          return match?.[1] ? [match[1]] : []
        }),
    ),
  ].join(", ")
}

function toolDetailSections(part: ToolPart, detail: string): SessionActivityDetailSection[] {
  const input = part.state.input
  if (part.tool === "bash") {
    return [
      ...optionalSection({ label: "命令", code: stringField(input, ["command"]) }),
      ...optionalSection({ label: "工作目录", value: stringField(input, ["cwd", "workdir", "workingDirectory"]) }),
      ...outputSection(part),
    ]
  }

  if (part.tool === "read") {
    return [
      ...optionalSection({ label: "文件", value: stringField(input, ["filePath", "path", "file"]) }),
      ...optionalSection({ label: "范围", value: readRange(input) }),
      ...outputSection(part),
    ]
  }

  if (part.tool === "grep") {
    return [
      ...optionalSection({ label: "搜索词", code: stringField(input, ["pattern", "query"]) }),
      ...optionalSection({ label: "路径", value: stringField(input, ["path", "cwd"]) }),
      ...optionalSection({ label: "文件过滤", value: stringField(input, ["include", "glob"]) }),
      ...outputSection(part),
    ]
  }

  if (part.tool === "apply_patch") {
    const patch = patchText(input, detail)
    return [
      ...optionalSection({ label: "修改文件", value: changedFilesFromPatch(patch) }),
      ...optionalSection({ label: "Patch", code: patch }),
      ...outputSection(part),
    ]
  }

  if (part.tool === "task") {
    return [
      ...optionalSection({ label: "子 Agent", value: stringField(input, ["subagent_type", "agent"]) }),
      ...optionalSection({ label: "描述", value: stringField(input, ["description"]) }),
      ...optionalSection({ label: "Prompt", code: stringField(input, ["prompt"]) }),
      ...outputSection(part),
    ]
  }

  return [...jsonSection(input), ...outputSection(part)]
}

function readRange(input: unknown) {
  if (!input || typeof input !== "object") return
  const record = input as Record<string, unknown>
  const offset = typeof record.offset === "number" ? record.offset : undefined
  const limit = typeof record.limit === "number" ? record.limit : undefined
  if (offset === undefined && limit === undefined) return
  return [`offset ${offset ?? 0}`, limit === undefined ? undefined : `limit ${limit}`].filter(Boolean).join(", ")
}

function firstLine(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
}

function firstActivityTime(messages: Message[], parts: Record<string, Part[] | undefined>) {
  return messages
    .flatMap((message) => (parts[message.id] ?? []).flatMap(partStart))
    .sort((a, b) => a - b)[0]
}

function lastActivityTime(messages: Message[], parts: Record<string, Part[] | undefined>) {
  return messages
    .flatMap((message) => (parts[message.id] ?? []).flatMap(partEnd))
    .sort((a, b) => b - a)[0]
}

function partStart(part: Part) {
  if (part.type === "reasoning") return [part.time.start]
  if (part.type !== "tool") return []
  if (part.state.status === "pending") return []
  return [part.state.time.start]
}

function partEnd(part: Part) {
  if (part.type === "reasoning") return [part.time.end ?? part.time.start]
  if (part.type !== "tool") return []
  if (part.state.status === "pending") return []
  if (part.state.status === "running") return [part.state.time.start]
  return [part.state.time.end]
}
