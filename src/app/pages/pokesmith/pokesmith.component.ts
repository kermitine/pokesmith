import { afterNextRender, Component, computed, signal } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import { getPokemonData } from "@data/pokemon-data"
import { getAbilityData } from "@data/ability-data"
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
  moveMultiplier,
  multiplierLabel,
  normalizeUsage,
  parseOpponents,
  parseTeam,
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
  pasteText = ""
  enemyText = ""
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
  formats = signal<UsageFormat[]>([])
  selectedFormat = signal("")
  month = signal("")
  rating = signal("1630")
  private metaLoaded = false
  private enemyRevision = 0

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
  bestAgainst(enemy: TeamSet): { name: string; value: number }[] {
    return (this.current()?.moves ?? []).map(name => ({ name, value: moveMultiplier(this.current()!, name, enemy, this.options()) ?? -1 })).filter(move => move.value > 1)
  }
  showTab(tab: "overview" | "coverage" | "opponents"): void {
    this.tab.set(tab)
    if (tab === "opponents") void this.loadMeta()
  }

  importEnemies(): void {
    try {
      this.enemies.set(parseOpponents(this.enemyText))
      this.enemyRevision++
      this.enemyError.set("")
      this.usageError.set("")
    } catch (error) {
      this.enemyError.set(error instanceof Error ? error.message : "Check the opponent names.")
    }
  }
  abilities(name: string): string[] {
    return [...(getPokemonData(name)?.abilities ?? [])]
  }
  editEnemy(index: number, field: "ability" | "moves", value: string): void {
    try {
      const current = this.enemies()[index]
      const updated =
        field === "moves"
          ? parseTeam(
              `${current.species}${current.item ? ` @ ${current.item}` : ""}\n${current.ability ? `Ability: ${current.ability}\n` : ""}${value
                .split(",")
                .map(x => x.trim())
                .filter(Boolean)
                .map(move => `- ${move}`)
                .join("\n")}`
            )[0]
          : { ...current, ability: value }
      if (field === "moves" && value.split(",").filter(x => x.trim()).length > 4) throw new Error("Choose up to four moves per opponent.")
      this.enemies.update(enemies => enemies.map((enemy, i) => (i === index ? { ...updated, estimated: false } : enemy)))
      this.enemyRevision++
      this.enemyError.set("")
    } catch (error) {
      this.enemyError.set(error instanceof Error ? error.message : "Check the move names.")
    }
  }

  async loadMeta(): Promise<void> {
    if (this.metaLoaded) return
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
    } catch (error) {
      this.usageError.set(error instanceof Error ? error.message : "Unable to load usage formats.")
    }
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
    this.enemyRevision++
    this.enemies.update(enemies => enemies.map(enemy => (enemy.estimated && enemy.knownSet ? { ...enemy, ...enemy.knownSet, estimated: false, knownSet: undefined } : enemy)))
  }

  async estimate(index: number): Promise<void> {
    const enemy = this.enemies()[index]
    const revision = this.enemyRevision
    if (this.usageLoading().includes(enemy.species)) return
    this.usageLoading.update(values => [...values, enemy.species])
    this.usageError.set("")
    try {
      await this.loadMeta()
      if (revision !== this.enemyRevision) return
      const format = this.selectedFormat()
      const month = this.month()
      const rating = this.rating()
      if (!format) throw new Error("Choose an available usage format first.")
      const query = new URLSearchParams({ species: enemy.species, format, month, rating })
      const response = await fetch(`/api/usage/pokemon?${query}`)
      if (!response.ok) throw new Error(`No usage data for ${enemy.species} in this format. Enter known moves manually.`)
      const summary = normalizeUsage(await response.json())
      if (revision !== this.enemyRevision || format !== this.selectedFormat() || rating !== this.rating()) return
      this.usage.update(values => ({ ...values, [enemy.species]: summary }))
      if (!enemy.moves.length || enemy.estimated) {
        const moveNames = summary.moves.slice(0, 4).map(x => x.name)
        const knownSet = enemy.knownSet ?? { ability: enemy.ability, item: enemy.item, moves: enemy.moves }
        const ability = knownSet.ability || summary.abilities.find(x => getAbilityData(x.name))?.name || ""
        const imported = parseTeam(`${enemy.species}\n${ability ? `Ability: ${ability}\n` : ""}${moveNames.map(move => `- ${move}`).join("\n")}`)[0]
        this.enemies.update(enemies => enemies.map((current, i) => (i === index ? { ...imported, item: enemy.item, estimated: true, knownSet } : current)))
      }
    } catch (error) {
      this.usageError.set(error instanceof Error ? error.message : "Could not load usage data.")
    } finally {
      this.usageLoading.update(values => values.filter(x => x !== enemy.species))
    }
  }
}
