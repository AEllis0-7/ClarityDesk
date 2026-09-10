import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { AragProvider } from '@research-portal/retrieval'
import type { AnalyseEvent, TenantConfig } from '@research-portal/core'
import { analyseTenant, analysisPrompt, assignmentPrompt, labelUntagged } from './analyse.ts'
import { tenantConfig, TenantStore } from './tenants.ts'

const corpus = {
  total: 3,
  sampleSize: 3,
  sampled: false,
  inventory: '1. A - a\n2. B - b\n3. C - c',
}

const design = {
  topics: [
    { id: 'progressive-lenses', label: 'Progressive lenses', description: 'Multifocal designs' },
    { id: 'coatings', label: 'Coatings and treatments', description: 'Anti-reflective, UV' },
  ],
  kinds: [{ id: 'fact-sheet', label: 'Product fact sheet', description: 'One product' }],
  assignments: [
    { number: 1, topicId: 'progressive-lenses', kindId: 'fact-sheet' },
    { number: 2, topicId: 'coatings', kindId: 'fact-sheet' },
    { number: 3, topicId: 'coatings', kindId: 'fact-sheet' },
  ],
  suggestedQuestions: ['What is the adaptation period for progressive addition lenses?'],
  searchPlaceholder: 'Search progressives, coatings…',
}

const resources = [
  { id: 'r1', title: 'A', summary: 'a' },
  { id: 'r2', title: 'B', summary: 'b' },
  { id: 'r3', title: 'C', summary: 'c' },
]

/** A management surface that records what analysis asks of the box. */
function stubManagement(opts: { failLabelsets?: boolean } = {}) {
  const calls: { prompts: string[]; labelsets: string[]; labelled: string[] } = {
    prompts: [],
    labelsets: [],
    labelled: [],
  }
  const management = {
    listResources: () => Promise.resolve(resources),
    askStructured: (_t: TenantConfig, _s: unknown, query: string) => {
      calls.prompts.push(query)
      return Promise.resolve({ object: design })
    },
    createLabelset: (_t: TenantConfig, input: { id: string }) => {
      if (opts.failLabelsets) {
        return Promise.reject(new Error('Agentic RAG API 403 for /labelset/topic: forbidden'))
      }
      calls.labelsets.push(input.id)
      return Promise.resolve()
    },
    patchResourceClassifications: (_t: TenantConfig, id: string) => {
      calls.labelled.push(id)
      return Promise.resolve()
    },
  } as unknown as AragProvider
  return { management, calls }
}

async function run(
  management: AragProvider,
  tenants: TenantStore,
  config: TenantConfig,
): Promise<AnalyseEvent[]> {
  const events: AnalyseEvent[] = []
  for await (const event of analyseTenant(management, tenants, config, () => {})) {
    events.push(event)
  }
  return events
}

const freshStore = () => new TenantStore({ TENANTS_PATH: `${Deno.makeTempDirSync()}/tenants.json` })

describe('analysisPrompt', () => {
  it('frames the design as a research portal when the tenant has no brief', () => {
    const prompt = analysisPrompt(tenantConfig('marine')!, corpus)
    expect(prompt.startsWith('You are configuring a research portal')).toBe(true)
    expect(prompt).toContain('a researcher would genuinely ask')
    expect(prompt).toContain(corpus.inventory)
  })

  it("puts a curated tenant's brief before the design rules", () => {
    const config = tenantConfig('claritydesk')!
    const prompt = analysisPrompt(config, corpus)
    expect(prompt.startsWith('You are configuring ClarityDesk')).toBe(true)
    expect(prompt).toContain(config.analysis!.brief)
    expect(prompt).toContain('its readers would genuinely ask')
    expect(prompt.indexOf(config.analysis!.brief)).toBeLessThan(prompt.indexOf('Design the portal'))
  })
})

