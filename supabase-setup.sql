-- ============================================
-- Coffee Places Database Schema for Supabase
-- ============================================
-- This schema supports both OpenStreetMap and Google Places data
-- Phase 1: OSM data (free)
-- Phase 2: Google Places enrichment (optional)

-- Create the main coffee_places table
CREATE TABLE coffee_places (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id BIGINT UNIQUE, -- OpenStreetMap ID (node/way/relation ID)
  osm_type VARCHAR(20), -- 'node', 'way', or 'relation'

  -- Basic information (from OSM)
  name VARCHAR(255) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lon DECIMAL(10, 7) NOT NULL,

  -- Address information
  address_street VARCHAR(255),
  address_housenumber VARCHAR(20),
  address_postcode VARCHAR(20),
  address_city VARCHAR(100),
  address_full TEXT, -- Combined full address

  -- Contact information
  phone VARCHAR(50),
  website VARCHAR(500),
  email VARCHAR(255),

  -- Opening hours (OSM format: "Mo-Fr 08:00-18:00; Sa-Su 09:00-17:00")
  opening_hours TEXT,
  opening_hours_start VARCHAR(5), -- Simplified format: "08:00" (for backward compatibility)
  opening_hours_end VARCHAR(5),   -- Simplified format: "18:00"

  -- Amenities and features (from OSM tags)
  has_wifi BOOLEAN DEFAULT false,
  has_outdoor_seating BOOLEAN DEFAULT false,
  has_wheelchair_access BOOLEAN DEFAULT false,
  has_takeaway BOOLEAN DEFAULT false,
  has_delivery BOOLEAN DEFAULT false,
  smoking VARCHAR(20), -- 'yes', 'no', 'outside', 'separated'

  -- Tags for filtering (array of strings)
  tags TEXT[], -- e.g., ['wifi', 'outdoor', 'cozy', 'quiet']

  -- Quality indicators (calculated from available data)
  quality_score INTEGER DEFAULT 0, -- 0-10 based on data completeness
  is_verified BOOLEAN DEFAULT false, -- Has website + phone + hours

  -- Google Places data (Phase 2 - optional)
  google_place_id VARCHAR(255) UNIQUE,
  google_rating DECIMAL(2, 1), -- 1.0-5.0
  google_review_count INTEGER,
  google_price_level INTEGER, -- 1-4 ($-$$$$)
  google_photo_references TEXT[], -- Array of Google photo reference IDs

  -- Metadata
  data_source VARCHAR(20) DEFAULT 'osm', -- 'osm', 'google', 'hybrid'
  osm_last_sync TIMESTAMP WITH TIME ZONE,
  google_last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable extensions for geospatial queries (MUST be done before creating indexes)
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Create indexes for fast queries
CREATE INDEX idx_coffee_places_city ON coffee_places(address_city);
CREATE INDEX idx_coffee_places_location ON coffee_places USING GIST (
  ll_to_earth(lat::float8, lon::float8)
); -- For proximity searches (requires earthdistance extension)
CREATE INDEX idx_coffee_places_rating ON coffee_places(google_rating) WHERE google_rating IS NOT NULL;
CREATE INDEX idx_coffee_places_quality ON coffee_places(quality_score);
CREATE INDEX idx_coffee_places_tags ON coffee_places USING GIN(tags);
CREATE INDEX idx_coffee_places_osm_id ON coffee_places(osm_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_coffee_places_updated_at
  BEFORE UPDATE ON coffee_places
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a view for backward compatibility with existing API
CREATE OR REPLACE VIEW coffee_places_simple AS
SELECT
  id::text,
  name,
  address_city as city,
  COALESCE(google_rating, quality_score::decimal / 2.0) as rating, -- Convert quality_score (0-10) to rating (0-5)
  CASE
    WHEN opening_hours_start IS NOT NULL AND opening_hours_end IS NOT NULL
    THEN jsonb_build_object('start', opening_hours_start, 'end', opening_hours_end)
    ELSE NULL
  END as "openHours",
  tags
FROM coffee_places;

-- Create sync log table to track data updates
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL, -- 'osm_full', 'osm_incremental', 'google_enrichment', 'google_refresh'
  status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
  records_processed INTEGER DEFAULT 0,
  records_added INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB -- Store additional sync information
);

CREATE INDEX idx_sync_logs_type ON sync_logs(sync_type);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Insert some comments for documentation
COMMENT ON TABLE coffee_places IS 'Stores coffee shop/cafe data from OpenStreetMap and optionally enriched with Google Places ratings';
COMMENT ON COLUMN coffee_places.osm_id IS 'Original OpenStreetMap feature ID';
COMMENT ON COLUMN coffee_places.quality_score IS 'Calculated score 0-10 based on data completeness (has_website=2, has_phone=1, has_hours=2, has_outdoor=1, has_wifi=1, has_wheelchair=1, recently_updated=2)';
COMMENT ON COLUMN coffee_places.is_verified IS 'True if place has website AND phone AND opening hours';
COMMENT ON COLUMN coffee_places.google_place_id IS 'Google Places API place_id for enrichment lookups';
COMMENT ON TABLE sync_logs IS 'Tracks data synchronization operations from OSM and Google Places APIs';

-- Create a function to calculate quality score
CREATE OR REPLACE FUNCTION calculate_quality_score(place coffee_places)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Website = 2 points
  IF place.website IS NOT NULL AND place.website != '' THEN
    score := score + 2;
  END IF;

  -- Phone = 1 point
  IF place.phone IS NOT NULL AND place.phone != '' THEN
    score := score + 1;
  END IF;

  -- Opening hours = 2 points
  IF place.opening_hours IS NOT NULL AND place.opening_hours != '' THEN
    score := score + 2;
  END IF;

  -- Outdoor seating = 1 point
  IF place.has_outdoor_seating = true THEN
    score := score + 1;
  END IF;

  -- WiFi = 1 point
  IF place.has_wifi = true THEN
    score := score + 1;
  END IF;

  -- Wheelchair access = 1 point
  IF place.has_wheelchair_access = true THEN
    score := score + 1;
  END IF;

  -- Recently updated (within 6 months) = 2 points
  IF place.osm_last_sync IS NOT NULL AND place.osm_last_sync > NOW() - INTERVAL '6 months' THEN
    score := score + 1;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- Sample Queries (for testing)
-- ============================================

-- After running the schema, you can test with:

-- 1. Get all cafes in Amsterdam with quality score > 5
-- SELECT * FROM coffee_places WHERE address_city = 'Amsterdam' AND quality_score > 5;

-- 2. Get cafes with WiFi and outdoor seating
-- SELECT * FROM coffee_places WHERE has_wifi = true AND has_outdoor_seating = true;

-- 3. Get top-rated cafes (when Google data is available)
-- SELECT name, address_city, google_rating, google_review_count
-- FROM coffee_places
-- WHERE google_rating IS NOT NULL
-- ORDER BY google_rating DESC, google_review_count DESC
-- LIMIT 10;

-- 4. Find cafes near a location (within 5km)
-- SELECT name, address_city,
--   earth_distance(ll_to_earth(lat::float8, lon::float8), ll_to_earth(52.3676, 4.9041))::integer as distance_meters
-- FROM coffee_places
-- WHERE earth_box(ll_to_earth(52.3676, 4.9041), 5000) @> ll_to_earth(lat::float8, lon::float8)
-- ORDER BY distance_meters
-- LIMIT 20;
