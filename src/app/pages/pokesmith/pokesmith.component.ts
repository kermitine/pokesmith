import { afterNextRender, Component, computed, signal } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import { getPokemonData } from "@data/pokemon-data"
import { applyCommonSet, editOpponentSet, restoreKnownSet } from "../../../domain/pokesmith/opponent-scout"
import { MatchupCell, teamMatchups } from "../../../domain/pokesmith/team-matchup"
import {
  ALL_SPECIES,
  ALL_TYPES,
  coveredSpecies,
  defense,
  defensiveFits,
  effectiveTypes,
  EXAMPLE_TEAM,
  id,
  Matchup,
  moveCoverage,
  multiplierLabel,
  normalizeUsage,
  parseOpponents,
  parseTeam,
  resolveSpecies,
  TeamSet,
  UsageSummary
} from "../../../domain/pokesmith/team-analysis"

interface UsageFormat {
  code: string
  name: string
  ratings: string[]
}

@Component({
  selector: "app-pokesmith",
  imports: [FormsModule, RouterLink],
  templateUrl: "./pokesmith.component.html"
})
export class PokesmithComponent {
  readonly Infinity = Number.POSITIVE_INFINITY
  readonly types = ALL_TYPES
  readonly species = ALL_SPECIES
  readonly label = multiplierLabel
  readonly effectiveTypes = effectiveTypes
  readonly matchupDirections = [
    { incoming: false, title: "Your coverage", subtitle: "Your moves into each opposing Pokémon", id: "outgoing-title" },
    { incoming: true, title: "Their coverage against your team", subtitle: "Your weaknesses to their common or supplied moves", id: "incoming-title" }
  ]
  pasteText = ""
  enemyText = ""
  opponentName = ""
  search = signal("")
  team = signal<TeamSet[]>([])
  enemies = signal<TeamSet[]>([])
  selected = signal(0)
  tab = signal<"overview" | "coverage" | "opponents">("overview")
  error = signal("")
  enemyError = signal("")
  notice = signal("")
  teraIndex = signal(-1)
  weather = signal("")
  excluded = signal<number[]>([])
  usage = signal<Record<string, UsageSummary>>({})
  usageLoading = signal<string[]>([])
  usageError = signal("")
  usageErrors = signal<Record<string, string>>({})
  scouting = signal(false)
  showAllMoves = signal(false)
  formats = signal<UsageFormat[]>([])
  selectedFormat = signal("")
  month = signal("")
  rating = signal("1630")
  private metaLoaded = false
  private metaRequest?: Promise<void>
  private pendingUsage = new Map<string, symbol>()
  private scoutRequest = 0

  current = computed(() => this.team()[this.selected()])
  options = computed(() => ({ tera: this.teraIndex() === this.selected(), weather: this.weather() }))
  defensive = computed(() => (this.current() ? defense(this.current()!, this.options()) : []))
  weaknesses = computed(() => this.defensive().filter(x => x.multiplier > 1))
  resistances = computed(() => this.defensive().filter(x => x.multiplier > 0 && x.multiplier < 1))
  immunities = computed(() => this.defensive().filter(x => x.multiplier === 0))
  moves = computed(() => (this.current() ? moveCoverage(this.current()!, this.options()) : []))
  coveredTypes = computed(() => [...new Set(this.moves().flatMap(move => move.targets))])
  targets = computed(() => (this.current() ? coveredSpecies(this.current()!, this.options()) : []))
  filteredTargets = computed(() =>
    this.targets()
      .filter(target => id(target.name).includes(id(this.search())))
      .slice(0, 48)
  )
  teamDefense = computed(() => this.team().map((set, index) => defense(set, { tera: this.teraIndex() === index })))
  gaps = computed(() =>
    this.types
      .map(type => {
        const rows = this.teamDefense().map(row => row.find(x => x.type === type)!)
        return { type, weak: rows.filter(x => x.multiplier > 1).length, answers: rows.filter(x => x.multiplier < 1).length }
      })
      .filter(x => x.weak > 0 && x.answers === 0)
  )
  fits = computed(() =>
    defensiveFits(
      this.team().flatMap((set, index) => (this.excluded().includes(index) ? [] : [{ ...set, types: effectiveTypes(set, this.teraIndex() === index) }])),
      this.enemies(),
      { weather: this.weather() }
    )
  )
  activeRatings = computed(() => this.formats().find(f => f.code === this.selectedFormat())?.ratings ?? ["0", "1500", "1630", "1760"])
  matchupRows = computed(() => teamMatchups(this.team(), this.enemies(), { teraIndex: this.teraIndex(), weather: this.weather() }))
  coveredOpponents = computed(() => this.enemies().filter((_, index) => this.matchupRows().some(row => (row.outgoing[index].best ?? 0) > 1)).length)
  threatenedMembers = computed(() => this.matchupRows().filter(row => row.incoming.some(cell => (cell.best ?? 0) > 1)).length)
  knownOpponents = computed(() => this.enemies().filter(enemy => enemy.moves.length > 0).length)

