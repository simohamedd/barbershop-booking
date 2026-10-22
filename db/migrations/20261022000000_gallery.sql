-- Homepage photo gallery (one image URL per line) and optional year the shop opened.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS gallery_urls text NOT NULL DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS established_year integer CHECK (established_year IS NULL OR established_year BETWEEN 1800 AND 2100);
