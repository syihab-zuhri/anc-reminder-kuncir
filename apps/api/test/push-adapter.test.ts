import { describe, expect, it, vi } from "vitest";

import {
  FcmHttpV1PushAdapter,
  NoopPushAdapter,
  createFcmPushAdapter,
  resolveFcmCredentials,
} from "../src/push/push-adapter.js";

const accessTokens = { getAccessToken: () => Promise.resolve("test-access-token") };

interface SentFcmMessage {
  readonly data: Record<string, string>;
  readonly android: {
    readonly collapse_key: string;
    readonly notification: { readonly channel_id: string; readonly tag: string };
  };
}

function fetchStub(responseBody: unknown): {
  readonly fetchImpl: typeof fetch;
  readonly bodies: string[];
} {
  const bodies: string[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === "string" ? init.body : "");
    return Promise.resolve(new Response(JSON.stringify(responseBody), { status: 200 }));
  };
  return { fetchImpl, bodies };
}

function firstFcmMessage(bodies: readonly string[]): SentFcmMessage {
  return (JSON.parse(bodies[0] ?? "{}") as { message: SentFcmMessage }).message;
}

describe("FCM push payloads", () => {
  it("keeps reminder payloads keyed by reminder cycle and milestone", async () => {
    const { fetchImpl, bodies } = fetchStub({ name: "projects/p/messages/1" });
    const adapter = new FcmHttpV1PushAdapter("p", accessTokens, fetchImpl);

    const result = await adapter.send({
      token: "device-token",
      title: "Pengingat",
      body: "Saatnya K2",
      reminderCycleId: "cycle-1",
      milestoneCode: "K2",
    });

    expect(result).toEqual({ status: "SUCCESS", providerMessageId: "projects/p/messages/1" });
    const message = firstFcmMessage(bodies);
    expect(message.data).toEqual({
      reminder_cycle_id: "cycle-1",
      milestone_code: "K2",
      destination: "/mother",
    });
    expect(message.android.collapse_key).toBe("cycle-1");
    expect(message.android.notification).toEqual({ channel_id: "anc_reminders", tag: "cycle-1" });
  });

  it("sends announcements without reminder fields and with their own collapse key", async () => {
    const { fetchImpl, bodies } = fetchStub({ name: "projects/p/messages/2" });
    const adapter = new FcmHttpV1PushAdapter("p", accessTokens, fetchImpl);

    await adapter.send({
      token: "device-token",
      title: "Pengumuman",
      body: "Posyandu libur",
      announcementId: "ann-1",
    });

    const message = firstFcmMessage(bodies);
    expect(message.data).toEqual({ announcement_id: "ann-1", destination: "/mother" });
    expect(message.android.collapse_key).toBe("announcement-ann-1");
    expect(message.android.notification.tag).toBe("announcement-ann-1");
  });

  it("does not let an announcement collapse into a reminder with the same id", async () => {
    const { fetchImpl, bodies } = fetchStub({ name: "projects/p/messages/3" });
    const adapter = new FcmHttpV1PushAdapter("p", accessTokens, fetchImpl);

    await adapter.send({ token: "t", title: "a", body: "b", announcementId: "same-id" });

    expect(firstFcmMessage(bodies).android.collapse_key).not.toBe("same-id");
  });
});

describe("FCM adapter selection", () => {
  const serviceAccountJson = JSON.stringify({
    client_email: "svc@anc-test.iam.gserviceaccount.com",
    private_key: "not-a-real-key-the-adapter-never-parses-it-before-sending",
  });

  it.each([
    ["no credentials", undefined, undefined],
    ["only a project id", "anc-test", undefined],
    ["only a service account", undefined, serviceAccountJson],
    ["a blank project id", "   ", serviceAccountJson],
    ["a blank service account", "anc-test", "  "],
  ])("fails closed without sending anything when given %s", async (_label, projectId, json) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const adapter = createFcmPushAdapter(projectId, json);
    const result = await adapter.send({
      token: "device-token",
      title: "Judul",
      body: "Isi",
      announcementId: "ann-1",
    });

    expect(adapter).toBeInstanceOf(NoopPushAdapter);
    expect(result).toEqual({
      status: "TERMINAL_FAILURE",
      errorCode: "FCM_NOT_CONFIGURED",
      invalidateDevice: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses FCM when both the project id and service account are present", () => {
    expect(createFcmPushAdapter("anc-test", serviceAccountJson)).toBeInstanceOf(
      FcmHttpV1PushAdapter,
    );
  });

  it("treats any project id as real instead of special-casing placeholders", () => {
    expect(createFcmPushAdapter("test-project-123", serviceAccountJson)).toBeInstanceOf(
      FcmHttpV1PushAdapter,
    );
  });

  it("trims the project id and reports missing credentials as null", () => {
    expect(resolveFcmCredentials(" anc-test ", serviceAccountJson)).toEqual({
      projectId: "anc-test",
      serviceAccountJson,
    });
    expect(resolveFcmCredentials("anc-test", "")).toBeNull();
    expect(resolveFcmCredentials(undefined, undefined)).toBeNull();
  });
});
