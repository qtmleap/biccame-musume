import { type HTMLElement, parse } from 'node-html-parser'

// 回答表（Grid）のマークアップを、グループ → セル → 各欄の文字に分解する。正規表現でタグを切り出さず、構造で読む。
export const GRID_LABEL = 'Clef の回答'

export type GridCell = {
  key: string | undefined
  label: string | undefined
  status: string | undefined
  answer: string | undefined
  probability: string | undefined
  note: string | undefined
  className: string
  html: string
}

export type GridGroup = {
  label: string | undefined
  heading: string | undefined
  empty: boolean
  cells: GridCell[]
}

const squash = (value: string) => value.replace(/\s+/g, ' ').trim()
const textOf = (element: HTMLElement | null) => (element === null ? undefined : squash(element.text))

const fieldOf = (cell: HTMLElement, name: string) => textOf(cell.querySelector(`[data-field="${name}"]`))

const classOf = (element: HTMLElement) => {
  const value = element.getAttribute('class')
  return value === undefined ? '' : value
}

const cellOf = (element: HTMLElement): GridCell => ({
  key: element.getAttribute('data-key'),
  label: fieldOf(element, 'label'),
  status: fieldOf(element, 'status'),
  answer: fieldOf(element, 'answer'),
  probability: fieldOf(element, 'probability'),
  note: fieldOf(element, 'note'),
  className: classOf(element),
  html: element.outerHTML
})

/** 回答表の根（aria-label が「Clef の回答」の要素）。詳細画面全体のマークアップを渡してもよい。無ければ null。 */
export const gridRootOf = (markup: string) => parse(markup).querySelector(`[aria-label="${GRID_LABEL}"]`)

/** グループ（aria-label を持つ section）ごとに、見出し・セル・「該当なし」の有無を返す。根が無ければ空配列。 */
export const groupsOfGrid = (markup: string): GridGroup[] => {
  const root = gridRootOf(markup)
  if (root === null) return []
  return root.querySelectorAll('section[aria-label]').map((section) => ({
    label: section.getAttribute('aria-label'),
    heading: textOf(section.querySelector('h3')),
    empty: squash(section.text).includes('該当なし') && section.querySelectorAll('li').length === 0,
    cells: section.querySelectorAll('li').map(cellOf)
  }))
}

/** 基本判定（先頭のグループ）のセル。 */
export const basicCellsOf = (markup: string): GridCell[] => {
  const [basic] = groupsOfGrid(markup)
  return basic === undefined ? [] : basic.cells
}

/** index 番目のグループのセル。グループが無ければ空配列。 */
export const groupCellsOf = (markup: string, index: number): GridCell[] => {
  const group = groupsOfGrid(markup)[index]
  return group === undefined ? [] : group.cells
}

/** セルのラベルと回答の組。 */
export const pairsOfCells = (cells: GridCell[]) => cells.map((cell) => [cell.label, cell.answer])
