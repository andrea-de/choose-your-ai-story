import type { ThemeId } from './story/types'

/** Words the interface uses, so each theme can speak in its own voice. */
export interface ThemeUi {
  /** Label before a page number on a choice, e.g. "turn to". */
  turnTo: string
  /** How a page number is written on the page and on choices. */
  pageLabel: (n: number) => string
  finis: string
  unwritten: string
  waiting: string
  tapHint: string
  goBack: string
  beginAgain: string
  anotherBook: string
  toLibrary: string
  firstToEnd: string
  foundBy: (readers: number) => string
  heroLabel: string
  settingLabel: string
  toneLabel: string
  begin: string
  roll: string
  binding: string
  fleuron: string
  endMark: string
  /** Label on the control that shows the rest of a page that runs over the screen. */
  more: string
  /** Shown while the narrator's reading is being fetched. */
  narratorWait: string
  /** Heading of the settings sheet. */
  settings: string
  /** Milliseconds between words as the page reveals itself. */
  pace: number
}

export interface Theme {
  id: ThemeId
  name: string
  /** One line shown on the theme picker. */
  tagline: string
  /** Voice and style the narrator writes in. */
  narration: string
  /** Style appended to every illustration prompt. Always black lines on white; CSS recolours per theme. */
  illustration: string
  /**
   * Who the reader can be: a role and a trait, never a possession or deed that
   * would decide the plot ("a potter's son who hates getting his hands dirty",
   * not "a potter's son with a stolen spear"). Any hero must suit any setting.
   */
  heroes: readonly string[]
  /** Where it happens: places, not events ("a sanctuary of Apollo", not "a temple whose oracle fell silent"). */
  settings: readonly string[]
  /** Moods for the tale: this book's own two, then the standard eight. The reader picks up to two. */
  tones: readonly string[]
  ui: ThemeUi
}

const plain = (n: number) => String(n)

/** Moods every kind of book can have. Each book adds two of its own in front. */
export const STANDARD_TONES = ['thrilling', 'funny', 'spooky', 'mysterious', 'cozy', 'epic', 'heartwarming', 'twisty'] as const

/** How many moods a reader can pick for one tale. */
export const MAX_TONES = 2

/** The moods of a tale, as stored ("funny and spooky"), back into a list. */
export const splitTones = (tone: string): string[] =>
  tone
    .split(/\s+and\s+|,\s*/)
    .map((t) => t.trim())
    .filter(Boolean)

/** 43 → "XLIII". Page numbers stay well under 4000. */
export function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [value, symbol] of numerals) {
    while (n >= value) {
      out += symbol
      n -= value
    }
  }
  return out
}

