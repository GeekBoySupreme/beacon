// ---------------------------------------------------------------------------
// Beacon – Background Service Worker  (Auto-Research / Fact-Check edition)
// ---------------------------------------------------------------------------

const ICONS = ["icon-1.png", "icon-2.png", "icon-3.png", "icon-4.png"];
const CYCLE_INTERVAL_MS = 220;

// Track icon-cycling intervals per tab.
const cycleTimers = {};

// ---------------------------------------------------------------------------
// Icon cycling (loading animation)
// ---------------------------------------------------------------------------

function startIconCycle(tabId) {
  stopIconCycle(tabId);
  let idx = 0;
  cycleTimers[tabId] = setInterval(() => {
    chrome.action.setIcon({ tabId, path: ICONS[idx % ICONS.length] });
    idx++;
  }, CYCLE_INTERVAL_MS);
}

function stopIconCycle(tabId) {
  if (cycleTimers[tabId]) {
    clearInterval(cycleTimers[tabId]);
    delete cycleTimers[tabId];
  }
}

function setIcon(tabId, iconFile) {
  chrome.action.setIcon({ tabId, path: iconFile });
}

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  stopIconCycle(tabId);
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SUMMARIZE_PROMPT = `You are an expert fact-checker and content analyst.
You will be given the raw text of a web page. Your job:
1. Ignore navigation, ads, comments, footers, cookie banners, and anything unrelated to the main article.
2. Identify and extract EVERY factual claim, statistic, quote, sensational statement, and key point from the article.
3. Be thorough — do NOT omit any claim or key point, no matter how small.
4. Return a JSON object with a single key "claims" whose value is an array of strings, each string being one distinct claim or key point.
Return ONLY valid JSON, no markdown fences, no explanation.`;

const FACT_CHECK_PROMPT = `You are an expert fact-checker. You are given:
1. A CLAIM from an article.
2. EVIDENCE gathered from multiple external web sources.

Analyze the evidence and determine whether the claim is:
- **Verified**: The evidence supports the claim.
- **Disputed**: The evidence contradicts or casts doubt on the claim.
- **Unverified**: There is not enough evidence to confirm or deny the claim.

Provide a concise verdict with a brief explanation citing the evidence.
Format your response as:
**Verdict:** [Verified / Disputed / Unverified]
**Explanation:** [Your concise explanation with references to evidence]`;

const COMMUNITY_NOTE_PROMPT = `You are an expert at writing community notes — concise, neutral, informative fact-check summaries for the general public.

You will be given the original article URL and a set of fact-check results for individual claims extracted from the article.

Write a single, cohesive community note that:
- Uses bullet points for each major finding.
- Uses markdown formatting (bold for verdicts, links where relevant).
- Is balanced, factual, and neutral in tone.
- Highlights any disputed or unverified claims prominently.
- Ends with a brief overall assessment of the article's accuracy.

Keep it readable and under 800 words.`;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function callOpenAI(apiKey, systemPrompt, userMessage, jsonMode = false) {
  console.log("[Beacon] Calling OpenAI...");
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error("[Beacon] OpenAI API error:", resp.status, errBody);
    throw new Error(`OpenAI API error (${resp.status}): ${errBody}`);
  }

  const json = await resp.json();
  console.log("[Beacon] OpenAI response:", json);
  return json.choices[0].message.content;
}

async function searchExa(apiKey, query) {
  console.log("[Beacon] Searching Exa for:", query);
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 3,
      type: "neural",
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error("[Beacon] Exa API error:", resp.status, errBody);
    throw new Error(`Exa API error (${resp.status}): ${errBody}`);
  }

  const json = await resp.json();
  console.log("[Beacon] Exa response:", json);
  return (json.results || []).map((r) => ({ title: r.title, url: r.url }));
}

async function scrapeFirecrawl(apiKey, url) {
  console.log("[Beacon] Scraping via Firecrawl:", url);
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });

  if (!resp.ok) {
    console.error("[Beacon] Firecrawl error (non-fatal):", resp.status, url);
    return null;
  }

  const json = await resp.json();
  console.log("[Beacon] Firecrawl response for", url, json);
  const md = json.data?.markdown || "";
  return md.slice(0, 6000);
}

// ---------------------------------------------------------------------------
// Main fact-check pipeline
// ---------------------------------------------------------------------------

