import type { ServerConnection, ServerHealth, ProjectInfo, SessionInfo, Message, MessagePart, PromptPayload, SSEEvent } from "../types"

function baseUrl(conn: ServerConnection): string {
  return `http://${conn.host}:${conn.port}`
}

function base64Encode(str: string): string {
  if (typeof btoa === "function") return btoa(str)
  return Buffer.from(str).toString("base64")
}

function authHeaders(conn: ServerConnection): Record<string, string> {
  const password = conn.password || "opencode"
  const encoded = base64Encode(`opencode:${password}`)
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${encoded}`,
  }
}

function queryDir(directory?: string): string {
  return directory ? `?directory=${encodeURIComponent(directory)}` : ""
}

// Parse a single raw part (TextPart | ReasoningPart | ToolPart | ...) into our MessagePart.
// Unknown part types are dropped. Text with synthetic/ignored flags is dropped too,
// since the server uses them for internal control messages, not visible content.
function parsePart(raw: any): MessagePart | null {
  const type = raw?.type
  if (type === "text") {
    if (raw.synthetic || raw.ignored) return null
    return { type: "text", text: raw.text }
  }
  if (type === "reasoning") return { type: "reasoning", text: raw.text }
  if (type === "tool") {
    const state = raw.state || {}
    return {
      type: "tool",
      tool: raw.tool,
      state: {
        status: state.status,
        title: state.title,
        output: state.output,
        error: state.error,
      },
    }
  }
  return null
}

// Parse raw API message into our Message type, preserving structured parts.
function parseMessage(raw: any): Message {
  const info = raw.info || raw
  const rawParts: any[] = raw.parts || []
  const parts = rawParts.map(parsePart).filter((p): p is MessagePart => p !== null)
  const content = parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n")
  return {
    id: info.id,
    sessionID: info.sessionID,
    role: info.role,
    content,
    parts,
    time: info.time || { created: 0 },
  }
}

export const api = {
  async health(conn: ServerConnection): Promise<ServerHealth> {
    const res = await fetch(`${baseUrl(conn)}/global/health`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return res.json()
  },

  async listProjects(conn: ServerConnection, directory?: string): Promise<ProjectInfo[]> {
    const res = await fetch(`${baseUrl(conn)}/project${queryDir(directory)}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`List projects failed: ${res.status}`)
    return res.json()
  },

  async listSessions(conn: ServerConnection, directory?: string): Promise<SessionInfo[]> {
    const url = `${baseUrl(conn)}/experimental/session?limit=100${directory ? `&directory=${encodeURIComponent(directory)}` : ""}`
    const res = await fetch(url, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`List sessions failed: ${res.status}`)
    return res.json()
  },

  async createSession(conn: ServerConnection, directory?: string): Promise<SessionInfo> {
    const res = await fetch(`${baseUrl(conn)}/session${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`Create session failed: ${res.status}`)
    return res.json()
  },

  async getMessages(conn: ServerConnection, sessionID: string, directory?: string): Promise<Message[]> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/message${queryDir(directory)}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Get messages failed: ${res.status}`)
    const raw: any[] = await res.json()
    return raw.map(parseMessage)
  },

  // GET /session/status returns a map of { [sessionID]: { type: "idle" | "busy" | "retry", ... } }.
  // Used as a fallback when the SSE stream misses the `session.status` idle event.
  async getSessionStatus(conn: ServerConnection, sessionID: string, directory?: string): Promise<"idle" | "busy" | "retry"> {
    const res = await fetch(`${baseUrl(conn)}/session/status${queryDir(directory)}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Get session status failed: ${res.status}`)
    const map: Record<string, { type: string }> = await res.json()
    const entry = map[sessionID]
    if (entry?.type === "busy" || entry?.type === "retry") return entry.type
    return "idle"
  },

  async sendMessage(conn: ServerConnection, sessionID: string, payload: PromptPayload, directory?: string): Promise<void> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/prompt_async${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify({ parts: [{ type: "text", text: payload.content }] }),
    })
    if (!res.ok) throw new Error(`Send message failed: ${res.status}`)
  },

  async abortSession(conn: ServerConnection, sessionID: string, directory?: string): Promise<void> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/abort${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Abort session failed: ${res.status}`)
  },

  createEventSource(conn: ServerConnection, directory?: string): { close: () => void; onEvent: (handler: (event: SSEEvent) => void) => void } {
    const EventSourcePolyfill = require("event-source-polyfill").EventSourcePolyfill
    const url = `${baseUrl(conn)}/event${queryDir(directory)}`
    const es = new EventSourcePolyfill(url, { headers: authHeaders(conn) })
    const handlers: Array<(event: SSEEvent) => void> = []

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent
        handlers.forEach((h) => h(data))
      } catch {
        // ignore parse errors for heartbeat
      }
    }

    return {
      onEvent: (handler) => handlers.push(handler),
      close: () => es.close(),
    }
  },
}
