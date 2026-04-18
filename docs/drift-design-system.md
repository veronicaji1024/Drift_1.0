# Drift — Design System

> 无限画布 × 力导向网络图 × 多面板对话
> 视觉理念：**星空拓扑 × 暖调纸质感** — 深色画布上的有机节点生长，面板如纸张般浮于星空之上

---

## 01 · 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | React 19 | 函数组件 + Hooks |
| 状态管理 | Zustand 5 | 单 store，selector 订阅 |
| 图形渲染 | D3-force + SVG | 力导向物理模拟，全屏 SVG 渲染 |
| 缩放平移 | D3-zoom + D3-selection | SVG 坐标变换 |
| 样式方案 | Tailwind CSS (CDN) | Utility-first，无自定义 CSS 文件 |
| 字体 | Inter (sans) · 思源宋体 (serif) | Google Fonts CDN 引入 |
| 图标 | Material Icons | 内联 SVG 或 icon font |
| 构建 | Vite 6 | HMR 开发 + tsup 打包 |
| 类型 | TypeScript 5.7 strict | 零 any |

---

## 02 · 色彩体系

### 核心色板

| 名称 | Hex | CSS 变量 | 语义角色 |
|------|-----|----------|----------|
| **靛蓝 Indigo** | `#6366F1` | `--drift-indigo` | 主色调 — 活跃节点、当前焦点、CTA 按钮 |
| **翡翠 Emerald** | `#10B981` | `--drift-emerald` | AI 回复、成功状态、已收敛节点 |
| **琥珀 Amber** | `#F59E0B` | `--drift-amber` | 收敛中状态、警告、关注提示 |
| **天蓝 Sky** | `#3B82F6` | `--drift-sky` | 探索中状态、跨分支关联线 |
| **珊瑚 Coral** | `#EF4444` | `--drift-coral` | 错误、归档操作、危险按钮 |

### 中性色

| 名称 | Hex | CSS 变量 | 用途 |
|------|-----|----------|------|
| **亚麻白** | `#FAFAF8` | `--drift-linen` | 画布底色 |
| **暖灰 100** | `#F5F0EB` | `--drift-warm-100` | 面板背景、卡片底色 |
| **暖灰 200** | `#E8E0D8` | `--drift-warm-200` | 边框、分割线 |
| **暖灰 300** | `#D1C4B0` | `--drift-warm-300` | 节点间连线 |
| **暖灰 400** | `#C4B5A0` | `--drift-warm-400` | 节点→面板连线、次要文字 |
| **暖灰 500** | `#A09888` | `--drift-warm-500` | 摘要文字、占位符 |
| **暖灰 600** | `#B8B0A4` | `--drift-warm-600` | 消息数标注 |
| **墨灰** | `#5C5349` | `--drift-ink` | 节点标签文字 |
| **炭黑** | `#2D2520` | `--drift-charcoal` | 正文文字 |

### 节点状态色映射

```
active      → #6366F1 (靛蓝)      正在对话的活跃分支
idle        → #9CA3AF (冷灰)      闲置分支
archived    → #D1D5DB (浅灰)      已归档，opacity: 0.3
exploring   → #3B82F6 (天蓝)      探索方向中
converging  → #F59E0B (琥珀)      收敛合并中
concluded   → #10B981 (翡翠)      已得出结论
```

### 语义 Token

| Token | 值 | 用途 |
|-------|------|------|
| `--bg-canvas` | `#FAFAF8` | 全屏画布背景 |
| `--bg-panel` | `rgba(255,255,255,0.95)` | 浮动面板背景（磨砂玻璃） |
| `--bg-panel-header` | `rgba(249,250,251,0.8)` | 面板标题栏 |
| `--bg-user-msg` | `#FFFFFF` | 用户消息行 |
| `--bg-ai-msg` | `#F9FAFB` | AI 回复行 |
| `--border-panel` | `rgba(229,231,235,0.8)` | 面板边框 |
| `--border-divider` | `#F3F4F6` | 消息分割线 |
| `--text-primary` | `#1F2937` | 消息正文 |
| `--text-secondary` | `#6B7280` | 时间戳、次要信息 |
| `--text-muted` | `#9CA3AF` | 提示文字、禁用状态 |

---

## 03 · 字体排版

### 字体族

