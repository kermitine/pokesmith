import { getAbilityData } from "@data/ability-data"
import { getItemData } from "@data/item-data"
import { getMoveData } from "@data/move-data"
import { parseTeam, TeamSet, UsageSummary } from "./team-analysis"

export function applyCommonSet(enemy: TeamSet, summary: UsageSummary): TeamSet {
  const knownSet = enemy.knownSet ?? { ability: enemy.ability, item: enemy.item, moves: enemy.moves }
  const commonMoves = summary.moves.flatMap(choice => {
    const move = getMoveData(choice.name)
    return move ? [move.name] : []
  })
  const moves = knownSet.moves.length ? knownSet.moves : [...new Set(commonMoves)].slice(0, 4)
  if (!moves.length) throw new Error(`No supported common moves are available for ${enemy.species}. Enter its moves manually.`)
  const ability = knownSet.ability || summary.abilities.find(choice => getAbilityData(choice.name))?.name || ""
  const item = knownSet.item || summary.items.find(choice => getItemData(choice.name))?.name || ""
  const set = parseTeam(`${enemy.species}${item ? ` @ ${item}` : ""}\n${ability ? `Ability: ${ability}\n` : ""}${enemy.teraType ? `Tera Type: ${enemy.teraType}\n` : ""}${moves.map(move => `- ${move}`).join("\n")}`)[0]
  const estimated = !knownSet.moves.length || (!knownSet.ability && !!ability) || (!knownSet.item && !!item)
  return { ...set, original: enemy.original, estimated, knownSet: estimated ? knownSet : undefined }
}

export function restoreKnownSet(enemy: TeamSet): TeamSet {
  return enemy.estimated && enemy.knownSet ? { ...enemy, ...enemy.knownSet, estimated: false, knownSet: undefined } : enemy
}

export function editOpponentSet(enemy: TeamSet, field: "ability" | "item" | "moves", value: string): TeamSet {
  const moves =
    field === "moves"
      ? value
          .split(",")
          .map(name => name.trim())
          .filter(Boolean)
      : enemy.moves
  if (moves.length > 4) throw new Error("Choose up to four moves per opponent.")
  const ability = field === "ability" ? value.trim() : enemy.ability
  const item = field === "item" ? value.trim() : enemy.item
  const updated = parseTeam(`${enemy.species}${item ? ` @ ${item}` : ""}\n${ability ? `Ability: ${ability}\n` : ""}${enemy.teraType ? `Tera Type: ${enemy.teraType}\n` : ""}${moves.map(move => `- ${move}`).join("\n")}`)[0]
  const knownSet = { ...(enemy.knownSet ?? { ability: enemy.ability, item: enemy.item, moves: enemy.moves }), [field]: updated[field] }
  const estimated = (!knownSet.ability && !!updated.ability) || (!knownSet.item && !!updated.item) || (!knownSet.moves.length && !!updated.moves.length)
  return { ...updated, original: enemy.original, estimated, knownSet: estimated ? knownSet : undefined }
}
