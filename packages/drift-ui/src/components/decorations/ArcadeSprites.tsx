/** 吃豆人 + 幽灵 + 豆点装饰层 — 纯视觉，不可交互 */
import { PACMAN_GRID, GHOST_GRID, PAC_DOT, TRANSPARENT as _t } from '../../constants/pixel-art'

/** 渲染像素网格为 SVG */
function PixelSprite({ grid, size }: { grid: string[][]; size: number }) {
  const rows = grid.length
  const cols = grid[0].length
  return (
    <svg
      width={size}
      height={size * (rows / cols)}
      viewBox={`0 0 ${cols} ${rows}`}
      style={{ imageRendering: 'pixelated' }}
    >
      {grid.map((row, py) =>
        row.map((c, px) =>
          c !== _t ? (
            <rect key={`${px}-${py}`} x={px} y={py} width="1" height="1" fill={c} />
          ) : null
        )
      )}
    </svg>
  )
}

/** Arcade 装饰精灵 — 吃豆人巡游 + 幽灵巡逻 + 豆点呼吸 */
export function ArcadeSprites() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9990 }}>
      {/* 吃豆人 — 底部左→右 */}
      <div
        className="absolute bottom-5 left-0"
        style={{
          animation: 'pacman-traverse 20s linear infinite',
          opacity: 0.4,
        }}
      >
        <div style={{ animation: 'pacman-chomp 0.35s steps(2) infinite' }}>
          <PixelSprite grid={PACMAN_GRID} size={18} />
        </div>
      </div>

      {/* 幽灵 — 顶部右→左 */}
      <div
        className="absolute top-6 right-0"
        style={{
          animation: 'ghost-patrol 25s linear infinite',
          animationDelay: '5s',
          opacity: 0.35,
        }}
      >
        <div style={{ animation: 'ghost-wobble 1.2s ease-in-out infinite' }}>
          <PixelSprite grid={GHOST_GRID} size={18} />
        </div>
      </div>

      {/* 豆点 — 底部等距排列 */}
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-none"
          style={{
            bottom: '28px',
            left: `${8 + i * 9}%`,
            width: PAC_DOT.size,
            height: PAC_DOT.size,
            backgroundColor: PAC_DOT.color,
            animation: 'dot-pulse 3s ease-in-out infinite',
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  )
}
