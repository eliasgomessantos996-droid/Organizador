import { create } from 'zustand';

export type ToastKind = 'info' | 'good' | 'warning' | 'critical';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
  action?: { label: string; run: () => void };
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    const toast: Toast = { duration: t.action ? 7000 : 4200, ...t, id };
    set({ toasts: [...get().toasts.slice(-4), toast] });
    window.setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (title: string, text?: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'info', title, text, action }),
  good: (title: string, text?: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'good', title, text, action }),
  warning: (title: string, text?: string, action?: Toast['action']) =>
    useToasts.getState().push({ kind: 'warning', title, text, action }),
  error: (title: string, text?: string) => useToasts.getState().push({ kind: 'critical', title, text, duration: 7000 }),
};
