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
})
