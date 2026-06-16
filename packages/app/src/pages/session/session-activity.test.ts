import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { filterSessionActivityItems, getSessionActivity } from "./session-activity"

const assistant = (id: string) =>
  ({
    id,
    role: "assistant",
    agent: "build",
    providerID: "openai",
    modelID: "gpt-5",
    time: { created: 1 },
  }) as unknown as Message

describe("getSessionActivity", () => {
  test("maps reasoning, tools, and task tools into activity rows", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "r1",
          type: "reasoning",
          text: "Inspect the session UI\nThen add a panel",
          time: { start: 10, end: 20 },
        },
        {
          id: "t1",
          type: "tool",
          tool: "rg",
          state: {
            status: "completed",
            input: { pattern: "tool" },
            output: "packages/app/src/pages/session/message-timeline.tsx",
            title: "搜索代码",
            metadata: {},
            time: { start: 30, end: 45 },
          },
        },
        {
          id: "task1",
          type: "tool",
          tool: "task",
          state: {
            status: "running",
            input: { description: "Audit UI" },
            title: "UI audit",
            time: { start: 50 },
          },
        },
      ] as unknown as Part[],
    }

    const activity = getSessionActivity({ messages, parts })

    expect(activity.summary.agent).toBe("build")
    expect(activity.summary.model).toBe("openai/gpt-5")
    expect(activity.summary.status).toBe("running")
    expect(activity.summary.toolCount).toBe(1)
    expect(activity.summary.subagentCount).toBe(1)
    expect(activity.summary.reasoningCount).toBe(1)
    expect(activity.items.map((item) => item.kind)).toEqual(["reasoning", "tool", "subagent"])
    expect(activity.items[1]?.durationMs).toBe(15)
  })

  test("marks failed tools as errors", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "t1",
          type: "tool",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "exit code 1",
            time: { start: 30, end: 40 },
          },
        },
      ] as unknown as Part[],
    }

    const activity = getSessionActivity({ messages, parts })

    expect(activity.summary.status).toBe("error")
    expect(activity.items[0]?.status).toBe("error")
    expect(activity.items[0]?.summary).toBe("exit code 1")
  })

  test("filters activity rows by selected segment", () => {
    const messages = [assistant("a1")]
    const parts = {
      a1: [
        {
          id: "r1",
          type: "reasoning",
          text: "Think",
          time: { start: 10, end: 20 },
        },
        {
          id: "t1",
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "pwd" },
            output: "/tmp",
            time: { start: 30, end: 40 },
          },
        },
        {
          id: "task1",
          type: "tool",
          tool: "task",
          state: {
            status: "completed",
            input: { description: "Audit UI" },
            output: "done",
            time: { start: 50, end: 80 },
          },
        },
      ] as unknown as Part[],
    }
    const activity = getSessionActivity({ messages, parts })

    expect(filterSessionActivityItems(activity.items, "all").map((item) => item.id)).toEqual(["r1", "t1", "task1"])
    expect(filterSessionActivityItems(activity.items, "tool").map((item) => item.id)).toEqual(["t1"])
    expect(filterSessionActivityItems(activity.items, "subagent").map((item) => item.id)).toEqual(["task1"])
  })

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
})
