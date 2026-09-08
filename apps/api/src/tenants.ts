import process from 'node:process'
import { type TenantConfig, TenantConfigSchema, type TenantSummary } from '@research-portal/core'
import { readJsonSafe, writeJsonAtomic } from './persist.ts'

// ---------------------------------------------------------------------------
// Seed tenant configs - the single source of truth for tenant-driven theming
// and copy, validated at module load so a bad seed fails fast on boot.
// Persistence is deliberately plain JSON files on the volume (project rule:
// no SQLite or embedded databases unless absolutely unavoidable).
// ---------------------------------------------------------------------------

const PLATFORM_HOSTNAMES: Readonly<Record<string, string>> = {
  marine: 'marine.corpuskit.org',
  grains: 'grains.corpuskit.org',
  opax: 'opax.corpuskit.org',
}

/**
 * Compatibility for portals whose custom domains pre-date persisted hostname
 * metadata. OPAX was created at runtime, so its stored config needs the same
 * read-time upgrade as the two seeded portals.
 */
export function withPlatformHostname(config: TenantConfig): TenantConfig {
  const hostname = config.hostname ?? PLATFORM_HOSTNAMES[config.slug]
  return hostname ? { ...config, hostname } : config
}

export function tenantSummary(config: TenantConfig): TenantSummary {
  return {
    slug: config.slug,
    organisation: config.branding.organisation,
    productName: config.branding.productName,
    tagline: config.branding.tagline,
    ...(config.hostname ? { hostname: config.hostname } : {}),
  }
}

// The two showcase portals are fictional organisations over the synthetic seed
// corpus in content/seed. Their topic ids are the `topic` labels
// `deno task provision` pushes to the knowledge box and files each seed
// document under (content/seed/manifest.json) - Explore intersects them with
// the box's facet counts, so an id that is not a real label silently yields an
// empty portal. Both identities use a stock library palette; nothing here is
// sampled from a real organisation's brand.

const grains: TenantConfig = TenantConfigSchema.parse({
  slug: 'grains',
  hostname: PLATFORM_HOSTNAMES.grains,
  branding: {
    productName: 'Dryland Cropping Research Portal',
    organisation: 'Dryland Cropping Research Alliance',
    tagline: 'Research for Australian dryland grain growers',
    colours: {
      primary: '#58281a',
      accent: '#e0863c',
      heroFrom: '#571f19',
      heroTo: '#6e3414',
    },
    paletteId: 'kiln',
  },
  searchPlaceholder: 'Search agronomy, crop protection, soils, farm business…',
  assessmentHeading: 'Industry Knowledge Areas',
  // These ids must match the `topic` labelset on the bound knowledge box -
  // Explore intersects them with the box's facet counts, so an id that is not a
  // real label silently yields an empty portal. Read from the box on
  // 2026-08-31; the comments are its resource counts.
  topics: [
    { id: 'crop-protection', label: 'Crop protection' },
    { id: 'soils-nutrition', label: 'Soils and nutrition' },
    { id: 'farm-business', label: 'Farm business' },
    { id: 'climate-environment', label: 'Climate and environment' },
    { id: 'harvest-storage', label: 'Harvest and storage' },
  ],
  suggestedQuestions: [
    {
      id: 'grains-q1',
      text: 'What rotation strategies help manage herbicide-resistant ryegrass?',
    },
    { id: 'grains-q2', text: 'How does nitrogen timing affect grain protein in dryland wheat?' },
    { id: 'grains-q3', text: 'How is stripe rust surveillance organised across growing regions?' },
    { id: 'grains-q4', text: 'How is frost risk managed across the southern cropping region?' },
    { id: 'grains-q5', text: 'What storage conditions reduce grain quality loss after harvest?' },
    { id: 'grains-q6', text: 'When does strategic liming pay off on acidic subsoils?' },
  ],
  entityTypes: [
    { id: 'crop', label: 'Crop', colour: '#7cb342' },
    { id: 'pest', label: 'Pest or disease', colour: '#e53935' },
    { id: 'researcher', label: 'Researcher', colour: '#5e97f6' },
    { id: 'project', label: 'Project', colour: '#e0863c' },
    { id: 'region', label: 'Growing region', colour: '#26a69a' },
  ],
  relationTypes: ['studies', 'affects', 'conducted-in', 'funded-by', 'collaborates-with'],
})

