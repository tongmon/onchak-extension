import { extensionStorage } from '@/shared/extension';
import { registerRuntimeMessageListener } from './runtime-router';

chrome.runtime.onInstalled.addListener(() => {
  void extensionStorage.ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  void extensionStorage.ensureDefaults();
});

registerRuntimeMessageListener();

