import type {
  MessageResult,
  RuntimeMessage,
  RuntimeMessageMap,
  RuntimeMessageType,
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

export async function sendRuntimeMessage<T extends RuntimeMessageType>(
  message: RuntimeMessage<T>,
): Promise<RuntimeMessageMap[T]['response']> {
  return unwrapMessageResult(
    chrome.runtime.sendMessage(
      message,
    ) as Promise<MessageResult<RuntimeMessageMap[T]['response']>>,
  );
}

