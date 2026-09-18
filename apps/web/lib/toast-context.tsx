"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly title?: string;
  readonly durationMs?: number;
}

interface ToastContextValue {
  readonly showToast: (item: Omit<ToastItem, "id">) => string;
  readonly success: (message: string, title?: string) => string;
  readonly error: (message: string, title?: string) => string;
  readonly info: (message: string, title?: string) => string;
  readonly warning: (message: string, title?: string) => string;
  readonly removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const defaultToastContext: ToastContextValue = {
  showToast: () => "",
  success: () => "",
  error: () => "",
  info: () => "",
  warning: () => "",
  removeToast: () => {},
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  return context ?? defaultToastContext;
}

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { readonly children: React.ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, message, title, durationMs = DEFAULT_DURATION_MS }: Omit<ToastItem, "id">) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newItem: ToastItem = { id, type, message, title, durationMs };

      setToasts((prev) => [...prev, newItem]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }

      return id;
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string, title?: string) => showToast({ type: "success", message, title }),
    [showToast],
  );

  const error = useCallback(
    (message: string, title?: string) => showToast({ type: "error", message, title }),
    [showToast],
  );

  const info = useCallback(
    (message: string, title?: string) => showToast({ type: "info", message, title }),
    [showToast],
  );

  const warning = useCallback(
    (message: string, title?: string) => showToast({ type: "warning", message, title }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning, removeToast }}>
      {children}
      <div
        className="toast-container"
        aria-live="polite"
        aria-atomic="false"
        role="region"
        aria-label="Pemberitahuan Sistem"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card toast-${toast.type}`} role="status">
            <div className="toast-icon-wrap" aria-hidden="true">
              {toast.type === "success" && (
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {toast.type === "error" && (
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {toast.type === "warning" && (
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {toast.type === "info" && (
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <div className="toast-body">
              {toast.title && <strong className="toast-title">{toast.title}</strong>}
              <p className="toast-message">{toast.message}</p>
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => removeToast(toast.id)}
              aria-label="Tutup notifikasi"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
