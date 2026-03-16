// ---------------------------------------------------------------------------
// Beacon – Background Service Worker
// ---------------------------------------------------------------------------

const API_BASE = "http://localhost:3000";
const ICONS = ["icon-1.png", "icon-2.png", "icon-3.png", "icon-4.png"];
const CYCLE_INTERVAL_MS = 220;

// Track icon‑cycling intervals per tab so we can stop them later.
const cycleTimers = {};

// Track per‑tab state so the content script can query it.
const tabState = {};
// tabState[tabId] = { status: "loading" | "found" | "not_found" | "error", notes: [...] }

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

// ---------------------------------------------------------------------------
// Set a static icon for a tab
// ---------------------------------------------------------------------------

function setIcon(tabId, iconFile) {
  chrome.action.setIcon({ tabId, path: iconFile });
}

// ---------------------------------------------------------------------------
// Fetch notes for a URL
// ---------------------------------------------------------------------------

async function fetchNotesForTab(tabId, url) {
  // Ignore chrome:// and extension pages
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
    tabState[tabId] = { status: "ignored" };
    setIcon(tabId, "icon-1.png");
    return;
  }

  tabState[tabId] = { status: "loading" };
  startIconCycle(tabId);

  try {
    const endpoint = `${API_BASE}/fetchNote?url=${encodeURIComponent(url)}`;
    const resp = await fetch(endpoint);
    const json = await resp.json();

    stopIconCycle(tabId);

    if (json.count && json.count > 0) {
      tabState[tabId] = { status: "found", notes: json.notes };
      setIcon(tabId, "icon-1.png");

      // Tell content script to show the note panel
      try {
        chrome.tabs.sendMessage(tabId, {
          type: "SHOW_NOTE",
          notes: json.notes,
        });
      } catch (_) {
        // Content script might not be ready yet
      }
    } else {
      tabState[tabId] = { status: "not_found" };
      setIcon(tabId, "icon-2.png");
    }
  } catch (err) {
    console.error("Beacon fetch error:", err);
    stopIconCycle(tabId);
    tabState[tabId] = { status: "error" };
    setIcon(tabId, "icon-1.png");
  }
}

// ---------------------------------------------------------------------------
// Listen for tab changes
// ---------------------------------------------------------------------------

// When a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    fetchNotesForTab(tabId, tab.url);
  }
});

// When the user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      // Restore icon state
      const state = tabState[activeInfo.tabId];
      if (state) {
        if (state.status === "not_found") setIcon(activeInfo.tabId, "icon-2.png");
        else if (state.status === "found") setIcon(activeInfo.tabId, "icon-1.png");
      }
    }
  } catch (_) {}
});

// Cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  stopIconCycle(tabId);
  delete tabState[tabId];
});

// ---------------------------------------------------------------------------
// Extension icon click → tell content script to toggle the compose panel
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  const state = tabState[tab.id];

  if (state && state.status === "found") {
    // If notes exist, toggle displaying them
    try {
      chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_NOTE",
        notes: state.notes,
      });
    } catch (_) {}
  } else {
    // No notes – show the compose form
    try {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_COMPOSE",
        url: tab.url,
      });
    } catch (_) {}
  }
});

// ---------------------------------------------------------------------------
// Messages from content script
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === "SUBMIT_NOTE") {
    handleSubmitNote(tabId, message.payload, sendResponse);
    return true; // keep channel open for async response
  }

  if (message.type === "GET_STATE") {
    sendResponse(tabState[tabId] || { status: "unknown" });
    return false;
  }
});

// ---------------------------------------------------------------------------
// Submit a note
// ---------------------------------------------------------------------------

async function handleSubmitNote(tabId, payload, sendResponse) {
  // Start icon cycling while submitting
  startIconCycle(tabId);

  try {
    const resp = await fetch(`${API_BASE}/sendNote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await resp.json();
    stopIconCycle(tabId);

    if (resp.ok) {
      // Update local state
      const newNote = json.data;
      tabState[tabId] = {
        status: "found",
        notes: [newNote, ...(tabState[tabId]?.notes || [])],
      };
      setIcon(tabId, "icon-1.png");
      sendResponse({ success: true, note: newNote });
    } else {
      setIcon(tabId, "icon-2.png");
      sendResponse({ success: false, error: json.error || "Submission failed." });
    }
  } catch (err) {
    stopIconCycle(tabId);
    setIcon(tabId, "icon-1.png");
    sendResponse({ success: false, error: err.message });
  }
}
