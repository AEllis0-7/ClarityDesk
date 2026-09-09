import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendTranscript,
  createRecogniser,
  speechErrorMessage,
  type SpeechRecogniser,
  type SpeechState,
  speechSupported,
  transcriptOf,
} from '../lib/speech-input.ts'

/**
 * Speak a question instead of typing it.
 *
 * An adviser at the counter often has a frame in one hand, and typing on a
 * propped-up tablet is the slowest part of asking. Pressing this dictates
 * one question and stops by itself; pressing it again while listening
 * stops early.
 *
 * The button renders nothing at all in a browser without speech
 * recognition (Firefox today) rather than offering a control that cannot
 * work. Everything it needs is in the browser, so nothing said here is
 * sent anywhere the answer would not already go.
 */

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-[18px] w-[18px]'
      aria-hidden='true'
    >
      {listening
        ? <rect x='7' y='7' width='10' height='10' rx='1.5' fill='currentColor' stroke='none' />
        : (
          <>
            <rect x='9' y='3' width='6' height='11' rx='3' />
            <path d='M5 11a7 7 0 0 0 14 0' />
            <path d='M12 18v3' />
          </>
        )}
    </svg>
  )
}

export interface DictateButtonProps {
  /** The field's current text, so dictation continues it rather than replacing it. */
  value: string
  /** Called with the field's new text as words are recognised. */
  onChange: (next: string) => void
  /** Called once the reader has finished speaking, for a field that submits on its own. */
  onFinal?: (text: string) => void
  /** Hidden while the field cannot take input. */
  disabled?: boolean
  /** What the button is dictating into, for the accessible name. */
  label?: string
}

export function DictateButton(
  { value, onChange, onFinal, disabled, label = 'question' }: DictateButtonProps,
) {
  // Resolved once on mount: a server render and the first client paint must
  // agree, and support cannot change under a live page.
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<SpeechState>('idle')
  const [message, setMessage] = useState('')
  const recogniserRef = useRef<SpeechRecogniser | undefined>(undefined)
  // The field as it was when dictation started. Interim words are appended
  // to THIS rather than to the live value, so each revision of a half-heard
  // phrase replaces the last instead of stacking up.
  const baseRef = useRef('')
  // Read inside the platform's callbacks, which are registered once and
  // would otherwise close over the first render's props.
  const onChangeRef = useRef(onChange)
  const onFinalRef = useRef(onFinal)
  onChangeRef.current = onChange
  onFinalRef.current = onFinal

  useEffect(() => {
    setSupported(speechSupported())
  }, [])

  // A live recogniser holds the microphone, so it is always released when
  // the field unmounts - navigating away mid-sentence must not leave the
  // tablet listening.
  useEffect(() => {
    return () => {
      recogniserRef.current?.abort()
      recogniserRef.current = undefined
    }
  }, [])

  const stop = useCallback(() => {
    recogniserRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const recogniser = createRecogniser()
    if (!recogniser) {
      setSupported(false)
      return
    }
    recogniserRef.current = recogniser
    baseRef.current = value
    setMessage('')

    recogniser.onstart = () => setState('listening')

    recogniser.onresult = (event) => {
      const { final, interim } = transcriptOf(event)
      // The interim tail is shown as it is revised; only the settled words
      // are what the field keeps.
      const heard = [final, interim].filter(Boolean).join(' ')
      onChangeRef.current(appendTranscript(baseRef.current, heard))
      if (final && !interim) onFinalRef.current?.(appendTranscript(baseRef.current, final))
    }

    recogniser.onerror = (event) => {
      const text = speechErrorMessage(event.error)
      // A browser that has refused the microphone refuses again silently,
      // so the button says so rather than looking broken on every press.
      setState(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'denied'
          : text
          ? 'error'
          : 'idle',
      )
      setMessage(text)
    }

    recogniser.onend = () => {
      recogniserRef.current = undefined
      setState((current) => (current === 'denied' || current === 'error' ? current : 'idle'))
    }

    try {
      recogniser.start()
      setState('listening')
    } catch {
      // Calling start twice throws; the session already running is the one
      // the reader wanted.
      setState('listening')
    }
  }, [value])

  if (!supported) return null

  const listening = state === 'listening'
  const name = listening ? `Stop dictating the ${label}` : `Dictate the ${label}`

  // Everything is inside one shrink-0 inline box: the caller drops this into
  // a flex row of controls, and neither the pulse nor a failure message may
  // change that row's height or push its neighbours around. The pulse needs
  // this wrapper to position against, and the message floats over the page
  // rather than taking part in the layout.
  return (
    <span className='relative inline-flex shrink-0'>
      {listening && (
        <span
          aria-hidden='true'
          className='absolute inset-0 animate-ping rounded-[var(--rp-radius-btn)] opacity-40 motion-reduce:hidden'
          style={{ backgroundColor: 'var(--rp-accent)' }}
        />
      )}
      <button
        type='button'
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-label={name}
        title={name}
        aria-pressed={listening}
        className='rp-focus relative flex h-[calc(2.25rem*var(--rp-density-ctl,1))] w-[calc(2.25rem*var(--rp-density-ctl,1))] items-center justify-center rounded-[var(--rp-radius-btn)] border transition-colors duration-150 disabled:opacity-50'
        style={listening
          ? {
            borderColor: 'transparent',
            backgroundColor: 'var(--rp-accent)',
            color: 'var(--rp-on-accent)',
          }
          : { borderColor: 'var(--rp-line)', color: 'var(--rp-brand-fg)' }}
      >
        <MicIcon listening={listening} />
      </button>
      {
        /* One live region for both states, so a screen reader hears that it
        * is listening and hears why it stopped. */
      }
      <span role='status' aria-live='polite' className='sr-only'>
        {listening ? 'Listening. Speak your question.' : message}
      </span>
      {message && !listening && (
        <span
          className='rp-shadow-sm absolute right-0 top-full z-20 mt-1.5 w-56 rounded-[var(--rp-radius)] border p-2.5 text-xs leading-relaxed'
          style={{
            borderColor: 'var(--rp-bad-line)',
            backgroundColor: 'var(--rp-bad-bg)',
            color: 'var(--rp-bad-ink)',
          }}
        >
          {message}
        </span>
      )}
    </span>
  )
}
