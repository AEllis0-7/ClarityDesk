import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { groupQuestionsByTopic } from './question-groups.ts'

const topics = [
  { id: 'progressives', label: 'Progressive lenses' },
  { id: 'coatings', label: 'Coatings' },
  { id: 'driving', label: 'Driving' },
]

describe('groupQuestionsByTopic', () => {
  it('groups questions under their topic in topic order with the facet count', () => {
    const groups = groupQuestionsByTopic(
      [
        { id: 'q1', text: 'Do I need a coating?', topicId: 'coatings' },
        { id: 'q2', text: 'How long to adapt?', topicId: 'progressives' },
        { id: 'q3', text: 'Single vision or progressive?', topicId: 'progressives' },
      ],
      topics,
      { topic: { progressives: 10, coatings: 6 } },
    )
    expect(groups.map((g) => g.topic?.id)).toEqual(['progressives', 'coatings'])
    expect(groups[0]?.questions.map((q) => q.id)).toEqual(['q2', 'q3'])
    expect(groups[0]?.count).toBe(10)
    expect(groups[1]?.count).toBe(6)
  })

  it('lists questions with no topic, or an unknown one, last in one unlabelled group', () => {
    const groups = groupQuestionsByTopic(
      [
        { id: 'q1', text: 'Anything?' },
        { id: 'q2', text: 'Night driving?', topicId: 'driving' },
        { id: 'q3', text: 'Frames?', topicId: 'frames' },
      ],
      topics,
      {},
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]?.topic?.id).toBe('driving')
    expect(groups[0]?.count).toBe(0)
    expect(groups[1]?.topic).toBeUndefined()
    expect(groups[1]?.questions.map((q) => q.id)).toEqual(['q1', 'q3'])
  })

  it('returns nothing for a portal with no questions', () => {
    expect(groupQuestionsByTopic([], topics, { topic: { coatings: 1 } })).toEqual([])
  })
})
