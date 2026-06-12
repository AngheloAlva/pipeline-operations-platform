/**
 * Seed generator script for the Pipeline Operations Platform.
 * Runs generateWorld with a fixed seed, validates the result,
 * and writes src/lib/data/seed.json.
 *
 * Usage: pnpm generate:seed
 *
 * NOTE: faker is NOT imported here; generateWorld is fully pure and uses
 * in-lib seeded name pools only (ADR-2). faker remains in devDeps but
 * is not used by this script.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// tsconfig path aliases do not apply in scripts; use relative imports.
import { generateWorld } from "../src/lib/data/generate";
import { validateWorld } from "../src/lib/data/validate";
import { DEFAULT_CONFIG } from "../src/lib/data/config";

/** Fixed seed so the committed seed.json is always reproducible. */
const FIXED_SEED = 2026;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, "../src/lib/data/seed.json");

function main(): void {
  console.log(`Generating world with seed=${FIXED_SEED}...`);
  const world = generateWorld({ ...DEFAULT_CONFIG, seed: FIXED_SEED });

  console.log("Validating generated world...");
  const validation = validateWorld(world);

  if (!validation.valid) {
    console.error("Validation FAILED. Errors:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const json = JSON.stringify(world, null, 2);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, json, "utf-8");

  const stats = {
    stations: world.stations.length,
    tanks: world.tanks.length,
    equipment: world.equipment.length,
    shippers: world.shippers.length,
    movements: world.movements.length,
    volumeTargets: world.volumeTargets.length,
    maintenancePlans: world.maintenancePlans.length,
    workOrders: world.workOrders.length,
    cathodicReadings: world.cathodicReadings.length,
    telemetry: world.telemetry.length,
    segments: world.pipeline.segments.length,
  };

  console.log("Validation PASSED. Entity counts:");
  for (const [key, count] of Object.entries(stats)) {
    console.log(`  ${key}: ${count}`);
  }

  const byteSize = Buffer.byteLength(json, "utf-8");
  console.log(`Written to ${OUTPUT_PATH} (${(byteSize / 1024).toFixed(1)} KB)`);
}

main();
