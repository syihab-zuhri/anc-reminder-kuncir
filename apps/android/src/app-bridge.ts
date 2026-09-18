import { PushNotifications, type ActionPerformed } from "@capacitor/push-notifications";

import { parseTrustedDeepLink } from "./deep-link.js";
import {
  AndroidPushRegistrationCoordinator,
  ApiDeviceRegistrationTransport,
  CapacitorNativePushBridge,
} from "./push-registration.js";
import { AndroidSecureStorage } from "./secure-storage.js";
import { subscribeNtfyWebPush } from "./ntfy-webpush.js";

export interface AppBridgeConfig {
  readonly serverUrl: string;
  readonly apiBaseUrl: string;
}

/**
 * Top-level Capacitor entry point that wires:
 *   1. Deep-link navigation via `parseTrustedDeepLink`
 *   2. Push-notification tap handling (navigate to /mother on tap)
 *   3. Mother session detection -> push registration coordinator
 */
export class CapacitorAppBridge {
  private readonly config: AppBridgeConfig;
  private pushCoordinator: AndroidPushRegistrationCoordinator | null = null;
  private disposed = false;

  public constructor(config: AppBridgeConfig) {
    this.config = config;
  }

  public async initialize(): Promise<void> {
    await this.setupPushNotificationTapListener();
    await this.checkMotherSessionAndRegisterPush();
  }

  /**
   * Check if the mother has an active session. When authenticated, wire the
   * push-registration coordinator so the device token reaches the API.
   *
   * This is best-effort: the portal UI handles its own auth redirects
   * independently of the native bridge.
   */
  private async checkMotherSessionAndRegisterPush(): Promise<void> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/mother-session/me`, {
        cache: "no-store",
        credentials: "include",
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) return;

      const identity: unknown = await response.json();
      if (identity === null || typeof identity !== "object" || !("id" in identity)) return;

      const storage = new AndroidSecureStorage();
      await storage.setMotherSession({
        access_token: "anc_mt_session_cookie_bridge",
        mother_id: (identity as { id: string }).id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const nativePush = new CapacitorNativePushBridge();
      const transport = new ApiDeviceRegistrationTransport(
        `${this.config.serverUrl}/api/mother-proxy`,
      );

      this.pushCoordinator = new AndroidPushRegistrationCoordinator(nativePush, storage, transport);
      await this.pushCoordinator.synchronize();

      // Subscribe Web Push ntfy untuk notifikasi saat app di-background
      void subscribeNtfyWebPush(this.config.serverUrl);
    } catch {
      // Mother session check is best-effort; the portal handles its own auth.
    }
  }

  private async setupPushNotificationTapListener(): Promise<void> {
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event: ActionPerformed) => {
        if (this.disposed) return;
        const data: Record<string, unknown> | undefined = event.notification.data as
          Record<string, unknown> | undefined;
        const destination = data?.["destination"];
        if (typeof destination === "string" && destination.startsWith("/mother")) {
          window.location.href = destination;
        } else {
          window.location.href = "/mother";
        }
      },
    );
  }

  /**
   * Navigate to a trusted deep-link path. Call from host Activity or URL intent handler.
   */
  public navigateDeepLink(incomingUrl: string): void {
    if (this.disposed) return;
    const serverHost = new URL(this.config.serverUrl).hostname;
    const { targetPath } = parseTrustedDeepLink(incomingUrl, serverHost);
    window.location.href = targetPath;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.pushCoordinator !== null) {
      await this.pushCoordinator.dispose();
      this.pushCoordinator = null;
    }
  }
}
