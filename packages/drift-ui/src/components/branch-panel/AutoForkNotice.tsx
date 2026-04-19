/** 自动 fork 提示 — 轻量级顶部横幅，10 秒后自动消失 */
import { useEffect, useCallback, useState } from 'react'
import { useDriftStore } from '../../store/drift-store'

/** 自动 fork 提示组件（仅在触发 fork 的源面板中显示） */
export function AutoForkNotice({ sourceBranchId }: { sourceBranchId?: string }) {
  const notice = useDriftStore((s) => s.autoForkNotice)
  const dismissAutoForkNotice = useDriftStore((s) => s.dismissAutoForkNotice)
  const undoFork = useDriftStore((s) => s.undoFork)
  const renameBranch = useDriftStore((s) => s.renameBranch)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const [isExiting, setIsExiting] = useState(false)

  // 10 秒后自动消失
  useEffect(() => {
    if (!notice) return

    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => {
        dismissAutoForkNotice()
        setIsExiting(false)
      }, 300)
    }, 10000)

    return () => clearTimeout(timer)
  }, [notice, dismissAutoForkNotice])

  /** 跳转到新分支继续聊 */
  const handleContinue = useCallback(() => {
    if (notice) {
      switchBranch(notice.branchId)
      dismissAutoForkNotice()
    }
  }, [notice, switchBranch, dismissAutoForkNotice])

  /** 撤销 fork */
  const handleUndo = useCallback(() => {
    void undoFork()
  }, [undoFork])

  /** 改名 */
  const handleRename = useCallback(() => {
    if (!notice) return
    const newLabel = window.prompt('输入新名称', notice.label)
    if (newLabel) {
      void renameBranch(notice.branchId, newLabel)
    }
  }, [notice, renameBranch])

  // 仅在触发 fork 的源面板中显示，避免多面板重复
  if (!notice) return null
  if (sourceBranchId && notice.parentBranchId !== sourceBranchId) return null

  return (
    <div
      className={`
        mx-4 mt-2 px-4 py-2.5 bg-arc-success/30 border border-arc-success rounded-xl
        flex items-center gap-3 transition-all duration-300
        ${isExiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      <span className="text-arc-text text-sm flex-1">
        已为你开了新分支「<span className="font-medium">{notice.label}</span>」
      </span>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          className="text-xs font-pixel px-2.5 py-1 bg-arc-btn text-white rounded-xl hover:bg-arc-btn-hover transition-colors"
          onClick={handleContinue}
        >
          继续聊
        </button>
        <button
          className="text-xs px-2.5 py-1 text-arc-text-muted hover:text-arc-text hover:bg-arc-border/30 rounded-xl transition-colors"
          onClick={handleUndo}
        >
          撤销
        </button>
        <button
          className="text-xs px-2.5 py-1 text-arc-text-muted hover:text-arc-text hover:bg-arc-border/30 rounded-xl transition-colors"
          onClick={handleRename}
        >
          改名
        </button>
      </div>
    </div>
  )
}
