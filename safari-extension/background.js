// Background service worker for Safari
// Note: WebSocket connections are now handled by each content script (tab)
// so each tab gets its own unique number

// Safari Web Extensions support both browser and chrome namespaces
// Using browser namespace for better Safari compatibility
const runtime = typeof browser !== 'undefined' ? browser : chrome;

// Handle messages from content scripts
runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    // Get status from the current active tab's content script
    runtime.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        runtime.tabs.sendMessage(tabs[0].id, { type: 'getStatus' }, (response) => {
          sendResponse(response || { connected: false, number: null });
        });
      } else {
        sendResponse({ connected: false, number: null });
      }
    });
    return true; // Keep channel open for async response
  }
});

