export { getCurrentActiveTab } from './lib/active-tab';
export {
  messageFailure,
  messageSuccess,
  type ActiveTabSnapshot,
  type ExtensionContext,
  type MessageFailure,
  type MessageResult,
  type MessageSuccess,
  type RuntimeMessage,
  type RuntimeMessageMap,
  type RuntimeMessageType,
  type TabMessage,
  type TabMessageMap,
  type TabMessageType,
} from './messaging/contracts';
export { sendRuntimeMessage } from './messaging/runtime';
export { sendTabMessage } from './messaging/tabs';
export {
  defaultExtensionSettings,
  normalizeExtensionSettings,
  type ExtensionColorScheme,
  type ExtensionSettings,
  type ExtensionStorageSchema,
} from './storage/schema';
export { extensionStorage } from './storage/storage';

