/**
 * Counter mode: the shape the portal takes on a tablet propped on a shop
 * counter, where the reader is an adviser standing up with a customer
 * waiting rather than someone sitting at a desk.
 *
 * It is a property of the DEVICE, not of the portal: the tablet on the
 * counter wants it and the same portal in the back office does not, so it
 * lives in the URL and in that browser's own storage rather than in the
 * tenant's configuration. `?counter=1` turns it on and is remembered;
 * `?counter=0` turns it off again, which is the way back for a tablet with
 * no keyboard.
 */

const STORAGE_KEY = 'rp-counter-mode'

/** Whether this browser is set to counter mode. */
export function counterModeOn(search: string, storage: Storage | undefined): boolean {
  const param = new URLSearchParams(search).get('counter')
  if (param === '1') {
    write(storage, true)
    return true
  }
  if (param === '0') {
    write(storage, false)
    return false
  }
  try {
    return storage?.getItem(STORAGE_KEY) === '1'
  } catch {
    // A browser with storage blocked still renders the portal; it simply
    // will not remember the choice between loads.
    return false
  }
}

function write(storage: Storage | undefined, on: boolean): void {
  try {
    if (on) storage?.setItem(STORAGE_KEY, '1')
    else storage?.removeItem(STORAGE_KEY)
  } catch {
    // Same as above: the mode still applies to this page view.
  }
}

/**
 * The link that leaves counter mode, pointing at the portal's home so the
 * adviser lands somewhere sensible rather than back where they were with
 * the chrome suddenly restored.
 */
export function exitCounterHref(slug: string): string {
  return `/t/${slug}?counter=0`
}
