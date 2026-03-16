/* =========================================================================
   Beacon – Content Script
   Injected into every page to render floating community‑note panels
   and the compose form.
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

  /** Minimal markdown → HTML (bold, italic, links, code, line breaks) */
  function renderMarkdown(md) {
    let html = md
      // Code blocks (```)
      .replace(/```([\s\S]*?)```/g, '<pre class="beacon-code-block">$1</pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="beacon-inline-code">$1</code>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Headings (### → h5, ## → h4, # → h3 within the panel)
      .replace(/^### (.+)$/gm, '<h5 class="beacon-heading">$1</h5>')
      .replace(/^## (.+)$/gm, '<h4 class="beacon-heading">$1</h4>')
      .replace(/^# (.+)$/gm, '<h3 class="beacon-heading">$1</h3>')
      // Unordered list items
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, "<br>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, (match) => {
      return "<ul>" + match.replace(/<br>/g, "") + "</ul>";
    });

    return html;
  }

  /** Format ISO date string to a readable string */
  function formatDate(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  // -------------------------------------------------------------------
  // Shadow DOM host (isolates our styles from the page)
  // -------------------------------------------------------------------

  function getOrCreateHost() {
    let host = document.getElementById(SHADOW_HOST_ID);
    if (host) return host.shadowRoot;

    host = document.createElement("div");
    host.id = SHADOW_HOST_ID;
    host.style.cssText =
      "all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;width:0;height:0;";

    const shadow = host.attachShadow({ mode: "open" });

    // Inject styles into shadow DOM
    const style = document.createElement("style");
    style.textContent = getShadowStyles();
    shadow.appendChild(style);

    document.documentElement.appendChild(host);
    return shadow;
  }

  function getShadowStyles() {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .beacon-panel {
        pointer-events: auto;
        position: fixed;
        top: 16px;
        left: 16px;
        width: 380px;
        max-height: calc(100vh - 32px);
        background: #111113;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.45),
          0 2px 8px rgba(0, 0, 0, 0.25),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #e4e4e7;
        overflow: hidden;
        animation: beacon-slide-in 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .beacon-panel.beacon-closing {
        animation: beacon-slide-out 0.22s cubic-bezier(0.55, 0, 1, 0.45) forwards;
      }

      @keyframes beacon-slide-in {
        from {
          opacity: 0;
          transform: translateY(-12px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes beacon-slide-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-12px) scale(0.97);
        }
      }

      /* Title bar */
      .beacon-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        cursor: default;
        user-select: none;
      }

      .beacon-titlebar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .beacon-logo {
        width: 22px;
        height: 22px;
        border-radius: 6px;
      }

      .beacon-title {
        font-size: 13px;
        font-weight: 600;
        color: #fafafa;
        letter-spacing: -0.01em;
      }

      .beacon-close-btn {
        width: 26px;
        height: 26px;
        border: none;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 7px;
        color: #a1a1aa;
        font-size: 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        line-height: 1;
      }

      .beacon-close-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fafafa;
      }

      /* Body */
      .beacon-body {
        padding: 16px;
        overflow-y: auto;
        max-height: calc(100vh - 100px);
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.12) transparent;
      }

      .beacon-body::-webkit-scrollbar {
        width: 5px;
      }
      .beacon-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .beacon-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 10px;
      }

      /* Note card */
      .beacon-note-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
      }

      .beacon-note-card:last-child {
        margin-bottom: 0;
      }

      .beacon-note-content {
        font-size: 13.5px;
        line-height: 1.65;
        color: #d4d4d8;
      }

      .beacon-note-content strong {
        color: #fafafa;
        font-weight: 600;
      }

      .beacon-note-content em {
        font-style: italic;
        color: #a1a1aa;
      }

      .beacon-note-content a {
        color: #60a5fa;
        text-decoration: none;
      }

      .beacon-note-content a:hover {
        text-decoration: underline;
      }

      .beacon-heading {
        color: #fafafa;
        margin: 8px 0 4px;
      }

      h3.beacon-heading { font-size: 16px; }
      h4.beacon-heading { font-size: 14px; }
      h5.beacon-heading { font-size: 13px; }

      .beacon-code-block {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        padding: 10px 12px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 12px;
        color: #a1a1aa;
        overflow-x: auto;
        display: block;
        margin: 6px 0;
      }

      .beacon-inline-code {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 12px;
        color: #f472b6;
      }

      .beacon-note-content ul {
        padding-left: 18px;
        margin: 4px 0;
      }

      .beacon-note-content li {
        margin-bottom: 2px;
      }

      .beacon-note-meta {
        margin-top: 10px;
        font-size: 11px;
        color: #71717a;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .beacon-note-meta-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #52525b;
      }

      /* Compose form */
      .beacon-compose-area {
        padding: 16px;
      }

      .beacon-compose-label {
        font-size: 12px;
        font-weight: 500;
        color: #a1a1aa;
        margin-bottom: 8px;
        display: block;
      }

      .beacon-compose-url {
        font-size: 11px;
        color: #71717a;
        background: rgba(255,255,255,0.04);
        border-radius: 6px;
        padding: 6px 10px;
        margin-bottom: 12px;
        word-break: break-all;
        border: 1px solid rgba(255,255,255,0.05);
      }

      .beacon-textarea {
        width: 100%;
        min-height: 120px;
        max-height: 300px;
        resize: vertical;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 12px 14px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13.5px;
        line-height: 1.6;
        color: #e4e4e7;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .beacon-textarea::placeholder {
        color: #52525b;
      }

      .beacon-textarea:focus {
        border-color: rgba(96, 165, 250, 0.4);
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.08);
      }

      .beacon-textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .beacon-hint {
        font-size: 11px;
        color: #52525b;
        margin-top: 6px;
        margin-bottom: 14px;
      }

      .beacon-submit-btn {
        width: 100%;
        height: 40px;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: #fff;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.18s ease;
        position: relative;
      }

      .beacon-submit-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
      }

      .beacon-submit-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .beacon-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Spinner */
      .beacon-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.25);
        border-top-color: #fff;
        border-radius: 50%;
        animation: beacon-spin 0.6s linear infinite;
      }

      @keyframes beacon-spin {
        to { transform: rotate(360deg); }
      }

      /* Success flash */
      .beacon-success-flash {
        animation: beacon-success-pulse 0.6s ease;
      }

      @keyframes beacon-success-pulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
        50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }

      /* Badge on title for note count */
      .beacon-badge {
        background: rgba(96, 165, 250, 0.15);
        color: #60a5fa;
        font-size: 11px;
        font-weight: 600;
        padding: 1px 7px;
        border-radius: 20px;
        margin-left: 6px;
      }
    `;
  }

  // -------------------------------------------------------------------
  // Panel management
  // -------------------------------------------------------------------

  function removePanel(shadow) {
    const existing = shadow.getElementById(PANEL_ID);
    if (existing) {
      existing.classList.add("beacon-closing");
      existing.addEventListener("animationend", () => existing.remove(), { once: true });
    }
  }

  function createTitleBar(shadow, title, badgeCount) {
    const bar = document.createElement("div");
    bar.className = "beacon-titlebar";

    const left = document.createElement("div");
    left.className = "beacon-titlebar-left";

    const logo = document.createElement("img");
    logo.className = "beacon-logo";
    logo.src = chrome.runtime.getURL("icon-1.png");
    logo.alt = "Beacon";

    const titleEl = document.createElement("span");
    titleEl.className = "beacon-title";
    titleEl.textContent = title;

    left.appendChild(logo);
    left.appendChild(titleEl);

    if (badgeCount > 0) {
      const badge = document.createElement("span");
      badge.className = "beacon-badge";
      badge.textContent = badgeCount;
      left.appendChild(badge);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "beacon-close-btn";
    closeBtn.innerHTML = "&#x2715;";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", () => removePanel(shadow));

    bar.appendChild(left);
    bar.appendChild(closeBtn);
    return bar;
  }

  // -------------------------------------------------------------------
  // Show note(s)
  // -------------------------------------------------------------------

  function showNotePanel(notes) {
    const shadow = getOrCreateHost();
    removePanel(shadow);

    // Wait for close animation
    setTimeout(() => {
      const panel = document.createElement("div");
      panel.className = "beacon-panel";
      panel.id = PANEL_ID;

      panel.appendChild(createTitleBar(shadow, "Community Note", notes.length));

      const body = document.createElement("div");
      body.className = "beacon-body";

      notes.forEach((note) => {
        const card = document.createElement("div");
        card.className = "beacon-note-card";

        const content = document.createElement("div");
        content.className = "beacon-note-content";
        content.innerHTML = renderMarkdown(note.community_note || "");

        card.appendChild(content);

        if (note.date_time || note.created_at) {
          const meta = document.createElement("div");
          meta.className = "beacon-note-meta";
          meta.innerHTML = `
            <span>${formatDate(note.date_time || note.created_at)}</span>
          `;
          card.appendChild(meta);
        }

        body.appendChild(card);
      });

      panel.appendChild(body);
      shadow.appendChild(panel);
    }, 50);
  }

  // -------------------------------------------------------------------
  // Show compose form
  // -------------------------------------------------------------------

  function showComposePanel(url) {
    const shadow = getOrCreateHost();
    removePanel(shadow);

    setTimeout(() => {
      const panel = document.createElement("div");
      panel.className = "beacon-panel";
      panel.id = PANEL_ID;

      panel.appendChild(createTitleBar(shadow, "Write a Note", 0));

      const area = document.createElement("div");
      area.className = "beacon-compose-area";

      // URL display
      const urlBox = document.createElement("div");
      urlBox.className = "beacon-compose-url";
      urlBox.textContent = url;
      area.appendChild(urlBox);

      // Label
      const label = document.createElement("label");
      label.className = "beacon-compose-label";
      label.textContent = "Your community note";
      area.appendChild(label);

      // Textarea
      const textarea = document.createElement("textarea");
      textarea.className = "beacon-textarea";
      textarea.placeholder = "Write your note here… (Markdown supported)";
      area.appendChild(textarea);

      // Hint
      const hint = document.createElement("div");
      hint.className = "beacon-hint";
      hint.textContent = "Supports **bold**, *italic*, [links](url), `code`, and more.";
      area.appendChild(hint);

      // Submit button
      const submitBtn = document.createElement("button");
      submitBtn.className = "beacon-submit-btn";
      submitBtn.textContent = "Submit Note";
      area.appendChild(submitBtn);

      submitBtn.addEventListener("click", () => {
        const noteText = textarea.value.trim();
        if (!noteText) {
          textarea.focus();
          return;
        }

        // Disable UI
        textarea.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="beacon-spinner"></div> Submitting…';

        const payload = {
          url: url,
          community_note: noteText,
          timestamp: new Date().toISOString(),
        };

        chrome.runtime.sendMessage(
          { type: "SUBMIT_NOTE", payload },
          (response) => {
            if (response && response.success) {
              // Play success sound using Tone.js
              playSuccessSound();

              // Show the newly submitted note
              panel.classList.add("beacon-success-flash");
              const newNote = response.note;
              setTimeout(() => {
                showNotePanel([newNote]);
              }, 300);
            } else {
              // Re‑enable on failure
              textarea.disabled = false;
              submitBtn.disabled = false;
              submitBtn.textContent = "Submit Note";
              // Show error briefly
              const errMsg = (response && response.error) || "Submission failed.";
              submitBtn.textContent = "⚠ " + errMsg;
              setTimeout(() => {
                submitBtn.textContent = "Submit Note";
              }, 3000);
            }
          }
        );
      });

      panel.appendChild(area);
      shadow.appendChild(panel);

      // Focus textarea
      setTimeout(() => textarea.focus(), 100);
    }, 50);
  }

  // -------------------------------------------------------------------
  // Tone.js success sound
  // -------------------------------------------------------------------

  let toneLoaded = false;
  let toneLoadPromise = null;

  function loadToneJS() {
    if (toneLoaded) return Promise.resolve();
    if (toneLoadPromise) return toneLoadPromise;

    toneLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js";
      script.onload = () => {
        toneLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load Tone.js"));
      document.head.appendChild(script);
    });

    return toneLoadPromise;
  }

  async function playSuccessSound() {
    try {
      await loadToneJS();

      // Ensure audio context is started
      if (Tone.context.state !== "running") {
        await Tone.start();
      }

      // Create a pleasant success chime
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.05,
          release: 0.8,
        },
        volume: -18,
      }).toDestination();

      const now = Tone.now();
      synth.triggerAttackRelease("C5", "16n", now);
      synth.triggerAttackRelease("E5", "16n", now + 0.08);
      synth.triggerAttackRelease("G5", "16n", now + 0.16);

      // Clean up after sound finishes
      setTimeout(() => synth.dispose(), 2000);
    } catch (err) {
      console.warn("Beacon: Could not play success sound", err);
    }
  }

  // Pre‑load Tone.js in the background
  setTimeout(() => loadToneJS(), 2000);

  // -------------------------------------------------------------------
  // Message listener
  // -------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case "SHOW_NOTE":
        showNotePanel(message.notes);
        break;

      case "TOGGLE_NOTE": {
        const shadow = getOrCreateHost();
        const existing = shadow.getElementById(PANEL_ID);
        if (existing) {
          removePanel(shadow);
        } else {
          showNotePanel(message.notes);
        }
        break;
      }

      case "SHOW_COMPOSE":
        showComposePanel(message.url);
        break;
    }
  });
})();
