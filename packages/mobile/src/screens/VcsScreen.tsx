import React, { useState, useEffect, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Share } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import { MarkdownText } from "../components/MarkdownText"
import type { VcsFileStatus, VcsInfo } from "../types"

interface Props {
  directory: string
  onBack: () => void
}

const STATUS_COLOR: Record<VcsFileStatus["status"], string> = {
  added: theme.colors.success,
  modified: theme.colors.warning,
  deleted: theme.colors.error,
}
const STATUS_LABEL: Record<VcsFileStatus["status"], string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
}

export function VcsScreen({ directory, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { activeConnection } = useConnection()
  const [info, setInfo] = useState<VcsInfo | null>(null)
  const [files, setFiles] = useState<VcsFileStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activeConnection) return
    setLoadError(null)
    try {
      const [branchInfo, status] = await Promise.all([
        api.getVcsInfo(activeConnection, directory),
        api.getVcsStatus(activeConnection, directory),
      ])
      setInfo(branchInfo)
      setFiles(status)
    } catch (err) {
      console.error("Failed to load VCS:", err)
      setLoadError("加载失败，请检查项目是否为 Git 仓库")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeConnection, directory])

  useEffect(() => {
    load()
  }, [load])

  const loadDiff = useCallback(async () => {
    if (!activeConnection) return
    setDiffLoading(true)
    setDiff(null)
    try {
      const raw = await api.getVcsDiffRaw(activeConnection, directory)
      setDiff(raw || "（没有未提交的改动）")
    } catch (err) {
      console.error("Failed to load diff:", err)
      setDiff("加载 diff 失败")
    } finally {
      setDiffLoading(false)
    }
  }, [activeConnection, directory])

  const onRefresh = () => {
    setRefreshing(true)
    load()
  }

  const headerPad = { paddingTop: insets.top + theme.spacing.sm }
  const totalAdd = files.reduce((s, f) => s + f.additions, 0)
  const totalDel = files.reduce((s, f) => s + f.deletions, 0)

  // --- Diff view ---
  if (diff !== null) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, headerPad]}>
          <TouchableOpacity onPress={() => setDiff(null)} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 改动</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>完整 Diff</Text>
          <TouchableOpacity style={styles.copyButton} onPress={() => Share.share({ message: diff })}>
            <Text style={styles.copyText}>复制</Text>
          </TouchableOpacity>
        </View>
        {diffLoading ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
        ) : (
          <ScrollView style={styles.diffScroll} contentContainerStyle={styles.diffContent}>
            {/* Render as a single code block so +/- lines are monospaced. */}
            <MarkdownText text={"```diff\n" + diff + "\n```"} color={theme.colors.text} />
          </ScrollView>
        )}
      </View>
    )
  }

  // --- Status list ---
  return (
    <View style={styles.container}>
      <View style={[styles.header, headerPad]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 项目</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Git 改动</Text>
        {files.length > 0 ? (
          <TouchableOpacity onPress={loadDiff} style={styles.diffButton}>
            <Text style={styles.diffButtonText}>Diff</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Branch + summary banner */}
      <View style={styles.branchBar}>
        {info?.branch ? <Text style={styles.branchText}>🌿 {info.branch}</Text> : null}
        <Text style={styles.summaryText}>
          <Text style={{ color: theme.colors.success }}>+{totalAdd}</Text>
          {"  "}
          <Text style={{ color: theme.colors.error }}>-{totalDel}</Text>
          {"  ·  "}
          {files.length} 个文件
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); load() }}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={files}
          keyExtractor={(item) => item.file}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => {
            const name = item.file.split("/").pop() || item.file
            const dir = item.file.includes("/") ? item.file.slice(0, item.file.length - name.length - 1) : ""
            return (
              <View style={styles.fileItem}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status] }]}>
                  <Text style={styles.statusBadgeText}>{STATUS_LABEL[item.status][0]}</Text>
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
                  {dir ? <Text style={styles.fileDir} numberOfLines={1}>{dir}</Text> : null}
                </View>
                <Text style={styles.lineCount}>
                  <Text style={{ color: theme.colors.success }}>+{item.additions}</Text>
                  {" "}
                  <Text style={{ color: theme.colors.error }}>-{item.deletions}</Text>
                </Text>
              </View>
            )
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>工作区干净，没有未提交的改动</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: theme.spacing.xl },
  header: { flexDirection: "row", alignItems: "center", padding: theme.spacing.lg, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  backButton: { padding: theme.spacing.sm },
  backButtonText: { color: theme.colors.primary, fontSize: theme.fontSize.md },
  headerTitle: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "600" },
  diffButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary },
  diffButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: "600" },
  copyButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceLight },
  copyText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: "600" },
  branchBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  branchText: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "600" },
  summaryText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  list: { flex: 1 },
  fileItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  statusBadge: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  fileInfo: { flex: 1 },
  fileName: { color: theme.colors.text, fontSize: theme.fontSize.md },
  fileDir: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 2 },
  lineCount: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontFamily: "monospace" },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.fontSize.md, textAlign: "center", marginTop: theme.spacing.xxl },
  errorText: { color: theme.colors.error, fontSize: theme.fontSize.md, textAlign: "center", marginBottom: theme.spacing.lg },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  retryText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  diffScroll: { flex: 1 },
  diffContent: { padding: theme.spacing.lg },
})
