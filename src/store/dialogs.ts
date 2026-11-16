import { create } from 'zustand';
import type { IconName } from '../components/Icon';

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger' | 'warning';
  icon?: IconName;
  /** Linhas extras (ex.: lista de arquivos) mostradas abaixo do texto. */
  details?: string[];
  /** Caixa de seleção opcional ("Não perguntar novamente"). */
  checkbox?: string;
}

export interface PromptOptions {
  title: string;
  text?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  icon?: IconName;
  /** Seleciona só o nome (sem a extensão) ao abrir, como no Explorer. */
  selectBaseName?: boolean;
  validate?: (value: string) => string | null;
}

type DialogRequest =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (r: { ok: boolean; checked: boolean }) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

interface DialogState {
  current: DialogRequest | null;
  queue: DialogRequest[];
  open: (req: DialogRequest) => void;
  close: () => void;
}

export const useDialogs = create<DialogState>((set, get) => ({
  current: null,
  queue: [],
  open: (req) => {
    if (get().current) set({ queue: [...get().queue, req] });
    else set({ current: req });
  },
  close: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));

/** Pergunta de confirmação. Resolve `true` se o usuário confirmar. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useDialogs.getState().open({ kind: 'confirm', options, resolve: (r) => resolve(r.ok) }));
}

/** Confirmação com caixa de seleção (retorna também o estado da caixa). */
export function confirmWithCheck(options: ConfirmOptions): Promise<{ ok: boolean; checked: boolean }> {
  return new Promise((resolve) => useDialogs.getState().open({ kind: 'confirm', options, resolve }));
}

/** Pede um texto ao usuário. Resolve `null` se cancelar. */
export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => useDialogs.getState().open({ kind: 'prompt', options, resolve }));
}
