import type { AnalyseEvent, TenantConfig } from '@research-portal/core'
import type { AragProvider } from '@research-portal/retrieval'
import type { TenantStoreApi } from './tenants.ts'
import { chunkInventory, sampleInventory } from './inventory-sample.ts'

/**
 * Corpus analysis: interrogate a knowledge box and derive its portal
 * configuration from what is actually in it - a topic taxonomy, a second
 * "kind" dimension (which powers the co-occurrence knowledge graph),
 * per-resource label assignments, suggested questions and search placeholder.
 * The design comes from the box's own generative model via structured
 * generation, grounded in the corpus; every result is applied live.
 */

const ANALYSE_SCHEMA = {
  name: 'portal_configuration',
  description: 'Design a research portal configuration from the knowledge box corpus inventory',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['id', 'label', 'description'],
        },
      },
      kinds: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['id', 'label', 'description'],
        },
      },
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            number: { type: 'integer' },
            topicId: { type: 'string' },
            kindId: { type: 'string' },
          },
          required: ['number', 'topicId', 'kindId'],
        },
      },
      suggestedQuestions: { type: 'array', items: { type: 'string' } },
      searchPlaceholder: { type: 'string' },
    },
    required: ['topics', 'kinds', 'assignments', 'suggestedQuestions', 'searchPlaceholder'],
  },
}

/**
 * The second pass: the taxonomy is already fixed, so a batch of resources
 * only needs its assignments back.
 */
const ASSIGN_SCHEMA = {
  name: 'resource_assignments',
  description: 'Assign every listed resource to one topic and one kind from the given taxonomy',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      assignments: ANALYSE_SCHEMA.parameters.properties.assignments,
    },
    required: ['assignments'],
  },
}

interface AnalysisDesign {
  topics: { id: string; label: string; description?: string }[]
  kinds: { id: string; label: string; description?: string }[]
  assignments: { number: number; topicId: string; kindId: string }[]
  suggestedQuestions: string[]
  searchPlaceholder: string
}

const slugify = (raw: string) =>
  raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/**
 * The taxonomy design prompt. A tenant with an analysis brief gets its
 * reader and its organising principle stated before the design rules, so a
 * sales-floor portal is designed around customer situations rather than
 * around whichever makers dominate the corpus; without one the generic
 * research-portal framing applies.
 */
export function analysisPrompt(
  config: Pick<TenantConfig, 'analysis' | 'branding'>,
  corpus: { total: number; sampleSize: number; sampled: boolean; inventory: string },
): string {
  const brief = config.analysis?.brief.trim()
  const audience = brief
    ? `You are configuring ${config.branding.productName}, a portal over this knowledge box. ` +
      `${brief}\n\n`
    : `You are configuring a research portal for this knowledge box. `
  const questionsFor = brief
    ? 'its readers would genuinely ask'
    : 'a researcher would genuinely ask'
  return audience +
    `Here is ` +
    (corpus.sampled
      ? `a representative sample of ${corpus.sampleSize} of its ${corpus.total} resources:`
      : `the complete inventory of its ${corpus.total} resources:`) +
    `\n\n${corpus.inventory}\n\n` +
    `Design the portal configuration: (1) 4 to 8 topics that partition this corpus well, each ` +
    `with a kebab-case id, a short label in Australian English and a one-sentence description ` +
    `of what qualifies (the classifier's prompt); (2) 3 to 5 "kinds", each with a description - a ` +
    `second, orthogonal way of classifying the same resources (for example document genre or ` +
    `research approach), also with kebab-case ids; (3) for EVERY numbered resource above, an ` +
    `assignment of exactly one topicId and one kindId; (4) 6 suggested questions ${questionsFor} ` +
    `of this corpus; (5) a short search placeholder listing 3 or 4 corpus ` +
    `themes, e.g. "Search x, y, z…". Use only ids you defined. Cover every resource number ` +
    `from 1 to ${corpus.sampleSize}.`
}

/**
 * The labelling prompt for one batch of the corpus the design pass did not
 * see. It restates the taxonomy - ids and the descriptions that qualify
 * them - so a batch is classified the same way the sample was, and asks for
 * nothing else.
 */