export const historicFantasy: Theme = {
  id: 'historic-fantasy',
  name: 'Historic Fantasy',
  tagline: 'Parchment, candlelight and old magic',
  narration:
    'Tell it like a favourite fireside adventure (think The Hobbit): warm, clear and a little witty, in plain ' +
    'modern English with only the odd old-fashioned word. Magic is rare and surprising, never explained. ' +
    'Second person, present tense. Family-friendly: peril and mystery are welcome, gore and cruelty are not.',
  illustration:
    'Very simple black ink sketch, loose confident pen strokes like marginalia in a medieval manuscript. ' +
    'Pure white background, no color, no shading fills, no border, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a lamplighter’s apprentice who is afraid of the dark',
    'a disgraced royal cartographer',
    'a falconer who trusts birds more than people',
    'a wandering hedge-witch with no sense of direction',
    'a monk who has quietly stopped believing',
    'a blacksmith’s daughter with a quick temper',
    'a retired knight with one good eye and a bad knee',
    'a puppeteer who never stops talking',
    'a baker known for honest bread and dishonest gossip',
    'a young herald with an enormous voice',
    'an apothecary who tests every remedy on herself',
    'a cook who was once a soldier',
    'a shy scribe with perfect handwriting',
    'a goatherd who longs to see the sea',
    'a tax collector everyone loves to hate',
    'a jester who is secretly the wisest person at court',
    'a novice bell-ringer, half deaf from practice',
    'a runaway princess who hates being recognised',
    'a gravedigger with a cheerful disposition',
    'a pedlar who has been everywhere twice',
    'a stonemason’s apprentice who dreams of carving statues',
    'an old ferryman who never forgets a face',
    'a minstrel who only remembers half of every song',
    'a beekeeper with a calm voice and a sharp tongue',
    'a chandler’s son who counts everything',
    'a former highway robber turned honest innkeeper',
    'a squire who is braver than their knight',
    'a swineherd who talks to the pigs',
    'a weaver’s widow who misses nothing',
    'a clockmaker who is always late',
    'a village midwife who has delivered half the valley',
    'a young archer who never misses and never lies',
    'a tinker with a cart full of odds and ends',
    'a retired conjurer who has lost their nerve',
    'a miller’s youngest, underestimated by everyone',
    'a stable girl with a way with horses',
    'a wanderer who has forgotten why they set out',
    'a widow who took up her husband’s sword',
    'a town crier who knows every rumour',
    'a bookish lay brother who has never left the abbey',
  ],
  settings: [
    'a walled market town on a busy river',
    'a monastery carved into sea cliffs',
    'a salt marsh crossed by an old causeway',
    'a winter fair on a frozen river',
    'a royal forest where hunting is forbidden',
    'a bridge-city strung between two kingdoms',
    'a hillside vineyard at harvest time',
    'a mountain pass watched by a lonely tower',
    'a university town full of arguing scholars',
    'a fishing village with more boats than houses',
    'the crowded kitchens and cellars of a great castle',
    'a pilgrim road lined with inns',
    'a mining village under a grey mountain',
    'a queen’s summer palace and its gardens',
    'an island reached only at low tide',
    'a travelling circus crossing the moors',
    'a busy port where three languages are spoken',
    'a sleepy village on midsummer’s eve',
    'a ruined hill fort above a quiet valley',
    'an orchard valley full of cider presses',
    'a lakeside town built on stilts',
    'a border garrison bored out of its wits',
    'a cathedral town raising its new spire',
    'a tournament field on the day of the joust',
    'a moorland crossroads with a single inn',
    'a river port crowded with barges',
    'a snowbound manor cut off by drifts',
    'a wool town on market day',
    'a valley of standing stones',
    'a duke’s estate in autumn',
    'a copper-roofed city of guilds',
    'a wild coast of shipwrecks and beacons',
    'a village of dyers in a misty glen',
    'an ancient road through dark woods',
    'a floating market on a slow brown river',
    'a chalk hillside with a giant cut into the turf',
    'a royal menagerie full of strange beasts',
    'a spa town of hot springs and scandal',
    'a clan hall in the highland heather',
    'a seaside town in the middle of its herring festival',
  ],
  tones: ['fairy-tale', 'cursed', ...STANDARD_TONES],
  ui: {
    turnTo: 'turn to',
    pageLabel: plain,
    finis: 'Finis',
    unwritten: 'no one has gone this way',
    waiting: 'The ink is still wet on this page…',
    tapHint: 'tap to read ahead',
    goBack: 'Go back and choose differently',
    beginAgain: 'Begin the tale again',
    anotherBook: 'Choose another book',
    toLibrary: 'return to the library',
    firstToEnd: 'You are the first to find this ending',
    foundBy: (n) => `Found by ${n} readers`,
    heroLabel: 'You are',
    settingLabel: 'In',
    toneLabel: 'And the tale is',
    begin: 'Begin',
    roll: 'Roll the dice',
    binding: 'Binding the book…',
    fleuron: '❦',
    endMark: '✠',
    more: 'turn the leaf',
    settings: 'The Reader’s Preferences',
    narratorWait: 'The chronicler clears their throat…',
    pace: 120,
  },
}

