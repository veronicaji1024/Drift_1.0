/** 搜索面板 — 语义搜索所有分支的 observations */
import type { JSX } from 'react'
import { useCallback } from 'react'
import { useDriftStore } from '../../store/drift-store'
import { useSearchResults } from '../../hooks/use-navigation'

/** 高亮匹配文本中的关键词 */
function highlightMatch(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)

  if (idx === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

/** 搜索面板主组件 — 覆盖层形式 */
export function SearchPanel() {
  const searchQuery = useDriftStore((s) => s.searchQuery)
  const setSearchQuery = useDriftStore((s) => s.setSearchQuery)
  const switchBranch = useDriftStore((s) => s.switchBranch)
  const results = useSearchResults(searchQuery)

  /** 关闭搜索面板 */
  const handleClose = useCallback(() => {
    setSearchQuery('')
  }, [setSearchQuery])

  /** 点击结果跳转到分支 */
  const handleResultClick = useCallback(
    (branchId: string) => {
      switchBranch(branchId)
      setSearchQuery('')
    },
    [switchBranch, setSearchQuery]
  )

  // 搜索为空时不显示面板
  if (!searchQuery) return null

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-20">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/20" onClick={handleClose} />

      {/* 搜索内容 */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* 搜索输入框 */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-gray-400 text-sm">&#x1F50D;</span>
          <input
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none"
            placeholder="搜索所有分支..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button
            className="text-gray-400 hover:text-gray-600 text-sm"
            onClick={handleClose}
          >
            ESC
          </button>
        </div>

        {/* 搜索结果 */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              未找到匹配结果
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {results.slice(0, 20).map((r, idx) => (
                <button
                  key={`${r.branchId}-${r.matchedField}-${idx}`}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => handleResultClick(r.branchId)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-indigo-500">{r.branchLabel}</span>
                    <span className="text-xs text-gray-400">{r.matchedField}</span>
                  </div>
                  <p className="text-sm text-gray-700 truncate">
                    {highlightMatch(r.matchedText, searchQuery)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 结果计数 */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            找到 {results.length} 条匹配
          </div>
        )}
      </div>
    </div>
  )
}
