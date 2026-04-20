import type {
  MessageResult,
  TabMessage,
  TabMessageMap,
  TabMessageType,
} from './contracts';

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function unwrapMessageResult<T>(
  promise: Promise<MessageResult<T>>,
): Promise<T> {
  const result = await promise;

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function sendTabMessage<T extends TabMessageType>(
  tabId: number,
  message: TabMessage<T>,
): Promise<TabMessageMap[T]['response']> {
  const send = () =>
    unwrapMessageResult(
      chrome.tabs.sendMessage(
        tabId,
        message,
      ) as Promise<MessageResult<TabMessageMap[T]['response']>>,
    );

  try {
    return await send();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown sendTabMessage error.';

    if (
      errorMessage.includes('back/forward cache') ||
      errorMessage.includes('message channel is closed')
    ) {
      await delay(150);

      return send();
    }

    throw error;
  }
}
