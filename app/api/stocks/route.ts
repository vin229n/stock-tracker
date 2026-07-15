import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Hardcoded Google Apps Script Web App URL
const GOOGLE_SHEET_APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbxfosCJiYjw_dkACqWkax5dNHE8suOh7m5v-RABSLHmCrzisagY7zeA199XF0CkMMwi/exec";

const LOCAL_STORAGE_FILE = path.join(process.cwd(), "stocks_cache.json");

// Default stocks if sheet/cache has not been initialized
const DEFAULT_STOCKS = [
  { symbol: "AAPL", entryPrice: "175.00", quantity: "15" },
  { symbol: "MSFT", entryPrice: "395.00", quantity: "10" },
  { symbol: "TSLA", entryPrice: "185.00", quantity: "8" },
  { symbol: "NVDA", entryPrice: "115.00", quantity: "20" },
];

function readLocalStocks(): any[] {
  try {
    if (fs.existsSync(LOCAL_STORAGE_FILE)) {
      const data = fs.readFileSync(LOCAL_STORAGE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read local stocks file:", e);
  }
  return DEFAULT_STOCKS;
}

function writeLocalStocks(stocks: any[]) {
  try {
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(stocks, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write local stocks file:", e);
  }
}

export async function GET() {
  try {
    const response = await fetch(GOOGLE_SHEET_APPSCRIPT_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      next: { revalidate: 0 }, // Ensure we don't cache responses on the server side
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script returned status ${response.status}`);
    }

    const stocks = await response.json();
    
    // Cache successfully fetched stocks locally
    writeLocalStocks(stocks);

    return NextResponse.json({ stocks, source: "google_sheets", configured: true });
  } catch (error: any) {
    console.error("Error fetching stocks from Google Sheets, using local fallback:", error);
    const stocks = readLocalStocks();
    return NextResponse.json({
      stocks,
      source: "local_fallback_on_error",
      configured: true,
      error: error.message,
    });
  }
}

export async function POST(request: NextRequest) {
  let stocks: any[];
  try {
    const body = await request.json();
    stocks = body.stocks;
    if (!Array.isArray(stocks)) {
      return NextResponse.json({ error: "Invalid payload. 'stocks' must be an array." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Optimistically write to local server cache first to ensure we have a backup
  writeLocalStocks(stocks);

  try {
    const response = await fetch(GOOGLE_SHEET_APPSCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stocks),
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script POST returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Google Apps Script reported failure");
    }

    return NextResponse.json({ success: true, source: "google_sheets", configured: true });
  } catch (error: any) {
    console.error("Error saving stocks to Google Sheets:", error);
    return NextResponse.json({
      success: false,
      source: "local_fallback_on_error",
      configured: true,
      error: error.message,
    }, { status: 500 });
  }
}
