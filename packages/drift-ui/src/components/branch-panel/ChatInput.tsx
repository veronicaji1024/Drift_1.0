/** 聊天输入框 — 文字输入 + 导航建议浮层 */
import { useState, useCallback, type KeyboardEvent } from 'react'
import { useDriftStore } from '../../store/drift-store'
import { useNavigationSuggestions } from '../../hooks/use-navigation'

/** 聊天输入属性 */
interface ChatInputProps {
  branchId: string
}

/** 聊天输入组件 */
export function ChatInput({ branchId }: ChatInputProps) {
  const [input, setInput] = useState('')
  const sendMessage = useDriftStore((s) => s.sendMessage)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const isLoading = useDriftStore((s) => s.loadingBranches.has(branchId))
  const navigationSuggestions = useNavigationSuggestions()

  // 取第一条导航建议
  const topSuggestion = navigationSuggestions.length > 0 ? navigationSuggestions[0] : null

  /** 发送消息到指定分支 */
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    void sendMessage(branchId, trimmed)
    setInput('')
  }, [input, sendMessage, branchId, isLoading])

  /** 按 Enter 发送 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm">
      {/* 导航建议浮层 */}
      {topSuggestion && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2 text-xs">
          <span className="text-amber-500">&#x2192;</span>
          <span className="text-amber-700 flex-1 truncate">
            {topSuggestion.reasoning}
            <span className="text-amber-500 ml-1">
              ({topSuggestion.action}: {topSuggestion.target})
            </span>
          </span>
        </div>
      )}

      {/* 输入区域 */}
      <div className="p-3 flex gap-2 items-end">
        <textarea
          className="
            flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2
            text-sm text-gray-800 placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
            transition-shadow min-h-[36px] max-h-[100px]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          placeholder={isLoading ? 'AI 正在回复...' : '输入消息...'}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="
            px-3 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg
            hover:bg-indigo-600 active:bg-indigo-700
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors flex-shrink-0
          "
          disabled={!input.trim() || isLoading}
          onClick={handleSend}
        >
          {isLoading ? '···' : '发送'}
        </button>
      </div>
    </div>
  )
}
