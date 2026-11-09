# Pokesmith

A local Pokémon VGC workbench built from [VGC Multi Calc](https://github.com/robsonbittencourt/vgc-multicalc).

Paste a Showdown export to see each Pokémon's resistances, weaknesses, immunities, and super-effective coverage from its actual moves. Explore a team-wide defensive matrix, search covered species and forms, preview one member's Tera typing, and adjust weather for moves such as Weather Ball.

## Docker: build directly from GitHub

The [Compose file](compose.yaml) follows Rocket-Pod's setup: Docker builds the latest `main` branch of `https://github.com/kermitine/pokesmith.git` directly, then runs the app and usage API in one container. You only need the Compose file on your Docker host; a local checkout or Node installation is unnecessary.

```sh
curl -fsSLO https://raw.githubusercontent.com/kermitine/pokesmith/main/compose.yaml
docker compose up -d --build
```

Open **http://YOUR_DOCKER_HOST:8090** (or **http://localhost:8090** on the Docker host). Port 8090 avoids Rocket-Pod's default ports. For Portainer on Docker Standalone, use the contents of `compose.yaml` as the stack definition, or choose this GitHub repository and `compose.yaml` as the Compose path.

To change the host port, put `POKESMITH_PORT=8091` in a `.env` file next to `compose.yaml`. To build a particular branch or tag, set `POKESMITH_BUILD_CONTEXT=https://github.com/kermitine/pokesmith.git#YOUR_REF`. For an unpublished local checkout, set `POKESMITH_BUILD_CONTEXT=.` instead.

To rebuild from GitHub after an update:

```sh
docker compose up -d --build
docker compose logs -f pokesmith
```

Stop it with `docker compose down`. Teams remain in the browser's local storage, so no container data volume is required. Accessing the app through a different hostname or port uses a different browser storage origin.

If Windows Docker Compose reports `failed to evaluate path "https://github.com/..."`, its Bake builder is treating the Git URL as a local Windows path. Build from the GitHub URL directly, then let Compose start the resulting image:

```sh
docker build -t pokesmith:latest https://github.com/kermitine/pokesmith.git#main
docker compose up -d --no-build --pull never
```

This workaround still builds the application from GitHub and uses the same Compose runtime settings.

The multi-stage image runs the tests and production build with Node 24, then includes only the built frontend, the dependency-free Node server, and license notices. The runtime uses the `node` user and exposes port 3000 internally. `/healthz` checks the app without depending on MunchStats availability. The source repository must contain the application and Docker files for a remote build to work.

For a direct build without Compose:

```sh
docker build -t pokesmith:latest https://github.com/kermitine/pokesmith.git#main
docker run -d --name pokesmith --restart unless-stopped -p 8090:3000 pokesmith:latest
```

## Run locally

Use Node.js 24.15 or newer:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:5173**. The development command starts Angular and a local usage adapter on port 5180. This workspace also has an ignored, project-local Node 24 runtime; the launcher uses it automatically when the system Node is older.

```sh
npm run test:team
npm run build
node scripts/pokesmith-cli.mjs preview
```

The preview command serves the production build and usage API together on port 5173. Set `PORT` to use another preview port. Team analysis works without external API requests. Imported team text is saved in this browser's local storage; Clear removes it.

## Opponent scouting

The Opponents tab accepts comma-separated species names or a full Showdown paste. Edit moves and abilities directly, or request common moves from MunchStats. Choose the usage format and rating explicitly. The adapter caches requests for 15 minutes, revalidates with ETags, and keeps queries restricted to MunchStats' documented endpoints.

Usage percentages describe move inclusion, not a prediction of the next action. Suggested components are assembled from separate frequencies and are labeled as estimates. Known moves are preserved when fetching usage. No fallback silently substitutes another game or regulation. The versioned source currently advertises the months and formats available from its metadata.

Defensive fits compare all entered opponents' damaging moves against eligible team members. Uncheck members that are active, fainted, or not brought. This is a **type-based screen**, not a safe-switch survival calculator: it does not model HP, investment, damage rolls, speed, targeting, status pressure, or the full sequence of switch-in effects. Use the retained Damage calculator for detailed calculations.

## Matchup assumptions

- Coverage uses the imported moves, not every move a species could learn. Status and fixed-damage moves do not count as super-effective coverage.
- Named species coverage uses natural typing without unknown defensive abilities or items. Enter an opposing set to include known ability and item effects.
- Defensive summaries include supported ability immunities and damage modifiers, and assume held items such as Air Balloon are intact. Opposing ability bypasses and field effects may change the result.
- A Tera preview changes one team member at a time. Stellar coverage assumes the target is not Terastallized unless specifically modeled; the scouting screen currently treats opposing sets as not Terastallized.
- Data is the pinned upstream snapshot, primarily maintained for Champions/National Dex. The analyzer does not validate move learnability or regulation legality. EVs/IVs remain in the saved paste but are not used for typing calculations. Unhandled move-specific or conditional ability mechanics may require the detailed calculator.

## Upstream and attribution

Imported VGC Multi Calc **2.7.15**, commit [`9865a07be54fe3a24a88f4d6aa3855030f42d7ad`](https://github.com/robsonbittencourt/vgc-multicalc/commit/9865a07be54fe3a24a88f4d6aa3855030f42d7ad). See [provenance](docs/upstream/vgc-multicalc.json) and the [upstream README](docs/upstream/VGC-Multi-Calc-README.md).

Pokesmith retains its existing [AGPL-3.0 license](LICENSE). Imported VGC Multi Calc code is attributed to Robson Bittencourt and retains its [MIT notice](LICENSES/vgc-multicalc-MIT.txt). Pokémon names, data, and artwork belong to their respective owners. MunchStats supplies usage data over its API; its application code is not copied.

The imported source retains the advanced calculators. Original cloud deployment workflows were not imported; community submissions and source synchronization have not been configured for Pokesmith. Docker/Compose deployment is configured above. The npm build command only creates production files.

See the earlier [data-source research](docs/research/vgc-data-and-forks.md) for the API and fork comparison.
