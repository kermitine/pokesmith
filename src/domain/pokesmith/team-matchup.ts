import { AnalysisOptions, moveMultiplier, TeamSet } from "./team-analysis"

export interface MatchupMove {
  name: string
  multiplier: number
}

export interface MatchupCell {
  state: "known" | "unknown" | "no-damage"
  best: number | null
  moves: MatchupMove[]
  highlights: MatchupMove[]
}

export interface TeamMatchupRow {
  pokemon: TeamSet
  outgoing: MatchupCell[]
  incoming: MatchupCell[]
}

export function matchupCell(attacker: TeamSet, target: TeamSet, options: AnalysisOptions = {}, targetTera = false): MatchupCell {
  const moves = attacker.moves
    .flatMap(name => {
      const multiplier = moveMultiplier(attacker, name, target, options, targetTera)
      return multiplier === null ? [] : [{ name, multiplier }]
    })
    .sort((a, b) => b.multiplier - a.multiplier)
  const best = moves.length ? moves[0].multiplier : null
  return {
    state: moves.length ? "known" : attacker.moves.length ? "no-damage" : "unknown",
    best,
    moves,
    highlights: moves.filter(move => best !== null && (best > 1 ? move.multiplier > 1 : move.multiplier === best))
  }
}

export function teamMatchups(team: TeamSet[], opponents: TeamSet[], options: { teraIndex?: number; weather?: string } = {}): TeamMatchupRow[] {
  return team.map((pokemon, index) => ({
    pokemon,
    outgoing: opponents.map(enemy => matchupCell(pokemon, enemy, { tera: options.teraIndex === index, weather: options.weather })),
    incoming: opponents.map(enemy => matchupCell(enemy, pokemon, { weather: options.weather }, options.teraIndex === index))
  }))
}
