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
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
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

// Agent info from GET /agent. Only the fields we surface in the picker.
export interface AgentInfo {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
}

// A selectable model option, flattened from GET /provider's all[].models map.
export interface ModelOption {
  providerID: string
  modelID: string
  name: string
  family?: string
  isDefault?: boolean
}

// Currently selected agent/model in a session. `agent` is the agent name;
// model is identified by providerID+modelID. Both optional (server default).
export interface AgentModelSelection {
  agent?: string
  model?: { providerID: string; modelID: string }
}

// A file or directory entry from GET /file.
export interface FileEntry {
  name: string
  path: string
  type: "file" | "directory"
  ignored: boolean
}

// File content from GET /file/content.
export interface FileContent {
  type: "text" | "binary"
  content: string
}

// A flattened search match from GET /find.
export interface SearchMatch {
  path: string
  line: number
  text: string
}

// Git change summary from GET /vcs/status.
export interface VcsFileStatus {
  file: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

// Branch info from GET /vcs.
export interface VcsInfo {
  branch?: string
  default_branch?: string
}

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
  agent?: string
  model?: { providerID: string; modelID: string }
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
