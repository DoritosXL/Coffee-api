# Coffee Places API

A TypeScript REST API built with Fastify and Zod for querying coffee places in the Netherlands, powered by real data from OpenStreetMap and optionally enriched with Google Places ratings.

## 🌟 Features

- **5,900+ Real Coffee Places** from OpenStreetMap Netherlands
- **Rich Data**: Coordinates, addresses, contact info, amenities
- **Google Places Integration**: Real user ratings, reviews, price levels (optional)
- **Fast Queries**: PostgreSQL database with optimized indexes
- **Type-Safe**: Built with TypeScript and Zod validation
- **Well-Documented**: Interactive Swagger UI
- **Production-Ready**: Rate limiting, error handling, deployed on Vercel

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Supabase account (free tier works!)
- npm or yarn
- (Optional) Google Cloud account for Places API enrichment

### Installation

```bash
npm install
```

### Environment Setup

1. Create a `.env` file:
```bash
cp .env.example .env
```

2. Add your Supabase database URL:
```env
DATABASE_URL="postgresql://postgres.xxxxx:[PASSWORD]@aws-x-xx-xxxx.pooler.supabase.com:5432/postgres"
```

3. (Optional) Add Google Places API key for ratings enrichment:
```env
GOOGLE_PLACES_API_KEY="your_api_key_here"
```

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions.

### Database Setup

1. Run the SQL schema in Supabase:
```bash
# Copy contents of supabase-setup.sql
# Paste into Supabase SQL Editor and run
```

2. Sync data from OpenStreetMap:
```bash
# Dry run first (preview without inserting)
npm run sync:osm -- --dry-run

# Sync all Netherlands cafes (~5,900 places, takes 3-5 min)
npm run sync:osm

# Or sync just one city
npm run sync:osm -- --city Amsterdam
```

### Running the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

The server will start on `http://localhost:4000` and print:
```
☕ Coffee API running at http://localhost:4000/api/coffee-places
📚 Swagger UI available at http://localhost:4000/docs
```

---

## 📚 API Documentation

Interactive API documentation is available via Swagger UI at:
- **Local**: http://localhost:4000/docs
- **Production**: https://your-domain.vercel.app/docs

You can test all endpoints directly from the Swagger UI interface.

### API Response Fields

The API returns Google Places data when available:

```json
{
  "rating": 4.5,           // Main rating (from Google if available, otherwise 0)
  "googleRating": 4.5,      // Explicit Google rating (optional)
  "googleReviewCount": 234, // Number of reviews (optional)
  "googlePriceLevel": 2     // Price level 1-4 (optional)
}
```

See [GOOGLE_PLACES_DATA_FIELDS.md](GOOGLE_PLACES_DATA_FIELDS.md) for details.

---

## 🔌 API Endpoints

### GET /api/coffee-places

Retrieve coffee places with optional filtering, pagination, and random selection.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `city` | string | Filter by city name (case-insensitive) |
| `minRating` | number | Minimum rating (0-5 scale, Google ratings only) |
| `openAfter` | HH:mm | Filter places that open at or before this time |
| `openBefore` | HH:mm | Filter places that close at or after this time |
| `tags` | string | Comma-separated tags (all must match) |
| `random` | boolean | Return one random matching place |
| `limit` | number | Results per page (1-100, default: 10) |
| `page` | number | Page number (default: 1) |

#### Response Format

```json
{
  "meta": {
    "total": 5900,
    "page": 1,
    "pageSize": 10
  },
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Coffee Company",
      "city": "Amsterdam",
      "rating": 4.5,
      "openHours": {
        "start": "08:00",
        "end": "20:00"
      },
      "tags": ["wifi", "outdoor", "wheelchair-accessible"],
      "lat": 52.3676,
      "lon": 4.9041,
      "phone": "+31 20 123 4567",
      "website": "https://coffeecompany.nl",
      "hasWifi": true,
      "hasOutdoorSeating": true,
      "qualityScore": 9,
      "googleRating": 4.5,
      "googleReviewCount": 234,
      "googlePriceLevel": 2
    }
  ]
}
```

### GET /api/places

Alias for `/api/coffee-places` (backward compatibility).

---

## 📝 Example Requests

### Get all coffee places
```bash
curl "http://localhost:4000/api/coffee-places"
```

### Filter by city and minimum rating
```bash
curl "http://localhost:4000/api/coffee-places?city=Amsterdam&minRating=4.0"
```

### Filter by tags (WiFi + outdoor seating)
```bash
curl "http://localhost:4000/api/coffee-places?tags=wifi,outdoor"
```

### Get random place from a city
```bash
curl "http://localhost:4000/api/coffee-places?city=Rotterdam&random=true"
```

### More examples
```bash
# Filter by opening hours
curl "http://localhost:4000/api/coffee-places?openAfter=07:00&openBefore=22:00"

# Pagination
curl "http://localhost:4000/api/coffee-places?page=2&limit=20"

# Combined filters
curl "http://localhost:4000/api/coffee-places?city=Amsterdam&minRating=4.0&tags=wifi&limit=10"
```

