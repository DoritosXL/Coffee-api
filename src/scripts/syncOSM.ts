import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { queryCafesInNetherlands } from "./utils/overpass";
import { transformOSMElements } from "./utils/transform";

const prisma = new PrismaClient();

interface SyncOptions {
  city?: string;
  dryRun?: boolean;
}

async function syncOSMData(options: SyncOptions = {}) {
  const { city, dryRun = false } = options;

  console.log("🚀 Starting OSM data sync...");
  console.log(`📍 Target: ${city || "All of Netherlands"}`);
  console.log(`🔍 Dry run: ${dryRun ? "Yes" : "No"}`);
  console.log();

  // Create sync log entry
  const syncLog = dryRun
    ? null
    : await prisma.$queryRaw`
      INSERT INTO sync_logs (sync_type, status, started_at)
      VALUES (${city ? "osm_city" : "osm_full"}, 'started', NOW())
      RETURNING id
    `.then((result: any) => result[0]);

  try {
    // Step 1: Fetch data from Overpass API
    console.log("📡 Step 1: Fetching data from Overpass API...");
    const osmElements = await queryCafesInNetherlands(city);

    if (osmElements.length === 0) {
      console.log("⚠️  No cafes found");
      return;
    }

    // Step 2: Transform data
    console.log("🔄 Step 2: Transforming data...");
    const cafes = transformOSMElements(osmElements);

    if (cafes.length === 0) {
      console.log("⚠️  No valid cafes after transformation");
      return;
    }

    // Step 3: Upsert to database
    if (dryRun) {
      console.log("🏃 DRY RUN: Would insert/update these cafes:");
      console.log(`   Total cafes: ${cafes.length}`);
      console.log(`   Sample: ${cafes.slice(0, 3).map(c => c.name).join(", ")}`);
      console.log();
      console.log("💡 Run without --dry-run flag to actually insert data");
      return;
    }

    console.log(`💾 Step 3: Upserting ${cafes.length} cafes to database...`);

    let recordsAdded = 0;
    let recordsUpdated = 0;
    let errors = 0;

    for (const cafe of cafes) {
      try {
        // Check if exists
        const existing = await prisma.$queryRaw<any[]>`
          SELECT id FROM coffee_places WHERE osm_id = ${cafe.osmId}
        `;

        if (existing.length > 0) {
          // Update existing
          await prisma.$executeRaw`
            UPDATE coffee_places SET
              name = ${cafe.name},
              lat = ${cafe.lat},
              lon = ${cafe.lon},
              address_street = ${cafe.addressStreet},
              address_housenumber = ${cafe.addressHousenumber},
              address_postcode = ${cafe.addressPostcode},
              address_city = ${cafe.addressCity},
              address_full = ${cafe.addressFull},
              phone = ${cafe.phone},
              website = ${cafe.website},
              email = ${cafe.email},
              opening_hours = ${cafe.openingHours},
              opening_hours_start = ${cafe.openingHoursStart},
              opening_hours_end = ${cafe.openingHoursEnd},
              has_wifi = ${cafe.hasWifi},
              has_outdoor_seating = ${cafe.hasOutdoorSeating},
              has_wheelchair_access = ${cafe.hasWheelchairAccess},
              has_takeaway = ${cafe.hasTakeaway},
              has_delivery = ${cafe.hasDelivery},
              smoking = ${cafe.smoking},
              tags = ${cafe.tags}::text[],
              quality_score = ${cafe.qualityScore},
              is_verified = ${cafe.isVerified},
              osm_last_sync = ${cafe.osmLastSync},
              updated_at = NOW()
            WHERE osm_id = ${cafe.osmId}
          `;
          recordsUpdated++;
        } else {
          // Insert new
          await prisma.$executeRaw`
            INSERT INTO coffee_places (
              osm_id, osm_type, name, lat, lon,
              address_street, address_housenumber, address_postcode, address_city, address_full,
              phone, website, email,
              opening_hours, opening_hours_start, opening_hours_end,
              has_wifi, has_outdoor_seating, has_wheelchair_access, has_takeaway, has_delivery,
              smoking, tags, quality_score, is_verified,
              data_source, osm_last_sync, created_at, updated_at
            ) VALUES (
              ${cafe.osmId}, ${cafe.osmType}, ${cafe.name}, ${cafe.lat}, ${cafe.lon},
              ${cafe.addressStreet}, ${cafe.addressHousenumber}, ${cafe.addressPostcode},
              ${cafe.addressCity}, ${cafe.addressFull},
              ${cafe.phone}, ${cafe.website}, ${cafe.email},
              ${cafe.openingHours}, ${cafe.openingHoursStart}, ${cafe.openingHoursEnd},
              ${cafe.hasWifi}, ${cafe.hasOutdoorSeating}, ${cafe.hasWheelchairAccess},
              ${cafe.hasTakeaway}, ${cafe.hasDelivery},
              ${cafe.smoking}, ${cafe.tags}::text[], ${cafe.qualityScore}, ${cafe.isVerified},
              ${cafe.dataSource}, ${cafe.osmLastSync}, NOW(), NOW()
            )
          `;
          recordsAdded++;
        }

        // Log progress every 100 records
        if ((recordsAdded + recordsUpdated) % 100 === 0) {
          console.log(`   Progress: ${recordsAdded + recordsUpdated}/${cafes.length} processed...`);
        }
      } catch (error) {
        console.error(`❌ Error processing cafe "${cafe.name}":`, error);
        errors++;
      }
    }

    console.log();
    console.log("✅ Sync completed!");
    console.log(`   📊 Records added: ${recordsAdded}`);
    console.log(`   📝 Records updated: ${recordsUpdated}`);
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors}`);
    }

    // Update sync log
    if (syncLog) {
      await prisma.$executeRaw`
        UPDATE sync_logs SET
          status = 'completed',
          records_processed = ${cafes.length},
          records_added = ${recordsAdded},
          records_updated = ${recordsUpdated},
          completed_at = NOW()
        WHERE id = ${syncLog.id}::uuid
      `;
    }
  } catch (error) {
    console.error("❌ Sync failed:", error);

    // Update sync log with error
    if (syncLog) {
      await prisma.$executeRaw`
        UPDATE sync_logs SET
          status = 'failed',
          error_message = ${error instanceof Error ? error.message : String(error)},
          completed_at = NOW()
        WHERE id = ${syncLog.id}::uuid
      `;
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--city" && i + 1 < args.length) {
      options.city = args[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npm run sync:osm [options]

Options:
  --city <name>    Sync only cafes from a specific city (e.g., "Amsterdam")
  --dry-run        Preview what would be synced without actually inserting data
  --help           Show this help message

Examples:
  npm run sync:osm                    # Sync all cafes in Netherlands
  npm run sync:osm -- --city Amsterdam    # Sync only Amsterdam cafes
  npm run sync:osm -- --dry-run           # Preview sync without inserting data
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();

  syncOSMData(options)
    .then(() => {
      console.log("🎉 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fatal error:", error);
      process.exit(1);
    });
}

export { syncOSMData };
