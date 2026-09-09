import { familyKey, type ScoredResource, type TenantConfig } from '@research-portal/core'
import type { AragProvider } from '@research-portal/retrieval'
import { rewriteSentinels } from './answer-shape.ts'

/**
 * Product explainer cards: one card per product family the portal lists, so
 * an adviser at the counter can answer "what is this range, and who is it
 * for?" without reading a white paper first.
 *
 * The card is generated from the corpus, never from background knowledge -
 * the grounding gate refuses rather than writing a fluent card about a range
 * the box holds nothing on - and it carries the guides it was built from, so
 * the adviser can see what is behind each claim.
 */

const EXPLAINER_SCHEMA = {
  name: 'product_explainer',
  description: 'A counter card explaining one product family to a customer',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: {
        type: 'string',
        description: 'One sentence a salesperson could say out loud: what this range is.',
      },
      whoFor: {
        type: 'string',
        description: 'Who it suits, in one or two sentences, described by the life they lead.',
      },
      notice: {
        type: 'array',
        items: { type: 'string' },
        description: 'Three to five short lines: what the customer will notice wearing these.',
      },
      costMore: {
        type: 'string',
        description:
          'What the extra money buys, in plain words. Say the guides do not cover it if they do not.',
      },
      askFirst: {
        type: 'array',
        items: { type: 'string' },
        description: 'Three questions to ask the customer before recommending this range.',
      },
      notCovered: {
        type: 'string',
        description:
          'Anything an adviser would want that the guides do not say. Empty string if nothing.',
      },
    },
    required: ['summary', 'whoFor', 'notice', 'costMore', 'askFirst', 'notCovered'],
  },
}

/** The generated card, plus the guides it was built from. */
export interface Explainer {
  /** The family as the portal lists it, e.g. "Zeiss SmartLife". */
  family: string
  summary: string
  whoFor: string
  notice: string[]
  costMore: string
  askFirst: string[]
  notCovered?: string
  /** Titles and ids of the guides retrieval put in front of the model. */
  sources: { id: string; title: string }[]
  generatedAt: string
}

/** The family a portal lists under this key, if it lists one. */
export function familyFor(config: TenantConfig, key: string) {
  return (config.home?.families ?? []).find((family) => familyKey(family.label) === key)
}

/**
 * How the card should be written. A portal in the plain register gets the
 * shop-floor voice; every portal gets the attribution rule, because a card
 * built from a mix of maker literature and independent research must not
 * blur which is which.
 */
export function explainerInstructions(config: TenantConfig): string {
  const plain = config.answerRegister === 'plain'
  return [
    plain
      ? 'You are writing a card an in-store adviser reads at the counter while a customer waits. ' +
        'The adviser has no technical training and will say these words out loud, so write for ' +
        'the customer: everyday words, short sentences, and what a feature means for their day ' +
        'rather than how it is engineered.'
      : 'You are writing a reference card about one product family for a professional reader.',
    'Use only what the sources say about this range. Never fill a gap from general knowledge: ' +
    'if the sources do not cover something, say so in notCovered rather than inventing it.',
    'Say where a claim comes from when it matters. Name the maker when the source is its own ' +
    'guide, and say so plainly when it is independent research or a professional standard. ' +
    'Never present one as the other.',
    'Never recommend a prescription, diagnose an eye condition or give medical advice.',
    'Australian English, no em dashes.',
  ].join(' ')
}

/** The retrieval text: the family itself, not an instruction about it. */
export function explainerQuery(label: string, extra?: string): string {
  return extra?.trim() ? `${label} - ${extra.trim()}` : label
}

/**
 * Build one family's card. Throws `insufficient_grounding` when the corpus
 * holds too little about the range to write an honest one, which is the
 * correct outcome for a family somebody listed but never added guides for.
 */
export async function generateExplainer(
  management: AragProvider,
  config: TenantConfig,
  family: { label: string; query?: string },
  /**
   * Resolves the retrieved resources to how the portal displays them. The
   * card must never show a bare filename where an enrichment exists, so the
   * caller passes its merchandising the way the answer routes do.
   */
  merchandise: (sources: ScoredResource[]) => ScoredResource[] = (sources) => sources,
): Promise<Explainer> {
  const { object, sources, insufficientGrounding } = await management.askStructured(
    config,
    EXPLAINER_SCHEMA,
    explainerQuery(family.label, family.query),
    { requireGrounding: true, instructions: explainerInstructions(config) },
  )
  if (insufficientGrounding) throw new Error('insufficient_grounding')
  const card = object as Partial<Explainer>
  // The platform's own guardrail sentence ("Not enough data to answer this")
  // arrives as ordinary field text here, with no answer stream to strip it
  // from. Left alone it renders as a panel of boilerplate, so a field that
  // holds nothing else becomes empty and the panel does not render at all.
  const text = (value: unknown): string =>
    typeof value === 'string' ? rewriteSentinels(value).trim() : ''
  const lines = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => text(item)).filter((item) => item.length > 0) : []
  const summary = text(card.summary)
  const notice = lines(card.notice).slice(0, 5)
  if (!summary || notice.length === 0) throw new Error('empty_explainer')
  const notCovered = text(card.notCovered)
  return {
    family: family.label,
    summary,
    whoFor: text(card.whoFor),
    notice,
    costMore: text(card.costMore),
    askFirst: lines(card.askFirst).slice(0, 3),
    ...(notCovered ? { notCovered } : {}),
    // The guides retrieval actually put in front of the model, not a list
    // the model was asked to name for itself.
    sources: merchandise(sources).map((source) => ({ id: source.id, title: source.title })),
    generatedAt: new Date().toISOString(),
  }
}
