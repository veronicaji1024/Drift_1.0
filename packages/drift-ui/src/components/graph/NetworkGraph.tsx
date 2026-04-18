/** 力导向网络图 — SVG 渲染分支拓扑，D3-force 物理模拟 */
import { useEffect, useRef, useState, useCallback, useMemo, type MouseEvent } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useDriftStore } from '../../store/drift-store'
import type { BranchTreeNode } from '@drift/storage'

// ─── 类型定义 ───

/** 图节点（D3 simulation 需要 x, y） */
interface GraphNode extends SimulationNodeDatum {
  id: string
  label: string
  status: string
  messageCount: number
  radius: number
  parentId: string | null
}

/** 图连线 */
interface GraphLink extends SimulationLinkDatum<GraphNode> {
  type: 'parent-child' | 'cross-branch'
}

/** 右键菜单状态 */
interface ContextMenuState {
  x: number
  y: number
  branchId: string
}

// ─── 工具函数 ───

/** 节点颜色映射 */
const STATUS_COLORS: Record<string, string> = {
  active: '#6366F1',
  idle: '#9CA3AF',
  archived: '#D1D5DB',
  exploring: '#3B82F6',
  converging: '#F59E0B',
  concluded: '#10B981',
}

/** 根据消息数计算节点半径 */
function computeRadius(messageCount: number): number {
  return Math.max(16, Math.min(40, 16 + Math.sqrt(messageCount) * 6))
}

/** 递归遍历树节点，收集图节点和连线 */
function flattenTree(
  node: BranchTreeNode,
  parentId: string | null,
  messageCounts: Record<string, number>,
  nodes: GraphNode[],
  links: GraphLink[],
): void {
  const count = messageCounts[node.id] ?? 0
  nodes.push({
    id: node.id,
    label: node.label,
    status: node.status,
    messageCount: count,
    radius: computeRadius(count),
    parentId,
  })
  if (parentId) {
    links.push({ source: parentId, target: node.id, type: 'parent-child' })
  }
  for (const child of node.children) {
    flattenTree(child, node.id, messageCounts, nodes, links)
  }
}

/** 截取摘要文字（≤10字） */
function truncateSummary(text: string, maxLen = 10): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// ─── 组件 ───

