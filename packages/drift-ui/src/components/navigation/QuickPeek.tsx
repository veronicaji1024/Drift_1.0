/** QuickPeek — 悬停预览目标分支摘要的弹出窗口 */
import { useCallback } from 'react'
import { useDriftStore } from '../../store/drift-store'

/** QuickPeek 弹出窗口组件 */
export function QuickPeek() {
  const quickPeekBranchId = useDriftStore((s) => s.quickPeekBranchId)
  const setQuickPeekBranch = useDriftStore((s) => s.setQuickPeekBranch)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const branches = useDriftStore((s) => s.branches)
  const globalMap = useDriftStore((s) => s.globalMap)
  const observations = useDriftStore((s) => s.observations)

  /** 跳转到目标分支 */
  const handleNavigate = useCallback(() => {
    if (quickPeekBranchId) {
      setQuickPeekBranch(null)
      switchBranch(quickPeekBranchId)
    }
  }, [quickPeekBranchId, setQuickPeekBranch, switchBranch])

  /** 关闭 QuickPeek */
  const handleClose = useCallback(() => {
    setQuickPeekBranch(null)
  }, [setQuickPeekBranch])

  if (!quickPeekBranchId) return null

  const branch = branches[quickPeekBranchId]
  const branchObs = observations[quickPeekBranchId] ?? []
  const latestObs = branchObs.length > 0 ? branchObs[branchObs.length - 1] : null

  // 从 GlobalMap 中获取分支主题句
  const branchSummary = globalMap?.branchLandscape.summaries.find(
    (s) => s.branchId === quickPeekBranchId
  )
  const topicSentence = branchSummary?.topicSentence ?? null

  return (
    <div className="fixed z-50 bottom-20 right-8">
      <div
        className="bg-arc-panel border border-arc-border rounded-xl shadow-xl w-72 overflow-hidden"
        onMouseLeave={handleClose}
      >
        {/* 标题 */}
        <div className="px-4 py-3 border-b border-arc-border/50 flex items-center justify-between">
          <span className="text-sm font-pixel font-medium text-arc-text truncate">
            {branch?.label ?? quickPeekBranchId}
          </span>
          <button
            className="text-arc-text-muted hover:text-arc-text text-xs"
            onClick={handleClose}
          >
            &times;
          </button>
        </div>

        {/* 内容 */}
        <div className="px-4 py-3 space-y-2">
          {/* 主题句 */}
          {topicSentence && (
            <p className="text-sm text-arc-text">{topicSentence}</p>
          )}

          {/* 最新 observation 摘要 */}
          {latestObs && (
            <div className="space-y-1">
              {latestObs.topic && (
                <div className="text-xs text-arc-text-muted">
                  <span className="font-medium">当前话题：</span>
                  {latestObs.topic}
                </div>
              )}
              {latestObs.stage && (
                <div className="text-xs text-arc-text-muted">
                  <span className="font-medium">阶段：</span>
                  {latestObs.stage}
                </div>
              )}
              {latestObs.keyPoints.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {latestObs.keyPoints.slice(0, 4).map((point, i) => (
                    <span
                      key={i}
                      className="text-xs bg-arc-border/30 text-arc-text-muted px-1.5 py-0.5 rounded-xl"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!topicSentence && !latestObs && (
            <p className="text-xs text-arc-text-muted">暂无摘要信息</p>
          )}
        </div>

        {/* 跳转按钮 */}
        <div className="px-4 py-2 border-t border-arc-border/50">
          <button
            className="w-full text-center text-xs text-arc-primary hover:text-arc-btn font-pixel font-medium py-1"
            onClick={handleNavigate}
          >
            跳转
          </button>
        </div>
      </div>
    </div>
  )
}