export const future: Theme = {
  id: 'future',
  name: 'Future',
  tagline: 'Deep space, cold light, strange signals',
  narration:
    'Tell it like classic adventure science fiction (think The Martian or Star Trek): clear, practical and a ' +
    'little dry, with the hero solving problems. Technology has plain names (the airlock, the oxygen gauge, ' +
    'the ship’s computer) and is never explained at length. Second person, present tense. ' +
    'Family-friendly: danger yes, gore no.',
  illustration:
    'Very simple thin-line technical drawing, like a blueprint or a starship schematic: clean single-weight ' +
    'black lines on a pure white background, no color, no shading, no text, labels or numbers. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a salvage pilot with more debts than friends',
    'the only engineer awake on a generation ship',
    'a courier who never asks what they carry',
    'a xenobotanist who prefers plants to people',
    'a station AI’s only human friend',
    'a cadet who failed the pilot exam twice',
    'a smuggler with a soft spot for strays',
    'a keeper of a beacon at the edge of the galaxy',
    'a retired starship captain who now drives a taxi',
    'a teenage hacker who has never been off-planet',
    'a colony medic who never sleeps',
    'an alien-language translator with a terrible accent',
    'a maintenance robot that has just become curious',
    'an ex-soldier who repairs music boxes',
    'a weather controller on a terraformed world',
    'a diplomat who hates speeches',
    'a janitor aboard the flagship of the fleet',
    'a chef on an interstellar cruise liner',
    'a clone who is not sure which copy they are',
    'an asteroid prospector with a lucky wrench',
    'a zero-gravity athlete past their prime',
    'a newsfeed reporter chasing a first big story',
    'a quarantine officer who goes by the book',
    'a colony schoolteacher with too many questions',
    'a test pilot with nerves of steel and no sense of humour',
    'a trader who haggles in eleven dialects',
    'a dockyard welder with a famous grandmother',
    'an archivist who knows Earth only from old films',
    'an android bartender who collects stories',
    'a stowaway who knows the ship better than its crew',
    'a planetary surveyor who always gets lost',
    'a signals officer who hears patterns everywhere',
    'a hydroponics farmer who sings to the crops',
    'an insurance investigator for lost starships',
    'one half of a pair of mechanic twins',
    'a security chief who trusts no one',
    'a runaway heir to a shipping empire',
    'a deep-space ambulance pilot',
    'a holo-film stunt double',
    'a cheerful mapmaker of wormholes',
  ],
  settings: [
    'an orbital city spinning above a gas giant',
    'a research vessel drifting near a black hole',
    'a mining colony inside a hollow asteroid',
    'a floating market in Jupiter’s clouds',
    'a greening Mars of pine forests and dust storms',
    'a relay station on the rim of known space',
    'an ice moon with an ocean under its crust',
    'a sleeper ship three centuries into its voyage',
    'a honeymoon resort on a ringed planet',
    'an underwater city on a water world',
    'the halfway station of a space elevator',
    'a desert planet of glass dunes',
    'a crowded spaceport at a trade crossroads',
    'a derelict alien megastructure',
    'a colony dome on a world where it is always sunset',
    'a jungle planet thick with glowing fungus',
    'a prison asteroid turned into a casino',
    'a shipyard building the fleet’s largest ship',
    'a Martian university city',
    'an ice-hauling tug in the rings of Saturn',
    'a research outpost riding a comet',
    'a neon megacity on an overcrowded Earth',
    'a quiet farming colony under two suns',
    'a hospital ship following the frontier',
    'a wheel-shaped habitat turning in the dark',
    'a space museum orbiting the Moon',
    'a storm-wracked ocean planet of floating rigs',
    'a cloud city of balloons and walkways above Venus',
    'a racing circuit through an asteroid belt',
    'an embassy shared by three alien species',
    'a cargo freighter on a long, dull route',
    'a lunar mining town with one bar',
    'a moon closed to tourists',
    'a seed vault buried in Pluto’s ice',
    'a forest world where the trees are taller than towers',
    'a bullet train crossing a frozen planet',
    'an abandoned amusement park in orbit',
    'a scrapyard moon of broken ships',
    'a university ship that never stops moving',
    'a planet-wide archive with no living staff',
  ],
  tones: ['cosmic', 'cyberpunk', ...STANDARD_TONES],
  ui: {
    turnTo: 'jump to',
    pageLabel: (n) => `LOG ${String(n).padStart(3, '0')}`,
    finis: 'End of Transmission',
    unwritten: 'uncharted',
    waiting: 'Receiving transmission…',
    tapHint: 'tap to decode all',
    goBack: 'Rewind to the last decision',
    beginAgain: 'Replay from the first log',
    anotherBook: 'Open another archive',
    toLibrary: 'return to the archive',
    firstToEnd: 'First signal ever received from this ending',
    foundBy: (n) => `Reached by ${n} explorers`,
    heroLabel: 'Identity',
    settingLabel: 'Location',
    toneLabel: 'Signal',
    begin: 'Launch',
    roll: 'Randomize',
    binding: 'Establishing uplink…',
    fleuron: '◇',
    endMark: '◈',
    more: 'next screen',
    settings: 'System Settings',
    narratorWait: 'Decoding voice log…',
    pace: 70,
  },
}

