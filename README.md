# 🚀 Pincode Availability Checker & Scraper

A high-performance, real-time bulk availability checker for e-commerce platforms (Amazon & Flipkart). It utilizes Playwright stealth browsers, Server-Sent Events (SSE) streaming, and an intelligent in-memory postal database of **19,464 Indian pincodes** to run parallel regional delivery checks.

---

## ✨ Features

- **🌐 Restructured Tabbed UI**:
  - **City Hubs**: Easily scan custom presets for specific city zones.
  - **Scan Full City**: Batch check delivery availability across an entire city (e.g. Lucknow, Bangalore) grouped by district aliases.
  - **Custom PINs**: Input custom, comma-separated lists of pincodes.
- **⚡ SSE Live-Streaming & Timer**: Progress is streamed in real-time to the UI. Includes a running stopwatch display and a completed statistics summary (e.g., `43 pincodes checked in 1m 15s`).
- **🛡️ Scraper Stealth & Evasion**:
  - Employs dynamic user-agent rotation, viewport sizing, and stealth injections.
  - **Staggered Launch Delays**: Introduces a tiny 250ms stagger between concurrent tabs to smooth out local CPU load and bypass e-commerce "burst-connection" bot-detection limits.
  - **Early CAPTCHA/Robot Detection**: Fast-fails on security blocks to avoid long timeouts.
- **🔄 Retry All Drawer**: Dedicated sliding drawer showing unverified checks with a one-click "Retry All" launcher that rebuilds failed queues on the fly.
- **📦 In-Memory Postal Database**: Maps district names to common aliases (e.g., *Kheri* -> *Lakhimpur Kheri*, *Prayagraj* -> *Allahabad*) for intuitive search suggestions.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Automation / Scraping**: Playwright (Headless Chromium)
- **Real-Time Data**: Server-Sent Events (SSE)
- **Job Concurrency**: `p-limit` parallel execution queue
- **Frontend**: Single Page Application (Vanilla HTML5, Tailwind-inspired CSS variables, Javascript ES6)

---

## ⚙️ Configuration & Environment

Create a `.env` file in the `backend/` directory (reference `.env.example`):

```ini
PORT=5000
SCRAPER_CONCURRENCY=6   # 6 for local high-speed runs, set to 2 for server/low-RAM hosts
# Optional database connections (falls back to memory modes if empty/unavailable):
MONGODB_URI=
REDIS_URL=
```

---

## 🚀 Running Locally

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```
2. **Install Playwright Browser binaries**:
   ```bash
   npx playwright install chromium
   ```
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
4. **Access the App**: Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 🌐 Production Deployment

For low-resource cloud hosting (e.g., Render, Railway, or VPS with 512MB RAM):
1. **Reduce Concurrency**: Set `SCRAPER_CONCURRENCY=2` in environment variables.
2. **Start Server**:
   ```bash
   npm start
   ```
