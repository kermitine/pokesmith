import { getPokemonData, POKEMON_DATA } from "@data/pokemon-data"
import { getMoveData } from "@data/move-data"
import { getAbilityData } from "@data/ability-data"
import { getItemData } from "@data/item-data"
import { PokemonType, PokemonTypes } from "@multicalc/types"
import { AbilityName, TypeChart } from "@multicalc/type-calc/type-chart"
import { parseShowdownText } from "@store/user-data/showdown-text-parser"

export interface TeamSet {
  species: string
  types: PokemonType[]
  ability: string
  item: string
  teraType: string
  moves: string[]
  original: string
  notes: string[]
  estimated?: boolean
  knownSet?: { ability: string; item: string; moves: string[] }
}

export interface Matchup {
  type: PokemonType
  multiplier: number
}
export interface AnalysisOptions {
  tera?: boolean
  weather?: string
}
export interface MoveCoverage {
  name: string
  type: string
  category: string
  targets: PokemonType[]
  note: string
}
export interface UsageChoice {
  name: string
  percent: number
}
export interface UsageSummary {
  moves: UsageChoice[]
  abilities: UsageChoice[]
  items: UsageChoice[]
  month: string
  format: string
  rating: string
}

const chart = new TypeChart()
const speciesNames = new Map(Object.values(POKEMON_DATA).map(p => [id(p.name), p.name]))
const bypassAbilities = ["Mold Breaker", "Teravolt", "Turboblaze"]
const fixedDamageMoves = new Set(["Seismic Toss", "Night Shade", "Dragon Rage", "Sonic Boom", "Super Fang", "Nature's Madness", "Ruination", "Endeavor", "Final Gambit", "Fissure", "Guillotine", "Horn Drill", "Sheer Cold"])
const ateTypes: Record<string, PokemonType> = { Pixilate: "Fairy", Aerilate: "Flying", Refrigerate: "Ice", Galvanize: "Electric" }

export function id(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function resolveSpecies(value: string): string | undefined {
  return speciesNames.get(id(value))
}
export const ALL_SPECIES = Object.values(POKEMON_DATA)
  .map(p => p.name)
  .sort((a, b) => a.localeCompare(b))
export const ALL_TYPES = PokemonTypes

export function parseTeam(text: string): TeamSet[] {
  if (!text.trim()) throw new Error("Paste a Showdown team first.")
  if ((text.match(/^===.*===$/gm) ?? []).length > 1) throw new Error("Import one Showdown team at a time.")
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    if ((block.match(/^\s*[-~]\s+\S/gm) ?? []).length > 4) throw new Error("Each Pokémon can have up to four moves.")
  }
  const parsed = parseShowdownText(text)
  if (!parsed.pokemon.length) throw new Error("No Pokémon found. Paste the text from Showdown’s Import/Export screen.")
  if (parsed.pokemon.length > 6) throw new Error("A team can contain up to six Pokémon. Import one team at a time.")
  return parsed.pokemon.map(set => {
    const species = resolveSpecies(set.species)
    if (!species) throw new Error(`Unknown Pokémon: ${set.species}. Check its species or form name.`)
    const data = getPokemonData(species)!
    const ability = set.ability ? getAbilityData(set.ability)?.name : ""
    const item = set.item ? getItemData(set.item)?.name : ""
    if (set.ability && !ability) throw new Error(`Unknown ability for ${species}: ${set.ability}.`)
    if (set.item && !item) throw new Error(`Unknown item for ${species}: ${set.item}.`)
    const teraType = [...PokemonTypes, "Stellar"].find(type => id(type) === id(set.teraType ?? "")) ?? ""
    if (set.teraType && !teraType) throw new Error(`Unknown Tera type for ${species}: ${set.teraType}.`)
    const moves = set.moves.map(name => {
      const move = getMoveData(name)
      if (!move) throw new Error(`Unknown move for ${species}: ${name}.`)
      return move.name
    })
    const notes: string[] = []
    if (!ability) notes.push("No ability supplied; defensive ability effects are unknown.")
    if (!moves.length) notes.push("No moves supplied; offensive coverage is unknown.")
    return { species, types: data.types as PokemonType[], ability: ability ?? "", item: item ?? "", teraType, moves, original: text, notes }
  })
}

export function parseOpponents(text: string): TeamSet[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const isPaste = /^(?:[-~]\s|Ability:|Tera Type:|EVs:|IVs:|Level:)/im.test(trimmed) || trimmed.includes("@")
  return parseTeam(
    isPaste
      ? trimmed
      : trimmed
          .split(/[,\n\r]+/)
          .map(x => x.trim())
          .filter(Boolean)
          .join("\n\n")
  )
}

