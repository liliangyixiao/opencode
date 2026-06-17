# Session Activity Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the session activity panel into a readable real-time execution monitor using only existing frontend `Message` and `Part` data.

**Architecture:** Keep `session-activity.ts` as the only data-modeling boundary. UI files consume structured activity items and summaries without parsing raw SDK fields. Header state and panel state are derived from the same activity model so behavior stays consistent.

**Tech Stack:** SolidJS, TypeScript, Bun test, existing app UI primitives, existing SDK `Message` and `Part` types.

---

## File Structure

- Modify `packages/app/src/pages/session/session-activity.ts`: extend activity item and summary types, create structured detail sections, normalize error text, expose display helpers.
- Modify `packages/app/src/pages/session/session-activity.test.ts`: add tests for status counts, tool detail sections, error text, and running timestamps.
- Modify `packages/app/src/pages/session/session-activity-panel.tsx`: render live durations, status count pills, structured details, failed styling, and copy-error action.
- Modify `packages/app/src/components/session/session-header.tsx`: compute current activity summary and reflect failed/running state in the activity button tooltip and icon state.
- No backend, SDK, desktop main-process, or sync-layer files should change.

---

### Task 1: Extend Activity Model

**Files:**
- Modify: `packages/app/src/pages/session/session-activity.ts`
- Test: `packages/app/src/pages/session/session-activity.test.ts`

- [ ] **Step 1: Add failing tests for summary counts and readable tool details**

Append these tests inside the existing `describe("getSessionActivity", () => { ... })` block in `packages/app/src/pages/session/session-activity.test.ts`:

```ts
  test("counts items by status", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "pending1",
          type: "tool",
          tool: "bash",
          state: {
            status: "pending",
            input: { command: "bun test" },
            raw: "waiting",
          },
        },
        {
          id: "running1",
          type: "tool",
          tool: "bash",
          state: {
            status: "running",
            input: { command: "bun typecheck" },
            time: { start: 100 },
          },
        },
        {
          id: "done1",
          type: "tool",
          tool: "read",
          state: {
            status: "completed",
            input: { filePath: "src/index.ts" },
            output: "export {}",
            time: { start: 200, end: 240 },
          },
        },
        {
          id: "failed1",
          type: "tool",
          tool: "grep",
          state: {
            status: "error",
            input: { pattern: "SessionActivity" },
            error: "no matches",
            time: { start: 300, end: 310 },
          },
        },
      ] as unknown as Part[],
    }

    const activity = getSessionActivity({ messages, parts })

    expect(activity.summary.pendingCount).toBe(1)
    expect(activity.summary.runningCount).toBe(1)
    expect(activity.summary.completedCount).toBe(1)
    expect(activity.summary.errorCount).toBe(1)
    expect(activity.summary.status).toBe("error")
  })

  test("creates readable detail sections for common tools", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "bash1",
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "bun test", cwd: "/repo/packages/app" },
            output: "18 pass",
            time: { start: 10, end: 20 },
          },
        },
        {
          id: "patch1",
          type: "tool",
          tool: "apply_patch",
          state: {
            status: "completed",
            input: {
              patchText:
                "*** Begin Patch\n*** Update File: packages/app/src/pages/session/session-activity.ts\n@@\n-old\n+new\n*** End Patch",
            },
            output: "Success",
            time: { start: 30, end: 40 },
          },
        },
      ] as unknown as Part[],
    }

    const activity = getSessionActivity({ messages, parts })
    const bash = activity.items.find((item) => item.id === "bash1")
    const patch = activity.items.find((item) => item.id === "patch1")

    expect(bash?.detailSections.map((section) => section.label)).toEqual(["命令", "工作目录", "输出"])
    expect(bash?.detailSections[0]?.code).toBe("bun test")
    expect(bash?.detailSections[1]?.value).toBe("/repo/packages/app")
    expect(patch?.detailSections.some((section) => section.label === "修改文件")).toBe(true)
    expect(patch?.detailSections.find((section) => section.label === "修改文件")?.value).toBe(
      "packages/app/src/pages/session/session-activity.ts",
    )
  })

  test("stores normalized error text and timestamps", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "failed1",
          type: "tool",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun typecheck" },
            error: "exit code 1\nType error",
            time: { start: 30, end: 45 },
          },
        },
      ] as unknown as Part[],
    }

    const activity = getSessionActivity({ messages, parts })

    expect(activity.items[0]?.errorText).toBe("exit code 1\nType error")
    expect(activity.items[0]?.startedAt).toBe(30)
    expect(activity.items[0]?.endedAt).toBe(45)
    expect(activity.items[0]?.durationMs).toBe(15)
  })
```

