/** 聊天输入框 — 文字输入 + 导航建议浮层 */
import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { useDriftStore } from '../../store/drift-store'
import { useNavigationSuggestions } from '../../hooks/use-navigation'

/** 聊天输入属性 */
interface ChatInputProps {
  branchId: string
}

/** 聊天输入组件 */
export function ChatInput({ branchId }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useDriftStore((s) => s.sendMessage)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const setDraft = useDriftStore((s) => s.setDraft)
  const isLoading = useDriftStore((s) => s.loadingBranches.has(branchId))
  const userAvatar = useDriftStore((s) => s.userAvatar)
  const navigationSuggestions = useNavigationSuggestions()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [branchId, userAvatar])

  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus()
  }, [isLoading])

  const handleInputChange = (value: string) => {
    setInput(value)
    setDraft(branchId, value)
  }

  // 取第一条导航建议
  const topSuggestion = navigationSuggestions.length > 0 ? navigationSuggestions[0] : null

  /** 发送消息到指定分支 */
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    void sendMessage(branchId, trimmed)
    setInput('')
    setDraft(branchId, '')
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
    <div className="border-t border-arc-border bg-white/80 backdrop-blur-sm">
      {/* 导航建议浮层 */}
      {topSuggestion && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-arc-warn/30 border border-arc-warn rounded-xl flex items-center gap-2 text-xs">
          <span className="text-arc-text-muted">&#x2192;</span>
          <span className="text-arc-text flex-1 truncate">
            {topSuggestion.reasoning}
            <span className="text-arc-text-muted ml-1">
              ({topSuggestion.action}: {topSuggestion.target})
            </span>
          </span>
        </div>
      )}

      {/* 输入区域 */}
      <div className="p-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          autoFocus
          className="
            flex-1 resize-none rounded-xl border border-arc-border px-3 py-2
            text-sm text-arc-text placeholder-arc-text-muted/50
            focus:outline-none focus:ring-2 focus:ring-arc-primary/40 focus:border-arc-primary
            transition-shadow min-h-[36px] max-h-[100px]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          placeholder={isLoading ? 'AI 正在回复...' : '输入消息...'}
          rows={1}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="
            px-3 py-2 bg-arc-primary text-white text-sm font-pixel font-medium rounded-xl
            hover:bg-arc-btn active:bg-arc-btn
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
