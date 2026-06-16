import React, { useEffect, useState } from "react"
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from "react-native"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import type { AgentInfo, ModelOption, AgentModelSelection } from "../types"

// Per-connection, per-directory cache with a 5-minute TTL. Agent/model config
// rarely changes mid-session, so reopening the picker reuses the cached list.
const CACHE_TTL_MS = 5 * 60 * 1000
const pickerCache = {
  entries: new Map<string, { agents: AgentInfo[]; models: ModelOption[]; at: number }>(),
  key(connId: string, dir: string | undefined) {
    return `${connId}:${dir ?? ""}`
  },
  get(connId: string, dir: string | undefined) {
    const e = this.entries.get(this.key(connId, dir))
    if (!e) return undefined
    if (Date.now() - e.at > CACHE_TTL_MS) {
      this.entries.delete(this.key(connId, dir))
      return undefined
    }
    return e
  },
  set(connId: string, dir: string | undefined, agents: AgentInfo[], models: ModelOption[]) {
    this.entries.set(this.key(connId, dir), { agents, models, at: Date.now() })
  },
}

interface Props {
  visible: boolean
  selection: AgentModelSelection
  directory?: string
  onClose: () => void
  onApply: (selection: AgentModelSelection) => void
}

type Tab = "agent" | "model"

export function AgentModelPicker({ visible, selection, directory, onClose, onApply }: Props) {
  const { activeConnection } = useConnection()
  const [tab, setTab] = useState<Tab>("agent")
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const [local, setLocal] = useState<AgentModelSelection>(selection)

  // Sync local state when the picker opens with the current selection.
  useEffect(() => {
    if (visible) setLocal(selection)
  }, [visible, selection])

  // Load agents + models when the picker is opened. Cached per-directory for
  // 5 minutes so reopening doesn't refetch (configs rarely change mid-session).
  useEffect(() => {
    if (!visible || !activeConnection) return
    const cached = pickerCache.get(activeConnection.id, directory)
    if (cached) {
      setAgents(cached.agents)
      setModels(cached.models)
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      api.listAgents(activeConnection, directory).catch(() => [] as AgentInfo[]),
      api.listModels(activeConnection, directory).catch(() => [] as ModelOption[]),
    ]).then(([a, m]) => {
      setAgents(a)
      setModels(m)
      setLoading(false)
      pickerCache.set(activeConnection.id, directory, a, m)
    })
  }, [visible, activeConnection, directory])

  const apply = () => {
    onApply(local)
    onClose()
  }

  const agentLabel = local.agent ?? "默认"
  const modelLabel = local.model ? modelName(local.model.modelID, models) ?? `${local.model.providerID}/${local.model.modelID}` : "默认"

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Agent / 模型</Text>
            <TouchableOpacity onPress={apply}>
              <Text style={styles.applyText}>应用</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, tab === "agent" && styles.tabActive]} onPress={() => setTab("agent")}>
              <Text style={[styles.tabText, tab === "agent" && styles.tabTextActive]}>Agent（{agentLabel}）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === "model" && styles.tabActive]} onPress={() => setTab("model")}>
              <Text style={[styles.tabText, tab === "model" && styles.tabTextActive]}>模型（{modelLabel}）</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={tab === "agent" ? agents : models}
              keyExtractor={(item, idx) => (tab === "agent" ? (item as AgentInfo).name : (item as ModelOption).modelID) + idx}
              renderItem={({ item }) =>
                tab === "agent" ? renderAgentRow(item as AgentInfo, local, setLocal) : renderModelRow(item as ModelOption, local, setLocal)
              }
              ListHeaderComponent={
                // A "default" row at the top to clear the selection.
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setLocal((prev) => (tab === "agent" ? { ...prev, agent: undefined } : { ...prev, model: undefined }))}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>默认（使用全局配置）</Text>
                  </View>
                  {(tab === "agent" ? !local.agent : !local.model) ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

function renderAgentRow(agent: AgentInfo, local: AgentModelSelection, setLocal: React.Dispatch<React.SetStateAction<AgentModelSelection>>) {
  const selected = local.agent === agent.name
  return (
    <TouchableOpacity style={styles.row} onPress={() => setLocal((prev) => ({ ...prev, agent: agent.name }))}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {agent.name}
          {agent.native ? <Text style={styles.badge}> 内置</Text> : null}
        </Text>
        {agent.description ? <Text style={styles.rowDesc} numberOfLines={2}>{agent.description}</Text> : null}
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </TouchableOpacity>
  )
}

function renderModelRow(model: ModelOption, local: AgentModelSelection, setLocal: React.Dispatch<React.SetStateAction<AgentModelSelection>>) {
  const selected = local.model?.providerID === model.providerID && local.model?.modelID === model.modelID
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => setLocal((prev) => ({ ...prev, model: { providerID: model.providerID, modelID: model.modelID } }))}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {model.name}
          {model.isDefault ? <Text style={styles.badge}> 默认</Text> : null}
        </Text>
        <Text style={styles.rowDesc}>{model.providerID}/{model.modelID}</Text>
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </TouchableOpacity>
  )
}

function modelName(modelID: string, models: ModelOption[]): string | undefined {
  return models.find((m) => m.modelID === modelID)?.name
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, maxHeight: "80%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  cancelText: { color: theme.colors.textMuted, fontSize: theme.fontSize.md },
  title: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" },
  applyText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: "600" },
  tabs: { flexDirection: "row", padding: theme.spacing.md, gap: theme.spacing.sm },
  tab: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceLight, alignItems: "center" },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: "500" },
  tabTextActive: { color: "#fff" },
  loading: { padding: theme.spacing.xxl, alignItems: "center" },
  list: { paddingBottom: theme.spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  rowText: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" },
  rowDesc: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 2 },
  badge: { color: theme.colors.primary, fontSize: theme.fontSize.xs, fontWeight: "600" },
  check: { color: theme.colors.primary, fontSize: theme.fontSize.lg, fontWeight: "700" },
})