  constructor() {
    afterNextRender(() => {
      try {
        const saved = localStorage.getItem("pokesmith-team-v1")
        if (saved) {
          this.pasteText = saved
          this.team.set(parseTeam(saved))
          this.notice.set("Restored your last imported team.")
        }
      } catch {
        /* Storage can be disabled; analysis still works. */
      }
    })
  }

  analyze(): void {
    try {
      const team = parseTeam(this.pasteText)
      this.team.set(team)
      this.selected.set(0)
      this.teraIndex.set(-1)
      this.excluded.set([])
      this.search.set("")
      this.error.set("")
      this.notice.set(`Imported ${team.length} Pokémon. Select a team member to explore its matchups.`)
      try {
        localStorage.setItem("pokesmith-team-v1", this.pasteText)
      } catch {
        /* Optional persistence. */
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Could not import that team.")
    }
  }

  example(): void {
    this.pasteText = EXAMPLE_TEAM
    this.analyze()
  }
  clear(): void {
    this.pasteText = ""
    this.team.set([])
    this.error.set("")
    this.notice.set("")
    this.teraIndex.set(-1)
    this.selected.set(0)
    this.excluded.set([])
    try {
      localStorage.removeItem("pokesmith-team-v1")
    } catch {
      /* Optional persistence. */
    }
  }
  select(index: number): void {
    this.selected.set(index)
    this.search.set("")
  }
  toggleTera(): void {
    this.teraIndex.set(this.teraIndex() === this.selected() ? -1 : this.selected())
  }
  toggleExcluded(index: number): void {
    this.excluded.update(values => (values.includes(index) ? values.filter(v => v !== index) : [...values, index]))
  }
  sprite(name: string): string {
    return `assets/sprites/pokemon-home/${encodeURIComponent(name === "Type: Null" ? "Type-Null" : name)}.webp`
  }
  badge(type: string): string {
    return `type-${type.toLowerCase()}`
  }
  cellClass(value: number): string {
    return value === 0 ? "immune-cell" : value < 1 ? "resist-cell" : value > 1 ? "weak-cell" : "neutral-cell"
  }
  valueAt(index: number, type: string): Matchup {
    return this.teamDefense()[index].find(x => x.type === type)!
  }
  matchupClass(cell: MatchupCell, incoming: boolean): string {
    if (cell.best === null) return "matchup-unknown"
    if (incoming) return this.cellClass(cell.best)
    return cell.best > 1 ? "coverage-good" : cell.best === 1 ? "coverage-neutral" : "coverage-poor"
  }
  visibleMoves(cell: MatchupCell) {
    return this.showAllMoves() ? cell.moves : cell.highlights.slice(0, 2)
  }
  cellDescription(cell: MatchupCell): string {
    return cell.state === "unknown" ? "Moves unknown" : cell.state === "no-damage" ? "No ordinary damaging moves" : cell.moves.map(move => `${move.name}: ${multiplierLabel(move.multiplier)}`).join("; ")
  }
  showTab(tab: "overview" | "coverage" | "opponents"): void {
    this.tab.set(tab)
    if (tab === "opponents") void this.loadMeta()
  }

  async importEnemies(): Promise<void> {
    try {
      const enemies = parseOpponents(this.enemyText)
      if (new Set(enemies.map(enemy => enemy.species)).size !== enemies.length) throw new Error("Each opponent is already represented once. Remove duplicate species names.")
      this.pendingUsage.clear()
      this.usageLoading.set([])
      this.usage.set({})
      this.usageErrors.set({})
      this.enemies.set(enemies)
      this.enemyError.set("")
      this.usageError.set("")
      await this.scoutTeam()
    } catch (error) {
      this.enemyError.set(error instanceof Error ? error.message : "Check the opponent names.")
    }
  }
  addOpponent(): void {
    try {
      if (this.enemies().length >= 6) throw new Error("The opposing team already has six Pokémon.")
      const species = resolveSpecies(this.opponentName.trim())
      if (!species) throw new Error("Choose a Pokémon name or form from the suggestions.")
      if (this.enemies().some(enemy => enemy.species === species)) throw new Error(`${species} is already on the opposing team.`)
      this.enemies.update(enemies => [...enemies, parseTeam(species)[0]])
      this.opponentName = ""
      this.enemyError.set("")
      void this.estimate(this.enemies().length - 1)
    } catch (error) {
      this.enemyError.set(error instanceof Error ? error.message : "Check the opponent name.")
    }
  }
  removeOpponent(index: number): void {
    const species = this.enemies()[index].species
    this.enemies.update(enemies => enemies.filter((_, i) => i !== index))
    this.pendingUsage.delete(species)
    this.usageLoading.update(values => values.filter(name => name !== species))
    this.usageErrors.update(errors => {
      const next = { ...errors }
      delete next[species]
      return next
    })
  }
  clearOpponents(): void {
    this.enemies.set([])
    this.enemyText = ""
    this.opponentName = ""
    this.pendingUsage.clear()
    this.usageLoading.set([])
    this.usageErrors.set({})
    this.usage.set({})
    this.enemyError.set("")
    this.scoutRequest++
    this.scouting.set(false)
  }
  exampleOpponents(): void {
    this.enemyText = "Incineroar, Rillaboom, Garchomp, Milotic, Rotom-Wash, Sneasler"
    void this.importEnemies()
  }
  async scoutTeam(): Promise<void> {
    if (!this.enemies().length) return
    const request = ++this.scoutRequest
    this.scouting.set(true)
    const queue = [...this.enemies()]
    try {
      await this.loadMeta()
      if (!this.selectedFormat()) return
      let next = 0
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (next < queue.length) {
            if (request !== this.scoutRequest) return
            const enemy = queue[next++]
            const index = this.enemies().indexOf(enemy)
            if (index >= 0) await this.estimate(index)
          }
        })
      )
    } finally {
      if (request === this.scoutRequest) this.scouting.set(false)
    }
  }
  abilities(name: string): string[] {
    return [...(getPokemonData(name)?.abilities ?? [])]
  }
  editEnemy(index: number, field: "ability" | "moves" | "item", value: string): void {
    try {
      const current = this.enemies()[index]
      const updated = editOpponentSet(current, field, value)
      this.enemies.update(enemies => enemies.map((enemy, i) => (i === index ? updated : enemy)))
      this.usageErrors.update(errors => {
        const next = { ...errors }
        delete next[current.species]
        return next
      })
      this.enemyError.set("")
    } catch (error) {
      this.enemyError.set(error instanceof Error ? error.message : "Check the move names.")
    }
  }

  async loadMeta(): Promise<void> {
    if (this.metaLoaded) return
    if (this.metaRequest) return this.metaRequest
    this.metaRequest = (async () => {
      try {
        const response = await fetch("/api/usage/meta")
        if (!response.ok) throw new Error("Usage data is unavailable. Manual opponent entry still works.")
        const data = await response.json()
        const rows = (data.formats ?? []).flatMap((group: { entries: UsageFormat[] }) => group.entries ?? []) as UsageFormat[]
        const formats = rows.filter(row => row.code.includes("vgc") && row.ratings?.length)
        this.formats.set(formats)
        this.selectedFormat.set(formats.some(row => row.code === data.default_format) ? data.default_format : (formats[0]?.code ?? ""))
        this.month.set(data.default_month ?? "")
        this.metaLoaded = true
        this.usageError.set("")
      } catch (error) {
        this.usageError.set(error instanceof Error ? error.message : "Unable to load usage formats.")
      }
    })().finally(() => {
      this.metaRequest = undefined
    })
    return this.metaRequest
  }

  changeFormat(value: string): void {
    this.selectedFormat.set(value)
    if (!this.activeRatings().includes(this.rating())) this.rating.set(this.activeRatings()[0] ?? "0")
    this.resetEstimates()
  }

  changeRating(value: string): void {
    this.rating.set(value)
    this.resetEstimates()
  }

  private resetEstimates(): void {
    this.usage.set({})
    this.pendingUsage.clear()
    this.usageLoading.set([])
    this.usageErrors.set({})
    this.enemies.update(enemies => enemies.map(restoreKnownSet))
    this.scoutRequest++
    this.scouting.set(false)
  }

  async estimate(index: number): Promise<void> {
    const enemy = this.enemies()[index]
    if (!enemy) return
    if (this.usageLoading().includes(enemy.species)) return
    this.usageLoading.update(values => [...values, enemy.species])
    const token = Symbol()
    this.pendingUsage.set(enemy.species, token)
    this.usageErrors.update(errors => {
      const next = { ...errors }
      delete next[enemy.species]
      return next
    })
    try {
      await this.loadMeta()
      if (!this.enemies().includes(enemy) || this.pendingUsage.get(enemy.species) !== token) return
      const format = this.selectedFormat()
      const month = this.month()
      const rating = this.rating()
      if (!format) throw new Error("Choose an available usage format first.")
      const query = new URLSearchParams({ species: enemy.species, format, month, rating })
      const response = await fetch(`/api/usage/pokemon?${query}`)
      if (!response.ok) throw new Error(`No usage data for ${enemy.species} in this format. Enter known moves manually.`)
      const summary = normalizeUsage(await response.json())
      if (!this.enemies().includes(enemy) || this.pendingUsage.get(enemy.species) !== token || format !== this.selectedFormat() || rating !== this.rating()) return
      this.usage.update(values => ({ ...values, [enemy.species]: summary }))
      const estimated = applyCommonSet(enemy, summary)
      this.enemies.update(enemies => enemies.map(current => (current === enemy ? estimated : current)))
    } catch (error) {
      if (this.enemies().includes(enemy) && this.pendingUsage.get(enemy.species) === token) this.usageErrors.update(errors => ({ ...errors, [enemy.species]: error instanceof Error ? error.message : "Could not load usage data." }))
    } finally {
      if (this.pendingUsage.get(enemy.species) === token) {
        this.pendingUsage.delete(enemy.species)
        this.usageLoading.update(values => values.filter(x => x !== enemy.species))
      }
    }
  }
}
