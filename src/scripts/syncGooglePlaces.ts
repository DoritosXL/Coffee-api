import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import {
  findPlaceByNameAndLocation,
  GooglePlaceResult,
} from "./utils/googlePlaces";

const prisma = new PrismaClient();

interface SyncOptions {
  city?: string;
  dryRun?: boolean;
  limit?: number;
  missingOnly?: boolean;
  updateExisting?: boolean;
}

interface GooglePlaceData {
  placeId: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photoReferences?: string[];
}

async function syncGooglePlacesData(options: SyncOptions = {}) {
  const {
    city,
    dryRun = false,
    limit,
    missingOnly = true,
    updateExisting = false,
  } = options;

  // Cap at 5,000 to stay within free tier (or user-specified limit, whichever is lower)
  const MAX_SAFE_LIMIT = 5000;
  const effectiveLimit = limit ? Math.min(limit, MAX_SAFE_LIMIT) : MAX_SAFE_LIMIT;

  if (limit && limit > MAX_SAFE_LIMIT) {
    console.log(`⚠️  Warning: Limit capped at ${MAX_SAFE_LIMIT} (free tier limit)`);
    console.log();
  }

  console.log("🚀 Starting Google Places data sync...");
  console.log(`📍 Target: ${city || "All cities"}`);
  console.log(`🔍 Dry run: ${dryRun ? "Yes (no API calls, no DB changes)" : "No"}`);
  console.log(`📊 Mode: ${missingOnly ? "Missing only" : "All"}`);
  console.log(`🔄 Update existing: ${updateExisting ? "Yes" : "No"}`);
  console.log(`🎯 Max cafes to process: ${effectiveLimit} (free tier: 5,000/month)`);
  console.log();

  // Check for API key
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey && !dryRun) {
    console.error("❌ Error: GOOGLE_PLACES_API_KEY not found in environment variables");
    console.error("   Please add it to your .env file");
    process.exit(1);
  }

  if (dryRun) {
    console.log("💡 DRY RUN MODE: No API calls will be made, no database changes");
    console.log();
  }

  try {
    // Build query to get cafes that need Google Places data
    // Smart incremental sync: only fetch for cafes that:
    // 1. Don't have Google data yet (never fetched), OR
    // 2. Have changed since last Google sync (OSM data updated after google_last_sync)
    let query = `
      SELECT 
        id, name, address_city, lat, lon, 
        google_place_id, google_rating, google_last_sync, updated_at
      FROM coffee_places
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    // Filter by city if specified
    if (city) {
      query += ` AND LOWER(address_city) = LOWER($${paramCount})`;
      params.push(city);
      paramCount++;
    }

    // Smart incremental sync logic
    if (missingOnly && !updateExisting) {
      // Only fetch for cafes that:
      // - Don't have Google data at all, OR
      // - Have been updated since last Google sync (cafe data changed)
      query += ` AND (
        google_place_id IS NULL 
        OR google_rating IS NULL 
        OR updated_at > COALESCE(google_last_sync, '1970-01-01'::timestamp)
      )`;
    } else if (updateExisting) {
      // Force update: re-fetch for all cafes that have google_place_id
      query += ` AND google_place_id IS NOT NULL`;
    } else {
      // Fetch all (not recommended for large datasets)
      // No additional filter
    }

    // ORDER BY must come before LIMIT
    query += ` ORDER BY name ASC`;

    // Always apply limit (defaults to 5000 for free tier safety)
    query += ` LIMIT $${paramCount}`;
    params.push(effectiveLimit);

    console.log("📡 Step 1: Fetching cafes from database...");
    const cafes = await prisma.$queryRawUnsafe(query, ...params);

    if (!Array.isArray(cafes) || cafes.length === 0) {
      console.log("⚠️  No cafes found matching criteria");
      return;
    }

    console.log(`   Found ${cafes.length} cafes to process`);
    console.log();

    // Calculate cost estimate
    const estimatedCost = calculateCost(cafes.length);
    console.log("💰 Cost Estimate:");
    console.log(`   Cafes to process: ${cafes.length}`);
    console.log(`   Free tier: 5,000 requests/month`);
    console.log(
      `   Estimated cost: $${estimatedCost.toFixed(2)} ${
        estimatedCost === 0 ? "✅ (FREE - within free tier)" : ""
      }`
    );
    
    if (cafes.length >= MAX_SAFE_LIMIT && !limit) {
      console.log(`   ⚠️  Note: Capped at ${MAX_SAFE_LIMIT} cafes (free tier limit)`);
      console.log(`   💡 Tip: Run again next month for more cafes`);
    }
    console.log();

    if (dryRun) {
      console.log("🏃 DRY RUN: Would process these cafes:");
      
      // Categorize cafes for better visibility
      const newCafes = (cafes as any[]).filter((c: any) => !c.google_place_id);
      const changedCafes = (cafes as any[]).filter((c: any) => {
        if (!c.google_place_id || !c.google_last_sync) return false;
        const updatedAt = new Date(c.updated_at);
        const lastSync = new Date(c.google_last_sync);
        return updatedAt > lastSync;
      });
      const existingCafes = (cafes as any[]).filter((c: any) => 
        c.google_place_id && !changedCafes.find((ch: any) => ch.id === c.id)
      );

      console.log(`   📊 Breakdown:`);
      console.log(`      🆕 New cafes (never synced): ${newCafes.length}`);
      console.log(`      🔄 Changed cafes (need refresh): ${changedCafes.length}`);
      console.log(`      ✅ Existing cafes: ${existingCafes.length}`);
      console.log();
      
      // Show sample of new/changed cafes
      const samples = [...newCafes.slice(0, 5), ...changedCafes.slice(0, 5)];
      samples.slice(0, 10).forEach((cafe: any, index: number) => {
        const status = !cafe.google_place_id 
          ? "🆕 NEW" 
          : "🔄 CHANGED";
        console.log(
          `   ${index + 1}. ${status} ${cafe.name} (${cafe.address_city || "Unknown"})`
        );
      });
      
      if (cafes.length > 10) {
        console.log(`   ... and ${cafes.length - 10} more`);
      }
      console.log();
      console.log("💡 Run without --dry-run flag to actually fetch Google Places data");
      return;
    }

    // Create sync log entry
    const syncLog = await prisma.$queryRaw`
      INSERT INTO sync_logs (sync_type, status, started_at, metadata)
      VALUES (
        ${city ? "google_places_city" : "google_places_full"}, 
        'started', 
        NOW(),
        ${JSON.stringify({ city, limit, missingOnly, updateExisting })}::jsonb
      )
      RETURNING id
    `.then((result: any) => result[0]);

    console.log(`📞 Step 2: Fetching Google Places data for ${cafes.length} cafes...`);
    
    if (!apiKey) {
      console.log();
      console.log("❌ ERROR: GOOGLE_PLACES_API_KEY not found!");
      console.log("   The script found cafes to process, but cannot continue without an API key.");
      console.log("   Please add GOOGLE_PLACES_API_KEY to your .env file.");
      console.log();
      console.log("   See GOOGLE_PLACES_PLAN.md for setup instructions.");
      return;
    }

    // Safety check: Ensure this is manual execution only
    // Check if running in CI/CD or automated environment
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.VERCEL) {
      console.log();
      console.log("❌ ERROR: This script must be run manually!");
      console.log("   Google Places API calls cost money and should only run when explicitly invoked.");
      console.log("   This script is disabled in CI/CD environments to prevent accidental charges.");
      return;
    }

    // Rate limiting: Add delay between API calls to respect rate limits
    const RATE_LIMIT_DELAY_MS = 100; // 100ms = ~10 requests/second (well under 60/sec limit)
    const BATCH_SIZE = 50; // Process in batches for better progress visibility

    console.log("   ⚠️  WARNING: This will make real Google Places API calls!");
    console.log("   💰 Cost: First 5,000 requests/month are FREE, then $17 per 1,000 requests");
    console.log("   🚀 Starting API calls...");
    console.log();

    let recordsUpdated = 0;
    let recordsSkipped = 0;
    let recordsNotFound = 0;
    let errors = 0;
    let apiCallsMade = 0;

    for (let i = 0; i < cafes.length; i++) {
      const cafe = cafes[i] as any;
      
      try {
        // Rate limiting: Add delay between requests (except first one)
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }

        // Fetch Google Places data
        const googleData = await findPlaceByNameAndLocation(
          cafe.name,
          Number(cafe.lat),
          Number(cafe.lon),
          apiKey
        );
        
        apiCallsMade += 2; // Nearby Search + Place Details = 2 calls per cafe

        if (googleData && googleData.placeId) {
          // Update database with Google Places data
          await prisma.$executeRaw`
            UPDATE coffee_places SET
              google_place_id = ${googleData.placeId},
              google_rating = ${googleData.rating},
              google_review_count = ${googleData.reviewCount},
              google_price_level = ${googleData.priceLevel},
              google_photo_references = ${googleData.photoReferences || []}::text[],
              google_last_sync = NOW(),
              updated_at = NOW()
            WHERE id = ${cafe.id}::uuid
          `;
          recordsUpdated++;
        } else {
          recordsNotFound++;
          recordsSkipped++;
        }

        // Progress reporting every 50 cafes
        if ((i + 1) % BATCH_SIZE === 0 || i + 1 === cafes.length) {
          const progress = ((i + 1) / cafes.length) * 100;
          console.log(
            `   📊 Progress: ${i + 1}/${cafes.length} (${progress.toFixed(1)}%) | Updated: ${recordsUpdated} | Skipped: ${recordsSkipped} | API Calls: ${apiCallsMade}`
          );
        }
      } catch (error: any) {
        console.error(`❌ Error processing cafe "${cafe.name}":`, error.message);
        errors++;
        recordsSkipped++;
        
        // Stop if API key error (don't continue making calls with invalid key)
        if (error.message.includes("API key") || error.message.includes("403")) {
          console.log();
          console.log("🛑 Stopping sync due to API key error.");
          console.log("   Please check your GOOGLE_PLACES_API_KEY in .env file");
          break;
        }
        
        // Rate limit error - wait and continue
        if (error.message.includes("rate limit") || error.message.includes("429")) {
          console.log("   ⏳ Rate limit hit, waiting 60 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 60000));
          continue;
        }
      }
    }

    console.log();
    console.log("✅ Sync completed!");
    console.log(`   📝 Records updated: ${recordsUpdated}`);
    console.log(`   ❌ Records not found: ${recordsNotFound}`);
    console.log(`   ⏭️  Records skipped: ${recordsSkipped}`);
    console.log(`   📞 Total API calls made: ${apiCallsMade}`);
    
    // Calculate actual cost
    const actualCost = calculateCost(apiCallsMade);
    console.log(`   💰 Estimated cost: $${actualCost.toFixed(2)} ${actualCost === 0 ? "✅ (FREE - within free tier)" : ""}`);
    
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors}`);
    }

    // Update sync log
    if (syncLog) {
      await prisma.$executeRaw`
        UPDATE sync_logs SET
          status = 'completed',
          records_processed = ${cafes.length},
          records_updated = ${recordsUpdated},
          completed_at = NOW()
        WHERE id = ${syncLog.id}::uuid
      `;
    }
  } catch (error) {
    console.error("❌ Sync failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function calculateCost(requestCount: number): number {
  const FREE_TIER = 5000;
  const COST_PER_1000 = 17.0; // $17 per 1,000 requests after free tier

  if (requestCount <= FREE_TIER) {
    return 0;
  }

  const paidRequests = requestCount - FREE_TIER;
  return (paidRequests / 1000) * COST_PER_1000;
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
    } else if (arg === "--limit" && i + 1 < args.length) {
      options.limit = parseInt(args[i + 1], 10);
      if (isNaN(options.limit)) {
        console.error("❌ Invalid limit value");
        process.exit(1);
      }
      i++;
    } else if (arg === "--missing-only") {
      options.missingOnly = true;
      options.updateExisting = false;
    } else if (arg === "--update-existing") {
      options.updateExisting = true;
      options.missingOnly = false;
    } else if (arg === "--help") {
      console.log(`
Usage: npm run sync:google [options]

Options:
  --dry-run           Preview what would be synced without API calls or DB changes
  --city <name>       Only process cafes from a specific city (e.g., "Amsterdam")
  --limit <number>    Process maximum N cafes (cost control)
  --missing-only      Only fetch for places without Google data (default)
  --update-existing   Re-fetch data for places that already have google_place_id
  --help              Show this help message

Examples:
  npm run sync:google -- --dry-run                      # Preview sync (max 5,000 cafes)
  npm run sync:google -- --dry-run --city Amsterdam      # Preview Amsterdam cafes (max 5,000)
  npm run sync:google -- --city Amsterdam --limit 50    # Process 50 Amsterdam cafes
  npm run sync:google -- --missing-only                 # Process all missing cafes (max 5,000)

Safety:
  - Default limit: 5,000 cafes (stays within free tier) ✅
  - Can override with --limit, but will warn if > 5,000
  - Free tier: 5,000 requests/month
  - After 5,000: $17 per 1,000 requests
  
Note: This script requires GOOGLE_PLACES_API_KEY in your .env file
      `);
      process.exit(0);
    }
  }

  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();

  syncGooglePlacesData(options)
    .then(() => {
      console.log("🎉 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fatal error:", error);
      process.exit(1);
    });
}

export { syncGooglePlacesData };