- [ ] **Step 2: Run tests and verify they fail**

Run from `packages/app`:

```sh
bun test src/pages/session/session-activity.test.ts
```

Expected: FAIL because `pendingCount`, `runningCount`, `completedCount`, `errorCount`, `detailSections`, `errorText`, `startedAt`, and `endedAt` do not exist yet.

- [ ] **Step 3: Extend exported activity types**

In `packages/app/src/pages/session/session-activity.ts`, replace the top type definitions with this shape:

```ts
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
```

- [ ] **Step 4: Add status counts to `getSessionActivity`**

Inside `getSessionActivity`, add these count expressions before the return:

```ts
  const pendingCount = items.filter((item) => item.status === "pending").length
  const runningCount = items.filter((item) => item.status === "running").length
  const completedCount = items.filter((item) => item.status === "completed").length
  const errorCount = items.filter((item) => item.status === "error").length
```

Then include the four counts in `summary`:

```ts
      pendingCount,
      runningCount,
      completedCount,
      errorCount,
```

- [ ] **Step 5: Add detail-section helpers**

Add these helpers below `toolDuration` in `packages/app/src/pages/session/session-activity.ts`:

```ts
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
  if (part.state.status === "pending") return part.state.raw
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
  return {
    label: "输入",
    code: JSON.stringify(input, null, 2),
  }
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
```

- [ ] **Step 6: Add tool-specific detail mapper**

Add this helper below `changedFilesFromPatch`:

```ts
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

  return [jsonSection(input), ...outputSection(part)]
}

function readRange(input: unknown) {
  if (!input || typeof input !== "object") return
  const record = input as Record<string, unknown>
  const offset = typeof record.offset === "number" ? record.offset : undefined
  const limit = typeof record.limit === "number" ? record.limit : undefined
  if (offset === undefined && limit === undefined) return
  return [`offset ${offset ?? 0}`, limit === undefined ? undefined : `limit ${limit}`].filter(Boolean).join(", ")
}
```

- [ ] **Step 7: Wire structured details into reasoning, subtask, and tools**

Update the reasoning item in `itemFromPart` to include timestamps and detail sections:

```ts
        detailSections: optionalSection({ label: "思考", code: part.text }),
        startedAt: part.time.start,
        endedAt: part.time.end,
```

Update the subtask item to include detail sections:

```ts
        detailSections: [
          ...optionalSection({ label: "描述", value: part.description }),
          ...optionalSection({ label: "Prompt", code: part.prompt }),
        ],
```

Inside `toolItem`, compute reusable values at the top:

```ts
  const input = JSON.stringify(part.state.input, null, 2)
  const detail = toolDetail(part, input)
  const times = toolTimes(part)
```

For both `task` and regular tool return objects, include:

```ts
      detail,
      detailSections: toolDetailSections(part, detail),
      errorText: toolErrorText(part),
      durationMs: toolDuration(part),
      ...times,
```

Remove the old direct `detail: toolDetail(part, input)` and duplicate `durationMs` properties from those return objects.

- [ ] **Step 8: Run model tests and verify they pass**

Run from `packages/app`:

```sh
bun test src/pages/session/session-activity.test.ts
```

Expected: PASS with all tests in `session-activity.test.ts` passing.

- [ ] **Step 9: Commit Task 1**

