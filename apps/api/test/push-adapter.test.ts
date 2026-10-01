import { describe, expect, it } from "vitest";

import { FcmHttpV1PushAdapter, NtfyPushAdapter } from "../src/scheduler/push-adapter.js";

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

describe("ntfy push payloads", () => {
  it("tags announcements instead of reading a milestone code", async () => {
    const { fetchImpl, bodies } = fetchStub({ id: "ntfy-1" });
    const adapter = new NtfyPushAdapter("https://ntfy.invalid", fetchImpl);

    const result = await adapter.send({
      token: "topic",
      title: "Pengumuman",
      body: "Isi",
      announcementId: "ann-1",
    });

    expect(result.status).toBe("SUCCESS");
    expect((JSON.parse(bodies[0] ?? "{}") as { tags: string[] }).tags).toEqual([
      "maternity",
      "calendar",
      "announcement",
    ]);
  });
});
