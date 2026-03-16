require("dotenv").config();

const http = require("http");
const { createClient } = require("@supabase/supabase-js");

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABLE_NAME = "beacon-note-storage";

/** CORS headers – wide‑open so browser extensions can call from any origin. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Send a JSON response. */
function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

/** Collect the full request body as a string. */
function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/** Parse a URL's query‑string into a plain object. */
function parseQuery(urlString) {
  const url = new URL(urlString, "http://localhost");
  const params = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /sendNote
 *
 * Expects a JSON body:
 * {
 *   "url":            "https://example.com/some-page",
 *   "community_note": "This is the note content …",
 *   "timestamp":      "2026-03-13T16:55:22+05:30"   // ISO‑8601 string
 * }
 */
async function handleSendNote(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
  }

  let body;
  try {
    const raw = await getBody(req);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(res, 400, { error: "Invalid JSON body." });
  }

  const { url, community_note, timestamp } = body;

  if (!url || !community_note) {
    return jsonResponse(res, 400, {
      error: "Missing required fields: url, community_note.",
    });
  }

  // Use provided timestamp or fall back to now (UTC)
  const dateTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

  const { data, error } = await supabase.from(TABLE_NAME).insert([
    {
      url,
      community_note,
      date_time: dateTime,
    },
  ]).select();

  if (error) {
    console.error("Supabase insert error:", error);
    return jsonResponse(res, 500, { error: "Failed to store note.", details: error.message });
  }

  return jsonResponse(res, 201, {
    message: "Note stored successfully.",
    data: data[0],
  });
}

/**
 * GET /fetchNote?url=https://example.com/some-page
 *
 * Returns all community notes that match the given URL, ordered newest‑first.
 */
async function handleFetchNote(req, res) {
  if (req.method !== "GET") {
    return jsonResponse(res, 405, { error: "Method not allowed. Use GET." });
  }

  const query = parseQuery(req.url);
  const targetUrl = query.url;

  if (!targetUrl) {
    return jsonResponse(res, 400, { error: "Missing required query parameter: url." });
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("url", targetUrl)
    .order("date_time", { ascending: false });

  if (error) {
    console.error("Supabase select error:", error);
    return jsonResponse(res, 500, { error: "Failed to fetch notes.", details: error.message });
  }

  return jsonResponse(res, 200, {
    count: data.length,
    notes: data,
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight for browser extensions
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const pathname = new URL(req.url, "http://localhost").pathname;

  try {
    switch (pathname) {
      case "/sendNote":
        return await handleSendNote(req, res);
      case "/fetchNote":
        return await handleFetchNote(req, res);
      default:
        return jsonResponse(res, 404, { error: "Route not found." });
    }
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonResponse(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Beacon server running at http://localhost:${PORT}`);
  console.log(`  POST /sendNote   – store a community note`);
  console.log(`  GET  /fetchNote  – retrieve notes by URL`);
});
