/**
 * Tododo — Ambient Desktop Widget (Vanilla JS Controller)
 * Pure vanilla JavaScript with zero frameworks and zero bundlers.
 */

document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("status-text");

  // Check if Tauri v2 runtime is globally injected
  if (window.__TAURI__) {
    statusText.textContent = "Tauri v2 Native Bridge: Connected";
    console.log("[Tododo] Tauri global bridge detected:", window.__TAURI__);
  } else {
    statusText.textContent = "Running in browser preview mode (Tauri bridge idle)";
    console.warn("[Tododo] window.__TAURI__ not detected. Running outside native shell.");
  }
});
