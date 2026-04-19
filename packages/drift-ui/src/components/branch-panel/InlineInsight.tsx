/** 跨分支洞察注解 — 在对话中内联显示 Synthesizer 发现的关联 */
import { useCallback } from 'react'
import { useDriftStore } from '../../store/drift-store'
import type { CrossThemeConnection } from '@drift/storage'

/** 内联洞察属性 */
interface InlineInsightProps {
  connection: CrossThemeConnection
  currentBranchId: string
}

/** 内联洞察组件 — 展示跨分支关联信息 */
export function InlineInsight({ connection, currentBranchId }: InlineInsightProps) {
  const setQuickPeekBranch = useDriftStore((s) => s.setQuickPeekBranch)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const branches = useDriftStore((s) => s.branches)

  // 找到关联的其他分支（排除当前分支）
  const relatedBranchIds = connection.branchIds.filter((id) => id !== currentBranchId)

  /** 悬停时触发 QuickPeek */
  const handleMouseEnter = useCallback(
    (branchId: string) => {
      setQuickPeekBranch(branchId)
    },
    [setQuickPeekBranch]
  )

  /** 离开时关闭 QuickPeek */
  const handleMouseLeave = useCallback(() => {
    setQuickPeekBranch(null)
  }, [setQuickPeekBranch])

  /** 点击跳转到关联分支 */
  const handleNavigate = useCallback(
    (branchId: string) => {
      setQuickPeekBranch(null)
      switchBranch(branchId)
    },
    [setQuickPeekBranch, switchBranch]
  )

  if (relatedBranchIds.length === 0) return null

  return (
    <div className="mx-4 my-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-purple-400 flex-shrink-0 mt-0.5" aria-hidden="true">
          &#x1F4A1;
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-purple-700 font-medium">{connection.nature}</p>
          <p className="text-xs text-purple-600 mt-0.5">{connection.significance}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {relatedBranchIds.map((branchId) => {
              const label = branches[branchId]?.label ?? branchId
              return (
                <button
                  key={branchId}
                  className="text-xs text-purple-500 hover:text-purple-700 hover:underline"
                  onMouseEnter={() => handleMouseEnter(branchId)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleNavigate(branchId)}
                >
                  [查看: {label}]
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 分支内所有跨分支洞察列表 */
interface InlineInsightListProps {
  branchId: string
}

/** 渲染当前分支相关的所有跨主题关联 */
export function InlineInsightList({ branchId }: InlineInsightListProps) {
  const globalMap = useDriftStore((s) => s.globalMap)

  if (!globalMap) return null

  const relevantConnections = globalMap.crossThemeConnections.filter((conn) =>
    conn.branchIds.includes(branchId)
  )

  if (relevantConnections.length === 0) return null

  return (
    <>
      {relevantConnections.map((conn, idx) => (
        <InlineInsight key={idx} connection={conn} currentBranchId={branchId} />
      ))}
    </>
  )
}
