export interface ServerConnection {
  id: string
  name: string
  host: string
  port: number
  password?: string
  lastConnected?: number
}

export interface ProjectInfo {
  id: string
  name: string
  path: string
  icon?: string
  vcs?: "git" | "none"
}

export interface SessionInfo {
  id: string
  title?: string
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

export interface MessagePart {
  id: string
  type: string
  content: string
  metadata?: Record<string, unknown>
}

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
