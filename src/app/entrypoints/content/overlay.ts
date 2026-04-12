const OVERLAY_HOST_ID = 'onchak-extension-overlay-host';

let overlayEnabled = false;

function removeOverlay(): void {
  document.getElementById(OVERLAY_HOST_ID)?.remove();
}

function createOverlay(): HTMLElement {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;

  const shadowRoot = host.attachShadow({ mode: 'open' });

  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        pointer-events: none;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: linear-gradient(135deg, #0f766e, #155e75);
        color: #f8fafc;
        font: 600 13px/1.2 Aptos, "Segoe UI Variable", "Trebuchet MS", sans-serif;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #fde68a;
        box-shadow: 0 0 0 6px rgba(253, 230, 138, 0.24);
      }

      .meta {
        opacity: 0.78;
        font-weight: 500;
      }
    </style>
    <div class="badge" aria-hidden="true">
      <span class="dot"></span>
      <span>Onchak active</span>
      <span class="meta">MV3 bridge connected</span>
    </div>
  `;

  return host;
}

export function setOverlayVisibility(enabled: boolean): void {
  overlayEnabled = enabled;

  if (!enabled) {
    removeOverlay();
    return;
  }

  if (document.getElementById(OVERLAY_HOST_ID)) {
    return;
  }

  document.documentElement.append(createOverlay());
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