const marine: TenantConfig = TenantConfigSchema.parse({
  slug: 'marine',
  hostname: PLATFORM_HOSTNAMES.marine,
  branding: {
    productName: 'Southern Waters Research Portal',
    organisation: 'Southern Waters Research Institute',
    tagline: 'Fisheries and aquaculture research for southern Australian waters',
    colours: {
      primary: '#0a3a57',
      accent: '#38a8e0',
      heroFrom: '#123a63',
      heroTo: '#0b4d66',
    },
    paletteId: 'fathom',
  },
  searchPlaceholder: 'Search fisheries, aquaculture, stock assessment, marine ecology…',
  assessmentHeading: 'Industry Knowledge Areas',
  // These ids must match the `topic` labelset actually on the bound knowledge
  // box - Explore intersects them with the box's classification facet counts,
  // so an id that is not a real label silently yields an empty portal.
  topics: [
    { id: 'stock-assessment', label: 'Stock assessment' },
    { id: 'aquaculture-biosecurity', label: 'Aquaculture biosecurity' },
    { id: 'post-harvest', label: 'Post-harvest and supply chain' },
    { id: 'marine-sustainability', label: 'Marine sustainability' },
    { id: 'fisheries-policy', label: 'Fisheries policy and management' },
  ],
  suggestedQuestions: [
    {
      id: 'marine-q1',
      text: 'What stock assessment methods are recommended for data-limited fisheries?',
    },
    { id: 'marine-q2', text: 'How is white spot disease being managed in prawn aquaculture?' },
    {
      id: 'marine-q3',
      text: 'What post-harvest handling practices best preserve rock lobster quality?',
    },
    {
      id: 'marine-q4',
      text: 'How are marine heatwaves affecting abalone populations along the southern coast?',
    },
    {
      id: 'marine-q5',
      text: 'What biosecurity controls reduce pathogen spread between aquaculture leases?',
    },
    {
      id: 'marine-q6',
      text: 'What does the latest research say about bycatch reduction in longline fisheries?',
    },
  ],
  entityTypes: [
    { id: 'species', label: 'Species', colour: '#7cb342' },
    { id: 'researcher', label: 'Researcher', colour: '#5e97f6' },
    { id: 'project', label: 'Project', colour: '#38a8e0' },
    { id: 'pathogen', label: 'Pathogen', colour: '#e53935' },
    { id: 'location', label: 'Location', colour: '#f6bf26' },
  ],
  relationTypes: ['studies', 'infects', 'located-in', 'funded-by', 'assesses'],
})

// ClarityDesk: a plain-language explainer for in-store eyewear advisers. The
// reader is a salesperson with no optical training, talking to a customer at
// the counter, so the answer prompt writes for the customer and every
// suggested question is one a shopper actually asks. The corpus is lens-maker
// white papers (Essilor, Hoya, Nikon, Zeiss and trade press). The topic ids
// are the `topic` labels corpus analysis wrote to the box on 8 September 2026
// under the analysis brief below - by customer situation, not by maker - and
// must match the box: an id that is not a real label silently empties Explore.
const CLARITYDESK_ASK_PROMPT = [
  'You are ClarityDesk, a plain-language guide that helps an in-store eyewear adviser explain ' +
  'lenses, coatings and frames to a customer standing at the counter. The adviser has no ' +
  'technical background and will read your answer aloud or put it in their own words, so write ' +
  'for the customer.',
  'Always answer from the cited sources. Never refuse, and never write "Not enough data to ' +
  'answer this", when any relevant source is present. For any part of the question the sources ' +
  'do not cover, say plainly that the product guides do not cover it, and do not fill the gap ' +
  'from general knowledge.',
  'Lead with the answer in one or two everyday sentences, then explain in short paragraphs or ' +
  'a short bulleted list. Keep the whole answer under about 180 words unless the question asks ' +
  'for a comparison.',
  'Use everyday words. When a technical term is unavoidable, give the plain description first ' +
  'and the term in brackets the first time, for example "the age-related change that makes ' +
  'close-up reading harder (presbyopia)". Explain what a feature means for the customer\'s day ' +
  '- driving at night, using a phone, working at a screen, playing sport, thinner and lighter ' +
  'lenses - rather than how it is engineered.',
  'Keep numbers simple: round percentages, say "up to" when the source does, and always name ' +
  'the maker a claim comes from ("Zeiss says ..."). Do not compare makers unless the question ' +
  'asks for it, and never invent a comparison the sources do not make.',
  'Never recommend a prescription, diagnose an eye condition or give medical advice. If the ' +
  "question needs an eye test or an optometrist's judgement, say so in one sentence.",
  'Cite at claim level: after each factual claim add a bracketed marker like [1]; the ' +
  'application assigns the real citation numbers itself. Refer to the material as "the product ' +
  'guides" or "the maker\'s information", never as "the context".',
  'Finish with one line the adviser can use next, starting "Try asking:", with a good ' +
  'follow-up question for the customer, such as how much time they spend on screens.',
  'Australian English, no em dashes.',
].join(' ')

