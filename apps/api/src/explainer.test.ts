import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { familyKey } from '@research-portal/core'
import type { AragProvider } from '@research-portal/retrieval'
import type { TenantConfig } from '@research-portal/core'
import { explainerInstructions, explainerQuery, familyFor, generateExplainer } from './explainer.ts'
import { tenantConfig } from './tenants.ts'

const card = {
  summary: 'A everyday lens range built around how people use their eyes now.',
  whoFor: 'Someone who moves between a phone, a screen and the street all day.',
  notice: ['Easier switching between near and far', 'Less strain by the end of the day'],
  costMore: 'The maker says the design is tuned to the wearer rather than a stock curve.',
  askFirst: ['How many hours a day are you on a screen?', 'Do you drive at night?'],
  notCovered: '',
}

const sources = [
  { id: 'r1', title: 'ZEISS SmartLife Progressive Lenses Overview', relevance: 0.9 },
  { id: 'r2', title: 'Deconstructing Advanced Progressive Lens Designs', relevance: 0.7 },
]

function stub(overrides: Record<string, unknown> = {}) {
  const asked: { query: string; instructions?: string }[] = []
  const management = {
    askStructured: (
      _t: TenantConfig,
      _s: unknown,
      query: string,
      opts: { instructions?: string } = {},
    ) => {
      asked.push({ query, instructions: opts.instructions })
      return Promise.resolve({
        object: card,
        sources,
        insufficientGrounding: false,
        passagesByResource: {},
        ...overrides,
      })
    },
  } as unknown as AragProvider
  return { management, asked }
}

describe('familyKey', () => {
  it('makes one url segment per family, stable across punctuation', () => {
    expect(familyKey('Zeiss SmartLife')).toBe('zeiss-smartlife')
    expect(familyKey('Essilor Varilux XR')).toBe('essilor-varilux-xr')
    expect(familyKey('Transitions GEN S™')).toBe('transitions-gen-s')
  })
})

describe('familyFor', () => {
  const config = tenantConfig('claritydesk')!

  it('finds the family a key names', () => {
    expect(familyFor(config, 'zeiss-smartlife')?.label).toBe('Zeiss SmartLife')
  })

  it('returns nothing for a range the portal does not list', () => {
    expect(familyFor(config, 'a-range-nobody-sells')).toBeUndefined()
    expect(familyFor(tenantConfig('marine')!, 'zeiss-smartlife')).toBeUndefined()
  })
})

describe('explainerQuery', () => {
  it('retrieves on the range itself', () => {
    expect(explainerQuery('Hoya')).toBe('Hoya')
  })

  it("appends the family's own retrieval terms when it has them", () => {
    expect(explainerQuery('Hoya', 'Hoya lenses')).toBe('Hoya - Hoya lenses')
  })
})

describe('explainerInstructions', () => {
  it('writes for the counter when the portal is in the plain register', () => {
    const text = explainerInstructions(tenantConfig('claritydesk')!)
    expect(text).toContain('in-store adviser')
    expect(text).toContain('Never present one as the other')
    expect(text).toContain('no em dashes')
  })

  it('writes for a professional reader otherwise', () => {
    const text = explainerInstructions(tenantConfig('marine')!)
    expect(text).toContain('professional reader')
    expect(text).not.toContain('in-store adviser')
  })
})

describe('generateExplainer', () => {
  const config = tenantConfig('claritydesk')!

  it('builds a card and names the guides retrieval actually used', async () => {
    const { management, asked } = stub()

    const result = await generateExplainer(management, config, { label: 'Zeiss SmartLife' })

    expect(result.family).toBe('Zeiss SmartLife')
    expect(result.summary).toBe(card.summary)
    expect(result.notice).toHaveLength(2)
    expect(result.askFirst).toHaveLength(2)
    expect(result.sources).toEqual([
      { id: 'r1', title: 'ZEISS SmartLife Progressive Lenses Overview' },
      { id: 'r2', title: 'Deconstructing Advanced Progressive Lens Designs' },
    ])
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(asked[0]?.query).toBe('Zeiss SmartLife')
    expect(asked[0]?.instructions).toContain('in-store adviser')
  })

  it('omits an empty "not covered" rather than rendering a blank panel', async () => {
    const { management } = stub()
    const result = await generateExplainer(management, config, { label: 'Zeiss SmartLife' })
    expect(result.notCovered).toBeUndefined()
  })

  it('refuses rather than writing a card the corpus cannot support', async () => {
    const { management } = stub({ insufficientGrounding: true })

    await expect(generateExplainer(management, config, { label: 'Zeiss SmartLife' }))
      .rejects.toThrow('insufficient_grounding')
  })

  it('refuses a card the model returned empty', async () => {
    const { management } = stub({ object: { ...card, summary: '   ', notice: [] } })

    await expect(generateExplainer(management, config, { label: 'Zeiss SmartLife' }))
      .rejects.toThrow('empty_explainer')
  })

  it('drops non-string lines the model slipped into a list', async () => {
    const { management } = stub({ object: { ...card, notice: ['Real line', 42, null] } })

    const result = await generateExplainer(management, config, { label: 'Zeiss SmartLife' })

    expect(result.notice).toEqual(['Real line'])
  })
})

describe('generateExplainer and the platform guardrail', () => {
  const config = tenantConfig('claritydesk')!

  it('drops the refusal sentinel rather than rendering it as a panel', async () => {
    const { management } = stub({
      object: { ...card, notCovered: 'Not enough data to answer this.' },
    })

    const result = await generateExplainer(management, config, { label: 'Zeiss SmartLife' })

    expect(result.notCovered).toBeUndefined()
  })

  it('keeps a real "not covered" note that merely mentions missing data', async () => {
    const { management } = stub({
      object: { ...card, notCovered: 'The guides do not give a price for this range.' },
    })

    const result = await generateExplainer(management, config, { label: 'Zeiss SmartLife' })

    expect(result.notCovered).toBe('The guides do not give a price for this range.')
  })

  it('shows guides the way the portal displays them, never a bare filename', async () => {
    const { management } = stub()

    const result = await generateExplainer(
      management,
      config,
      { label: 'Zeiss SmartLife' },
      (list) => list.map((source) => ({ ...source, title: `Merchandised: ${source.title}` })),
    )

    expect(result.sources[0]?.title).toBe(
      'Merchandised: ZEISS SmartLife Progressive Lenses Overview',
    )
  })
})
