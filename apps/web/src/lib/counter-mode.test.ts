import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { counterModeOn, exitCounterHref } from './counter-mode.ts'

/** A localStorage stand-in, and one that refuses every call. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

function blockedStorage(): Storage {
  const throwing = () => {
    throw new Error('storage is blocked')
  }
  return {
    getItem: throwing,
    setItem: throwing,
    removeItem: throwing,
    clear: throwing,
    key: throwing,
    length: 0,
  } as unknown as Storage
}

describe('counterModeOn', () => {
  it('is off for a portal nobody has put on a counter', () => {
    expect(counterModeOn('', memoryStorage())).toBe(false)
  })

  it('turns on from the URL and is remembered for the next page', () => {
    const storage = memoryStorage()

    expect(counterModeOn('?counter=1', storage)).toBe(true)
    expect(counterModeOn('', storage)).toBe(true)
  })

  it('turns off from the URL, which is how a tablet gets back', () => {
    const storage = memoryStorage({ 'rp-counter-mode': '1' })

    expect(counterModeOn('?counter=0', storage)).toBe(false)
    expect(counterModeOn('', storage)).toBe(false)
  })

  it('reads the flag beside other query parameters', () => {
    expect(counterModeOn('?q=varilux&counter=1', memoryStorage())).toBe(true)
  })

  it('ignores a value that is neither 1 nor 0', () => {
    const storage = memoryStorage({ 'rp-counter-mode': '1' })
    expect(counterModeOn('?counter=maybe', storage)).toBe(true)
  })

  it('still renders the page when the browser blocks storage', () => {
    expect(counterModeOn('', blockedStorage())).toBe(false)
    expect(counterModeOn('?counter=1', blockedStorage())).toBe(true)
    expect(counterModeOn('', undefined)).toBe(false)
  })
})

describe('exitCounterHref', () => {
  it('lands on the portal home with the mode turned off', () => {
    expect(exitCounterHref('claritydesk')).toBe('/t/claritydesk?counter=0')
  })
})
