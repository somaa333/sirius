import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import DashboardFilters from "../components/dashboard/DashboardFilters.jsx";
import KpiCard from "../components/dashboard/KpiCard.jsx";
import EventsTable from "../components/dashboard/EventsTable.jsx";
import EventSizeDistributionChart from "../components/dashboard/EventSizeDistributionChart.jsx";
import EventsOverTimeChart from "../components/dashboard/EventsOverTimeChart.jsx";
import { fetchEventSummariesFromCdmRecords } from "../data/cdmEventData.js";
import { fetchDashboardWeeklyTrendLines } from "../data/dashboardTrendData.js";
import { useToast } from "../components/toast/ToastProvider.jsx";

const today = new Date();
const DEFAULT_DATE_END = today.toISOString().slice(0, 10);
const start = new Date(today);
start.setUTCDate(start.getUTCDate() - 30);
const DEFAULT_DATE_START = start.toISOString().slice(0, 10);

function isTimestampInRange(timestamp, dateStart, dateEnd) {
  const iso = String(timestamp ?? "");
  const day = iso.slice(0, 10);
  if (!day) return false;
  return day >= dateStart && day <= dateEnd;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { pushToast } = useToast();

  const [dateStart, setDateStart] = useState(DEFAULT_DATE_START);
  const [dateEnd, setDateEnd] = useState(DEFAULT_DATE_END);
  const [search, setSearch] = useState("");
  /** `'all'` or stringified CDM count to filter the events table */
  const [cdmCountFilter, setCdmCountFilter] = useState(
    /** @type {'all' | string} */ ("all"),
  );
  const [actualEventsFromDb, setActualEventsFromDb] = useState([]);
  const [actualEventsLoading, setActualEventsLoading] = useState(false);
  const [actualEventsError, setActualEventsError] = useState(
    /** @type {string | null} */ (null),
  );
  const [actualEventsDiagnostics, setActualEventsDiagnostics] = useState(
    /** @type {{
     * rawFetchedCount: number,
     * validRecordsCount: number,
     * skippedMissingEventId: number,
     * groupedEventCount: number,
     * eventSummariesCount: number
     * } | null} */ (null),
  );
  const [weeklyTrendLines, setWeeklyTrendLines] = useState(null);
  const [weeklyTrendLoading, setWeeklyTrendLoading] = useState(true);

  const loadActualCdmData = useCallback(async () => {
    setActualEventsLoading(true);
    setActualEventsError(null);
    setWeeklyTrendLoading(true);
    try {
      const [summaryPack, trendLines] = await Promise.all([
        fetchEventSummariesFromCdmRecords(user.id),
        fetchDashboardWeeklyTrendLines(user.id).catch(() => null),
      ]);
      const { summaries, diagnostics } = summaryPack;
      console.info("[Dashboard] raw fetched records count:", diagnostics.rawFetchedCount);
      console.info("[Dashboard] valid records after cleanup:", diagnostics.validRecordsCount);
      console.info("[Dashboard] grouped event count:", diagnostics.groupedEventCount);
      console.info("[Dashboard] event summaries count:", diagnostics.eventSummariesCount);
      setActualEventsFromDb(summaries);
      setActualEventsDiagnostics(diagnostics);
      setActualEventsError(null);
      setWeeklyTrendLines(trendLines);
      return { ok: true };
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String(/** @type {{ message?: string }} */ (err).message)
          : "Failed to load actual CDM records.";
      setActualEventsFromDb([]);
      setActualEventsDiagnostics(null);
      setActualEventsError(msg);
      setWeeklyTrendLines(null);
      pushToast(`CDM data load failed: ${msg}`, "error");
      return { ok: false, error: msg };
    } finally {
      setActualEventsLoading(false);
      setWeeklyTrendLoading(false);
    }
  }, [pushToast, user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  /** Re-fetch only when the signed-in user changes — not on every access-token refresh. */
  useEffect(() => {
    if (!user?.id) return;
    loadActualCdmData();
  }, [user?.id, loadActualCdmData]);

  const filteredEventsByDateAndSearch = useMemo(() => {
    return actualEventsFromDb.filter((e) => {
      if (!isTimestampInRange(e.timestamp, dateStart, dateEnd)) return false;
      const q = search.trim().toLowerCase();
      if (q && !String(e.id).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [actualEventsFromDb, dateStart, dateEnd, search]);

  const cdmCountOptions = useMemo(() => {
    const set = new Set();
    for (const e of filteredEventsByDateAndSearch) {
      const n = Number(e.cdmCount);
      if (Number.isFinite(n) && n >= 0) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }, [filteredEventsByDateAndSearch]);

  useEffect(() => {
    if (cdmCountFilter === "all") return;
    const n = Number(cdmCountFilter);
    if (!Number.isFinite(n) || !cdmCountOptions.includes(n)) {
      setCdmCountFilter("all");
    }
  }, [cdmCountFilter, cdmCountOptions]);

  const filteredEventSummaries = useMemo(() => {
    if (cdmCountFilter === "all") return filteredEventsByDateAndSearch;
    const want = Number(cdmCountFilter);
    if (!Number.isFinite(want)) return filteredEventsByDateAndSearch;
    return filteredEventsByDateAndSearch.filter(
      (e) => Number(e.cdmCount) === want,
    );
  }, [filteredEventsByDateAndSearch, cdmCountFilter]);

  useEffect(() => {
    if (!actualEventsFromDb.length) return;
    const inCurrentRange = actualEventsFromDb.some((e) =>
      isTimestampInRange(e.timestamp, dateStart, dateEnd),
    );
    if (inCurrentRange) return;
    const sorted = [...actualEventsFromDb].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    const first = sorted[0]?.timestamp?.slice(0, 10);
    const last = sorted[sorted.length - 1]?.timestamp?.slice(0, 10);
    if (!first || !last) return;
    setDateStart(first);
    setDateEnd(last);
    console.info("[Dashboard] adjusted date range to real CDM data", {
      dateStart: first,
      dateEnd: last,
    });
  }, [actualEventsFromDb, dateStart, dateEnd]);

  const kpis = useMemo(() => {
    const n = filteredEventsByDateAndSearch.length;
    const totalCdms = filteredEventsByDateAndSearch.reduce(
      (sum, e) => sum + Number(e.cdmCount ?? 0),
      0,
    );
    const avgCdmsPerEvent = n === 0 ? 0 : totalCdms / n;
    return {
      totalEvents: n,
      totalCdms,
      avgCdmsPerEvent,
    };
  }, [filteredEventsByDateAndSearch]);

  const eventSizeDistribution = useMemo(() => {
    let maxCdmCount = 0;
    for (const e of filteredEventsByDateAndSearch) {
      const c = Number(e.cdmCount ?? 0);
      if (Number.isFinite(c) && c > maxCdmCount) {
        maxCdmCount = Math.floor(c);
      }
    }
    if (maxCdmCount < 1) return [];
    if (maxCdmCount <= 5) {
      const byCount = new Map();
      for (let n = 1; n <= maxCdmCount; n += 1) {
        byCount.set(n, 0);
      }
      for (const e of filteredEventsByDateAndSearch) {
        const c = Math.floor(Number(e.cdmCount ?? 0));
        if (!Number.isFinite(c) || c < 1) continue;
        if (!byCount.has(c)) byCount.set(c, 0);
        byCount.set(c, (byCount.get(c) ?? 0) + 1);
      }
      const total = [...byCount.values()].reduce((sum, v) => sum + v, 0);
      return [...byCount.entries()].map(([count, events]) => ({
        key: String(count),
        bucket: String(count),
        events,
        pct: total === 0 ? 0 : Math.round((events / total) * 100),
      }));
    }

    // For larger maxima, group into stepped bins (max 5 columns): e.g. 1-2, 3-4, 5-6...
    const step = Math.ceil(maxCdmCount / 5);
    const bins = [];
    let lower = 1;
    while (lower <= maxCdmCount && bins.length < 5) {
      const upper = Math.min(maxCdmCount, lower + step - 1);
      bins.push({ lower, upper, events: 0 });
      lower = upper + 1;
    }

    for (const e of filteredEventsByDateAndSearch) {
      const c = Math.floor(Number(e.cdmCount ?? 0));
      if (!Number.isFinite(c) || c < 1) continue;
      const hit = bins.find((b) => c >= b.lower && c <= b.upper);
      if (hit) hit.events += 1;
    }

    const total = bins.reduce((sum, b) => sum + b.events, 0);
    return bins.map((b) => ({
      key: `${b.lower}-${b.upper}`,
      bucket: String(b.upper),
      events: b.events,
      pct: total === 0 ? 0 : Math.round((b.events / total) * 100),
    }));
  }, [filteredEventsByDateAndSearch]);

  const eventsOverTime = useMemo(() => {
    /** @type {Map<string, number>} */
    const byDate = new Map();
    for (const e of filteredEventsByDateAndSearch) {
      const day = String(e.timestamp ?? "").slice(0, 10);
      if (!day) continue;
      byDate.set(day, (byDate.get(day) ?? 0) + 1);
    }
    const points = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, label: date.slice(5), events: count }));
    if (points.length <= 7) return points;

    // Keep at most 7 x-axis points by grouping consecutive days.
    const step = Math.ceil(points.length / 7);
    const grouped = [];
    for (let i = 0; i < points.length; i += step) {
      const chunk = points.slice(i, i + step);
      if (chunk.length === 0) continue;
      const startDate = chunk[0].date;
      const endDate = chunk[chunk.length - 1].date;
      const totalEvents = chunk.reduce((sum, p) => sum + p.events, 0);
      grouped.push({
        date: startDate === endDate ? startDate : `${startDate} → ${endDate}`,
        label: endDate.slice(5),
        events: totalEvents,
      });
    }
    return grouped;
  }, [filteredEventsByDateAndSearch]);

  if (loading || !user) {
    return null;
  }

  return (
    <>
      <DashboardPageLayout title="Dashboard">
        <DashboardFilters
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateStartChange={setDateStart}
          onDateEndChange={setDateEnd}
        />

          <section className="dash-kpi-grid" aria-label="CDM and event KPIs">
            <KpiCard
              title="Total CDM events"
              value={String(kpis.totalEvents)}
              infoText="Number of unique CDM events based on event_id."
              trend={weeklyTrendLines?.events}
              trendLoading={weeklyTrendLoading}
            />
            <KpiCard
              title="Total CDM rows"
              value={String(kpis.totalCdms)}
              infoText="Total CDM records stored for the available events."
              trend={weeklyTrendLines?.rows}
              trendLoading={weeklyTrendLoading}
            />
            <KpiCard
              title="Average CDMs per event"
              value={kpis.avgCdmsPerEvent.toFixed(1)}
              trend={weeklyTrendLines?.avg}
              trendLoading={weeklyTrendLoading}
            />
          </section>

          <div className="dash-widget-row" aria-label="Event analytics widgets">
            <EventSizeDistributionChart data={eventSizeDistribution} />
            <EventsOverTimeChart data={eventsOverTime} />
          </div>

          <EventsTable
            events={filteredEventSummaries}
            cdmCountOptions={cdmCountOptions}
            cdmCountFilter={cdmCountFilter}
            onCdmCountFilterChange={setCdmCountFilter}
            search={search}
            onSearchChange={setSearch}
            onRefreshAfterMutations={loadActualCdmData}
            loading={actualEventsLoading}
            error={actualEventsError}
            emptyMessage={buildEventEmptyStateMessage(
              actualEventsDiagnostics,
              filteredEventSummaries.length,
              filteredEventsByDateAndSearch.length,
              search,
              dateStart,
              dateEnd,
              cdmCountFilter,
            )}
          />

      </DashboardPageLayout>
    </>
  );
}

/**
 * @param {{
 * rawFetchedCount: number,
 * validRecordsCount: number,
 * skippedMissingEventId: number,
 * groupedEventCount: number,
 * eventSummariesCount: number
 * } | null} diagnostics
 * @param {number} filteredEventCount
 * @param {number} eventsAfterDateAndSearchCount
 * @param {string} search
 * @param {string} dateStart
 * @param {string} dateEnd
 * @param {'all' | string} cdmCountFilter
 */
function buildEventEmptyStateMessage(
  diagnostics,
  filteredEventCount,
  eventsAfterDateAndSearchCount,
  search,
  dateStart,
  dateEnd,
  cdmCountFilter,
) {
  if (!diagnostics) return "No CDM events match the current filters or search.";
  if (diagnostics.rawFetchedCount === 0) {
    return "No rows were returned from cdm_records for this user.";
  }
  if (diagnostics.validRecordsCount === 0) {
    return "Rows were fetched, but none had a valid event_id.";
  }
  if (diagnostics.groupedEventCount === 0) {
    return "CDM rows were fetched, but no event groups could be built.";
  }
  if (filteredEventCount === 0) {
    if (
      cdmCountFilter !== "all" &&
      eventsAfterDateAndSearchCount > 0
    ) {
      return `No events with exactly ${cdmCountFilter} CDM(s) in the current selection.`;
    }
    if (search.trim()) {
      return "Events exist, but none match your search term.";
    }
    return `Events exist, but none fall in the selected date range (${dateStart} to ${dateEnd}).`;
  }
  return "No CDM events match the current filters or search.";
}
