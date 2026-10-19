import type { Finding } from './detect'

export const NAME = 'guard'
export const PORT = 53917
export const IDLE_MINUTES = 120
export const PRESIDIO_VERSION = '2.2.364'
export const SPACY_VERSION = '3.8.16'
export const MODEL = 'en_core_web_sm'

/** Structured identifiers only: the name and place detector is noisy, so it is opt-in. */
export const STRUCTURED_ENTITIES = [
  'EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD', 'US_SSN', 'IP_ADDRESS', 'IBAN_CODE', 'CRYPTO',
  'IN_AADHAAR', 'IN_PAN', 'IN_PASSPORT', 'US_ITIN', 'US_PASSPORT', 'UK_NHS', 'MEDICAL_LICENSE',
]
export const NAME_ENTITIES = ['PERSON', 'LOCATION']

/**
 * Presidio scores a plain phone number at exactly 0.4 and PAN at 0.45, so 0.4 is the highest
 * cutoff that still catches every item in the sample. Going lower only adds weak matches.
 */
export const DEFAULT_MIN_SCORE = 0.4

/** The configured cutoff, or the default when it is blank or not a number. */
export const parseMinScore = (raw: unknown): number => {
  const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw ?? DEFAULT_MIN_SCORE)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_MIN_SCORE
}

/** A warning when the cutoff is far enough from the default to change what is caught. */
export const minScoreWarning = (minScore: number): string | null =>
  minScore > DEFAULT_MIN_SCORE
    ? `Above ${DEFAULT_MIN_SCORE}, lower-confidence items such as phone numbers, PAN and IP addresses are missed.`
    : minScore < 0.3
      ? 'Below 0.3, expect more false alarms.'
      : null

export type AnalyzerHit ={ entity_type: string; start: number; end: number; score: number }

export const entityLabel = (entity: string): string => entity.toLowerCase().replace(/_/g, '-')

/** Turns the detector's answer into findings, keeping only the wanted entities and scores. */
export const fromAnalyzer = (text: string, hits: readonly AnalyzerHit[], wanted: readonly string[], minScore: number): Finding[] =>
  hits
    .filter(h => wanted.includes(h.entity_type) && h.score >= minScore && h.end > h.start)
    .map(h => ({ label: entityLabel(h.entity_type), start: h.start, end: h.end, value: text.slice(h.start, h.end) }))

/** Python 3.9 to 3.14 are the versions the setup was tried with. */
export const pythonOk = (versionText: string): { ok: boolean; label: string } => {
  const m = /Python\s+(\d+)\.(\d+)/.exec(versionText)
  if (!m) return { ok: false, label: 'not found' }
  const major = Number(m[1])
  const minor = Number(m[2])
  return { ok: major === 3 && minor >= 9 && minor <= 14, label: `${major}.${minor}` }
}

// A made-up message with one of each thing, so the two layers can be compared.
export const SAMPLE =
  'Hi, ping Priya at priya.sharma@acme.com or +91 98765 43210. Card 4111 1111 1111 1111, Aadhaar 2345 6789 0124, PAN ABCDE1234F, SSN 219-09-9999, server 10.20.30.40, key AKIAIOSFODNN7EXAMPLE.'

export const SAMPLE_ITEMS: readonly { item: string; text: string }[] = [
  { item: 'AWS access key', text: 'AKIAIOSFODNN7EXAMPLE' },
  { item: 'Email address', text: 'priya.sharma@acme.com' },
  { item: 'Phone number', text: '+91 98765 43210' },
  { item: 'Credit card', text: '4111 1111 1111 1111' },
  { item: 'Aadhaar number', text: '2345 6789 0124' },
  { item: 'PAN', text: 'ABCDE1234F' },
  { item: 'US social security no.', text: '219-09-9999' },
  { item: 'IP address', text: '10.20.30.40' },
]

/** True when some finding covers the planted item. */
export const covers = (findings: readonly Finding[], sample: string, itemText: string): boolean => {
  const at = sample.indexOf(itemText)
  return at >= 0 && findings.some(f => f.start <= at && f.end >= at + itemText.length)
}

export type CompareRow = { item: string; basic: boolean; extra: boolean | null }

export const compareRows = (basic: readonly Finding[], extra: readonly Finding[] | null): CompareRow[] =>
  SAMPLE_ITEMS.map(i => ({
    item: i.item,
    basic: covers(basic, SAMPLE, i.text),
    extra: extra === null ? null : covers(basic, SAMPLE, i.text) || covers(extra, SAMPLE, i.text),
  }))

export type ExtraState = 'off' | 'installing' | 'on' | 'error'

export const statusText = (isOn: boolean, extra: ExtraState, caught: number): string => {
  if (!isOn) return `🛡 ${NAME} OFF`
  const layer = extra === 'on' ? 'extra security on' : extra === 'installing' ? 'setting up extra security…' : 'extra security off (/guard setup)'
  return `🛡 ${NAME} on · ${layer}${caught > 0 ? ` · ${caught} caught` : ''}`
}

/** What the setup will run, in order, for display and for running. */
export const setupSteps = (base: string, py: string): { title: string; argv: string[] }[] => [
  { title: 'Check Python', argv: ['python3', '--version'] },
  { title: 'Create a private environment', argv: ['python3', '-m', 'venv', `${base}/venv`] },
  {
    title: `Install Presidio ${PRESIDIO_VERSION} and spaCy ${SPACY_VERSION}`,
    argv: [py, '-m', 'pip', 'install', '--disable-pip-version-check', '--quiet', `presidio-analyzer==${PRESIDIO_VERSION}`, `spacy==${SPACY_VERSION}`],
  },
  { title: `Download the small language model (${MODEL}, about 15 MB)`, argv: [py, '-m', 'spacy', 'download', MODEL] },
]

export const lastLines = (text: string, n = 6): string[] =>
  text.split('\n').map(l => l.trimEnd()).filter(Boolean).slice(-n)
