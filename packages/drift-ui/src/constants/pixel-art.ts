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
