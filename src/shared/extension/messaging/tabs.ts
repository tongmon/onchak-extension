import type {
  MessageResult,
  TabMessage,
  TabMessageMap,
  TabMessageType,
} from './contracts';

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
  return unwrapMessageResult(
    chrome.tabs.sendMessage(
      tabId,
      message,
    ) as Promise<MessageResult<TabMessageMap[T]['response']>>,
  );
}

