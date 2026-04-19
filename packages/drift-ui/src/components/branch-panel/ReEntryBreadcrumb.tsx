/** 回归面包屑 — 切换回已访问分支时显示上次进展 */
import { useState, useEffect } from 'react'
import { useReEntryBreadcrumb } from '../../hooks/use-messages'
import { useMessages } from '../../hooks/use-messages'

/** 回归面包屑属性 */
interface ReEntryBreadcrumbProps {
  branchId: string
}

/** 显示"上次你在这里"提示，首条新消息后自动消失 */
export function ReEntryBreadcrumb({ branchId }: ReEntryBreadcrumbProps) {
  const currentTopic = useReEntryBreadcrumb(branchId)
  const messages = useMessages(branchId)
  const [initialMessageCount] = useState(messages.length)
  const [dismissed, setDismissed] = useState(false)

  // 当有新消息时自动消失
  useEffect(() => {
    if (messages.length > initialMessageCount) {
      setDismissed(true)
    }
  }, [messages.length, initialMessageCount])

  if (!currentTopic || dismissed) return null

  return (
    <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-arc-primary/10 border border-arc-primary/30 rounded-xl flex items-center gap-2">
      <span className="text-arc-primary text-sm">&#x21A9;</span>
      <span className="text-sm text-arc-text">
        上次你在这里：
        <span className="font-medium">{currentTopic}</span>
      </span>
      <button
        className="ml-auto text-arc-text-muted hover:text-arc-text text-xs"
        onClick={() => setDismissed(true)}
      >
        关闭
      </button>
    </div>
  )
}
