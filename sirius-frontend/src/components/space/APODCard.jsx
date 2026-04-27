import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { getApodUrl } from "../../config/spaceApi";
import "./spaceCards.css";

const MotionSection = motion.section;
const MotionImg = motion.img;
const MotionP = motion.p;

const CACHE_KEY = "sirius_apod_cache_v1";
const TRUNCATE = 280;

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function readCache(today) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { date, data } = JSON.parse(raw);
    if (date === today && data?.title) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(today, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, data }));
  } catch {
    /* ignore */
  }
}

export default function APODCard({ className = "" }) {
  const today = useMemo(() => utcToday(), []);
  const [data, setData] = useState(() => readCache(today));
  const [loading, setLoading] = useState(!readCache(today));
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const cached = readCache(today);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApodUrl());
      if (!res.ok) throw new Error("Unable to load live data");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      writeCache(today, json);
    } catch (e) {
      setError(e.message || "Unable to load live data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const explanation = data?.explanation || "";
  const truncated = explanation.length > TRUNCATE && !expanded;
  const textShow = truncated ? `${explanation.slice(0, TRUNCATE).trim()}…` : explanation;

  return (
    <MotionSection
      className={`space-apod-feature ${className}`.trim()}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      aria-label="NASA Astronomy Picture of the Day"
    >
      {loading && (
        <div className="space-skeleton space-apod-feature-skeleton" aria-hidden />
      )}

      {!loading && error && <p className="space-error space-apod-feature-error">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="space-apod-feature-media-wrap">
            {data.media_type === "video" ? (
              <iframe
                className="space-apod-feature-video"
                title={data.title}
                src={data.url}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <MotionImg
                className="space-apod-feature-media"
                src={data.url || data.hdurl}
                alt={data.title || "NASA APOD"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.85, ease: "easeOut" }}
                loading="lazy"
              />
            )}
            <div className="space-apod-feature-meta">
              <p className="space-apod-feature-image-title">{data.title}</p>
              <p className="space-apod-feature-date">{data.date}</p>
            </div>
          </div>

          <div className="space-apod-feature-copy">
            <MotionP
              className="space-apod-feature-explain"
              key={expanded ? "full" : "short"}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {textShow}
            </MotionP>

            {explanation.length > TRUNCATE && (
              <button
                type="button"
                className="space-read-more"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        </>
      )}
    </MotionSection>
  );
}
