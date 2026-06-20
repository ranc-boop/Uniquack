export const PAGE_VISIT_IP_HASH_SALT =
  process.env.PAGE_VISIT_IP_HASH_SALT || "o2i-visit-salt-v1";

export const PAGE_VISIT_CACHE_TTL_SECONDS = 3600;

export const PAGE_VISIT_REQUEST_PATH_PATHS_TO_SKIP: RegExp[] = [
  /^\/_next\//,
  /^\/api\//,
  /^\/favicon\.ico$/,
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot)$/i,
];

export const PAGE_VISIT_GEO_HEADERS = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-country-code",
];

export const PAGE_VISIT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
];
