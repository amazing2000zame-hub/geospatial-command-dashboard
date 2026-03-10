/**
 * OMM (Orbit Mean-elements Message) to TLE (Two-Line Element) converter.
 *
 * CelesTrak returns OMM JSON but satellite.js needs TLE format.
 * TLE is a fixed-width format with strict column positions.
 *
 * References:
 *   https://celestrak.org/columns/v04n03/
 *   https://en.wikipedia.org/wiki/Two-line_element_set
 */

export interface OMMRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;           // e.g. "1998-067A"
  EPOCH: string;               // ISO 8601 e.g. "2026-03-10T12:00:00.000"
  MEAN_MOTION: number;         // rev/day
  ECCENTRICITY: number;
  INCLINATION: number;         // degrees
  RA_OF_ASC_NODE: number;      // degrees
  ARG_OF_PERICENTER: number;   // degrees
  MEAN_ANOMALY: number;        // degrees
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string; // "U" unclassified
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

/**
 * Compute the checksum for a TLE line.
 * Sum all digits in the line (treating '-' as 1), mod 10.
 */
function tleChecksum(line: string): number {
  let sum = 0;
  // Checksum covers columns 1-68 (0-indexed: 0-67)
  for (let i = 0; i < 68; i++) {
    const ch = line[i];
    if (ch >= '0' && ch <= '9') {
      sum += parseInt(ch, 10);
    } else if (ch === '-') {
      sum += 1;
    }
    // Letters, spaces, '+', '.' are ignored
  }
  return sum % 10;
}

/**
 * Format a floating-point number into TLE exponential notation.
 * TLE uses a compact format: " 12345-6" meaning 0.12345e-6
 * The leading "0." is implied, and the exponent sign is embedded.
 *
 * For BSTAR, MEAN_MOTION_DOT, MEAN_MOTION_DDOT fields.
 */
function formatTLEExponential(value: number, width: number): string {
  if (value === 0) {
    return ' 00000-0'.padStart(width);
  }

  const sign = value < 0 ? '-' : ' ';
  const absVal = Math.abs(value);

  // Find exponent such that value = mantissa * 10^exponent
  // where 0.1 <= mantissa < 1.0
  let exponent = Math.floor(Math.log10(absVal)) + 1;
  let mantissa = absVal / Math.pow(10, exponent);

  // Normalize: mantissa should be in [0.1, 1.0)
  if (mantissa >= 1.0) {
    mantissa /= 10;
    exponent += 1;
  }
  if (mantissa < 0.1 && mantissa > 0) {
    mantissa *= 10;
    exponent -= 1;
  }

  // Format mantissa as 5 digits (without leading "0.")
  const mantissaStr = Math.round(mantissa * 100000).toString().padStart(5, '0');

  // Format exponent
  const expSign = exponent >= 0 ? '+' : '-';
  const expStr = Math.abs(exponent).toString();

  const result = `${sign}${mantissaStr}${expSign}${expStr}`;
  return result.padStart(width);
}

/**
 * Format the first derivative of mean motion (MEAN_MOTION_DOT).
 * This uses a different format than BSTAR: it's a decimal with implied leading zero.
 * Format: "-.12345678" or " .12345678" (10 chars total including sign)
 */
function formatMeanMotionDot(value: number): string {
  if (value === 0) {
    return ' .00000000';
  }
  const sign = value < 0 ? '-' : ' ';
  const absVal = Math.abs(value);
  // Format as 8 decimal places without leading zero
  const decimal = absVal.toFixed(8);
  // Remove leading "0" -> ".12345678"
  const withoutLeadingZero = decimal.replace(/^0/, '');
  return `${sign}${withoutLeadingZero}`;
}

/**
 * Parse epoch from ISO date string into TLE epoch format.
 * TLE epoch format: YYDDD.DDDDDDDD
 *   YY = 2-digit year
 *   DDD.DDDDDDDD = day of year with fractional day
 */
function formatTLEEpoch(isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getUTCFullYear();
  const yy = year % 100;

  // Day of year (1-based)
  const startOfYear = Date.UTC(year, 0, 1);
  const diffMs = date.getTime() - startOfYear;
  const dayOfYear = diffMs / 86400000 + 1; // 1-based

  const yyStr = yy.toString().padStart(2, '0');
  const dayStr = dayOfYear.toFixed(8).padStart(12, '0');

  return `${yyStr}${dayStr}`;
}

/**
 * Parse the international designator from OBJECT_ID.
 * Input format: "1998-067A" or "2020-025DEB"
 * TLE format:   "98067A  " (8 chars: YY + launch number + piece, right-padded)
 */
function formatIntlDesignator(objectId: string): string {
  if (!objectId) return '        ';

  // Parse "YYYY-NNNPPP" format
  const match = objectId.match(/^(\d{4})-(\d{3})(.*)$/);
  if (!match) return '        ';

  const year = parseInt(match[1], 10) % 100;
  const launchNum = match[2];
  const piece = match[3] || '';

  const result = `${year.toString().padStart(2, '0')}${launchNum}${piece}`;
  return result.padEnd(8).substring(0, 8);
}

