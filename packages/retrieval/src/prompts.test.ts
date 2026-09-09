import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { DENOMINATOR_RULE, POPULATION_RULE, PROMPT_VARIANTS, variantPreamble } from './prompts.ts'

describe('variantPreamble', () => {
  it('prepends the denominator and population rules to the default variant', () => {
    const preamble = variantPreamble(undefined)
    expect(preamble).toContain(DENOMINATOR_RULE)
    expect(preamble).toContain(POPULATION_RULE)
    expect(preamble.endsWith('\n\n')).toBe(true)
  })

  it('leaves the denominator rule out for the plain register but keeps the population rule', () => {
    const preamble = variantPreamble(undefined, { denominators: false })
    expect(preamble).not.toContain(DENOMINATOR_RULE)
    expect(preamble).toContain(POPULATION_RULE)
  })

  it("keeps a named variant's own instruction in either register", () => {
    for (const denominators of [true, false]) {
      const preamble = variantPreamble('recency', { denominators })
      expect(preamble).toContain(PROMPT_VARIANTS.recency)
      expect(preamble).not.toContain(DENOMINATOR_RULE)
    }
  })
})
