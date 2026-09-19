import { describe, expect, it } from 'vitest'
import {
  globalIndicators,
  listMachines,
  listTeams,
  summaryByTeam,
  teamAnalysis,
} from '@/domain/indicators'
import { groupingKey } from '@/domain/normalization'
import { priorityFromDays } from '@/domain/priority'
import type { Anomaly } from '@/domain/types'

let row = 1
function anomaly(team: string, trainset: string, businessDays: number | null, number = String(row)): Anomaly {
  row += 1
  return {
    row,
    number,
    sef: 'Non',
    label: 'Absent',
    description: '',
    team,
    teamKey: groupingKey(team),
    trainset,
    trainsetKey: groupingKey(trainset),
    vehicle: trainset,
    creationDate: '2026-09-01',
    comment: '',
    createdBy: '',
    businessDays,
    daysSource: businessDays === null ? null : 'file',
    alertStatus: '',
    priority: priorityFromDays(businessDays),
  }
}

const DATA: Anomaly[] = [
  anomaly('MONTAGE 1  ', 'Z27575', 39), // blocking — trailing spaces, as in the export
  anomaly('MONTAGE 1  ', 'X76611', 3), // major
  anomaly('montage 1', 'X76611', 1), // minor — different case
  anomaly('Peinture', 'Z27575', 5), // blocking
  anomaly('PEINTURE', 'z27575 ', 2), // minor — trainset to normalize
  anomaly('NUIT', 'X76605', 0), // no priority yet
  anomaly('', '', 12, 'fragment de description'), // fragmented row: neither team nor trainset
  anomaly('46275', 'Z27575', 5, 'P17x2'), // fragmented row: a date in the Team column
]

const TEAMS = ['MONTAGE 1', 'NUIT', 'PEINTURE']
const MACHINES = ['Z27575', 'X76605', 'X76611']

describe('globalIndicators', () => {
  it('counts like the headline formulas of the workbook', () => {
    expect(globalIndicators(DATA)).toEqual({
      totalAnomalies: 8, // NBVAL(A:A)-1: the fragmented rows have text in column A
      blocking: 4,
      major: 1,
      minor: 2,
      alertOver4Days: 4,
    })
  })

  it('only counts in the total the rows whose number is filled in', () => {
    expect(globalIndicators([anomaly('NUIT', 'X76605', 5, '')]).totalAnomalies).toBe(0)
  })
})

describe('summaryByTeam', () => {
  const teams = listTeams(DATA, TEAMS)
  const summary = summaryByTeam(DATA, teams)

  it('groups despite spaces and case', () => {
    expect(summary.rows.find((r) => r.key === 'MONTAGE 1')).toMatchObject({
      minor: 1,
      major: 1,
      blocking: 1,
      total: 3,
    })
    expect(summary.rows.find((r) => r.key === 'PEINTURE')).toMatchObject({ minor: 1, blocking: 1, total: 2 })
  })

  it('the total of a team is the sum of the three severities (an anomaly without priority is not in it)', () => {
    expect(summary.rows.find((r) => r.key === 'NUIT')?.total).toBe(0)
  })

  it('computes the « Total Général » and isolates the rows without a recognized team', () => {
    expect(summary.grandTotal).toEqual({ minor: 2, major: 1, blocking: 2, total: 5 })
    expect(summary.outsideSummary).toBe(2)
  })
})

describe('listTeams / listMachines', () => {
  it('keeps the configuration order and shows the teams without anomaly', () => {
    const teams = listTeams([], TEAMS)
    expect(teams.map((t) => t.label)).toEqual(TEAMS)
    expect(teams.map((t) => t.slug)).toEqual(['montage-1', 'nuit', 'peinture'])
  })

  it('adds automatically a team present in the data but absent from the configuration', () => {
    const teams = listTeams([...DATA, anomaly('Câblage', 'Z27575', 2)], TEAMS)
    expect(teams.map((t) => t.key)).toEqual(['MONTAGE 1', 'NUIT', 'PEINTURE', 'CABLAGE'])
  })

  it('discards values that cannot be a team name', () => {
    expect(listTeams(DATA, TEAMS).map((t) => t.key)).not.toContain('46275')
  })

  it('adds automatically a new trainset', () => {
    const machines = listMachines([anomaly('NUIT', 'Z99999', 1)], MACHINES)
    expect(machines.map((m) => m.key)).toEqual([...MACHINES, 'Z99999'])
  })
})

describe('teamAnalysis', () => {
  const machines = listMachines(DATA, MACHINES)

  it('crosses team, trainset and priority', () => {
    const analysis = teamAnalysis(DATA, 'MONTAGE 1', machines)
    expect(analysis.rows.map((r) => [r.label, r.minor, r.major, r.blocking, r.total])).toEqual([
      ['Z27575', 0, 0, 1, 1],
      ['X76605', 0, 0, 0, 0],
      ['X76611', 1, 1, 0, 2],
    ])
    expect(analysis.total).toEqual({ minor: 1, major: 1, blocking: 1, total: 3 })
  })

  it('reports the anomalies of the team without a recognized trainset', () => {
    const analysis = teamAnalysis([anomaly('NUIT', '', 5)], 'NUIT', machines)
    expect(analysis.total.total).toBe(0)
    expect(analysis.outsideTable).toBe(1)
  })
})