---

## 🗂️ Project Structure

```
coffee-api/
├── src/
│   ├── index.ts                    # Local server entry point
│   ├── server.ts                   # Fastify app factory
│   ├── routes/
│   │   ├── coffeePlaces.ts         # API route handlers
│   │   └── cities.ts               # Cities endpoint
│   ├── schema/
│   │   └── coffeePlaceSchema.ts    # Zod validation schemas
│   ├── config/
│   │   └── rateLimit.ts            # Rate limiting config
│   ├── db/
│   │   └── client.ts               # Prisma client singleton
│   ├── scripts/
│   │   ├── syncOSM.ts              # OpenStreetMap sync script
│   │   ├── syncGooglePlaces.ts    # Google Places enrichment script
│   │   └── utils/
│   │       ├── overpass.ts         # Overpass API client
│   │       ├── transform.ts        # Data transformation
│   │       └── googlePlaces.ts     # Google Places API client
│   └── data/
│       └── mockCafes.json          # Legacy mock data
├── api/
│   └── index.ts                    # Vercel serverless handler
├── prisma/
│   └── schema.prisma               # Prisma schema (auto-generated)
├── supabase-setup.sql              # Database schema
├── SETUP_GUIDE.md                  # Detailed setup instructions
├── API_MIGRATION_GUIDE.md          # Schema migration guide
├── QUICK_START.md                  # 15-minute quick start
├── GOOGLE_PLACES_PLAN.md           # Google Places integration guide
├── GOOGLE_PLACES_COSTS.md          # Cost analysis
├── GOOGLE_PLACES_COMMANDS.md      # Command reference
├── package.json
├── tsconfig.json
└── vercel.json                     # Vercel deployment config
```

---

## 🛠️ Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload

# Database
npm run db:pull          # Pull schema from Supabase
npm run db:generate      # Generate Prisma Client
npm run db:push          # Push schema changes to database

# Data Sync
npm run sync:osm         # Sync all Netherlands cafes from OSM
npm run sync:osm -- --city Amsterdam  # Sync specific city
npm run sync:osm -- --dry-run         # Preview without inserting

# Google Places Enrichment (⚠️ Makes real API calls - costs money!)
npm run sync:google -- --dry-run                    # ALWAYS dry-run first!
npm run sync:google -- --dry-run --limit 10         # Preview 10 cafes
npm run sync:google -- --city Amsterdam --limit 50  # Process 50 cafes
npm run sync:google -- --missing-only              # Process all missing (max 5,000)

# Production
npm run build            # Build TypeScript
npm start                # Start production server
```

---

## 📊 Data Source

### OpenStreetMap (Primary)

- **5,900+ cafes** across the Netherlands
- **Coverage**: Excellent (especially in major cities)
- **Cost**: FREE forever
- **Freshness**: Data synced from live OSM database
- **Update frequency**: Recommended monthly

**Data includes:**
- ✅ Name, location (lat/lon), address
- ✅ Contact info (phone, website, email)
- ✅ Opening hours
- ✅ Amenities (WiFi, outdoor seating, wheelchair access, etc.)
- ✅ Quality score (0-10 based on data completeness)
- ❌ User ratings (not available in OSM)

### Rating System

**Rating System Update:**
- If Google Places rating is available: Uses `google_rating` (real user ratings)
- Otherwise: Returns `0` (quality score no longer used for rating)
- Quality score is available separately as `qualityScore` field (0-10)

### Google Places Enrichment (Optional)

✅ **Now Available!** Enrich cafes with real Google Places ratings and reviews.

**Data added:**
- Real user ratings (1.0-5.0 stars)
- Review counts
- Price levels (1-4, $-$$$$)
- Photo references

**Cost:**
- **First 5,000 requests/month**: FREE ✅
- After 5,000: $17 per 1,000 requests
- See [GOOGLE_PLACES_COSTS.md](GOOGLE_PLACES_COSTS.md) for detailed cost breakdown

**Setup Required:**

1. **Get Google Places API Key:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Enable [Places API (New)](https://console.cloud.google.com/apis/library/places-backend.googleapis.com)
   - Create API key in [Credentials](https://console.cloud.google.com/apis/credentials)
   - **Important:** Set up billing (required for Places API, but first 5,000/month are free)

2. **Monitor Costs:**
   - View API usage in [Google Cloud Console - Billing](https://console.cloud.google.com/billing)
   - Set up billing alerts: [Billing Budgets](https://console.cloud.google.com/billing/budgets)
   - Check Places API quotas: [API & Services - Quotas](https://console.cloud.google.com/apis/api/places-backend.googleapis.com/quotas)

3. **Add to `.env` file:**
   ```env
   GOOGLE_PLACES_API_KEY="your_api_key_here"
   ```

4. **See full guide:**
   - [GOOGLE_PLACES_PLAN.md](GOOGLE_PLACES_PLAN.md) - Complete setup instructions
   - [GOOGLE_PLACES_COMMANDS.md](GOOGLE_PLACES_COMMANDS.md) - Quick command reference

**⚠️ CRITICAL: Always Dry-Run First!**

```bash
# Step 1: ALWAYS preview what will happen (FREE, no API calls)
npm run sync:google -- --dry-run