const claritydesk: TenantConfig = TenantConfigSchema.parse({
  slug: 'claritydesk',
  branding: {
    productName: 'ClarityDesk',
    organisation: 'ClarityDesk',
    tagline: 'Plain answers about lenses and frames, at the counter',
    colours: {
      primary: '#1f3a5f',
      accent: '#4fb3bf',
      heroFrom: '#16304d',
      heroTo: '#1f4a6b',
    },
  },
  searchPlaceholder: 'Ask about a lens, coating or frame…',
  assessmentHeading: 'Product knowledge areas',
  topics: [
    { id: 'progressive-multifocal-lenses', label: 'Progressive and multifocal lenses' },
    { id: 'single-vision-lenses', label: 'Everyday single vision lenses' },
    { id: 'coatings-treatments', label: 'Coatings and treatments' },
    { id: 'light-adaptive-sun-lenses', label: 'Light-adaptive and sun lenses' },
    { id: 'driving-screen-office', label: 'Driving, screen and office work' },
    { id: 'children-myopia-control', label: 'Children and myopia control' },
    { id: 'thin-light-lenses', label: 'Thin and light lenses for strong prescriptions' },
    { id: 'lens-manufacturing', label: 'How lenses are made' },
  ],
  suggestedQuestions: [
    {
      id: 'claritydesk-q1',
      text: 'What is the difference between single vision and progressive lenses?',
    },
    { id: 'claritydesk-q2', text: 'Do I really need an anti-reflective coating?' },
    { id: 'claritydesk-q3', text: 'Which lenses are thinnest for a strong prescription?' },
    {
      id: 'claritydesk-q4',
      text: 'How long does it take to get used to progressive lenses?',
    },
    {
      id: 'claritydesk-q5',
      text: 'Are blue light lenses worth it if I work at a screen all day?',
    },
    { id: 'claritydesk-q6', text: 'What do light-adaptive (photochromic) lenses actually do?' },
    { id: 'claritydesk-q7', text: 'What lenses are best for driving at night?' },
    { id: 'claritydesk-q8', text: 'Why does a personalised lens cost more than a standard one?' },
  ],
  entityTypes: [
    { id: 'lens-maker', label: 'Lens maker', colour: '#4fb3bf' },
    { id: 'lens-design', label: 'Lens design', colour: '#7cb342' },
    { id: 'coating', label: 'Coating or treatment', colour: '#f6bf26' },
    { id: 'material', label: 'Lens material', colour: '#e0863c' },
    { id: 'wearer-need', label: 'Wearer need', colour: '#5e97f6' },
  ],
  relationTypes: ['made-by', 'designed-for', 'uses', 'improves', 'competes-with'],
  regionalDiscovery: false,
  copy: {
    investigationExample: 'e.g. Which progressive lens suits a first-time wearer?',
    generateExamples: {
      comparison: 'e.g. Compare Zeiss SmartLife with Hoya progressive lenses',
      briefing: 'e.g. Brief me on anti-reflective coatings',
      timeline: 'e.g. Timeline of progressive lens design',
      proscons: 'e.g. Pros and cons of high-index lenses',
      faq: 'e.g. Common customer questions about light-adaptive lenses',
      assessment: 'e.g. Quiz me on lens coatings',
    },
  },
  askPrompt: CLARITYDESK_ASK_PROMPT,
  analysis: {
    brief: 'The reader is an in-store eyewear adviser with no optical training, explaining a ' +
      'lens, coating or frame to a customer at the counter. Organise the topics by the ' +
      "customer's situation, never by maker or brand: for example progressive and multifocal " +
      'lenses, everyday single vision lenses, coatings and treatments (anti-reflective, ' +
      'scratch, UV), light-adaptive and sun lenses, driving, screen and office work, children ' +
      'and myopia control, thin and light lenses for strong prescriptions, and background ' +
      'reading on how lenses are made. A maker can appear in a description but not in a topic ' +
      'label. Kinds should say what a document is to a salesperson (product fact sheet, ' +
      "technical white paper, clinical study, buyer's guide, trade article). Every label " +
      'must be something a shop assistant would say aloud.',
    keepQuestions: true,
  },
})

