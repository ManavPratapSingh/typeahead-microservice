/**
 * seed.ts
 * Generates ~500 realistic Amazon-style product titles with synthetic review
 * counts and bulk-inserts them into the search_frequencies table.
 * Run with: npm run seed
 */
import fs from "fs";
import path from "path";
import { pool } from "./db/postgres";

// ── Building blocks for product title generation ────────────────────────────

const brands = [
  "Samsung", "Apple", "Sony", "Bose", "Nike", "Adidas", "Philips", "Logitech",
  "Dell", "HP", "Lenovo", "Asus", "JBL", "Canon", "Nikon", "Dyson",
  "Anker", "Xiaomi", "OnePlus", "Boat", "Realme", "Amazon", "Google",
  "Microsoft", "LG", "Puma", "Under Armour", "Corsair", "Razer", "HyperX",
];

const categories = [
  "Wireless Earbuds", "Bluetooth Speaker", "Running Shoes", "Laptop Stand",
  "Mechanical Keyboard", "Gaming Mouse", "USB-C Hub", "Phone Case",
  "Screen Protector", "Power Bank", "Smartwatch", "Fitness Tracker",
  "Webcam", "Monitor", "Tablet", "E-Reader", "Headphones", "Charger",
  "Backpack", "Water Bottle", "Desk Lamp", "Office Chair", "Mouse Pad",
  "External SSD", "Flash Drive", "HDMI Cable", "Tripod", "Ring Light",
  "Air Purifier", "Robot Vacuum", "Hair Dryer", "Electric Toothbrush",
  "Coffee Maker", "Blender", "Instant Pot", "Kitchen Scale",
  "Yoga Mat", "Resistance Bands", "Dumbbells", "Jump Rope",
];

const adjectives = [
  "Pro", "Ultra", "Lite", "Max", "Plus", "Elite", "Mini", "Slim",
  "Premium", "Essential", "Advanced", "Classic", "Sport", "Active",
  "Turbo", "Flex", "Smart", "Eco", "Nano", "Mega",
];

const suffixes = [
  "2024 Edition", "Gen 3", "V2", "with Noise Cancelling", "Fast Charging",
  "Ergonomic", "Portable", "Foldable", "Waterproof", "Lightweight",
  "RGB", "4K", "HD", "Wireless", "Compact", "Rechargeable",
  "", "", "", "", // empty entries to make suffixes optional
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProductTitle(): string {
  const brand = pick(brands);
  const adj = pick(adjectives);
  const category = pick(categories);
  const suffix = pick(suffixes);

  return suffix
    ? `${brand} ${adj} ${category} ${suffix}`
    : `${brand} ${adj} ${category}`;
}

/**
 * Generate a synthetic review count (used as baseline frequency).
 * Distribution is skewed: most products have few reviews, a handful are very popular.
 */
function generateReviewCount(): number {
  // Pareto-ish distribution: mostly 5–100, some up to 2000
  const base = Math.random();
  if (base < 0.6) return Math.floor(Math.random() * 50) + 5;       // 5–54
  if (base < 0.85) return Math.floor(Math.random() * 200) + 50;    // 50–249
  if (base < 0.95) return Math.floor(Math.random() * 500) + 250;   // 250–749
  return Math.floor(Math.random() * 1200) + 750;                    // 750–1949
}

// ── Seeding logic ───────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  let rows: { query: string; frequency: number }[] = [];

  const datasetPath = path.join(__dirname, "..", "words-dataset.json");
  if (fs.existsSync(datasetPath)) {
    console.log(`[seed] Found large dataset at ${datasetPath}. Loading...`);
    const fileContent = fs.readFileSync(datasetPath, "utf-8");
    rows = JSON.parse(fileContent);
    console.log(`[seed] Loaded ${rows.length} entries from dataset.`);
  } else {
    console.log("[seed] Large dataset not found. Generating mock Amazon products...");
    const TARGET_COUNT = 500;
    const titles = new Set<string>();
    while (titles.size < TARGET_COUNT) {
      titles.add(generateProductTitle().toLowerCase());
    }
    rows = Array.from(titles).map((title) => ({
      query: title,
      frequency: generateReviewCount(),
    }));
  }

  const client = await pool.connect();
  try {
    console.log("[seed] Clearing existing search_frequencies table...");
    await client.query("TRUNCATE TABLE search_frequencies");

    // Insert in batches of 5,000 rows to prevent parameter count limit violations
    const BATCH_SIZE = 5000;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const valuePlaceholders: string[] = [];
      const values: (string | number)[] = [];

      batch.forEach((row, i) => {
        const offset = i * 2;
        valuePlaceholders.push(`($${offset + 1}, $${offset + 2})`);
        values.push(row.query, row.frequency);
      });

      const sql = `
        INSERT INTO search_frequencies (query, frequency)
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (query) DO UPDATE
          SET frequency = search_frequencies.frequency + EXCLUDED.frequency,
              updated_at = NOW();
      `;

      await client.query(sql, values);
    }
    console.log(`[seed] Successfully seeded ${rows.length} total entries.`);
  } catch (err) {
    console.error("[seed] Seeding failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
