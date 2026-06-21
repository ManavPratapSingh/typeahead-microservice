/**
 * seed.ts
 * Generates ~500 realistic Amazon-style product titles with synthetic review
 * counts and bulk-inserts them into the search_frequencies table.
 * Run with: npm run seed
 */
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
  const TARGET_COUNT = 500;
  const titles = new Set<string>();

  // Generate unique product titles
  while (titles.size < TARGET_COUNT) {
    titles.add(generateProductTitle().toLowerCase());
  }

  const rows = Array.from(titles).map((title) => ({
    query: title,
    frequency: generateReviewCount(),
  }));

  // Bulk insert using a single multi-row INSERT with ON CONFLICT to handle dupes
  const valuePlaceholders: string[] = [];
  const values: (string | number)[] = [];

  rows.forEach((row, i) => {
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

  try {
    await pool.query(sql, values);
    console.log(`[seed] Inserted ${rows.length} product entries into search_frequencies.`);
  } catch (err) {
    console.error("[seed] Bulk insert failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
