/**
 * The sketch library: hand-drawn line drawings in public/sketches/, black on
 * white so every theme can recolour them in CSS. When a page is written, the
 * model picks the one that best fits it, so sketches cost nothing to "draw".
 * To add one, drop an SVG in public/sketches/ and describe it here.
 */
export const SKETCH_LIBRARY = [
  { id: 'door', description: 'an arched wooden door in a stone wall: entrances, secrets, thresholds, rooms' },
  { id: 'key', description: 'an old ornate key: locks, secrets, clues, something unlocked or stolen' },
  { id: 'lantern', description: 'a hanging lantern with a flame: light, night, searching, warmth, a signal' },
  { id: 'lighthouse', description: 'a lighthouse on rocks with waves: coasts, harbors, warnings, guidance' },
  { id: 'ship', description: 'a sailing ship on the waves: voyages, the sea, arrivals, pirates, escape' },
  { id: 'moon', description: 'a crescent moon with stars and a small cloud: night, dreams, magic, sleep, the sky' },
  { id: 'stranger', description: 'a figure in a long coat and hat, face in shadow: a stranger, ally, rival, detective, visitor' },
  { id: 'scroll', description: 'an open scroll with writing and a wax seal: letters, maps, orders, prophecies, messages' },
  { id: 'tree', description: 'a gnarled bare tree: forests, crossroads, age, wilderness, a meeting place' },
  { id: 'planet', description: 'a ringed planet with a moon and stars: space, other worlds, voyages, signals' },
] as const

export type SketchId = (typeof SKETCH_LIBRARY)[number]['id']

export const sketchIds = SKETCH_LIBRARY.map((s) => s.id) as SketchId[]

export function isSketchId(value: string | undefined): value is SketchId {
  return sketchIds.includes(value as SketchId)
}

export function sketchUrl(id: SketchId): string {
  return `/sketches/${id}.svg`
}
