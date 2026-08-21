import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/** «دفتر الحساب الهادئ»: يخزّن قشرة الواجهة بعد أول فتح كي تعود الصفحة دون شبكة. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        window.setTimeout(() => {
          const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.startsWith(window.location.origin));
          const worker = navigator.serviceWorker.controller ?? registration.active;
          worker?.postMessage({
            type: "CACHE_URLS",
            urls: Array.from(new Set([window.location.href, "/", "/manifest.webmanifest", ...urls])),
          });
        }, 800);
      })
      .catch(() => {
        // يعمل التطبيق عبر الإنترنت حتى لو لم يسمح المتصفح بتشغيل عامل الخدمة.
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
