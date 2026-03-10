import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

/**
 * GDELT Conflict Events Fetcher.
 * Downloads the latest GDELT v2 event export (15-minute intervals),
 * filters for conflict/military events with valid coordinates.
 *
 * CAMEO event root codes for conflict:
 *   14 = Protest, 17 = Coerce, 18 = Assault, 19 = Fight, 20 = Use of force
 * QuadClass 3 = Verbal conflict, 4 = Material conflict
 */

const GDELT_LAST_UPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

// CAMEO root codes that indicate conflict/military activity
const CONFLICT_ROOT_CODES = new Set(['14', '17', '18', '19', '20']);

// GDELT v2 export column indices (0-based)
const COL = {
  EVENT_DATE: 1,      // SQLDATE (YYYYMMDD)
  ACTOR1_NAME: 6,     // Actor1Name
  ACTOR1_TYPE: 12,    // Actor1Type1Code (GOV, MIL, REB, etc.)
  ACTOR2_NAME: 16,    // Actor2Name
  ACTOR2_TYPE: 22,    // Actor2Type1Code
  EVENT_CODE: 26,     // EventCode
  EVENT_BASE: 27,     // EventBaseCode
  EVENT_ROOT: 28,     // EventRootCode
  QUAD_CLASS: 29,     // QuadClass (1-4)
  GOLDSTEIN: 30,      // GoldsteinScale (-10 to +10)
  NUM_MENTIONS: 31,   // NumMentions
  NUM_SOURCES: 32,    // NumSources
  NUM_ARTICLES: 33,   // NumArticles
  AVG_TONE: 34,       // AvgTone
  ACTION_GEO_TYPE: 51,  // ActionGeo_Type
  ACTION_GEO_NAME: 52,  // ActionGeo_FullName
  ACTION_GEO_LAT: 56,   // ActionGeo_Lat
  ACTION_GEO_LON: 57,   // ActionGeo_Long
  SOURCE_URL: 60,        // SOURCEURL
} as const;

interface GDELTExportLine {
  cols: string[];
}

export class GDELTConflictFetcher extends BaseFetcher {
  readonly sourceId = 'conflict_events';
  readonly displayName = 'GDELT Conflict Events';
  readonly defaultInterval = '0 */15 * * * *'; // every 15 minutes
  readonly cacheTTL = 900; // 15 minutes

  async fetchRaw(): Promise<string> {
    // Step 1: Get the latest export file URL
    const updateResponse = await fetch(GDELT_LAST_UPDATE_URL);
    if (!updateResponse.ok) {
      throw new Error(`GDELT lastupdate returned ${updateResponse.status}`);
    }

    const updateText = await updateResponse.text();
    const lines = updateText.trim().split('\n');
    // First line is the export CSV URL
    const exportLine = lines.find((l) => l.includes('.export.CSV.zip'));
    if (!exportLine) {
      throw new Error('Could not find export URL in GDELT lastupdate');
    }

    const exportUrl = exportLine.split(/\s+/).pop();
    if (!exportUrl) throw new Error('Empty export URL');

    // Step 2: Download the ZIP file
    const zipResponse = await fetch(exportUrl);
    if (!zipResponse.ok) {
      throw new Error(`GDELT export download failed: ${zipResponse.status}`);
    }

    const zipBuffer = await zipResponse.arrayBuffer();

    // Step 3: Extract CSV from ZIP (simple ZIP extraction for single-file archives)
    const csvText = await this.extractCsvFromZip(Buffer.from(zipBuffer));
    return csvText;
  }

