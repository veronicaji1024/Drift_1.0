/** 消息列表 — 渲染分支中的对话消息，支持右键菜单和拖拽 */
import { useState, useCallback, useEffect, useRef, type MouseEvent, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDriftStore } from '../../store/drift-store'
import type { Message, Branch } from '@drift/storage'

interface MessageContextMenu { x: number; y: number; messageId: string }
interface MessageListProps { branchId: string; messages: Message[] }

/** 解析消息内容，分离 <think>...</think> 和正文，清理残留标签 */
function parseThinkContent(content: string): { thinking: string | null; reply: string } {
  const match = content.match(/([\s\S]*?)<think>([\s\S]*?)<\/think>([\s\S]*)/)
  if (match) {
    const before = cleanReply(match[1])
    const thinking = match[2].trim()
    const after = cleanReply(match[3])
    const reply = [before, after].filter(Boolean).join('\n')
    return { thinking, reply }
  }
  const partial = content.match(/([\s\S]*?)<think>([\s\S]*)/)
  if (partial && !content.includes('</think>')) {
    return { thinking: partial[2].trim(), reply: cleanReply(partial[1]) }
  }
  return { thinking: null, reply: cleanReply(content) }
}

function breakLongParagraphs(text: string, maxLen = 80): string {
  return text.split(/\n\n/).map((para) => {
    if (para.length <= maxLen || para.startsWith('-') || para.startsWith('|') || /^\d+\./.test(para)) return para
    const sentences = para.split(/(?<=[。！？.!?])\s*/)
    const chunks: string[] = []
    let buf = ''
    for (const s of sentences) {
      if (buf && (buf + s).length > maxLen) {
        chunks.push(buf.trim())
        buf = s
      } else {
        buf += s
      }
    }
    if (buf.trim()) chunks.push(buf.trim())
    return chunks.join('\n\n')
  }).join('\n\n')
}

function cleanReply(raw: string): string {
  const cleaned = raw
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<\/?/g, '')
    .replace(/思考过程[：:]\s*[-\s\S]*?(?=\n[^\s-]|$)/g, '')
    .replace(/^[\s"'`]+/, '')
    .replace(/^(user|assistant|system)\s*[:：]\s*/gim, '')
    .trim()
  return breakLongParagraphs(cleaned)
}

/** 思考过程 — 滚动显示，说完折叠 */
function ThinkingBlock({ content, onDone }: { content: string; onDone: () => void }) {
  const sentences = content.split(/(?<=[。！？\n.!?])\s*/).filter(Boolean)
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const typing = current < sentences.length

  useEffect(() => {
    if (!typing) { setDone(true); onDone(); return }
    const delay = 600 + Math.min(sentences[current]?.length ?? 0, 30) * 35
    const timer = setTimeout(() => setCurrent((c) => c + 1), delay)
    return () => clearTimeout(timer)
  }, [current, sentences.length])

  if (done) {
    return (
      <div className="mb-2">
        <button
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-500 transition-colors py-0.5"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        >
          <span className="inline-block transition-transform duration-200" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#x25B6;</span>
          <span className="italic">thinking</span>
        </button>
        {expanded && (
          <div className="mt-1 pl-3 border-l-2 border-gray-200 text-xs text-gray-400 whitespace-pre-wrap leading-relaxed italic">{content}</div>
        )}
      </div>
    )
  }

  return (
    <div className="mb-2 h-6 overflow-hidden relative">
      <style>{`
        @keyframes think-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes think-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
      `}</style>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse flex-shrink-0" />
        <span
          key={current}
          className="text-xs text-gray-400 italic truncate"
          style={{ animation: 'think-in 0.25s ease-out' }}
        >
          {sentences[current] ?? ''}
        </span>
      </div>
    </div>
  )
}

// ---- 像素动物头像系统 ----

type PixelGrid = string[][]
const _ = 'transparent'

function PixelIcon({ grid, size = 32 }: { grid: PixelGrid; size?: number }) {
  const h = grid.length
  const w = grid[0].length
  return (
    <svg width={size} height={size} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: 'pixelated' }}>
      {grid.map((row, y) => row.map((c, x) => c !== _ ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c} /> : null))}
    </svg>
  )
}