/** 力导向网络图主组件 */
export function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const zoomTransformRef = useRef<ZoomTransform | null>(null)

  /** 容器尺寸（通过 ResizeObserver 更新） */
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })

  const tree = useDriftStore((s) => s.tree)
  const branches = useDriftStore((s) => s.branches)
  const messagesByBranch = useDriftStore((s) => s.messagesByBranch)
  const globalMap = useDriftStore((s) => s.globalMap)
  const activeBranchId = useDriftStore((s) => s.activeBranchId)
  const observations = useDriftStore((s) => s.observations)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const renameBranch = useDriftStore((s) => s.renameBranch)
  const archiveBranch = useDriftStore((s) => s.archiveBranch)
  const mergeBranches = useDriftStore((s) => s.mergeBranches)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})

  // ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 计算每个分支的消息数
  const messageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [branchId, msgs] of Object.entries(messagesByBranch)) {
      counts[branchId] = msgs.length
    }
    return counts
  }, [messagesByBranch])

  // 每个节点的摘要文字（从 observations 提取）
  const nodeSummaries = useMemo(() => {
    const summaries: Record<string, string> = {}
    for (const [branchId, obs] of Object.entries(observations)) {
      if (obs.length > 0) {
        const latest = obs[obs.length - 1]
        const text = latest.currentTask || latest.topics[0] || ''
        if (text) summaries[branchId] = truncateSummary(text)
      }
    }
    return summaries
  }, [observations])

  // 从树构建图数据
  const { nodes, links } = useMemo(() => {
    const n: GraphNode[] = []
    const l: GraphLink[] = []
    if (tree) {
      flattenTree(tree, null, messageCounts, n, l)
    }
    if (globalMap) {
      for (const insight of globalMap.crossBranchInsights) {
        if (insight.branchIds.length >= 2) {
          for (let i = 0; i < insight.branchIds.length - 1; i++) {
            const srcExists = n.some((node) => node.id === insight.branchIds[i])
            const tgtExists = n.some((node) => node.id === insight.branchIds[i + 1])
            if (srcExists && tgtExists) {
              l.push({ source: insight.branchIds[i], target: insight.branchIds[i + 1], type: 'cross-branch' })
            }
          }
        }
      }
    }
    return { nodes: n, links: l }
  }, [tree, messageCounts, globalMap])

  // D3 force simulation — 使用容器尺寸而非 window 尺寸
  useEffect(() => {
    if (nodes.length === 0) return

    const { width, height } = containerSize

    for (const node of nodes) {
      const existing = nodePositions[node.id]
      if (existing) {
        node.x = existing.x
        node.y = existing.y
      } else if (node.parentId && nodePositions[node.parentId]) {
        const parent = nodePositions[node.parentId]
        node.x = parent.x + (Math.random() - 0.5) * 50
        node.y = parent.y + (Math.random() - 0.5) * 50
      }
    }

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const src = d.source as GraphNode
            const tgt = d.target as GraphNode
            return (src.radius + tgt.radius) * 2.5 + 40
          })
      )
      .force('charge', forceManyBody().strength(-400))
      .force('center', forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', forceCollide<GraphNode>().radius((d) => d.radius + 20))
      .alphaDecay(0.02)

    sim.on('tick', () => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
      }
      setNodePositions(positions)
    })

    simulationRef.current = sim
    return () => { sim.stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, links.length, containerSize.width, containerSize.height])

  // D3 zoom
  useEffect(() => {
    const svg = svgRef.current
    const g = gRef.current
    if (!svg || !g) return

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        select(g).attr('transform', event.transform.toString())
        zoomTransformRef.current = event.transform
      })

    select(svg).call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior

    return () => { select(svg).on('.zoom', null) }
  }, [])

  /** 单击节点切换到该分支 */
  const handleNodeClick = useCallback(
    (branchId: string) => { switchBranch(branchId) },
    [switchBranch]
  )

  const handleContextMenu = useCallback((e: MouseEvent, branchId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, branchId })
  }, [])

  const closeContextMenu = useCallback(() => { setContextMenu(null) }, [])

  const handleRename = useCallback(() => {
    if (!contextMenu) return
    const newLabel = window.prompt('输入新名称')
    if (newLabel) void renameBranch(contextMenu.branchId, newLabel)
    closeContextMenu()
  }, [contextMenu, renameBranch, closeContextMenu])

  const handleArchive = useCallback(() => {
    if (!contextMenu) return
    void archiveBranch(contextMenu.branchId)
    closeContextMenu()
  }, [contextMenu, archiveBranch, closeContextMenu])

  const handleMerge = useCallback(() => {
    if (!contextMenu) return
    const otherBranches = Object.values(branches).filter(
      (b) => b.id !== contextMenu.branchId && b.status !== 'archived'
    )
    if (otherBranches.length === 0) { closeContextMenu(); return }
    const labels = otherBranches.map((b, i) => `${i + 1}. ${b.label}`).join('\n')
    const choice = window.prompt(`合并到哪个分支?\n${labels}`)
    if (choice) {
      const idx = parseInt(choice, 10) - 1
      if (idx >= 0 && idx < otherBranches.length) void mergeBranches(contextMenu.branchId, otherBranches[idx].id)
    }
    closeContextMenu()
  }, [contextMenu, branches, mergeBranches, closeContextMenu])

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" onClick={closeContextMenu}>
      <svg ref={svgRef} className="w-full h-full" style={{ cursor: 'grab' }}>
        <g ref={gRef}>
          {/* 节点间连线 */}
          {links.map((link, i) => {
            const src = typeof link.source === 'object' ? link.source : null
            const tgt = typeof link.target === 'object' ? link.target : null
            const srcPos = src ? nodePositions[src.id] : null
            const tgtPos = tgt ? nodePositions[tgt.id] : null
            if (!srcPos || !tgtPos) return null

            return (
              <line
                key={`link-${i}`}
                x1={srcPos.x}
                y1={srcPos.y}
                x2={tgtPos.x}
                y2={tgtPos.y}
                stroke={link.type === 'cross-branch' ? '#C4B5A0' : '#D1C4B0'}
                strokeWidth={link.type === 'cross-branch' ? 1 : 2.5}
                strokeDasharray={link.type === 'cross-branch' ? '4 4' : undefined}
                strokeOpacity={link.type === 'cross-branch' ? 0.5 : 0.6}
                strokeLinecap="round"
              />
            )
          })}

          {/* 节点 */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id]
            if (!pos) return null

            const isActive = activeBranchId === node.id
            const isHovered = hoveredNode === node.id
            const color = STATUS_COLORS[node.status] ?? STATUS_COLORS.active
            const isArchived = node.status === 'archived'
            const r = isHovered ? node.radius * 1.15 : node.radius
            const summary = nodeSummaries[node.id]

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id) }}
                onContextMenu={(e) => handleContextMenu(e, node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* 活跃节点脉冲光晕 */}
                {isActive && (
                  <circle r={r + 8} fill={color} opacity={0.15} className="animate-pulse" />
                )}

                {/* 主圆 */}
                <circle
                  r={r}
                  fill={color}
                  opacity={isArchived ? 0.3 : 0.85}
                  stroke={isHovered || isActive ? '#fff' : 'none'}
                  strokeWidth={isHovered || isActive ? 2 : 0}
                  style={{ transition: 'opacity 0.2s ease' }}
                />

                {/* 内部小圆点 */}
                <circle r={Math.max(3, r * 0.25)} fill="#fff" opacity={0.4} />

                {/* 分支名称 */}
                <text
                  y={r + 16}
                  textAnchor="middle"
                  className="select-none pointer-events-none"
                  fill="#5C5349"
                  fontSize={11}
                  fontWeight={isActive ? 600 : 400}
                >
                  {node.label}
                </text>

                {/* 摘要文字（来自 observations） */}
                {summary && (
                  <text
                    y={r + 28}
                    textAnchor="middle"
                    className="select-none pointer-events-none"
                    fill="#A09888"
                    fontSize={9}
                    fontStyle="italic"
                  >
                    {summary}
                  </text>
                )}

                {/* 消息数 */}
                {node.messageCount > 0 && (
                  <text
                    y={r + (summary ? 40 : 28)}
                    textAnchor="middle"
                    className="select-none pointer-events-none"
                    fill="#B8B0A4"
                    fontSize={9}
                  >
                    {node.messageCount} 条
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => { switchBranch(contextMenu.branchId); closeContextMenu() }}>
            查看对话
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={handleRename}>
            重命名
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={handleMerge}>
            合并到...
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50" onClick={handleArchive}>
            归档
          </button>
        </div>
      )}

      {/* 提示文字 */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-400 pointer-events-none select-none">
        点击节点查看对话 · 右键更多操作 · 滚轮缩放 · 拖拽平移
      </div>
    </div>
  )
}