const tenantsBySlug: Record<string, TenantConfig> = {
  marine,
  grains,
  claritydesk,
}

export function tenantConfig(slug: string): TenantConfig | undefined {
  const config = tenantsBySlug[slug]
  return config ? withPlatformHostname(config) : undefined
}

/**
 * The prompt settings an answer runs with: what an administrator saved in
 * Manage > Behaviour, falling back to the tenant's own `askPrompt` for the
 * system prompt. Clearing the saved prompt therefore returns a portal to its
 * own default, not to the analyst prompt.
 */
export function resolvePrompts(
  saved: { ask?: string; images?: boolean } | undefined,
  config: TenantConfig | undefined,
): { ask?: string; images?: boolean } {
  const ask = saved?.ask?.trim() || config?.askPrompt
  return { ...saved, ...(ask ? { ask } : {}) }
}

export function tenantSummaries(): TenantSummary[] {
  return Object.values(tenantsBySlug).map((tenant) => tenantSummary(withPlatformHostname(tenant)))
}

// ---------------------------------------------------------------------------
// Dynamic tenant store: the seed above plus knowledge box portals added in the
// app, persisted as JSON (TENANTS_PATH, default ./data/tenants.json).
// ---------------------------------------------------------------------------

/** Neutral dark palette for portals added in-app (until a theming pass). */
const DEFAULT_COLOURS = {
  primary: '#27364b',
  accent: '#5a8bd6',
  heroFrom: '#141d2b',
  heroTo: '#27364b',
}

export interface NewTenantInput {
  name: string
  organisation?: string
  tagline?: string
}

/** Config fields corpus analysis is allowed to rewrite. */
export interface TenantPatch {
  hostname?: TenantConfig['hostname']
  topics?: TenantConfig['topics']
  suggestedQuestions?: TenantConfig['suggestedQuestions']
  searchPlaceholder?: string
  assessmentHeading?: string
  branding?: TenantConfig['branding']
  /** Portal-managed behaviour settings (system prompt, image grounding). */
  prompts?: { ask?: string; images?: boolean }
  /** Extraction routing rules (docs/EXTRACTION-LAB.md). */
  extraction?: TenantConfig['extraction']
  /** Intent-routed configurations (docs/INTENT-ROUTING.md), when a portal tunes its own. */
  intents?: TenantConfig['intents']
}

export class TenantStore {
  private custom: Record<string, TenantConfig> = {}
  /** Analysis-derived overrides, applicable to seeded portals too. */
  private overrides: Record<string, TenantPatch> = {}
  private disabled = new Set<string>()
  private readonly path: string

  constructor(env: Record<string, string | undefined> = process.env) {
    this.path = env.TENANTS_PATH ?? './data/tenants.json'
    const raw = readJsonSafe<Record<string, unknown>>(this.path, {})
    // v2 format: { custom, overrides, disabled }. v1 was a bare custom map.
    const customSource = (raw.custom ?? raw) as Record<string, unknown>
    for (const [slug, value] of Object.entries(customSource)) {
      const parsed = TenantConfigSchema.safeParse(value)
      if (parsed.success) this.custom[slug] = parsed.data
    }
    if (raw.overrides && typeof raw.overrides === 'object') {
      this.overrides = raw.overrides as Record<string, TenantPatch>
    }
    if (Array.isArray(raw.disabled)) {
      this.disabled = new Set(raw.disabled.filter((s): s is string => typeof s === 'string'))
    }
  }

