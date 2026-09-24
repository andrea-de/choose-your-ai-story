import type { ThemeId } from './story/types'

/**
 * The sketch library: hand-drawn line drawings in public/sketches/, black on
 * white so every theme can recolour them in CSS. When a page is written, the
 * model picks the one that best fits it, so sketches cost nothing to "draw".
 *
 * Sketches without `themes` suit every kind of story. Tagged ones are only
 * offered to stories of those themes, which keeps each list short enough for
 * the model to choose well however large the library grows.
 *
 * To add one, drop a 200×200 SVG in public/sketches/ and describe it here.
 */
export interface SketchEntry {
  id: string
  description: string
  themes?: readonly ThemeId[]
}


export const SKETCH_LIBRARY = [
  // Shared: objects
  { id: 'door', description: 'an arched wooden door in a stone wall: entrances, secrets, thresholds, rooms' },
  { id: 'key', description: 'an old ornate key: locks, secrets, clues, something unlocked or stolen' },
  { id: 'lantern', description: 'a hanging lantern with a flame: light, night, searching, warmth, a signal' },
  { id: 'candle', description: 'a candle in a holder: a small room at night, vigils, study, hope, fragility' },
  { id: 'scroll', description: 'an open scroll with writing and a wax seal: orders, prophecies, proclamations' },
  { id: 'letter', description: 'a sealed envelope: a message, invitation, confession, news from far away' },
  { id: 'goblet', description: 'a jeweled goblet: feasts, poison, toasts, taverns, a sacred cup' },
  { id: 'purse', description: 'a coin purse with spilled coins: money, bribes, debts, trade, theft, a reward' },
  { id: 'chest', description: 'a locked chest: treasure, hidden things, inheritance, cargo' },
  { id: 'hourglass', description: 'an hourglass: time running out, waiting, deadlines, fate, ageing' },
  { id: 'compass', description: 'a compass: navigation, being lost, direction, maps, exploration' },
  { id: 'eye', description: 'a wide open eye: being watched, visions, secrets seen, magic, suspicion' },
  { id: 'mask', description: 'a masquerade mask on a stick: disguise, deception, a party, hidden identity' },
  { id: 'skull', description: 'a skull: death, danger, poison, curses, a grim warning' },
  { id: 'rose', description: 'a single rose with thorns: love, beauty, a gift, a garden, something that hurts' },
  { id: 'sword', description: 'a sword: battle, duels, courage, a soldier, danger', themes: ['historic-fantasy', 'pirate', 'ancient', 'dream'] },
  { id: 'crown', description: 'a jeweled crown: kings and queens, power, inheritance, a throne, ambition', themes: ['historic-fantasy', 'ancient', 'dream', 'pirate'] },
  // Shared: people and bodies
  { id: 'stranger', description: 'a figure in a long coat and hat, face in shadow: a stranger, informant, rival, visitor' },
  { id: 'wanderer', description: 'a traveler with a pack and walking staff: a journey, pilgrim, the hero setting out' },
  { id: 'companions', description: 'two figures talking, one gesturing: a conversation, bargain, alliance, argument' },
  { id: 'hand', description: 'an open raised hand: an oath, a greeting, stop, a plea, something offered' },
  { id: 'footprints', description: 'a trail of footprints: tracking, someone passed this way, following, being followed' },
  // Shared: places and weather
  { id: 'window', description: 'an arched window with open shutters: looking out, watching, escape, home, longing' },
  { id: 'staircase', description: 'a staircase with a banister: climbing, descending, a tower or cellar, a house inside' },
  { id: 'road', description: 'a winding road into the hills: travel, departure, choices, distance' },
  { id: 'bridge', description: 'a stone bridge over water: crossings, borders, meetings, choices, rivers' },
  { id: 'mountain', description: 'snow-capped mountains with a path: journeys, climbing, distance, the wild' },
  { id: 'tree', description: 'a gnarled bare tree: forests, crossroads, age, wilderness, a meeting place' },
  { id: 'campfire', description: 'a campfire with sparks: camping, night outdoors, stories, rest, warmth' },
  { id: 'rain', description: 'a rain cloud over a puddle: storms, gloom, weather, sadness, a wet night' },
  { id: 'moon', description: 'a crescent moon with a few stars: night, dreams, magic, sleep, the sky' },
  { id: 'bird', description: 'a small bird perched on a branch: messengers, omens, freedom, morning, spies' },
  { id: 'cottage', description: 'a small cottage with a smoking chimney: home, a village, shelter, a humble house', themes: ['historic-fantasy', 'pirate', 'dream', 'noir'] },
  { id: 'lighthouse', description: 'a lighthouse on rocks with waves: coasts, harbors, warnings, guidance', themes: ['historic-fantasy', 'pirate', 'noir', 'dream', 'future'] },
  // Historic fantasy
  { id: 'castle', description: 'a castle with towers and flags: kingdoms, sieges, a court, a fortress', themes: ['historic-fantasy', 'dream'] },
  { id: 'dragon', description: 'a dragon’s head and neck: monsters, great danger, legends, fire', themes: ['historic-fantasy', 'dream'] },
  { id: 'potion', description: 'a round bottle with bubbling liquid: potions, alchemy, poison, a cure, witchcraft', themes: ['historic-fantasy', 'dream', 'ancient'] },
  { id: 'shield', description: 'a heraldic shield: knights, defense, a noble house, loyalty', themes: ['historic-fantasy', 'ancient'] },
  // Future
  { id: 'planet', description: 'a ringed planet among stars: space, other worlds, voyages, signals', themes: ['future', 'dream'] },
  { id: 'robot', description: 'a boxy robot: machines, androids, an artificial helper or threat', themes: ['future'] },
  { id: 'rocket', description: 'a rocket with flame: launch, escape, a spacecraft, travel between worlds', themes: ['future'] },
  { id: 'satellite', description: 'a satellite with solar panels sending a signal: transmissions, orbit, surveillance', themes: ['future'] },
  { id: 'airlock', description: 'a round sealed hatch: a spaceship door, an airlock, a sealed compartment', themes: ['future'] },
  // Noir
  { id: 'revolver', description: 'a revolver: threats, a crime, a stick-up, self-defense', themes: ['noir'] },
  { id: 'telephone', description: 'a rotary telephone: a phone call, a tip-off, a threat, waiting for news', themes: ['noir', 'dream'] },
  { id: 'streetlamp', description: 'a streetlamp casting light: a city street at night, a stakeout, a meeting', themes: ['noir', 'dream'] },
  { id: 'car', description: 'a 1940s sedan: a getaway, a tail, a ride across town', themes: ['noir'] },
  // Pirate
  { id: 'ship', description: 'a sailing ship on the waves: voyages, the sea, arrivals, pirates, escape', themes: ['pirate', 'historic-fantasy', 'ancient', 'dream'] },
  { id: 'anchor', description: 'a ship’s anchor: harbors, mooring, staying put, the sea bed', themes: ['pirate', 'ancient'] },
  { id: 'parrot', description: 'a parrot on a perch: a talking bird, a pirate’s companion, the tropics', themes: ['pirate'] },
  { id: 'map', description: 'a folded treasure map with a dotted path and an X: treasure, directions, a quest', themes: ['pirate', 'historic-fantasy', 'dream'] },
  { id: 'cannon', description: 'a cannon with cannonballs: naval battles, broadsides, attack, a fort', themes: ['pirate', 'historic-fantasy'] },
  // Ancient myth
  { id: 'temple', description: 'a Greek temple with columns: gods, oracles, worship, sanctuary', themes: ['ancient', 'dream'] },
  { id: 'amphora', description: 'a decorated amphora: wine, oil, offerings, a market, old craft', themes: ['ancient'] },
  { id: 'owl', description: 'an owl: wisdom, the goddess Athena, night, a watchful messenger', themes: ['ancient', 'historic-fantasy', 'dream'] },
  { id: 'lyre', description: 'a lyre: music, poets and songs, a bard, a celebration', themes: ['ancient', 'historic-fantasy'] },
  // Dreamscape
  { id: 'mirror', description: 'a standing oval mirror: reflections, other selves, vanity, a portal', themes: ['dream', 'historic-fantasy', 'noir'] },
  { id: 'island', description: 'a floating island with a palm tree: impossible places, drifting, a dream world', themes: ['dream'] },
  { id: 'butterfly', description: 'a butterfly: transformation, lightness, fleeting beauty, waking', themes: ['dream', 'ancient'] },
  { id: 'clock', description: 'a melting clock: time going strange, lateness, dreams, the uncanny', themes: ['dream'] },
] as const satisfies readonly SketchEntry[]


export type SketchId = (typeof SKETCH_LIBRARY)[number]['id']

export const sketchIds = SKETCH_LIBRARY.map((s) => s.id) as SketchId[]

export function isSketchId(value: string | undefined): value is SketchId {
  return sketchIds.includes(value as SketchId)
}

/** The sketches offered to a story of this theme: every shared one plus its own. */
export function sketchesFor(theme: ThemeId): SketchEntry[] {
  return SKETCH_LIBRARY.filter((s: SketchEntry) => !s.themes || s.themes.includes(theme))
}

export function sketchUrl(id: SketchId): string {
  return `/sketches/${id}.svg`
}
