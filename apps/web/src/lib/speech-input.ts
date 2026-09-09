/**
 * Dictation for the ask box.
 *
 * An adviser at the counter often has a frame in one hand and a customer
 * in front of them, and typing a question on a propped-up tablet is the
 * slowest part of using this portal. The browser's own speech recognition
 * turns it into a held button.
 *
 * The platform's Web Speech API is not in the DOM type library this project
 * compiles against, and it is not in every browser either, so the shape is
 * declared here and reached through a guarded global. Everything below is
 * pure except `createRecogniser`, which is the single line that touches the
 * browser - so the state machine is tested without one.
 */

/** The slice of the platform API this feature uses. */
export interface SpeechRecogniser {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type RecogniserCtor = new () => SpeechRecogniser

/**
 * The platform constructor, or undefined where the browser has none.
 * Chrome, Edge and Safari expose it; Firefox does not, and the caller must
 * hide the control rather than offer a button that cannot work.
 */
export function recogniserCtor(scope: unknown = globalThis): RecogniserCtor | undefined {
  const win = scope as {
    SpeechRecognition?: RecogniserCtor
    webkitSpeechRecognition?: RecogniserCtor
  }
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition
}

/** Whether dictation can work at all in this browser. */
export function speechSupported(scope: unknown = globalThis): boolean {
  return recogniserCtor(scope) !== undefined
}

/**
 * What the control is doing. `denied` is terminal for the page: a browser
 * that has refused the microphone will refuse again without a prompt, so
 * the control says so rather than looking broken on every press.
 */
export type SpeechState = 'idle' | 'listening' | 'denied' | 'error'

/**
 * The whole transcript of one dictation, assembled from the platform's
 * running result list.
 *
 * The API hands back every result since the session began, some final and
 * some still being revised. Reading only the newest one loses the earlier
 * half of a long sentence; concatenating everything on every event repeats
 * it. Final results are therefore accumulated once, and the interim tail is
 * recomputed each time.
 */
export function transcriptOf(event: SpeechResultEvent): { final: string; interim: string } {
  let final = ''
  let interim = ''
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index]
    if (!result) continue
    const text = result[0]?.transcript ?? ''
    if (result.isFinal) final += text
    else interim += text
  }
  return { final: final.trim(), interim: interim.trim() }
}

/**
 * What the reader is told when recognition fails. The platform's error
 * codes are developer strings ('not-allowed', 'audio-capture'); an adviser
 * needs to know what to do instead, in words they would use.
 */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked for this site. Allow it in your browser settings, or type the question instead.'
    case 'no-speech':
      return 'Nothing was picked up. Try again, or type the question instead.'
    case 'audio-capture':
      return 'No microphone was found. Type the question instead.'
    case 'network':
      return 'Speech needs the network and it could not be reached. Type the question instead.'
    case 'aborted':
      return ''
    default:
      return 'Dictation stopped working. Type the question instead.'
  }
}

/**
 * Join dictated words onto whatever is already in the field, so speaking
 * after typing continues the sentence rather than running two words
 * together or leaving a stray gap in an empty field.
 */
export function appendTranscript(existing: string, spoken: string): string {
  const left = existing.trimEnd()
  const right = spoken.trim()
  if (!right) return existing
  if (!left) return right
  return `${left} ${right}`
}

/**
 * Build a recogniser configured for one short question at a shop counter:
 * a single utterance rather than an open mic, interim words so the adviser
 * can see it working, and British English, which is what the shop speaks
 * and what keeps "colour" and "centre" out of the transcript as American
 * spellings.
 */
export function createRecogniser(scope: unknown = globalThis): SpeechRecogniser | undefined {
  const Ctor = recogniserCtor(scope)
  if (!Ctor) return undefined
  const recogniser = new Ctor()
  // One question, then stop by itself: a counter tablet left listening is
  // both a privacy problem and a way to capture half of the next customer's
  // conversation.
  recogniser.continuous = false
  recogniser.interimResults = true
  recogniser.lang = 'en-GB'
  recogniser.maxAlternatives = 1
  return recogniser
}
