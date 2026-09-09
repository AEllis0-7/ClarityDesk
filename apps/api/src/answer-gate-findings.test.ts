import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { assertsFinding, uncitedNote } from './answer-gate.ts'

describe('assertsFinding', () => {
  it('treats a sourced-sounding statement as a finding', () => {
    expect(
      assertsFinding('Progressive lenses have different powers in different parts of the lens.'),
    )
      .toBe(true)
  })

  it('does not treat a closing "Try asking" line or a question as a finding', () => {
    expect(assertsFinding('Try asking: How much time do you spend on screens or driving at night?'))
      .toBe(false)
    expect(
      assertsFinding('**Try asking:** how often is glare a problem with your current glasses?'),
    )
      .toBe(false)
    expect(
      assertsFinding('Would a lighter lens make a difference to how the frame sits on your nose?'),
    )
      .toBe(false)
  })
})

describe('uncitedNote', () => {
  it("stays silent when the only uncited sentence is the adviser's next question", () => {
    const note = uncitedNote([
      { text: 'Anti-reflective coatings reduce reflections on your lenses.', bound: [1] },
      {
        text: 'Try asking: How often do you find glare a problem with your current glasses?',
        bound: [],
      },
    ])
    expect(note).toBe('')
  })

  it('still names a real uncited claim', () => {
    const note = uncitedNote([
      { text: 'Anti-reflective coatings reduce reflections on your lenses.', bound: [1] },
      { text: 'These coatings are also easier to clean and more resistant to dirt.', bound: [] },
    ])
    expect(note).toContain('carries no citation')
    expect(note).toContain('easier to clean')
  })
})
