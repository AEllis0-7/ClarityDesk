import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  appendTranscript,
  createRecogniser,
  recogniserCtor,
  speechErrorMessage,
  speechSupported,
  transcriptOf,
} from './speech-input.ts'

/** One entry of the platform's running result list. */
function result(transcript: string, isFinal: boolean) {
  return Object.assign([{ transcript }], { isFinal, length: 1 })
}

function event(...results: ReturnType<typeof result>[]) {
  return { resultIndex: 0, results }
}

class FakeRecogniser {
  continuous = false
  interimResults = false
  lang = ''
  maxAlternatives = 0
  start() {}
  stop() {}
  abort() {}
  onresult = null
  onerror = null
  onend = null
  onstart = null
}

describe('recogniserCtor', () => {
  it('finds the standard constructor', () => {
    expect(recogniserCtor({ SpeechRecognition: FakeRecogniser })).toBe(FakeRecogniser)
  })

  it('falls back to the prefixed one Safari and Chrome still ship', () => {
    expect(recogniserCtor({ webkitSpeechRecognition: FakeRecogniser })).toBe(FakeRecogniser)
  })

  it('finds nothing in a browser without speech, so the control can hide', () => {
    expect(recogniserCtor({})).toBeUndefined()
    expect(speechSupported({})).toBe(false)
    expect(speechSupported({ webkitSpeechRecognition: FakeRecogniser })).toBe(true)
  })
})

describe('transcriptOf', () => {
  it('keeps the whole sentence, not just the newest fragment', () => {
    const spoken = event(
      result('do anti-reflective coatings ', true),
      result('scratch easily', false),
    )

    expect(transcriptOf(spoken)).toEqual({
      final: 'do anti-reflective coatings',
      interim: 'scratch easily',
    })
  })

  it('separates what is settled from what is still being revised', () => {
    expect(transcriptOf(event(result('which lens', false)))).toEqual({
      final: '',
      interim: 'which lens',
    })
    expect(transcriptOf(event(result('which lens is thinnest', true)))).toEqual({
      final: 'which lens is thinnest',
      interim: '',
    })
  })

  it('survives an empty or gappy result list', () => {
    expect(transcriptOf(event())).toEqual({ final: '', interim: '' })
    expect(transcriptOf({ resultIndex: 0, results: [undefined as never] })).toEqual({
      final: '',
      interim: '',
    })
  })
})

describe('speechErrorMessage', () => {
  it('tells the adviser what to do, never the platform error code', () => {
    expect(speechErrorMessage('not-allowed')).toContain('type the question instead')
    expect(speechErrorMessage('not-allowed')).not.toContain('not-allowed')
    expect(speechErrorMessage('no-speech')).toContain('Nothing was picked up')
    expect(speechErrorMessage('audio-capture')).toContain('No microphone was found')
    expect(speechErrorMessage('network')).toContain('network')
  })

  it('says nothing when the reader stopped it themselves', () => {
    expect(speechErrorMessage('aborted')).toBe('')
  })

  it('has a plain fallback for a code it has never seen', () => {
    const message = speechErrorMessage('some-new-code')
    expect(message).toContain('Type the question instead')
    expect(message).not.toContain('some-new-code')
  })

  it('speaks Australian English with no em dashes', () => {
    for (const code of ['not-allowed', 'no-speech', 'audio-capture', 'network', 'other']) {
      expect(speechErrorMessage(code)).not.toContain('—')
    }
  })
})

describe('appendTranscript', () => {
  it('continues a sentence the adviser had started typing', () => {
    expect(appendTranscript('are blue light lenses', 'worth it')).toBe(
      'are blue light lenses worth it',
    )
  })

  it('does not leave a leading space in an empty field', () => {
    expect(appendTranscript('', 'which lens is thinnest')).toBe('which lens is thinnest')
  })

  it('collapses the gap rather than doubling it', () => {
    expect(appendTranscript('what about ', '  glare  ')).toBe('what about glare')
  })

  it('leaves the field alone when nothing was heard', () => {
    expect(appendTranscript('what about', '   ')).toBe('what about')
  })
})

describe('createRecogniser', () => {
  it('listens for one question and stops, rather than holding the mic open', () => {
    const recogniser = createRecogniser({ SpeechRecognition: FakeRecogniser })

    expect(recogniser?.continuous).toBe(false)
    expect(recogniser?.interimResults).toBe(true)
    expect(recogniser?.lang).toBe('en-GB')
    expect(recogniser?.maxAlternatives).toBe(1)
  })

  it('builds nothing where the browser has no speech', () => {
    expect(createRecogniser({})).toBeUndefined()
  })
})