async function handleFactCheck(tabId, { content, url, keys }) {
  const startTime = Date.now();
  console.log("[Beacon] === Fact-check STARTED ===", new Date(startTime).toISOString(), "URL:", url);
  startIconCycle(tabId);

  try {
    // ---- Step 1: Extract claims via OpenAI --------------------------------
    console.log("[Beacon] Step 1: Extracting claims from page content...");
    const rawClaims = await callOpenAI(
      keys.openai_key,
      SUMMARIZE_PROMPT,
      `URL: ${url}\n\nPage content:\n${content.slice(0, 30000)}`,
      true
    );
    console.log("[Beacon] Step 1 complete. Raw claims:", rawClaims);

    let claims;
    try {
      const parsed = JSON.parse(rawClaims);
      claims = parsed.claims || [];
    } catch {
      throw new Error("Failed to parse claims from OpenAI response.");
    }

    console.log(`[Beacon] Extracted ${claims.length} claims:`, claims);

    if (claims.length === 0) {
      const endTime = Date.now();
      console.log("[Beacon] === Fact-check FINISHED (no claims) ===", new Date(endTime).toISOString(), `Duration: ${((endTime - startTime) / 1000).toFixed(1)}s`);
      stopIconCycle(tabId);
      setIcon(tabId, "icon-1.png");
      return { success: true, note: "No factual claims were found on this page.", durationMs: endTime - startTime };
    }

    // ---- Step 2 & 3: For each claim → Exa search → Firecrawl → OpenAI -----
    const factCheckResults = [];

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      console.log(`[Beacon] Step 2-3: Processing claim ${i + 1}/${claims.length}: "${claim}"`);
      try {
        // Search for evidence
        console.log(`[Beacon]   Searching Exa for claim ${i + 1}...`);
        const searchResults = await searchExa(keys.exa_key, claim);
        console.log(`[Beacon]   Exa returned ${searchResults.length} results for claim ${i + 1}`);

        // Scrape top results
        const scrapedContents = [];
        for (const result of searchResults.slice(0, 3)) {
          console.log(`[Beacon]   Scraping: ${result.url}`);
          const scraped = await scrapeFirecrawl(keys.firecrawl_key, result.url);
          if (scraped) {
            scrapedContents.push(`Source: ${result.title} (${result.url})\n${scraped}`);
          }
        }
        console.log(`[Beacon]   Scraped ${scrapedContents.length} pages for claim ${i + 1}`);

        const evidenceText =
          scrapedContents.length > 0
            ? scrapedContents.join("\n\n---\n\n")
            : "No evidence could be retrieved for this claim.";

        // Fact-check with OpenAI
        console.log(`[Beacon]   Fact-checking claim ${i + 1} with OpenAI...`);
        const verdict = await callOpenAI(
          keys.openai_key,
          FACT_CHECK_PROMPT,
          `CLAIM: ${claim}\n\nEVIDENCE:\n${evidenceText}`
        );
        console.log(`[Beacon]   Verdict for claim ${i + 1}:`, verdict);

        factCheckResults.push({ claim, verdict });
      } catch (claimErr) {
        console.error(`[Beacon]   Error processing claim ${i + 1}:`, claimErr);
        factCheckResults.push({
          claim,
          verdict: `**Verdict:** Error\n**Explanation:** Could not fact-check this claim: ${claimErr.message}`,
        });
      }
    }

    // ---- Step 4: Build the community note ----------------------------------
    console.log("[Beacon] Step 4: Building community note from all verdicts...");
    const resultsText = factCheckResults
      .map((r, i) => `### Claim ${i + 1}\n> ${r.claim}\n\n${r.verdict}`)
      .join("\n\n");

    const communityNote = await callOpenAI(
      keys.openai_key,
      COMMUNITY_NOTE_PROMPT,
      `Article URL: ${url}\n\nFact-check results:\n${resultsText}`
    );
    console.log("[Beacon] Step 4 complete. Community note generated.");

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    console.log("[Beacon] === Fact-check FINISHED ===", new Date(endTime).toISOString(), `Duration: ${(durationMs / 1000).toFixed(1)}s`);

    stopIconCycle(tabId);
    setIcon(tabId, "icon-1.png");
    return { success: true, note: communityNote, durationMs };
  } catch (err) {
    const endTime = Date.now();
    console.error("[Beacon] === Fact-check FAILED ===", err, `Duration: ${((endTime - startTime) / 1000).toFixed(1)}s`);
    stopIconCycle(tabId);
    setIcon(tabId, "icon-1.png");
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === "PERFORM_FACT_CHECK") {
    handleFactCheck(tabId, message)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Beacon] Unhandled pipeline error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async response
  }
});

// ---------------------------------------------------------------------------
// Toolbar icon click → toggle popover via content script
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  try {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch (_) {}
});
