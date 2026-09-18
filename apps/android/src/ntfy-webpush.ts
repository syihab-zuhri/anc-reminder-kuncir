/**
 * ntfy Web Push subscription via VAPID.
 * Dipanggil dari CapacitorAppBridge setelah mother session terdeteksi.
 * Service Worker /sw-ntfy.js harus sudah ter-serve dari domain server.
 */

const NTFY_BASE_URL = "https://ntfy.posyandukkn26.my.id";
const BROADCAST_TOPIC = "posyandu-broadcast";
const SW_PATH = "/sw-ntfy.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (buffer === null) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function fetchVapidKey(serverUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/api/ntfy-vapid-key`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { vapidPublicKey?: string };
    return json.vapidPublicKey ?? null;
  } catch {
    return null;
  }
}

async function registerSubscription(subscription: PushSubscription): Promise<boolean> {
  try {
    const key = arrayBufferToBase64Url(subscription.getKey("p256dh"));
    const auth = arrayBufferToBase64Url(subscription.getKey("auth"));
    const res = await fetch(`${NTFY_BASE_URL}/v1/webpush`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topics: [BROADCAST_TOPIC],
        endpoint: subscription.endpoint,
        key,
        auth,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function subscribeNtfyWebPush(serverUrl: string): Promise<boolean> {
  try {
    // 1. Cek dukungan browser
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[ntfy-webpush] Web Push tidak didukung di browser ini.");
      return false;
    }

    // 2. Minta izin notifikasi
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[ntfy-webpush] Izin notifikasi ditolak.");
      return false;
    }

    // 3. Register Service Worker
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;

    // 4. Ambil VAPID public key dari server
    const vapidKey = await fetchVapidKey(serverUrl);
    if (vapidKey === null) {
      console.warn("[ntfy-webpush] Gagal ambil VAPID key.");
      return false;
    }

    // 5. Cek jika sudah subscribe (cegah double subscribe)
    const existing = await registration.pushManager.getSubscription();
    if (existing !== null) {
      // Re-register ke ntfy untuk jaga-jaga subscription expired di server
      await registerSubscription(existing);
      return true;
    }

    // 6. Subscribe Web Push dengan VAPID key
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    // 7. Daftar subscription ke ntfy server
    const ok = await registerSubscription(subscription);
    if (!ok) {
      console.warn("[ntfy-webpush] Gagal daftarkan subscription ke ntfy.");
      await subscription.unsubscribe();
      return false;
    }

    console.log("[ntfy-webpush] Berhasil subscribe posyandu-broadcast.");
    return true;
  } catch (err) {
    console.error("[ntfy-webpush] Error:", err);
    return false;
  }
}
