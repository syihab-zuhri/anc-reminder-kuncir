import { bootstrapApi } from "../apps/api/dist/main.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = process.env.API_PORT ?? "3001";
const baseUrl = `http://${host}:${port}/api/v1`;

const app = await bootstrapApi();

try {
  const [liveResponse, readyResponse] = await Promise.all([
    fetch(`${baseUrl}/health/live`),
    fetch(`${baseUrl}/health/ready`),
  ]);
  const live = await liveResponse.json();
  const ready = await readyResponse.json();
  const requestId = readyResponse.headers.get("x-request-id");

  if (!liveResponse.ok || !readyResponse.ok) {
    throw new Error(`API smoke failed: live=${liveResponse.status}, ready=${readyResponse.status}`);
  }

  if (live?.status !== "ok" || ready?.status !== "ready" || requestId === null) {
    throw new Error("API smoke returned an unexpected health contract.");
  }

  process.stdout.write(
    `${JSON.stringify({ liveStatus: liveResponse.status, readyStatus: readyResponse.status, requestId })}\n`,
  );
} finally {
  await app.close();
}
