import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AnswerFeedbackRow, FeedbackQuestionRow } from '../../api/client.ts'
import { getAnswerFeedback } from '../../api/client.ts'
import { Skeleton } from '../../components/ui.tsx'

/** Same relative-time shape the Insights panel uses, applied to ISO timestamps. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-[var(--rp-radius)] bg-surface-2 px-4 py-3'>
      <dt className='rp-eyebrow text-ink-3'>{label}</dt>
      <dd className='mt-1 text-lg font-semibold text-ink'>{value}</dd>
    </div>
  )
}

function Verdict({ good }: { good: boolean }) {
  return good
    ? <span className='rp-badge rp-badge-ok'>Helpful</span>
    : <span className='rp-badge rp-badge-bad'>Not helpful</span>
}

/**
 * The verdicts readers give answers. The platform's learning loop takes the
 * same thumbs and never gives them back, so this reads the portal's own log:
 * which questions are being marked unhelpful, what people wrote about them,
 * and what the answer was citing at the time.
 */
export function FeedbackPanel({ slug, passcode }: { slug: string; passcode: string }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-feedback', slug],
    queryFn: () => getAnswerFeedback(slug, passcode),
  })

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-feedback', slug] })
    void refetch()
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold text-ink'>Feedback</h3>
          <p className='mt-0.5 text-xs text-ink-3'>
            What readers thought of the answers they were given.
          </p>
        </div>
        <button
          type='button'
          disabled={isFetching}
          onClick={onRefresh}
          className='rp-btn rp-btn-outline'
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading && (
        <div className='space-y-3'>
          <div className='grid grid-cols-3 gap-3'>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
          </div>
          <Skeleton className='h-40 w-full' />
        </div>
      )}

      {isError && <p className='text-sm text-ink-3'>Could not load feedback.</p>}

      {data && data.total === 0 && (
        <div className='rounded-[var(--rp-radius)] border border-dashed border-line bg-surface-2 p-6'>
          <p className='text-sm font-semibold text-ink'>No feedback yet</p>
          <p className='mt-1 max-w-xl text-sm leading-relaxed text-ink-2'>
            Readers rate an answer with the thumbs under it. Their verdicts appear here, worst
            questions first, so you can see what the corpus is answering badly.
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <dl className='grid grid-cols-3 gap-3'>
            <StatTile label='Rated answers' value={String(data.total)} />
            <StatTile label='Helpful' value={String(data.good)} />
            <StatTile label='Not helpful' value={String(data.bad)} />
          </dl>

          <div className='rp-card p-5'>
            <h4 className='text-sm font-semibold text-ink'>Questions to fix</h4>
            <p className='mt-1 text-xs text-ink-3'>
              Marked unhelpful at least once - most-marked first. Add sources that cover them, or
              tune the answer prompt.
            </p>
            {data.needsWork.length === 0
              ? (
                <p className='mt-3 text-sm text-ink-3'>
                  Nothing marked unhelpful - the answers are landing.
                </p>
              )
              : (
                <ul className='mt-3 divide-y divide-line overflow-hidden rounded-[var(--rp-radius)] border border-line'>
                  {data.needsWork.map((row: FeedbackQuestionRow, index: number) => (
                    <li key={index} className='bg-surface px-4 py-3'>
                      <div className='flex flex-wrap items-start justify-between gap-2'>
                        <p className='min-w-0 text-sm text-ink'>{row.question}</p>
                        <span className='rp-badge rp-badge-warn shrink-0'>
                          {row.bad} not helpful
                          {row.good > 0 ? `, ${row.good} helpful` : ''}
                        </span>
                      </div>
                      {row.notes.length > 0 && (
                        <ul className='mt-2 space-y-1'>
                          {row.notes.map((note: string, noteIndex: number) => (
                            <li
                              key={noteIndex}
                              className='border-l-2 border-line pl-3 text-sm italic leading-relaxed text-ink-2'
                            >
                              {note}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className='mt-1.5 text-xs text-ink-3'>{relativeTime(row.lastTs)}</p>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className='rp-card p-5'>
            <h4 className='text-sm font-semibold text-ink'>Recent verdicts</h4>
            <ul className='mt-3 divide-y divide-line overflow-hidden rounded-[var(--rp-radius)] border border-line'>
              {data.recent.map((row: AnswerFeedbackRow, index: number) => (
                <li key={index} className='bg-surface px-4 py-3'>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <p className='min-w-0 text-sm text-ink'>{row.question}</p>
                    <span className='shrink-0'>
                      <Verdict good={row.good} />
                    </span>
                  </div>
                  {row.text && (
                    <p className='mt-2 border-l-2 border-line pl-3 text-sm italic leading-relaxed text-ink-2'>
                      {row.text}
                    </p>
                  )}
                  {row.citedTitles && row.citedTitles.length > 0 && (
                    <p className='mt-1.5 text-xs text-ink-3'>
                      Cited: {row.citedTitles.join(', ')}
                    </p>
                  )}
                  <p className='mt-1.5 text-xs text-ink-3'>{relativeTime(row.ts)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
