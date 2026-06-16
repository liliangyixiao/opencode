import React, { useState, useEffect, useCallback } from "react"
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, TextInput, RefreshControl, Share } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { theme } from "../theme"
import { useConnection } from "../hooks/useConnection"
import { api } from "../services/api"
import { MarkdownText } from "../components/MarkdownText"
import type { FileEntry, FileContent, SearchMatch } from "../types"

interface Props {
  directory: string
  onBack: () => void
}

type Mode = "browse" | "view" | "search"

export function FileBrowserScreen({ directory, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { activeConnection } = useConnection()
  // Directory navigation: segments of the current relative path, e.g. ["src","components"].
  const [segments, setSegments] = useState<string[]>([])
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [mode, setMode] = useState<Mode>("browse")
  // File viewer state
  const [viewingPath, setViewingPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([])
  const [searching, setSearching] = useState(false)

  const currentPath = segments.join("/")

  const loadDir = useCallback(async () => {
    if (!activeConnection) return
    setLoadError(null)
    try {
      const list = await api.listFiles(activeConnection, currentPath, directory)
      setEntries(list)
    } catch (err) {
      console.error("Failed to list files:", err)
      setLoadError("加载目录失败，请重试")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeConnection, currentPath, directory])

  useEffect(() => {
    if (mode === "browse") loadDir()
  }, [mode, loadDir])

  const openFile = useCallback(async (path: string) => {
    if (!activeConnection) return
    setViewingPath(path)
    setFileContent(null)
    setFileLoading(true)
    setMode("view")
    try {
      const content = await api.readFile(activeConnection, path, directory)
      setFileContent(content)
    } catch (err) {
      console.error("Failed to read file:", err)
      setFileContent({ type: "text", content: "读取文件失败" })
    } finally {
      setFileLoading(false)
    }
  }, [activeConnection, directory])

  const runSearch = useCallback(async () => {
    if (!activeConnection || !searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await api.findText(activeConnection, searchQuery.trim(), directory)
      setSearchResults(results)
    } catch (err) {
      console.error("Search failed:", err)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [activeConnection, searchQuery, directory])

  const enterDir = (name: string) => setSegments((s) => [...s, name])
  const goToSegment = (index: number) => setSegments((s) => s.slice(0, index + 1))

  const headerPad = { paddingTop: insets.top + theme.spacing.sm }
  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.ignored)

  // --- File viewer mode ---
  if (mode === "view" && viewingPath) {
    const fileName = viewingPath.split("/").pop() || viewingPath
    return (
      <View style={styles.container}>
        <View style={[styles.header, headerPad]}>
          <TouchableOpacity onPress={() => setMode("browse")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 目录</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{fileName}</Text>
          {fileContent?.type === "text" ? (
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => Share.share({ message: fileContent.content })}
              accessibilityRole="button"
              accessibilityLabel="复制文件内容"
            >
              <Text style={styles.copyText}>复制</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {fileLoading ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
        ) : (
          <ScrollView style={styles.fileScroll} contentContainerStyle={styles.fileContent}>
            {fileContent?.type === "binary" ? (
              <Text style={styles.binaryText}>二进制文件，无法预览</Text>
            ) : fileContent ? (
              <MarkdownText text={"```\n" + fileContent.content + "\n```"} color={theme.colors.text} />
            ) : null}
          </ScrollView>
        )}
      </View>
    )
  }

  // --- Search mode ---
  if (mode === "search") {
    return (
      <View style={styles.container}>
        <View style={[styles.header, headerPad]}>
          <TouchableOpacity onPress={() => setMode("browse")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 目录</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>搜索</Text>
        </View>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索文件内容..."
            placeholderTextColor={theme.colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={runSearch}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={runSearch} disabled={searching}>
            <Text style={styles.searchBtnText}>搜索</Text>
          </TouchableOpacity>
        </View>
        {searching ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
        ) : (
          <FlatList
            style={styles.list}
            data={searchResults}
            keyExtractor={(item, idx) => `${item.path}:${item.line}:${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.searchResult} onPress={() => openFile(item.path)}>
                <Text style={styles.searchResultPath} numberOfLines={1}>{item.path}:{item.line}</Text>
                <Text style={styles.searchResultText} numberOfLines={2}>{item.text.trim()}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchQuery ? <Text style={styles.emptyText}>无匹配结果</Text> : <Text style={styles.emptyText}>输入关键词搜索项目文件内容</Text>
            }
          />
        )}
      </View>
    )
  }

  // --- Browse mode (default) ---
  return (
    <View style={styles.container}>
      <View style={[styles.header, headerPad]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 项目</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>文件</Text>
        <TouchableOpacity onPress={() => setMode("search")} accessibilityRole="button" accessibilityLabel="搜索文件内容">
          <Text style={styles.searchIconText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Breadcrumb */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb} contentContainerStyle={styles.breadcrumbContent}>
        <TouchableOpacity onPress={() => setSegments([])}>
          <Text style={styles.breadcrumbRoot}>根目录</Text>
        </TouchableOpacity>
        {segments.map((seg, idx) => (
          <View key={idx} style={styles.breadcrumbItem}>
            <Text style={styles.breadcrumbSep}>/</Text>
            <TouchableOpacity onPress={() => goToSegment(idx)}>
              <Text style={styles.breadcrumbSeg} numberOfLines={1}>{seg}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <View style={styles.optionsRow}>
        <TouchableOpacity style={styles.hiddenToggle} onPress={() => setShowHidden((v) => !v)}>
          <Text style={styles.hiddenToggleText}>{showHidden ? "◉ 隐藏文件可见" : "◯ 隐藏文件"}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); loadDir() }}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={visibleEntries}
          keyExtractor={(item) => item.path}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDir() }} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.fileItem}
              onPress={() => (item.type === "directory" ? enterDir(item.name) : openFile(item.path))}
            >
              <Text style={styles.fileIcon}>{item.type === "directory" ? "📁" : "📄"}</Text>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                {item.ignored ? <Text style={styles.fileIgnored}>已忽略</Text> : null}
              </View>
              {item.type === "directory" ? <Text style={styles.chevron}>›</Text> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>空目录</Text>}
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
  copyButton: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceLight },
  copyText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: "600" },
  searchIconText: { fontSize: theme.fontSize.lg },
  breadcrumb: { backgroundColor: theme.colors.surface, maxHeight: 44 },
  breadcrumbContent: { alignItems: "center", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.xs },
  breadcrumbRoot: { color: theme.colors.primary, fontSize: theme.fontSize.sm },
  breadcrumbItem: { flexDirection: "row", alignItems: "center" },
  breadcrumbSep: { color: theme.colors.textFaint, marginHorizontal: 4 },
  breadcrumbSeg: { color: theme.colors.text, fontSize: theme.fontSize.sm, maxWidth: 120 },
  optionsRow: { flexDirection: "row", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  hiddenToggle: { paddingVertical: theme.spacing.xs },
  hiddenToggleText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  list: { flex: 1 },
  fileItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing.md },
  fileIcon: { fontSize: theme.fontSize.lg },
  fileInfo: { flex: 1 },
  fileName: { color: theme.colors.text, fontSize: theme.fontSize.md },
  fileIgnored: { color: theme.colors.textFaint, fontSize: theme.fontSize.xs, marginTop: 2 },
  chevron: { color: theme.colors.textFaint, fontSize: theme.fontSize.xl },
  emptyText: { color: theme.colors.textFaint, fontSize: theme.fontSize.md, textAlign: "center", marginTop: theme.spacing.xxl },
  errorText: { color: theme.colors.error, fontSize: theme.fontSize.md, textAlign: "center", marginBottom: theme.spacing.lg },
  retryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  retryText: { color: "#fff", fontSize: theme.fontSize.md, fontWeight: "600" },
  // File viewer
  fileScroll: { flex: 1 },
  fileContent: { padding: theme.spacing.lg },
  binaryText: { color: theme.colors.textFaint, fontSize: theme.fontSize.md, textAlign: "center", marginTop: theme.spacing.xxl },
  // Search
  searchBar: { flexDirection: "row", padding: theme.spacing.lg, backgroundColor: theme.colors.surface, gap: theme.spacing.sm },
  searchInput: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.radius.md, padding: theme.spacing.md, color: theme.colors.text, fontSize: theme.fontSize.sm, borderWidth: 1, borderColor: theme.colors.border },
  searchBtn: { paddingHorizontal: theme.spacing.lg, justifyContent: "center", backgroundColor: theme.colors.primary, borderRadius: theme.radius.md },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  searchResult: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  searchResultPath: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontFamily: "monospace" },
  searchResultText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 },
})