  get(slug: string): TenantConfig | undefined {
    const base = tenantsBySlug[slug] ?? this.custom[slug]
    if (!base) return undefined
    const override = this.overrides[slug]
    if (!override) return withPlatformHostname(base)
    const { prompts: _prompts, ...configPatch } = override
    return withPlatformHostname({ ...base, ...configPatch })
  }

  /** App-side settings that never reach the public config payload. */
  promptsFor(slug: string): { ask?: string; images?: boolean } {
    return resolvePrompts(this.overrides[slug]?.prompts, this.get(slug))
  }

  isCustom(slug: string): boolean {
    return slug in this.custom && !(slug in tenantsBySlug)
  }

  isDisabled(slug: string): boolean {
    return this.disabled.has(slug)
  }

  setDisabled(slug: string, disabled: boolean): void {
    if (disabled) this.disabled.add(slug)
    else this.disabled.delete(slug)
    this.persist()
  }

  /** Rename or re-theme a portal (product name, organisation, tagline, palette, type, shape). */
  patchBranding(
    slug: string,
    branding: {
      productName?: string
      organisation?: string
      tagline?: string
      colours?: TenantConfig['branding']['colours']
      typography?: TenantConfig['branding']['typography']
      shape?: TenantConfig['branding']['shape']
      textScale?: TenantConfig['branding']['textScale']
      density?: TenantConfig['branding']['density']
      paletteId?: TenantConfig['branding']['paletteId']
    },
  ): void {
    const base = this.get(slug)
    if (!base) return
    const merged = {
      ...base.branding,
      ...(branding.productName ? { productName: branding.productName } : {}),
      ...(branding.organisation ? { organisation: branding.organisation } : {}),
      ...(branding.tagline ? { tagline: branding.tagline } : {}),
      ...(branding.colours ? { colours: branding.colours } : {}),
      ...(branding.typography ? { typography: branding.typography } : {}),
      ...(branding.shape ? { shape: branding.shape } : {}),
      ...(branding.textScale ? { textScale: branding.textScale } : {}),
      ...(branding.density ? { density: branding.density } : {}),
      ...(branding.paletteId ? { paletteId: branding.paletteId } : {}),
    }
    if (this.custom[slug]) {
      this.custom[slug] = { ...this.custom[slug], branding: merged }
    } else {
      this.overrides[slug] = { ...this.overrides[slug], branding: merged }
    }
    this.persist()
  }

  /** Apply analysis-derived config (topics, questions, placeholder). */
  patch(slug: string, patch: TenantPatch): void {
    this.overrides[slug] = { ...this.overrides[slug], ...patch }
    this.persist()
  }

  list(includeDisabled = false): TenantSummary[] {
    const all = [
      ...tenantSummaries(),
      ...Object.values(this.custom).map((tenant) =>
        tenantSummary(this.get(tenant.slug) ?? withPlatformHostname(tenant))
      ),
    ]
    return includeDisabled ? all : all.filter((t) => !this.disabled.has(t.slug))
  }

  add(input: NewTenantInput): TenantConfig {
    const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!base) throw new Error('The portal name must contain letters or numbers')
    let slug = base
    for (let i = 2; this.get(slug); i++) slug = `${base}-${i}`
    const config = TenantConfigSchema.parse({
      slug,
      branding: {
        productName: input.name,
        organisation: input.organisation?.trim() || input.name,
        tagline: input.tagline?.trim() || 'Research, discovery and development',
        colours: DEFAULT_COLOURS,
      },
      searchPlaceholder: 'Search this portal…',
      topics: [],
      suggestedQuestions: [],
      entityTypes: [],
      relationTypes: [],
    })
    const configured = withPlatformHostname(config)
    this.custom[slug] = configured
    this.persist()
    return configured
  }

  remove(slug: string): boolean {
    if (!this.isCustom(slug)) return false
    delete this.custom[slug]
    delete this.overrides[slug]
    this.disabled.delete(slug)
    this.persist()
    return true
  }

  private persist(): void {
    writeJsonAtomic(this.path, {
      custom: this.custom,
      overrides: this.overrides,
      disabled: [...this.disabled],
    })
  }
}

/** Public tenant-store contract for runtimes without a local filesystem. */
export type TenantStoreApi = Pick<TenantStore, keyof TenantStore>
