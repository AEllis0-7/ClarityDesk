import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { AragProvider } from '@research-portal/retrieval'
import type { AnalyseEvent, TenantConfig } from '@research-portal/core'
import { analyseTenant, analysisPrompt } from './analyse.ts'
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
