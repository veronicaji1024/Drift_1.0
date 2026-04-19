/** 右侧对话面板 — 固定布局，显示当前活跃分支的对话 */
import { useEffect, useRef } from 'react'
import { useDriftStore } from '../../store/drift-store'
import { useActiveBranch } from '../../hooks/use-branch'
import { MessageList } from '../branch-panel/MessageList'
import { ChatInput } from '../branch-panel/ChatInput'
import { AutoForkNotice } from '../branch-panel/AutoForkNotice'
import { InlineInsightList } from '../branch-panel/InlineInsight'
import { ReEntryBreadcrumb } from '../branch-panel/ReEntryBreadcrumb'

interface ConversationPanelProps {
  width: number
  visible: boolean
  onToggle: () => void
}

/** 右侧对话面板组件 */
export function ConversationPanel({ width, visible, onToggle }: ConversationPanelProps) {
  const { activeBranchId, branch, messages } = useActiveBranch()
  const isLoading = useDriftStore((s) =>
    s.activeBranchId ? s.loadingBranches.has(s.activeBranchId) : false
  )
  /** 自动滚动到底部 */
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isLoading])

  // 状态颜色
  const statusColor = branch?.status === 'active'
    ? 'bg-arc-primary'
    : branch?.status === 'idle'
      ? 'bg-arc-dot'
      : 'bg-arc-border'

  return (
    <div
      className="h-full flex flex-col bg-white/95 backdrop-blur-md border-l border-arc-border overflow-hidden transition-all duration-300 ease-out"
      style={{ width: visible ? width : 0, minWidth: visible ? 320 : 0 }}
    >
      {visible && (
        <>
          {/* 标题栏 */}
          <div className="px-4 py-2.5 border-b border-arc-border/50 flex items-center gap-2 select-none bg-white/80 flex-shrink-0">
            {/* 状态指示 */}
            {activeBranchId && (
              <span className={`w-2 h-2 rounded-full ${statusColor} flex-shrink-0`} />
            )}

            {/* 分支名称 */}
            <h3 className="text-sm font-zhBody font-medium text-arc-text-muted truncate flex-1">
              {branch?.label ?? (activeBranchId ? '未命名分支' : '')}
            </h3>

            {/* Loading 动画 */}
            {isLoading && (
              <div className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 bg-arc-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-arc-primary rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                <span className="w-1.5 h-1.5 bg-arc-primary rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
              </div>
            )}

            {/* 隐藏按钮 */}
            <button
              className="text-arc-text-muted hover:text-arc-text text-xs px-1.5 py-0.5 rounded-xl hover:bg-arc-border/30 transition-colors"
              onClick={onToggle}
              title="隐藏面板"
            >
              &#x25B8;
            </button>
          </div>

          {/* 内容区 */}
          {activeBranchId ? (
            <>
              {/* 自动 fork 提示 */}
              <AutoForkNotice sourceBranchId={activeBranchId} />

              {/* 回归面包屑 */}
              <ReEntryBreadcrumb branchId={activeBranchId} />

              {/* 消息列表 */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <MessageList branchId={activeBranchId} messages={messages} />
                <div ref={messagesEndRef} />
              </div>

              {/* 跨分支洞察 */}
              <InlineInsightList branchId={activeBranchId} />

              {/* 输入框 */}
              <ChatInput branchId={activeBranchId} />
            </>
          ) : (
            /* 空状态 */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-arc-text-muted">
                <div className="text-4xl mb-3 opacity-30">&#x2B50;</div>
                <p className="text-sm font-pixel">点击左侧节点开始对话</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
