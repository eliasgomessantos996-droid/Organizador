import { create } from 'zustand';
import type { IconName } from '../components/Icon';
import { api, newTaskId, onProgress } from '../lib/api';
import type { ProgressEvent } from '../lib/types';

export interface Task {
  id: string;
  title: string;
  icon: IconName;
  phase: string;
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  current: string;
  started: number;
  cancellable: boolean;
  cancelling: boolean;
}

interface TasksState {
  tasks: Task[];
  start: (t: Pick<Task, 'id' | 'title' | 'icon' | 'cancellable'>) => void;
  update: (e: ProgressEvent) => void;
  finish: (id: string) => void;
  cancel: (id: string) => void;
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  start: (t) =>
    set({
      tasks: [
        ...get().tasks,
        { ...t, phase: '', done: 0, total: 0, bytesDone: 0, bytesTotal: 0, current: '', started: Date.now(), cancelling: false },
      ],
    }),
  update: (e) => {
    const tasks = get().tasks;
    if (!tasks.some((t) => t.id === e.taskId)) return;
    set({
      tasks: tasks.map((t) =>
        t.id === e.taskId
          ? { ...t, phase: e.phase, done: e.done, total: e.total, bytesDone: e.bytesDone, bytesTotal: e.bytesTotal, current: e.current }
          : t,
      ),
    });
  },
  finish: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),
  cancel: (id) => {
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, cancelling: true } : t)) });
    void api.cancelTask(id);
  },
}));

let wired = false;
/** Liga os eventos de progresso do backend ao painel de tarefas. */
export function wireTaskProgress() {
  if (wired) return;
  wired = true;
  onProgress((e) => useTasks.getState().update(e));
}

/** Executa uma operação longa mostrando-a no painel de tarefas. */
export async function runTask<T>(
  title: string,
  icon: IconName,
  fn: (taskId: string) => Promise<T>,
  opts: { cancellable?: boolean } = {},
): Promise<T> {
  const id = newTaskId();
  useTasks.getState().start({ id, title, icon, cancellable: opts.cancellable ?? true });
  try {
    return await fn(id);
  } finally {
    useTasks.getState().finish(id);
  }
}