const AVATARS: Record<string, { name: string; grid: PixelGrid }> = {
  cat: { name: '小猫', grid: (() => {
    const p='#F8B4C8',d='#D4849A',n='#FDDDE6',e='#444'
    return [[_,_,p,_,_,_,_,_,p,_,_],[_,p,d,p,_,_,_,p,d,p,_],[_,p,n,n,n,n,n,n,n,p,_],[p,n,n,n,n,n,n,n,n,n,p],[p,n,e,n,n,n,n,e,n,n,p],[p,n,n,n,n,e,n,n,n,n,p],[p,n,n,d,n,n,n,d,n,n,p],[_,p,n,n,n,n,n,n,n,p,_],[_,_,p,p,p,p,p,p,p,_,_]]
  })() },
  dog: { name: '小狗', grid: (() => {
    const b='#C8956C',d='#A07050',n='#F0D8C0',e='#444'
    return [[b,b,_,_,_,_,_,b,b],[b,d,b,_,_,_,b,d,b],[_,b,n,n,n,n,n,b,_],[_,n,n,n,n,n,n,n,_],[_,n,e,n,n,n,e,n,_],[_,n,n,n,d,n,n,n,_],[_,n,n,d,n,d,n,n,_],[_,_,n,n,n,n,n,_,_],[_,_,_,b,b,b,_,_,_]]
  })() },
  bunny: { name: '兔兔', grid: (() => {
    const w='#F0E8E0',p='#FFB6C1',n='#F5EDE5',e='#444'
    return [[_,_,w,_,_,_,w,_,_],[_,_,w,_,_,_,w,_,_],[_,_,p,_,_,_,p,_,_],[_,w,w,w,w,w,w,w,_],[w,w,e,w,w,w,e,w,w],[w,w,w,w,p,w,w,w,w],[w,n,n,n,n,n,n,n,w],[_,w,n,p,n,p,n,w,_],[_,_,w,w,w,w,w,_,_]]
  })() },
  deer: { name: '小鹿', grid: (() => {
    const b='#8B6914',d='#6B4F10',n='#D4A84B',e='#444'
    return [[_,b,_,_,_,_,_,b,_],[b,d,b,_,_,_,b,d,b],[_,b,n,n,n,n,n,b,_],[_,n,n,n,n,n,n,n,_],[_,n,e,n,n,n,e,n,_],[_,n,n,n,d,n,n,n,_],[_,n,n,n,n,n,n,n,_],[_,_,n,n,n,n,n,_,_],[_,_,_,b,b,b,_,_,_]]
  })() },
  ghost: { name: '幽灵', grid: (() => {
    const w='#F0F0F0',g='#D8D8D8',e='#444',p='#C0C0E8'
    return [[_,_,w,w,w,w,w,_,_],[_,w,w,w,w,w,w,w,_],[w,w,w,w,w,w,w,w,w],[w,w,e,w,w,w,e,w,w],[w,w,w,w,w,w,w,w,w],[w,w,w,p,p,p,w,w,w],[w,w,w,w,w,w,w,w,w],[w,g,w,w,g,w,w,g,w],[w,_,w,w,_,w,w,_,w]]
  })() },
  fox: { name: '小狐', grid: (() => {
    const o='#F4845F',d='#D4603F',w='#FFF8F0',e='#444'
    return [[o,o,_,_,_,_,_,o,o],[_,o,d,_,_,_,d,o,_],[_,o,o,o,o,o,o,o,_],[o,o,o,o,o,o,o,o,o],[o,o,e,o,o,o,e,o,o],[o,w,w,o,d,o,w,w,o],[_,o,w,w,w,w,w,o,_],[_,_,o,o,o,o,o,_,_],[_,_,_,o,o,o,_,_,_]]
  })() },
  frog: { name: '青蛙', grid: (() => {
    const g='#7EC850',d='#5CA030',w='#FFF',e='#444',p='#F8B4C8'
    return [[_,g,g,_,_,_,g,g,_],[g,w,e,g,_,g,w,e,g],[_,g,g,g,g,g,g,g,_],[_,g,g,g,g,g,g,g,_],[_,g,g,g,g,g,g,g,_],[_,g,g,p,g,p,g,g,_],[_,_,g,g,g,g,g,_,_],[_,_,_,d,_,d,_,_,_],[_,_,d,d,_,d,d,_,_]]
  })() },
  penguin: { name: '企鹅', grid: (() => {
    const k='#333',w='#FFF',b='#4A90D9',o='#F4A460',e='#222'
    return [[_,_,k,k,k,k,k,_,_],[_,k,k,k,k,k,k,k,_],[k,k,e,k,k,k,e,k,k],[k,k,k,k,k,k,k,k,k],[k,w,w,w,w,w,w,w,k],[_,k,w,w,w,w,w,k,_],[_,_,k,w,w,w,k,_,_],[_,_,_,o,o,o,_,_,_],[_,_,o,o,_,o,o,_,_]]
  })() },
  chick: { name: '小鸡', grid: (() => {
    const y='#FFD93D',d='#E8B830',o='#FF8C42',e='#444'
    return [[_,_,d,d,d,_,_],[_,y,y,y,y,y,_],[y,y,y,y,y,y,y],[y,e,y,y,y,e,y],[y,y,y,y,y,y,y],[y,y,o,o,o,y,y],[_,y,y,y,y,y,_],[_,_,o,_,o,_,_],[_,o,o,_,o,o,_]]
  })() },
  pig: { name: '小猪', grid: (() => {
    const p='#FFB6C1',d='#E8909C',n='#FDDDE6',e='#444'
    return [[_,p,p,_,_,_,p,p,_],[p,d,p,_,_,_,p,d,p],[_,p,n,n,n,n,n,p,_],[_,n,n,n,n,n,n,n,_],[_,n,e,n,n,n,e,n,_],[_,n,n,d,d,d,n,n,_],[_,n,n,d,n,d,n,n,_],[_,_,n,n,n,n,n,_,_],[_,_,_,p,p,p,_,_,_]]
  })() },
  octopus: { name: '章鱼', grid: (() => {
    const p='#E870A0',d='#C85888',e='#444'
    return [[_,_,p,p,p,p,p,_,_],[_,p,p,p,p,p,p,p,_],[p,p,p,p,p,p,p,p,p],[p,p,e,p,p,p,e,p,p],[p,p,p,p,p,p,p,p,p],[p,p,p,d,d,d,p,p,p],[p,_,p,_,p,_,p,_,p],[p,_,p,_,p,_,p,_,p],[_,_,d,_,_,_,d,_,_]]
  })() },
  whale: { name: '小鲸', grid: (() => {
    const b='#6CB4EE',d='#4A90D9',w='#FFF',e='#444'
    return [[_,_,_,d,_,_,_,_,_],[_,_,b,d,b,b,b,_,_],[_,b,b,b,b,b,b,b,_],[b,b,e,b,b,b,e,b,b],[b,b,b,b,b,b,b,b,b],[b,w,w,w,w,w,w,w,b],[_,b,b,b,b,b,b,b,_],[_,_,b,b,b,b,b,_,_],[_,d,_,_,_,_,_,d,_]]
  })() },
}

