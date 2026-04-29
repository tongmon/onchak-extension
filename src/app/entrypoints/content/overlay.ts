const OVERLAY_HOST_ID = 'onchak-extension-overlay-host';

let overlayEnabled = false;

function removeOverlay(): void {
  document.getElementById(OVERLAY_HOST_ID)?.remove();
}

export function setOverlayVisibility(_enabled: boolean): void {
  overlayEnabled = false;
  removeOverlay();
}

export function getOverlayEnabled(): boolean {
  return overlayEnabled;
}

export function getDomSnapshot(): {
  title: string;
  href: string;
  overlayEnabled: boolean;
} {
  return {
    title: document.title,
    href: window.location.href,
    overlayEnabled,
  };
}
