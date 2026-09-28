'use client'

import type { MapNode } from '@/lib/story/types'

export interface PlacedNode extends MapNode {
  x: number
  depth: number
}

/**
 * A plain tidy tree: every leaf gets the next column, every parent sits centred
 * over its children, and depth is the row. Page 1 is the root.
 */
export function layoutTree(nodes: readonly MapNode[]): { placed: PlacedNode[]; columns: number; rows: number } {
  const children = new Map<number, MapNode[]>()
  for (const n of nodes) {
    if (n.parent === null) continue
    const list = children.get(n.parent) ?? []
    list.push(n)
    children.set(n.parent, list)
  }
  const root = nodes.find((n) => n.parent === null)
  const placed: PlacedNode[] = []
  let column = 0
  let rows = 0
  const place = (node: MapNode, depth: number): number => {
    rows = Math.max(rows, depth + 1)
    const kids = (children.get(node.number) ?? []).sort((a, b) => a.number - b.number)
    let x: number
    if (kids.length === 0) x = column++
    else {
      const xs = kids.map((k) => place(k, depth + 1))
      x = (xs[0] + xs[xs.length - 1]) / 2
    }
    placed.push({ ...node, x, depth })
    return x
  }
  if (root) place(root, 0)
  return { placed, columns: Math.max(1, column), rows: Math.max(1, rows) }
}

interface StoryTreeProps {
  nodes: readonly MapNode[]
  /** Pages this reader has read. */
  read: ReadonlySet<number>
  /** Turn to a page the reader has already read. */
  onOpen: (page: number) => void
}

const COL = 22
const ROW = 30

/** The story's pages as a tree: written, read by you, and still unwritten. */
export function StoryTree({ nodes, read, onOpen }: StoryTreeProps) {
  const { placed, columns, rows } = layoutTree(nodes)
  const at = new Map(placed.map((p) => [p.number, p]))
  const width = columns * COL
  const height = rows * ROW
  const px = (n: PlacedNode) => n.x * COL + COL / 2
  const py = (n: PlacedNode) => n.depth * ROW + ROW / 2

  const written = placed.filter((n) => n.written).length
  const yours = placed.filter((n) => n.written && read.has(n.number)).length
  const unwritten = placed.length - written
  // Only endings you have reached show as endings: the rest would spoil the surprise.
  const isYourEnding = (n: PlacedNode) => n.isEnding && read.has(n.number)
  const endings = placed.filter(isYourEnding).length
  const summary = `${written} pages written, ${yours} read by you, ${unwritten} still unwritten, ${endings} ${endings === 1 ? 'ending' : 'endings'} found by you`

  return (
    <figure className="story-tree">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={summary}
        // A young story's few dots stay dot-sized instead of swelling to fill the cover.
        style={{ maxWidth: width * 2.2, maxHeight: height * 2.2, margin: '0 auto' }}
      >
        {placed.map((n) => {
          const parent = n.parent === null ? undefined : at.get(n.parent)
          if (!parent) return null
          const yoursToo = read.has(n.number) && read.has(parent.number)
          const x1 = px(parent)
          const y1 = py(parent)
          const x2 = px(n)
          const y2 = py(n)
          return (
            <path
              key={`e${n.number}`}
              className={`tree-edge${n.written ? '' : ' unwritten'}${yoursToo ? ' yours' : ''}`}
              d={`M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`}
            />
          )
        })}
        {placed.map((n) => {
          const yours = n.written && read.has(n.number)
          const kind = !n.written ? 'unwritten' : yours ? 'yours' : 'written'
          const x = px(n)
          const y = py(n)
          const shape = isYourEnding(n) ? (
            <rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} />
          ) : (
            <circle cx={x} cy={y} r={kind === 'unwritten' ? 3.5 : 5} />
          )
          if (!yours) {
            return (
              <g key={n.number} className={`tree-node ${kind}`}>
                {shape}
              </g>
            )
          }
          return (
            <g
              key={n.number}
              className={`tree-node ${kind}`}
              role="button"
              tabIndex={0}
              aria-label={`Turn to page ${n.number}`}
              data-page={n.number}
              onClick={() => onOpen(n.number)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(n.number)
                }
              }}
            >
              {/* A larger invisible target, for fingers. */}
              <circle cx={x} cy={y} r={11} className="tree-hit" />
              {shape}
            </g>
          )
        })}
      </svg>
      <figcaption className="tree-legend">
        <span>
          <i className="key yours" /> read by you
        </span>
        <span>
          <i className="key written" /> written
        </span>
        <span>
          <i className="key unwritten" /> unwritten
        </span>
        <span>
          <i className="key ending" /> ending
        </span>
      </figcaption>
    </figure>
  )
}
