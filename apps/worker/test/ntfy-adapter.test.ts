import { describe, expect, it } from "vitest";

import { NtfyPushAdapter } from "../src/push-adapter.js";

const message = {
  token: "posyandukkn26-bumil-abc12345",
  title: "Pengingat ANC K1",
  body: "Ibu Siti, besok adalah jadwal periksa kehamilan K1 di Puskesmas.",
  reminderCycleId: "90000000-0000-4000-8000-000000000001",
  milestoneCode: "K1",
};

describe("NtfyPushAdapter", () => {
  it("delivers reminder message to ntfy server successfully", async () => {
    const requests: Array<{ readonly input: string | URL | Request; readonly init?: RequestInit }> =
      [];
    const fetchMock: typeof fetch = (input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "ntfy-msg-123456",
            time: 1725368400,
            event: "message",
            topic: "posyandukkn26-bumil-abc12345",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    };

    const adapter = new NtfyPushAdapter("https://ntfy.posyandukkn26.my.id", fetchMock);

    const result = await adapter.send(message);
    expect(result).toEqual({
      status: "SUCCESS",
      providerMessageId: "ntfy-msg-123456",
    });

    expect(requests).toHaveLength(1);
    const req = requests[0];
    expect(req?.input).toBe("https://ntfy.posyandukkn26.my.id");
    expect(req?.init?.method).toBe("POST");
    expect(req?.init?.headers).toMatchObject({
      "content-type": "application/json; charset=utf-8",
    });

    const parsedBody = JSON.parse(req?.init?.body as string) as Record<string, unknown>;
    expect(parsedBody["topic"]).toBe("posyandukkn26-bumil-abc12345");
    expect(parsedBody["title"]).toBe("Pengingat ANC K1");
    expect(parsedBody["message"]).toBe(
      "Ibu Siti, besok adalah jadwal periksa kehamilan K1 di Puskesmas.",
    );
    expect(parsedBody["priority"]).toBe(4);
    expect(parsedBody["tags"]).toEqual(expect.arrayContaining(["maternity"]));
    expect(parsedBody["click"]).toBe("https://posyandukkn26.my.id/mother");
  });

  it("handles retryable errors from ntfy server (HTTP 429 / 503)", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "rate limit exceeded" }), {
          status: 429,
          headers: { "retry-after": "60" },
        }),
      );

    const adapter = new NtfyPushAdapter("https://ntfy.posyandukkn26.my.id", fetchMock);
    const result = await adapter.send(message);

    expect(result).toEqual({
      status: "RETRYABLE_FAILURE",
      errorCode: "HTTP_429",
      retryAfterSeconds: 60,
      invalidateDevice: false,
    });
  });

  it("handles network failure as retryable", async () => {
    const fetchMock: typeof fetch = () => Promise.reject(new Error("Connection refused"));

    const adapter = new NtfyPushAdapter("https://ntfy.posyandukkn26.my.id", fetchMock);
    const result = await adapter.send(message);

    expect(result).toEqual({
      status: "RETRYABLE_FAILURE",
      errorCode: "NETWORK_UNAVAILABLE",
      invalidateDevice: false,
    });
  });
});
