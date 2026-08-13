import { describe, expect, it, vi } from "vitest";

import {
  AndroidPushRegistrationCoordinator,
  ApiDeviceRegistrationTransport,
  type NativePushBridge,
  type PushPermissionState,
  type PushRegistrationStatus,
} from "../src/push-registration.js";
import { AndroidSecureStorage } from "../src/secure-storage.js";

const accessToken = `anc_mt_${"a".repeat(43)}`;
const pushToken = "synthetic-fcm-token:abc1234567890";

describe("Android FCM token registration", () => {
  it("requests Android permission, creates the channel, and registers refreshed tokens", async () => {
    const storage = signedInStorage();
    const native = new FakeNativePushBridge("prompt");
    const transport = { register: vi.fn(() => Promise.resolve()) };
    const statuses: PushRegistrationStatus[] = [];
    const coordinator = new AndroidPushRegistrationCoordinator(
      native,
      storage,
      transport,
      (status) => statuses.push(status),
    );

    await expect(coordinator.synchronize()).resolves.toBe("REGISTRATION_REQUESTED");
    native.emitToken(pushToken);
    await vi.waitFor(() => expect(transport.register).toHaveBeenCalledWith(accessToken, pushToken));
    expect(native.requestPermissionCalls).toBe(1);
    expect(native.channelCalls).toBe(1);
    expect(statuses).toContain("REGISTERED");

    native.emitToken(`${pushToken}-refreshed`);
    await vi.waitFor(() => expect(transport.register).toHaveBeenCalledTimes(2));
    expect(statuses.at(-1)).toBe("REGISTERED");
  });

  it("does not register when permission is denied or the mother is signed out", async () => {
    const deniedNative = new FakeNativePushBridge("denied");
    const denied = new AndroidPushRegistrationCoordinator(deniedNative, signedInStorage(), {
      register: vi.fn(),
    });
    await expect(denied.synchronize()).resolves.toBe("PERMISSION_DENIED");
    expect(deniedNative.registerCalls).toBe(0);

    const signedOutNative = new FakeNativePushBridge("granted");
    const signedOut = new AndroidPushRegistrationCoordinator(
      signedOutNative,
      new AndroidSecureStorage(),
      { register: vi.fn() },
    );
    await expect(signedOut.synchronize()).resolves.toBe("SIGNED_OUT");
    expect(signedOutNative.registerCalls).toBe(0);
  });

  it("sends the token only in an authenticated no-store API request", async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    const transport = new ApiDeviceRegistrationTransport(
      "https://api.example.test/api/v1/",
      fetchMock,
    );

    await transport.register(accessToken, pushToken);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/api/v1/mother/me/devices/android");
    expect(init).toMatchObject({
      method: "PUT",
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(String(init?.body)).toBe(JSON.stringify({ push_token: pushToken }));
  });
});

function signedInStorage(): AndroidSecureStorage {
  const storage = new AndroidSecureStorage();
  void storage.setMotherSession({
    access_token: accessToken,
    mother_id: "60000000-0000-4000-8000-000000000001",
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  return storage;
}

class FakeNativePushBridge implements NativePushBridge {
  public requestPermissionCalls = 0;
  public channelCalls = 0;
  public registerCalls = 0;
  private registrationListener: ((token: string) => void) | undefined;

  public constructor(private permission: PushPermissionState) {}

  public async checkPermission(): Promise<PushPermissionState> {
    return this.permission;
  }
  public async requestPermission(): Promise<PushPermissionState> {
    this.requestPermissionCalls += 1;
    this.permission = "granted";
    return this.permission;
  }
  public async createReminderChannel(): Promise<void> {
    this.channelCalls += 1;
  }
  public async register(): Promise<void> {
    this.registerCalls += 1;
  }
  public async onRegistration(listener: (token: string) => void): Promise<() => Promise<void>> {
    this.registrationListener = listener;
    return async () => {
      this.registrationListener = undefined;
    };
  }
  public async onRegistrationError(): Promise<() => Promise<void>> {
    return async () => undefined;
  }
  public emitToken(token: string): void {
    this.registrationListener?.(token);
  }
}
