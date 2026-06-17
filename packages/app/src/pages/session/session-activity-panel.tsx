import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { Part, Message } from "@opencode-ai/sdk/v2/client"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useSync } from "@/context/sync"
import { sessionActivityPanelLayoutClasses } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import {
  getSessionActivity,
  filterSessionActivityItems,
  formatActivityDuration,
  type SessionActivityDetailSection,
  type SessionActivityFilter,
  type SessionActivityItem,
  type SessionActivityStatus,
} from "@/pages/session/session-activity"

const emptyMessages: Message[] = []

const statusLabel: Record<SessionActivityStatus, string> = {
  pending: "等待中",
  running: "执行中",
  completed: "已完成",
  error: "失败",
}

const statusClass: Record<SessionActivityStatus, string> = {
  pending: "bg-surface-warning-strong",
  running: "bg-surface-info-strong",
  completed: "bg-surface-success-strong",
  error: "bg-v2-state-bg-danger",
}

const filters: { value: SessionActivityFilter; label: string }[] = [
  { value: "all", label: "执行" },
  { value: "tool", label: "工具" },
  { value: "subagent", label: "子 Agent" },
]

function StatusPill(props: { status: SessionActivityStatus }) {
  return (
    <div class="inline-flex items-center gap-1.5 rounded-md border border-border-weaker-base bg-surface-base px-2 py-1">
      <div class={`size-1.5 rounded-full ${statusClass[props.status]}`} />
      <div class="text-11-medium text-text-base">{statusLabel[props.status]}</div>
    </div>
  )
}

function CountPill(props: { label: string; count: number; status: SessionActivityStatus }) {
  return (
    <Show when={props.count > 0}>
      <div class="inline-flex items-center gap-1.5 rounded-md border border-border-weaker-base bg-background-stronger px-2 py-1">
        <div class={`size-1.5 rounded-full ${statusClass[props.status]}`} />
        <div class="text-10-medium text-text-base">{props.label}</div>
        <div class="text-10-regular text-text-weak">{props.count}</div>
      </div>
    </Show>
  )
}

function TimelineItem(props: {
  item: SessionActivityItem
  duration: string
  selected: boolean
  onSelect: () => void
}) {
  const kind = () => {
    if (props.item.kind === "reasoning") return "思考"
    if (props.item.kind === "subagent") return "子 Agent"
    return "工具"
  }

  return (
    <button
      type="button"
      class="w-full text-left rounded-md border px-3 py-2 transition-colors"
      classList={{
        "border-border-base bg-surface-base": !props.selected && props.item.status !== "error",
        "border-v2-state-bg-danger/60 bg-v2-state-bg-danger/10": !props.selected && props.item.status === "error",
        "border-info-selected bg-surface-info-base/20": props.selected && props.item.status !== "error",
        "border-v2-state-bg-danger bg-v2-state-bg-danger/15": props.selected && props.item.status === "error",
      }}
      onClick={props.onSelect}
    >
      <div class="flex items-start gap-2">
        <div class={`mt-1.5 size-2 rounded-full shrink-0 ${statusClass[props.item.status]}`} />
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 truncate text-12-medium text-text-strong">{props.item.title}</div>
            <div class="shrink-0 text-10-regular text-text-weaker">{props.duration}</div>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="rounded-sm bg-surface-strong px-1.5 py-0.5 text-10-medium text-text-weak">{kind()}</div>
            <div class="min-w-0 truncate text-11-regular text-text-weak">{props.item.summary}</div>
          </div>
        </div>
      </div>
    </button>
  )
}

function DetailSection(props: { section: SessionActivityDetailSection }) {
  return (
    <div>
      <div class="text-10-medium text-text-weaker">{props.section.label}</div>
      <Show when={props.section.value}>
        {(value) => (
          <div
            class="mt-1 rounded-md px-3 py-2 text-11-regular"
            classList={{
              "bg-background-stronger text-text-base": props.section.tone !== "error",
              "bg-v2-state-bg-danger/10 text-text-danger-base": props.section.tone === "error",
            }}
          >
            {value()}
          </div>
        )}
      </Show>
      <Show when={props.section.code}>
        {(code) => (
          <pre
            class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md px-3 py-2 font-mono text-11-regular"
            classList={{
              "bg-background-stronger text-text-base": props.section.tone !== "error",
              "bg-v2-state-bg-danger/10 text-text-danger-base": props.section.tone === "error",
            }}
          >
            {code()}
          </pre>
        )}
      </Show>
    </div>
  )
}

function copyError(value: string | undefined) {
  if (!value) return
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
  if (!clipboard?.writeText) return
  void clipboard.writeText(value).then(
    () => undefined,
    () => undefined,
  )
}

