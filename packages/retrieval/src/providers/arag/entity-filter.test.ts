import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  dedupeNames,
  entitySalience,
  isGeneSymbolEntity,
  isNoiseEntity,
  keepEntity,
  noiseReason,
  preferredSpelling,
} from './entity-filter.ts'

describe('isNoiseEntity', () => {
  it('drops numbers, single letters, people, journals, vignettes and addresses', () => {
    for (
      const noise of [
        '100',
        '191',
        '60156',
        '0.5%',
        'U',
        'b',
        'Sowcik M',
        'Cho H',
        'Vajda F',
        "Terence J. O'Brien",
        'Igarashi et al.',
        'Faden et al., 1989',
        'Mehndiratta 2002',
        'Frontiers in Neurology',
        'Frontiers in Genetics',
        'Journal of Neuroscience',
        '26-year-old woman',
        '3 month old boy',
        'vajda@netspace.net.au',
        'Table 18',
        'Pathway 7',
        'Glut!D patients',
        'Dravet Syndrome \n UK',
        '10 Hz',
        '100 children',
        '13 probands',
        '155 AHC patients',
        '0.2 mg/kg/d',
        '16% PFA stock',
        '1X TBS',
        '7T',
        '3/Male/18c',
        '0 and 1',
        '3q21.3',
        '10.1038/nature12439',
        '16 Shafi MM',
        '6 NATURE COMMUNICATIONS',
        'A193V',
        'Arg55',
        '[25]',
        'A0122026',
        'Afrikanova, T.',
      ]
    ) {
      expect(isNoiseEntity(noise)).toBe(true)
    }
  })
  it('keeps real entities, including genes, drugs, models and syndromes', () => {
    for (
      const ok of [
        'SCN1A',
        'Dravet syndrome',
        'fenfluramine',
        'kainic acid',
        'Wistar',
        'status epilepticus',
        'Antisense oligonucleotides',
        'FHM3',
        'Kryptofix 222',
        'GABAA receptor',
        '24 hour ambulatory EEG',
        '5-HT2A receptor',
        '[18F]flumazenil',
        '2-AG',
        '2023 Genetic Generalized Epilepsy (GGE) PRS model',
      ]
    ) {
      expect(isNoiseEntity(ok)).toBe(false)
    }
  })
})

describe('isGeneSymbolEntity', () => {
  it('accepts HGNC-shaped symbols, with a variant or gene tail, and rodent symbols', () => {
    for (
      const ok of [
        'SCN1A',
        'KCNT1 mutation',
        'SLC12A5 gene',
        'IQSEC2',
        'TUBA1A',
        'GABBR2',
        'WDR45',
        'PTEN',
        'Scn1a',
        'TBC1D24',
      ]
    ) {
      expect(isGeneSymbolEntity(ok)).toBe(true)
    }
  })
  it('rejects phrases, numbers, authors and variant descriptions that are not a symbol', () => {
    for (
      const no of [
        '14',
        'Tononi G',
        'SETBP1 missense variants',
        'potassium channel gene cluster',
        'DNA binding-independent functions',
        'short insertions/deletions',
        'homozygous variant',
        'top SNP',
        'rtTA',
        'chr9:g.(140382705_141044489)x1',
        'amyloid-b',
        'genetic findings',
        'p.Lys114 deletion',
      ]
    ) {
      expect(isGeneSymbolEntity(no)).toBe(false)
    }
  })
})

describe('keepEntity', () => {
  it('applies the gene check only to the Gene group', () => {
    expect(keepEntity('genetic findings', 'Gene')).toBe(false)
    expect(keepEntity('genetic findings', 'Research Study')).toBe(true)
    expect(keepEntity('100', 'Medical Condition')).toBe(false)
  })
})

