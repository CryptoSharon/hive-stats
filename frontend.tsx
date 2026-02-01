import React, { useState, useEffect, useMemo, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Activity,
  TrendingUp,
  Users,
  FileText,
  MessageSquare,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Lightbulb,
  ExternalLink,
  Github,
  DollarSign,
  Layers,
  LineChart,
} from "lucide-react";

// CSS is loaded via HTML link tag

interface WeeklyStats {
  year: number;
  week: number;
  week_start: string;
  total_users: number;
  total_posts: number;
  total_comments: number;
  ultra_active_users: number;
  very_active_users: number;
  active_users: number;
  occasional_users: number;
  low_activity_users: number;
  avg_price: number | null;
}

interface StatsData {
  weeklyStats: WeeklyStats[];
  summary: {
    totalWeeks: number;
    totalUserWeeks: number;
    totalPosts: number;
    totalComments: number;
    avgWeeklyUsers: number;
    peakWeeklyUsers: number;
    peakWeekDate: string;
    lastCompleteWeekUsers: number;
    lastCompleteWeekDate: string;
  };
  insights: {
    yearOverYear: Array<{
      year: number;
      avgWeeklyUsers: number;
      avgPrice: number | null;
      totalPosts: number;
      totalComments: number;
      changePercent: number | null;
    }>;
    correlations: {
      priceUserCorrelation: number;
      description: string;
    };
    activityDistribution: {
      ultraActive: number;
      veryActive: number;
      active: number;
      occasional: number;
      lowActivity: number;
    };
  };
}

const TIER_COLORS = {
  ultra: "#ff3366",
  very: "#ff6b35",
  active: "#ffc107",
  occasional: "#4ecdc4",
  low: "#45b7d1",
};

const TIER_LABELS = {
  ultra: "Ultra Active (50+)",
  very: "Very Active (20-49)",
  active: "Active (10-19)",
  occasional: "Occasional (3-9)",
  low: "Low (1-2)",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: number;
  delay?: number;
  icon: React.ReactNode;
}

