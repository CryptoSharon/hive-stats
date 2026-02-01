import dotenv from "dotenv";
import sql from "mssql";
import { Database } from "bun:sqlite";

dotenv.config();

const config: sql.config = {
  server: "vip.hivesql.io",
  port: 1433,
  database: "DBHive",
  user: process.env.HIVESQL_USERNAME,
  password: process.env.HIVESQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 600000, // 10 minutes for heavy queries
  connectionTimeout: 60000,
};

// Activity tiers based on weekly posts+comments
// Ultra Active: 50+ actions/week
// Very Active: 20-49 actions/week  
// Active: 10-19 actions/week
// Occasional: 3-9 actions/week
// Low: 1-2 actions/week

interface WeeklyStats {
  year: number;
  week: number;
  week_start: Date;
  total_users: number;
  total_posts: number;
  total_comments: number;
  ultra_active_users: number;   // 50+
  very_active_users: number;    // 20-49
  active_users: number;         // 10-19
  occasional_users: number;     // 3-9
  low_activity_users: number;   // 1-2
}

function initDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_stats (
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      total_users INTEGER NOT NULL,
      total_posts INTEGER NOT NULL,
      total_comments INTEGER NOT NULL,
      ultra_active_users INTEGER NOT NULL,
      very_active_users INTEGER NOT NULL,
      active_users INTEGER NOT NULL,
      occasional_users INTEGER NOT NULL,
      low_activity_users INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (year, week)
    );
    
    CREATE INDEX IF NOT EXISTS idx_week_start ON weekly_stats(week_start);
  `);
  
  return db;
}

async function fetchWeeklyStats(pool: sql.ConnectionPool, year: number): Promise<WeeklyStats[]> {
  console.log(`Fetching data for ${year}...`);
  
  // OPTIMIZED: Use date range filter instead of DATEPART function
  // This allows SQL Server to use indexes on the created column
  // DATEPART(YEAR, created) = @year forces a full table scan
  // created >= DATEFROMPARTS(@year, 1, 1) AND created < DATEFROMPARTS(@year + 1, 1, 1) uses indexes
  const result = await pool.request()
    .input("year", sql.Int, year)
    .query(`
      WITH UserWeeklyActivity AS (
        -- Count posts per user per week
        SELECT 
          author,
          DATEPART(YEAR, created) as year,
          DATEPART(WEEK, created) as week,
          COUNT(*) as post_count,
          0 as comment_count
        FROM Comments  -- In HiveSQL, Comments table contains both posts and comments
        WHERE parent_author = ''  -- Posts have empty parent_author
          AND created >= DATEFROMPARTS(@year, 1, 1)
          AND created < DATEFROMPARTS(@year + 1, 1, 1)
        GROUP BY author, DATEPART(YEAR, created), DATEPART(WEEK, created)
        
        UNION ALL
        
        -- Count comments per user per week
        SELECT 
          author,
          DATEPART(YEAR, created) as year,
          DATEPART(WEEK, created) as week,
          0 as post_count,
          COUNT(*) as comment_count
        FROM Comments
        WHERE parent_author != ''  -- Comments have a parent_author
          AND created >= DATEFROMPARTS(@year, 1, 1)
          AND created < DATEFROMPARTS(@year + 1, 1, 1)
        GROUP BY author, DATEPART(YEAR, created), DATEPART(WEEK, created)
      ),
      UserWeeklyTotals AS (
        SELECT 
          author,
          year,
          week,
          SUM(post_count) as posts,
          SUM(comment_count) as comments,
          SUM(post_count) + SUM(comment_count) as total_activity
        FROM UserWeeklyActivity
        GROUP BY author, year, week
      ),
      WeeklyAggregates AS (
        SELECT
          year,
          week,
          COUNT(DISTINCT author) as total_users,
          SUM(posts) as total_posts,
          SUM(comments) as total_comments,
          SUM(CASE WHEN total_activity >= 50 THEN 1 ELSE 0 END) as ultra_active_users,
          SUM(CASE WHEN total_activity >= 20 AND total_activity < 50 THEN 1 ELSE 0 END) as very_active_users,
          SUM(CASE WHEN total_activity >= 10 AND total_activity < 20 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN total_activity >= 3 AND total_activity < 10 THEN 1 ELSE 0 END) as occasional_users,
          SUM(CASE WHEN total_activity >= 1 AND total_activity < 3 THEN 1 ELSE 0 END) as low_activity_users
        FROM UserWeeklyTotals
        GROUP BY year, week
      )
      SELECT 
        wa.*,
        DATEADD(WEEK, wa.week - 1, DATEFROMPARTS(wa.year, 1, 1)) as week_start
      FROM WeeklyAggregates wa
      ORDER BY year, week
    `);
  
  return result.recordset.map((row) => ({
    year: row.year,
    week: row.week,
    week_start: row.week_start,
    total_users: row.total_users,
    total_posts: row.total_posts,
    total_comments: row.total_comments,
    ultra_active_users: row.ultra_active_users,
    very_active_users: row.very_active_users,
    active_users: row.active_users,
    occasional_users: row.occasional_users,
    low_activity_users: row.low_activity_users,
  }));
}

function saveToDatabase(db: Database, stats: WeeklyStats[]) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO weekly_stats (
      year, week, week_start, total_users, total_posts, total_comments,
      ultra_active_users, very_active_users, active_users, occasional_users, low_activity_users
    ) VALUES (
      $year, $week, $week_start, $total_users, $total_posts, $total_comments,
      $ultra_active_users, $very_active_users, $active_users, $occasional_users, $low_activity_users
    )
  `);
  
  const insertMany = db.transaction(() => {
    for (const row of stats) {
      insert.run({
        $year: row.year,
        $week: row.week,
        $week_start: row.week_start.toISOString().split("T")[0] ?? "",
        $total_users: row.total_users,
        $total_posts: row.total_posts,
        $total_comments: row.total_comments,
        $ultra_active_users: row.ultra_active_users,
        $very_active_users: row.very_active_users,
        $active_users: row.active_users,
        $occasional_users: row.occasional_users,
        $low_activity_users: row.low_activity_users,
      });
    }
  });
  
  insertMany();
  console.log(`  Saved ${stats.length} weeks to database`);
}