export const noir: Theme = {
  id: 'noir',
  name: 'Noir',
  tagline: 'Rain, neon and a case that won’t stay closed',
  narration:
    'Tell it like hardboiled 1940s detective fiction: short, punchy sentences, a dry wisecrack now and then ' +
    '(one good one beats five), and people who all want something and lie about it. The mystery is the point: ' +
    'every page turns up a clue, a lie or a threat. Second person, present tense. ' +
    'Family-friendly: menace and mystery, no gore.',
  illustration:
    'Quick charcoal and ink-wash sketch in a 1940s film-noir style: bold black shapes, dramatic shadow, ' +
    'rough grainy strokes, on a pure white background. No color, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a private eye three months behind on rent',
    'a newspaper photographer with a nose for trouble',
    'a lounge singer with a borrowed name',
    'a rookie cop who won’t take a bribe',
    'an insurance investigator who smells a rat in every claim',
    'a taxi driver who knows every street in the city',
    'a pawnbroker who remembers every face',
    'a retired safecracker trying to stay honest',
    'a switchboard operator who hears everything',
    'a boxer who was paid to lose and didn’t',
    'a cigarette girl saving up for college',
    'a public defender nobody takes seriously',
    'a jazz pianist with insomnia',
    'a society columnist with a past',
    'a mechanic who fixes cars and asks no questions',
    'a detective’s widow who took over the agency',
    'a small-time bookie with a big conscience',
    'an out-of-work circus strongman',
    'a newsboy who wants to be a reporter',
    'a coroner’s assistant who notices details',
    'a bartender who never forgets an order',
    'a former heavyweight turned bodyguard',
    'a telegram messenger on a bicycle',
    'a locksmith who keeps odd hours',
    'a house detective close to retirement',
    'a con artist who wants out of the game',
    'a radio actor with a hundred voices',
    'a schoolteacher who reads too many crime novels',
    'a waterfront night watchman',
    'a fashion model tired of being underestimated',
    'a disbarred lawyer who still has friends',
    'a mob accountant who is good with numbers and bad with lies',
    'a doorman at the swankiest building in town',
    'a war veteran with a steady hand and shaky nerves',
    'a museum guard who knows every painting',
    'a fortune teller who doesn’t believe in fortunes',
    'a court stenographer who types faster than anyone talks',
    'a pool hustler with a code of honour',
    'a florist who delivers to all the wrong people',
    'an elevator operator who sees who goes where',
  ],
  settings: [
    'a rain-soaked port city in 1947',
    'a jazz club where the band never stops',
    'a grand hotel on a stormy night',
    'the docks on a foggy midnight',
    'a movie studio backlot',
    'a night train between two cities',
    'a boarding house with thin walls',
    'a racetrack at the end of the season',
    'a jewellery store after closing time',
    'a neon boardwalk in the off season',
    'a police precinct on the graveyard shift',
    'a mansion on the hill above the city',
    'a printing plant on deadline night',
    'an all-night diner by the highway',
    'a skyscraper observation deck',
    'a warehouse district by the river',
    'a private club for the very rich',
    'a courthouse in the middle of a big trial',
    'a desert motel on a lonely road',
    'a bus station at midnight',
    'an ocean liner docked for the night',
    'a boxing gym in a basement',
    'a city hall full of crooked deals',
    'a gambling barge off the coast',
    'a funeral parlour in a quiet suburb',
    'a rooftop garden above the business district',
    'a street of pawnshops under the elevated railway',
    'a city hospital in a heatwave',
    'a small town where everyone knows everyone',
    'a nightclub on New Year’s Eve',
    'an art gallery on opening night',
    'a lighthouse on a rocky point outside the city',
    'a bowling alley that stays open all night',
    'a riverboat restaurant',
    'a little airfield on the edge of town',
    'a seaside resort after the summer crowds have gone',
    'a greenhouse nursery on the city limits',
    'an old theatre closing for good',
    'a busy union hall',
    'the city zoo after dark',
  ],
  tones: ['hardboiled', 'double-crossing', ...STANDARD_TONES],
  ui: {
    turnTo: 'see file',
    pageLabel: (n) => `No. ${n}`,
    finis: 'Case Closed',
    unwritten: 'nobody’s followed this lead',
    waiting: 'Typing up the report…',
    tapHint: 'tap to skim the file',
    goBack: 'Go back to the last lead',
    beginAgain: 'Reopen the case',
    anotherBook: 'Pull another file',
    toLibrary: 'back to the cabinet',
    firstToEnd: 'You’re the first to close it this way',
    foundBy: (n) => `${n} detectives closed it this way`,
    heroLabel: 'You’re',
    settingLabel: 'Working',
    toneLabel: 'And the night is',
    begin: 'Open the Case',
    roll: 'Roll the dice',
    binding: 'Pulling the file…',
    fleuron: '— ✕ —',
    endMark: '■',
    more: 'next sheet',
    settings: 'House Rules',
    narratorWait: 'Lighting a cigarette…',
    pace: 85,
  },
}

