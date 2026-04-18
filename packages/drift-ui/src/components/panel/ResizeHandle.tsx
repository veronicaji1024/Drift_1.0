/** 拖拽手柄 — 左右分屏宽度调节 */
import { useCallback, useRef, useState } from 'react'

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
  onDoubleClick: () => void
}

/** 4px 宽拖拽条，hover 时变色，双击重置 */
export function ResizeHandle({ onResize, onDoubleClick }: ResizeHandleProps) {
  const [active, setActive] = useState(false)
  const startXRef = useRef(0)

  /** mousedown 开始拖拽 */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setActive(true)
      startXRef.current = e.clientX

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = startXRef.current - ev.clientX
        startXRef.current = ev.clientX
        onResize(delta)
      }

      const handleMouseUp = () => {
        setActive(false)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [onResize]
  )

  return (
    <div
      className={`
        w-1 flex-shrink-0 cursor-col-resize transition-colors duration-150
        ${active ? 'bg-indigo-400' : 'bg-gray-200 hover:bg-gray-400'}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    />
  )
}
