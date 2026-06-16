import { useState, useEffect, useCallback, useRef } from "react"
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import { AgentModelPicker } from "../components/AgentModelPicker"
import type { ProjectInfo, SessionInfo, AgentModelSelection } from "../types"

interface Props {
  onSelectProject: (directory: string, projectName: string) => void
  onSelectSession: (sessionID: string, directory: string, title?: string) => void
  onOpenFiles: (directory: string) => void
  onOpenVcs: (directory: string) => void
  selectedDirectory: string | null
}

function projectName(project: ProjectInfo): string {
  const parts = project.worktree.split("/")
  return parts[parts.length - 1] || project.id
}

function firstChar(name: string): string {
  return (name[0] || "?").toUpperCase()
}

function dirBasename(dir: string): string {
  const parts = dir.split("/")
  return parts[parts.length - 1] || dir
}

// Compact relative time: "刚刚", "5分钟前", "3小时前", "昨天", "6/14".
function relativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return "刚刚"
  if (diff < hour) return `${Math.floor(diff / min)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 2 * day) return "昨天"
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return new Date(ts).toLocaleDateString()
}

// Format cost (USD) compactly, e.g. $0.0123 → "$0.01", $1.5 → "$1.50".
function formatCost(cost: number | undefined): string | null {
  if (cost === undefined || cost === null || cost <= 0) return null
  if (cost < 0.01) return `${cost.toFixed(4)}`
  return `${cost.toFixed(2)}`
}

export function ProjectScreen({ onSelectProject, onSelectSession, onOpenFiles, onOpenVcs, selectedDirectory }: Props) {
  const { activeConnection, disconnect, directory } = useConnection()
  const insets = useSafeAreaInsets()
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [newSelection, setNewSelection] = useState<AgentModelSelection>({})
  const [search, setSearch] = useState("")
  const searchRef = useRef(search)
  searchRef.current = search

  const loadData = useCallback(async () => {
    if (!activeConnection) return
    setLoadError(null)
    try {
      // listProjects needs no directory (server returns all). listSessions is
      // filtered server-side by directory: when a project is selected, scope
      // to its worktree so we only see that project's sessions.
      const dir = selectedDirectory ?? directory
      const [projs, sess] = await Promise.all([
        api.listProjects(activeConnection),
        api.listSessions(activeConnection, dir, searchRef.current || undefined),
      ])
      setProjects(projs)
      setSessions(sess)
    } catch (err) {
      console.error("Failed to load data:", err)
      setLoadError("加载失败，请检查连接后重试")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeConnection, selectedDirectory, directory])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Debounced search: re-query the server 400ms after the user stops typing.
  useEffect(() => {
    if (!activeConnection) return
    const t = setTimeout(() => {
      setLoading(true)
      loadData()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const handleNewChat = async () => {
    if (!activeConnection) return
    const dir = selectedDirectory ?? directory
    try {
      const session = await api.createSession(activeConnection, dir, newSelection)
      onSelectSession(session.id, session.directory || dir || "", session.title)
    } catch (err) {
      console.error("Failed to create session:", err)
      Alert.alert("创建失败", "无法创建会话，请重试")
    }
  }

  const handleDeleteSession = (session: SessionInfo) => {
    if (!activeConnection) return
    Alert.alert(
      "删除会话",
      `确定删除「${session.title || session.slug || "未命名会话"}」？此操作不可撤销。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteSession(activeConnection, session.id, session.directory)
              setSessions((prev) => prev.filter((s) => s.id !== session.id))
            } catch (err) {
              console.error("Failed to delete session:", err)
              Alert.alert("删除失败", "无法删除会话，请重试")
            }
          },
        },
      ],
    )
  }

  const headerPad = { paddingTop: insets.top + theme.spacing.md }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); loadData() }}>
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, headerPad]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>OpenCode AI</Text>
          <Text style={styles.headerSubtitle}>
            {selectedDirectory ? dirBasename(selectedDirectory) : activeConnection?.name}
          </Text>
        </View>
        {selectedDirectory ? (
          <>
            <TouchableOpacity
              style={styles.filesButton}
              onPress={() => onOpenVcs(selectedDirectory)}
              accessibilityRole="button"
              accessibilityLabel="查看 Git 改动"
            >
              <Text style={styles.filesButtonText}>Git</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filesButton}
              onPress={() => onOpenFiles(selectedDirectory)}
              accessibilityRole="button"
              accessibilityLabel="浏览项目文件"
            >
              <Text style={styles.filesButtonText}>文件</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
          <Text style={styles.disconnectText}>断开</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.newChatRow}>
        <TouchableOpacity
          style={styles.configButton}
          onPress={() => setPickerVisible(true)}
        >
          <Text style={styles.configButtonText}>⚙ {newSelection.agent ?? "默认"} · {newSelection.model ? newSelection.model.modelID : "默认模型"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
          <Text style={styles.newChatButtonText}>+ 新对话</Text>
        </TouchableOpacity>
      </View>

      <AgentModelPicker
        visible={pickerVisible}
        selection={newSelection}
        directory={selectedDirectory ?? directory}
        onClose={() => setPickerVisible(false)}
        onApply={setNewSelection}
      />

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索会话标题..."
          placeholderTextColor={theme.colors.textFaint}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        style={styles.list}
        data={sessions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        ListHeaderComponent={
          projects.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>项目</Text>
              <ScrollView scrollEnabled={false}>
                {projects.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.projectItem} onPress={() => onSelectProject(item.worktree, projectName(item))}>
                    <View style={styles.projectIcon}>
                      <Text style={styles.projectIconText}>{firstChar(projectName(item))}</Text>
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName}>{projectName(item)}</Text>
                      <Text style={styles.projectPath} numberOfLines={1}>{item.worktree}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const cost = formatCost(item.cost)
          const metaParts = [relativeTime(item.time.updated)]
          if (item.agent) metaParts.push(item.agent)
          if (item.model?.id) metaParts.push(item.model.id)
          if (cost) metaParts.push(cost)
          return (
            <TouchableOpacity
              style={styles.sessionItem}
              onPress={() => onSelectSession(item.id, item.directory || selectedDirectory || "", item.title)}
              onLongPress={() => handleDeleteSession(item)}
              delayLongPress={500}
            >
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionTitle} numberOfLines={1}>{item.title || item.slug || "未命名会话"}</Text>
                <Text style={styles.sessionMeta} numberOfLines={1}>
                  {metaParts.join("  ·  ")}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无会话，点击上方"+ 新对话"开始</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center", padding: theme.spacing.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.xl, backgroundColor: theme.colors.surface },
  headerTitle: { fontSize: theme.fontSize.xl, fontWeight: "700", color: theme.colors.text },
  headerSubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 2 },
  disconnectButton: { padding: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceLight },
  filesButton: { padding: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary, marginRight: theme.spacing.sm },
  filesButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: "600" },
  disconnectText: { color: theme.colors.error, fontSize: theme.fontSize.sm, fontWeight: "500" },
  newChatRow: { flexDirection: "row", margin: theme.spacing.xl, gap: theme.spacing.sm },
  configButton: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.radius.md, padding: theme.spacing.lg, justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  configButtonText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  newChatButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.xl, justifyContent: "center", alignItems: "center" },
  newChatButtonText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  list: { flex: 1, paddingHorizontal: theme.spacing.xl },
  searchBox: { paddingHorizontal: theme.spacing.xl, marginBottom: theme.spacing.md },
  searchInput: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, color: theme.colors.text, fontSize: theme.fontSize.sm, borderWidth: 1, borderColor: theme.colors.border },
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: "600", marginBottom: theme.spacing.md, textTransform: "uppercase", letterSpacing: 1 },
  projectItem: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm, gap: theme.spacing.md },
  projectIcon: { width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  projectIconText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "700" },
  projectInfo: { flex: 1 },
  projectName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" },
  projectPath: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 2 },
  sessionItem: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm },
  sessionInfo: { flex: 1 },
  sessionTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" },
  sessionMeta: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 4 },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.fontSize.md, textAlign: "center", marginTop: theme.spacing.xxl },
  errorText: { color: theme.colors.error, fontSize: theme.fontSize.md, textAlign: "center", marginBottom: theme.spacing.lg },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  retryText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
})
