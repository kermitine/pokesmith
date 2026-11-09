# VGC helper: data sources and fork comparison

Researched November 4, 2026. This is a source and API review, not a build or accuracy audit of the candidate applications. Live response evidence is in [public-source-probes-2026-11-04.json](public-source-probes-2026-11-04.json).

## Recommendation

**Start by trying VGC Multi Calc, then fork it if its interface suits the intended app.** Its existing Type Calc closely matches the requested resistance, immunity, and moveset coverage views. The main proposed addition is a quick opponent entry flow with usage-informed set estimates and a ranking of available switch-ins against both active opponents.

For a small custom interface, build a TypeScript frontend around existing Showdown data and calculation libraries. Reuse the mechanics rather than writing another damage formula. MunchStats is a useful data provider, but its repository is not my recommended fork base: no declared license was found, and its Flask application has a broader scope than this helper.

These are engineering recommendations based on the sources below; no repository was cloned or application scaffolded.

## APIs and libraries

| Source | What it supplies | Fit and limitations |
| --- | --- | --- |
| [`@pkmn/sets`](https://github.com/pkmn/ps/tree/main/sets) | Showdown text and packed-team parsing | Use for team import. Normalize species, forms, items, abilities, investment, and moves against the selected format afterward. |
| [`@pkmn/dex`](https://github.com/pkmn/ps/tree/main/dex) and [`@pkmn/data`](https://github.com/pkmn/ps/tree/main/data) | Species, moves, types, items, abilities, generation data | Bundle locally for immediate searches and coverage. Dex contains data, not the complete implementation of battle mechanics. |
| [`@smogon/calc`](https://github.com/smogon/damage-calc) | Damage rolls and calculation results | Recommended calculation dependency for a custom app. Its adaptable interface can share the `@pkmn/data` layer. Validate support for the selected game's mechanics. |
| [MunchStats](https://github.com/PizzaTimeJoshua/munchstats#api) | Format-specific move, item, ability, spread, and teammate frequencies; tournament/team endpoints | Useful for opponent estimates. Its versioned API exposes month and format information. Use a cached server adapter for the tested routes because they did not return browser cross-origin permission headers. |
| [`@pkmn/smogon` / data.pkmn.cc](https://github.com/pkmn/smogon/blob/main/API.md) | Processed usage statistics and curated analysis sets | Browser-friendly alternative: tested statistics returned `Access-Control-Allow-Origin: *`. Its "best" dataset is not necessarily the latest regulation; inspect the available formats and provenance. |
| [Smogon monthly statistics](https://www.smogon.com/stats/) | Original monthly usage files, including `chaos` JSON by format and rating cutoff | Good upstream source when explicit month/regulation control is required. Larger files should be fetched and cached server-side. The sample direct request failed TLS validation here; that file's availability was not confirmed. |
| [Limitless API](https://docs.limitlesstcg.com/developer.html) | Tournament standings, matches, and published team lists | Optional later source of observed teams. Most tournament endpoints need no key; rate limits apply. Check each published list for the fields it actually includes. |
| [PokéAPI](https://pokeapi.co/docs/v2) | General species, move, and type information | Free, no authentication; suitable for general reference data. It does not provide competitive usage predictions or a complete VGC calculation engine. Prefer the Showdown data stack for this app's core. |

The recommended parser, Dex, and calculator projects declare MIT licenses. Keep third-party attribution with reused code; data and graphics have their own provenance.

## MunchStats findings

MunchStats is useful here. Its [about page](https://www.munchstats.com/about/) identifies monthly Showdown statistics as the ladder source and describes a separate captured in-game Champions dataset. Those populations should remain distinguishable in the app.

The following requests succeeded without credentials:

```text
GET https://www.munchstats.com/api/v1/meta
GET https://www.munchstats.com/api/v1/index/{format}/{rating}/?month={YYYY-MM}
GET https://www.munchstats.com/api/v1/pokemon/{format}/{rating}/{species}?month={YYYY-MM}
```

At verification, metadata named October 2026 and `gen9championsvgc2026regmcbo3` as its defaults. Discover these values at runtime rather than embedding them as the user's format. The versioned API only advertised October locally; the site's historical web endpoints have different fallback behavior.

The tested Incineroar detail included `moves_list`, `abilities_list`, `items_list`, `spreads_list`, `month`, `rating`, `format`, and `value_kind`. Numeric percentages arrive as strings. The lists contain display information and are truncated, so normalize them in an adapter and treat missing tail entries as unknown. Champions investment values also need their game-specific interpretation.

The responses included ETags and cache headers but no `Access-Control-Allow-Origin` header for the supplied localhost origin. Fetch through the app's backend, cache by source/month/format/rating/species, and honor conditional requests. The README also documents downloadable packs, avoiding repeated species requests.

GitHub's live repository metadata reported `license: null`; the root listing had no license file. That is a reason to clarify code reuse before choosing it as a fork. It does not establish whether third-party API use is permitted or restricted. No published third-party service guarantee was verified.

Sources: [API documentation](https://github.com/PizzaTimeJoshua/munchstats#api), [repository](https://github.com/PizzaTimeJoshua/munchstats), and the local probe record.

## Existing projects

| Project | Verified overlap | Assessment |
| --- | --- | --- |
| [VGC Multi Calc](https://github.com/robsonbittencourt/vgc-multicalc) | MIT; Angular/TypeScript; Showdown import/export; offensive and defensive coverage; another-team comparison; batch damage tools | **Best overall fork candidate.** The Type Calc guide explicitly accounts for moves, abilities, and matchup-changing items. Add opponent estimation and switch ranking. Its substantial UI and internal calculation engine mean a fork carries more maintenance than a thin frontend around libraries. |
| [PokemonVGC-Calculator](https://github.com/huydamm/PokemonVGC-Calculator) | MIT; React/Vite/TypeScript; team paste import; usage-driven opponent autofill; damage calculation; live Showdown overlay | **Closest smaller React starting point.** Its source assembles a set from independently popular components. Replace that assumption for switch advice. Its README documents approximations in Champions mechanics and cross-format data fallbacks that need review. |
| [Showdex](https://github.com/doshidak/showdex) | AGPL-3.0; live Showdown battle and field synchronization | Best relevant option if automatic Showdown integration becomes the priority. More coupled to the Showdown client than a paste-based companion app. Review its license when choosing a fork. |
| [Unburden](https://github.com/leandromesq/unburden) | MIT; Next.js/TypeScript; compact matchup prompts; client-side damage workspace | Relevant for keyboard-oriented input, but less directly aligned with the requested team coverage dashboard. |
| [vgc-mcp](https://github.com/MSS23/vgc-mcp) | MIT; Python; usage clients, damage, team, and live battle tools | Useful backend/reference option if a conversational assistant is desired later. An MCP service is additional infrastructure for the proposed visual helper. |

Key sources: [Multi Calc Type Calc guide source](https://github.com/robsonbittencourt/vgc-multicalc/blob/main/src/app/pages/how-to-use/how-to-use-type-calc/how-to-use-type-calc.component.html), [batch calculation guide](https://vgcmulticalc.com/how-to-use/team-vs-many/), [React candidate's set assembly](https://github.com/huydamm/PokemonVGC-Calculator/blob/main/src/services/sets.ts), and [its known limitations](https://github.com/huydamm/PokemonVGC-Calculator#known-limitations).

## Opponent estimates and switch recommendations

**Move inclusion frequency is not a probability of selecting that move this turn.** Separate item, move, ability, and spread frequency tables also do not identify complete sets used together. Picking each table's most popular entry can produce an inconsistent opponent build. Prefer coherent published or curated sets when available, retain alternative scenarios, and allow known moves, items, abilities, and team sheets to override estimates.

For the requested experience, implement in this order:

1. Paste a team and select the game/regulation. Show all 18 incoming type matchups per member, then actual attacking-move coverage against legal species or entered opponents. Distinguish plain typing from conditional immunities and account for special moves such as Freeze-Dry.
2. Add fast opponent species entry and display common moves with source, month, rating, and estimated/known labels. Keep Scarlet/Violet and Champions data and investment systems separate. Show missing data explicitly; avoid silent fallbacks to another game.
3. Add active slots, the brought team, bench availability, current HP, and relevant field state. Rank switch candidates using damage scenarios from both opposing active Pokemon, including plausible double targeting and spread attacks. Include status pressure and switch-in ability effects where supported.
4. Explain each recommendation with the attacks it handles and the coverage that threatens it. Show a conservative risk view alongside the common-set view. Without a calibrated set-and-action model, label results as conditional scenario estimates rather than an unconditional survival percentage.

The proposed switch adviser is new engineering work. A type resistance alone cannot establish that a switch survives the current board, and a super-effective move does not establish a knockout. Exact calculations remain conditional on the supplied or assumed state.

## Verification limits

MunchStats metadata/index/detail and data.pkmn.cc statistics returned HTTP 200. Repository licenses and relevant source paths were inspected, with detailed evidence for the leading fork candidates. No candidate application was installed, run, or tested against an independent mechanics suite. The direct Smogon sample failed certificate verification in this environment; TLS checks were kept enabled.
