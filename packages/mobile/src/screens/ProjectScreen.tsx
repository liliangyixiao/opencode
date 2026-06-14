import React, { useState, useEffect, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import type { ProjectInfo, SessionInfo } from "../types"

interface Props {
  onSelectProject: (directory: string, projectName: string) => void
  onSelectSession: (sessionID: string, directory: string) => void
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

export function ProjectScreen({ onSelectProject, onSelectSession, selectedDirectory }: Props) {
  const { activeConnection, disconnect, directory } = useConnection()
  const insets = useSafeAreaInsets()
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
        api.listSessions(activeConnection, dir),
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

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const handleNewChat = async () => {
    if (!activeConnection) return
    const dir = selectedDirectory ?? directory
    try {
      const session = await api.createSession(activeConnection, dir)
      onSelectSession(session.id, session.directory || "")
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
        <View>
          <Text style={styles.headerTitle}>OpenCode AI</Text>
          <Text style={styles.headerSubtitle}>{activeConnection?.name}</Text>
        </View>
        <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
          <Text style={styles.disconnectText}>断开</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
        <Text style={styles.newChatButtonText}>+ 新对话{selectedDirectory ? `（${firstChar(dirBasename(selectedDirectory))}）` : ""}</Text>
      </TouchableOpacity>

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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.sessionItem}
            onPress={() => onSelectSession(item.id, item.directory || "")}
            onLongPress={() => handleDeleteSession(item)}
            delayLongPress={500}
          >
            <Text style={styles.sessionTitle} numberOfLines={1}>{item.title || item.slug || "未命名会话"}</Text>
            <Text style={styles.sessionDate}>{new Date(item.time.updated).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
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
  disconnectText: { color: theme.colors.error, fontSize: theme.fontSize.sm, fontWeight: "500" },
  newChatButton: { margin: theme.spacing.xl, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: theme.spacing.lg, alignItems: "center" },
  newChatButtonText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  list: { flex: 1, paddingHorizontal: theme.spacing.xl },
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: "600", marginBottom: theme.spacing.md, textTransform: "uppercase", letterSpacing: 1 },
  projectItem: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm, gap: theme.spacing.md },
  projectIcon: { width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  projectIconText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "700" },
  projectInfo: { flex: 1 },
  projectName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" },
  projectPath: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 2 },
  sessionItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm },
  sessionTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, flex: 1 },
  sessionDate: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginLeft: theme.spacing.md },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.fontSize.md, textAlign: "center", marginTop: theme.spacing.xxl },
  errorText: { color: theme.colors.error, fontSize: theme.fontSize.md, textAlign: "center", marginBottom: theme.spacing.lg },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  retryText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
})
