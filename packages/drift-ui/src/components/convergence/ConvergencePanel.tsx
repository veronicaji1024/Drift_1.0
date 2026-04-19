/** 收敛面板 — 选择分支和格式，生成结构化交付物 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDriftStore } from '../../store/drift-store'
import type { OutputFormat } from '@drift/storage'

/** 输出格式选项 */
const FORMAT_OPTIONS: Array<{ value: OutputFormat; label: string; description: string }> = [
  { value: 'outline', label: '大纲', description: '层次化要点提炼' },
  { value: 'structured-summary', label: '结构化摘要', description: '按主题分类的摘要' },
  { value: 'comparison', label: '对比表', description: '多方案横向对比' },
  { value: 'decision-matrix', label: '决策矩阵', description: '带权重的评分矩阵' },
  { value: 'full-report', label: '完整报告', description: '含背景、分析和结论的完整文档' },
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
  const convergenceResult = useDriftStore((s) => s.convergenceResult)
  const isGenerating = useDriftStore((s) => s.convergenceLoading)
  const convergenceError = useDriftStore((s) => s.convergenceError)

  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('outline')

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
      for (const insight of globalMap.crossThemeConnections) {
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
  const handleGenerate = useCallback(() => {
    if (selectedBranches.size === 0) return
    void requestConvergence(Array.from(selectedBranches), selectedFormat)
  }, [selectedBranches, selectedFormat, requestConvergence])

  /** 复制结果到剪贴板 */
  const handleCopy = useCallback(() => {
    if (convergenceResult) {
      void navigator.clipboard.writeText(convergenceResult.content)
    }
  }, [convergenceResult])

  if (!convergencePanelOpen) return null

  return (
    <div className="w-80 h-full border-l border-arc-border bg-arc-panel flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-arc-border flex items-center justify-between">
        <h2 className="text-sm font-pixel font-semibold text-arc-text">收敛输出</h2>
        <button
          className="text-arc-text-muted hover:text-arc-text text-lg leading-none"
          onClick={toggleConvergencePanel}
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 分支选择器 */}
        <div>
          <h3 className="text-xs font-pixel font-medium text-arc-text-muted mb-2">选择分支</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectableBranches.map((branch) => (
              <label
                key={branch.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-arc-border/30 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-arc-border text-arc-btn focus:ring-arc-primary"
                  checked={selectedBranches.has(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                />
                <span className="text-sm text-arc-text truncate">{branch.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 格式选择器 */}
        <div>
          <h3 className="text-xs font-pixel font-medium text-arc-text-muted mb-2">输出格式</h3>
          <div className="space-y-1">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`
                  flex flex-col px-3 py-2 rounded-xl border cursor-pointer transition-colors
                  ${selectedFormat === opt.value
                    ? 'border-arc-primary bg-arc-primary/10'
                    : 'border-arc-border hover:border-arc-primary/50'}
                `}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="format"
                    className="text-arc-btn focus:ring-arc-primary"
                    checked={selectedFormat === opt.value}
                    onChange={() => setSelectedFormat(opt.value)}
                  />
                  <span className="text-sm font-medium text-arc-text">{opt.label}</span>
                </div>
                <span className="text-xs text-arc-text-muted ml-6">{opt.description}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 生成按钮 */}
        <button
          className="
            w-full py-2.5 bg-arc-btn text-white text-sm font-pixel font-medium rounded-xl
            hover:bg-arc-btn-hover active:bg-arc-btn-hover
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors
          "
          disabled={selectedBranches.size === 0 || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? '生成中...' : '生成交付物'}
        </button>

        {/* 错误提示 */}
        {convergenceError && (
          <div className="px-3 py-2 bg-arc-error/30 border border-arc-error rounded-xl text-sm text-arc-text">
            {convergenceError}
          </div>
        )}

        {/* 结果展示 */}
        {convergenceResult && (
          <div className="border border-arc-border rounded-xl">
            <div className="px-3 py-2 border-b border-arc-border/50 flex items-center justify-between">
              <span className="text-xs font-pixel font-medium text-arc-text-muted">生成结果</span>
              <div className="flex gap-1">
                <button
                  className="text-xs text-arc-primary hover:text-arc-btn"
                  onClick={handleCopy}
                >
                  复制
                </button>
              </div>
            </div>
            <div className="px-3 py-2 text-sm text-arc-text whitespace-pre-wrap max-h-60 overflow-y-auto">
              {convergenceResult.content}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