| 类别 | 字体 | Fallback | 用途 |
|------|------|----------|------|
| Sans | `Inter` | `system-ui, sans-serif` | 所有 UI 文字 |
| Serif | `Noto Serif SC` | `Georgia, serif` | 品牌标题 "Drift" |
| Mono | `JetBrains Mono` | `Courier New, monospace` | 代码片段、技术标注 |

### 字级

| 级别 | 字号 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| Display | 24px | 600 | 1.1 | 品牌标题 "Drift" |
| H1 | 18px | 600 | 1.2 | 面板标题（大） |
| H2 | 14px | 500 | 1.3 | 面板标题栏文字 |
| Body | 14px | 400 | 1.65 | 消息正文 |
| Body Small | 13px | 400 | 1.5 | 辅助文字 |
| Caption | 12px | 400 | 1.4 | 时间戳 |
| Overline | 11px | 500 | 1.2 | 节点标签 |
| Tiny | 9px | 400 | 1.2 | 节点摘要、消息数 |

### 特殊规则

- 节点标签：11px，锚点居中 (`text-anchor: middle`)，活跃节点 `font-weight: 600`
- 节点摘要：9px 斜体，色值 `--drift-warm-500`
- 面板标题：14px `font-medium text-gray-800 truncate`

---

## 04 · 间距与圆角

### 间距系统

基础单位 4px，使用 Tailwind 的 spacing scale：

| Token | 值 | 用途 |
|-------|------|------|
| `gap-0.5` | 2px | 图标间微距 |
| `gap-1` | 4px | 紧凑元素间距 |
| `gap-2` | 8px | 按钮内图标间距 |
| `gap-3` | 12px | 标题栏元素间距 |
| `p-4` / `px-4` | 16px | 面板内边距 |
| `py-2.5` | 10px | 标题栏上下间距 |
| `py-3` | 12px | 消息行上下间距 |

### 圆角

| Token | 值 | 用途 |
|-------|------|------|
| `rounded-full` | 9999px | 状态指示点、头像 |
| `rounded-xl` | 12px | 浮动面板 |
| `rounded-lg` | 8px | 右键菜单、通知条 |
| `rounded` | 4px | 按钮、输入框 |

---

## 05 · 阴影与层叠

### 阴影

| 层级 | 效果 | 用途 |
|------|------|------|
| 无阴影 | — | 画布上的 SVG 元素 |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1)` | 右键菜单 |
| `shadow-xl` | `0 20px 25px -5px rgba(0,0,0,0.1)` | 浮动面板默认 |
| `shadow-2xl` | `0 25px 50px -12px rgba(0,0,0,0.25)` | 浮动面板 hover |

### Z-Index 层叠

| 层 | z-index | 内容 |
|----|---------|------|
| 画布 SVG | 0 | NetworkGraph 力导向图 |
| 右键菜单 | 50 | 节点/消息右键菜单 |
| 覆盖层 | 100+ | SearchPanel、QuickPeek |

### 磨砂玻璃效果

```
bg-white/95 backdrop-blur-md
```
用于对话面板，让底层画布隐约可见。

---

## 06 · 画布元素

### 力导向节点

| 属性 | 规则 |
|------|------|
| 半径 | `max(16, min(40, 16 + √messageCount × 6))` px |
| 填充 | 状态色，`opacity: 0.85`（归档 0.3） |
| 描边 | hover/active 时 `#FFF` 2px，其他无 |
| 内圆点 | `r × 0.25` 半径，`#FFF` `opacity: 0.4` |
| Hover | 半径放大 15% |
| 活跃光晕 | `r + 8` 半径圆，状态色 `opacity: 0.15`，`animate-pulse` |

### 节点间连线

| 类型 | 宽度 | 颜色 | 样式 |
|------|------|------|------|
| 父子关系 | 2.5px | `#D1C4B0` | 实线，`opacity: 0.6` |
| 跨分支关联 | 1px | `#C4B5A0` | 虚线 `4 4`，`opacity: 0.5` |

### 节点文字排列（从上到下）

```
  ┌──── 圆 ────┐
  │  (内圆点)   │
  └────────────┘
    分支名称        ← y = r + 16, 11px, --drift-ink
    摘要(≤10字)     ← y = r + 28, 9px italic, --drift-warm-500
    消息数 "N 条"   ← y = r + 40 (有摘要) 或 r + 28 (无摘要), 9px, --drift-warm-600
```