async function main() {
  const dbPath = "hive-stats.db";
  const db = initDatabase(dbPath);
  
  console.log("Connecting to HiveSQL...");
  const pool = await sql.connect(config);
  console.log("Connected!\n");
  
  // Hive started in March 2020 (fork from Steem)
  // But HiveSQL has historical Steem data going back to 2016
  const startYear = 2016;
  const endYear = new Date().getFullYear();
  
  try {
    for (let year = startYear; year <= endYear; year++) {
      const stats = await fetchWeeklyStats(pool, year);
      if (stats.length > 0) {
        saveToDatabase(db, stats);
        console.log(`  ${year}: ${stats.reduce((sum, s) => sum + s.total_users, 0).toLocaleString()} total user-weeks, ${stats.reduce((sum, s) => sum + s.total_posts + s.total_comments, 0).toLocaleString()} total actions\n`);
      } else {
        console.log(`  ${year}: No data found\n`);
      }
    }
    
    // Print summary
    interface SummaryRow {
      first_year: number;
      last_year: number;
      total_weeks: number;
      total_user_weeks: number;
      total_posts: number;
      total_comments: number;
    }
    
    const summary = db.prepare(`
      SELECT 
        MIN(year) as first_year,
        MAX(year) as last_year,
        COUNT(*) as total_weeks,
        SUM(total_users) as total_user_weeks,
        SUM(total_posts) as total_posts,
        SUM(total_comments) as total_comments
      FROM weekly_stats
    `).get() as SummaryRow;
    
    console.log("\n=== Summary ===");
    console.log(`Years: ${summary.first_year} - ${summary.last_year}`);
    console.log(`Total weeks: ${summary.total_weeks}`);
    console.log(`Total user-weeks: ${summary.total_user_weeks.toLocaleString()}`);
    console.log(`Total posts: ${summary.total_posts.toLocaleString()}`);
    console.log(`Total comments: ${summary.total_comments.toLocaleString()}`);
    
  } finally {
    await pool.close();
    db.close();
    console.log("\nDone!");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
