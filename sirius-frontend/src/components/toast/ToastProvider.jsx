import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import "./Toast.css";

/** @typedef {'success' | 'error' | 'info'} ToastTone */

const AUTO_DISMISS_MS = 3800;
const EXIT_MS = 240;

const ToastContext = createContext(
  /** @type {{ pushToast: (message: string, tone?: ToastTone) => void }} */ ({
    pushToast: () => {},
  }),
);

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(
    /** @type {Array<{id: string, message: string, tone: ToastTone, closing: boolean}>} */ ([]),
  );
  const counterRef = useRef(0);
  const timersRef = useRef(new Map());

  const closeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, closing: true } : t)),
    );

    const exitTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const active = timersRef.current.get(id);
      if (active?.dismiss) clearTimeout(active.dismiss);
      timersRef.current.delete(id);
    }, EXIT_MS);

    const active = timersRef.current.get(id) ?? {};
    timersRef.current.set(id, { ...active, exit: exitTimer });
  }, []);

  const pushToast = useCallback(
    (message, tone = "info") => {
      const id = `${Date.now()}-${counterRef.current++}`;
      setToasts((prev) => [...prev, { id, message, tone, closing: false }]);

      const dismissTimer = setTimeout(() => {
        closeToast(id);
      }, AUTO_DISMISS_MS);

      timersRef.current.set(id, { dismiss: dismissTimer });
    },
    [closeToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item toast-item--${toast.tone} ${toast.closing ? "toast-item--closing" : ""}`}
            role="status"
          >
            <span className="toast-item-text">{toast.message}</span>
            <button
              type="button"
              className="toast-item-close"
              onClick={() => closeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
