import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { resolvePrompts, tenantConfig, TenantStore } from './tenants.ts'

describe('resolvePrompts', () => {
  it("falls back to the tenant's own askPrompt when nothing is saved", () => {
    const config = tenantConfig('claritydesk')
    expect(config?.askPrompt).toBeTruthy()
    expect(resolvePrompts(undefined, config)).toEqual({ ask: config?.askPrompt })
  })

  it('lets a saved prompt win over the tenant default', () => {
    const config = tenantConfig('claritydesk')
    expect(resolvePrompts({ ask: 'Be terse.', images: true }, config)).toEqual({
      ask: 'Be terse.',
      images: true,
    })
  })

  it('treats a cleared saved prompt as "use the tenant default"', () => {
    const config = tenantConfig('claritydesk')
    expect(resolvePrompts({ ask: '   ', images: false }, config)).toEqual({
      ask: config?.askPrompt,
      images: false,
    })
  })

  it('returns no prompt for a portal without one (the analyst default applies)', () => {
    expect(resolvePrompts(undefined, tenantConfig('marine'))).toEqual({})
    expect(resolvePrompts({ images: true }, tenantConfig('marine'))).toEqual({ images: true })
  })
})

describe('ClarityDesk tenant', () => {
  it('is a seeded portal with customer-phrased questions and situation-based topics', () => {
    const store = new TenantStore({ TENANTS_PATH: `${Deno.makeTempDirSync()}/tenants.json` })
    const config = store.get('claritydesk')
    expect(config).toBeDefined()
    expect(store.isCustom('claritydesk')).toBe(false)
    // The ids are the `topic` labels on the box; no maker names in a label.
    expect(config?.topics.length).toBe(8)
    for (const topic of config?.topics ?? []) {
      expect(topic.label).not.toMatch(/zeiss|hoya|essilor|nikon|transitions/i)
    }
    expect(config?.analysis?.keepQuestions).toBe(true)
    // The counter home groups questions by topic, so every question names a real one.
    expect(config?.home?.style).toBe('counter')
    const topicIds = new Set(config?.topics.map((t) => t.id))
    for (const question of config?.suggestedQuestions ?? []) {
      expect(question.topicId && topicIds.has(question.topicId)).toBe(true)
    }
    expect(config?.suggestedQuestions.length).toBeGreaterThanOrEqual(6)
    for (const question of config?.suggestedQuestions ?? []) {
      expect(question.text.endsWith('?')).toBe(true)
    }
    expect(store.promptsFor('claritydesk').ask).toContain('Try asking:')
    expect(store.list().map((t) => t.slug)).toContain('claritydesk')
  })
})
