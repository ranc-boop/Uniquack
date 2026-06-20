import { createHash, randomBytes } from "node:crypto";

import {
  PAGE_VISIT_CACHE_TTL_SECONDS,
  PAGE_VISIT_GEO_HEADERS,
  PAGE_VISIT_IP_HASH_SALT,
  PAGE_VISIT_IP_HEADERS,
} from "@/lib/page-visits/constants";

export type GeoResult = {
  country_code: string | null;
  country_name: string | null;
};

const memoryCache = new Map<
  string,
  { result: GeoResult; expiresAt: number }
>();

function cleanupCacheIfNeeded() {
  if (memoryCache.size < 2000) return;
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt < now) memoryCache.delete(key);
  }
}

export function hashIp(ip: string): string {
  const trimmed = (ip || "").trim();
  if (!trimmed) {
    return createHash("sha256")
      .update(randomBytes(32).toString("hex") + "|" + PAGE_VISIT_IP_HASH_SALT)
      .digest("hex");
  }
  return createHash("sha256")
    .update(trimmed + "|" + PAGE_VISIT_IP_HASH_SALT)
    .digest("hex");
}

export function extractIpFromHeaders(headers: Headers): string | null {
  for (const headerName of PAGE_VISIT_IP_HEADERS) {
    const raw = headers.get(headerName);
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

function normalizeCountryCode(code: string | null): string | null {
  if (!code) return null;
  const up = code.trim().toUpperCase();
  if (up.length !== 2) return null;
  if (up === "XX" || up === "T1" || up === "LOCAL") return null;
  return up;
}

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua and Barbuda",
  AI: "Anguilla", AL: "Albania", AM: "Armenia", AO: "Angola", AQ: "Antarctica",
  AR: "Argentina", AS: "American Samoa", AT: "Austria", AU: "Australia", AW: "Aruba",
  AX: "Aland Islands", AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BB: "Barbados",
  BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain",
  BI: "Burundi", BJ: "Benin", BL: "Saint Barthelemy", BM: "Bermuda", BN: "Brunei",
  BO: "Bolivia", BQ: "Bonaire", BR: "Brazil", BS: "Bahamas", BT: "Bhutan",
  BV: "Bouvet Island", BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada",
  CC: "Cocos Islands", CD: "Congo", CF: "Central African Republic", CG: "Congo",
  CH: "Switzerland", CI: "Ivory Coast", CK: "Cook Islands", CL: "Chile", CM: "Cameroon",
  CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba", CV: "Cape Verde",
  CW: "Curacao", CX: "Christmas Island", CY: "Cyprus", CZ: "Czech Republic", DE: "Germany",
  DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic", DZ: "Algeria",
  EC: "Ecuador", EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea",
  ES: "Spain", ET: "Ethiopia", FI: "Finland", FJ: "Fiji", FK: "Falkland Islands",
  FM: "Micronesia", FO: "Faroe Islands", FR: "France", GA: "Gabon", GB: "United Kingdom",
  GD: "Grenada", GE: "Georgia", GF: "French Guiana", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe",
  GQ: "Equatorial Guinea", GR: "Greece", GS: "South Georgia", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong", HM: "Heard Island",
  HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary", ID: "Indonesia",
  IE: "Ireland", IL: "Israel", IM: "Isle of Man", IN: "India", IO: "British Indian Ocean Territory",
  IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy", JE: "Jersey", JM: "Jamaica",
  JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts and Nevis", KP: "North Korea",
  KR: "South Korea", KW: "Kuwait", KY: "Cayman Islands", KZ: "Kazakhstan", LA: "Laos",
  LB: "Lebanon", LC: "Saint Lucia", LI: "Liechtenstein", LK: "Sri Lanka", LR: "Liberia",
  LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "Saint Martin",
  MG: "Madagascar", MH: "Marshall Islands", MK: "Macedonia", ML: "Mali", MM: "Myanmar",
  MN: "Mongolia", MO: "Macao", MP: "Northern Mariana Islands", MQ: "Martinique",
  MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius", MV: "Maldives",
  MW: "Malawi", MX: "Mexico", MY: "Malaysia", MZ: "Mozambique", NA: "Namibia",
  NC: "New Caledonia", NE: "Niger", NF: "Norfolk Island", NG: "Nigeria", NI: "Nicaragua",
  NL: "Netherlands", NO: "Norway", NP: "Nepal", NR: "Nauru", NU: "Niue", NZ: "New Zealand",
  OM: "Oman", PA: "Panama", PE: "Peru", PF: "French Polynesia", PG: "Papua New Guinea",
  PH: "Philippines", PK: "Pakistan", PL: "Poland", PM: "Saint Pierre and Miquelon",
  PN: "Pitcairn", PR: "Puerto Rico", PS: "Palestine", PT: "Portugal", PW: "Palau",
  PY: "Paraguay", QA: "Qatar", RE: "Reunion", RO: "Romania", RS: "Serbia",
  RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia", SB: "Solomon Islands", SC: "Seychelles",
  SD: "Sudan", SE: "Sweden", SG: "Singapore", SH: "Saint Helena", SI: "Slovenia",
  SJ: "Svalbard and Jan Mayen", SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino",
  SN: "Senegal", SO: "Somalia", SR: "Suriname", SS: "South Sudan", ST: "Sao Tome and Principe",
  SV: "El Salvador", SX: "Sint Maarten", SY: "Syria", SZ: "Swaziland", TC: "Turks and Caicos Islands",
  TD: "Chad", TF: "French Southern Territories", TG: "Togo", TH: "Thailand", TJ: "Tajikistan",
  TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan", TN: "Tunisia", TO: "Tonga",
  TR: "Turkey", TT: "Trinidad and Tobago", TV: "Tuvalu", TW: "Taiwan", TZ: "Tanzania",
  UA: "Ukraine", UG: "Uganda", UM: "United States Minor Outlying Islands", US: "United States",
  UY: "Uruguay", UZ: "Uzbekistan", VA: "Vatican City", VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela", VG: "British Virgin Islands", VI: "U.S. Virgin Islands", VN: "Vietnam",
  VU: "Vanuatu", WF: "Wallis and Futuna", WS: "Samoa", YE: "Yemen", YT: "Mayotte",
  ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
};

export function countryNameFromCode(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_CODE_TO_NAME[code] || null;
}

function getCountryFromHeaders(headers: Headers): GeoResult {
  for (const headerName of PAGE_VISIT_GEO_HEADERS) {
    const raw = headers.get(headerName);
    const code = normalizeCountryCode(raw);
    if (code) {
      return { country_code: code, country_name: countryNameFromCode(code) };
    }
  }
  return { country_code: null, country_name: null };
}

async function resolveFromIpInfo(ip: string): Promise<GeoResult> {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return { country_code: null, country_name: null };

  try {
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/country?token=${encodeURIComponent(token)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
      cache: "force-cache",
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { country_code: null, country_name: null };

    const raw = (await res.text()).trim().toUpperCase();
    const code = normalizeCountryCode(raw);
    if (!code) return { country_code: null, country_name: null };

    return { country_code: code, country_name: countryNameFromCode(code) };
  } catch {
    return { country_code: null, country_name: null };
  }
}

export async function resolveCountry(
  ip: string | null,
  headers: Headers,
): Promise<GeoResult> {
  const fromHeaders = getCountryFromHeaders(headers);
  if (fromHeaders.country_code) return fromHeaders;

  if (!ip) return { country_code: null, country_name: null };

  const cacheKey = hashIp(ip);
  const cached = memoryCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.result;

  const result = await resolveFromIpInfo(ip);
  memoryCache.set(cacheKey, {
    result,
    expiresAt: now + PAGE_VISIT_CACHE_TTL_SECONDS * 1000,
  });
  cleanupCacheIfNeeded();
  return result;
}
