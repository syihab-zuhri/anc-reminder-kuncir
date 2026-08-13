import type { CapacitorConfig } from "@capacitor/cli";

import { createTrustedServerConfig } from "./src/trusted-origin.ts";

const server = createTrustedServerConfig(process.env.CAPACITOR_SERVER_URL, process.env.NODE_ENV);

const config: CapacitorConfig = {
  appId: "id.my.kuncir.posyandu.anc",
  appName: "Pengingat ANC",
  webDir: "www",
  ...(server === undefined ? {} : { server }),
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["alert", "sound"],
    },
  },
};

export default config;