export function effectiveTypes(set: TeamSet, tera = false): PokemonType[] {
  return tera && set.teraType && set.teraType !== "Stellar" ? [set.teraType as PokemonType] : set.types
}

export function defensiveMultiplier(type: PokemonType, target: TeamSet, options: AnalysisOptions = {}, attackerAbility = "", moveName = ""): number {
  const types = effectiveTypes(target, options.tera)
  const bypass = bypassAbilities.includes(attackerAbility) || ["Sunsteel Strike", "Moongeist Beam", "Photon Geyser"].includes(moveName)
  const ability = bypass && target.ability !== "Prism Armor" ? "" : target.ability
  let result = chart.getEffectiveness(
    type,
    types[0],
    types[1],
    ability as AbilityName,
    { ability: ability as AbilityName, item: target.item },
    {
      moveName,
      ignoresGhostImmunity: ["Scrappy", "Mind's Eye"].includes(attackerAbility)
    }
  ) as number
  if (type === "Ground" && target.item === "Iron Ball" && ability !== "Klutz" && types.includes("Flying")) {
    result = types.filter(t => t !== "Flying").reduce((value, t) => value * chart.getEffectiveness(type, t), 1)
  }
  if (ability === "Thick Fat" && ["Fire", "Ice"].includes(type)) result *= 0.5
  if (["Heatproof", "Water Bubble"].includes(ability) && type === "Fire") result *= 0.5
  if (ability === "Fluffy" && type === "Fire") result *= 2
  if (ability === "Purifying Salt" && type === "Ghost") result *= 0.5
  if (ability === "Dry Skin" && type === "Fire") result *= 1.25
  if (["Filter", "Solid Rock", "Prism Armor"].includes(ability) && result > 1) result *= 0.75
  return result
}

export function defense(set: TeamSet, options: AnalysisOptions = {}): Matchup[] {
  return PokemonTypes.map(type => ({ type, multiplier: defensiveMultiplier(type, set, options) }))
}

export function moveType(set: TeamSet, name: string, options: AnalysisOptions = {}): string {
  const data = getMoveData(name)!
  if (name === "Tera Blast" && options.tera && set.teraType) return set.teraType
  if (name === "Weather Ball") return ({ Sun: "Fire", Rain: "Water", Snow: "Ice", Sand: "Rock" } as Record<string, string>)[options.weather ?? ""] ?? "Normal"
  if (name === "Ivy Cudgel") return set.species.includes("Wellspring") ? "Water" : set.species.includes("Hearthflame") ? "Fire" : set.species.includes("Cornerstone") ? "Rock" : "Grass"
  if (name === "Revelation Dance") return effectiveTypes(set, options.tera)[0]
  if (name === "Judgment") {
    const plates: Record<string, string> = {
      Flame: "Fire",
      Splash: "Water",
      Zap: "Electric",
      Meadow: "Grass",
      Icicle: "Ice",
      Fist: "Fighting",
      Toxic: "Poison",
      Earth: "Ground",
      Sky: "Flying",
      Mind: "Psychic",
      Insect: "Bug",
      Stone: "Rock",
      Spooky: "Ghost",
      Draco: "Dragon",
      Dread: "Dark",
      Iron: "Steel",
      Pixie: "Fairy"
    }
    if (set.item.endsWith(" Plate")) return plates[set.item.split(" ")[0]] ?? data.type
  }
  if (set.ability === "Normalize") return "Normal"
  if (set.ability === "Liquid Voice" && data.flags.sound) return "Water"
  if (data.type === "Normal") return ateTypes[set.ability] ?? data.type
  return data.type
}

export function moveMultiplier(attacker: TeamSet, move: string, target: TeamSet, options: AnalysisOptions = {}, targetTera = false): number | null {
  const data = getMoveData(move)!
  if (data.category === "Status" || fixedDamageMoves.has(move)) return null
  if (!bypassAbilities.includes(attacker.ability)) {
    if (target.ability === "Soundproof" && data.flags.sound) return 0
    if (target.ability === "Bulletproof" && data.flags.bullet) return 0
  }
  const type = moveType(attacker, move, options)
  if (type === "Stellar") return targetTera ? 2 : 1
  if (!PokemonTypes.includes(type as PokemonType)) return null
  let value = defensiveMultiplier(type as PokemonType, target, { tera: targetTera }, attacker.ability, move)
  if (!bypassAbilities.includes(attacker.ability)) {
    if (target.ability === "Fluffy" && data.flags.contact) value *= 0.5
    if (target.ability === "Punk Rock" && data.flags.sound) value *= 0.5
  }
  if (move === "Flying Press") return value * defensiveMultiplier("Flying", { ...target, ability: "", item: "" }, { tera: targetTera })
  return value
}

