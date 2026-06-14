export interface ServerConnection {
  id: string
  name: string
  host: string
  port: number
  password?: string
  tls?: boolean
  lastConnected?: number
}

export interface ProjectInfo {
  id: string
  worktree: string
  vcs?: string
  time: { created: number; updated: number }
}

export interface SessionInfo {
  id: string
  slug?: string
  projectID?: string
  directory?: string
  title?: string
  version?: string
  cost?: number
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  time: { created: number; updated: number }
}

// Permission request emitted by the server as `permission.asked` events.
// `id` is the request id used to reply via POST /session/:id/permissions/:id.
export interface PermissionRequest {
  id: string
  permission: string
  patterns: string[]
  metadata?: Record<string, unknown>
  always?: string[]
}

// Reply values for POST /session/:id/permissions/:id body `{ response }`.
export type PermissionResponse = "once" | "always" | "reject"

export type ToolPartStatus = "pending" | "running" | "completed" | "error"

export interface ToolPartState {
  status: ToolPartStatus
  title?: string
  output?: string
  error?: string
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; state: ToolPartState }

export interface Message {
  id: string
  sessionID: string
  role: "user" | "assistant" | "system"
  content: string
  parts: MessagePart[]
  time: { created: number }
}

export interface PromptPayload {
  content: string
  attachments?: Array<{
    type: string
    data: string
    name?: string
  }>
}

export interface ServerHealth {
  healthy: boolean
  version: string
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface SSEEvent {
  id: string
  type: string
  properties: Record<string, unknown>
}