/**
 * Convert an OMM record to TLE line 1 and line 2.
 *
 * TLE Line 1 format (69 chars):
 * Col  Description
 * 01   Line Number (1)
 * 03-07 Satellite Catalog Number
 * 08   Classification (U/C/S)
 * 10-17 International Designator
 * 19-32 Epoch (YYDDD.DDDDDDDD)
 * 34-43 First Derivative of Mean Motion (ballistic coefficient)
 * 45-52 Second Derivative of Mean Motion (decimal point assumed)
 * 54-61 BSTAR drag term (decimal point assumed)
 * 63   Ephemeris Type
 * 65-68 Element Set Number
 * 69   Checksum
 *
 * TLE Line 2 format (69 chars):
 * Col  Description
 * 01   Line Number (2)
 * 03-07 Satellite Catalog Number
 * 09-16 Inclination (degrees)
 * 18-25 Right Ascension of Ascending Node (degrees)
 * 27-33 Eccentricity (decimal point assumed)
 * 35-42 Argument of Perigee (degrees)
 * 44-51 Mean Anomaly (degrees)
 * 53-63 Mean Motion (rev/day)
 * 64-68 Revolution Number at Epoch
 * 69   Checksum
 */
export function ommToTLE(omm: OMMRecord): { line1: string; line2: string } {
  const catNum = omm.NORAD_CAT_ID.toString().padStart(5);
  const classification = omm.CLASSIFICATION_TYPE || 'U';
  const intlDesig = formatIntlDesignator(omm.OBJECT_ID);
  const epoch = formatTLEEpoch(omm.EPOCH);
  const meanMotionDot = formatMeanMotionDot(omm.MEAN_MOTION_DOT / 2);
  const meanMotionDDot = formatTLEExponential(omm.MEAN_MOTION_DDOT / 6, 8);
  const bstar = formatTLEExponential(omm.BSTAR, 8);
  const ephType = (omm.EPHEMERIS_TYPE || 0).toString();
  const elSetNo = omm.ELEMENT_SET_NO.toString().padStart(4);

  // Build line 1 (68 chars before checksum)
  let line1 = '1 ';                           // col 1-2
  line1 += catNum;                            // col 3-7
  line1 += classification;                    // col 8
  line1 += ' ';                               // col 9
  line1 += intlDesig;                         // col 10-17
  line1 += ' ';                               // col 18
  line1 += epoch;                             // col 19-32
  line1 += ' ';                               // col 33
  line1 += meanMotionDot;                     // col 34-43
  line1 += ' ';                               // col 44
  line1 += meanMotionDDot;                    // col 45-52
  line1 += ' ';                               // col 53
  line1 += bstar;                             // col 54-61
  line1 += ' ';                               // col 62
  line1 += ephType;                           // col 63
  line1 += ' ';                               // col 64
  line1 += elSetNo;                           // col 65-68

  // Pad/trim to exactly 68 chars before checksum
  line1 = line1.padEnd(68).substring(0, 68);
  line1 += tleChecksum(line1).toString();     // col 69

  // Line 2
  const inclination = omm.INCLINATION.toFixed(4).padStart(8);
  const raan = omm.RA_OF_ASC_NODE.toFixed(4).padStart(8);
  // Eccentricity: decimal point assumed, 7 digits
  const ecc = omm.ECCENTRICITY.toFixed(7).replace('0.', '').padStart(7, '0');
  const argPerigee = omm.ARG_OF_PERICENTER.toFixed(4).padStart(8);
  const meanAnomaly = omm.MEAN_ANOMALY.toFixed(4).padStart(8);
  const meanMotion = omm.MEAN_MOTION.toFixed(8).padStart(11);
  const revNum = (omm.REV_AT_EPOCH || 0).toString().padStart(5);

  let line2 = '2 ';                           // col 1-2
  line2 += catNum;                            // col 3-7
  line2 += ' ';                               // col 8
  line2 += inclination;                       // col 9-16
  line2 += ' ';                               // col 17
  line2 += raan;                              // col 18-25
  line2 += ' ';                               // col 26
  line2 += ecc;                               // col 27-33
  line2 += ' ';                               // col 34
  line2 += argPerigee;                        // col 35-42
  line2 += ' ';                               // col 43
  line2 += meanAnomaly;                       // col 44-51
  line2 += ' ';                               // col 52
  line2 += meanMotion;                        // col 53-63
  line2 += revNum;                            // col 64-68

  // Pad/trim to exactly 68 chars before checksum
  line2 = line2.padEnd(68).substring(0, 68);
  line2 += tleChecksum(line2).toString();     // col 69

  return { line1, line2 };
}
