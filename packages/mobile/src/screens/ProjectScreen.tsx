import React, { useState, useEffect, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import type { ProjectInfo, SessionInfo } from "../types"

interface Props {
  onSelectProject: (directory: string, projectName: string) => void
  onSelectSession: (sessionID: string, directory: string) => void
}

export function ProjectScreen({ onSelectProject, onSelectSession }: Props) {
  const { activeConnection, disconnect } = useConnection()
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    if (!activeConnection) return
    try {
      const [projs, sess] = await Promise.all([
        api.listProjects(activeConnection),
        api.listSessions(activeConnection),
      ])
      setProjects(projs)
      setSessions(sess)
    } catch (err) {
      console.error("Failed to load data:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeConnection])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const handleNewChat = async () => {
    if (!activeConnection) return
    try {
      const session = await api.createSession(activeConnection)
      onSelectSession(session.id, "")
    } catch (err) {
      console.error("Failed to create session:", err)
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>OpenCode AI</Text>
          <Text style={styles.headerSubtitle}>{activeConnection?.name}</Text>
        </View>
        <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
          <Text style={styles.disconnectText}>断开</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat}>
        <Text style={styles.newChatButtonText}>+ 新对话</Text>
      </TouchableOpacity>

      {projects.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>项目</Text>
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.projectItem} onPress={() => onSelectProject(item.path, item.name)}>
                <View style={styles.projectIcon}>
                  <Text style={styles.projectIconText}>{(item.name || "P")[0].toUpperCase()}</Text>
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{item.name}</Text>
                  <Text style={styles.projectPath} numberOfLines={1}>{item.path}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近会话</Text>
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.sessionItem} onPress={() => onSelectSession(item.id, "")}>
              <Text style={styles.sessionTitle} numberOfLines={1}>{item.title || "未命名会话"}</Text>
              <Text style={styles.sessionDate}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>暂无会话</Text>}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: theme.spacing.xl, paddingTop: 60, backgroundColor: theme.colors.surface },
  headerTitle: { fontSize: theme.fontSize.xl, fontWeight: "700", color: theme.colors.text },
  headerSubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 2 },
  disconnectButton: { padding: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceLight },
  disconnectText: { color: theme.colors.error, fontSize: theme.fontSize.sm, fontWeight: "500" },
  newChatButton: { margin: theme.spacing.xl, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: theme.spacing.lg, alignItems: "center" },
  newChatButtonText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  section: { flex: 1, paddingHorizontal: theme.spacing.xl },
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
})