function StatCard({ label, value, subtext, trend, delay = 0, icon }: StatCardProps) {
  return (
    <div
      className="stat-card opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ color: "var(--color-hive-red)" }}>{icon}</span>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
          {label}
        </p>
      </div>
      <p style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", margin: 0 }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {subtext && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem", margin: 0 }}>{subtext}</p>
      )}
      {trend !== undefined && (
        <p style={{ 
          fontSize: "0.875rem", 
          fontWeight: 500,
          color: trend > 0 ? "#4ade80" : trend < 0 ? "#f87171" : "var(--color-text-muted)",
          margin: "0.5rem 0 0 0"
        }}>
          {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface ChartDataPoint {
  year: number;
  week: number;
  displayDate: string;
  total_users: number;
  total_posts: number;
  total_comments: number;
  total_content: number;
  avg_price: number | null;
  ultra_active_users: number;
  very_active_users: number;
  active_users: number;
  occasional_users: number;
  low_activity_users: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  // Get week info from first payload item's payload
  const dataPoint = (payload[0] as unknown as { payload: ChartDataPoint })?.payload;
  const weekLabel = dataPoint ? `${dataPoint.year} Week ${dataPoint.week}` : "";

  return (
    <div className="custom-tooltip">
      <p style={{ color: "var(--color-text-primary)", fontWeight: 600, marginBottom: "0.25rem" }}>{weekLabel}</p>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>{dataPoint?.displayDate}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ fontSize: "0.875rem", color: entry.color, margin: "0.125rem 0" }}>
          {entry.name}: {entry.dataKey === "avg_price" ? `$${entry.value?.toFixed(4)}` : formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

type ViewMode = "all" | "stacked" | "wau-price";
type VisibleTiers = {
  ultra: boolean;
  very: boolean;
  active: boolean;
  occasional: boolean;
  low: boolean;
};

declare const window: Window & { HIVE_STATS_DATA_URL?: string };

function App() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("wau-price");
  const [showPrice, setShowPrice] = useState(true);
  const [showTotalWAU, setShowTotalWAU] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [visibleTiers, setVisibleTiers] = useState<VisibleTiers>({
    ultra: false,
    very: false,
    active: false,
    occasional: false,
    low: false,
  });
  const [yearRange, setYearRange] = useState<[number, number]>([2016, 2026]);

  useEffect(() => {
    // Support both development (API) and production (static JSON)
    const dataUrl = window.HIVE_STATS_DATA_URL || "/api/stats";
    
    fetch(dataUrl)
      .then((res) => res.json())
      .then((d) => {
        setData(d as StatsData);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.weeklyStats.filter(
      (w) => w.year >= yearRange[0] && w.year <= yearRange[1]
    );
  }, [data, yearRange]);

  const chartData = useMemo(() => {
    return filteredData.map((w) => ({
      ...w,
      date: `${w.year}-W${String(w.week).padStart(2, "0")}`,
      displayDate: formatDate(w.week_start),
      total_content: w.total_posts + w.total_comments,
    }));
  }, [filteredData]);

  const pieData = useMemo(() => {
    if (!data) return [];
    const dist = data.insights.activityDistribution;
    return [
      { name: TIER_LABELS.ultra, value: dist.ultraActive, color: TIER_COLORS.ultra },
      { name: TIER_LABELS.very, value: dist.veryActive, color: TIER_COLORS.very },
      { name: TIER_LABELS.active, value: dist.active, color: TIER_COLORS.active },
      { name: TIER_LABELS.occasional, value: dist.occasional, color: TIER_COLORS.occasional },
      { name: TIER_LABELS.low, value: dist.lowActivity, color: TIER_COLORS.low },
    ];
  }, [data]);

  const toggleTier = (tier: keyof VisibleTiers) => {
    setVisibleTiers((prev) => ({ ...prev, [tier]: !prev[tier] }));
  };

  const handleYearStartChange = (e: ChangeEvent<HTMLInputElement>) => {
    setYearRange([parseInt(e.target.value), yearRange[1]]);
  };

  const handleYearEndChange = (e: ChangeEvent<HTMLInputElement>) => {
    setYearRange([yearRange[0], parseInt(e.target.value)]);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ 
            width: 64, height: 64, 
            border: "4px solid var(--color-hive-red)", 
            borderTopColor: "transparent",
            borderRadius: "50%",
            margin: "0 auto 1rem",
            animation: "spin 1s linear infinite"
          }} />
          <p style={{ color: "var(--color-text-secondary)" }}>Loading Hive blockchain data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#f87171" }}>
          <p style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Failed to load data</p>
          <p style={{ color: "var(--color-text-muted)" }}>{error}</p>
        </div>
      </div>
    );
  }

  const anyTierVisible = Object.values(visibleTiers).some(v => v);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header className="header">
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "1rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className="glow-pulse" style={{ 
                width: 40, height: 40, 
                background: "linear-gradient(135deg, var(--color-hive-red), var(--color-hive-red-dark))",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Activity size={20} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>Hive Analytics</h1>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", margin: 0 }}>Blockchain Activity Dashboard</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                Data: {data.weeklyStats[0]?.week_start.slice(0, 7)} → {data.weeklyStats[data.weeklyStats.length - 1]?.week_start.slice(0, 7)}
              </span>
              <a 
                href="https://github.com/cryptosharon/hive-stats" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}
                title="View on GitHub"
              >
                <Github size={20} />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Summary Stats */}
        <section style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <BarChart3 size={24} /> Overview
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <StatCard 
              label="Total Weeks" 
              value={data.summary.totalWeeks} 
              subtext="of blockchain data" 
              delay={0}
              icon={<Calendar size={16} />}
            />
            <StatCard 
              label="Peak Weekly Users" 
              value={data.summary.peakWeeklyUsers} 
              subtext={formatDate(data.summary.peakWeekDate)} 
              delay={100}
              icon={<TrendingUp size={16} />}
            />
            <StatCard 
              label="Last Complete Week" 
              value={data.summary.lastCompleteWeekUsers} 
              subtext={formatDate(data.summary.lastCompleteWeekDate)} 
              delay={200}
              icon={<Users size={16} />}
            />
            <StatCard 
              label="Total Posts" 
              value={data.summary.totalPosts} 
              subtext={`+ ${formatNumber(data.summary.totalComments)} comments`} 
              delay={300}
              icon={<FileText size={16} />}
            />
          </div>
        </section>

        {/* Main Chart */}
        <section style={{ marginBottom: "3rem" }} className="opacity-0 animate-fade-in-up animate-delay-400">
          <div className="chart-card">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <LineChart size={20} /> Weekly Active Users & Price
              </h2>
              
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {/* View Mode Toggle */}
                <div style={{ display: "flex", background: "var(--color-bg-elevated)", borderRadius: 8, padding: 4 }}>
                  {(["wau-price", "stacked", "all"] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`toggle-btn ${viewMode === mode ? "active" : ""}`}
                    >
                      {mode === "wau-price" ? "WAU vs Price" : mode === "stacked" ? "Stacked" : "Lines"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Toggles */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              <button
                onClick={() => setShowTotalWAU(!showTotalWAU)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: showTotalWAU ? "rgba(124, 58, 237, 0.2)" : "var(--color-bg-elevated)",
                  color: showTotalWAU ? "#a78bfa" : "var(--color-text-muted)",
                  border: showTotalWAU ? "1px solid rgba(124, 58, 237, 0.4)" : "1px solid transparent",
                  display: "flex", alignItems: "center", gap: "0.375rem"
                }}
              >
                <Users size={14} /> Total WAU
              </button>
              <button
                onClick={() => setShowPrice(!showPrice)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: showPrice ? "rgba(0, 211, 149, 0.2)" : "var(--color-bg-elevated)",
                  color: showPrice ? "#00d395" : "var(--color-text-muted)",
                  border: showPrice ? "1px solid rgba(0, 211, 149, 0.4)" : "1px solid transparent",
                  display: "flex", alignItems: "center", gap: "0.375rem"
                }}
              >
                <DollarSign size={14} /> Price
              </button>
              <button
                onClick={() => setShowContent(!showContent)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: showContent ? "rgba(236, 72, 153, 0.2)" : "var(--color-bg-elevated)",
                  color: showContent ? "#ec4899" : "var(--color-text-muted)",
                  border: showContent ? "1px solid rgba(236, 72, 153, 0.4)" : "1px solid transparent",
                  display: "flex", alignItems: "center", gap: "0.375rem"
                }}
              >
                <MessageSquare size={14} /> Posts+Comments
              </button>
            </div>

            {/* Tier Toggles */}
            {viewMode !== "wau-price" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                {(Object.keys(TIER_COLORS) as Array<keyof typeof TIER_COLORS>).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => toggleTier(tier)}
                    className="tier-btn"
                    style={{
                      background: visibleTiers[tier] ? `${TIER_COLORS[tier]}20` : "transparent",
                      color: TIER_COLORS[tier],
                      border: visibleTiers[tier] ? `1px solid ${TIER_COLORS[tier]}60` : "1px solid transparent",
                      opacity: visibleTiers[tier] ? 1 : 0.4,
                    }}
                  >
                    {TIER_LABELS[tier]}
                  </button>
                ))}
              </div>
            )}

            {/* Year Range Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>From:</span>
              <input
                type="range"
                min={2016}
                max={2026}
                value={yearRange[0]}
                onChange={handleYearStartChange}
                style={{ flex: 1, minWidth: 100 }}
              />
              <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", width: 48 }}>{yearRange[0]}</span>
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>To:</span>
              <input
                type="range"
                min={2016}
                max={2026}
                value={yearRange[1]}
                onChange={handleYearEndChange}
                style={{ flex: 1, minWidth: 100 }}
              />
              <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", width: 48 }}>{yearRange[1]}</span>
            </div>

            {/* Chart */}
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ultraGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TIER_COLORS.ultra} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={TIER_COLORS.ultra} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="veryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TIER_COLORS.very} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={TIER_COLORS.very} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TIER_COLORS.active} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={TIER_COLORS.active} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="occasionalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TIER_COLORS.occasional} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={TIER_COLORS.occasional} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="lowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TIER_COLORS.low} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={TIER_COLORS.low} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="wauGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis
                    dataKey="date"
                    stroke="#606070"
                    tick={{ fill: "#9090a0", fontSize: 11 }}
                    tickLine={{ stroke: "#2a2a3a" }}
                    interval={Math.floor(chartData.length / 12)}
                    tickFormatter={(value: string) => {
                      // Convert "2025-W49" to "Dec 2025"
                      const match = value.match(/^(\d{4})-W(\d+)$/);
                      if (match) {
                        const year = parseInt(match[1]);
                        const week = parseInt(match[2]);
                        // Approximate the month from week number
                        const date = new Date(year, 0, 1 + (week - 1) * 7);
                        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                      }
                      return value;
                    }}
                  />
                  <YAxis
                    yAxisId="users"
                    stroke="#606070"
                    tick={{ fill: "#9090a0", fontSize: 11 }}
                    tickLine={{ stroke: "#2a2a3a" }}
                    tickFormatter={(v) => formatNumber(v)}
                  />
                  {(showPrice || showContent) && (
                    <YAxis
                      yAxisId="secondary"
                      orientation="right"
                      stroke={showPrice ? "#00d395" : "#ec4899"}
                      tick={{ fill: showPrice ? "#00d395" : "#ec4899", fontSize: 11 }}
                      tickLine={{ stroke: showPrice ? "#00d395" : "#ec4899" }}
                      tickFormatter={(v) => showPrice ? `$${v.toFixed(2)}` : formatNumber(v)}
                    />
                  )}
                  <Tooltip content={<CustomTooltip />} />

                  {/* Total WAU Area/Line */}
                  {showTotalWAU && viewMode === "wau-price" && (
                    <Area
                      yAxisId="users"
                      type="monotone"
                      dataKey="total_users"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#wauGradient)"
                      name="Total WAU"
                    />
                  )}
                  {showTotalWAU && viewMode !== "wau-price" && (
                    <Line
                      yAxisId="users"
                      type="monotone"
                      dataKey="total_users"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={false}
                      name="Total WAU"
                    />
                  )}

                  {/* Stacked Areas */}
                  {viewMode === "stacked" && (
                    <>
                      {visibleTiers.low && (
                        <Area yAxisId="users" type="monotone" dataKey="low_activity_users" stackId="1" stroke={TIER_COLORS.low} fill="url(#lowGradient)" name={TIER_LABELS.low} />
                      )}
                      {visibleTiers.occasional && (
                        <Area yAxisId="users" type="monotone" dataKey="occasional_users" stackId="1" stroke={TIER_COLORS.occasional} fill="url(#occasionalGradient)" name={TIER_LABELS.occasional} />
                      )}
                      {visibleTiers.active && (
                        <Area yAxisId="users" type="monotone" dataKey="active_users" stackId="1" stroke={TIER_COLORS.active} fill="url(#activeGradient)" name={TIER_LABELS.active} />
                      )}
                      {visibleTiers.very && (
                        <Area yAxisId="users" type="monotone" dataKey="very_active_users" stackId="1" stroke={TIER_COLORS.very} fill="url(#veryGradient)" name={TIER_LABELS.very} />
                      )}
                      {visibleTiers.ultra && (
                        <Area yAxisId="users" type="monotone" dataKey="ultra_active_users" stackId="1" stroke={TIER_COLORS.ultra} fill="url(#ultraGradient)" name={TIER_LABELS.ultra} />
                      )}
                    </>
                  )}

                  {/* Lines Mode */}
                  {viewMode === "all" && anyTierVisible && (
                    <>
                      {visibleTiers.ultra && <Line yAxisId="users" type="monotone" dataKey="ultra_active_users" stroke={TIER_COLORS.ultra} strokeWidth={2} dot={false} name={TIER_LABELS.ultra} />}
                      {visibleTiers.very && <Line yAxisId="users" type="monotone" dataKey="very_active_users" stroke={TIER_COLORS.very} strokeWidth={2} dot={false} name={TIER_LABELS.very} />}
                      {visibleTiers.active && <Line yAxisId="users" type="monotone" dataKey="active_users" stroke={TIER_COLORS.active} strokeWidth={2} dot={false} name={TIER_LABELS.active} />}
                      {visibleTiers.occasional && <Line yAxisId="users" type="monotone" dataKey="occasional_users" stroke={TIER_COLORS.occasional} strokeWidth={2} dot={false} name={TIER_LABELS.occasional} />}
                      {visibleTiers.low && <Line yAxisId="users" type="monotone" dataKey="low_activity_users" stroke={TIER_COLORS.low} strokeWidth={2} dot={false} name={TIER_LABELS.low} />}
                    </>
                  )}

                  {/* Price Line */}
                  {showPrice && (
                    <Line yAxisId="secondary" type="monotone" dataKey="avg_price" stroke="#00d395" strokeWidth={2} dot={false} name="Price (USD)" connectNulls />
                  )}

                  {/* Content Volume Line */}
                  {showContent && !showPrice && (
                    <Line yAxisId="secondary" type="monotone" dataKey="total_content" stroke="#ec4899" strokeWidth={2} dot={false} name="Posts + Comments" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Insights Grid */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
          {/* Correlation Card */}
          <div className="chart-card opacity-0 animate-fade-in-up animate-delay-500">
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={18} /> Price vs Users Correlation
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <div
                className="correlation-ring"
                style={{
                  background: `conic-gradient(
                    ${data.insights.correlations.priceUserCorrelation > 0 ? "#00d395" : "#e31337"} ${Math.abs(data.insights.correlations.priceUserCorrelation) * 100}%,
                    #1a1a25 0%
                  )`,
                }}
              >
                <div className="correlation-ring-inner">
                  {(data.insights.correlations.priceUserCorrelation * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                  Pearson coefficient: <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{data.insights.correlations.priceUserCorrelation}</span>
                </p>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
                  {data.insights.correlations.description}
                </p>
              </div>
            </div>
          </div>

          {/* Activity Distribution */}
          <div className="chart-card opacity-0 animate-fade-in-up animate-delay-500">
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <PieChartIcon size={18} /> Activity Distribution
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="pie-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                {pieData.map((entry) => (
                  <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: entry.color, flexShrink: 0 }} />
                    <span style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.name.split(" ")[0]}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
                      {entry.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Year over Year */}
        <section style={{ marginBottom: "3rem" }} className="opacity-0 animate-fade-in-up animate-delay-500">
          <div className="chart-card">
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Layers size={20} /> Year-over-Year Analysis
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Year</th>
                    <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Avg Weekly Users</th>
                    <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Change</th>
                    <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Avg Price</th>
                    <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Posts</th>
                    <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.875rem" }}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {data.insights.yearOverYear.map((year) => (
                    <tr key={year.year} style={{ borderBottom: "1px solid rgba(42, 42, 58, 0.5)" }}>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{year.year}</td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                        {formatNumber(year.avgWeeklyUsers)}
                      </td>
                      <td style={{ 
                        padding: "0.75rem 1rem", 
                        textAlign: "right", 
                        fontFamily: "var(--font-mono)",
                        color: year.changePercent === null ? "var(--color-text-muted)" : year.changePercent > 0 ? "#4ade80" : "#f87171"
                      }}>
                        {year.changePercent === null ? "—" : `${year.changePercent > 0 ? "+" : ""}${year.changePercent}%`}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", color: "#00d395" }}>
                        {year.avgPrice ? `$${year.avgPrice.toFixed(3)}` : "—"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {formatNumber(year.totalPosts)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {formatNumber(year.totalComments)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Posts vs Comments Chart */}
        <section style={{ marginBottom: "3rem" }} className="opacity-0 animate-fade-in-up animate-delay-500">
          <div className="chart-card">
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FileText size={20} /> Content Volume: Posts vs Comments
            </h3>
            <div className="chart-container-small">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.insights.yearOverYear} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis dataKey="year" stroke="#606070" tick={{ fill: "#9090a0", fontSize: 11 }} />
                  <YAxis stroke="#606070" tick={{ fill: "#9090a0", fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="totalPosts" name="Posts" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalComments" name="Comments" fill="#ec4899" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Key Insights */}
        <section style={{ marginBottom: "3rem" }} className="opacity-0 animate-fade-in-up animate-delay-500">
          <div className="bg-gradient-insight" style={{ border: "1px solid rgba(227, 19, 55, 0.2)", borderRadius: 12, padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Lightbulb size={20} /> Key Insights
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div className="insight-card">
                <h4 style={{ fontWeight: 600, color: "var(--color-hive-red)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <TrendingUp size={16} /> Peak Activity Period
                </h4>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                  The blockchain saw its highest weekly engagement of <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{formatNumber(data.summary.peakWeeklyUsers)}</span> active users during <span style={{ color: "var(--color-text-primary)" }}>{formatDate(data.summary.peakWeekDate)}</span>, coinciding with the 2018 crypto boom.
                </p>
              </div>
              <div className="insight-card">
                <h4 style={{ fontWeight: 600, color: "#00d395", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <DollarSign size={16} /> Price Correlation
                </h4>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                  {data.insights.correlations.priceUserCorrelation > 0.3 
                    ? "Higher token prices tend to attract more active users, suggesting price appreciation drives engagement."
                    : data.insights.correlations.priceUserCorrelation < -0.3
                    ? "Interestingly, user activity increases when prices are lower, possibly indicating committed community members."
                    : "User activity appears largely independent of token price, suggesting a dedicated core community."
                  }
                </p>
              </div>
              <div className="insight-card">
                <h4 style={{ fontWeight: 600, color: "#ffc107", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Users size={16} /> User Retention Pattern
                </h4>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                  <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{(data.insights.activityDistribution.occasional + data.insights.activityDistribution.lowActivity).toFixed(1)}%</span> of user activity comes from casual participants (1-9 actions/week), while power users (20+ actions) make up only <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{(data.insights.activityDistribution.ultraActive + data.insights.activityDistribution.veryActive).toFixed(1)}%</span>.
                </p>
              </div>
              <div className="insight-card">
                <h4 style={{ fontWeight: 600, color: "#4ecdc4", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <MessageSquare size={16} /> Content Engagement
                </h4>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                  Total of <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{formatNumber(data.summary.totalPosts)}</span> posts with <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{formatNumber(data.summary.totalComments)}</span> comments — an average of <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{(data.summary.totalComments / data.summary.totalPosts).toFixed(1)}</span> comments per post.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ textAlign: "center", padding: "2rem 0", borderTop: "1px solid var(--color-border)" }}>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            Data sourced from <a href="https://hivesql.io" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-hive-red)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>HiveSQL <ExternalLink size={12} /></a> 
            {" • "}
            Prices from <a href="https://cryptocompare.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-hive-red)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>CryptoCompare <ExternalLink size={12} /></a>
          </p>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
            {data.summary.totalWeeks} weeks of blockchain data analyzed
          </p>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
            Made by <a href="https://peakd.com/@cryptosharon" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-hive-red)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>@cryptosharon <ExternalLink size={12} /></a>
          </p>
        </footer>
      </main>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