Run from repo root:

```sh
git add packages/app/src/pages/session/session-activity.ts packages/app/src/pages/session/session-activity.test.ts
git commit -m "feat(app): 增强执行观察数据模型"
```

---

### Task 2: Render Enhanced Activity Panel

**Files:**
- Modify: `packages/app/src/pages/session/session-activity-panel.tsx`
- Test: `packages/app/src/pages/session/session-activity.test.ts`

- [ ] **Step 1: Add a test for duration formatting helper if it is exported**

If `formatActivityDuration` is moved into `session-activity.ts`, add this import in `session-activity.test.ts`:

```ts
import { filterSessionActivityItems, formatActivityDuration, getSessionActivity } from "./session-activity"
```

Add this test outside the `describe("getSessionActivity", ...)` block:

```ts
describe("formatActivityDuration", () => {
  test("formats empty, millisecond, second, and minute durations", () => {
    expect(formatActivityDuration(undefined)).toBe("—")
    expect(formatActivityDuration(42)).toBe("42ms")
    expect(formatActivityDuration(1200)).toBe("1.2s")
    expect(formatActivityDuration(65_000)).toBe("1m 5s")
  })
})
```

- [ ] **Step 2: Run duration test and verify it fails**

Run from `packages/app`:

```sh
bun test src/pages/session/session-activity.test.ts
```

Expected: FAIL because `formatActivityDuration` is not exported yet.

- [ ] **Step 3: Export shared duration formatter**

Move the current `formatDuration` implementation from `session-activity-panel.tsx` into `session-activity.ts` as:

```ts
export function formatActivityDuration(ms: number | undefined) {
  if (ms === undefined) return "—"
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}
```

Update `session-activity-panel.tsx` imports to include `formatActivityDuration`, and remove the local `formatDuration` function.

- [ ] **Step 4: Add live clock in the panel**

In `SessionActivityPanel`, add a signal and interval:

```ts
  const [now, setNow] = createSignal(Date.now())

  createEffect(() => {
    const hasRunning = activity().summary.runningCount > 0 || activity().summary.pendingCount > 0
    if (!hasRunning) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => window.clearInterval(timer))
  })
```

Update the Solid import:

```ts
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
```

- [ ] **Step 5: Add display duration helper inside panel**

Add this helper inside `SessionActivityPanel`, before `return`:

```ts
  const displayDuration = (item: SessionActivityItem) => {
    if (item.durationMs !== undefined) return formatActivityDuration(item.durationMs)
    if (item.startedAt === undefined) return formatActivityDuration(undefined)
    return formatActivityDuration(Math.max(0, now() - item.startedAt))
  }
```

Pass it to timeline items:

```tsx
<TimelineItem
  item={item}
  duration={displayDuration(item)}
  selected={selected() === item.id}
  onSelect={() => setSelected(item.id)}
/>
```

Update `TimelineItem` props:

```ts
function TimelineItem(props: {
  item: SessionActivityItem
  duration: string
  selected: boolean
  onSelect: () => void
}) {
```

Replace the duration rendering with:

```tsx
<div class="shrink-0 text-10-regular text-text-weaker">{props.duration}</div>
```

- [ ] **Step 6: Render status count pills**

Add this component below `StatusPill`:

```tsx
function CountPill(props: { label: string; count: number; tone?: SessionActivityStatus }) {
  return (
    <Show when={props.count > 0}>
      <div class="inline-flex items-center gap-1.5 rounded-md border border-border-weaker-base bg-surface-base px-2 py-1">
        <Show when={props.tone}>
          {(tone) => <div class={`size-1.5 rounded-full ${statusClass[tone()]}`} />}
        </Show>
        <div class="text-10-medium text-text-base">
          {props.label} {props.count}
        </div>
      </div>
    </Show>
  )
}
```

After the summary grid block, render count pills:

