import { parseOpponents, parseTeam, EXAMPLE_TEAM, normalizeUsage } from "./team-analysis"
import { matchupCell, teamMatchups } from "./team-matchup"
import { applyCommonSet, editOpponentSet, restoreKnownSet } from "./opponent-scout"

describe("whole-team matchup grids", () => {
  it("compares every one of six team members with every opponent in both directions", () => {
    const team = parseTeam(EXAMPLE_TEAM)
    const enemies = parseOpponents("Incineroar / Rillaboom / Garchomp / Milotic / Rotom-Wash / Sneasler")
    const grid = teamMatchups(team, enemies)
    expect(grid.map(row => row.pokemon.species)).toEqual(team.map(set => set.species))
    expect(grid).toHaveLength(6)
    expect(grid.every(row => row.outgoing.length === 6 && row.incoming.length === 6)).toBe(true)
    expect(grid.every(row => row.incoming.every(cell => cell.state === "unknown" && cell.best === null))).toBe(true)
  })
  it("reports all effective moves and the strongest actual dual-type matchup", () => {
    const attacker = parseTeam("Iron Bundle\n- Freeze-Dry\n- Hydro Pump\n- Protect")[0]
    const target = parseTeam("Gastrodon")[0]
    const cell = matchupCell(attacker, target)
    expect(cell.best).toBe(4)
    expect(cell.highlights).toEqual([{ name: "Freeze-Dry", multiplier: 4 }])
    expect(cell.moves).toContainEqual({ name: "Hydro Pump", multiplier: 1 })
    expect(cell.moves.some(move => move.name === "Protect")).toBe(false)
  })
  it("uses the opponent's ability and item for outgoing coverage", () => {
    const team = parseTeam("Garchomp\n- Earthquake\n- Dragon Claw")
    const enemies = parseOpponents("Rotom-Wash\nAbility: Levitate\n\nHeatran @ Air Balloon")
    const row = teamMatchups(team, enemies)[0]
    expect(row.outgoing[0].moves.find(move => move.name === "Earthquake")!.multiplier).toBe(0)
    expect(row.outgoing[1].moves.find(move => move.name === "Earthquake")!.multiplier).toBe(0)
  })
  it("shows opposing coverage moves against every member, including immunities", () => {
    const team = parseTeam("Garchomp\n\nRotom-Wash\nAbility: Levitate\n\nScizor")
    const foes = parseOpponents("Incineroar\n- Flare Blitz\n- Parting Shot\n\nGarchomp\n- Earthquake")
    const grid = teamMatchups(team, foes)
    expect(grid[2].incoming[0].best).toBe(4)
    expect(grid[1].incoming[1].best).toBe(0)
    expect(grid[0].incoming[1].best).toBe(1)
  })
  it("distinguishes unknown moves from a known status-only set", () => {
    const target = parseTeam("Garchomp")[0]
    expect(matchupCell(parseTeam("Amoonguss")[0], target).state).toBe("unknown")
    expect(matchupCell(parseTeam("Amoonguss\n- Spore\n- Rage Powder")[0], target).state).toBe("no-damage")
  })
  it("applies one member's Tera preview to both offense and defense without changing other rows", () => {
    const team = parseTeam("Garchomp\nTera Type: Steel\n- Tera Blast\n\nDragonite\n- Dragon Claw")
    const enemies = parseOpponents("Sylveon\n- Moonblast\n\nIron Bundle\n- Ice Beam")
    const base = teamMatchups(team, enemies)
    const tera = teamMatchups(team, enemies, { teraIndex: 0 })
    expect(base[0].incoming[1].best).toBe(4)
    expect(tera[0].incoming[1].best).toBe(0.5)
    expect(tera[0].outgoing[0].best).toBe(2)
    expect(tera[1]).toEqual(base[1])
  })
})

describe("common opponent sets", () => {
  const summary = normalizeUsage({
    moves_list: [
      ["Earthquake", "90"],
      ["Dragon Claw", "75"],
      ["Rock Slide", "65"],
      ["Protect", "60"],
      ["Iron Head", "30"]
    ],
    abilities_list: [["Rough Skin", "99"]],
    items_list: [["Clear Amulet", "60"]],
    month: "2026-10",
    format: "gen9vgc2026",
    rating: "1630"
  })
  it("fills moves, ability, and item for a quickly entered species", () => {
    const enemy = applyCommonSet(parseOpponents("Garchomp")[0], summary)
    expect(enemy.moves).toEqual(["Earthquake", "Dragon Claw", "Rock Slide", "Protect"])
    expect(enemy.ability).toBe("Rough Skin")
    expect(enemy.item).toBe("Clear Amulet")
    expect(enemy.estimated).toBe(true)
  })
  it("preserves the exact moves, ability, and item supplied by the user", () => {
    const known = parseOpponents("Garchomp @ Choice Scarf\nAbility: Sand Veil\n- Iron Head\n- Outrage")[0]
    const result = applyCommonSet(known, summary)
    expect(result.moves).toEqual(known.moves)
    expect(result.item).toBe(known.item)
    expect(result.ability).toBe(known.ability)
    expect(result.estimated).toBe(false)
  })
  it("restores known fields when changing the usage source", () => {
    const known = parseOpponents("Garchomp\nAbility: Sand Veil")[0]
    const restored = restoreKnownSet(applyCommonSet(known, summary))
    expect(restored.moves).toEqual([])
    expect(restored.ability).toBe("Sand Veil")
    expect(restored.item).toBe("")
    expect(restored.estimated).toBe(false)
  })
  it("keeps missing usage unknown rather than substituting moves", () => {
    expect(() => applyCommonSet(parseOpponents("Garchomp")[0], normalizeUsage({}))).toThrow(/No supported common moves/)
  })
  it("tracks manual overrides separately from other still-estimated fields", () => {
    const estimated = applyCommonSet(parseOpponents("Garchomp")[0], summary)
    const edited = editOpponentSet(estimated, "moves", "Iron Head, Outrage")
    expect(edited.estimated).toBe(true)
    const restored = restoreKnownSet(edited)
    expect(restored.moves).toEqual(["Iron Head", "Outrage"])
    expect(restored.ability).toBe("")
    expect(restored.item).toBe("")
  })
  it("keeps ability overrides while reloading common moves", () => {
    const edited = editOpponentSet(applyCommonSet(parseOpponents("Garchomp")[0], summary), "ability", "Sand Veil")
    expect(applyCommonSet(edited, summary).ability).toBe("Sand Veil")
    expect(restoreKnownSet(edited).moves).toEqual([])
  })
})