export const pirate: Theme = {
  id: 'pirate',
  name: 'Pirate',
  tagline: 'Salt, tar and treasure on the high seas',
  narration:
    'Tell it like a rollicking pirate adventure (think Treasure Island): brisk action, bold characters, banter ' +
    'and double-crosses. Sailor words only where the meaning is obvious (deck, mast, cannon), and a little ' +
    'swagger in the dialogue. Second person, present tense. Family-friendly: storms, rivals and curses, no gore.',
  illustration:
    'Simple black ink engraving in the style of an 18th-century sea chart or ship’s log illustration: ' +
    'fine hatched lines on a pure white background, no color, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a cabin boy who can read the stars',
    'a navigator who has never lost her way',
    'a ship’s cook who used to be a captain',
    'a mapmaker’s apprentice who gets seasick',
    'a privateer who has lost her licence',
    'a lighthouse keeper’s son who can’t swim',
    'a parrot trainer with a very chatty parrot',
    'a quartermaster everyone trusts with the gold',
    'a ship’s surgeon who faints at the sight of blood',
    'a powder monkey small enough to hide anywhere',
    'a retired pirate queen who now keeps goats',
    'a governor’s daughter who wants adventure',
    'a sailmaker with nimble fingers and a quick wit',
    'a boatswain with a voice like a foghorn',
    'a stowaway fiddler',
    'a harbour pilot who knows every reef',
    'a young carpenter’s mate',
    'a lookout with the sharpest eyes at sea',
    'a former navy officer who switched sides',
    'a pearl diver who can hold her breath for ages',
    'a cabin girl who talks to the ship’s cat',
    'a gunner who is deaf in one ear',
    'a merchant’s clerk who counts every coin',
    'a treasure hunter who has never found treasure',
    'an old sea dog with a wooden leg and a soft heart',
    'a castaway rescued after three years alone',
    'a boatman’s daughter who can row without a sound',
    'a harpooner who gave up whaling',
    'a shanty singer who knows every crew’s gossip',
    'a young captain on her first voyage',
    'a customs officer who secretly admires pirates',
    'a rigger who is fearless up the mast',
    'a fisherman’s widow with a grudge against the sea',
    'a ship’s boy with a noble secret',
    'a bookish purser who has read every sea story',
    'a dockside barber who pulls teeth on the side',
    'a navy drummer boy',
    'a rope-maker’s apprentice',
    'a ship’s chaplain who swears like a sailor',
    'an escaped convict who knows how to sail',
  ],
  settings: [
    'a pirate port where every tavern has a trapdoor',
    'a becalmed sea of floating weed',
    'a smugglers’ cove under a chalk cliff',
    'an island that isn’t on any chart',
    'a merchant convoy in hurricane season',
    'a half-sunken city at low tide',
    'a ships’ graveyard in the fog',
    'a mansion on a hill of palms',
    'a coral maze of hidden channels',
    'a naval fortress guarding a busy strait',
    'a tropical market town full of spices',
    'a fishing station at the edge of the ice',
    'a floating town built from old hulls',
    'a volcanic island with black sand beaches',
    'a navy flagship under full sail',
    'a mangrove swamp full of hidden creeks',
    'a sandbar island with one palm tree',
    'a trading post on a jungle river',
    'a cliffside town of rope bridges',
    'a busy shipyard building a new frigate',
    'a stilt village on a turquoise lagoon',
    'a storm-battered rock with a single beacon',
    'a colonial capital with a famous treasury',
    'a fog-bound northern harbour',
    'an archipelago of a hundred small islands',
    'a prison hulk moored in the harbour',
    'a secret island where pirate captains meet',
    'a coastal fort with rusty cannons',
    'a pirate ship three months from land',
    'the trade-wind route between two continents',
    'a jungle island overrun with monkeys',
    'a sea cave glittering with glowing plankton',
    'a sleepy port where nothing ever happens',
    'a gambling den on a moored ship',
    'a turtle-shaped island with a freshwater spring',
    'a stormy cape where two oceans meet',
    'a sandy cay where fishermen dry their nets',
    'a flooded temple ruin on the shore',
    'a beach strewn with wreckage after a storm',
    'the lantern-lit quarter of a great port city',
  ],
  tones: ['swashbuckling', 'treasure-hunting', ...STANDARD_TONES],
  ui: {
    turnTo: 'turn to',
    pageLabel: plain,
    finis: 'Voyage’s End',
    unwritten: 'uncharted waters',
    waiting: 'Charting the course…',
    tapHint: 'tap to read ahead',
    goBack: 'Come about and choose again',
    beginAgain: 'Weigh anchor from the start',
    anotherBook: 'Choose another voyage',
    toLibrary: 'back to port',
    firstToEnd: 'First crew to drop anchor here',
    foundBy: (n) => `${n} crews have ended here`,
    heroLabel: 'Ye be',
    settingLabel: 'Bound for',
    toneLabel: 'And the tale be',
    begin: 'Set Sail',
    roll: 'Roll the bones',
    binding: 'Hoisting the sails…',
    fleuron: '⚓\uFE0E',
    endMark: '☠\uFE0E',
    more: 'turn the page',
    settings: 'Ship’s Articles',
    narratorWait: 'The bosun wets his whistle…',
    pace: 115,
  },
}