function Detail(props: { item: SessionActivityItem | undefined }) {
  return (
    <div class="rounded-md border border-border-weaker-base bg-surface-base">
      <Show
        when={props.item}
        fallback={<div class="px-3 py-3 text-12-regular text-text-weak">选择一条执行记录查看详情</div>}
      >
        {(item) => (
          <div class="flex flex-col">
            <div class="flex items-center justify-between gap-3 border-b border-border-weaker-base px-3 py-2">
              <div class="min-w-0 truncate text-12-medium text-text-strong">{item().title}</div>
              <div class="flex shrink-0 items-center gap-2">
                <Show when={item().errorText}>
                  {(errorText) => (
                    <button
                      type="button"
                      class="rounded-md border border-border-weaker-base bg-background-stronger px-2 py-1 text-11-medium text-text-base transition-colors hover:bg-surface-strong"
                      onClick={() => copyError(errorText())}
                    >
                      复制错误
                    </button>
                  )}
                </Show>
                <StatusPill status={item().status} />
              </div>
            </div>
            <div class="px-3 py-3">
              <Show
                when={item().detailSections.length > 0}
                fallback={
                  <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-stronger px-3 py-2 font-mono text-11-regular text-text-base">
                    {item().detail || item().summary}
                  </pre>
                }
              >
                <div class="flex flex-col gap-3">
                  <For each={item().detailSections}>{(section) => <DetailSection section={section} />}</For>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

export function SessionActivityPanel() {
  const sync = useSync()
  const { params } = useSessionLayout()
  const [selected, setSelected] = createSignal<string>()
  const [filter, setFilter] = createSignal<SessionActivityFilter>("all")
  const [now, setNow] = createSignal(Date.now())
  const layoutClasses = sessionActivityPanelLayoutClasses()

  const messages = createMemo(
    () => {
      const id = params.id
      if (!id) return emptyMessages
      return (sync().data.message[id] ?? emptyMessages) as Message[]
    },
    emptyMessages,
  )
  const activity = createMemo(() =>
    getSessionActivity({
      messages: messages(),
      parts: sync().data.part as Record<string, Part[] | undefined>,
    }),
  )
  const items = createMemo(() => filterSessionActivityItems(activity().items, filter()))
  const displayDuration = (item: SessionActivityItem) => {
    if (item.durationMs !== undefined) return formatActivityDuration(item.durationMs)
    if (item.startedAt !== undefined) return formatActivityDuration(Math.max(0, now() - item.startedAt))
    return "—"
  }
  const current = createMemo(() => {
    const id = selected()
    if (id) return items().find((item) => item.id === id)
    return items().findLast((item) => item.status === "running" || item.status === "error") ?? items().at(-1)
  })

  createEffect(() => {
    const item = current()
    setSelected(item?.id)
  })

  createEffect(() => {
    if (activity().summary.runningCount === 0 && activity().summary.pendingCount === 0) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <div class={layoutClasses.root}>
      <div class={layoutClasses.fixed}>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-13-medium text-text-strong">执行观察</div>
            <div class="mt-0.5 text-11-regular text-text-weak">AI 调用、思考摘要、子 Agent</div>
          </div>
          <StatusPill status={activity().summary.status} />
        </div>

        <div class="rounded-md border border-border-weaker-base bg-surface-base px-3 py-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="text-10-regular text-text-weaker">Agent</div>
              <div class="mt-1 truncate text-12-medium text-text-strong">{activity().summary.agent ?? "—"}</div>
            </div>
            <div>
              <div class="text-10-regular text-text-weaker">Model</div>
              <div class="mt-1 truncate text-12-medium text-text-strong">{activity().summary.model ?? "—"}</div>
            </div>
            <div>
              <div class="text-10-regular text-text-weaker">工具</div>
              <div class="mt-1 text-12-medium text-text-strong">{activity().summary.toolCount}</div>
            </div>
            <div>
              <div class="text-10-regular text-text-weaker">耗时</div>
              <div class="mt-1 text-12-medium text-text-strong">
                {formatActivityDuration(activity().summary.elapsedMs)}
              </div>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <CountPill label="运行中" count={activity().summary.runningCount} status="running" />
            <CountPill label="失败" count={activity().summary.errorCount} status="error" />
            <CountPill label="已完成" count={activity().summary.completedCount} status="completed" />
            <CountPill label="等待中" count={activity().summary.pendingCount} status="pending" />
          </div>
        </div>

        <div class="flex rounded-md border border-border-weaker-base bg-surface-base p-1">
          <For each={filters}>
            {(item) => (
              <button
                type="button"
                class="flex-1 rounded px-2 py-1 text-center transition-colors"
                classList={{
                  "bg-background-stronger text-11-medium text-text-strong": filter() === item.value,
                  "text-11-regular text-text-weak hover:text-text-base": filter() !== item.value,
                }}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter() === item.value}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <ScrollView class={layoutClasses.body}>
        <div class={layoutClasses.bodyContent}>
          <Show
            when={items().length > 0}
            fallback={
              <div class="rounded-md border border-border-weaker-base bg-surface-base px-3 py-8 text-center text-12-regular text-text-weak">
                {activity().items.length > 0 ? "当前分类没有可展示的执行记录" : "当前会话还没有可展示的执行记录"}
              </div>
            }
          >
            <div class="flex flex-col gap-2">
              <For each={items()}>
                {(item) => (
                  <TimelineItem
                    item={item}
                    duration={displayDuration(item)}
                    selected={selected() === item.id}
                    onSelect={() => setSelected(item.id)}
                  />
                )}
              </For>
            </div>
          </Show>

          <Detail item={current()} />
        </div>
      </ScrollView>
    </div>
  )
}