---

## 07 · 分屏布局

### 整体结构

```
┌──────────────────────────────────┬──┬──────────────────────┐
│                                  │  │                       │
│   力导向网络图 (flex-1)           │拖│  对话面板              │
│   - 单击节点切换右侧对话          │拽│  (ConversationPanel)   │
│   - 右键节点更多操作              │条│  默认宽度 400px        │
│   - 滚轮缩放 / 拖拽平移          │  │  min 320px / max 50vw │
│                                  │  │                       │
└──────────────────────────────────┴──┴──────────────────────┘
```

### 拖拽手柄 (ResizeHandle)

| 属性 | 值 |
|------|------|
| 宽度 | 4px (`w-1`) |
| 默认色 | `bg-gray-200` |
| Hover | `bg-gray-400` |
| 拖拽中 | `bg-indigo-400` |
| 光标 | `cursor: col-resize` |
| 双击 | 重置宽度为 400px |

### 对话面板 (ConversationPanel)

```
┌───────────────────────────────┐
│ 标题栏                         │  bg-gray-50/80, border-b
│  ● 状态点  分支名     [▸隐藏]   │  h ≈ 40px
├───────────────────────────────┤
│ AutoForkNotice (条件显示)       │  bg-emerald-50
├───────────────────────────────┤
│                                │
│  消息列表 (flex-1 overflow)     │  交替 bg-white / bg-gray-50
│                                │
├───────────────────────────────┤
│ InlineInsightList (条件显示)    │
├───────────────────────────────┤
│ 输入框                         │  border-t, p-3
└───────────────────────────────┘
```

### 面板显隐

| 行为 | 实现 |
|------|------|
| 隐藏 | 标题栏 `▸` 按钮，宽度过渡到 0 |
| 展开 | 左侧右边缘出现 `◂` 按钮 |
| 过渡 | `transition-all duration-300 ease-out` |
| 空状态 | 未选中节点时显示 "点击左侧节点开始对话" |

### 状态指示点

```
active  → bg-indigo-400   (靛蓝)
idle    → bg-gray-400     (灰)
其他    → bg-gray-300     (浅灰)
```

---

## 08 · 消息气泡

### 用户消息

```
bg-white px-4 py-3
  ┌─────────┬──────────────────────────┐
  │ 头像 你  │ 消息正文 14px text-gray-800 │
  │ bg-indigo│ 时间戳 hover 显示          │
  │ -100     │                           │
  └─────────┴──────────────────────────┘
```

- 头像：28px 圆形，`bg-indigo-100 text-indigo-600`
- 时间戳：`text-xs text-gray-400`，默认 `opacity-0`，hover `opacity-100`

### AI 消息

```
bg-gray-50 px-4 py-3
  ┌─────────┬──────────────────────────┐
  │ 头像 AI  │ 消息正文 14px text-gray-800 │
  │ bg-emera │ 时间戳 hover 显示          │
  │ ld-100   │                           │
  └─────────┴──────────────────────────┘
```

- 头像：28px 圆形，`bg-emerald-100 text-emerald-600`

### Loading 指示器

```
bg-gray-50 — 三个跳动圆点 (w-2 h-2 bg-gray-400 animate-bounce)
延迟：0ms / 150ms / 300ms
旁注文字："思考中"
```

### 错误卡片

```
bg-red-50 border border-red-100 rounded-lg
⚠ 错误信息 — text-sm text-red-600
```

---

## 09 · 输入框 (ChatInput)

```
┌─────────────────────────────────┐
│ border-t border-gray-100 p-3    │
│ ┌──────────────────────┬──────┐ │
│ │ placeholder: "输入..."│ 发送 │ │
│ │ text-sm rounded       │ btn  │ │
│ └──────────────────────┴──────┘ │
└─────────────────────────────────┘
```

| 属性 | 值 |
|------|------|
| 输入框 | `border border-gray-200 rounded px-3 py-2 text-sm` |
| 焦点 | `focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300` |
| 发送按钮 | `bg-indigo-500 hover:bg-indigo-600 text-white rounded px-3 py-2` |
| 禁用态 | `opacity-50 cursor-not-allowed`（loading 中） |

---

## 10 · 右键菜单

### 节点右键菜单

