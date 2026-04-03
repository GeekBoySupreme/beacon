/* =========================================================================
   Beacon – Content Script
   Injected into every page to render floating community‑note panels.
   ========================================================================= */

(() => {
  "use strict";

  // Prevent double‑injection
  if (window.__beaconInjected) return;
  window.__beaconInjected = true;

  const PANEL_ID = "beacon-panel";
  const SHADOW_HOST_ID = "beacon-shadow-host";

  // Inline SVG icons (exact from provided SVG files, clip-path removed, overflow hidden)
  const CLAIM_ICON_UNVERIFIED = `<svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#F24769"/><path d="M20.4998 20.8207C22.1451 19.5832 23.1998 17.6819 23.1998 15.55C23.1998 11.8235 19.9767 8.80005 15.9998 8.80005C12.0229 8.80005 8.7998 11.8235 8.7998 15.55C8.7998 17.6819 9.85449 19.5832 11.4998 20.8207V21.85C11.4998 22.5954 12.1045 23.2 12.8498 23.2H13.7498V22.075C13.7498 21.701 14.0507 21.4 14.4248 21.4C14.7989 21.4 15.0998 21.701 15.0998 22.075V23.2H16.8998V22.075C16.8998 21.701 17.2007 21.4 17.5748 21.4C17.9489 21.4 18.2498 21.701 18.2498 22.075V23.2H19.1498C19.8951 23.2 20.4998 22.5954 20.4998 21.85V20.8207ZM11.4998 16C11.4998 15.0072 12.307 14.2 13.2998 14.2C14.2926 14.2 15.0998 15.0072 15.0998 16C15.0998 16.9929 14.2926 17.8 13.2998 17.8C12.307 17.8 11.4998 16.9929 11.4998 16ZM18.6998 14.2C19.6926 14.2 20.4998 15.0072 20.4998 16C20.4998 16.9929 19.6926 17.8 18.6998 17.8C17.707 17.8 16.8998 16.9929 16.8998 16C16.8998 15.0072 17.707 14.2 18.6998 14.2Z" fill="black"/></svg>`;

  const CLAIM_ICON_FLAGGED = `<svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#FFCD56"/><path d="M12.5004 10.4001C12.5004 9.9576 12.1429 9.6001 11.7004 9.6001C11.2579 9.6001 10.9004 9.9576 10.9004 10.4001V21.6001C10.9004 22.0426 11.2579 22.4001 11.7004 22.4001C12.1429 22.4001 12.5004 22.0426 12.5004 21.6001V18.5601L14.0679 18.0901C15.1154 17.7751 16.2454 17.8726 17.2229 18.3626C18.2904 18.8976 19.5354 18.9626 20.6529 18.5426L21.5804 18.1951C21.8929 18.0776 22.1004 17.7801 22.1004 17.4451V11.2526C22.1004 10.6776 21.4954 10.3026 20.9804 10.5601L20.6854 10.7076C19.5629 11.2701 18.2404 11.2701 17.1154 10.7076C16.2054 10.2526 15.1579 10.1626 14.1854 10.4551L12.5004 10.9601V10.4001Z" fill="black"/></svg>`;

  const CLAIM_ICON_VERIFIED = `<svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#25E192"/><path d="M23 13.5L15.5002 21.1667L11.3335 17" stroke="black" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const CLOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  // Badge icons (14px versions for verdict badges)
  const BADGE_ICON_UNVERIFIED = `<svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#F24769"/><path d="M20.4998 20.8207C22.1451 19.5832 23.1998 17.6819 23.1998 15.55C23.1998 11.8235 19.9767 8.80005 15.9998 8.80005C12.0229 8.80005 8.7998 11.8235 8.7998 15.55C8.7998 17.6819 9.85449 19.5832 11.4998 20.8207V21.85C11.4998 22.5954 12.1045 23.2 12.8498 23.2H13.7498V22.075C13.7498 21.701 14.0507 21.4 14.4248 21.4C14.7989 21.4 15.0998 21.701 15.0998 22.075V23.2H16.8998V22.075C16.8998 21.701 17.2007 21.4 17.5748 21.4C17.9489 21.4 18.2498 21.701 18.2498 22.075V23.2H19.1498C19.8951 23.2 20.4998 22.5954 20.4998 21.85V20.8207ZM11.4998 16C11.4998 15.0072 12.307 14.2 13.2998 14.2C14.2926 14.2 15.0998 15.0072 15.0998 16C15.0998 16.9929 14.2926 17.8 13.2998 17.8C12.307 17.8 11.4998 16.9929 11.4998 16ZM18.6998 14.2C19.6926 14.2 20.4998 15.0072 20.4998 16C20.4998 16.9929 19.6926 17.8 18.6998 17.8C17.707 17.8 16.8998 16.9929 16.8998 16C16.8998 15.0072 17.707 14.2 18.6998 14.2Z" fill="black"/></svg>`;

  const BADGE_ICON_FLAGGED = `<svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#FFCD56"/><path d="M12.5004 10.4001C12.5004 9.9576 12.1429 9.6001 11.7004 9.6001C11.2579 9.6001 10.9004 9.9576 10.9004 10.4001V21.6001C10.9004 22.0426 11.2579 22.4001 11.7004 22.4001C12.1429 22.4001 12.5004 22.0426 12.5004 21.6001V18.5601L14.0679 18.0901C15.1154 17.7751 16.2454 17.8726 17.2229 18.3626C18.2904 18.8976 19.5354 18.9626 20.6529 18.5426L21.5804 18.1951C21.8929 18.0776 22.1004 17.7801 22.1004 17.4451V11.2526C22.1004 10.6776 21.4954 10.3026 20.9804 10.5601L20.6854 10.7076C19.5629 11.2701 18.2404 11.2701 17.1154 10.7076C16.2054 10.2526 15.1579 10.1626 14.1854 10.4551L12.5004 10.9601V10.4001Z" fill="black"/></svg>`;

  const BADGE_ICON_VERIFIED = `<svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden"><rect x="0.000976562" y="16.001" width="22.9854" height="22.278" rx="3" transform="rotate(-45 0.000976562 16.001)" fill="#25E192"/><path d="M23 13.5L15.5002 21.1667L11.3335 17" stroke="black" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Button icons
  const ICON_SEARCH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

  const ICON_STOP = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/></svg>`;

  const ICON_LOADING = `<svg class="beacon-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

  const ICON_REFRESH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;

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

  /** Post-process rendered HTML to add color classes to verdict keywords */
  function injectVerdictIcons(html) {
    // Handle patterns like <strong>Verdict: Verified</strong> — extract just the verdict keyword
    html = html.replace(/<strong>\s*(?:Verdict:?\s*)?\s*(Verified)\s*<\/strong>/gi,
      '<strong class="beacon-verdict-verified">Verified</strong>');
    html = html.replace(/<strong>\s*(?:Verdict:?\s*)?\s*(Disputed)\s*<\/strong>/gi,
      '<strong class="beacon-verdict-disputed">Disputed</strong>');
    html = html.replace(/<strong>\s*(?:Verdict:?\s*)?\s*(Unverified)\s*<\/strong>/gi,
      '<strong class="beacon-verdict-unverified">Unverified</strong>');
    html = html.replace(/<strong>\s*(?:Verdict:?\s*)?\s*(Error)\s*<\/strong>/gi,
      '<strong class="beacon-verdict-error">Error</strong>');
    // Also handle markdown bold that wasn't yet converted
    html = html.replace(/\*\*\s*(?:Verdict:?\s*)?\s*Verified\s*\*\*/gi,
      '<strong class="beacon-verdict-verified">Verified</strong>');
    html = html.replace(/\*\*\s*(?:Verdict:?\s*)?\s*Disputed\s*\*\*/gi,
      '<strong class="beacon-verdict-disputed">Disputed</strong>');
    html = html.replace(/\*\*\s*(?:Verdict:?\s*)?\s*Unverified\s*\*\*/gi,
      '<strong class="beacon-verdict-unverified">Unverified</strong>');
    html = html.replace(/\*\*\s*(?:Verdict:?\s*)?\s*Error\s*\*\*/gi,
      '<strong class="beacon-verdict-error">Error</strong>');
    return html;
  }

  /** Sort claims by verdict, strip labels, render as callout cards with verdict badges */
  function processAndSortClaims(html) {
    return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (fullMatch, ulContent) => {
      const liRegex = /<li>([\s\S]*?)<\/li>/g;
      const items = [];
      let match;
      while ((match = liRegex.exec(ulContent)) !== null) {
        let content = match[1];
        let verdict = 'unknown';
        let verdictLabel = '';

        // Extract verdict from colored strong tags
        const verdictMatch = content.match(/<strong class="beacon-verdict-(\w+)">(\w+)<\/strong>/i);
        if (verdictMatch) {
          verdict = verdictMatch[1];
          verdictLabel = verdictMatch[2];
        }

        // Fallback verdict detection from plain text
        if (verdict === 'unknown') {
          if (/\berror\b/i.test(content)) { verdict = 'error'; verdictLabel = 'Error'; }
          else if (/disputed/i.test(content)) { verdict = 'disputed'; verdictLabel = 'Disputed'; }
          else if (/\bunverified\b/i.test(content)) { verdict = 'unverified'; verdictLabel = 'Unverified'; }
          else if (/\bverified\b/i.test(content)) { verdict = 'verified'; verdictLabel = 'Verified'; }
        }

        // Remove verdict colored tags
        content = content.replace(/<strong class="beacon-verdict-[^"]*">[^<]*<\/strong>/gi, '');
        // Remove Claim:/Verdict: label prefixes (bold or plain)
        content = content.replace(/<strong>\s*(Claim|Verdict):?\s*<\/strong>\s*/gi, '');
        content = content.replace(/\b(Verdict|Claim):?\s*(?:Verified|Disputed|Unverified|Error)?\s*[—–:\-]?\s*/gi, '');
        // Remove bold Explanation: label prefix but keep the explanation text
        content = content.replace(/<strong>\s*Explanation:?\s*<\/strong>\s*/gi, '');
        content = content.replace(/(?:^|<br\s*\/?>)\s*Explanation:?\s*/gi, '');
        // Clean up leading/trailing separators and whitespace
        content = content
          .replace(/^(<br\s*\/?>|\s|[.:—–-])+/gi, '')
          .replace(/(<br\s*\/?>|\s|[.:—–-])+$/gi, '')
          .trim();

        items.push({ content, verdict, verdictLabel });
      }

      if (items.length === 0) return fullMatch;

      // Sort: disputed/error first, then unverified (flagged), then verified, then unknown
      const order = { disputed: 0, error: 1, unverified: 2, verified: 3, unknown: 4 };
      items.sort((a, b) => (order[a.verdict] ?? 4) - (order[b.verdict] ?? 4));

      const badgeIconMap = {
        disputed: BADGE_ICON_UNVERIFIED,
        error: BADGE_ICON_UNVERIFIED,
        unverified: BADGE_ICON_FLAGGED,
        verified: BADGE_ICON_VERIFIED,
        unknown: BADGE_ICON_FLAGGED
      };

      const badgeClassMap = {
        disputed: 'beacon-verdict-badge--disputed',
        error: 'beacon-verdict-badge--error',
        unverified: 'beacon-verdict-badge--unverified',
        verified: 'beacon-verdict-badge--verified',
        unknown: 'beacon-verdict-badge--unverified'
      };

      return `<div class="beacon-claims-list">${items.map(item =>
        `<div class="beacon-claim-callout">
          <div class="beacon-claim-text">${item.content}</div>
          ${item.verdictLabel ? `<div class="beacon-verdict-badge ${badgeClassMap[item.verdict]}">
            ${badgeIconMap[item.verdict]}
            ${item.verdictLabel}
          </div>` : ''}
        </div>`
      ).join('')}</div>`;
    });
  }

  /** Extract overall assessment from end of HTML and return separately */
  function extractOverallAssessment(html) {
    const lastUlEnd = html.lastIndexOf('</ul>');
    if (lastUlEnd === -1) return { assessment: '', remaining: html };

    const afterUl = html.slice(lastUlEnd + 5);
    const beforeAndUl = html.slice(0, lastUlEnd + 5);

    let assessment = afterUl
      .replace(/^(<br\s*\/?>|\s)+/gi, '')
      .replace(/<strong[^>]*>\s*Overall[^<]*<\/strong>/gi, '')
      .replace(/^\s*Overall\s*[Aa]ssessment:?\s*/i, '')
      .replace(/^(<br\s*\/?>|\s)+/gi, '')
      .replace(/(<br\s*\/?>|\s)+$/gi, '')
      // Strip list markup so the assessment renders as plain body text
      .replace(/<\/?ul>/gi, '')
      .replace(/<li>/gi, '')
      .replace(/<\/li>/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!assessment) return { assessment: '', remaining: html };
    return { assessment, remaining: beforeAndUl };
  }

  // -------------------------------------------------------------------
  // Main UI Logic
  // -------------------------------------------------------------------

  function getShadowStyles() {
    return `
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");

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
        max-height: 160px;
        background: rgba(17, 17, 19, 0.82);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
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
        transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .beacon-panel--expanded {
        max-height: 53vh;
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
        width: 20px;
        height: 20px;
        border: 1px solid rgba(148, 24, 24, 0.75);
        background: radial-gradient(circle at 35% 35%, #ff6b6b, #e63946 60%, #c0392b);
        color: rgba(0,0,0,0.45);
        border-radius: 50%;
        font-size: 16px;
        ver
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        padding: 0;
        box-shadow:
          inset 0 1px 2px rgba(255,255,255,0.35),
          inset 0 -1px 2px rgba(0,0,0,0.2),
          0 1px 3px rgba(0,0,0,0.3);
      }
      .beacon-close-btn:hover {
        background: radial-gradient(circle at 35% 35%, #ff8787, #ef4444 60%, #dc2626);
        color: rgba(0,0,0,0.6);
        box-shadow:
          inset 0 1px 2px rgba(255,255,255,0.4),
          inset 0 -1px 2px rgba(0,0,0,0.25),
          0 1px 4px rgba(0,0,0,0.4);
      }

      .beacon-title {
        font-size: 14px;
        font-weight: 400;
        color: #fff;
        letter-spacing: 0.02em;
      }

      .beacon-subtitle {
        font-size: 13px;
        color: #a1a1aa;
        line-height: 1.4;
        margin-top: 4px;
      }

      .beacon-body-wrapper {
        position: relative;
        flex: 1 1 auto;
        overflow: auto;
      }

      .beacon-body {
        padding: 16px;
        overflow-y: auto;
        max-height: 100%;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE/Edge */
      }
      .beacon-body::-webkit-scrollbar {
        display: none; /* Chrome/Safari */
      }

      .beacon-fade-overlay {
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
      .beacon-fade-overlay.hidden {
        opacity: 0;
      }

      .beacon-scroll-pill {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(59, 130, 246, 0.9);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 12px;
        border-radius: 20px;
        pointer-events: none;
        z-index: 2;
        transition: opacity 0.3s ease;
      }
      .beacon-scroll-pill.hidden {
        opacity: 0;
      }

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
      .beacon-btn svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
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
      .beacon-content h3:first-child { margin-top: 0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 13px; }
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

      .beacon-time {
        font-size: 12px;
        color: #a78bfa;
        text-align: left;
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .beacon-time svg {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      /* Verdict color classes */
      .beacon-verdict-verified { color: #4ade80; }
      .beacon-verdict-disputed { color: #f87171; }
      .beacon-verdict-unverified { color: #facc15; }
      .beacon-verdict-error { color: #a1a1aa; }

      /* tl;dr section */
      .beacon-tldr {
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .beacon-tldr-label {
        font-size: 13px;
        font-weight: 600;
        color: #FBBF93;
        margin-bottom: 4px;
      }
      .beacon-tldr-text {
        font-size: 13.5px;
        line-height: 1.6;
        color: #d4d4d8;
      }
      .beacon-tldr-text strong {
        color: #fff;
        font-weight: 600;
      }
      .beacon-tldr-text a {
        color: #60a5fa;
        text-decoration: none;
      }

      /* Claim callout cards */
      .beacon-claims-list {
        margin-bottom: 12px;
      }
      .beacon-claim-callout {
        // padding: 10px 12px;
        border-left: 2px solid rgba(255,255,255,0.2);
        margin-bottom: 8px;
        padding-left: 8px;
        // background: rgba(255,255,255,0.03);
        // border-radius: 6px;
      }
      .beacon-claim-text {
        font-size: 13.5px;
        line-height: 1.6;
        color: #d4d4d8;
      }
      .beacon-claim-text strong {
        color: #fff;
        font-weight: 500;
        font-style: oblique;
      }
      .beacon-claim-text a {
        color: #60a5fa;
        text-decoration: none;
      }
      .beacon-claim-text a:hover {
        text-decoration: underline;
      }

      /* Verdict badges */
      .beacon-verdict-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        margin-top: 8px;
        letter-spacing: 0.01em;
      }
      .beacon-verdict-badge svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
      .beacon-verdict-badge--verified {
        background: rgba(37, 225, 146, 0.15);
        color: #25E192;
      }
      .beacon-verdict-badge--disputed {
        background: rgba(242, 71, 105, 0.15);
        color: #F24769;
      }
      .beacon-verdict-badge--unverified {
        background: rgba(255, 205, 86, 0.15);
        color: #FFCD56;
      }
      .beacon-verdict-badge--error {
        background: rgba(161, 161, 170, 0.15);
        color: #a1a1aa;
      }

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .beacon-fade-in {
        animation: fadeInUp 0.35s ease forwards;
      }

      .beacon-spin {
        animation: spin 1s linear infinite;
      }

      .beacon-stop-btn {
        margin-top: 12px;
        background: transparent;
        color: #a1a1aa;
        border: 1px solid rgba(255,255,255,0.1);
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .beacon-stop-btn svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
      .beacon-stop-btn:hover {
        color: #fff;
        border-color: rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.05);
      }
      .beacon-stop-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
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
        <div class="beacon-subtitle">Fact check every piece of news.</div>
        <button class="beacon-close-btn" id="beacon-close" title="Close">&times;</button>
      </div>
      <div class="beacon-body-wrapper">
        <div class="beacon-body">
          <button id="beacon-start-btn" class="beacon-btn">${ICON_SEARCH} Fact check this page</button>
        </div>
      </div>
    `;

    shadow.appendChild(container);

    container.querySelector("#beacon-close").addEventListener("click", () => {
      container.remove();
    });

    const btn = container.querySelector("#beacon-start-btn");
    btn.addEventListener("click", () => handleFactCheckStart(container));
  }

  async function handleFactCheckStart(container) {
    // Expand panel with animation
    container.classList.add('beacon-panel--expanded');

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
    // Hide subtitle once fact-check begins
    const subtitle = container.querySelector(".beacon-subtitle");
    if (subtitle) subtitle.remove();
    // Hide fade/pill during loading
    const wrapper = container.querySelector(".beacon-body-wrapper");
    const existingFade = wrapper.querySelector(".beacon-fade-overlay");
    const existingPill = wrapper.querySelector(".beacon-scroll-pill");
    if (existingFade) existingFade.remove();
    if (existingPill) existingPill.remove();

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;" class="beacon-fade-in">
        <div class="beacon-spinner"></div>
        <div style="margin-top: 15px; color: #a1a1aa; font-size: 13px; text-align: center;">Analyzing content &<br>fact-checking claims...</div>
        <button class="beacon-stop-btn" id="beacon-stop-btn">${ICON_STOP} Stop looking</button>
      </div>
    `;

    const stopBtn = body.querySelector("#beacon-stop-btn");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "CANCEL_FACT_CHECK" });
        stopBtn.innerHTML = `${ICON_LOADING} Wrapping up…`;
        stopBtn.disabled = true;
      });
    }

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
             console.log("[Beacon] Runtime error:", chrome.runtime.lastError.message);
             renderError(container, chrome.runtime.lastError.message);
             return;
        }
        if (response && response.success) {
            console.log("[Beacon] Fact-check succeeded. Rendering result.");
            renderResult(container, response.note, response.durationMs || (endTime - startTime));
        } else {
            console.log("[Beacon] Fact-check failed:", response ? response.error : "Unknown error");
            renderError(container, response ? response.error : "Unknown error");
        }
    });
  }

  function renderResult(container, noteMarkdown, durationMs) {
    const body = container.querySelector(".beacon-body");
    let html = renderMarkdown(noteMarkdown);
    html = injectVerdictIcons(html);

    // Extract overall assessment before processing claims into callouts
    const { assessment, remaining } = extractOverallAssessment(html);
    // Process claims into sorted callout cards with verdict badges
    let claimsHtml = processAndSortClaims(remaining);
    // Strip trailing overall assessment text after the last claims-list
    claimsHtml = claimsHtml.replace(/(<\/div>)(?:<br\s*\/?>|\s)*(?:<h[3-5][^>]*>.*?<\/h[3-5]>|<strong[^>]*>.*?<\/strong>|[^<]+)*$/i, '$1');

    const durationSec = (durationMs / 1000).toFixed(1);

    const tldrHtml = assessment ? `
      <div class="beacon-tldr">
        <div class="beacon-tldr-label">tl;dr :</div>
        <div class="beacon-tldr-text">${assessment}</div>
      </div>
    ` : '';

    body.innerHTML = `
      <div class="beacon-content beacon-fade-in">
        ${tldrHtml}
        ${claimsHtml}
      </div>
      <div class="beacon-time">${CLOCK_ICON} Completed in ${durationSec}s</div>
      <div style="margin-top: 16px;">
         <button id="reset-btn" class="beacon-btn beacon-secondary-btn">${ICON_REFRESH} Check again</button>
      </div>
    `;

    // Set up fade overlay + scroll pill
    const wrapper = container.querySelector(".beacon-body-wrapper");
    // Remove old fade/pill if any
    const oldFade = wrapper.querySelector(".beacon-fade-overlay");
    const oldPill = wrapper.querySelector(".beacon-scroll-pill");
    if (oldFade) oldFade.remove();
    if (oldPill) oldPill.remove();

    const isOverflowing = body.scrollHeight > body.clientHeight;
    if (isOverflowing) {
      const fade = document.createElement("div");
      fade.className = "beacon-fade-overlay";
      wrapper.appendChild(fade);

      const pill = document.createElement("div");
      pill.className = "beacon-scroll-pill";
      pill.textContent = "Scroll for more";
      wrapper.appendChild(pill);

      let scrolled = false;
      body.addEventListener("scroll", () => {
        if (!scrolled) {
          scrolled = true;
          fade.classList.add("hidden");
          pill.classList.add("hidden");
        }
      }, { once: true });
    }

    body.querySelector("#reset-btn").addEventListener("click", () => {
      // Clear body and show logic again
       handleFactCheckStart(container);
    });
  }

  function renderError(container, errorMsg) {
    console.log("[Beacon] Rendering error:", errorMsg);
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
      } else {
        renderInitialState();
      }
    }
  });

  // Kickoff
  renderInitialState();

})();
