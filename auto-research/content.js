/* =========================================================================
   Beacon – Content Script
   ========================================================================= */

(() => {
  "use strict";

  // Prevent double‑injection
  if (window.__beaconInjected) return;
  window.__beaconInjected = true;

  const PANEL_ID = "beacon-panel";
  const SHADOW_HOST_ID = "beacon-shadow-host";

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** Minimal markdown → HTML (bold, italic, links, code, line breaks, lists) */
  function renderMarkdown(md) {
    if (!md) return "";
    // Basic cleanup
    let html = md.replace(/^[\s\S]*?community note:?/i, ""); 
    
    html = html
      // Code blocks
      .replace(/```([\s\S]*?)```/g, "<pre class=\"beacon-code-block\">$1</pre>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code class=\"beacon-inline-code\">$1</code>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>")
      // Headings
      .replace(/^### (.+)$/gm, "<h5 class=\"beacon-heading\">$1</h5>")
      .replace(/^## (.+)$/gm, "<h4 class=\"beacon-heading\">$1</h4>")
      .replace(/^# (.+)$/gm, "<h3 class=\"beacon-heading\">$1</h3>")
      // Unordered list items
      .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
      // Line breaks
      .replace(/\n/g, "<br>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, (match) => {
      return "<ul>" + match.replace(/<br>/g, "") + "</ul>";
    });

    return html;
  }

  // -------------------------------------------------------------------
  // Main UI Logic
  // -------------------------------------------------------------------

  function getShadowStyles() {
    return `
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
      @import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css");

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      a { text-decoration: none; color: inherit; }
      button, input { font-family: inherit; font-size: 100%; }

      .beacon-panel {
        pointer-events: auto;
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        max-height: 53vh;
        background: #111113;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        font-family: "Inter", system-ui, -apple-system, sans-serif;
        color: #e4e4e7;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        font-size: 14px;
      }

      .beacon-header {
        padding: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
        position: relative;
      }

      .beacon-close-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 24px;
        height: 24px;
        border: none;
        background: rgba(255,255,255,0.08);
        color: #a1a1aa;
        border-radius: 6px;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, color 0.2s;
        padding: 0;
      }
      .beacon-close-btn:hover {
        background: rgba(255,255,255,0.15);
        color: #fff;
      }

      .beacon-title {
        font-size: 16px;
        font-weight: 600;
        color: #fff;
        margin-bottom: 4px;
      }

      .beacon-subtitle {
        font-size: 13px;
        color: #a1a1aa;
        line-height: 1.4;
      }

      /* Body wrapper for fade + pill */
      .beacon-body-wrapper {
        position: relative;
        flex: 1;
        overflow: hidden;
        min-height: 0;
      }

      .beacon-body {
        padding: 16px;
        overflow-y: auto;
        height: 100%;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
      }
      .beacon-body::-webkit-scrollbar { display: none; }

      /* Bottom fade overlay */
      .beacon-fade {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: linear-gradient(to bottom, transparent, #111113);
        pointer-events: none;
        transition: opacity 0.3s ease;
        z-index: 1;
      }
      .beacon-fade.hidden { opacity: 0; }

      /* Scroll-for-more pill */
      .beacon-scroll-pill {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(59,130,246,0.9);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 12px;
        border-radius: 20px;
        z-index: 2;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      .beacon-scroll-pill.hidden { opacity: 0; }

      .beacon-form-group {
        margin-bottom: 12px;
      }

      .beacon-label {
        display: block;
        font-size: 11px;
        font-weight: 500;
        color: #a1a1aa;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .beacon-input {
        width: 100%;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        padding: 8px 10px;
        color: #fff;
        font-size: 13px;
        transition: border-color 0.2s;
      }
      .beacon-input:focus {
        outline: none;
        border-color: #3b82f6;
      }

      .beacon-btn {
        width: 100%;
        background: #3b82f6;
        color: white;
        border: none;
        padding: 10px;
        border-radius: 6px;
        font-weight: 500;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 8px;
      }
      .beacon-btn:hover {
        background: #2563eb;
      }
      .beacon-btn:disabled {
        background: #1e3a8a;
        cursor: not-allowed;
        opacity: 0.7;
      }

      .beacon-secondary-btn {
        background: rgba(255,255,255,0.05);
        color: #a1a1aa;
      }
      .beacon-secondary-btn:hover {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }

      .beacon-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Markdown Output Styles */
      .beacon-content h3, .beacon-content h4, .beacon-content h5 {
        color: #fff; margin: 16px 0 8px; font-weight: 600;
      }
      .beacon-content h3:first-child { margin-top: 0; }
      .beacon-content p, .beacon-content li {
        font-size: 13.5px; line-height: 1.6; color: #d4d4d8; margin-bottom: 8px;
      }
      .beacon-content strong { color: #fff; font-weight: 600; }
      .beacon-content ul { padding-left: 20px; margin-bottom: 12px; }
      .beacon-content a { color: #60a5fa; text-decoration: none; }
      .beacon-content a:hover { text-decoration: underline; }
      .beacon-code-block {
        background: #000; padding: 10px; border-radius: 6px; overflow-x: auto;
        font-family: monospace; font-size: 12px; margin: 8px 0;
      }
      .beacon-inline-code {
        background: rgba(255, 255, 255, 0.1); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em;
      }

      /* Verdict status icons */
      .beacon-verdict {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 13px;
      }
      .beacon-verdict i { font-size: 14px; }
      .beacon-verdict--verified  { color: #22c55e; }
      .beacon-verdict--disputed  { color: #ef4444; }
      .beacon-verdict--unverified { color: #f59e0b; }
      .beacon-verdict--error     { color: #a1a1aa; }

      .beacon-time {
        font-size: 12px;
        color: #60a5fa;
        text-align: left;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .beacon-time i { font-size: 12px; color: #60a5fa; }
    `;
  }

  function getOrCreateHost() {
    let host = document.getElementById(SHADOW_HOST_ID);
    if (host) return host.shadowRoot;

    host = document.createElement("div");
    host.id = SHADOW_HOST_ID;
    host.style.cssText =
      "all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;width:0;height:0;";

    const shadow = host.attachShadow({ mode: "open" });

    // Inject styles
    const style = document.createElement("style");
    style.textContent = getShadowStyles();
    shadow.appendChild(style);

    document.documentElement.appendChild(host);
    return shadow;
  }

  /** Wire up the scroll-fade + pill behaviour on a body wrapper */
  function setupScrollFade(container) {
    const body = container.querySelector(".beacon-body");
    const fade = container.querySelector(".beacon-fade");
    const pill = container.querySelector(".beacon-scroll-pill");
    if (!body || !fade || !pill) return;

    function check() {
      const overflows = body.scrollHeight > body.clientHeight + 4;
      const scrolled = body.scrollTop > 8;
      if (!overflows || scrolled) {
        fade.classList.add("hidden");
        pill.classList.add("hidden");
      } else {
        fade.classList.remove("hidden");
        pill.classList.remove("hidden");
      }
    }

    // initial check after a frame so layout has settled
    requestAnimationFrame(check);
    body.addEventListener("scroll", check, { passive: true });
  }

  function renderInitialState() {
    const shadow = getOrCreateHost();

    // Remove existing panel if present
    const existing = shadow.querySelector(".beacon-panel");
    if (existing) existing.remove();

    const container = document.createElement("div");
    container.className = "beacon-panel";
    container.innerHTML = `
      <div class="beacon-header">
        <div class="beacon-title">Beacon</div>
        <div class="beacon-subtitle">Fact check everything ;)</div>
        <button class="beacon-close-btn" id="beacon-close" title="Close">&times;</button>
      </div>
      <div class="beacon-body-wrapper">
        <div class="beacon-body">
          <button id="beacon-start-btn" class="beacon-btn">Fact check this page</button>
        </div>
        <div class="beacon-fade hidden"></div>
        <div class="beacon-scroll-pill hidden">Scroll for more</div>
      </div>
    `;

    shadow.appendChild(container);

    container.querySelector("#beacon-close").addEventListener("click", () => {
      container.remove();
      chrome.storage.local.set({ beacon_panel_dismissed: true });
    });

    const btn = container.querySelector("#beacon-start-btn");
    btn.addEventListener("click", () => handleFactCheckStart(container));
  }

  async function handleFactCheckStart(container) {
    // Check for keys
    const result = await chrome.storage.local.get(["openai_key", "exa_key", "firecrawl_key"]);
    const hasKeys = result.openai_key && result.exa_key && result.firecrawl_key;

    if (!hasKeys) {
      renderKeyForm(container, result);
    } else {
      performFactCheck(container, result);
    }
  }

  function renderKeyForm(container, existingKeys) {
    const body = container.querySelector(".beacon-body");
    body.innerHTML = `
      <div class="beacon-form-group">
        <label class="beacon-label">OpenAI API Key</label>
        <input type="password" id="openai-key" class="beacon-input" placeholder="sk-..." value="${existingKeys.openai_key || ""}">
      </div>
      <div class="beacon-form-group">
        <label class="beacon-label">Exa API Key</label>
        <input type="password" id="exa-key" class="beacon-input" placeholder="Exa Key" value="${existingKeys.exa_key || ""}">
      </div>
      <div class="beacon-form-group">
        <label class="beacon-label">Firecrawl API Key</label>
        <input type="password" id="firecrawl-key" class="beacon-input" placeholder="fc-..." value="${existingKeys.firecrawl_key || ""}">
      </div>
      <button id="save-keys-btn" class="beacon-btn">Save keys and continue</button>
    `;

    const saveBtn = body.querySelector("#save-keys-btn");
    saveBtn.addEventListener("click", () => {
      const openAiKey = body.querySelector("#openai-key").value.trim();
      const exaKey = body.querySelector("#exa-key").value.trim();
      const firecrawlKey = body.querySelector("#firecrawl-key").value.trim();

      if (openAiKey && exaKey && firecrawlKey) {
        chrome.storage.local.set({
          openai_key: openAiKey,
          exa_key: exaKey,
          firecrawl_key: firecrawlKey
        }, () => {
          performFactCheck(container, { openai_key: openAiKey, exa_key: exaKey, firecrawl_key: firecrawlKey });
        });
      } else {
        alert("Please fill in all API keys.");
      }
    });
  }

  async function performFactCheck(container, keys) {
    const body = container.querySelector(".beacon-body");
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;">
        <div class="beacon-spinner"></div>
        <div style="margin-top: 15px; color: #a1a1aa; font-size: 13px; text-align: center;">Analyzing content &<br>fact-checking claims...</div>
      </div>
    `;

    const startTime = Date.now();
    console.log("[Beacon] Fact-check started at", new Date(startTime).toISOString());

    // Grab content
    const pageContent = document.body.innerText; 

    // Send message to background
    chrome.runtime.sendMessage({
      type: "PERFORM_FACT_CHECK",
      content: pageContent,
      url: window.location.href,
      keys: keys
    }, (response) => {
        const endTime = Date.now();
        const durationSec = ((endTime - startTime) / 1000).toFixed(1);
        console.log("[Beacon] Fact-check ended at", new Date(endTime).toISOString(), `(${durationSec}s)`);

        if (chrome.runtime.lastError) {
             console.error("[Beacon] Runtime error:", chrome.runtime.lastError.message);
             renderError(container, chrome.runtime.lastError.message);
             return;
        }
        if (response && response.success) {
            console.log("[Beacon] Fact-check succeeded. Rendering result.");
            renderResult(container, response.note, response.durationMs || (endTime - startTime));
        } else {
            console.error("[Beacon] Fact-check failed:", response ? response.error : "Unknown error");
            renderError(container, response ? response.error : "Unknown error");
        }
    });
  }

  /** Replace **Verdict:** Xyz with coloured FA icon + label */
  function injectVerdictIcons(html) {
    const map = {
      verified:   { icon: "fa-circle-check",          css: "beacon-verdict--verified" },
      disputed:   { icon: "fa-circle-xmark",           css: "beacon-verdict--disputed" },
      unverified: { icon: "fa-circle-question",        css: "beacon-verdict--unverified" },
      error:      { icon: "fa-triangle-exclamation",   css: "beacon-verdict--error" },
    };

    return html.replace(
      /<strong>Verdict:<\/strong>\s*(Verified|Disputed|Unverified|Error)/gi,
      (_, status) => {
        const key = status.toLowerCase();
        const m = map[key] || map.error;
        return `<span class="beacon-verdict ${m.css}"><i class="fa-solid ${m.icon}"></i>${status}</span>`;
      }
    );
  }

  function renderResult(container, noteMarkdown, durationMs) {
    const body = container.querySelector(".beacon-body");
    let html = renderMarkdown(noteMarkdown);
    html = injectVerdictIcons(html);
    const durationSec = (durationMs / 1000).toFixed(1);
    body.innerHTML = `
      <div class="beacon-content">
        ${html}
      </div>
      <div class="beacon-time"><i class="fa-regular fa-clock"></i>Completed in ${durationSec}s</div>
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
         <button id="reset-btn" class="beacon-btn beacon-secondary-btn">Check again</button>
      </div>
    `;

    setupScrollFade(container);

    body.querySelector("#reset-btn").addEventListener("click", () => {
       handleFactCheckStart(container);
    });
  }

  function renderError(container, errorMsg) {
    console.error("[Beacon] Rendering error:", errorMsg);
    const body = container.querySelector(".beacon-body");
    body.innerHTML = `
      <div style="color: #ef4444; padding: 10px; background: rgba(239,68,68,0.1); border-radius: 6px; font-size: 13px;">
        <strong>Error:</strong> ${errorMsg}
      </div>
      <button id="retry-btn" class="beacon-btn" style="margin-top: 12px;">Retry</button>
    `;
    body.querySelector("#retry-btn").addEventListener("click", () => handleFactCheckStart(container));
  }

  // Listen for TOGGLE_PANEL from background (toolbar icon click)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_PANEL") {
      const shadow = getOrCreateHost();
      const existing = shadow.querySelector(".beacon-panel");
      if (existing) {
        existing.remove();
        chrome.storage.local.set({ beacon_panel_dismissed: true });
      } else {
        chrome.storage.local.set({ beacon_panel_dismissed: false });
        renderInitialState();
      }
    }
  });

  // Kickoff — only auto-show if the user hasn't dismissed the panel
  chrome.storage.local.get(["beacon_panel_dismissed"], (result) => {
    if (!result.beacon_panel_dismissed) {
      renderInitialState();
    }
  });

})();
