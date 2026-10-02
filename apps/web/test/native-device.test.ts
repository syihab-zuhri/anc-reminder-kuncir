import { describe, expect, it } from "vitest";

import { deviceEnvironment } from "../lib/native-device";

const plugin = {
  saveFile: () => Promise.resolve({ location: "Download/Pengingat ANC/a.xlsx", shared: false }),
  print: () => Promise.resolve(),
};

describe("device environment", () => {
  it("treats a normal browser as a browser", () => {
    expect(deviceEnvironment({}).kind).toBe("browser");
    expect(deviceEnvironment({ Capacitor: { isNativePlatform: () => false } }).kind).toBe(
      "browser",
    );
  });

  it("uses the app plugin when the installed APK provides it", () => {
    const environment = deviceEnvironment({
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: (name) => name === "AncDevice",
        Plugins: { AncDevice: plugin },
      },
    });
    expect(environment.kind).toBe("app");
  });

  it("flags an older APK so the page does not claim a download or print that cannot happen", () => {
    expect(
      deviceEnvironment({
        Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: {} },
      }).kind,
    ).toBe("outdated-app");
    expect(
      deviceEnvironment({ Capacitor: { isNativePlatform: () => true, Plugins: {} } }).kind,
    ).toBe("outdated-app");
  });
});