/** AI 头像 — 像素版 Q*bert */
const AI_QBERT_GRID: PixelGrid = (() => {
  const o='#E02020',k='#222'
  return [
    [_,_,o,o,o,o,o,o,_,_,_,_,_,_],
    [_,o,o,o,o,o,o,o,o,_,_,_,_,_],
    [o,o,o,o,o,o,o,o,o,o,_,_,_,_],
    [o,o,o,o,o,o,o,o,o,o,_,_,_,_],
    [o,o,o,k,o,o,o,k,o,o,o,o,o,k],
    [o,o,o,o,o,o,o,o,o,o,o,o,o,k],
    [_,o,o,o,o,o,o,o,o,o,_,_,_,_],
    [_,_,o,o,o,o,o,o,o,_,_,_,_,_],
    [_,_,_,o,o,_,o,o,_,_,_,_,_,_],
    [_,_,_,o,_,_,_,o,_,_,_,_,_,_],
    [_,_,o,o,_,_,_,o,o,_,_,_,_,_],
  ]
})()

/** 头像选择器 */
function AvatarPicker() {
  const setUserAvatar = useDriftStore((s) => s.setUserAvatar)
  const avatarKeys = Object.keys(AVATARS)

  return (
    <div className="flex items-center justify-center h-full bg-[#F5F5F5]">
      <div className="bg-indigo-400/15 rounded-2xl shadow-[0_4px_20px_rgba(99,102,241,0.1)] p-6 max-w-sm mx-4 border border-indigo-200/30">
        <div className="text-center mb-5">
          <div className="text-base font-medium text-gray-700 mb-1">选一个你的分身</div>
          <div className="text-xs text-gray-400">它会在对话里代表你</div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {avatarKeys.map((key) => {
            const a = AVATARS[key]
            return (
              <button
                key={key}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-[#F0F7FF] hover:shadow-sm transition-all active:scale-95"
                onClick={() => setUserAvatar(key)}
              >
                <PixelIcon grid={a.grid} size={36} />
                <span className="text-xs text-gray-500">{a.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 单条消息组件 */
function MessageItem({
  message,
  userAvatarGrid,
  hideQbert,
  avatarRef,
  userBubbleRef,
  onContextMenu,
  onDragStart,
}: {
  message: Message
  userAvatarGrid: PixelGrid
  hideQbert?: boolean
  avatarRef?: React.RefObject<HTMLDivElement | null>
  userBubbleRef?: React.RefObject<HTMLDivElement | null>
  onContextMenu: (e: MouseEvent, id: string) => void
  onDragStart: (e: DragEvent, id: string) => void
}) {
  const isUser = message.role === 'user'
  if (message.role === 'system') return null

  const { thinking, reply } = isUser
    ? { thinking: null, reply: message.content }
    : parseThinkContent(message.content)

  const [thinkingDone, setThinkingDone] = useState(!thinking)
  const showReply = !thinking || thinkingDone
  const showAiAvatar = isUser || !hideQbert

  return (
    <div
      className="px-3 py-1 group"
      draggable
      onDragStart={(e) => onDragStart(e, message.id)}
      onContextMenu={(e) => onContextMenu(e, message.id)}
    >
      <div className={`flex items-start gap-2 max-w-3xl mx-auto ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className="flex-shrink-0 mt-0.5" ref={isUser ? userBubbleRef : avatarRef} style={{ visibility: showAiAvatar ? 'visible' : 'hidden' }}>
          {isUser ? <PixelIcon grid={userAvatarGrid} /> : <PixelIcon grid={AI_QBERT_GRID} />}
        </div>
        <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
          {thinking && <ThinkingBlock content={thinking} onDone={() => setThinkingDone(true)} />}
          {showReply && <div className={`text-sm leading-relaxed px-3.5 py-2.5 animate-[fade-in_0.3s_ease-out] ${isUser ? 'bg-[#BDE0FE] text-gray-800 rounded-2xl rounded-tr-md shadow-[0_2px_8px_rgba(189,224,254,0.4)]' : 'bg-white text-gray-800 rounded-2xl rounded-tl-md shadow-[0_2px_8px_rgba(0,0,0,0.06)]'}`}>
            {isUser ? reply : (
              <div className="prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_p]:leading-relaxed [&_li]:leading-relaxed [&_strong]:text-gray-900 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-50 [&_pre]:rounded-lg [&_pre]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_table]:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reply}</ReactMarkdown>
              </div>
            )}
          </div>}
          <div className={`text-xs text-gray-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'text-right pr-1' : 'text-left pl-1'}`}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 消息右键菜单 */
function MessageMenu({ state, branches, currentBranchId, onClose }: {
  state: MessageContextMenu; branches: Record<string, Branch>; currentBranchId: string; onClose: () => void
}) {
  const moveMessage = useDriftStore((s) => s.moveMessage)

  const handleMoveToSelect = useCallback(() => {
    const other = Object.values(branches).filter((b) => b.id !== currentBranchId && b.status !== 'archived')
    if (other.length === 0) { onClose(); return }
    const labels = other.map((b, i) => `${i + 1}. ${b.label}`).join('\n')
    const choice = window.prompt(`移动到哪个分支?\n${labels}`)
    if (choice) {
      const idx = parseInt(choice, 10) - 1
      if (idx >= 0 && idx < other.length) void moveMessage(state.messageId, other[idx].id)
    }
    onClose()
  }, [state.messageId, branches, currentBranchId, moveMessage, onClose])

  return (
    <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]" style={{ left: state.x, top: state.y }}>
      <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={handleMoveToSelect}>移动到其他分支...</button>
      <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={onClose}>从这里开分支</button>
    </div>
  )
}

/** Loading 指示器 */
function LoadingIndicator() {
  return (
    <div className="px-3 py-1">
      <div className="flex items-start gap-2 max-w-3xl mx-auto">
        <PixelIcon grid={AI_QBERT_GRID} />
        <div className="bg-white rounded-2xl rounded-tl-md shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-3.5 py-2.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

/** Q*bert 吐豆子动画 — 从 AI 头像走到用户气泡旁吐豆子，用 fixed 定位避免滚动干扰 */
function QbertSpitAnimation({ startRef, targetRef, containerRef }: {
  startRef: React.RefObject<HTMLDivElement | null>
  targetRef: React.RefObject<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'init' | 'walk' | 'spit' | 'back' | 'done'>('init')
  const [beans, setBeans] = useState<number[]>([])
  const posRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    console.log('[QbertSpit] mount, startRef:', startRef.current, 'targetRef:', targetRef.current, 'containerRef:', containerRef.current, 'overlayRef:', overlayRef.current)

    const c = containerRef.current
    const s = startRef.current
    let sx: number, sy: number
    if (s) {
      const sr = s.getBoundingClientRect()
      sx = sr.left
      sy = sr.top
    } else if (c) {
      const cr = c.getBoundingClientRect()
      sx = cr.left + 20
      sy = cr.bottom - 60
    } else {
      sx = 100
      sy = window.innerHeight - 100
    }

    const t = targetRef.current
    let tx: number, ty: number
    if (t) {
      const tr = t.getBoundingClientRect()
      tx = tr.left - 50
      ty = tr.top
    } else if (c) {
      const cr = c.getBoundingClientRect()
      tx = cr.right - 80
      ty = cr.top + 40
    } else {
      tx = window.innerWidth - 100
      ty = 100
    }

    console.log('[QbertSpit] positions:', { sx, sy, tx, ty })
    posRef.current = { sx, sy, tx, ty }

    const qEl = overlayRef.current?.querySelector('[data-qbert]') as HTMLElement
    console.log('[QbertSpit] qEl:', qEl)
    if (qEl) {
      qEl.style.left = `${sx}px`
      qEl.style.top = `${sy}px`
    }
    requestAnimationFrame(() => setPhase('walk'))
  }, [])

  useEffect(() => {
    if (phase !== 'walk' && phase !== 'back') return
    const p = posRef.current
    if (!p) return

    const fromX = phase === 'walk' ? p.sx : p.tx
    const fromY = phase === 'walk' ? p.sy : p.ty
    const toX = phase === 'walk' ? p.tx : p.sx
    const toY = phase === 'walk' ? p.ty : p.sy
    const duration = 1500
    const bounce = 8
    const startTime = performance.now()
    const qEl = overlayRef.current?.querySelector('[data-qbert]') as HTMLElement
    if (!qEl) return

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const x = fromX + (toX - fromX) * ease
      const y = fromY + (toY - fromY) * ease - Math.abs(Math.sin(t * Math.PI * 8)) * bounce
      qEl.style.left = `${x}px`
      qEl.style.top = `${y}px`
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        if (phase === 'walk') setPhase('spit')
        else setPhase('done')
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  useEffect(() => {
    if (phase !== 'spit') return
    const qEl = overlayRef.current?.querySelector('[data-qbert]') as HTMLElement
    if (qEl) qEl.style.animation = 'qbert-spit-shake 0.3s ease-in-out infinite'
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < 5; i++) {
      timers.push(setTimeout(() => setBeans((prev) => [...prev, i]), i * 300))
    }
    const t = setTimeout(() => {
      if (qEl) qEl.style.animation = ''
      setPhase('back')
    }, 1800)
    return () => { clearTimeout(t); timers.forEach(clearTimeout) }
  }, [phase])

  console.log('[QbertSpit] render, phase:', phase)
  if (phase === 'done') return null

  const p = posRef.current

  return createPortal(
    <>
      <style>{`
        @keyframes qbert-spit-shake {
          0%, 100% { transform: translateX(0); }
          30% { transform: translateX(-5px); }
          60% { transform: translateX(2px); }
        }
        @keyframes bean-shoot {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { transform: translate(35px, -6px) scale(1); opacity: 1; }
          100% { transform: translate(55px, 0) scale(0.4); opacity: 0; }
        }
      `}</style>
      <div ref={overlayRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
        <div
          data-qbert
          style={{ position: 'absolute', width: 40, left: 0, top: 0 }}
        >
          <PixelIcon grid={AI_QBERT_GRID} size={40} />
        </div>

        {phase === 'spit' && p && beans.map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.tx + 40,
              top: p.ty + 10,
              animation: 'bean-shoot 0.45s ease-out forwards',
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
          </div>
        ))}
      </div>
    </>,
    document.body
  )
}

/** 消息列表主组件 */
export function MessageList({ branchId, messages }: MessageListProps) {
  const branches = useDriftStore((s) => s.branches)
  const isLoading = useDriftStore((s) => s.loadingBranches.has(branchId))
  const errorMessage = useDriftStore((s) => s.errorByBranch[branchId])
  const userAvatar = useDriftStore((s) => s.userAvatar)
  const qbertSpitting = useDriftStore((s) => s.qbertSpitting)
  const draft = useDriftStore((s) => s.draftByBranch[branchId] ?? '')
  const [contextMenu, setContextMenu] = useState<MessageContextMenu | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastAiAvatarRef = useRef<HTMLDivElement>(null)
  const lastUserBubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (qbertSpitting) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isLoading, qbertSpitting])

  const handleContextMenu = useCallback((e: MouseEvent, messageId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, messageId })
  }, [])

  const handleDragStart = useCallback((e: DragEvent, messageId: string) => {
    e.dataTransfer.setData('text/plain', messageId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  if (!userAvatar) return <AvatarPicker />

  const avatarGrid = AVATARS[userAvatar]?.grid ?? AVATARS.cat.grid

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto bg-[#F5F5F5] relative flex flex-col" onClick={closeContextMenu}>
      <div className="py-2">
        {messages.length === 0 ? (
          /* 首轮：头像 + 空白气泡常驻 */
          <div className="px-3 py-1">
            <div className="flex items-start gap-2 max-w-3xl mx-auto flex-row-reverse">
              <div className="flex-shrink-0 mt-0.5"><PixelIcon grid={avatarGrid} /></div>
              <div className="max-w-[75%]">
                <div className="text-sm leading-relaxed whitespace-pre-wrap px-3.5 py-2.5 bg-[#BDE0FE] text-gray-800 rounded-2xl rounded-tr-md shadow-[0_2px_8px_rgba(189,224,254,0.4)] opacity-60 min-w-[40px] min-h-[20px]">
                  {draft || '\u00A0'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 有消息后：消息列表 + 输入时底部预览 */
          <>
            {messages.map((msg, idx) => {
              const isLastAi = msg.role === 'assistant' && !messages.slice(idx + 1).some((m) => m.role === 'assistant')
              const isLastUser = msg.role === 'user' && !messages.slice(idx + 1).some((m) => m.role === 'user')
              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  userAvatarGrid={avatarGrid}
                  hideQbert={isLastAi && qbertSpitting}
                  avatarRef={isLastAi ? lastAiAvatarRef : undefined}
                  userBubbleRef={isLastUser ? lastUserBubbleRef : undefined}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                />
              )
            })}
            {draft.trim() && (
              <div className="px-3 py-1">
                <div className="flex items-start gap-2 max-w-3xl mx-auto flex-row-reverse">
                  <div className="flex-shrink-0 mt-0.5"><PixelIcon grid={avatarGrid} /></div>
                  <div className="max-w-[75%]">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap px-3.5 py-2.5 bg-[#BDE0FE] text-gray-800 rounded-2xl rounded-tr-md shadow-[0_2px_8px_rgba(189,224,254,0.4)] opacity-60">
                      {draft}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {isLoading && <LoadingIndicator />}
      {errorMessage && <ErrorCard message={errorMessage} branchId={branchId} />}
      <div ref={bottomRef} />
      {contextMenu && <MessageMenu state={contextMenu} branches={branches} currentBranchId={branchId} onClose={closeContextMenu} />}
      {qbertSpitting && <QbertSpitAnimation startRef={lastAiAvatarRef} targetRef={lastUserBubbleRef} containerRef={listRef} />}
    </div>
  )
}
