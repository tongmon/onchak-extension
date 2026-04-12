export async function getCurrentActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return activeTab ?? null;
}

