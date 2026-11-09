import { coveredSpecies, defense, defensiveFits, EXAMPLE_TEAM, moveCoverage, moveMultiplier, normalizeUsage, parseOpponents, parseTeam } from "./team-analysis"

const get = (paste: string) => parseTeam(paste)[0]
const incoming = (paste: string, type: string) => defense(get(paste)).find(x => x.type === type)!.multiplier

describe("Showdown import to matchup analysis", () => {
  it("imports a complete six-member export without inventing moves", () => {
    const team = parseTeam(EXAMPLE_TEAM.replace(/\n/g, "\r\n"))
    expect(team.map(p => p.species)).toEqual(["Incineroar", "Rillaboom", "Flutter Mane", "Urshifu-Rapid-Strike", "Landorus-Therian", "Amoonguss"])
    expect(team[0].moves).toEqual(["Fake Out", "Flare Blitz", "Knock Off", "Parting Shot"])
    expect(team[0].teraType).toBe("Grass")
  })
  it("resolves nicknames, gender and team headers", () => {
    const set = get("=== [gen9vgc2026] My team ===\nSparky (Rotom-Wash) @ Sitrus Berry\nAbility: Levitate\n- Hydro Pump")
    expect(set.species).toBe("Rotom-Wash")
    expect(set.item).toBe("Sitrus Berry")
  })
  it("does not assign a default item, ability or attacking set", () => {
    const set = get("Garchomp")
    expect(set.moves).toEqual([])
    expect(set.ability).toBe("")
    expect(set.item).toBe("")
    expect(moveCoverage(set)).toEqual([])
  })
  it.each(["", "Notamon", "Garchomp\n- Not a move", "Garchomp\nAbility: Made Up", "Garchomp @ Made Up"])("rejects invalid input: %s", value => expect(() => parseTeam(value)).toThrow())
  it("rejects oversize teams and movesets", () => {
    expect(() => parseTeam(Array(7).fill("Pikachu").join("\n\n"))).toThrow(/six/)
    expect(() => parseTeam("Garchomp\n- Earthquake\n- Protect\n- Rock Slide\n- Dragon Claw\n- Iron Head")).toThrow(/four/)
  })
  it("retains dual-type weaknesses and native immunities", () => {
    expect(incoming("Garchomp", "Ice")).toBe(4)
    expect(incoming("Garchomp", "Electric")).toBe(0)
    expect(incoming("Scizor", "Fire")).toBe(4)
    expect(incoming("Scizor", "Grass")).toBe(0.25)
  })
  it("includes ability immunities, Air Balloon, and defensive modifiers", () => {
    expect(incoming("Rotom-Wash\nAbility: Levitate", "Ground")).toBe(0)
    expect(incoming("Heatran @ Air Balloon\nAbility: Flash Fire", "Ground")).toBe(0)
    expect(incoming("Heatran\nAbility: Flash Fire", "Fire")).toBe(0)
    expect(incoming("Snorlax\nAbility: Thick Fat", "Ice")).toBe(0.5)
  })
  it("lets Mold Breaker bypass Levitate but not an Air Balloon", () => {
    const attacker = get("Excadrill\nAbility: Mold Breaker\n- Earthquake")
    expect(moveMultiplier(attacker, "Earthquake", get("Rotom-Wash\nAbility: Levitate"))).toBe(2)
    expect(moveMultiplier(attacker, "Earthquake", get("Rotom-Wash @ Air Balloon\nAbility: Levitate"))).toBe(0)
  })
  it("does not count status or fixed damage as super-effective coverage", () => {
    const rows = moveCoverage(get("Blissey\n- Thunder Wave\n- Seismic Toss\n- Ice Beam"))
    expect(rows[0].targets).toEqual([])
    expect(rows[1].targets).toEqual([])
    expect(rows[2].targets).toContain("Ground")
  })
  it("handles Freeze-Dry against a dual Water type", () => {
    expect(moveMultiplier(get("Iron Bundle\n- Freeze-Dry"), "Freeze-Dry", get("Gastrodon"))).toBe(4)
  })
  it("handles Scrappy, Pixilate, and weather-dependent moves", () => {
    expect(moveMultiplier(get("Kangaskhan\nAbility: Scrappy\n- Fake Out"), "Fake Out", get("Gengar"))).toBe(1)
    expect(moveCoverage(get("Sylveon\nAbility: Pixilate\n- Hyper Voice"))[0].targets).toContain("Dragon")
    expect(moveCoverage(get("Primarina\nAbility: Liquid Voice\n- Hyper Voice"))[0].targets).toContain("Fire")
    const ball = get("Pelipper\n- Weather Ball")
    expect(moveCoverage(ball)[0].targets).toEqual([])
    expect(moveCoverage(ball, { weather: "Rain" })[0].targets).toContain("Fire")
  })
  it("only uses Tera typing when the preview is enabled", () => {
    const set = get("Garchomp\nTera Type: Steel\n- Tera Blast")
    expect(moveCoverage(set)[0].targets).toEqual([])
    expect(moveCoverage(set, { tera: true })[0].targets).toContain("Fairy")
    expect(defense(set, { tera: true }).find(x => x.type === "Ice")!.multiplier).toBe(0.5)
  })
  it("accounts for actual dual typings in the named coverage list", () => {
    const targets = coveredSpecies(get("Garchomp\n- Earthquake"))
    expect(targets.find(p => p.name === "Heatran")?.moves[0].multiplier).toBe(4)
    expect(targets.some(p => p.name === "Charizard")).toBe(false)
  })
  it("accepts quick opponent names and full sets", () => {
    expect(parseOpponents("Garchomp, Rotom-Wash\nIncineroar")).toHaveLength(3)
    expect(parseOpponents("Garchomp\n- Earthquake")[0].moves).toEqual(["Earthquake"])
  })
  it("checks threats from every supplied opponent when ranking fits", () => {
    const team = parseTeam("Garchomp\n\nRotom-Wash\nAbility: Levitate\n\nScizor")
    const foes = parseOpponents("Incineroar\n- Flare Blitz\n\nGarchomp\n- Earthquake")
    const fits = defensiveFits(team, foes)
    expect(fits[0].set.species).toBe("Rotom-Wash")
    expect(fits[0].checks).toHaveLength(2)
    expect(fits[0].worst).toBe(0.5)
  })
  it("keeps missing opposing moves explicitly unknown", () => {
    expect(defensiveFits(parseTeam("Garchomp"), parseOpponents("Pikachu"))[0].unknown).toBe(true)
    expect(defensiveFits(parseTeam("Garchomp"), parseOpponents("Pikachu"))[0].worst).toBe(Infinity)
  })
  it("normalizes percentage strings and rejects malformed rows", () => {
    const usage = normalizeUsage({
      moves_list: [
        ["Fake Out", "99.887"],
        ["bad", "nope"],
        ["bad", "200"]
      ],
      month: "2026-10",
      rating: "1630"
    })
    expect(usage.moves).toEqual([{ name: "Fake Out", percent: 99.887 }])
    expect(usage.month).toBe("2026-10")
  })
})
