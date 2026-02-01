import { Database } from "bun:sqlite";

// Fetch historical Hive price data from CryptoCompare (more generous free tier)

interface CryptoCompareResponse {
  Response: string;
  Data: {
    Data: Array<{
      time: number;
      close: number;
      open: number;
      high: number;
      low: number;
    }>;
  };
}

async function fetchDailyHistory(symbol: string, toTs: number, limit: number = 2000): Promise<Array<{ date: string; price: number }>> {
  const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${symbol}&tsym=USD&limit=${limit}&toTs=${toTs}`;
  
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`CryptoCompare API error: ${res.status}`);
  }
  
  const data = await res.json() as CryptoCompareResponse;
  
  if (data.Response !== "Success") {
    throw new Error(`CryptoCompare error: ${JSON.stringify(data)}`);
  }
  
  return data.Data.Data
    .filter(d => d.close > 0) // Filter out days with no trading
    .map(d => {
      const dateStr = new Date(d.time * 1000).toISOString().split("T")[0];
      return {
        date: dateStr ?? "",
        price: d.close,
      };
    })
    .filter(d => d.date !== "");
}

function initPriceTable(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      date TEXT PRIMARY KEY,
      coin TEXT NOT NULL,
      price_usd REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_price_coin ON price_history(coin);
  `);
}

function savePrices(db: Database, coin: string, prices: Array<{ date: string; price: number }>) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO price_history (date, coin, price_usd)
    VALUES ($date, $coin, $price_usd)
  `);
  
  const insertMany = db.transaction(() => {
    for (const p of prices) {
      insert.run({
        $date: p.date,
        $coin: coin,
        $price_usd: p.price,
      });
    }
  });
  
  insertMany();
}

async function main() {
  const db = new Database("hive-stats.db");
  initPriceTable(db);
  
  const now = Math.floor(Date.now() / 1000);
  
  // Fetch STEEM historical prices (for pre-Hive era 2016-2020)
  console.log("Fetching STEEM price history...");
  
  // CryptoCompare allows up to 2000 data points per request
  // Steem launched July 4, 2016 - we need data until March 2020
  const steemEndTs = Math.floor(new Date("2020-03-19").getTime() / 1000);
  
  try {
    const steemPrices = await fetchDailyHistory("STEEM", steemEndTs, 2000);
    if (steemPrices.length > 0) {
      savePrices(db, "steem", steemPrices);
      const first = steemPrices[0];
      const last = steemPrices[steemPrices.length - 1];
      if (first && last) {
        console.log(`  Saved ${steemPrices.length} STEEM price points (${first.date} to ${last.date})`);
      }
    }
  } catch (err) {
    console.error(`  Error fetching STEEM: ${(err as Error).message}`);
  }
  
  await Bun.sleep(500);
  
  // Fetch HIVE historical prices (2020-present)
  console.log("\nFetching HIVE price history...");
  
  try {
    const hivePrices = await fetchDailyHistory("HIVE", now, 2000);
    if (hivePrices.length > 0) {
      savePrices(db, "hive", hivePrices);
      const first = hivePrices[0];
      const last = hivePrices[hivePrices.length - 1];
      if (first && last) {
        console.log(`  Saved ${hivePrices.length} HIVE price points (${first.date} to ${last.date})`);
      }
    }
  } catch (err) {
    console.error(`  Error fetching HIVE: ${(err as Error).message}`);
  }
  
  // Summary
  interface CountRow { count: number; min_date: string; max_date: string }
  const steemCount = db.prepare(`
    SELECT COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date 
    FROM price_history WHERE coin = 'steem'
  `).get() as CountRow;
  
  const hiveCount = db.prepare(`
    SELECT COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date 
    FROM price_history WHERE coin = 'hive'
  `).get() as CountRow;
  
  console.log("\n=== Price Data Summary ===");
  console.log(`STEEM: ${steemCount.count} days (${steemCount.min_date} to ${steemCount.max_date})`);
  console.log(`HIVE: ${hiveCount.count} days (${hiveCount.min_date} to ${hiveCount.max_date})`);
  
  db.close();
  console.log("\nDone!");
}

main().catch(console.error);
