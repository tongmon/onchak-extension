import type {
  MessageResult,
  TabMessage,
  TabMessageMap,
  TabMessageType,
} from './contracts';

const DEBUG_TAB_MESSAGING = true;

function logTabMessageDebug(
  stage: string,
  details: Record<string, unknown>,
): void {
  if (!DEBUG_TAB_MESSAGING) {
    return;
  }

  console.info(`[Onchak][tabs][${stage}]`, details);
}

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

  logTabMessageDebug('send', {
    tabId,
    messageType: message.type,
  });

  try {
    return await send();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown sendTabMessage error.';

    logTabMessageDebug('send-failed', {
      tabId,
      messageType: message.type,
      errorMessage,
    });

    if (
      errorMessage.includes('back/forward cache') ||
      errorMessage.includes('message channel is closed')
    ) {
      await delay(150);

      logTabMessageDebug('retry', {
        tabId,
        messageType: message.type,
      });

      return send();
    }

    throw error;
  }
}
