import type { ExtensionSettings } from '../storage/schema';

export interface ActiveTabSnapshot {
  tabId: number | null;
  tabTitle: string | null;
  tabUrl: string | null;
  pageTitle: string | null;
  contentScriptConnected: boolean;
  overlayEnabled: boolean;
}

export interface ExtensionContext {
  extensionVersion: string;
  handledAt: string;
  storageArea: 'sync';
  activeTab: ActiveTabSnapshot;
}

export interface RuntimeMessageMap {
  'system/get-extension-context': {
    request: undefined;
    response: ExtensionContext;
  };
  'page/set-active-tab-overlay': {
    request: { enabled: boolean };
    response: {
      applied: boolean;
      tabId: number | null;
      contentScriptConnected: boolean;
    };
  };
}

export interface TabMessageMap {
  'page/get-dom-snapshot': {
    request: undefined;
    response: {
      title: string;
      href: string;
      overlayEnabled: boolean;
    };
  };
  'page/set-overlay': {
    request: { enabled: boolean };
    response: {
      overlayEnabled: boolean;
    };
  };
}

export interface MessageSuccess<T> {
  ok: true;
  data: T;
}

export interface MessageFailure {
  ok: false;
  error: string;
}

export type MessageResult<T> = MessageSuccess<T> | MessageFailure;

type MessageShape<
  TType extends string,
  TPayload,
> = TPayload extends undefined
  ? { type: TType; payload?: never }
  : { type: TType; payload: TPayload };

export type RuntimeMessageType = keyof RuntimeMessageMap;
export type TabMessageType = keyof TabMessageMap;

export type RuntimeMessage<T extends RuntimeMessageType = RuntimeMessageType> =
  MessageShape<T, RuntimeMessageMap[T]['request']>;

export type TabMessage<T extends TabMessageType = TabMessageType> =
  MessageShape<T, TabMessageMap[T]['request']>;

export function messageSuccess<T>(data: T): MessageSuccess<T> {
  return { ok: true, data };
}

export function messageFailure(error: unknown): MessageFailure {
  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unknown extension bridge error.',
  };
}

export type { ExtensionSettings };

