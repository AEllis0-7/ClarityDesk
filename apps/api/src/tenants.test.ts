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
  it('is a seeded portal with customer-phrased questions and no topic ids yet', () => {
    const store = new TenantStore({ TENANTS_PATH: `${Deno.makeTempDirSync()}/tenants.json` })
    const config = store.get('claritydesk')
    expect(config).toBeDefined()
    expect(store.isCustom('claritydesk')).toBe(false)
    expect(config?.topics).toEqual([])
    expect(config?.suggestedQuestions.length).toBeGreaterThanOrEqual(6)
    for (const question of config?.suggestedQuestions ?? []) {
      expect(question.text.endsWith('?')).toBe(true)
    }
    expect(store.promptsFor('claritydesk').ask).toContain('Try asking:')
    expect(store.list().map((t) => t.slug)).toContain('claritydesk')
  })
})