export function assignmentPrompt(
  config: Pick<TenantConfig, 'analysis' | 'branding'>,
  taxonomy: { topics: Labelled[]; kinds: Labelled[] },
  batch: { count: number; inventory: string },
): string {
  const brief = config.analysis?.brief.trim()
  const audience = brief
    ? `You are classifying the corpus behind ${config.branding.productName}. ${brief}\n\n`
    : ''
  const list = (labels: Labelled[]) =>
    labels.map((l) => `- ${l.id}: ${l.description ?? l.label}`).join('\n')
  return audience +
    `These are the portal's topics:\n${list(taxonomy.topics)}\n\n` +
    `And its kinds:\n${list(taxonomy.kinds)}\n\n` +
    `Here are ${batch.count} more resources from the same corpus:\n\n${batch.inventory}\n\n` +
    `Assign every resource from 1 to ${batch.count} exactly one topicId and one kindId from ` +
    `the lists above. Use only those ids - do not invent a topic or a kind, and choose the ` +
    `closest fit where a resource sits between two.`
}

interface Labelled {
  id: string
  label: string
  description?: string
}

/**
 * Apply one pass of assignments to the box, skipping any that name a label
 * outside the taxonomy. Ids that land are added to `labelled`, so the second
 * pass can tell what the first already covered and the run reports a count
 * of resources rather than of assignments.
 */
async function* applyAssignments(
  management: AragProvider,
  config: TenantConfig,
  batch: readonly { id: string; title: string }[],
  assignments: readonly { number: number; topicId: string; kindId: string }[],
  taxonomy: { topicIds: Set<string>; kindIds: Set<string> },
  labelled: Set<string>,
): AsyncGenerator<AnalyseEvent> {
  for (const assignment of assignments) {
    const resource = batch[assignment.number - 1]
    if (!resource) continue
    const topicId = slugify(assignment.topicId)
    const kindId = slugify(assignment.kindId)
    if (!taxonomy.topicIds.has(topicId)) continue
    const classifications = [{ labelset: 'topic', label: topicId }]
    if (taxonomy.kindIds.has(kindId)) classifications.push({ labelset: 'kind', label: kindId })
    try {
      await management.patchResourceClassifications(config, resource.id, classifications)
      labelled.add(resource.id)
      yield { type: 'item', label: `Labelled: ${resource.title.slice(0, 60)}`, detail: topicId }
    } catch (err) {
      yield {
        type: 'item',
        label: `Could not label: ${resource.title.slice(0, 60)}`,
        detail: err instanceof Error ? err.message.slice(0, 120) : 'failed',
      }
    }
  }
}

