/**
 * Content script for __EXTENSION_NAME__.
 *
 * Injected into web pages to provide:
 *   - Text selection handling — sends selected text to background for processing
 *   - Minimal overlay UI for displaying results
 */

let overlay: HTMLDivElement | null = null;

// Listen for text selection via mouseup
document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (!text || text.length < 10) {
    removeOverlay();
    return;
  }

  showOverlay(selection!);
});

// Remove overlay when clicking elsewhere
document.addEventListener("mousedown", (e) => {
  if (overlay && !overlay.contains(e.target as Node)) {
    removeOverlay();
  }
});

function showOverlay(selection: Selection) {
  removeOverlay();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const text = selection.toString().trim();

  overlay = document.createElement("div");
  overlay.className = "__PROJECT_NAME__-overlay";
  overlay.innerHTML = `
    <button class="__PROJECT_NAME__-overlay-btn" id="__PROJECT_NAME__-ask-btn">
      Ask AI
    </button>
  `;

  overlay.style.position = "fixed";
  overlay.style.left = `${rect.left + rect.width / 2}px`;
  overlay.style.top = `${rect.bottom + 8}px`;
  overlay.style.transform = "translateX(-50%)";
  overlay.style.zIndex = "2147483647";

  document.body.appendChild(overlay);

  const btn = document.getElementById("__PROJECT_NAME__-ask-btn");
  btn?.addEventListener("click", async () => {
    if (!btn) return;
    btn.textContent = "Thinking...";
    btn.setAttribute("disabled", "true");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "selection",
        payload: { text },
      });

      if (response?.error) {
        showResult(response.error, true);
      } else if (response?.content) {
        showResult(response.content, false);
      }
    } catch (err) {
      showResult("Failed to get response.", true);
    }
  });
}

function showResult(text: string, isError: boolean) {
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="__PROJECT_NAME__-overlay-result ${isError ? "__PROJECT_NAME__-overlay-error" : ""}">
      ${escapeHtml(text)}
    </div>
    <button class="__PROJECT_NAME__-overlay-close" id="__PROJECT_NAME__-close-btn">
      Close
    </button>
  `;

  const closeBtn = document.getElementById("__PROJECT_NAME__-close-btn");
  closeBtn?.addEventListener("click", removeOverlay);
}

function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