```tsx
<div class="mt-3 flex flex-wrap gap-2">
  <CountPill label="运行中" count={activity().summary.runningCount} tone="running" />
  <CountPill label="失败" count={activity().summary.errorCount} tone="error" />
  <CountPill label="已完成" count={activity().summary.completedCount} tone="completed" />
  <CountPill label="等待中" count={activity().summary.pendingCount} tone="pending" />
</div>
```

- [ ] **Step 7: Render failed item emphasis**

In `TimelineItem`, extend `classList`:

```tsx
        "border-v2-state-border-danger bg-v2-state-bg-danger/10": props.item.status === "error" && !props.selected,
```

Keep the selected style stronger than the default by leaving the existing selected branch in place.

- [ ] **Step 8: Render structured details and copy-error button**

Replace the `Detail` component with this version:

```tsx
function Detail(props: { item: SessionActivityItem | undefined }) {
  const copyError = () => {
    const error = props.item?.errorText
    if (!error) return
    void navigator.clipboard.writeText(error)
  }

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
              <div class="flex items-center gap-2">
                <Show when={item().errorText}>
                  <button
                    type="button"
                    class="rounded-md border border-border-weaker-base px-2 py-1 text-10-medium text-text-base hover:bg-surface-strong"
                    onClick={copyError}
                  >
                    复制错误
                  </button>
                </Show>
                <StatusPill status={item().status} />
              </div>
            </div>
            <div class="flex flex-col gap-3 px-3 py-3">
              <For each={item().detailSections.length > 0 ? item().detailSections : [{ label: "详情", code: item().detail || item().summary }]}>
                {(section) => (
                  <div>
                    <div class="mb-1 text-10-medium text-text-weaker">{section.label}</div>
                    <Show when={section.value}>
                      {(value) => <div class="text-12-regular text-text-base break-words">{value()}</div>}
                    </Show>
                    <Show when={section.code}>
                      {(code) => (
                        <pre
                          class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md px-3 py-2 font-mono text-11-regular"
                          classList={{
                            "bg-background-stronger text-text-base": section.tone !== "error",
                            "bg-v2-state-bg-danger text-text-strong": section.tone === "error",
                          }}
                        >
                          {code()}
                        </pre>
                      )}
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
```

- [ ] **Step 9: Run tests and typecheck**

Run from `packages/app`:

```sh
bun test src/pages/session/session-activity.test.ts src/pages/session/helpers.test.ts
bun typecheck
```

Expected: both commands pass.

- [ ] **Step 10: Commit Task 2**

Run from repo root:

```sh
git add packages/app/src/pages/session/session-activity.ts packages/app/src/pages/session/session-activity-panel.tsx packages/app/src/pages/session/session-activity.test.ts
git commit -m "feat(app): 优化执行观察详情展示"
```

---

### Task 3: Reflect Activity State In Header

**Files:**
- Modify: `packages/app/src/components/session/session-header.tsx`

- [ ] **Step 1: Import activity helpers and SDK part type**

In `packages/app/src/components/session/session-header.tsx`, add imports:

```ts
import type { Part, Message } from "@opencode-ai/sdk/v2/client"
import { getSessionActivity } from "@/pages/session/session-activity"
```

If the file already imports `Message` or `Part`, extend the existing import instead of duplicating it.

- [ ] **Step 2: Derive current activity summary**

Inside `SessionHeader`, near `tint`, add:

```ts
  const activity = createMemo(() => {
    const id = params.id
    return getSessionActivity({
      messages: id ? ((sync().data.message[id] ?? []) as Message[]) : [],
      parts: sync().data.part as Record<string, Part[] | undefined>,
    })
  })
  const activityLabel = createMemo(() => {
    const summary = activity().summary
    const parts = [
      summary.runningCount > 0 ? `${summary.runningCount} 个运行中` : undefined,
      summary.errorCount > 0 ? `${summary.errorCount} 个失败` : undefined,
    ].filter(Boolean)
    if (parts.length === 0) return "切换执行观察"
    return `执行观察：${parts.join("，")}`
  })
  const activityState = createMemo(() => {
    const summary = activity().summary
    if (summary.errorCount > 0) return "error" as const
    if (summary.runningCount > 0 || summary.pendingCount > 0) return "running" as const
    if (view().activityPanel.opened()) return "opened" as const
    return "idle" as const
  })
```

