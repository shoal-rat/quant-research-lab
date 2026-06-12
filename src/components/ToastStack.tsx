import { useAppStore } from "../store/AppStore";

// Achievement / level-up toasts, bottom-right.
export function ToastStack(): JSX.Element | null {
  const { toasts, dismissToast } = useAppStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status">
      {toasts.map((toast) => (
        <button key={toast.id} className="game-toast" onClick={() => dismissToast(toast.id)}>
          <span className="toast-icon">{toast.icon}</span>
          <span>
            <strong>{toast.title}</strong>
            <small>{toast.detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
