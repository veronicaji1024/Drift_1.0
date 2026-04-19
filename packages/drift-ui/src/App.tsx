/** Drift 应用入口 — 左右分屏：力导向图 + 对话面板 */
import { useCallback, useEffect } from 'react'
import { useDriftStore } from './store/drift-store'
import { AI_QBERT_GRID, TRANSPARENT as _t } from './constants/pixel-art'
import { NetworkGraph } from './components/graph/NetworkGraph'
import { ConversationPanel } from './components/panel/ConversationPanel'
import { ResizeHandle } from './components/panel/ResizeHandle'
import { ConvergencePanel } from './components/convergence/ConvergencePanel'
import { SearchPanel } from './components/navigation/SearchPanel'
import { QuickPeek } from './components/navigation/QuickPeek'
import { ArcadeSprites } from './components/decorations/ArcadeSprites'

/** Drift 应用主组件 */
export function DriftApp() {
  const convergencePanelOpen = useDriftStore((s) => s.convergencePanelOpen)
  const toggleConvergencePanel = useDriftStore((s) => s.toggleConvergencePanel)
  const setSearchQuery = useDriftStore((s) => s.setSearchQuery)
  const rightPanelVisible = useDriftStore((s) => s.rightPanelVisible)
  const rightPanelWidth = useDriftStore((s) => s.rightPanelWidth)
  const toggleRightPanel = useDriftStore((s) => s.toggleRightPanel)
  const setRightPanelWidth = useDriftStore((s) => s.setRightPanelWidth)

  /** 全局快捷键 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchQuery(' ')
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        toggleConvergencePanel()
      }
    },
    [setSearchQuery, toggleConvergencePanel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  /** 拖拽调整面板宽度 */
  const handleResize = useCallback(
    (delta: number) => { setRightPanelWidth(rightPanelWidth + delta) },
    [rightPanelWidth, setRightPanelWidth]
  )

  /** 双击拖拽条重置宽度 */
  const handleResetWidth = useCallback(
    () => { setRightPanelWidth(400) },
    [setRightPanelWidth]
  )

  return (
    <div className="w-screen h-screen overflow-hidden p-0 flex items-center justify-center" style={{ backgroundColor: '#fff' }}>
      {/* CRT 电视机外壳 */}
      <div className="crt-bezel w-full h-full flex items-stretch">
        {/* CRT 屏幕区域 */}
        <div className="crt-screen relative flex-1 flex bg-white overflow-hidden">

          {/* 左侧：力导向网络图 */}
          <div className="flex-1 relative min-w-0">
            <NetworkGraph />

            {/* 顶部标题栏 */}
            <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-5 pointer-events-none">
              {/* Logo: Q*bert 替代字母 D + "rift" 像素字体 */}
              <div className="flex items-center gap-0 pointer-events-auto">
                <svg width="28" height="24" viewBox="0 0 14 11" style={{ imageRendering: 'pixelated' }}>
                  {AI_QBERT_GRID.map((row, py) => row.map((c, px) => c !== _t ? <rect key={`${px}-${py}`} x={px} y={py} width="1" height="1" fill={c} /> : null))}
                </svg>
                <span className="font-arcade text-base text-arc-text ml-0.5" style={{ lineHeight: '24px' }}>
                  drift
                </span>
              </div>
              <div className="flex items-center gap-3 pointer-events-auto">
                <button
                  className="text-xs font-zhBody text-arc-text-muted hover:text-arc-text px-3 py-1.5 rounded-xl border border-arc-border bg-white/80 backdrop-blur-sm transition-colors"
                  onClick={() => setSearchQuery(' ')}
                >
                  &#x2318;K 搜索
                </button>
                <button
                  className={`
                    text-xs font-zhBody px-3 py-1.5 rounded-xl border backdrop-blur-sm transition-colors
                    ${convergencePanelOpen
                      ? 'text-arc-primary border-arc-primary bg-white/80'
                      : 'text-arc-text-muted hover:text-arc-text border-arc-border bg-white/80'}
                  `}
                  onClick={toggleConvergencePanel}
                >
                  收敛
                </button>
              </div>
            </div>

            {/* 面板隐藏时的展开按钮 */}
            {!rightPanelVisible && (
              <button
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-arc-panel/90 backdrop-blur-sm border border-arc-border border-r-0 rounded-l-xl px-1.5 py-4 text-arc-text-muted hover:text-arc-text hover:bg-arc-panel transition-colors shadow-md"
                onClick={toggleRightPanel}
                title="展开对话面板"
              >
                &#x25C2;
              </button>
            )}
          </div>

          {/* 拖拽手柄 */}
          {rightPanelVisible && (
            <ResizeHandle onResize={handleResize} onDoubleClick={handleResetWidth} />
          )}

          {/* 右侧：对话面板 */}
          <ConversationPanel
            width={rightPanelWidth}
            visible={rightPanelVisible}
            onToggle={toggleRightPanel}
          />

          {/* 收敛面板（右侧浮出） */}
          {convergencePanelOpen && (
            <div className="absolute top-0 right-0 bottom-0 z-40">
              <ConvergencePanel />
            </div>
          )}

          {/* 覆盖层 */}
          <SearchPanel />
          <QuickPeek />

          {/* 吃豆人装饰动画 */}
          <ArcadeSprites />

        </div>
      </div>
    </div>
  )
}
