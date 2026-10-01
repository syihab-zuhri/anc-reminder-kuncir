import { GoogleAuth } from "google-auth-library";

const firebaseMessagingScope = "https://www.googleapis.com/auth/firebase.messaging";
const retryableHttpStatuses = new Set([429, 500, 503]);
const retryableFcmStatuses = new Set(["RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL"]);

export interface PushMessage {
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly reminderCycleId: string;
  readonly milestoneCode: string;
}

export type PushDeliveryResult =
  | { readonly status: "SUCCESS"; readonly providerMessageId: string }
  | {
      readonly status: "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
      readonly errorCode: string;
      readonly retryAfterSeconds?: number;
      readonly invalidateDevice: boolean;
    };

export interface PushDeliveryAdapter {
  send(message: PushMessage): Promise<PushDeliveryResult>;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

interface ServiceAccountJson {
  readonly client_email: string;
  readonly private_key: string;
  readonly project_id?: string;
}

export class GoogleServiceAccountAccessTokenProvider implements AccessTokenProvider {
  private readonly auth: GoogleAuth;

  public constructor(rawServiceAccountJson: string) {
    const credentials = parseServiceAccount(rawServiceAccountJson);
    this.auth = new GoogleAuth({ credentials, scopes: [firebaseMessagingScope] });
  }

  public async getAccessToken(): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (token === null || token === undefined || token.trim() === "") {
      throw new Error("FCM access token is unavailable");
    }
    return token;
  }
}

export class FcmHttpV1PushAdapter implements PushDeliveryAdapter {
  public constructor(
    private readonly projectId: string,
    private readonly accessTokens: AccessTokenProvider,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async send(message: PushMessage): Promise<PushDeliveryResult> {
    try {
      const accessToken = await this.accessTokens.getAccessToken();
      const response = await this.fetchImplementation(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: {
                reminder_cycle_id: message.reminderCycleId,
                milestone_code: message.milestoneCode,
                destination: "/mother",
              },
              android: {
                collapse_key: message.reminderCycleId,
                priority: "high",
                notification: { channel_id: "anc_reminders", tag: message.reminderCycleId },
              },
            },
          }),
        },
      );
      const payload = await readJsonResponse(response);
      if (response.ok) {
        const providerMessageId = stringProperty(payload, "name");
        if (providerMessageId === null) {
          return terminalFailure("MALFORMED_SUCCESS_RESPONSE");
        }
        return { status: "SUCCESS", providerMessageId };
      }

      const error = objectProperty(payload, "error");
      const fcmStatus = stringProperty(error, "status");
      const fcmErrorCode = extractFcmErrorCode(error);
      const errorCode = fcmErrorCode ?? fcmStatus ?? `HTTP_${response.status}`;
      const invalidateDevice =
        fcmErrorCode === "UNREGISTERED" ||
        fcmErrorCode === "INVALID_ARGUMENT" ||
        fcmStatus === "NOT_FOUND";
      if (
        retryableHttpStatuses.has(response.status) ||
        (fcmStatus !== null && retryableFcmStatuses.has(fcmStatus))
      ) {
        const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
        return {
          status: "RETRYABLE_FAILURE",
          errorCode,
          invalidateDevice: false,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
      }
      return { status: "TERMINAL_FAILURE", errorCode, invalidateDevice };
    } catch {
      return {
        status: "RETRYABLE_FAILURE",
        errorCode: "NETWORK_OR_AUTH_UNAVAILABLE",
        invalidateDevice: false,
      };
    }
  }
}

export function createFcmPushAdapter(
  projectId: string,
  rawServiceAccountJson: string,
): PushDeliveryAdapter {
  return new FcmHttpV1PushAdapter(
    projectId,
    new GoogleServiceAccountAccessTokenProvider(rawServiceAccountJson),
  );
}

function parseServiceAccount(raw: string): ServiceAccountJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON must contain a service account object");
  }
  const value = parsed as Readonly<Record<string, unknown>>;
  if (
    typeof value["client_email"] !== "string" ||
    value["client_email"].trim() === "" ||
    typeof value["private_key"] !== "string" ||
    value["private_key"].trim() === ""
  ) {
    throw new Error("FCM service account is missing client_email or private_key");
  }
  return {
    client_email: value["client_email"],
    private_key: value["private_key"],
    ...(typeof value["project_id"] === "string" ? { project_id: value["project_id"] } : {}),
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function objectProperty(value: unknown, key: string): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const property = (value as Readonly<Record<string, unknown>>)[key];
  if (property === null || typeof property !== "object" || Array.isArray(property)) return null;
  return property as Readonly<Record<string, unknown>>;
}

function stringProperty(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const property = (value as Readonly<Record<string, unknown>>)[key];
  return typeof property === "string" && property.trim() !== "" ? property : null;
}

function extractFcmErrorCode(error: Readonly<Record<string, unknown>> | null): string | null {
  const details = error?.["details"];
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    const errorCode = stringProperty(detail, "errorCode");
    if (errorCode !== null) return errorCode;
  }
  return null;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/u.test(value)) return Math.max(1, Number(value));
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

function terminalFailure(errorCode: string): PushDeliveryResult {
  return { status: "TERMINAL_FAILURE", errorCode, invalidateDevice: false };
}
