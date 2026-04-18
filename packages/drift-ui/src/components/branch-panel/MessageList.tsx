/** 消息列表 — 渲染分支中的对话消息，支持右键菜单和拖拽 */
import { useState, useCallback, useRef, type MouseEvent, type DragEvent } from 'react'
import { useDriftStore } from '../../store/drift-store'
import type { Message, Branch } from '@drift/storage'

/** 消息右键菜单状态 */
interface MessageContextMenu {
  x: number
  y: number
  messageId: string
}

/** 消息列表属性 */
interface MessageListProps {
  branchId: string
  messages: Message[]
}

/** 单条消息组件 */
function MessageItem({
  message,
  onContextMenu,
  onDragStart,
}: {
  message: Message
  onContextMenu: (e: MouseEvent, id: string) => void
  onDragStart: (e: DragEvent, id: string) => void
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) return null

  return (
    <div
      className={`px-4 py-3 group ${isUser ? 'bg-white' : 'bg-gray-50'}`}
      draggable
      onDragStart={(e) => onDragStart(e, message.id)}
      onContextMenu={(e) => onContextMenu(e, message.id)}
    >
      <div className="flex items-start gap-3 max-w-3xl mx-auto">
        {/* 角色头像 */}
        <div
          className={`
            w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5
            ${isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}
          `}
        >
          {isUser ? '你' : 'AI'}
        </div>

        {/* 消息内容 */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
          <div className="text-xs text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 消息右键菜单 */
function MessageMenu({
  state,
  branches,
  currentBranchId,
  onClose,
}: {
  state: MessageContextMenu
  branches: Record<string, Branch>
  currentBranchId: string
  onClose: () => void
}) {
  const moveMessage = useDriftStore((s) => s.moveMessage)

  const handleMoveToSelect = useCallback(() => {
    const otherBranches = Object.values(branches).filter(
      (b) => b.id !== currentBranchId && b.status !== 'archived'
    )
    if (otherBranches.length === 0) {
      onClose()
      return
    }
    const labels = otherBranches.map((b, i) => `${i + 1}. ${b.label}`).join('\n')
    const choice = window.prompt(`移动到哪个分支?\n${labels}`)
    if (choice) {
      const idx = parseInt(choice, 10) - 1
      if (idx >= 0 && idx < otherBranches.length) {
        void moveMessage(state.messageId, otherBranches[idx].id)
      }
    }
    onClose()
  }, [state.messageId, branches, currentBranchId, moveMessage, onClose])

  const handleForkFromHere = useCallback(() => {
    // Fork from this message — delegates to core via store
    // This would typically call forkManager.fork(currentBranchId, messageId)
    onClose()
  }, [onClose])

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: state.x, top: state.y }}
    >
      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        onClick={handleMoveToSelect}
      >
        移动到其他分支...
      </button>
      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        onClick={handleForkFromHere}
      >
        从这里开分支
      </button>
    </div>
  )
}

/** Loading 指示器 — 三个跳动圆点 */
function LoadingIndicator() {
  return (
    <div className="px-4 py-3 bg-gray-50">
      <div className="flex items-start gap-3 max-w-3xl mx-auto">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5 bg-emerald-100 text-emerald-600">
          AI
        </div>
        <div className="flex items-center gap-1 pt-2">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-xs text-gray-400 ml-2">思考中</span>
        </div>
      </div>
    </div>
  )
}

/** 错误提示卡片 */
function ErrorCard({ message }: { message: string; branchId: string }) {
  return (
    <div className="mx-4 my-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-red-600">
        <span>&#x26A0;</span>
        <span className="flex-1">{message}</span>
      </div>
    </div>
  )
}

/** 消息列表主组件 */
export function MessageList({ branchId, messages }: MessageListProps) {
  const branches = useDriftStore((s) => s.branches)
  const isLoading = useDriftStore((s) => s.loadingBranches.has(branchId))
  const errorMessage = useDriftStore((s) => s.errorByBranch[branchId])
  const [contextMenu, setContextMenu] = useState<MessageContextMenu | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: MouseEvent, messageId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, messageId })
  }, [])

  const handleDragStart = useCallback((e: DragEvent, messageId: string) => {
    e.dataTransfer.setData('text/plain', messageId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto" onClick={closeContextMenu}>
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          开始新对话吧
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
            />
          ))}
        </div>
      )}

      {/* Loading 指示器 */}
      {isLoading && <LoadingIndicator />}

      {/* 错误提示 */}
      {errorMessage && <ErrorCard message={errorMessage} branchId={branchId} />}

      {contextMenu && (
        <MessageMenu
          state={contextMenu}
          branches={branches}
          currentBranchId={branchId}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