- [ ] **Step 3: Extend `SessionHeaderV2ActionsState`**

Update the state type:

```ts
type SessionHeaderV2ActionsState = {
  statusVisible: boolean
  statusLabel: string
  activityVisible: boolean
  activityLabel: string
  activityOpened: boolean
  activityState: "idle" | "opened" | "running" | "error"
  onActivityToggle: () => void
  reviewLabel: string
  reviewKeybind: string
  reviewOpened: boolean
  onReviewToggle: () => void
}
```

Update `v2ActionsState`:

```ts
    activityLabel: activityLabel(),
    activityOpened: view().activityPanel.opened(),
    activityState: activityState(),
```

- [ ] **Step 4: Update header icon button rendering**

In `SessionHeaderV2Actions`, replace the activity button state and icon props with:

```tsx
            state={props.state.activityState === "idle" ? undefined : "pressed"}
            icon={
              <IconV2
                name={props.state.activityState === "error" || props.state.activityState === "running" ? "status-active" : "status"}
                class={props.state.activityState === "error" ? "text-v2-state-text-danger" : undefined}
              />
            }
```

Keep `aria-expanded`, `aria-controls`, and click behavior unchanged.

- [ ] **Step 5: Run typecheck**

Run from `packages/app`:

```sh
bun typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run from repo root:

```sh
git add packages/app/src/components/session/session-header.tsx
git commit -m "feat(app): 显示执行观察标题栏状态"
```

---

### Task 4: Final Verification And Desktop Package

**Files:**
- No source changes expected.

- [ ] **Step 1: Run app targeted tests**

Run from `packages/app`:

```sh
bun test src/pages/session/session-activity.test.ts src/pages/session/helpers.test.ts
```

Expected: PASS with all tests in both files passing.

- [ ] **Step 2: Run app typecheck**

Run from `packages/app`:

```sh
bun typecheck
```

Expected: PASS.

- [ ] **Step 3: Build desktop production app**

Run from `packages/desktop`:

```sh
OPENCODE_CHANNEL=prod bun run build
```

Expected: command exits 0.

- [ ] **Step 4: Package mac app**

Run from `packages/desktop`:

```sh
OPENCODE_CHANNEL=prod bun run package:mac
```

Expected: command exits 0. On this machine it is acceptable for electron-builder to report skipped macOS code signing because no valid `Developer ID Application` identity is available.

- [ ] **Step 5: Open packaged app**

Run:

```sh
open "/Users/liliangyi/AI_Project/OpenCode-AI/opencode-feature-prompt/packages/desktop/dist/mac-arm64/OpenCode-AI.app"
```

Expected: macOS opens the newly packaged app.

- [ ] **Step 6: Inspect final git status**

Run from repo root:

```sh
git status --short --branch
```

Expected: branch is ahead by the new commits, with no unstaged source changes except intentional build artifacts ignored by git.

- [ ] **Step 7: Push commits**

Run from repo root:

```sh
git push origin feature_prompt
```

Expected: push succeeds. If hooks run `bun turbo typecheck`, read the full output and confirm successful tasks before reporting completion.

---

## Self-Review

- Spec coverage: live duration is covered in Task 2; status counts and detail model are covered in Task 1; readable details, failed styling, and copy-error action are covered in Task 2; header failed/running state is covered in Task 3; tests, typecheck, package, and push are covered in Task 4.
- Scope: the plan only modifies frontend app files and final packaging commands. It does not modify backend protocol, SDK schema, sync data, search, export, timeline linking, or nested subagent trees.
- Type consistency: `SessionActivityDetailSection`, `detailSections`, `errorText`, `startedAt`, `endedAt`, status count fields, and `formatActivityDuration` are defined before UI tasks consume them.
