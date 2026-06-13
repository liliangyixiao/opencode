import type { ServerConnection, ServerHealth, ProjectInfo, SessionInfo, Message, PromptPayload, SSEEvent } from "../types"

function baseUrl(conn: ServerConnection): string {
  return `http://${conn.host}:${conn.port}`
}

function authHeaders(conn: ServerConnection): Record<string, string> {
  if (!conn.password) return { "Content-Type": "application/json" }
  const encoded = btoa(`:${conn.password}`)
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${encoded}`,
  }
}

function queryDir(directory?: string): string {
  return directory ? `?directory=${encodeURIComponent(directory)}` : ""
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
    const res = await fetch(`${baseUrl(conn)}/session?scope=project${directory ? `&directory=${encodeURIComponent(directory)}` : ""}`, {
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
    return res.json()
  },

  async sendMessage(conn: ServerConnection, sessionID: string, payload: PromptPayload, directory?: string): Promise<void> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/prompt_async${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify({ content: payload.content }),
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
