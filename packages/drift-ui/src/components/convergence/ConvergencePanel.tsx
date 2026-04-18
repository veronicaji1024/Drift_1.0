/** 收敛面板 — 选择分支和格式，生成结构化交付物 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDriftStore } from '../../store/drift-store'
import type { OutputFormat } from '@drift/storage'

/** 输出格式选项 */
const FORMAT_OPTIONS: Array<{ value: OutputFormat; label: string; description: string }> = [
  { value: 'outline', label: '大纲', description: '层次化要点提炼' },
  { value: 'comparison', label: '对比表', description: '多方案横向对比' },
  { value: 'decision-matrix', label: '决策矩阵', description: '带权重的评分矩阵' },
  { value: 'checklist', label: '清单', description: '可执行的待办列表' },
  { value: 'prose', label: '自由摘要', description: '连贯的文字总结' },
  { value: 'custom', label: '自定义', description: '自由指定输出模板' },
]

/** 收敛面板主组件 */
export function ConvergencePanel() {
  const convergencePanelOpen = useDriftStore((s) => s.convergencePanelOpen)
  const toggleConvergencePanel = useDriftStore((s) => s.toggleConvergencePanel)
  const branches = useDriftStore((s) => s.branches)
  const activeBranchId = useDriftStore((s) => s.activeBranchId)
  const globalMap = useDriftStore((s) => s.globalMap)
  const requestConvergence = useDriftStore((s) => s.requestConvergence)

  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('outline')
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // 可选的分支列表（排除已归档）
  const selectableBranches = useMemo(
    () => Object.values(branches).filter((b) => b.status !== 'archived'),
    [branches]
  )

  // 自动选中当前分支和关联分支
  useEffect(() => {
    if (!activeBranchId) return
    const initial = new Set<string>([activeBranchId])

    // 添加 GlobalMap 中相关的分支
    if (globalMap) {
      for (const insight of globalMap.crossBranchInsights) {
        if (insight.branchIds.includes(activeBranchId)) {
          insight.branchIds.forEach((id) => initial.add(id))
        }
      }
    }

    setSelectedBranches(initial)
  }, [activeBranchId, globalMap])

  /** 切换分支选中状态 */
  const toggleBranch = useCallback((id: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /** 生成交付物 */
  const handleGenerate = useCallback(async () => {
    if (selectedBranches.size === 0) return
    setIsGenerating(true)
    setResult(null)

    try {
      await requestConvergence(Array.from(selectedBranches), selectedFormat)
      // 结果会通过事件更新到 store，这里模拟一个简单提示
      setResult('交付物生成中，请稍候...')
    } finally {
      setIsGenerating(false)
    }
  }, [selectedBranches, selectedFormat, requestConvergence])

  /** 复制结果到剪贴板 */
  const handleCopy = useCallback(() => {
    if (result) {
      void navigator.clipboard.writeText(result)
    }
  }, [result])

  if (!convergencePanelOpen) return null

  return (
    <div className="w-80 h-full border-l border-gray-200 bg-white flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">收敛输出</h2>
        <button
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          onClick={toggleConvergencePanel}
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 分支选择器 */}
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-2">选择分支</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectableBranches.map((branch) => (
              <label
                key={branch.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
                  checked={selectedBranches.has(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                />
                <span className="text-sm text-gray-700 truncate">{branch.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 格式选择器 */}
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-2">输出格式</h3>
          <div className="space-y-1">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`
                  flex flex-col px-3 py-2 rounded-lg border cursor-pointer transition-colors
                  ${selectedFormat === opt.value
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'}
                `}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="format"
                    className="text-indigo-500 focus:ring-indigo-400"
                    checked={selectedFormat === opt.value}
                    onChange={() => setSelectedFormat(opt.value)}
                  />
                  <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                </div>
                <span className="text-xs text-gray-500 ml-6">{opt.description}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 生成按钮 */}
        <button
          className="
            w-full py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-lg
            hover:bg-indigo-600 active:bg-indigo-700
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors
          "
          disabled={selectedBranches.size === 0 || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? '生成中...' : '生成交付物'}
        </button>

        {/* 结果展示 */}
        {result && (
          <div className="border border-gray-200 rounded-lg">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">生成结果</span>
              <div className="flex gap-1">
                <button
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                  onClick={handleCopy}
                >
                  复制
                </button>
              </div>
            </div>
            <div className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
              {result}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
