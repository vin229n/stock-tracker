import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTES_CACHE_FILE = path.join(process.cwd(), "notes_cache.json");

interface StockComment {
  id: string;
  text: string;
  createdAt: string; // ISO date string
}

type NormalizedStockNotes = Record<string, StockComment[]>;

function readNotes(): NormalizedStockNotes {
  try {
    if (fs.existsSync(NOTES_CACHE_FILE)) {
      const data = fs.readFileSync(NOTES_CACHE_FILE, "utf-8");
      const rawNotes = JSON.parse(data) as Record<string, any>;
      const normalizedNotes: NormalizedStockNotes = {};
      let hasMigration = false;

      // Migrate existing strings (legacy notes format) to the new array structure
      for (const symbol in rawNotes) {
        const value = rawNotes[symbol];
        if (typeof value === "string") {
          normalizedNotes[symbol] = [
            {
              id: `legacy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              text: value,
              createdAt: new Date().toISOString(),
            },
          ];
          hasMigration = true;
        } else if (Array.isArray(value)) {
          normalizedNotes[symbol] = value;
        }
      }

      // Automatically persist normalized cache if migration occurred
      if (hasMigration) {
        writeNotes(normalizedNotes);
      }

      return normalizedNotes;
    }
  } catch (e) {
    console.error("Failed to read notes cache file:", e);
  }
  return {};
}

function writeNotes(notes: NormalizedStockNotes) {
  try {
    fs.writeFileSync(NOTES_CACHE_FILE, JSON.stringify(notes, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write notes cache file:", e);
  }
}

export async function GET() {
  try {
    const notes = readNotes();
    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Error fetching notes:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to read notes: " + message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, comments } = await request.json();

    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json(
        { error: "Invalid payload: 'symbol' is required and must be a string." },
        { status: 400 }
      );
    }

    if (!Array.isArray(comments)) {
      return NextResponse.json(
        { error: "Invalid payload: 'comments' must be an array of StockComment." },
        { status: 400 }
      );
    }

    const symbolUpper = symbol.toUpperCase();
    const notes = readNotes();

    // Clean up empty entries to avoid bloating notes_cache.json
    if (comments.length === 0) {
      delete notes[symbolUpper];
    } else {
      notes[symbolUpper] = comments;
    }

    writeNotes(notes);

    return NextResponse.json({ success: true, notes });
  } catch (error) {
    console.error("Error saving note:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to save note: " + message },
      { status: 500 }
    );
  }
}