export const ancient: Theme = {
  id: 'ancient',
  name: 'Ancient Myth',
  tagline: 'Gods, heroes and the wine-dark sea',
  narration:
    'Tell it like a Greek myth retold for young readers: simple, grand and direct. Gods behave like people ' +
    'with enormous power and short tempers; they bargain, meddle and play favourites. Oracles speak in riddles ' +
    'the reader can actually solve. Plain modern English, never mock-archaic. Second person, present tense. ' +
    'Family-friendly: monsters and trials, no gore.',
  illustration:
    'Simple figure in the style of ancient Greek black-figure pottery: flat black silhouette with a few thin ' +
    'incised lines, on a pure white background, no color, no border, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a shepherd with more courage than sense',
    'an exiled princess of Crete',
    'a potter’s son who hates getting his hands dirty',
    'a young priestess who asks too many questions',
    'the fastest runner in the city',
    'a sailor with a gift for telling lies',
    'a clever servant in a king’s house',
    'an old poet going blind',
    'a goatherd girl who wrestles better than the boys',
    'a temple thief with a conscience',
    'a retired wrestler who now runs a bakery',
    'a farmer’s daughter promised to a man she has never met',
    'a bronze-smith’s apprentice',
    'a fisherman who has never caught anything',
    'the shy son of a famous hero',
    'a healer from the high hills',
    'a merchant who has sailed further than anyone',
    'a young palace scribe',
    'a soldier weary of war',
    'a weaver who can outwit anyone at riddles',
    'a youth raised alone in the wild hills',
    'a beekeeper from the slopes of Hymettus',
    'an Amazon scout far from home',
    'a charioteer who lost his last race',
    'a lyre player who has never performed in public',
    'a nymph’s human foster child',
    'a stonecutter from the quarries',
    'a widow who runs her husband’s olive farm',
    'a young king who never wanted the crown',
    'a stargazer who studies the heavens',
    'a wine-seller with a thousand stories',
    'a palace gardener',
    'a twin always mistaken for the other',
    'a huntress who would rather outwit than kill',
    'a rower on a warship',
    'a trader of amber from the far north',
    'the youngest daughter of a river god',
    'a boxer with a broken nose and a kind heart',
    'a sculptor who is never satisfied',
    'a traveller from a land no one has heard of',
  ],
  settings: [
    'the wine-dark Aegean',
    'a labyrinth beneath a palace',
    'the foothills of Mount Olympus',
    'a walled city in the tenth year of a siege',
    'the island of a sorceress',
    'the gates of the Underworld',
    'a sanctuary of Apollo on a mountainside',
    'the markets of Alexandria at midsummer',
    'a harbour town of whitewashed houses',
    'the stadium at Olympia during the games',
    'a forest sacred to Artemis',
    'a plain of endless grass beyond the Black Sea',
    'the bronze-gated city of Troy',
    'an island of wild goats and fig trees',
    'a vineyard on the slopes of a volcano',
    'a palace of painted halls by the sea',
    'a river delta full of reeds and herons',
    'an Athenian marketplace full of philosophers',
    'a windswept island of white cliffs',
    'a Spartan training camp',
    'a seaside cave where the winds are kept',
    'the garden at the edge of the world',
    'a country festival of Dionysus',
    'a fishing island ruled by a young queen',
    'the cold shores beyond the known world',
    'a mountain village above the clouds',
    'a trireme on a long voyage',
    'a hillside theatre on the night of a new play',
    'a desert oasis with a shrine of Ammon',
    'the court of a vain king',
    'an island guarded by a bronze giant',
    'a narrow strait between a whirlpool and a cliff',
    'a horse-breeding town in Thessaly',
    'a city grown rich from silver mines',
    'a wedding feast on Mount Pelion',
    'a pine forest where centaurs roam',
    'an island of lotus fields',
    'a citadel of giant stone walls',
    'the pilgrim road to Delphi',
    'a valley of hot springs',
  ],
  tones: ['fated', 'monster-slaying', ...STANDARD_TONES],
  ui: {
    turnTo: 'go to',
    pageLabel: toRoman,
    finis: 'Here the Song Ends',
    unwritten: 'untrodden by any mortal',
    waiting: 'The oracle is speaking…',
    tapHint: 'tap to hear it all',
    goBack: 'Return to the crossroads',
    beginAgain: 'Begin the song again',
    anotherBook: 'Choose another myth',
    toLibrary: 'return to the library',
    firstToEnd: 'You are the first mortal to meet this fate',
    foundBy: (n) => `${n} heroes have met this fate`,
    heroLabel: 'Sing of',
    settingLabel: 'In',
    toneLabel: 'And the song is',
    begin: 'Begin',
    roll: 'Cast the bones',
    binding: 'The Muse is singing…',
    fleuron: '⁘',
    endMark: 'Ω',
    more: 'unroll',
    settings: 'The Reader’s Customs',
    narratorWait: 'The singer tunes the lyre…',
    pace: 115,
  },
}

