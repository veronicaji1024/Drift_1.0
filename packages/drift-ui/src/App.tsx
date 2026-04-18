/** Drift 应用入口 — 左右分屏：力导向图 + 对话面板 */
import { useCallback, useEffect } from 'react'
import { useDriftStore } from './store/drift-store'
import { NetworkGraph } from './components/graph/NetworkGraph'
import { ConversationPanel } from './components/panel/ConversationPanel'
import { ResizeHandle } from './components/panel/ResizeHandle'
import { ConvergencePanel } from './components/convergence/ConvergencePanel'
import { SearchPanel } from './components/navigation/SearchPanel'
import { QuickPeek } from './components/navigation/QuickPeek'

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
    <div className="relative w-screen h-screen overflow-hidden flex" style={{ backgroundColor: '#FAFAF8' }}>
      {/* 左侧：力导向网络图 */}
      <div className="flex-1 relative min-w-0">
        <NetworkGraph />

        {/* 顶部标题栏 */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-5 pointer-events-none">
          <h1 className="text-lg font-semibold text-gray-600 tracking-wide pointer-events-auto">
            Drift
          </h1>
          <div className="flex items-center gap-3 pointer-events-auto">
            <button
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
              onClick={() => setSearchQuery(' ')}
            >
              &#x2318;K 搜索
            </button>
            <button
              className={`
                text-xs px-2 py-1 rounded border backdrop-blur-sm transition-colors
                ${convergencePanelOpen
                  ? 'text-indigo-600 border-indigo-200 bg-indigo-50/80'
                  : 'text-gray-400 hover:text-gray-600 border-gray-200 bg-white/80'}
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
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm border border-gray-200 border-r-0 rounded-l-lg px-1.5 py-4 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shadow-md"
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
        <div className="absolute top-12 right-0 bottom-0 z-40">
          <ConvergencePanel />
        </div>
      )}

      {/* 覆盖层 */}
      <SearchPanel />
      <QuickPeek />
    </div>
  )
}