describe('dedupeNames and preferredSpelling', () => {
  it('case-folds, collapses whitespace and keeps the first spelling', () => {
    expect(dedupeNames(['Dravet', 'dravet', 'DRAVET', 'Dravet  syndrome', 'dravet syndrome']))
      .toEqual(['Dravet', 'Dravet syndrome'])
  })
  it('prefers a mixed-case spelling and then the shorter one', () => {
    expect(preferredSpelling(['DRAVET SYNDROME', 'dravet syndrome', 'Dravet syndrome'])).toBe(
      'Dravet syndrome',
    )
    expect(preferredSpelling(['scn1a', 'SCN1A'])).toBe('SCN1A')
    expect(preferredSpelling(['kainic Acid', 'kainic acid'])).toBe('kainic acid')
    expect(preferredSpelling(['KAINIC ACID', 'kainic acid', 'Kainic acid'])).toBe('Kainic acid')
  })
})

describe('optical-corpus noise', () => {
  it('drops prescription powers and their ranges', () => {
    for (
      const t of ['+2.50 D', '−0.75', '+3.00 Sph', '−0.79Δ', '−1.00 D to −6.00 D', '≤−0.50 D']
    ) {
      expect(isNoiseEntity(t)).toBe(true)
    }
  })

  it('drops durations and frequencies read off a method section', () => {
    for (const t of ['25 seconds', '40 to 120 min per day', '1 time/ wk', '12 months']) {
      expect(isNoiseEntity(t)).toBe(true)
    }
  })

  it('keeps a duration that runs on into a real thing', () => {
    for (const t of ['24 hour ambulatory EEG', '12 month follow-up study', '48 hours of wear']) {
      expect(isNoiseEntity(t)).toBe(false)
    }
  })

  it('drops an author cited initials-first', () => {
    expect(noiseReason('A. Ballesteros-Sanchez et al.')).toBe('person')
  })

  it('drops an abbreviated journal title from a reference list', () => {
    for (const t of ['Adv. Mater.', 'Appl. Phys. A', 'Ann Ophthalmol', 'J. Opt. Soc. Am.']) {
      expect(isNoiseEntity(t)).toBe(true)
    }
  })

  it('keeps a maker whose name merely looks clipped', () => {
    for (const t of ['Shamir DUO™', 'ZEISS DuraVision', 'Hoya Vision Care']) {
      expect(isNoiseEntity(t)).toBe(false)
    }
  })

  it('drops a journal whose title carries a country', () => {
    expect(noiseReason('American Journal of Ophthalmology')).toBe('journal')
    expect(noiseReason('British Journal of Ophthalmology')).toBe('journal')
    // Attributed to the abbreviation rule, which sees it first; what matters
    // is that a reference-list title never reaches the map.
    expect(isNoiseEntity('Acta Ophthalmol.')).toBe(true)
  })

  it('keeps the product entities a shop actually names', () => {
    for (
      const t of [
        'Varilux XR series™',
        'ZEISS SmartLife Progressive lenses',
        'Crizal Prevencia',
        'MyoCare',
        'Polycarbonate',
        'Trivex',
        'presbyopia',
        'night driving performance',
        'GEN 8',
      ]
    ) {
      expect(noiseReason(t)).toBe(null)
    }
  })
})

describe('entitySalience', () => {
  it('ranks a product name above a lower-case measurement phrase', () => {
    expect(entitySalience('Crizal Prevencia')).toBeGreaterThan(entitySalience('accommodative lead'))
    expect(entitySalience('Varilux XR series™')).toBeGreaterThan(entitySalience('2D grating'))
  })

  it('ranks a trademarked brand above a bare capitalised word', () => {
    expect(entitySalience('Crizal SunShield UV™')).toBeGreaterThan(entitySalience('Aberration'))
  })

  it('demotes a clause below a name', () => {
    expect(entitySalience('ZEISS DuraVision')).toBeGreaterThan(
      entitySalience('the impact of digitalisation on visual needs and behaviour'),
    )
  })
})
