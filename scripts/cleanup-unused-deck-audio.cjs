const fs = require("fs");
const path = require("path");
const { createClient } = require("../apps/web/node_modules/@supabase/supabase-js");

const BUCKET = "deck-audio";
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;

function readEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }
  return result;
}

function parseArgs(argv) {
  return {
    execute: argv.includes("--execute"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/cleanup-unused-deck-audio.cjs
  node scripts/cleanup-unused-deck-audio.cjs --execute

Default mode is a dry-run. --execute deletes only:
  1_orphan_storage_not_referenced
  2_deleted_decks_no_rooms

Required env:
  SUPABASE_SERVICE_ROLE_KEY

The script also reads .env.cleanup.local and apps/web/.env.local for URL values.`);
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatCategorySummary(category, items) {
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
  return {
    category,
    objectCount: items.length,
    bytes,
    mb: formatMb(bytes),
  };
}

async function fetchAll(label, queryFactory) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw new Error(`Could not fetch ${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listStorageFolder(storage, prefix = "") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await storage.list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      const folder = prefix || "/";
      throw new Error(`Could not list storage folder ${folder}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listStorageObjects(storage, prefix = "") {
  const items = await listStorageFolder(storage, prefix);
  const objects = [];

  for (const item of items) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      objects.push({
        name,
        metadata: item.metadata ?? {},
      });
      continue;
    }

    // Supabase Storage returns folders without an object id. Deck audio is
    // normally deckId/cardId.mp3, but recurse so older paths are handled too.
    objects.push(...(await listStorageObjects(storage, name)));
  }

  return objects;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = {
    ...readEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local")),
    ...readEnvFile(path.join(__dirname, "..", ".env.cleanup.local")),
    ...process.env,
  };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Put it in .env.cleanup.local or pass it as an env var.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const storageObjects = await listStorageObjects(supabase.storage.from(BUCKET));

  const deckCards = await fetchAll("deck cards", (from, to) =>
    supabase
      .from("deck_cards")
      .select("audio_url, deck_id")
      .not("audio_url", "is", null)
      .neq("audio_url", "")
      .range(from, to)
  );

  const decks = await fetchAll("decks", (from, to) =>
    supabase.from("decks").select("id, status").range(from, to)
  );

  const rooms = await fetchAll("rooms", (from, to) =>
    supabase.from("rooms").select("id, deck_id").range(from, to)
  );

  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const roomDeckIds = new Set(rooms.map((room) => room.deck_id).filter(Boolean));
  const references = new Map();
  for (const card of deckCards) {
    const pathName = card.audio_url;
    if (!pathName) continue;
    const deck = deckById.get(card.deck_id);
    const current = references.get(pathName) ?? {
      hasReadyDeck: false,
      hasDeletedDeck: false,
      hasRoom: false,
    };
    current.hasReadyDeck ||= deck?.status === "ready";
    current.hasDeletedDeck ||= deck?.status === "deleted";
    current.hasRoom ||= roomDeckIds.has(card.deck_id);
    references.set(pathName, current);
  }

  const categorized = {
    "1_orphan_storage_not_referenced": [],
    "2_deleted_decks_no_rooms": [],
    "3_deleted_decks_still_has_rooms": [],
    "4_used_by_ready_decks": [],
    "5_other_referenced": [],
  };

  for (const object of storageObjects) {
    const bytes = Number(object.metadata?.size ?? 0);
    const ref = references.get(object.name);
    let category = "5_other_referenced";
    if (!ref) category = "1_orphan_storage_not_referenced";
    else if (ref.hasReadyDeck) category = "4_used_by_ready_decks";
    else if (ref.hasDeletedDeck && !ref.hasRoom) category = "2_deleted_decks_no_rooms";
    else if (ref.hasDeletedDeck && ref.hasRoom) category = "3_deleted_decks_still_has_rooms";

    categorized[category].push({ name: object.name, bytes });
  }

  console.table(Object.entries(categorized).map(([category, items]) => formatCategorySummary(category, items)));

  const deletable = [
    ...categorized["1_orphan_storage_not_referenced"],
    ...categorized["2_deleted_decks_no_rooms"],
  ];
  const deletableBytes = deletable.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`Safe cleanup target: ${deletable.length} object(s), ${formatMb(deletableBytes)}.`);

  if (!args.execute) {
    console.log("Dry-run only. Re-run with --execute to delete the safe cleanup target.");
    return;
  }

  let deleted = 0;
  for (const batch of chunk(deletable, DELETE_BATCH_SIZE)) {
    const { error } = await supabase.storage.from(BUCKET).remove(batch.map((item) => item.name));
    if (error) throw new Error(`Storage delete failed after ${deleted} object(s): ${error.message}`);
    deleted += batch.length;
    console.log(`Deleted ${deleted}/${deletable.length} object(s)...`);
  }

  console.log(`Done. Deleted ${deleted} object(s), approximately ${formatMb(deletableBytes)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
