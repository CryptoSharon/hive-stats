import { Database } from "bun:sqlite";
import index from "./index.html";

const db = new Database("hive-stats.db", { readonly: true });

// Get weekly stats with price data joined
interface WeeklyStatsRow {
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

interface StatsResponse {
  weeklyStats: WeeklyStatsRow[];
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

function getWeeklyStats(): WeeklyStatsRow[] {
  return db.prepare(`
    SELECT 
      ws.*,
      AVG(ph.price_usd) as avg_price
    FROM weekly_stats ws
    LEFT JOIN price_history ph ON 
      ph.date >= ws.week_start 
      AND ph.date < date(ws.week_start, '+7 days')
      AND (
        (ws.year < 2020 AND ph.coin = 'steem') OR
        (ws.year >= 2020 AND ph.coin = 'hive')
      )
    GROUP BY ws.year, ws.week
    ORDER BY ws.year, ws.week
  `).all() as WeeklyStatsRow[];
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || x.length !== y.length) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * (y[i] ?? 0), 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
  const sumY2 = y.reduce((a, yi) => a + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function getStats(): StatsResponse {
  const weeklyStats = getWeeklyStats();
  
  // Summary stats
  interface SummaryRow {
    total_weeks: number;
    total_user_weeks: number;
    total_posts: number;
    total_comments: number;
    avg_weekly_users: number;
  }
  
  const summaryRow = db.prepare(`
    SELECT 
      COUNT(*) as total_weeks,
      SUM(total_users) as total_user_weeks,
      SUM(total_posts) as total_posts,
      SUM(total_comments) as total_comments,
      AVG(total_users) as avg_weekly_users
    FROM weekly_stats
  `).get() as SummaryRow;
  
  interface PeakRow {
    total_users: number;
    week_start: string;
  }
  
  const peakRow = db.prepare(`
    SELECT total_users, week_start 
    FROM weekly_stats 
    ORDER BY total_users DESC 
    LIMIT 1
  `).get() as PeakRow;
  
  // Get LAST COMPLETE WEEK (not current truncated week)
  interface LastCompleteWeekRow {
    total_users: number;
    week_start: string;
  }
  
  const lastCompleteWeekRow = db.prepare(`
    SELECT total_users, week_start
    FROM weekly_stats 
    ORDER BY year DESC, week DESC 
    LIMIT 1 OFFSET 1
  `).get() as LastCompleteWeekRow;
  
  // Year over year stats
  interface YearRow {
    year: number;
    avg_weekly_users: number;
    total_posts: number;
    total_comments: number;
  }
  
  const yearRows = db.prepare(`
    SELECT 
      year,
      AVG(total_users) as avg_weekly_users,
      SUM(total_posts) as total_posts,
      SUM(total_comments) as total_comments
    FROM weekly_stats
    GROUP BY year
    ORDER BY year
  `).all() as YearRow[];
  
  const yearOverYear = yearRows.map((row, i) => {
    // Get average price for that year
    const priceRow = db.prepare(`
      SELECT AVG(price_usd) as avg_price
      FROM price_history
      WHERE strftime('%Y', date) = ?
    `).get(String(row.year)) as { avg_price: number | null };
    
    const prevYear = i > 0 ? yearRows[i - 1] : null;
    const changePercent = prevYear 
      ? ((row.avg_weekly_users - prevYear.avg_weekly_users) / prevYear.avg_weekly_users) * 100
      : null;
    
    return {
      year: row.year,
      avgWeeklyUsers: Math.round(row.avg_weekly_users),
      avgPrice: priceRow.avg_price ? Number(priceRow.avg_price.toFixed(4)) : null,
      totalPosts: row.total_posts,
      totalComments: row.total_comments,
      changePercent: changePercent ? Number(changePercent.toFixed(1)) : null,
    };
  });
  
  // Calculate price-user correlation
  const dataWithPrice = weeklyStats.filter(w => w.avg_price !== null && w.avg_price > 0);
  const prices = dataWithPrice.map(w => w.avg_price as number);
  const users = dataWithPrice.map(w => w.total_users);
  const correlation = calculateCorrelation(prices, users);
  
  let correlationDesc = "No significant correlation";
  if (correlation > 0.7) correlationDesc = "Strong positive correlation - price and users move together";
  else if (correlation > 0.4) correlationDesc = "Moderate positive correlation";
  else if (correlation > 0.2) correlationDesc = "Weak positive correlation";
  else if (correlation < -0.7) correlationDesc = "Strong negative correlation - inverse relationship";
  else if (correlation < -0.4) correlationDesc = "Moderate negative correlation";
  else if (correlation < -0.2) correlationDesc = "Weak negative correlation";
  
  // Activity tier distribution (total)
  interface TierRow {
    ultra: number;
    very: number;
    active: number;
    occasional: number;
    low: number;
  }
  
  const tierRow = db.prepare(`
    SELECT 
      SUM(ultra_active_users) as ultra,
      SUM(very_active_users) as very,
      SUM(active_users) as active,
      SUM(occasional_users) as occasional,
      SUM(low_activity_users) as low
    FROM weekly_stats
  `).get() as TierRow;
  
  const totalTiers = tierRow.ultra + tierRow.very + tierRow.active + tierRow.occasional + tierRow.low;
  
  return {
    weeklyStats,
    summary: {
      totalWeeks: summaryRow.total_weeks,
      totalUserWeeks: summaryRow.total_user_weeks,
      totalPosts: summaryRow.total_posts,
      totalComments: summaryRow.total_comments,
      avgWeeklyUsers: Math.round(summaryRow.avg_weekly_users),
      peakWeeklyUsers: peakRow.total_users,
      peakWeekDate: peakRow.week_start,
      lastCompleteWeekUsers: lastCompleteWeekRow.total_users,
      lastCompleteWeekDate: lastCompleteWeekRow.week_start,
    },
    insights: {
      yearOverYear,
      correlations: {
        priceUserCorrelation: Number(correlation.toFixed(3)),
        description: correlationDesc,
      },
      activityDistribution: {
        ultraActive: Number(((tierRow.ultra / totalTiers) * 100).toFixed(1)),
        veryActive: Number(((tierRow.very / totalTiers) * 100).toFixed(1)),
        active: Number(((tierRow.active / totalTiers) * 100).toFixed(1)),
        occasional: Number(((tierRow.occasional / totalTiers) * 100).toFixed(1)),
        lowActivity: Number(((tierRow.low / totalTiers) * 100).toFixed(1)),
      },
    },
  };
}

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/styles.css": () => new Response(Bun.file("./styles.css")),
    "/api/stats": () => {
      const stats = getStats();
      return Response.json(stats);
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Hive Stats Dashboard running at http://localhost:${server.port}`);
