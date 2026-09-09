import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ApiError, type Explainer, getExplainer } from '../api/client.ts'
import { EmptyState, ErrorCard, Skeleton } from '../components/ui.tsx'
import type { TenantOutletContext } from './TenantLayout.tsx'

/**
 * A counter card for one product family: what the range is, who it suits,
 * what the customer will notice, what the extra money buys, and what to ask
 * before recommending it. Everything on it comes from the portal's own
 * guides, and the guides it was built from are named at the foot of the
 * card, so an adviser reading it aloud knows what is behind each line.
 */

/** The card's headline block: the range, and the one sentence to say first. */
function CardHead({ card }: { card: Explainer }) {
  return (
    <div className='min-w-0'>
      <p className='rp-eyebrow text-ink-3'>Product range</p>
      <h1 className='rp-display mt-1.5 text-3xl text-ink sm:text-4xl'>{card.family}</h1>
      <p className='mt-3 max-w-[70ch] text-lg leading-relaxed text-ink-2'>{card.summary}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='rp-card p-5'>
      <h2 className='rp-eyebrow text-ink-3'>{title}</h2>
      <div className='mt-2.5 text-sm leading-relaxed text-ink-2'>{children}</div>
    </section>
  )
}

function CardSkeleton() {
  return (
    <>
      <div className='mt-4'>
        <p className='rp-eyebrow text-ink-3'>Product range</p>
        <Skeleton className='mt-2 h-9 w-64' />
        <Skeleton className='mt-4 h-6 w-full max-w-[52ch]' />
      </div>
      <div className='mt-8 grid gap-4 md:grid-cols-2'>
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
    </>
  )
}

export function ExplainerPage() {
  const { config } = useOutletContext<TenantOutletContext>()
  const { family = '' } = useParams()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['explainer', config.slug, family],
    queryFn: () => getExplainer(config.slug, family),
    // The first visit runs a generation against the corpus; a retry storm
    // would bill the shop for each attempt.
    retry: false,
    staleTime: Infinity,
  })

  const thin = error instanceof ApiError && error.status === 422

  return (
    <main className='mx-auto max-w-5xl px-6 py-8'>
      <Link
        to={`/t/${config.slug}`}
        className='rp-focus inline-flex min-h-6 items-center rounded-[var(--rp-radius-btn)] text-sm font-medium text-[var(--rp-ink-3)] transition-colors duration-150 hover:text-[var(--rp-ink)]'
      >
        &larr; Back to the counter
      </Link>

      {isLoading && <CardSkeleton />}

      {isError && thin && (
        <div className='mt-4'>
          <EmptyState
            title='Not enough in the guides for this range'
            description='The portal lists this range, but the guides do not say enough about it to write a card. Add a guide that covers it, or search for what the corpus does have.'
          >
            <Link
              to={`/t/${config.slug}/search?q=${encodeURIComponent(family.replace(/-/g, ' '))}`}
              className='rp-btn rp-btn-outline'
            >
              Search the guides
            </Link>
          </EmptyState>
        </div>
      )}

      {isError && !thin && (
        <div className='mt-4'>
          <ErrorCard
            message={error instanceof Error ? error.message : 'Could not build this card.'}
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {data && (
        <>
          <div className='mt-4'>
            <CardHead card={data} />
          </div>

          <div className='mt-8 grid gap-4 md:grid-cols-2'>
            {data.whoFor && <Panel title='Who it suits'>{data.whoFor}</Panel>}

            {data.notice.length > 0 && (
              <Panel title='What the customer notices'>
                <ul className='space-y-1.5'>
                  {data.notice.map((line, index) => (
                    <li key={index} className='flex gap-2'>
                      <span aria-hidden='true' className='text-ink-3'>&bull;</span>
                      <span className='min-w-0'>{line}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {data.costMore && <Panel title='What the extra money buys'>{data.costMore}</Panel>}

            {data.askFirst.length > 0 && (
              <Panel title='Ask before you recommend it'>
                <ol className='space-y-1.5'>
                  {data.askFirst.map((question, index) => (
                    <li key={index} className='flex gap-2'>
                      <span aria-hidden='true' className='shrink-0 text-ink-3'>{index + 1}.</span>
                      <span className='min-w-0'>{question}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>

          {data.notCovered && (
            <section className='mt-4 rounded-[var(--rp-radius)] border border-line bg-surface-2 p-5'>
              <h2 className='rp-eyebrow text-ink-3'>What the guides do not say</h2>
              <p className='mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-2'>
                {data.notCovered}
              </p>
            </section>
          )}

          <section className='mt-8'>
            <h2 className='rp-eyebrow text-ink-3'>Built from these guides</h2>
            <ul className='mt-3 flex flex-wrap gap-2'>
              {data.sources.map((source) => (
                <li key={source.id}>
                  <Link
                    to={`/t/${config.slug}/library/${source.id}`}
                    className='rp-focus inline-flex min-h-11 items-center rounded-[var(--rp-radius-chip)] border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink sm:min-h-0'
                  >
                    {source.title}
                  </Link>
                </li>
              ))}
            </ul>
            <p className='mt-3 text-xs text-ink-3'>
              Written from the guides above. Check anything a customer will act on with the
              optometrist.
            </p>
          </section>

          <div className='mt-8 flex flex-wrap gap-3'>
            <Link
              to={`/t/${config.slug}/ask?ask=${
                encodeURIComponent(`Tell me about ${data.family} for a customer`)
              }`}
              className='rp-btn rp-btn-primary'
            >
              Ask about this range
            </Link>
            <Link
              to={`/t/${config.slug}/search?q=${encodeURIComponent(data.family)}`}
              className='rp-btn rp-btn-outline'
            >
              See every guide
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
