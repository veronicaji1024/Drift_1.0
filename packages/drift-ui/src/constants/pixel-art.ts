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

/** 支线豆子颜色表（按 depth 索引） */
const DEPTH_COLORS = [
  '#E02020',   // depth 0: root (Q*bert 本体)
  '#E02020',   // depth 1: 大红豆
  '#F5A623',   // depth 2: 金黄豆
  '#4CAF50',   // depth 3: 绿豆
  '#42A5F5',   // depth 4: 蓝豆
  '#AB47BC',   // depth 5: 紫豆
]

export function getDepthColor(depth: number): string {
  if (depth <= 0) return DEPTH_COLORS[0]
  const idx = ((depth - 1) % (DEPTH_COLORS.length - 1)) + 1
  return DEPTH_COLORS[idx]
}