# Step 2: Preview specific city with limit
npm run sync:google -- --dry-run --city Amsterdam --limit 10

# Step 3: If preview looks good, run with small batch first
npm run sync:google -- --city Amsterdam --limit 10

# Step 4: Gradually increase batch size
npm run sync:google -- --city Amsterdam --limit 50
```

**Important Safety Features:**
- ✅ **Manual execution only** - Script blocks in CI/CD to prevent accidental charges
- ✅ **Default limit: 5,000 cafes** - Stays within free tier
- ✅ **Incremental sync** - Only processes new/changed cafes
- ✅ **Cost tracking** - Shows estimated costs before and actual costs after
- ✅ **Progress reporting** - Real-time updates every 50 cafes

**Cost Optimization:**
- Process up to **5,000 cafes/month for FREE** (resets monthly)
- Spread large datasets across multiple months
- Use `--missing-only` to only fetch new cafes
- Use `--city` to process specific cities
- See [GOOGLE_PLACES_COSTS.md](GOOGLE_PLACES_COSTS.md) for detailed strategies

---

## 🔒 Rate Limiting

Default: **100 requests per 15 minutes** per IP address.

Can be configured with Redis for distributed systems. See [RATE_LIMITING.md](RATE_LIMITING.md) for details.

---

## 🌐 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables:
   - `DATABASE_URL` = your Supabase connection string
   - `GOOGLE_PLACES_API_KEY` = your Google Places API key (optional)
4. Deploy!

The API automatically works as serverless functions.

### Other Platforms

Works on any Node.js hosting:
- Railway
- Render
- Fly.io
- AWS Lambda
- Google Cloud Run

---

## 📖 Documentation

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup instructions
- **[QUICK_START.md](QUICK_START.md)** - 15-minute quick start
- **[API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md)** - Schema changes and frontend migration
- **[RATE_LIMITING.md](RATE_LIMITING.md)** - Rate limiting configuration
- **[GOOGLE_PLACES_PLAN.md](GOOGLE_PLACES_PLAN.md)** - Google Places integration guide
- **[GOOGLE_PLACES_COSTS.md](GOOGLE_PLACES_COSTS.md)** - Cost analysis and optimization
- **[GOOGLE_PLACES_COMMANDS.md](GOOGLE_PLACES_COMMANDS.md)** - Quick command reference
- **[GOOGLE_PLACES_DATA_FIELDS.md](GOOGLE_PLACES_DATA_FIELDS.md)** - What data we fetch and store

---

## 🧪 Data Quality

Based on OpenStreetMap Netherlands data:

```
Total Cafes: 5,900+
With Website: ~40%
With Phone: ~35%
With Opening Hours: ~60%
With WiFi Info: ~25%
Average Quality Score: 4.2/10
```

**Top cities by cafe count:**
1. Amsterdam (~1,200)
2. Rotterdam (~600)
3. Utrecht (~400)
4. The Hague (~350)
5. Eindhoven (~200)

---

## 🤝 Contributing

### Improve OSM Data

The best way to improve this API is to improve OpenStreetMap data!

1. Visit [openstreetmap.org](https://www.openstreetmap.org)
2. Find a cafe with missing info
3. Edit and add details (website, hours, amenities)
4. Run `npm run sync:osm` to update your database

Your edits benefit everyone using OSM data!

### Report Issues

- API bugs: Open an issue in this repo
- Data issues: Edit on OpenStreetMap

---

## 📄 License

ISC

---

## 🙏 Acknowledgments

- **OpenStreetMap** contributors for the data
- **Overpass API** for the query interface
- **Fastify** for the excellent web framework
- **Prisma** for type-safe database access
- **Supabase** for managed PostgreSQL hosting
- **Google Places API** for ratings and reviews

---

## 🔮 Roadmap

- [x] OpenStreetMap integration
- [x] 5,900+ real cafes
- [x] Quality scoring system
- [x] Production deployment
- [x] Google Places enrichment (ratings, reviews, prices)
- [ ] Proximity search ("cafes near me")
- [ ] Real-time opening status
- [ ] Admin dashboard
- [ ] Photo display using Google photo references

---

## 📞 Support

- Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for setup help
- Review [API_MIGRATION_GUIDE.md](API_MIGRATION_GUIDE.md) for schema details
- Test with Swagger UI at `/docs`
- See [GOOGLE_PLACES_PLAN.md](GOOGLE_PLACES_PLAN.md) for Google Places setup

---

**Built with ☕ and TypeScript**