describe('analyseTenant', () => {
  it("rewrites topics but keeps a curated portal's own questions and placeholder", async () => {
    const tenants = freshStore()
    const before = tenants.get('claritydesk')!
    const { management, calls } = stubManagement()

    const events = await run(management, tenants, before)

    const done = events.find((e) => e.type === 'done')
    expect(done).toMatchObject({ topics: 2, kinds: 1, labelled: 3 })
    expect(calls.labelsets).toEqual(['topic', 'kind'])
    expect(calls.prompts[0]).toContain(before.analysis!.brief)
    const after = tenants.get('claritydesk')!
    expect(after.topics.map((t) => t.id)).toEqual(['progressive-lenses', 'coatings'])
    expect(after.suggestedQuestions).toEqual(before.suggestedQuestions)
    expect(after.searchPlaceholder).toBe(before.searchPlaceholder)
    expect(events.some((e) => e.type === 'item' && /Kept the portal/.test(e.label))).toBe(true)
  })

  it('replaces the questions and placeholder for a portal without a brief', async () => {
    const tenants = freshStore()
    const { management } = stubManagement()

    await run(management, tenants, tenants.get('marine')!)

    const after = tenants.get('marine')!
    expect(after.suggestedQuestions.map((q) => q.text)).toEqual(design.suggestedQuestions)
    expect(after.searchPlaceholder).toBe(design.searchPlaceholder)
  })

  it('stops with an error, not a "reusing it" note, when the box refuses the labelset', async () => {
    const tenants = freshStore()
    const before = tenants.get('claritydesk')!
    const { management, calls } = stubManagement({ failLabelsets: true })

    const events = await run(management, tenants, before)

    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && error.message).toMatch(/topic.*403.*owner/s)
    expect(events.some((e) => e.type === 'done')).toBe(false)
    expect(calls.labelled).toEqual([])
    expect(tenants.get('claritydesk')!.topics).toEqual(before.topics)
  })
})

describe('assignmentPrompt', () => {
  const taxonomy = { topics: design.topics, kinds: design.kinds }

  it('restates the taxonomy ids and the qualifying descriptions', () => {
    const config = tenantConfig('claritydesk')!
    const prompt = assignmentPrompt(config, taxonomy, { count: 2, inventory: '1. A - a\n2. B - b' })
    expect(prompt).toContain('- progressive-lenses: Multifocal designs')
    expect(prompt).toContain('- coatings: Anti-reflective, UV')
    expect(prompt).toContain('- fact-sheet: One product')
    expect(prompt).toContain('1. A - a\n2. B - b')
    expect(prompt).toContain('from 1 to 2')
  })

  it("leads with a curated tenant's brief so batches match the sample", () => {
    const config = tenantConfig('claritydesk')!
    const prompt = assignmentPrompt(config, taxonomy, { count: 1, inventory: '1. A - a' })
    expect(prompt.startsWith('You are classifying the corpus behind ClarityDesk')).toBe(true)
    expect(prompt).toContain(config.analysis!.brief)
  })

  it('asks for nothing but the ids it defined', () => {
    const prompt = assignmentPrompt(tenantConfig('marine')!, taxonomy, {
      count: 1,
      inventory: '1. A - a',
    })
    expect(prompt).toContain('do not invent a topic or a kind')
    expect(prompt).not.toContain('suggested questions')
  })
})

describe('analyseTenant over a corpus larger than one prompt', () => {
  /** Enough resources, and long enough lines, to force a sampled design. */
  const wide = Array.from({ length: 200 }, (_, i) => ({
    id: `w${i + 1}`,
    title: `Resource ${i + 1}`,
    summary: 'y'.repeat(180),
  }))

  function stubWide() {
    const calls = { prompts: [] as string[], labelled: [] as string[] }
    const management = {
      listResources: () => Promise.resolve(wide),
      // Every pass gets assignments for a full batch; the design pass also
      // gets the taxonomy, which the batch schema simply ignores.
      askStructured: (_t: TenantConfig, _s: unknown, query: string) => {
        calls.prompts.push(query)
        const count = query.split('\n').filter((l) => /^\d+\. Resource /.test(l)).length
        return Promise.resolve({
          object: {
            ...design,
            assignments: Array.from({ length: count }, (_, i) => ({
              number: i + 1,
              topicId: 'coatings',
              kindId: 'fact-sheet',
            })),
          },
        })
      },
      createLabelset: () => Promise.resolve(),
      patchResourceClassifications: (_t: TenantConfig, id: string) => {
        calls.labelled.push(id)
        return Promise.resolve()
      },
    } as unknown as AragProvider
    return { management, calls }
  }

  it('labels every resource, not only the ones the design pass sampled', async () => {
    const tenants = freshStore()
    const { management, calls } = stubWide()

    const events = await run(management, tenants, tenants.get('claritydesk')!)

    expect(calls.prompts.length).toBeGreaterThan(1)
    expect(new Set(calls.labelled).size).toBe(wide.length)
    expect(calls.labelled.length).toBe(wide.length)
    const done = events.find((e) => e.type === 'done')
    expect(done).toMatchObject({ labelled: wide.length })
    expect(
      events.some((e) => e.type === 'item' && e.label === `Labelled 200 of 200 resources`),
    ).toBe(true)
  })

  it('keeps going when one batch fails, and says how many were left', async () => {
    const tenants = freshStore()
    const { management, calls } = stubWide()
    let batch = 0
    const flaky = {
      ...management,
      askStructured: (
        t: TenantConfig,
        s: Parameters<AragProvider['askStructured']>[1],
        query: string,
      ) => {
        batch += 1
        return batch === 2
          ? Promise.reject(new Error('Agentic RAG API 422 for /ask: string_too_long'))
          : management.askStructured(t, s, query)
      },
    } as unknown as AragProvider

    const events = await run(flaky, tenants, tenants.get('claritydesk')!)

    expect(events.some((e) => e.type === 'item' && /Could not label batch 1 of/.test(e.label)))
      .toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(calls.labelled.length).toBeGreaterThan(0)
    expect(calls.labelled.length).toBeLessThan(wide.length)
    expect(
      events.some((e) => e.type === 'item' && /could not be labelled/.test(e.detail ?? '')),
    ).toBe(true)
  })
})

