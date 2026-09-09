import type { FacetCounts, Question, Topic } from '@research-portal/core'

export interface QuestionGroup {
  /** Absent for the trailing group of questions that name no topic. */
  topic?: Topic
  /** Documents the box files under the topic, from its classification facets. */
  count: number
  questions: Question[]
}

/**
 * The counter-style home page's question groups: the tenant's suggested
 * questions under the topic each one names, in the tenant's topic order,
 * with the box's document count for that topic beside it. Topics with no
 * question are skipped (the topic rows further down still show them), a
 * question naming an unknown topic is treated as naming none, and the
 * questions without a topic come last as one unlabelled group so nothing
 * the tenant wrote is lost.
 */
export function groupQuestionsByTopic(
  questions: Question[],
  topics: Topic[],
  facets: FacetCounts,
): QuestionGroup[] {
  const counts = facets.topic ?? {}
  const known = new Set(topics.map((t) => t.id))
  const byTopic = new Map<string, Question[]>()
  const loose: Question[] = []
  for (const question of questions) {
    if (question.topicId && known.has(question.topicId)) {
      const list = byTopic.get(question.topicId) ?? []
      list.push(question)
      byTopic.set(question.topicId, list)
    } else {
      loose.push(question)
    }
  }
  const groups: QuestionGroup[] = []
  for (const topic of topics) {
    const list = byTopic.get(topic.id)
    if (list && list.length > 0) {
      groups.push({ topic, count: counts[topic.id] ?? 0, questions: list })
    }
  }
  if (loose.length > 0) groups.push({ count: 0, questions: loose })
  return groups
}