export async function* analyseTenant(
  management: AragProvider,
  tenants: TenantStoreApi,
  config: TenantConfig,
  invalidate: (slug: string) => void,
): AsyncGenerator<AnalyseEvent> {
  yield { type: 'stage', label: 'Reading the corpus' }
  const resources = await management.listResources(config)
  if (resources.length === 0) {
    yield {
      type: 'error',
      message: 'The knowledge box has no indexed content yet - add some resources first.',
    }
    return
  }
  yield {
    type: 'item',
    label: `Found ${resources.length} indexed ${resources.length === 1 ? 'resource' : 'resources'}`,
  }

  // The design /ask query has a 20,000-char limit, and asking the model to
  // assign every resource in a single call does not scale (a 1,000+ resource
  // corpus overflowed it, 422 string_too_long). Design the taxonomy from a
  // representative, char-bounded sample instead - the full corpus is labelled
  // separately by the labeller agent (Manage -> Enrichments).
  const INVENTORY_BUDGET = 14_000
  const line = (r: { title: string; summary: string }, i: number) =>
    `${i + 1}. ${r.title} - ${r.summary.slice(0, 180)}`
  const { sample, sampled, inventory } = sampleInventory(resources, line, INVENTORY_BUDGET)
  const prompt = analysisPrompt(config, {
    total: resources.length,
    sampleSize: sample.length,
    sampled,
    inventory,
  })

  yield { type: 'stage', label: 'Designing taxonomy, graph dimensions and questions' }
  const { object } = await management.askStructured(config, ANALYSE_SCHEMA, prompt)
  const design = object as AnalysisDesign
  if (!Array.isArray(design.topics) || design.topics.length === 0) {
    yield { type: 'error', message: 'The model returned no usable taxonomy - try again.' }
    return
  }
  const topics = design.topics.map((t) => ({
    id: slugify(t.id || t.label),
    label: t.label,
    ...(t.description?.trim() ? { description: t.description.trim() } : {}),
  }))
    .filter((t) => t.id)
  const kinds = (design.kinds ?? []).map((k) => ({
    id: slugify(k.id || k.label),
    label: k.label,
    ...(k.description?.trim() ? { description: k.description.trim() } : {}),
  }))
    .filter((k) => k.id)
  yield {
    type: 'item',
    label: `Designed ${topics.length} topics and ${kinds.length} kinds`,
    detail: `${topics.map((t) => t.label).join(', ')} | ${kinds.map((k) => k.label).join(', ')}`,
  }

  yield { type: 'stage', label: 'Creating taxonomy on the knowledge box' }
  for (
    const [id, title, labels] of [
      ['topic', 'Topic', topics] as const,
      ['kind', 'Kind', kinds] as const,
    ]
  ) {
    try {
      await management.createLabelset(config, {
        id,
        title,
        multiple: false,
        // The description rides on the label so the classifier agent has a
        // prompt per label, not just an id.
        labels: labels.map((l) => ({
          title: l.id,
          ...(l.description ? { text: l.description } : {}),
        })),
      })
      yield { type: 'item', label: `Labelset '${id}' configured (${labels.length} labels)` }
    } catch (err) {
      // Setting a labelset replaces it, so there is no "already exists"
      // case to reuse; a failure here is a real one (a read-only key, most
      // often) and every labelling call below would fail the same way.
      yield {
        type: 'error',
        message: `Could not configure the '${id}' labelset on the knowledge box - ` +
          `${err instanceof Error ? err.message.slice(0, 160) : 'request failed'}. ` +
          `Check the box key has write (owner) rights, then run the analysis again.`,
      }
      return
    }
  }

  yield {
    type: 'stage',
    label: sampled ? 'Labelling the sampled resources' : 'Labelling every resource',
  }
  const taxonomy = {
    topicIds: new Set(topics.map((t) => t.id)),
    kindIds: new Set(kinds.map((k) => k.id)),
  }
  const labelled = new Set<string>()
  yield* applyAssignments(
    management,
    config,
    sample,
    design.assignments ?? [],
    taxonomy,
    labelled,
  )

  // The design prompt only ever sees a char-bounded sample, but a resource
  // with no topic drops out of the portal's filters and its topic rows
  // entirely. Label whatever the sample missed in further batches, against
  // the taxonomy the design just fixed.
  const remaining = resources.filter((r) => !labelled.has(r.id))
  if (remaining.length > 0) {
    yield {
      type: 'stage',
      label: `Labelling the remaining ${remaining.length} resources`,
    }
    const batches = chunkInventory(remaining, line, INVENTORY_BUDGET)
    for (const [index, batch] of batches.entries()) {
      const prompt = assignmentPrompt(config, { topics, kinds }, {
        count: batch.length,
        inventory: batch.map(line).join('\n'),
      })
      try {
        const { object } = await management.askStructured(config, ASSIGN_SCHEMA, prompt)
        const assignments = (object as Partial<AnalysisDesign>).assignments ?? []
        yield* applyAssignments(management, config, batch, assignments, taxonomy, labelled)
      } catch (err) {
        // One failed batch should not cost the run the batches after it.
        yield {
          type: 'item',
          label: `Could not label batch ${index + 1} of ${batches.length}`,
          detail: err instanceof Error ? err.message.slice(0, 160) : 'request failed',
        }
      }
    }
  }

  const unlabelled = resources.length - labelled.size
  yield {
    type: 'item',
    label: `Labelled ${labelled.size} of ${resources.length} resources`,
    ...(unlabelled > 0
      ? { detail: `${unlabelled} could not be labelled - run the analysis again to retry them` }
      : sampled
      ? { detail: 'Taxonomy designed from a representative sample, applied to the whole corpus' }
      : {}),
  }

  yield { type: 'stage', label: 'Updating the portal configuration' }
  const questions = (design.suggestedQuestions ?? []).slice(0, 8).map((text, i) => ({
    id: `${config.slug}-aq${i + 1}`,
    text,
  }))
  // A curated portal keeps its own questions and placeholder: analysis
  // rewrites what is in the box, not how the portal speaks to its reader.
  const keepQuestions = Boolean(config.analysis?.keepQuestions)
  tenants.patch(config.slug, {
    topics,
    ...(keepQuestions ? {} : {
      suggestedQuestions: questions,
      searchPlaceholder: design.searchPlaceholder?.trim() || config.searchPlaceholder,
    }),
  })
  if (keepQuestions) {
    yield {
      type: 'item',
      label: "Kept the portal's own suggested questions and search placeholder",
    }
  }
  invalidate(config.slug)

  yield {
    type: 'done',
    topics: topics.length,
    kinds: kinds.length,
    labelled: labelled.size,
    questions: questions.length,
  }
}