/** Drain any event generator, for the passes that are not analyseTenant. */
async function drain(gen: AsyncGenerator<AnalyseEvent>): Promise<AnalyseEvent[]> {
  const events: AnalyseEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

describe('labelUntagged', () => {
  const untagged = [
    { id: 'u1', title: 'Blue light and sleep', summary: 'A trial.', topicIds: [] },
    { id: 'u2', title: 'IPD measurement repeatability', summary: 'A method study.', topicIds: [] },
  ]
  const tagged = [
    { id: 't1', title: 'Already filed', summary: 'x', topicIds: ['coatings-treatments'] },
  ]

  function stub(resources: unknown[], assignments?: unknown) {
    const calls = { prompts: [] as string[], labelled: [] as string[] }
    const management = {
      listResources: () => Promise.resolve(resources),
      askStructured: (_t: TenantConfig, _s: unknown, query: string) => {
        calls.prompts.push(query)
        return Promise.resolve({
          object: {
            assignments: assignments ?? [
              { number: 1, topicId: 'screens-driving-glare', kindId: 'clinical-study' },
              { number: 2, topicId: 'measurements-fit', kindId: 'clinical-study' },
            ],
          },
        })
      },
      patchResourceClassifications: (_t: TenantConfig, id: string) => {
        calls.labelled.push(id)
        return Promise.resolve()
      },
    } as unknown as AragProvider
    return { management, calls }
  }

  it("files the untagged under the portal's own topics and leaves the rest alone", async () => {
    const config = tenantConfig('claritydesk')!
    const { management, calls } = stub([...tagged, ...untagged])

    const events = await drain(labelUntagged(management, config, ['clinical-study']))

    expect(calls.labelled).toEqual(['u1', 'u2'])
    expect(events.find((e) => e.type === 'done')).toMatchObject({ labelled: 2 })
    // The taxonomy is the portal's, so no design call is made and no topic
    // id is invented: the prompt names the ids already seeded.
    expect(calls.prompts).toHaveLength(1)
    expect(calls.prompts[0]).toContain('screens-driving-glare')
    expect(calls.prompts[0]).not.toContain('Design the portal configuration')
  })

  it('does nothing when every resource already carries a topic', async () => {
    const { management, calls } = stub(tagged)

    const events = await drain(labelUntagged(management, tenantConfig('claritydesk')!))

    expect(calls.prompts).toEqual([])
    expect(calls.labelled).toEqual([])
    expect(events.find((e) => e.type === 'done')).toMatchObject({ labelled: 0 })
  })

  it('refuses rather than inventing topics for a portal that has none', async () => {
    const { management, calls } = stub(untagged)
    const config = { ...tenantConfig('claritydesk')!, topics: [] }

    const events = await drain(labelUntagged(management, config))

    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && error.message).toMatch(/no topics/i)
    expect(calls.labelled).toEqual([])
  })

  it('skips an assignment naming a topic the portal does not have', async () => {
    const { management, calls } = stub(untagged, [
      { number: 1, topicId: 'a-topic-nobody-defined', kindId: 'clinical-study' },
      { number: 2, topicId: 'measurements-fit', kindId: 'clinical-study' },
    ])

    await drain(labelUntagged(management, tenantConfig('claritydesk')!))

    expect(calls.labelled).toEqual(['u2'])
  })
})
