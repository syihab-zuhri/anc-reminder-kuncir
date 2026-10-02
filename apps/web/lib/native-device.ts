/**
 * The Android app shows this portal in a WebView, which drops browser downloads and ignores
 * window.print(). The app's AncDevice plugin does both natively; an older app without the plugin
 * cannot, and the page must say so instead of pretending it worked.
 */
export interface SavedFile {
  /** Where the user finds the file, e.g. "Download/Pengingat ANC/data.xlsx". */
  readonly location: string;
  /** True when the file went to the share sheet (Android 9 and older) instead of Download. */
  readonly shared: boolean;
}

export interface AncDevicePlugin {
  saveFile(options: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly data: string;
  }): Promise<SavedFile>;
  print(options: { readonly jobName: string }): Promise<void>;
}

export type DeviceEnvironment =
  | { readonly kind: "browser" }
  | { readonly kind: "app"; readonly plugin: AncDevicePlugin }
  | { readonly kind: "outdated-app" };

interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly isPluginAvailable?: (name: string) => boolean;
  readonly Plugins?: Readonly<Record<string, unknown>>;
}

export function deviceEnvironment(
  scope: { readonly Capacitor?: CapacitorGlobal } = globalThis as { Capacitor?: CapacitorGlobal },
): DeviceEnvironment {
  const capacitor = scope.Capacitor;
  if (capacitor?.isNativePlatform?.() !== true) return { kind: "browser" };
  const plugin = capacitor.Plugins?.["AncDevice"] as Partial<AncDevicePlugin> | undefined;
  const available = capacitor.isPluginAvailable?.("AncDevice") ?? plugin !== undefined;
  return available && typeof plugin?.saveFile === "function" && typeof plugin.print === "function"
    ? { kind: "app", plugin: plugin as AncDevicePlugin }
    : { kind: "outdated-app" };
}

export const OUTDATED_APP_MESSAGE =
  "Aplikasi di HP ini belum bisa menyimpan atau mencetak file. Perbarui aplikasi Pengingat ANC, atau buka portal lewat browser.";
