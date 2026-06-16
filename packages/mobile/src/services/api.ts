import type { ServerConnection, ServerHealth, ProjectInfo, SessionInfo, Message, MessagePart, PromptPayload, PermissionResponse, AgentInfo, ModelOption, FileEntry, FileContent, SearchMatch, VcsFileStatus, VcsInfo, SSEEvent } from "../types"

function baseUrl(conn: ServerConnection): string {
  const scheme = conn.tls ? "https" : "http"
  return `${scheme}://${conn.host}:${conn.port}`
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
// Build a short human label from a tool's input object, for states that lack
// a server-provided title (error/pending). Picks the most informative field.
function describeToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const obj = input as Record<string, unknown>
  for (const key of ["path", "filePath", "command", "cmd", "url", "pattern", "query"]) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v
  }
  // Fall back to the first string-valued field.
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim()) return v
  }
  return undefined
}

function parsePart(raw: any): MessagePart | null {
  const type = raw?.type
  if (type === "text") {
    if (raw.synthetic || raw.ignored) return null
    return { type: "text", text: raw.text }
  }
  if (type === "reasoning") return { type: "reasoning", text: raw.text }
  if (type === "tool") {
    const state = raw.state || {}
    // error/pending states have no `title`; derive a short label from the
    // tool input (commonly {path} or {command}) so the card isn't bare.
    let title = state.title as string | undefined
    if (!title && state.input) {
      title = describeToolInput(state.input)
    }
    return {
      type: "tool",
      tool: raw.tool,
      state: {
        status: state.status,
        title,
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

  async listSessions(conn: ServerConnection, directory?: string, search?: string): Promise<SessionInfo[]> {
    // The server paginates via the `x-next-cursor` response header. Loop until
    // exhausted so the UI always sees the full list (not just the first 100).
    const baseParams = ["limit=100"]
    if (directory) baseParams.push(`directory=${encodeURIComponent(directory)}`)
    if (search) baseParams.push(`search=${encodeURIComponent(search)}`)
    const all: SessionInfo[] = []
    let cursor: string | null = null
    // Safety cap to avoid an unbounded loop against a misbehaving server.
    for (let page = 0; page < 50; page++) {
      const params = [...baseParams]
      if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`)
      const res = await fetch(`${baseUrl(conn)}/experimental/session?${params.join("&")}`, {
        headers: authHeaders(conn),
      })
      if (!res.ok) throw new Error(`List sessions failed: ${res.status}`)
      const batch: SessionInfo[] = await res.json()
      all.push(...batch)
      cursor = res.headers.get("x-next-cursor")
      if (!cursor || batch.length === 0) break
    }
    return all
  },

  async listAgents(conn: ServerConnection, directory?: string): Promise<AgentInfo[]> {
    const res = await fetch(`${baseUrl(conn)}/agent${queryDir(directory)}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`List agents failed: ${res.status}`)
    const all: AgentInfo[] = await res.json()
    // Hide agents flagged hidden by the server config.
    return all.filter((a) => !a.hidden)
  },

  async listModels(conn: ServerConnection, directory?: string): Promise<ModelOption[]> {
    const res = await fetch(`${baseUrl(conn)}/provider${queryDir(directory)}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`List models failed: ${res.status}`)
    const data: { all: Array<{ id: string; models: Record<string, { id: string; name: string; family?: string }> }>; default: Record<string, string>; connected: string[] } = await res.json()
    const connected = new Set(data.connected)
    const options: ModelOption[] = []
    for (const provider of data.all) {
      // Skip providers without a configured API key (they can't be used).
      if (!connected.has(provider.id)) continue
      for (const key of Object.keys(provider.models)) {
        const m = provider.models[key]
        if (!m) continue
        options.push({
          providerID: provider.id,
          modelID: m.id,
          name: m.name,
          family: m.family,
          isDefault: data.default[provider.id] === m.id,
        })
      }
    }
    return options
  },

  // GET /file?path= — list a directory. `path` is relative to the workspace
  // root; "" lists the root. Directories sort before files.
  async listFiles(conn: ServerConnection, path: string, directory?: string): Promise<FileEntry[]> {
    const params = [`path=${encodeURIComponent(path)}`]
    if (directory) params.push(`directory=${encodeURIComponent(directory)}`)
    const res = await fetch(`${baseUrl(conn)}/file?${params.join("&")}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`List files failed: ${res.status}`)
    const entries: FileEntry[] = await res.json()
    // Directories first, then alphabetical. Stable enough for browsing.
    return entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  },

  // GET /file/content?path= — read a file. Returns {type, content}.
  async readFile(conn: ServerConnection, path: string, directory?: string): Promise<FileContent> {
    const params = [`path=${encodeURIComponent(path)}`]
    if (directory) params.push(`directory=${encodeURIComponent(directory)}`)
    const res = await fetch(`${baseUrl(conn)}/file/content?${params.join("&")}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Read file failed: ${res.status}`)
    return res.json()
  },

  // GET /find?pattern= — full-text search (ripgrep). Returns flattened matches.
  async findText(conn: ServerConnection, pattern: string, directory?: string): Promise<SearchMatch[]> {
    const params = [`pattern=${encodeURIComponent(pattern)}`]
    if (directory) params.push(`directory=${encodeURIComponent(directory)}`)
    const res = await fetch(`${baseUrl(conn)}/find?${params.join("&")}`, {
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Find text failed: ${res.status}`)
    const raw: Array<{ path: { text: string }; line_number: number; lines: { text: string } }> = await res.json()
    return raw.map((m) => ({ path: m.path.text, line: m.line_number, text: m.lines.text }))
  },

  // GET /vcs — branch info.
  async getVcsInfo(conn: ServerConnection, directory?: string): Promise<VcsInfo> {
    const res = await fetch(`${baseUrl(conn)}/vcs${queryDir(directory)}`, { headers: authHeaders(conn) })
    if (!res.ok) throw new Error(`VCS info failed: ${res.status}`)
    return res.json()
  },

  // GET /vcs/status — changed files in the working tree.
  async getVcsStatus(conn: ServerConnection, directory?: string): Promise<VcsFileStatus[]> {
    const res = await fetch(`${baseUrl(conn)}/vcs/status${queryDir(directory)}`, { headers: authHeaders(conn) })
    if (!res.ok) throw new Error(`VCS status failed: ${res.status}`)
    return res.json()
  },

  // GET /vcs/diff/raw — the raw patch for uncommitted changes (text/x-diff).
  // Easier to render on mobile than the structured hunks from /vcs/diff.
  async getVcsDiffRaw(conn: ServerConnection, directory?: string): Promise<string> {
    const res = await fetch(`${baseUrl(conn)}/vcs/diff/raw${queryDir(directory)}`, { headers: authHeaders(conn) })
    if (!res.ok) throw new Error(`VCS diff failed: ${res.status}`)
    return res.text()
  },

  // POST /experimental/enhance — AI-optimize a short prompt into a fuller one.
  async enhanceText(conn: ServerConnection, text: string, directory?: string): Promise<string> {
    const res = await fetch(`${baseUrl(conn)}/experimental/enhance${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`Enhance failed: ${res.status}`)
    const data: { text: string } = await res.json()
    return data.text
  },

  async createSession(
    conn: ServerConnection,
    directory?: string,
    selection?: { agent?: string; model?: { providerID: string; modelID: string } },
  ): Promise<SessionInfo> {
    // createSession's model field is named `id` (not modelID — see Session.CreateInput).
    const body: Record<string, unknown> = {}
    if (selection?.agent) body.agent = selection.agent
    if (selection?.model) body.model = { id: selection.model.modelID, providerID: selection.model.providerID }
    const res = await fetch(`${baseUrl(conn)}/session${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify(body),
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
    // prompt_async's model field is named `modelID` (NOT `id` like createSession).
    const body: Record<string, unknown> = { parts: [{ type: "text", text: payload.content }] }
    if (payload.agent) body.agent = payload.agent
    if (payload.model) body.model = { modelID: payload.model.modelID, providerID: payload.model.providerID }
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/prompt_async${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify(body),
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

  async deleteSession(conn: ServerConnection, sessionID: string, directory?: string): Promise<void> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}${queryDir(directory)}`, {
      method: "DELETE",
      headers: authHeaders(conn),
    })
    if (!res.ok) throw new Error(`Delete session failed: ${res.status}`)
  },

  // POST /session/:id/permissions/:permissionID body { response }.
  // response is "once" | "always" | "reject".
  async replyPermission(
    conn: ServerConnection,
    sessionID: string,
    permissionID: string,
    response: PermissionResponse,
    directory?: string,
  ): Promise<void> {
    const res = await fetch(`${baseUrl(conn)}/session/${sessionID}/permissions/${permissionID}${queryDir(directory)}`, {
      method: "POST",
      headers: authHeaders(conn),
      body: JSON.stringify({ response }),
    })
    if (!res.ok) throw new Error(`Reply permission failed: ${res.status}`)
  },

  createEventSource(
    conn: ServerConnection,
    directory: string | undefined,
    onStatus: (health: "connected" | "reconnecting") => void,
  ): { close: () => void; onEvent: (handler: (event: SSEEvent) => void) => void } {
    const EventSourcePolyfill = require("event-source-polyfill").EventSourcePolyfill
    const url = `${baseUrl(conn)}/event${queryDir(directory)}`
    // The polyfill has its OWN auto-reconnect (exponential backoff). We must NOT
    // also open a new EventSource from onerror — that races the polyfill's
    // internal state machine and throws "Cannot open, already sending".
    // We only observe status for UI feedback.
    const es = new EventSourcePolyfill(url, {
      headers: authHeaders(conn),
      // Tame the polyfill's own reconnect so it doesn't hammer a down server.
      reconnectInterval: 3000,
    })
    const handlers: Array<(event: SSEEvent) => void> = []

    es.onopen = () => onStatus("connected")
    es.onerror = () => onStatus("reconnecting")
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
