import type { AssistantMessage, Message, Part, ToolPart } from "@opencode-ai/sdk/v2/client"

export type SessionActivityStatus = "pending" | "running" | "completed" | "error"
export type SessionActivityKind = "reasoning" | "tool" | "subagent"
export type SessionActivityFilter = "all" | "tool" | "subagent"

export type SessionActivityItem = {
  id: string
  kind: SessionActivityKind
  status: SessionActivityStatus
  title: string
  summary: string
  detail?: string
  durationMs?: number
  agent?: string
}

export type SessionActivitySummary = {
  agent?: string
  model?: string
  status: SessionActivityStatus
  toolCount: number
  subagentCount: number
  reasoningCount: number
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

  return {
    summary: {
      agent: lastAssistant?.agent,
      model: lastAssistant ? `${lastAssistant.providerID}/${lastAssistant.modelID}` : undefined,
      status: errored ? "error" : running ? "running" : "completed",
      toolCount: items.filter((item) => item.kind === "tool").length,
      subagentCount: items.filter((item) => item.kind === "subagent").length,
      reasoningCount: items.filter((item) => item.kind === "reasoning").length,
      elapsedMs: firstStart && lastEnd ? lastEnd - firstStart : undefined,
    },
    items,
  }
}

export function filterSessionActivityItems(items: SessionActivityItem[], filter: SessionActivityFilter) {
  if (filter === "all") return items
  return items.filter((item) => item.kind === filter)
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
        durationMs: part.time.end ? part.time.end - part.time.start : undefined,
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
  if (part.tool === "task") {
    return {
      id: part.id,
      kind: "subagent",
      status: part.state.status,
      title: toolTitle(part, "子 Agent"),
      summary: toolSummary(part),
      detail: toolDetail(part, input),
      durationMs: toolDuration(part),
    }
  }

  return {
    id: part.id,
    kind: "tool",
    status: part.state.status,
    title: toolTitle(part, `工具: ${part.tool}`),
    summary: toolSummary(part),
    detail: toolDetail(part, input),
    durationMs: toolDuration(part),
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
