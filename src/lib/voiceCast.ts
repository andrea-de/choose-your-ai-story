/**
 * Voices a tale can be read in: Gemini's thirty studio voices, and a selection
 * from its Extended Voice Library of real accents and ages (a few per accent,
 * storytellers first), taken from the API's voice list in September 2026.
 * A narrator's accent comes from casting the right voice, not from asking one
 * voice to put an accent on, which is what Google's guide recommends.
 */
export interface CastVoice {
  id: string
  accent: string
  /** For the studio voices: Google's one-word description of the sound. */
  sound?: string
  gender?: string
  age?: number
  pitch?: string
}

export const VOICE_CAST: readonly CastVoice[] = [
  { id: 'zephyr', accent: 'General American', sound: 'bright' },
  { id: 'puck', accent: 'General American', sound: 'upbeat' },
  { id: 'charon', accent: 'General American', sound: 'informative, deep', gender: 'male', pitch: 'low' },
  { id: 'kore', accent: 'General American', sound: 'firm' },
  { id: 'fenrir', accent: 'General American', sound: 'excitable' },
  { id: 'leda', accent: 'General American', sound: 'youthful' },
  { id: 'orus', accent: 'General American', sound: 'firm' },
  { id: 'aoede', accent: 'General American', sound: 'breezy', gender: 'female', pitch: 'medium' },
  { id: 'callirrhoe', accent: 'General American', sound: 'easy-going', gender: 'female', pitch: 'medium' },
  { id: 'autonoe', accent: 'General American', sound: 'bright', gender: 'female', pitch: 'medium' },
  { id: 'enceladus', accent: 'General American', sound: 'breathy' },
  { id: 'iapetus', accent: 'General American', sound: 'clear' },
  { id: 'umbriel', accent: 'General American', sound: 'easy-going' },
  { id: 'algieba', accent: 'General American', sound: 'smooth', gender: 'male', pitch: 'low' },
  { id: 'despina', accent: 'General American', sound: 'smooth', gender: 'female', pitch: 'medium' },
  { id: 'erinome', accent: 'General American', sound: 'clear' },
  { id: 'algenib', accent: 'General American', sound: 'gravelly', gender: 'male', pitch: 'low' },
  { id: 'rasalgethi', accent: 'General American', sound: 'informative' },
  { id: 'laomedeia', accent: 'General American', sound: 'upbeat' },
  { id: 'achernar', accent: 'General American', sound: 'soft', gender: 'female', pitch: 'high' },
  { id: 'alnilam', accent: 'General American', sound: 'firm', gender: 'male', pitch: 'low' },
  { id: 'schedar', accent: 'General American', sound: 'even' },
  { id: 'gacrux', accent: 'General American', sound: 'mature' },
  { id: 'pulcherrima', accent: 'General American', sound: 'forward' },
  { id: 'achird', accent: 'General American', sound: 'friendly', gender: 'male', pitch: 'low' },
  { id: 'zubenelgenubi', accent: 'General American', sound: 'casual' },
  { id: 'vindemiatrix', accent: 'General American', sound: 'gentle' },
  { id: 'sadachbia', accent: 'General American', sound: 'lively' },
  { id: 'sadaltager', accent: 'General American', sound: 'knowledgeable' },
  { id: 'sulafat', accent: 'General American', sound: 'warm' },
  { id: 'en-au-storyteller-1', accent: 'Sydney English', gender: 'female', age: 43, pitch: 'low' },
  { id: 'en-au-storyteller-3', accent: 'Sydney English', gender: 'female', age: 43, pitch: 'high' },
  { id: 'en-au-storyteller-2', accent: 'Sydney English', gender: 'male', age: 38, pitch: 'low' },
  { id: 'en-au-storyteller-4', accent: 'Sydney English', gender: 'female', age: 26, pitch: 'medium' },
  { id: 'en-ca-storyteller-6', accent: 'Toronto English', gender: 'female', age: 64, pitch: 'low' },
  { id: 'en-ca-storyteller-7', accent: 'Toronto English', gender: 'female', age: 63, pitch: 'high' },
  { id: 'en-ca-storyteller-3', accent: 'Toronto English', gender: 'male', age: 39, pitch: 'low' },
  { id: 'en-ca-advisor-5', accent: 'Toronto English', gender: 'female', age: 65, pitch: 'medium' },
  { id: 'en-ca-storyteller-1', accent: 'Vancouver English', gender: 'male', age: 57, pitch: 'low' },
  { id: 'en-ca-storyteller-4', accent: 'Vancouver English', gender: 'female', age: 46, pitch: 'medium' },
  { id: 'en-ca-assistant-1', accent: 'Vancouver English', gender: 'female', age: 66, pitch: 'high' },
  { id: 'en-ca-concierge-7', accent: 'Vancouver English', gender: 'neutral', age: 64, pitch: 'medium' },
  { id: 'en-gb-storyteller-2', accent: 'Winchester English', gender: 'female', age: 51, pitch: 'high' },
  { id: 'en-gb-tutor-9', accent: 'Winchester English', gender: 'male', age: 46, pitch: 'low' },
  { id: 'en-gb-tutor-13', accent: 'Winchester English', gender: 'female', age: 33, pitch: 'medium' },
  { id: 'en-gb-tutor-12', accent: 'Winchester English', gender: 'female', age: 32, pitch: 'low' },
  { id: 'en-gb-storyteller-4', accent: 'Bristol English', gender: 'male', age: 56, pitch: 'low' },
  { id: 'en-gb-podcaster-12', accent: 'Bristol English', gender: 'female', age: 58, pitch: 'medium' },
  { id: 'en-gb-assistant-11', accent: 'Bristol English', gender: 'neutral', age: 38, pitch: 'high' },
  { id: 'en-gb-concierge-11', accent: 'Bristol English', gender: 'female', age: 36, pitch: 'low' },
  { id: 'en-gb-tutor-5', accent: 'Glasgow English', gender: 'female', age: 62, pitch: 'medium' },
  { id: 'en-gb-assistant-5', accent: 'Glasgow English', gender: 'male', age: 62, pitch: 'low' },
  { id: 'en-gb-concierge-8', accent: 'Glasgow English', gender: 'male', age: 62, pitch: 'medium' },
  { id: 'en-gb-advisor-11', accent: 'Glasgow English', gender: 'female', age: 44, pitch: 'high' },
  { id: 'en-gb-tutor-2', accent: 'Newcastle English', gender: 'male', age: 42, pitch: 'medium' },
  { id: 'en-gb-storyteller-5', accent: 'Newcastle English', gender: 'female', age: 41, pitch: 'high' },
  { id: 'en-gb-concierge-12', accent: 'Newcastle English', gender: 'male', age: 57, pitch: 'low' },
  { id: 'en-gb-tutor-18', accent: 'Newcastle English', gender: 'female', age: 34, pitch: 'medium' },
  { id: 'en-gb-assistant-3', accent: 'Manchester English', gender: 'female', age: 45, pitch: 'low' },
  { id: 'en-gb-advisor-2', accent: 'Manchester English', gender: 'male', age: 44, pitch: 'medium' },
  { id: 'en-gb-advisor-5', accent: 'Manchester English', gender: 'male', age: 48, pitch: 'low' },
  { id: 'en-gb-techagent-7', accent: 'Manchester English', gender: 'female', age: 47, pitch: 'high' },
  { id: 'en-gb-concierge-10', accent: 'Liverpool English', gender: 'male', age: 64, pitch: 'low' },
  { id: 'en-gb-training-6', accent: 'Liverpool English', gender: 'female', age: 61, pitch: 'medium' },
  { id: 'en-gb-assistant-7', accent: 'Liverpool English', gender: 'female', age: 47, pitch: 'low' },
  { id: 'en-ie-storyteller-3', accent: 'Dublin English', gender: 'male', age: 64, pitch: 'low' },
  { id: 'en-ie-storyteller-6', accent: 'Dublin English', gender: 'female', age: 62, pitch: 'low' },
  { id: 'en-ie-storyteller-5', accent: 'Dublin English', gender: 'male', age: 55, pitch: 'medium' },
  { id: 'en-ie-storyteller-1', accent: 'Dublin English', gender: 'female', age: 31, pitch: 'high' },
  { id: 'en-in-storyteller-9', accent: 'Indian English', gender: 'female', age: 61, pitch: 'high' },
  { id: 'en-in-storyteller-4', accent: 'Indian English', gender: 'male', age: 54, pitch: 'low' },
  { id: 'en-in-storyteller-3', accent: 'Indian English', gender: 'female', age: 41, pitch: 'low' },
  { id: 'en-in-storyteller-12', accent: 'Indian English', gender: 'neutral', age: 34, pitch: 'high' },
  { id: 'en-nz-concierge-4', accent: 'Auckland New Zealand English', gender: 'male', age: 65, pitch: 'low' },
  { id: 'en-nz-csagent-7', accent: 'Auckland New Zealand English', gender: 'female', age: 60, pitch: 'high' },
  { id: 'en-nz-tutor-6', accent: 'Auckland New Zealand English', gender: 'female', age: 57, pitch: 'low' },
  { id: 'en-nz-concierge-2', accent: 'Auckland New Zealand English', gender: 'female', age: 44, pitch: 'medium' },
  { id: 'en-us-storyteller-10', accent: 'Northwest', gender: 'male', age: 43, pitch: 'low' },
  { id: 'en-us-advisor-1', accent: 'Northwest', gender: 'female', age: 65, pitch: 'low' },
  { id: 'en-us-zali', accent: 'Northwest', gender: 'female', age: 62, pitch: 'medium' },
  { id: 'en-us-tutor-13', accent: 'Northwest', gender: 'female', age: 59, pitch: 'high' },
  { id: 'en-us-storyteller-12', accent: 'West Coast', gender: 'male', age: 65, pitch: 'low' },
  { id: 'en-us-podcaster-3', accent: 'West Coast', gender: 'female', age: 65, pitch: 'low' },
  { id: 'en-us-tutor-9', accent: 'West Coast', gender: 'female', age: 65, pitch: 'medium' },
  { id: 'en-us-concierge-3', accent: 'West Coast', gender: 'male', age: 62, pitch: 'medium' },
  { id: 'en-us-sami', accent: 'East Coast', gender: 'female', age: 64, pitch: 'low' },
  { id: 'en-us-storyteller-9', accent: 'East Coast', gender: 'male', age: 55, pitch: 'low' },
  { id: 'en-us-storyteller-11', accent: 'East Coast', gender: 'female', age: 53, pitch: 'medium' },
  { id: 'en-us-tutor-5', accent: 'East Coast', gender: 'female', age: 57, pitch: 'high' },
  { id: 'en-us-storyteller-6', accent: 'Gulf Coast', gender: 'female', age: 56, pitch: 'medium' },
  { id: 'en-us-assistant-6', accent: 'Gulf Coast', gender: 'female', age: 50, pitch: 'low' },
  { id: 'en-us-storyteller-7', accent: 'Gulf Coast', gender: 'male', age: 40, pitch: 'high' },
  { id: 'en-us-storyteller-5', accent: 'Gulf Coast', gender: 'male', age: 25, pitch: 'low' },
  { id: 'en-us-assistant-7', accent: 'Inland Southern', gender: 'female', age: 31, pitch: 'low' },
  { id: 'en-us-csagent-15', accent: 'Inland Southern', gender: 'male', age: 64, pitch: 'low' },
  { id: 'en-us-concierge-11', accent: 'Inland Southern', gender: 'female', age: 62, pitch: 'medium' },
  { id: 'en-us-training-9', accent: 'Inland Southern', gender: 'neutral', age: 45, pitch: 'low' },
  { id: 'en-us-tutor-19', accent: 'Midwest', gender: 'male', age: 55, pitch: 'low' },
  { id: 'en-us-advisor-8', accent: 'Midwest', gender: 'male', age: 51, pitch: 'medium' },
  { id: 'en-us-advisor-9', accent: 'Midwest', gender: 'female', age: 48, pitch: 'high' },
  { id: 'en-us-assistant-4', accent: 'Midwest', gender: 'female', age: 41, pitch: 'low' },
  { id: 'en-za-storyteller-8', accent: 'Cape Town English', gender: 'male', age: 62, pitch: 'high' },
  { id: 'en-za-storyteller-2', accent: 'Cape Town English', gender: 'female', age: 56, pitch: 'low' },
  { id: 'en-za-storyteller-6', accent: 'Cape Town English', gender: 'male', age: 52, pitch: 'low' },
  { id: 'en-za-assistant-7', accent: 'Cape Town English', gender: 'female', age: 50, pitch: 'high' },
]

export const castIds = VOICE_CAST.map((v) => v.id)

/** The cast as the model sees it when choosing a voice: one short line each. */
export function castLine(v: CastVoice): string {
  const who = [v.gender, v.age ? `${v.age}` : '', v.pitch ? `${v.pitch} pitch` : ''].filter(Boolean).join(', ')
  return `- ${v.id}: ${v.accent}${who ? `, ${who}` : ''}${v.sound ? `, ${v.sound}` : ''}`
}