```
bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]
  ┌────────────────┐
  │ 打开对话        │  text-sm text-gray-700 hover:bg-gray-50
  │ 重命名          │
  │ 合并到...       │
  │ 归档           │  text-red-600 hover:bg-red-50
  └────────────────┘
```

### 消息右键菜单

```
同上样式 min-w-[160px]
  ┌─────────────────┐
  │ 移动到其他分支... │
  │ 从这里开分支     │
  └─────────────────┘
```

---

## 11 · 通知组件

### AutoForkNotice

```
mx-4 mt-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg
┌───────────────────────────────────────────┐
│ 已为你开了新分支「xxx」  [继续聊] [撤销] [改名] │
└───────────────────────────────────────────┘
```

- 10 秒后自动消失（300ms 淡出 + 上滑动画）
- 仅在触发 fork 的源面板中显示（per-branch 过滤）
- 继续聊按钮：`bg-emerald-500 text-white hover:bg-emerald-600`
- 撤销/改名：`text-gray-600 hover:text-gray-800 hover:bg-gray-100`

---

## 12 · 顶部工具栏

```
absolute top-0 inset-x-0 h-12 flex items-center justify-between px-5
pointer-events-none（标题不拦截画布交互）

左：Drift 标题 — text-lg font-semibold text-gray-600 tracking-wide
右：⌘K 搜索 · 收敛 按钮 — text-xs border border-gray-200 bg-white/80 backdrop-blur-sm
```

收敛按钮激活态：`text-indigo-600 border-indigo-200 bg-indigo-50/80`

---

## 13 · 动画与过渡

| 动画 | 参数 | 用途 |
|------|------|------|
| 节点脉冲 | `animate-pulse` (Tailwind 内置) | 当前活跃节点光晕 |
| 面板显隐 | `transition-all duration-300 ease-out` | 对话面板展开/收起 |
| 通知退出 | `transition-all duration-300` + `-translate-y-2` | 上滑淡出 |
| Loading 圆点 | `animate-bounce` 间隔 150ms | AI 思考中指示 |
| 时间戳显示 | `transition-opacity` | 消息 hover 时渐显 |
| 节点半径 | 即时（无 transition） | hover 放大 15% |

---

## 14 · 底部提示条

```
absolute bottom-4 left-4 text-xs text-gray-400 pointer-events-none select-none
"点击节点查看对话 · 右键更多操作 · 滚轮缩放 · 拖拽平移"
```

---

## 15 · 响应式与可访问性

### 当前状态

- **非响应式**：固定全屏画布，面板 380px 固定宽度
- **最小视口**：面板需要至少 400px 宽度

### 可访问性

| 要求 | 当前状态 |
|------|----------|
| 键盘导航 | ⌘K 搜索、⌘⇧C 收敛面板 |
| 颜色对比度 | 主要文字 `text-gray-800` on white ≈ 4.7:1 (AA) |
| 触摸交互 | 未适配（依赖 hover 和右键） |
| 屏幕阅读器 | SVG 无 ARIA 标注（待改进） |

---

## 16 · 文件与组件清单

| 文件路径 | 组件 | 用途 |
|----------|------|------|
| `components/graph/NetworkGraph.tsx` | `NetworkGraph` | 力导向网络图（左侧） |
| `components/panel/ConversationPanel.tsx` | `ConversationPanel` | 右侧对话面板 |
| `components/panel/ResizeHandle.tsx` | `ResizeHandle` | 分屏拖拽手柄 |
| `components/branch-panel/MessageList.tsx` | `MessageList` | 消息列表 + Loading + Error |
| `components/branch-panel/ChatInput.tsx` | `ChatInput` | 输入框 + 发送按钮 |
| `components/branch-panel/AutoForkNotice.tsx` | `AutoForkNotice` | 自动分支通知 |
| `components/branch-panel/InlineInsight.tsx` | `InlineInsightList` | 跨分支洞察提示 |
| `components/convergence/ConvergencePanel.tsx` | `ConvergencePanel` | 收敛输出面板 |
| `components/navigation/SearchPanel.tsx` | `SearchPanel` | 全局搜索覆盖层 |
| `components/navigation/QuickPeek.tsx` | `QuickPeek` | 分支快速预览 |
| `store/drift-store.ts` | `useDriftStore` | Zustand 全局状态 |
| `App.tsx` | `DriftApp` | 应用入口组合 |
