# Hive Blockchain Analytics Dashboard

A comprehensive analytics dashboard for tracking Hive blockchain activity, user engagement metrics, and price trends from 2016 to present. Built with React, Recharts, and Bun.

![Hive Analytics Dashboard](https://via.placeholder.com/1200x600/1a1a25/e31337?text=Hive+Analytics+Dashboard)

## Features

- **Weekly Active Users (WAU)** tracking with activity tier segmentation
- **Price correlation analysis** between HIVE/STEEM token prices and user activity
- **Interactive charts** with multiple view modes (stacked areas, lines, WAU vs Price)
- **Year-over-year comparisons** with growth metrics
- **Content volume analysis** (posts vs comments)
- **Activity distribution** breakdown by user engagement levels
- **Historical data** spanning from 2016 (Steem era) through present (Hive era)

## Prerequisites

Before you begin, you'll need:

1. **Bun runtime** - [Install Bun](https://bun.sh)
2. **HiveSQL account** - [Sign up at HiveSQL.io](https://hivesql.io)
3. **Node.js 18+** (optional, for compatibility checks)

## HiveSQL Access

This project requires a HiveSQL account to fetch blockchain data. HiveSQL provides SQL Server access to the Hive blockchain.

### Getting HiveSQL Credentials

1. Visit [HiveSQL.io](https://hivesql.io)
2. Sign up for an account (paid service, send 1 HBD to @hivesql to set up the account, it lasts a day, thereafter, the subscription fee is 50 HBD for 1 month or 5 HBD for 1 day)
3. Once approved, you'll receive:
   - Username
   - Password
   - Server address (usually `vip.hivesql.io`)
   - Database name (usually `DBHive`)

### Why HiveSQL?

HiveSQL allows efficient querying of blockchain data without running a full node. The initial data fetch takes ~1 hour to process all years (2016-present), but subsequent updates are much faster.

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/hive-stats.git
cd hive-stats
```

2. **Install dependencies**

```bash
bun install
```

3. **Create environment file**

Create a `.env` file in the project root:

```bash
# HiveSQL Credentials
HIVESQL_USERNAME=your_username
HIVESQL_PASSWORD=your_password
HIVESQL_SERVER=vip.hivesql.io
HIVESQL_DATABASE=DBHive
```

**Important:** Never commit your `.env` file to version control. It's already in `.gitignore`.

## Usage

### 1. Fetch Blockchain Data

First time setup - fetch all historical user activity data:

```bash
bun run fetch-stats
```

This will:
- Connect to HiveSQL
- Query weekly user activity from 2016 to present
- Categorize users into activity tiers
- Store data in local SQLite database (`hive-stats.db`)
- Take approximately **1 hour** for full historical data

**Activity Tiers:**
- Ultra Active: 50+ posts/comments per week
- Very Active: 20-49 posts/comments per week
- Active: 10-19 posts/comments per week
- Occasional: 3-9 posts/comments per week
- Low: 1-2 posts/comments per week

### 2. Fetch Price Data

Fetch historical HIVE and STEEM price data:

```bash
bun run fetch-price
```

This will:
- Fetch STEEM prices (2016-2020) from CryptoCompare
- Fetch HIVE prices (2020-present) from CryptoCompare
- Store in the same SQLite database
- Take approximately **1-2 minutes**

### 3. Run Development Server

Start the local development server with hot reload:

```bash
bun run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the dashboard.

The dev server features:
- Hot module replacement (HMR)
- Live data from SQLite database
- Instant updates when you modify code

## Deployment to Vercel

### Prepare for Deployment

1. **Export data to static JSON**

```bash
bun run export-data
```

This creates `public/data.json` with all processed statistics.

2. **Build production bundle**

```bash
bun run build
```

This creates optimized files in the `dist/` folder.

### Deploy to Vercel

**Option 1: Using Vercel CLI**

```bash
# Install Vercel CLI globally (first time only)
bun add -g vercel

# Deploy to production
bun run deploy
```

**Option 2: Using Vercel Dashboard**

1. Push your code to GitHub
2. Visit [vercel.com](https://vercel.com)
3. Import your repository
4. Vercel will auto-detect the configuration from `vercel.json`
5. Deploy!

The `vercel.json` configuration handles:
- Serving the static build from `dist/`
- Proper routing for the single-page app
- Optimized caching headers

### Updating Production Data

To update the dashboard with new data:

```bash
# Fetch latest stats (run locally)
bun run fetch-stats
bun run fetch-price

# Export and rebuild
bun run export-data
bun run build

# Deploy
bunx vercel --prod
```

**Recommendation:** Set up a weekly cron job to automate this process.

## Project Structure

```
hive-stats/
├── frontend.tsx              # React dashboard UI
├── server.ts                 # Development server (Bun.serve)
├── fetch-hive-stats.ts       # HiveSQL data fetcher
├── fetch-hive-price.ts       # Price data fetcher (CryptoCompare)
├── export-data.ts            # Export SQLite → JSON for static deployment
├── build.ts                  # Production build script
├── styles.css                # Tailwind CSS styles
├── index.html                # HTML entry point
├── hive-stats.db             # SQLite database (generated)
├── public/
│   ├── data.json            # Exported data for production
│   └── ...                  # Built assets
├── dist/                    # Production build output
├── vercel.json              # Vercel deployment config
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── .env                     # Environment variables (not in git)
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with HMR |
| `bun run fetch-stats` | Fetch user activity data from HiveSQL |
| `bun run fetch-price` | Fetch price data from CryptoCompare |
| `bun run export-data` | Export SQLite data to JSON |
| `bun run build` | Build production bundle |
| `bun run deploy` | Build and deploy to Vercel |

## Data Sources

- **Blockchain Data:** [HiveSQL](https://hivesql.io) - SQL Server access to Hive blockchain
- **Price Data:** [CryptoCompare](https://cryptocompare.com) - Historical cryptocurrency prices
- **Blockchain:** [Hive](https://hive.io) (2020-present) and [Steem](https://steem.com) (2016-2020)

## Performance Notes

### Initial Data Fetch
- **Duration:** ~1 hour for full historical data (2016-present)
- **Optimization:** Uses indexed date range queries instead of function-based filters
- **Query:** `created >= DATEFROMPARTS(@year, 1, 1)` instead of `DATEPART(YEAR, created) = @year`

### Incremental Updates
- Fetch only the current year: modify `fetch-hive-stats.ts` to set `startYear = 2026`
- Typical update time: ~2-5 minutes

### Database Size
- SQLite database: ~5-10 MB
- Exported JSON: ~2-3 MB

## Troubleshooting

### "Connection refused" error
- Check your HiveSQL credentials in `.env`
- Verify your HiveSQL subscription is active
- Ensure `vip.hivesql.io` is accessible from your network

### "No data found" for recent weeks
- Current week data is intentionally excluded (incomplete)
- Dashboard shows "Last Complete Week" instead

### TypeScript errors
```bash
# Run type checking
bun tsc --noEmit
```

### Build errors
```bash
# Clean and rebuild
rm -rf dist/ public/data.json
bun run export-data
bun run build
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this project for your own analytics needs.

## Credits

**Made by [@cryptosharon](https://peakd.com/@cryptosharon)**

Built with:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [React](https://react.dev) - UI framework
- [Recharts](https://recharts.org) - Charting library
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [Lucide](https://lucide.dev) - Icons
- [HiveSQL](https://hivesql.io) - Blockchain data access
- [CryptoCompare](https://cryptocompare.com) - Price data

## Support

For questions or issues:
- Open an issue on GitHub
- Contact [@cryptosharon](https://peakd.com/@cryptosharon) on Hive
- Check [HiveSQL documentation](https://hivesql.io/documentation)

---

**Note:** This is an independent analytics project and is not officially affiliated with Hive blockchain or HiveSQL.
