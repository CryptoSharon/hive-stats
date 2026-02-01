import dotenv from "dotenv";
import sql from "mssql";

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
  requestTimeout: 120000, // 2 minutes for longer queries
};

async function testConnection() {
  console.log("Connecting to HiveSQL...");
  const pool = await sql.connect(config);

  console.log("Connected! Running test query...");

  // Simple test query - get recent comments count
  const result = await pool.request().query(`
    SELECT TOP 10
      author,
      COUNT(*) as comment_count
    FROM Comments
    WHERE created > DATEADD(day, -7, GETDATE())
    GROUP BY author
    ORDER BY comment_count DESC
  `);

  console.log("Top 10 commenters in the last 7 days:");
  console.table(result.recordset);

  await pool.close();
  console.log("Connection closed.");
}

testConnection().catch((err) => {
  console.error("Connection failed:", err.message);
  process.exit(1);
});
