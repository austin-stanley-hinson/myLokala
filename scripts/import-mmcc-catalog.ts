/**
 * CLI: import the MMCC legacy catalog export into catalog_businesses /
 * catalog_locations / catalog_deals. SERVER-ONLY, run manually.
 *
 * Usage:
 *   node --experimental-strip-types scripts/import-mmcc-catalog.ts <path-to-deals_raw.json>
 *
 * If a legacy_export_manifest.json sits alongside the given file, its
 * sha256_deals_raw_json is checked against the file's actual checksum before
 * anything is imported -- refuses to import a file that does not match.
 *
 * Delegates to importMmccCatalog (src/lib/catalog/mmcc-import.ts), which is
 * idempotent by legacy_deal_id: safe to run more than once against the same
 * or a later export.
 *
 * Writes only to the CURRENT project via createAdminClient()
 * (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from this script's
 * own environment) -- never targets the legacy Supabase project
 * (ifvnofdnjvmsfsxhixip), which this script never connects to at all.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createCatalogImportDeps, importMmccCatalog, type MmccExportRow } from "../src/lib/catalog/mmcc-import.ts";

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fail(message: string): never {
  console.error(`[import-mmcc-catalog] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    fail("usage: node --experimental-strip-types scripts/import-mmcc-catalog.ts <path-to-deals_raw.json>");
  }
  if (!existsSync(filePath)) {
    fail(`file not found: ${filePath}`);
  }

  const manifestPath = join(dirname(filePath), "legacy_export_manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      sha256_deals_raw_json?: string;
    };
    const actual = sha256(filePath);
    if (manifest.sha256_deals_raw_json && manifest.sha256_deals_raw_json !== actual) {
      fail(
        `checksum mismatch: ${filePath} sha256=${actual} does not match manifest's ` +
          `sha256_deals_raw_json=${manifest.sha256_deals_raw_json}. Refusing to import.`,
      );
    }
    console.log(`[import-mmcc-catalog] checksum verified against ${manifestPath}`);
  } else {
    console.warn(
      `[import-mmcc-catalog] no legacy_export_manifest.json found next to ${filePath} -- proceeding without checksum verification`,
    );
  }

  const rows = JSON.parse(readFileSync(filePath, "utf8")) as MmccExportRow[];
  console.log(`[import-mmcc-catalog] importing ${rows.length} rows from ${filePath}`);

  const admin = createAdminClient();
  const deps = createCatalogImportDeps(admin);
  const summary = await importMmccCatalog(rows, deps);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.errors.length > 0) {
    fail(`${summary.errors.length} row(s) failed to import -- see errors above`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
