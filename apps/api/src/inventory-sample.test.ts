import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { chunkInventory, sampleInventory } from './inventory-sample.ts'

const line = (r: { title: string }, i: number) => `${i + 1}. ${r.title}`

describe('sampleInventory', () => {
  it('returns the whole corpus when it fits the budget', () => {
    const resources = [{ title: 'a' }, { title: 'b' }, { title: 'c' }]
    const result = sampleInventory(resources, line, 1000)
    expect(result.sample).toEqual(resources)
    expect(result.sampled).toBe(false)
    expect(result.inventory).toBe('1. a\n2. b\n3. c')
  })

  it('samples evenly across the corpus and stays under the budget', () => {
    const resources = Array.from(
      { length: 1000 },
      (_, i) => ({ title: `Resource ${i} ${'x'.repeat(60)}` }),
    )
    const result = sampleInventory(resources, line, 14_000)
    expect(result.sampled).toBe(true)
    expect(result.inventory.length).toBeLessThanOrEqual(14_000)
    expect(result.sample.length).toBeGreaterThan(100)
    // spread: the sample reaches into the back half of the corpus
    const last = result.sample.at(-1)?.title ?? ''
    expect(Number(last.split(' ')[1])).toBeGreaterThan(500)
  })

  it('handles an empty corpus', () => {
    const result = sampleInventory([], line, 100)
    expect(result.sample).toEqual([])
    expect(result.sampled).toBe(false)
    expect(result.inventory).toBe('')
  })
})

describe('chunkInventory', () => {
  it('keeps a corpus that fits in one batch', () => {
    const resources = [{ title: 'a' }, { title: 'b' }, { title: 'c' }]
    expect(chunkInventory(resources, line, 1000)).toEqual([resources])
  })

  it('covers every resource across batches, none dropped or repeated', () => {
    const resources = Array.from(
      { length: 250 },
      (_, i) => ({ title: `Resource ${i} ${'x'.repeat(60)}` }),
    )
    const batches = chunkInventory(resources, line, 2_000)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flat()).toEqual(resources)
    for (const batch of batches) {
      expect(batch.map(line).join('\n').length).toBeLessThanOrEqual(2_000)
    }
  })

  it('numbers each batch from 1', () => {
    const resources = Array.from({ length: 6 }, (_, i) => ({ title: `r${i}` }))
    const batches = chunkInventory(resources, line, 15)
    expect(batches.every((b) => b.map(line)[0]?.startsWith('1. '))).toBe(true)
  })

  it('gives an oversized resource its own batch rather than dropping it', () => {
    const resources = [{ title: 'x'.repeat(500) }, { title: 'small' }]
    const batches = chunkInventory(resources, line, 100)
    expect(batches.flat()).toEqual(resources)
  })

  it('handles an empty corpus', () => {
    expect(chunkInventory([], line, 100)).toEqual([])
  })
})
