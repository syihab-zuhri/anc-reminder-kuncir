import { bootstrapApi } from "../apps/api/dist/main.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = process.env.API_PORT ?? "3001";
const baseUrl = `http://${host}:${port}/api/v1`;

const app = await bootstrapApi();

async function loginStaff(username, password) {
  const response = await fetch(`${baseUrl}/staff/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_identifier: username, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Staff login failed for ${username}: ${message}`);
  }
  if (typeof body?.access_token !== "string") {
    throw new Error("Staff login returned an unexpected contract");
  }
  return body.access_token;
}

try {
  const token = await loginStaff("puskesmas.kuncir", "PosyanduKuncir2026!");

  // Unauth must be rejected.
  const unauth = await fetch(`${baseUrl}/announcements`);
  if (unauth.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated announcements, got ${unauth.status}`);
  }

  // Empty body schema rejection.
  const badCreate = await fetch(`${baseUrl}/announcements`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: "", body: "" }),
  });
  if (badCreate.status !== 400) {
    throw new Error(`Expected 400 for empty payload, got ${badCreate.status}`);
  }

  // Valid create (may deliver to 0 devices locally; that is fine).
  const idempotencyKey = crypto.randomUUID();
  const payload = JSON.stringify({
    idempotency_key: idempotencyKey,
    title: "Pengumuman Uji",
    body: "Ini pengumuman smoke test.",
  });
  const post = () =>
    fetch(`${baseUrl}/announcements`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: payload,
    });
  const createResponse = await post();
  if (!createResponse.ok) {
    const body = await createResponse.json().catch(() => null);
    throw new Error(`Create announcement failed: ${createResponse.status} ${JSON.stringify(body)}`);
  }
  const created = await createResponse.json();
  if (
    typeof created.id !== "string" ||
    typeof created.success_count !== "number" ||
    typeof created.failed_count !== "number" ||
    typeof created.total_devices !== "number"
  ) {
    throw new Error(`Create announcement contract mismatch: ${JSON.stringify(created)}`);
  }

  // Replaying the same key must return the same announcement without a second broadcast.
  const replayResponse = await post();
  if (!replayResponse.ok) {
    throw new Error(`Replay announcement failed: ${replayResponse.status}`);
  }
  const replayed = await replayResponse.json();
  if (replayed.id !== created.id) {
    throw new Error("Idempotent replay created a second announcement");
  }

  // List must contain the new announcement.
  const listResponse = await fetch(`${baseUrl}/announcements`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listResponse.ok) {
    throw new Error(`List announcements failed: ${listResponse.status}`);
  }
  const list = await listResponse.json();
  const found = (list.announcements ?? []).find((row) => row.id === created.id);
  if (found === undefined) {
    throw new Error("Announcement not present in list response");
  }
  if (found.staff_username !== "puskesmas.kuncir") {
    throw new Error(`Unexpected staff_username in list: ${found.staff_username}`);
  }

  process.stdout.write(
    `${JSON.stringify({
      created: {
        id: created.id,
        success_count: created.success_count,
        failed_count: created.failed_count,
        total_devices: created.total_devices,
      },
      foundInList: true,
    })}\n`,
  );
} finally {
  await app.close();
}
