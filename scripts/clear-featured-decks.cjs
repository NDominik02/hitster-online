const fs = require("fs");
const path = require("path");
const { createClient } = require("../apps/web/node_modules/@supabase/supabase-js");

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

async function main() {
  const env = {
    ...readEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local")),
    ...process.env,
  };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const usingServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !key) {
    throw new Error("Missing Supabase URL or key.");
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!usingServiceRole) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(`Anonymous sign-in failed: ${error.message}`);
    }
  }

  const { data: decks, error: selectError } = await supabase
    .from("decks")
    .select("id, name, report")
    .contains("report", { featured: true });

  if (selectError) {
    throw new Error(`Could not read featured decks: ${selectError.message}`);
  }

  if (!decks || decks.length === 0) {
    console.log("No featured decks found. Recommended list is already empty.");
    return;
  }

  let cleared = 0;
  for (const deck of decks) {
    const nextReport = { ...(deck.report || {}) };
    delete nextReport.featured;
    delete nextReport.featuredAt;
    delete nextReport.featuredBy;

    const { error: updateError } = await supabase.from("decks").update({ report: nextReport }).eq("id", deck.id);
    if (updateError) {
      throw new Error(`Could not update deck ${deck.id} (${deck.name}): ${updateError.message}`);
    }
    cleared += 1;
    console.log(`Cleared featured flag: ${deck.name} (${deck.id})`);
  }

  console.log(`Done. Cleared ${cleared} featured deck(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
