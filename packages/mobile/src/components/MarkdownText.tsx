import React from "react"
import { View, Text, StyleSheet, Platform, TouchableOpacity, Share, Linking, Image, ScrollView } from "react-native"
import { theme } from "../theme"

// A lightweight Markdown renderer for the subset AI replies actually use:
// fenced code blocks (```), inline code (`code`), bold (**), italic (*),
// links [text](url), images ![alt](url), headings (#), blockquotes (>),
// lists, and GFM tables. Intentionally dependency-free to avoid pulling in a
// native-rendering library. Not a full Markdown engine — exotic syntax falls
// back to plain text.

interface Props {
  text: string
  color?: string
}

export function MarkdownText({ text, color }: Props) {
  const blocks = parseBlocks(text)
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => renderBlock(block, i, color))}
    </View>
  )
}

type Block =
  | { type: "code"; lang?: string; content: string }
  | { type: "image"; alt: string; url: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "quote"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; content: string }
  | { type: "spacer" }

// Detects a GFM table separator row like `| --- | :---: | ---: |`.
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const lang = fence[1] || undefined
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ type: "code", lang, content: buf.join("\n") })
      continue
    }
    // Blank line
    if (line.trim() === "") {
      i++
      continue
    }
    // Standalone image: ![alt](url) on its own line.
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (img) {
      blocks.push({ type: "image", alt: img[1], url: img[2] })
      i++
      continue
    }
    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2] })
      i++
      continue
    }
    // GFM table: a header row, then a separator row.
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line)
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "quote", content: buf.join("\n") })
      continue
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""))
        i++
      }
      blocks.push({ type: "list", ordered: false, items })
      continue
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""))
        i++
      }
      blocks.push({ type: "list", ordered: true, items })
      continue
    }
    // Paragraph: gather consecutive non-blank, non-special lines
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^!\[[^\]]*\]\([^)]+\)\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ type: "paragraph", content: buf.join("\n") })
  }
  return blocks
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim())
}

function renderBlock(block: Block, key: number, baseColor?: string): React.ReactNode {
  const textColor = baseColor ?? theme.colors.text
  switch (block.type) {
    case "code":
      return (
        <View key={key} style={styles.codeBlock}>
          <View style={styles.codeHeader}>
            <Text style={styles.codeLang}>{block.lang || "代码"}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={() => Share.share({ message: block.content })}>
              <Text style={styles.copyButtonText}>复制</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.codeText}>{block.content}</Text>
        </View>
      )
    case "image":
      return (
        <Image
          key={key}
          source={{ uri: block.url }}
          style={styles.image}
          accessibilityLabel={block.alt || undefined}
          resizeMode="contain"
        />
      )
    case "table":
      return (
        <ScrollView key={key} horizontal bounces={false} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              {block.headers.map((h, idx) => (
                <Text key={idx} style={[styles.tableCell, styles.tableHeaderCell, { color: textColor }]}>{h}</Text>
              ))}
            </View>
            {block.rows.map((row, ridx) => (
              <View key={ridx} style={styles.tableRow}>
                {row.map((cell, cidx) => (
                  <Text key={cidx} style={[styles.tableCell, { color: textColor }]}>{renderInline(cell, textColor)}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )
    case "quote":
      return (
        <View key={key} style={styles.quote}>
          <Text style={[styles.quoteText, { color: textColor }]}>{renderInline(block.content, textColor)}</Text>
        </View>
      )
    case "heading": {
      const size = block.level <= 2 ? theme.fontSize.lg : theme.fontSize.md
      return (
        <Text key={key} style={[styles.heading, { color: textColor, fontSize: size }]}>
          {renderInline(block.content, textColor)}
        </Text>
      )
    }
    case "list":
      return (
        <View key={key} style={styles.list}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              <Text style={[styles.bullet, { color: textColor }]}>{block.ordered ? `${idx + 1}.` : "•"}</Text>
              <Text style={[styles.listItemText, { color: textColor }]}>{renderInline(item, textColor)}</Text>
            </View>
          ))}
        </View>
      )
    case "paragraph":
      return (
        <Text key={key} style={[styles.paragraph, { color: textColor }]}>
          {renderInline(block.content, textColor)}
        </Text>
      )
    case "spacer":
      return null
  }
}

// Split a paragraph into bold / inline-code / italic / link segments.
function renderInline(text: string, color: string): React.ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter((t) => t !== "")
  return tokens.map((tok, i) => {
    if (/^\*\*[^*]+\*\*$/.test(tok)) {
      return <Text key={i} style={styles.bold}>{tok.slice(2, -2)}</Text>
    }
    if (/^`[^`]+`$/.test(tok)) {
      return <Text key={i} style={styles.inlineCode}>{tok.slice(1, -1)}</Text>
    }
    if (/^\*[^*]+\*$/.test(tok)) {
      return <Text key={i} style={styles.italic}>{tok.slice(1, -1)}</Text>
    }
    // Markdown link [text](url)
    const link = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return (
        <Text key={i} style={styles.link} onPress={() => Linking.openURL(link[2])}>
          {link[1]}
        </Text>
      )
    }
    return <Text key={i}>{tok}</Text>
  })
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm },
  paragraph: { fontSize: theme.fontSize.md, lineHeight: 22 },
  heading: { fontWeight: "700", marginTop: theme.spacing.xs },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  link: { color: theme.colors.primary, textDecorationLine: "underline" },
  inlineCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: theme.fontSize.sm,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 4,
    borderRadius: 3,
    color: theme.colors.accent,
  },
  image: { width: "100%", minHeight: 100, borderRadius: theme.radius.sm, marginTop: theme.spacing.xs },
  tableScroll: { marginVertical: theme.spacing.xs },
  table: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tableHeaderRow: { backgroundColor: theme.colors.background },
  tableCell: { flex: 1, minWidth: 100, padding: theme.spacing.sm, fontSize: theme.fontSize.sm },
  tableHeaderCell: { fontWeight: "700" },
  codeBlock: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },
  codeLang: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: theme.colors.textFaint,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
  },
  copyButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.surfaceLight,
  },
  copyButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.borderLight,
    paddingLeft: theme.spacing.md,
  },
  quoteText: { fontSize: theme.fontSize.sm, fontStyle: "italic" },
  list: { gap: theme.spacing.xs },
  listItem: { flexDirection: "row", gap: theme.spacing.sm },
  bullet: { fontSize: theme.fontSize.md, lineHeight: 22 },
  listItemText: { fontSize: theme.fontSize.md, lineHeight: 22, flex: 1 },
})