  /**
   * Simple ZIP extraction for single-file GDELT archives.
   * Uses Node's built-in zlib for deflate decompression.
   */
  private async extractCsvFromZip(zipBuffer: Buffer): Promise<string> {
    const { createInflateRaw } = await import('node:zlib');
    const { promisify } = await import('node:util');

    // Find local file header (PK\x03\x04)
    let offset = 0;
    if (
      zipBuffer[0] !== 0x50 ||
      zipBuffer[1] !== 0x4b ||
      zipBuffer[2] !== 0x03 ||
      zipBuffer[3] !== 0x04
    ) {
      throw new Error('Invalid ZIP file');
    }

    // Parse local file header
    const compressionMethod = zipBuffer.readUInt16LE(8);
    const compressedSize = zipBuffer.readUInt32LE(18);
    const fileNameLength = zipBuffer.readUInt16LE(26);
    const extraFieldLength = zipBuffer.readUInt16LE(28);

    offset = 30 + fileNameLength + extraFieldLength;
    const compressedData = zipBuffer.subarray(offset, offset + compressedSize);

    if (compressionMethod === 0) {
      // Stored (no compression)
      return compressedData.toString('utf-8');
    }

    if (compressionMethod === 8) {
      // Deflate
      const inflateRaw = promisify(
        (buf: Buffer, cb: (err: Error | null, result: Buffer) => void) => {
          const inflate = createInflateRaw();
          const chunks: Buffer[] = [];
          inflate.on('data', (chunk: Buffer) => chunks.push(chunk));
          inflate.on('end', () => cb(null, Buffer.concat(chunks)));
          inflate.on('error', (err: Error) => cb(err, Buffer.alloc(0)));
          inflate.write(buf);
          inflate.end();
        },
      );
      const decompressed = await inflateRaw(compressedData);
      return decompressed.toString('utf-8');
    }

    throw new Error(`Unsupported compression method: ${compressionMethod}`);
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const csvText = raw as string;
    const now = Date.now();
    const lines = csvText.split('\n');
    const features: LayerFeature[] = [];
    const seen = new Set<string>(); // deduplicate by location

    for (const line of lines) {
      if (!line.trim()) continue;

      const cols = line.split('\t');
      if (cols.length < 58) continue;

      const eventRoot = cols[COL.EVENT_ROOT];
      const quadClass = cols[COL.QUAD_CLASS];

      // Filter: only conflict events (QuadClass 3 or 4, or specific root codes)
      const isConflict =
        quadClass === '3' || quadClass === '4' ||
        CONFLICT_ROOT_CODES.has(eventRoot);

      if (!isConflict) continue;

      const lat = parseFloat(cols[COL.ACTION_GEO_LAT]);
      const lon = parseFloat(cols[COL.ACTION_GEO_LON]);
      if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

      // Deduplicate nearby events
      const locKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${eventRoot}`;
      if (seen.has(locKey)) continue;
      seen.add(locKey);

      const actor1 = cols[COL.ACTOR1_NAME] || 'Unknown';
      const actor2 = cols[COL.ACTOR2_NAME] || '';
      const actor1Type = cols[COL.ACTOR1_TYPE] || '';
      const goldstein = parseFloat(cols[COL.GOLDSTEIN]) || 0;
      const numMentions = parseInt(cols[COL.NUM_MENTIONS]) || 0;
      const numArticles = parseInt(cols[COL.NUM_ARTICLES]) || 0;
      const avgTone = parseFloat(cols[COL.AVG_TONE]) || 0;
      const geoName = cols[COL.ACTION_GEO_NAME] || 'Unknown Location';
      const sourceUrl = cols[COL.SOURCE_URL] || '';
      const eventDate = cols[COL.EVENT_DATE] || '';

      // Map CAMEO root codes to human-readable labels
      let eventLabel = 'Conflict Event';
      switch (eventRoot) {
        case '14': eventLabel = 'Protest'; break;
        case '17': eventLabel = 'Coercion'; break;
        case '18': eventLabel = 'Assault'; break;
        case '19': eventLabel = 'Armed Conflict'; break;
        case '20': eventLabel = 'Use of Force'; break;
      }

      // Is this military-related?
      const isMilitary = actor1Type === 'MIL' ||
        cols[COL.ACTOR2_TYPE] === 'MIL' ||
        actor1Type === 'GOV' ||
        eventRoot === '19' || eventRoot === '20';

      // Severity from Goldstein scale (negative = more severe)
      let severity = 0;
      if (goldstein <= -8) severity = 1.0;
      else if (goldstein <= -5) severity = 0.75;
      else if (goldstein <= -2) severity = 0.5;
      else severity = 0.25;

      const label = actor2
        ? `${eventLabel}: ${actor1} → ${actor2}`
        : `${eventLabel}: ${actor1}`;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `conflict_${locKey}`,
          layer: 'conflict_events',
          label: label.length > 80 ? label.slice(0, 77) + '...' : label,
          timestamp: Math.floor(now / 1000),
          category: isMilitary ? 'military' : 'civilian',
          severity,
          eventType: eventLabel,
          eventCode: cols[COL.EVENT_CODE],
          actor1,
          actor2,
          actor1Type,
          goldstein,
          numMentions,
          numArticles,
          avgTone,
          geoName,
          sourceUrl,
          eventDate,
          isMilitary,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'gdelt',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 900_000,
      },
    };
  }
}
