export type PixelGrid = string[][]

const _ = 'transparent'
export { _ as TRANSPARENT }

/** AI 头像 — 像素版 Q*bert（NetworkGraph + MessageList 共用） */
export const AI_QBERT_GRID: PixelGrid = (() => {
  const o = '#E02020', k = '#222'
  return [
    [_, _, o, o, o, o, o, o, _, _, _, _, _, _],
    [_, o, o, o, o, o, o, o, o, _, _, _, _, _],
    [o, o, o, o, o, o, o, o, o, o, _, _, _, _],
    [o, o, o, o, o, o, o, o, o, o, _, _, _, _],
    [o, o, o, k, o, o, o, k, o, o, o, o, o, k],
    [o, o, o, o, o, o, o, o, o, o, o, o, o, k],
    [_, o, o, o, o, o, o, o, o, o, _, _, _, _],
    [_, _, o, o, o, o, o, o, o, _, _, _, _, _],
    [_, _, _, o, o, _, o, o, _, _, _, _, _, _],
    [_, _, _, o, _, _, _, o, _, _, _, _, _, _],
    [_, _, o, o, _, _, _, o, o, _, _, _, _, _],
  ]
})()

/** 豆子像素遮罩 (7×5) — true = 填色 */
export const BEAN_SHAPE: boolean[][] = [
  [false, false, true,  true,  true,  false, false],
  [false, true,  true,  true,  true,  true,  false],
  [true,  true,  true,  true,  true,  false, false],
  [false, true,  true,  true,  true,  true,  false],
  [false, false, true,  true,  true,  false, false],
]

/** 豆子高光位置 (7×5) — true = 高光像素 */
export const BEAN_HIGHLIGHT: boolean[][] = [
  [false, false, false, false, false, false, false],
  [false, false, true,  true,  false, false, false],
  [false, false, true,  false, false, false, false],
  [false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false],
]

/** 支线豆子颜色表（arcade 色系，按 depth 索引） */
const DEPTH_COLORS = [
  '#E02020',   // depth 0: root (Q*bert 本体)
  '#E02020',   // depth 1: 红豆
  '#E0467C',   // depth 2: 粉豆
  '#2EAD4B',   // depth 3: 绿豆
  '#2196F3',   // depth 4: 蓝豆
  '#F5A623',   // depth 5: 黄豆
]

export function getDepthColor(depth: number): string {
  if (depth <= 0) return DEPTH_COLORS[0]
  const idx = ((depth - 1) % (DEPTH_COLORS.length - 1)) + 1
  return DEPTH_COLORS[idx]
}

/** 吃豆人像素网格 (9×9) — 右朝向张嘴 */
export const PACMAN_GRID: PixelGrid = (() => {
  const y = '#F5D6A0'
  return [
    [_, _, _, y, y, y, _, _, _],
    [_, _, y, y, y, y, y, _, _],
    [_, y, y, y, y, y, _, _, _],
    [y, y, y, y, y, _, _, _, _],
    [y, y, y, y, _, _, _, _, _],
    [y, y, y, y, y, _, _, _, _],
    [_, y, y, y, y, y, _, _, _],
    [_, _, y, y, y, y, y, _, _],
    [_, _, _, y, y, y, _, _, _],
  ]
})()

/** 幽灵像素网格 (9×9) — 粉色经典幽灵 */
export const GHOST_GRID: PixelGrid = (() => {
  const p = '#E8A0BF', w = '#FFF', e = '#4A4063'
  return [
    [_, _, _, p, p, p, _, _, _],
    [_, _, p, p, p, p, p, _, _],
    [_, p, p, p, p, p, p, p, _],
    [_, p, w, e, p, w, e, p, _],
    [_, p, w, e, p, w, e, p, _],
    [_, p, p, p, p, p, p, p, _],
    [_, p, p, p, p, p, p, p, _],
    [_, p, p, p, p, p, p, p, _],
    [_, p, _, p, _, p, _, p, _],
  ]
})()

/** 豆点常量 */
export const PAC_DOT = { size: 4, color: '#B8AED8' } as const
