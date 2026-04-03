// ---------------------------------------------------------------------------
// Beacon – Background Service Worker  (Auto-Research / Fact-Check edition)
// ---------------------------------------------------------------------------

const ICONS = ["icon-1.png", "icon-2.png", "icon-3.png", "icon-4.png"];
const CYCLE_INTERVAL_MS = 220;

// Track icon-cycling intervals per tab.
const cycleTimers = {};

// Track tabs that have requested cancellation.
const cancelledTabs = new Set();

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

const SUMMARIZE_PROMPT = `You are an expert fact-checker and content analyst whose primary mission is to serve the public interest and protect people from misinformation that can fuel social unrest and conflict.

You will be given the raw text of a web page. Your job:
1. Ignore navigation, ads, comments, footers, cookie banners, and anything unrelated to the main article.
2. Identify and extract EVERY factual claim, statistic, quote, sensational statement, and key point from the article.
3. Pay special attention to politically and socially sensitive claims — any statement that could inflame tensions, spread fear, or mislead the public.
4. Flag inflammatory language, sensationalized headlines, gimmicky phrasing, and statements designed to provoke rather than inform.
5. Look for hypocrisy — contradictions between what is claimed and what the same sources have said or done before.
6. Be thorough — do NOT omit any claim or key point, no matter how small.
7. Return a JSON object with a single key "claims" whose value is an array of strings, each string being one distinct claim or key point.
Return ONLY valid JSON, no markdown fences, no explanation.`;

const FACT_CHECK_PROMPT = `You are an empathic, rigorous fact-checker whose primary role is to serve humanity by ensuring people have access to accurate information — especially on politically and socially sensitive topics that can lead to real-world harm, unrest, and conflict.

You are given:
1. A CLAIM from an article.
2. EVIDENCE gathered from multiple external web sources.

Your mission:
- Analyze the evidence carefully and determine whether the claim is **Verified**, **Disputed**, or **Unverified**.
- Call out lies directly and clearly. Do not soften falsehoods.
- Identify sensationalized, inflammatory, or gimmicky statements. If the claim uses language designed to provoke rather than inform, say so.
- Flag hypocrisy — if the claim contradicts the source's own prior statements or actions, point that out.
- Be concise but always explain WHY a claim is disputed or unverified. People deserve to understand the reasoning.

Verdict definitions:
- **Verified**: The evidence supports the claim.
- **Disputed**: The evidence contradicts the claim, or the claim is misleading, exaggerated, or inflammatory.
- **Unverified**: There is not enough evidence to confirm or deny the claim.

Format your response as:
**Verdict:** [Verified / Disputed / Unverified]
**Explanation:** [Your concise explanation citing the evidence and reasoning]`;

const COMMUNITY_NOTE_PROMPT = `You are an expert at writing community notes — concise, empathic, and honest fact-check summaries that serve the public interest. Your primary goal is to protect people from misinformation, debunk sensationalized claims, call out lies, and flag hypocrisy — especially on politically and socially sensitive topics that could fuel unrest and conflict.

You will be given the original article URL and a set of fact-check results for individual claims extracted from the article.

Write a single, cohesive community note that:
- Uses bullet points for each major finding.
- Each bullet MUST contain: the claim, a brief explanation of WHY it is verified/disputed/unverified (1-2 sentences citing evidence), and end with a bold verdict: **Verified**, **Disputed**, or **Unverified**.
- ALWAYS list **Disputed** claims first, then **Unverified**, then **Verified**.
- For disputed claims, be direct about what is wrong and why. Do not soften lies.
- If the article uses inflammatory or sensationalized language, call that out explicitly.
- Uses markdown formatting (bold for verdicts, links where relevant).
- Is balanced, factual, and empathic in tone — remember real people read these and make decisions based on them.
- Do NOT include an overall assessment or summary section at the end. Only list the individual claim findings.

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
    console.log("[Beacon] OpenAI API error:", resp.status, errBody);
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
    console.log("[Beacon] Exa API error:", resp.status, errBody);
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
    console.log("[Beacon] Firecrawl error (non-fatal):", resp.status, url);
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
      if (cancelledTabs.has(tabId)) {
        console.log(`[Beacon] Fact-check cancelled at claim ${i + 1}/${claims.length}`);
        break;
      }
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
        console.log(`[Beacon]   Error processing claim ${i + 1}:`, claimErr);
        factCheckResults.push({
          claim,
          verdict: `**Verdict:** Error\n**Explanation:** Could not fact-check this claim: ${claimErr.message}`,
        });
      }
    }

    cancelledTabs.delete(tabId);

    if (factCheckResults.length === 0) {
      const endTime = Date.now();
      console.log("[Beacon] === Fact-check FINISHED (cancelled, no results) ===");
      stopIconCycle(tabId);
      setIcon(tabId, "icon-1.png");
      return { success: true, note: "Fact-check was stopped before any claims could be verified.", durationMs: endTime - startTime };
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
    console.log("[Beacon] === Fact-check FAILED ===", err, `Duration: ${((endTime - startTime) / 1000).toFixed(1)}s`);
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

  if (message.type === "CANCEL_FACT_CHECK") {
    if (tabId) cancelledTabs.add(tabId);
    sendResponse({ success: true });
    return;
  }

  if (message.type === "PERFORM_FACT_CHECK") {
    handleFactCheck(tabId, message)
      .then(sendResponse)
      .catch((err) => {
        console.log("[Beacon] Unhandled pipeline error:", err);
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
