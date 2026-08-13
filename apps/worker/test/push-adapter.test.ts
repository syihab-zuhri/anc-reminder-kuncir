import { describe, expect, it, vi } from "vitest";

import { FcmHttpV1PushAdapter, type AccessTokenProvider } from "../src/push-adapter.js";

const message = {
  token: "synthetic-fcm-token:abc1234567890",
  title: "Pengingat ANC",
  body: "Silakan menghubungi fasilitas kesehatan.",
  reminderCycleId: "90000000-0000-4000-8000-000000000001",
  milestoneCode: "K2",
};

describe("FcmHttpV1PushAdapter", () => {
  const accessTokens: AccessTokenProvider = {
    getAccessToken: vi.fn(() => Promise.resolve("synthetic-oauth-token")),
  };

  it("sends a minimal HTTP v1 payload and returns the provider message id", async () => {
    const requests: Array<{ readonly input: string | URL | Request; readonly init?: RequestInit }> =
      [];
    const fetchMock: typeof fetch = (input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(
        new Response(JSON.stringify({ name: "projects/anc-test/messages/synthetic-message-id" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const adapter = new FcmHttpV1PushAdapter("anc-test", accessTokens, fetchMock);

    await expect(adapter.send(message)).resolves.toEqual({
      status: "SUCCESS",
      providerMessageId: "projects/anc-test/messages/synthetic-message-id",
    });
    const { input: url, init } = requests[0] ?? {};
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/anc-test/messages:send");
    expect(init?.headers).toMatchObject({ authorization: "Bearer synthetic-oauth-token" });
    const serializedBody = typeof init?.body === "string" ? init.body : "";
    expect(serializedBody).toContain(message.token);
    expect(serializedBody).toContain('"channel_id":"anc_reminders"');
    expect(serializedBody).not.toMatch(/Siti|NIK|phone|address/iu);
  });

  it("classifies provider throttling as retryable and honors Retry-After", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", details: [] } }), {
          status: 429,
          headers: { "retry-after": "120" },
        }),
      );
    const adapter = new FcmHttpV1PushAdapter("anc-test", accessTokens, fetchMock);

    await expect(adapter.send(message)).resolves.toEqual({
      status: "RETRYABLE_FAILURE",
      errorCode: "RESOURCE_EXHAUSTED",
      retryAfterSeconds: 120,
      invalidateDevice: false,
    });
  });

  it("marks an unregistered token terminal without exposing provider detail", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              status: "NOT_FOUND",
              details: [
                {
                  "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode: "UNREGISTERED",
                },
              ],
            },
          }),
          { status: 404 },
        ),
      );
    const adapter = new FcmHttpV1PushAdapter("anc-test", accessTokens, fetchMock);

    await expect(adapter.send(message)).resolves.toEqual({
      status: "TERMINAL_FAILURE",
      errorCode: "UNREGISTERED",
      invalidateDevice: true,
    });
  });

  it("invalidates a malformed registration token reported in FCM error details", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              status: "INVALID_ARGUMENT",
              details: [
                {
                  "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode: "INVALID_ARGUMENT",
                },
              ],
            },
          }),
          { status: 400 },
        ),
      );
    const adapter = new FcmHttpV1PushAdapter("anc-test", accessTokens, fetchMock);

    await expect(adapter.send(message)).resolves.toEqual({
      status: "TERMINAL_FAILURE",
      errorCode: "INVALID_ARGUMENT",
      invalidateDevice: true,
    });
  });

  it("treats transport/auth acquisition failures as retryable", async () => {
    const adapter = new FcmHttpV1PushAdapter(
      "anc-test",
      { getAccessToken: () => Promise.reject(new Error("synthetic failure")) },
      vi.fn(),
    );
    await expect(adapter.send(message)).resolves.toEqual({
      status: "RETRYABLE_FAILURE",
      errorCode: "NETWORK_OR_AUTH_UNAVAILABLE",
      invalidateDevice: false,
    });
  });
});
