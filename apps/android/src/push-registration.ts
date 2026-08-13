import { PushNotifications } from "@capacitor/push-notifications";

import type { AndroidSecureStorage } from "./secure-storage.js";

export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export interface NativePushBridge {
  checkPermission(): Promise<PushPermissionState>;
  requestPermission(): Promise<PushPermissionState>;
  createReminderChannel(): Promise<void>;
  register(): Promise<void>;
  onRegistration(listener: (token: string) => void): Promise<() => Promise<void>>;
  onRegistrationError(listener: () => void): Promise<() => Promise<void>>;
}

export interface DeviceRegistrationTransport {
  register(accessToken: string, pushToken: string): Promise<void>;
}

export type PushRegistrationStatus =
  "SIGNED_OUT" | "PERMISSION_DENIED" | "REGISTRATION_REQUESTED" | "REGISTERED" | "ERROR";

export class AndroidPushRegistrationCoordinator {
  private removeListeners: Array<() => Promise<void>> = [];
  private listenersAttached = false;

  public constructor(
    private readonly nativePush: NativePushBridge,
    private readonly storage: AndroidSecureStorage,
    private readonly transport: DeviceRegistrationTransport,
    private readonly reportStatus: (status: PushRegistrationStatus) => void = () => undefined,
  ) {}

  /** Call after mother authentication and on app foreground. Re-registering is
   * intentional: Capacitor emits the current/rotated FCM token and the server
   * endpoint performs an idempotent refresh. */
  public async synchronize(): Promise<PushRegistrationStatus> {
    if ((await this.storage.getMotherSession()) === null) {
      return this.report("SIGNED_OUT");
    }
    await this.attachListenersOnce();
    let permission = await this.nativePush.checkPermission();
    if (permission === "prompt" || permission === "prompt-with-rationale") {
      permission = await this.nativePush.requestPermission();
    }
    if (permission !== "granted") return this.report("PERMISSION_DENIED");

    try {
      await this.nativePush.createReminderChannel();
      await this.nativePush.register();
      return this.report("REGISTRATION_REQUESTED");
    } catch {
      return this.report("ERROR");
    }
  }

  public async dispose(): Promise<void> {
    await Promise.all(this.removeListeners.map(async (remove) => remove()));
    this.removeListeners = [];
    this.listenersAttached = false;
  }

  private async attachListenersOnce(): Promise<void> {
    if (this.listenersAttached) return;
    const removeRegistration = await this.nativePush.onRegistration((token) => {
      void this.persistToken(token);
    });
    const removeError = await this.nativePush.onRegistrationError(() => {
      this.report("ERROR");
    });
    this.removeListeners = [removeRegistration, removeError];
    this.listenersAttached = true;
  }

  private async persistToken(pushToken: string): Promise<void> {
    try {
      const session = await this.storage.getMotherSession();
      if (session === null) {
        this.report("SIGNED_OUT");
        return;
      }
      await this.transport.register(session.access_token, pushToken);
      this.report("REGISTERED");
    } catch {
      this.report("ERROR");
    }
  }

  private report(status: PushRegistrationStatus): PushRegistrationStatus {
    this.reportStatus(status);
    return status;
  }
}

export class CapacitorNativePushBridge implements NativePushBridge {
  public async checkPermission(): Promise<PushPermissionState> {
    return (await PushNotifications.checkPermissions()).receive;
  }

  public async requestPermission(): Promise<PushPermissionState> {
    return (await PushNotifications.requestPermissions()).receive;
  }

  public async createReminderChannel(): Promise<void> {
    await PushNotifications.createChannel({
      id: "anc_reminders",
      name: "Pengingat ANC",
      description: "Pengingat jadwal pemeriksaan kehamilan",
      importance: 4,
      visibility: 0,
      vibration: true,
    });
  }

  public async register(): Promise<void> {
    await PushNotifications.register();
  }

  public async onRegistration(listener: (token: string) => void): Promise<() => Promise<void>> {
    const handle = await PushNotifications.addListener("registration", ({ value }) => {
      listener(value);
    });
    return async () => handle.remove();
  }

  public async onRegistrationError(listener: () => void): Promise<() => Promise<void>> {
    const handle = await PushNotifications.addListener("registrationError", () => {
      listener();
    });
    return async () => handle.remove();
  }
}

export class ApiDeviceRegistrationTransport implements DeviceRegistrationTransport {
  private readonly endpoint: string;

  public constructor(
    apiBaseUrl: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.endpoint = `${apiBaseUrl.replace(/\/+$/u, "")}/mother/me/devices/android`;
  }

  public async register(accessToken: string, pushToken: string): Promise<void> {
    const response = await this.fetchImplementation(this.endpoint, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ push_token: pushToken }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Device registration failed");
  }
}
