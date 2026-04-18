/** drift-ui 包入口 — 导出应用组件和状态管理 */

// 应用入口
export { DriftApp } from './App'

// 状态管理
export { useDriftStore, injectServices } from './store/drift-store'
export type { DriftStore } from './store/drift-store'

// Hooks
export { useBranch, useActiveBranch, useBranchTree } from './hooks/use-branch'
export { useMessages, useReEntryBreadcrumb } from './hooks/use-messages'
export { useNavigationHints, useSearchResults } from './hooks/use-navigation'

// 主要组件
export { NetworkGraph } from './components/graph/NetworkGraph'
export { ConversationPanel } from './components/panel/ConversationPanel'
export { ResizeHandle } from './components/panel/ResizeHandle'

// 子组件（按需导入）
export { MessageList } from './components/branch-panel/MessageList'
export { ChatInput } from './components/branch-panel/ChatInput'
export { AutoForkNotice } from './components/branch-panel/AutoForkNotice'
export { InlineInsight, InlineInsightList } from './components/branch-panel/InlineInsight'
export { ReEntryBreadcrumb } from './components/branch-panel/ReEntryBreadcrumb'
export { ConvergencePanel } from './components/convergence/ConvergencePanel'
export { SearchPanel } from './components/navigation/SearchPanel'
export { QuickPeek } from './components/navigation/QuickPeek'