export function moveCoverage(set: TeamSet, options: AnalysisOptions = {}): MoveCoverage[] {
  return set.moves.map(name => {
    const data = getMoveData(name)!
    const isFixed = fixedDamageMoves.has(name)
    return {
      name,
      type: moveType(set, name, options),
      category: data.category ?? "Status",
      targets: PokemonTypes.filter(type => (moveMultiplier(set, name, { species: type, types: [type], ability: "", item: "", teraType: "", moves: [], original: "", notes: [] }, options) ?? 0) > 1),
      note:
        data.category === "Status"
          ? "Status move · no damaging coverage"
          : isFixed
            ? "Fixed or special damage · not super-effective coverage"
            : name === "Weather Ball" && !options.weather
              ? "Normal without weather"
              : name === "Tera Blast" && !options.tera
                ? "Normal until Terastallized"
                : ""
    }
  })
}

export function coveredSpecies(set: TeamSet, options: AnalysisOptions = {}): { name: string; types: PokemonType[]; moves: { name: string; multiplier: number }[] }[] {
  return Object.values(POKEMON_DATA)
    .flatMap(data => {
      const target: TeamSet = { species: data.name, types: data.types as PokemonType[], ability: "", item: "", teraType: "", moves: [], original: "", notes: [] }
      const moves = set.moves.map(name => ({ name, multiplier: moveMultiplier(set, name, target, options) ?? 0 })).filter(m => m.multiplier > 1)
      return moves.length ? [{ name: data.name, types: target.types, moves }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function normalizeUsage(payload: unknown): UsageSummary {
  if (!payload || typeof payload !== "object") throw new Error("Invalid usage response.")
  const data = payload as Record<string, unknown>
  const choices = (value: unknown): UsageChoice[] =>
    Array.isArray(value)
      ? value.flatMap(row => {
          if (!Array.isArray(row) || typeof row[0] !== "string") return []
          const percent = Number(row[1])
          return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? [{ name: row[0], percent }] : []
        })
      : []
  return { moves: choices(data["moves_list"]), abilities: choices(data["abilities_list"]), items: choices(data["items_list"]), month: String(data["month"] ?? ""), format: String(data["format"] ?? ""), rating: String(data["rating"] ?? "") }
}

export function defensiveFits(team: TeamSet[], opponents: TeamSet[], options: AnalysisOptions = {}): { set: TeamSet; worst: number; checks: { species: string; move: string; multiplier: number }[]; unknown: boolean }[] {
  return team
    .map(set => {
      const checks = opponents.flatMap(enemy =>
        enemy.moves.flatMap(move => {
          const multiplier = moveMultiplier(enemy, move, set, { weather: options.weather })
          return multiplier === null ? [] : [{ species: enemy.species, move, multiplier }]
        })
      )
      checks.sort((a, b) => b.multiplier - a.multiplier)
      return { set, checks, worst: checks.length ? Math.max(...checks.map(x => x.multiplier)) : Infinity, unknown: opponents.some(p => !p.moves.length || p.estimated) }
    })
    .sort((a, b) => a.worst - b.worst || a.checks.filter(x => x.multiplier >= 1).length - b.checks.filter(x => x.multiplier >= 1).length)
}

export function multiplierLabel(value: number): string {
  return value === 0 ? "Immune" : `${Number(value.toFixed(3))}×`
}

export const EXAMPLE_TEAM = `Incineroar @ Safety Goggles
Ability: Intimidate
Tera Type: Grass
EVs: 252 HP / 100 Def / 156 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot

Rillaboom @ Assault Vest
Ability: Grassy Surge
Tera Type: Fire
EVs: 252 HP / 196 Atk / 60 SpD
Adamant Nature
- Grassy Glide
- Wood Hammer
- U-turn
- High Horsepower

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Icy Wind
- Protect

Urshifu-Rapid-Strike @ Mystic Water
Ability: Unseen Fist
Tera Type: Water
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Surging Strikes
- Close Combat
- Aqua Jet
- Detect

Landorus-Therian @ Choice Scarf
Ability: Intimidate
Tera Type: Flying
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Rock Slide
- U-turn
- Tera Blast

Amoonguss @ Rocky Helmet
Ability: Regenerator
Tera Type: Water
EVs: 252 HP / 156 Def / 100 SpD
Relaxed Nature
- Spore
- Rage Powder
- Pollen Puff
- Protect`
