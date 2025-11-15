// Background service worker
// Note: WebSocket connections are now handled by each content script (tab)
// so each tab gets its own unique number

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    // Get status from the current active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'getStatus' }, (response) => {
          sendResponse(response || { connected: false, number: null });
        });
      } else {
        sendResponse({ connected: false, number: null });
      }
    });
    return true; // Keep channel open for async response
  }
});

