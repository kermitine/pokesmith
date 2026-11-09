import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      "@data": fromRoot("./src/domain/data"),
      "@multicalc": fromRoot("./src/domain/multicalc"),
      "@store": fromRoot("./src/app/store"),
      "@calc-bridge": fromRoot("./src/domain/multicalc/calc-bridge"),
      "@calc": fromRoot("./src/domain/calc"),
      "@pokemon-repository": fromRoot("./src/domain/multicalc/pokemon-repository")
    }
  },
  test: { globals: true, environment: "node", include: ["src/domain/pokesmith/**/*.spec.ts", "src/domain/multicalc/type-calc/type-chart.spec.ts", "src/app/store/user-data/showdown-text-parser.spec.ts", "scripts/usage-server.spec.mjs"] }
})
