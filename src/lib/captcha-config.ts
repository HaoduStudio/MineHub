import wasmUrl from "@cap.js/wasm/browser/cap_wasm_bg.wasm?url"

// Cap preloads WASM during module evaluation, so configure it before importing the widget.
window.CAP_CUSTOM_WASM_URL = wasmUrl