export const dream: Theme = {
  id: 'dream',
  name: 'Dreamscape',
  tagline: 'Dreams, illusions and other selves',
  narration:
    'Tell it like a vivid dream that feels completely real while it lasts (think Spirited Away or Coraline): ' +
    'ordinary places and people with one thing quietly wrong. The strangeness makes sense emotionally: the dream ' +
    'is about something the hero cares about, a worry, a hope, someone they miss. Easy to follow, never nonsense ' +
    'or paradox for its own sake, and one strange thing at a time. Uncanny rather than frightening. ' +
    'Second person, present tense. Family-friendly.',
  illustration:
    'Delicate surrealist fine-line drawing of a single impossible or dreamlike object (a door standing alone ' +
    'in open sky, a staircase folding into itself): thin black lines on a pure white background, no color, ' +
    'no shading fills, no text or lettering. Centered, with plenty of empty space around it.',
  heroes: [
    'a sleepwalker who never wakes in the same bed',
    'a stage magician who never reveals a trick',
    'a child who is afraid of the dark',
    'a mirror-maker who never looks in mirrors',
    'a mapmaker who has never left home',
    'someone who keeps dreaming of a town they have never visited',
    'a ticket inspector who never takes a holiday',
    'a sleepy night-bus driver',
    'a retired toymaker',
    'an insomniac astronomer',
    'a cat-sitter looking after a very old cat',
    'a piano tuner with perfect pitch',
    'one of a set of triplets',
    'a ghost who doesn’t know they’re a ghost',
    'a clockmaker’s apprentice who hates clocks',
    'a baker who works while everyone else sleeps',
    'a daydreaming office clerk',
    'a tightrope walker',
    'an old woman who still feels seven years old',
    'a balloonist on her first solo flight',
    'a gardener who talks to her plants',
    'a kite-maker',
    'a painter who has not finished a picture in years',
    'a worrier who always carries an umbrella',
    'a lullaby singer',
    'a puppeteer whose puppets are their only friends',
    'a night-shift nurse',
    'an astronaut who has just come home',
    'a boy who records every sound he hears',
    'a grandmother of enormous calm who is always knitting',
    'a teenager who ran away from their own birthday party',
    'a scientist who studies sleep',
    'a snow sculptor',
    'an origami artist',
    'a postman on his last round before retirement',
    'a sailor home after many years away',
    'a new father who has forgotten what rest feels like',
    'a lift attendant in an old department store',
    'a retired firefighter',
    'a violinist who can only play one tune',
  ],
  settings: [
    'a seaside town on the last evening of summer',
    'the house you grew up in, quiet at night',
    'a night train crossing endless snow',
    'a hotel whose corridors grow a little longer every night',
    'a library that never closes',
    'a moonlit courtyard behind a convent',
    'a harbour town built on stilts over a calm sea',
    'a lighthouse on a sea of fog',
    'a mountain village above a sea of clouds',
    'a forest hung with lanterns',
    'a town where it has rained for a hundred days',
    'a travelling circus packing up for winter',
    'a still black lake under the stars',
    'a night market that sells things people have lost',
    'a rooftop observatory above a sleeping city',
    'your old school, after everyone has gone home',
    'a desert town at the edge of a salt flat',
    'a snowbound village where every window is lit',
    'a glasshouse full of tropical birds',
    'a hedge maze behind a shuttered manor',
    'a seaside pier with a closed-up funfair',
    'a museum after closing time',
    'an attic full of other people’s belongings',
    'a ferry that crosses the same river all night',
    'a flooded ballroom in an old seaside palace',
    'a small island with one house on it',
    'an orchard in the first frost',
    'a railway station where the last train is late',
    'a forest where the paths change behind you',
    'a zoo at night',
    'a carousel in an empty park',
    'a city of bridges over a slow river',
    'a concert hall with one seat left',
    'a candle-lit monastery in the hills',
    'an endless shore at twilight',
    'a tearoom open only at night',
    'a planetarium after the last show',
    'a quiet street where every house looks familiar',
    'a winter festival on a frozen lake',
    'a houseboat drifting down a wide river',
  ],
  tones: ['surreal', 'whimsical', ...STANDARD_TONES],
  ui: {
    turnTo: 'drift to',
    pageLabel: plain,
    finis: 'And Then You Wake',
    unwritten: 'no one has dreamed this yet',
    waiting: 'The dream is shifting…',
    tapHint: 'tap to remember it all',
    goBack: 'Slip back into the dream',
    beginAgain: 'Dream it again',
    anotherBook: 'Choose another dream',
    toLibrary: 'wake in the library',
    firstToEnd: 'No one has woken here before',
    foundBy: (n) => `${n} dreamers have woken here`,
    heroLabel: 'You dream you are',
    settingLabel: 'Adrift in',
    toneLabel: 'And the dream is',
    begin: 'Dream',
    roll: 'Shuffle fate',
    binding: 'Falling asleep…',
    fleuron: '✧',
    endMark: '☾',
    more: 'drift on',
    settings: 'Dream Settings',
    narratorWait: 'A voice is gathering…',
    pace: 125,
  },
}

/** The library's own look (title pages, shelf, settings): no particular kind of book. */
export type DeskTheme = ThemeId | 'library'

/** Interface words for the library pages. */
export const libraryUi: ThemeUi = {
  ...historicFantasy.ui,
  turnTo: 'turn to',
  more: 'next',
  settings: 'Settings',
  anotherBook: 'Back to the library',
  toLibrary: 'the library',
  fleuron: '✦',
}

const themes: Record<ThemeId, Theme> = {
  'historic-fantasy': historicFantasy,
  future,
  noir,
  pirate,
  ancient,
  dream,
}

export function getTheme(id: ThemeId): Theme {
  return themes[id] ?? historicFantasy
}

export const themeIds = Object.keys(themes) as ThemeId[]
export const allThemes = themeIds.map((id) => themes[id])
