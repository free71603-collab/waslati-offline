/**
 * تطبيق وصلاتي المحلي: تُنسخ ملفات الواجهة إلى حزمة Android ولا يعتمد التطبيق على خادم وقت التشغيل.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.waslati.offline",
  appName: "وصلاتي",
  webDir: "dist/public",
  bundledWebRuntime: false,
};

export default config;
