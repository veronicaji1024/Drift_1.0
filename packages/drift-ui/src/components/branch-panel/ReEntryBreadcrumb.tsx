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
  const currentTask = useReEntryBreadcrumb(branchId)
  const messages = useMessages(branchId)
  const [initialMessageCount] = useState(messages.length)
  const [dismissed, setDismissed] = useState(false)

  // 当有新消息时自动消失
  useEffect(() => {
    if (messages.length > initialMessageCount) {
      setDismissed(true)
    }
  }, [messages.length, initialMessageCount])

  if (!currentTask || dismissed) return null

  return (
    <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-2">
      <span className="text-indigo-400 text-sm">&#x21A9;</span>
      <span className="text-sm text-indigo-700">
        上次你在这里：
        <span className="font-medium">{currentTask}</span>
      </span>
      <button
        className="ml-auto text-indigo-400 hover:text-indigo-600 text-xs"
        onClick={() => setDismissed(true)}
      >
        关闭
      </button>
    </div>
  )
}
