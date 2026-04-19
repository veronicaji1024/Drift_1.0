/** 力导向网络图 — SVG 渲染分支拓扑，D3-force 物理模拟 */
import { useEffect, useRef, useState, useCallback, useMemo, type MouseEvent } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useDriftStore } from '../../store/drift-store'
import { AI_QBERT_GRID, TRANSPARENT as _t, getDepthColor, BEAN_SHAPE, BEAN_HIGHLIGHT } from '../../constants/pixel-art'
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
  depth: number
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

/** 根据消息数和深度计算节点半径 */
function computeRadius(messageCount: number, depth: number): number {
  if (depth === 0) {
    return Math.max(24, Math.min(44, 24 + Math.sqrt(messageCount) * 6))
  }
  return Math.max(10, Math.min(18, 10 + Math.sqrt(messageCount) * 2))
}

/** 递归遍历树节点，收集图节点和连线 */
function flattenTree(
  node: BranchTreeNode,
  parentId: string | null,
  depth: number,
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
    radius: computeRadius(count, depth),
    parentId,
    depth,
  })
  if (parentId) {
    links.push({ source: parentId, target: node.id, type: 'parent-child' })
  }
  for (const child of node.children) {
    flattenTree(child, node.id, depth + 1, messageCounts, nodes, links)
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
  const draggingRef = useRef<{ nodeId: string; didMove: boolean } | null>(null)
  const lastDragRef = useRef(0)

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
        const text = latest.topic || ''
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
      flattenTree(tree, null, 0, messageCounts, n, l)
    }
    if (globalMap) {
      for (const insight of globalMap.crossThemeConnections) {
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

  // D3 force simulation — 树状布局
  useEffect(() => {
    if (nodes.length === 0) return

    const { width, height } = containerSize
    const maxDepth = Math.max(...nodes.map((n) => n.depth), 0)
    const depthSpacing = Math.min(180, (width * 0.7) / (maxDepth || 1))

    for (const node of nodes) {
      const existing = nodePositions[node.id]
      if (existing) {
        node.x = existing.x
        node.y = existing.y
      } else {
        node.x = width * 0.12 + node.depth * depthSpacing + (Math.random() - 0.5) * 30
        node.y = height / 2 + (Math.random() - 0.5) * 100
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
            return (src.radius + tgt.radius) * 1.8 + 60
          })
          .strength(0.8)
      )
      .force('charge', forceManyBody().strength(-250))
      .force(
        'x',
        forceX<GraphNode>()
          .x((d) => width * 0.12 + d.depth * depthSpacing)
          .strength(0.3)
      )
      .force(
        'y',
        forceY<GraphNode>()
          .y(height / 2)
          .strength(0.05)
      )
      .force('collide', forceCollide<GraphNode>().radius((d) => d.radius + 15))
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
      .filter((event: any) => {
        if (event.target.closest?.('[data-draggable]')) return false
        return (!event.ctrlKey || event.type === 'wheel') && !event.button
      })
      .on('zoom', (event) => {
        select(g).attr('transform', event.transform.toString())
        zoomTransformRef.current = event.transform
      })

    select(svg).call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior

    return () => { select(svg).on('.zoom', null) }
  }, [])

  /** 单击节点切换到该分支（拖拽后不触发） */
  const handleNodeClick = useCallback(
    (branchId: string) => {
      if (Date.now() - lastDragRef.current < 200) return
      switchBranch(branchId)
    },
    [switchBranch]
  )

  /** 拖拽节点自由摆放 */
  const handleDragStart = useCallback((nodeId: string) => {
    draggingRef.current = { nodeId, didMove: false }
    const sim = simulationRef.current
    if (sim) {
      const node = sim.nodes().find((n) => n.id === nodeId)
      if (node) {
        node.fx = node.x
        node.fy = node.y
        sim.alphaTarget(0.3).restart()
      }
    }

    const onMove = (me: PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current.didMove = true
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const t = zoomTransformRef.current
      const x = t ? (me.clientX - rect.left - t.x) / t.k : me.clientX - rect.left
      const y = t ? (me.clientY - rect.top - t.y) / t.k : me.clientY - rect.top
      const nd = simulationRef.current?.nodes().find((n) => n.id === draggingRef.current!.nodeId)
      if (nd) { nd.fx = x; nd.fy = y }
    }

    const onUp = () => {
      if (draggingRef.current?.didMove) lastDragRef.current = Date.now()
      simulationRef.current?.alphaTarget(0)
      draggingRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

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
          {/* 节点间连线 — 虚线 */}
          {links.map((link, i) => {
            const src = typeof link.source === 'object' ? link.source : null
            const tgt = typeof link.target === 'object' ? link.target : null
            const srcPos = src ? nodePositions[src.id] : null
            const tgtPos = tgt ? nodePositions[tgt.id] : null
            if (!srcPos || !tgtPos) return null

            const isCross = link.type === 'cross-branch'
            const dotSize = isCross ? 2 : 3
            const gap = isCross ? 10 : 8
            const dx = tgtPos.x - srcPos.x
            const dy = tgtPos.y - srcPos.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const count = Math.max(1, Math.floor(dist / gap))

            return (
              <g key={`link-${i}`} opacity={isCross ? 0.15 : 0.25}>
                {Array.from({ length: count + 1 }, (_, j) => {
                  const t = count === 0 ? 0.5 : j / count
                  const cx = srcPos.x + dx * t
                  const cy = srcPos.y + dy * t
                  return (
                    <rect
                      key={j}
                      x={cx - dotSize / 2}
                      y={cy - dotSize / 2}
                      width={dotSize}
                      height={dotSize}
                      fill="#B8AED8"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )
                })}
              </g>
            )
          })}

          {/* 节点 */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id]
            if (!pos) return null

            const isActive = activeBranchId === node.id
            const isHovered = hoveredNode === node.id
            const isArchived = node.status === 'archived'
            const r = isHovered ? node.radius * 1.15 : node.radius
            const summary = nodeSummaries[node.id]
            const beanColor = getDepthColor(node.depth)

            return (
              <g
                key={node.id}
                data-draggable
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'grab' }}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id) }}
                onContextMenu={(e) => handleContextMenu(e, node.id)}
                onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); handleDragStart(node.id) }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {node.depth === 0 ? (
                  /* Q*bert 像素头像 — 仅根节点 */
                  <g
                    transform={`translate(${-r + (r * 2) / 14 * 2}, ${-r}) scale(${(r * 2) / 14})`}
                    opacity={isArchived ? 0.3 : (isHovered ? 1 : 0.9)}
                    style={{ transition: 'opacity 0.2s ease' }}
                  >
                    {AI_QBERT_GRID.map((row, py) => row.map((c, px) => c !== _t ? <rect key={`${px}-${py}`} x={px} y={py} width="1" height="1" fill={c} style={{ imageRendering: 'pixelated' }} /> : null))}
                  </g>
                ) : (
                  /* 像素豆子 — 支线节点 */
                  <g
                    transform={`translate(${-r}, ${-r * 5 / 7}) scale(${(r * 2) / 7})`}
                    opacity={isArchived ? 0.3 : (isHovered ? 1 : 0.85)}
                    style={{
                      transition: 'opacity 0.2s ease',
                      filter: isActive ? 'drop-shadow(0 0 2px #9B8EC4) drop-shadow(0 0 4px #9B8EC4)' : undefined,
                    }}
                  >
                    {BEAN_SHAPE.map((row, py) =>
                      row.map((filled, px) =>
                        filled ? (
                          <rect
                            key={`${px}-${py}`}
                            x={px} y={py}
                            width="1" height="1"
                            fill={BEAN_HIGHLIGHT[py]?.[px] ? '#fff' : beanColor}
                            opacity={BEAN_HIGHLIGHT[py]?.[px] ? 0.6 : 1}
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : null
                      )
                    )}
                  </g>
                )}

                {/* 分支名称 */}
                <text
                  y={r + 16}
                  textAnchor="middle"
                  className="select-none pointer-events-none"
                  fill="#4A4063"
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
                    fill="#8B7FA8"
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
                    fill="#8B7FA8"
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
          className="fixed z-50 bg-arc-panel border border-arc-border rounded-xl shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="w-full text-left px-4 py-2 text-sm text-arc-text hover:bg-arc-border/30"
            onClick={() => { switchBranch(contextMenu.branchId); closeContextMenu() }}>
            查看对话
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-arc-text hover:bg-arc-border/30" onClick={handleRename}>
            重命名
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-arc-text hover:bg-arc-border/30" onClick={handleMerge}>
            合并到...
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-arc-error hover:bg-arc-error/20" onClick={handleArchive}>
            归档
          </button>
        </div>
      )}

      {/* 提示文字 */}
      <div className="absolute bottom-4 left-4 text-xs text-arc-text-muted/50 font-pixel pointer-events-none select-none">
        点击节点查看对话 · 右键更多操作 · 滚轮缩放 · 拖拽平移
      </div>
    </div>
  )
}
