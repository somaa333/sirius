/**
 * Space API helpers. NASA key from Vite env with DEMO_KEY fallback.
 */

const NASA_DEMO = "DEMO_KEY";

export function getNasaApiKey() {
  const k = import.meta.env.VITE_NASA_API_KEY;
  return k && String(k).trim() ? String(k).trim() : NASA_DEMO;
}

/** NASA APOD */
export function getApodUrl() {
  const key = getNasaApiKey();
  return `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`;
}
