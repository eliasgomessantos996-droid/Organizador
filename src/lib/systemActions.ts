/** Ações de sistema com confirmação e notificações (memória, processos, administrador). */

import { api, errorText } from './api';
import { formatBytes } from './format';
import { confirm } from '../store/dialogs';
import { useHealth } from '../store/health';
import { runTask } from '../store/tasks';
import { toast } from '../store/toasts';

export async function trimMemory(silent = false) {
  try {
    const r = await runTask('Liberando memória', 'memory', () => api.trimMemory(), { cancellable: false });
    if (!silent)
      toast.good(
        r.freedBytes > 50 * 1024 * 1024 ? `${formatBytes(r.freedBytes)} de memória liberados` : 'Memória otimizada',
        `Memória ociosa de ${r.processes} processos foi devolvida ao sistema. O efeito é temporário.`,
      );
    void useHealth.getState().poll();
    return r;
  } catch (e) {
    if (!silent) toast.error('Não foi possível liberar memória', errorText(e));
    return null;
  }
}

export async function killProcess(pid: number, name: string) {
  const ok = await confirm({
    title: `Encerrar “${name}”?`,
    text: 'Trabalhos não salvos nesse programa serão perdidos.',
    tone: 'danger',
    icon: 'x-circle',
    confirmLabel: 'Encerrar processo',
  });
  if (!ok) return false;
  try {
    await api.killProcess(pid);
    toast.good(`“${name}” foi encerrado`);
    void useHealth.getState().loadProcesses();
    return true;
  } catch (e) {
    toast.error('Não foi possível encerrar', errorText(e));
    return false;
  }
}

export async function relaunchAsAdmin() {
  const ok = await confirm({
    title: 'Reiniciar como administrador?',
    text: 'O Organizador vai fechar e abrir de novo com permissões elevadas, para limpar pastas do sistema e alterar itens de todos os usuários. O Windows vai pedir sua confirmação.',
    icon: 'shield',
    confirmLabel: 'Reiniciar como administrador',
  });
  if (!ok) return;
  try {
    await api.relaunchAdmin();
  } catch (e) {
    toast.error('Não foi possível reiniciar', errorText(e));
  }
}

export const WINDOWS_TOOLS: { id: string; label: string; icon: 'broom' | 'disc' | 'activity' | 'gauge' | 'info' | 'hard-drive' | 'package' | 'rocket' | 'refresh' | 'shield' | 'power' | 'trash' }[] = [
  { id: 'cleanmgr', label: 'Limpeza de Disco', icon: 'broom' },
  { id: 'storage', label: 'Configurações de armazenamento', icon: 'hard-drive' },
  { id: 'dfrgui', label: 'Otimizar unidades', icon: 'disc' },
  { id: 'taskmgr', label: 'Gerenciador de Tarefas', icon: 'activity' },
  { id: 'resmon', label: 'Monitor de Recursos', icon: 'gauge' },
  { id: 'msinfo32', label: 'Informações do Sistema', icon: 'info' },
  { id: 'apps', label: 'Aplicativos instalados', icon: 'package' },
  { id: 'windowsupdate', label: 'Windows Update', icon: 'refresh' },
  { id: 'defender', label: 'Segurança do Windows', icon: 'shield' },
  { id: 'power', label: 'Opções de energia', icon: 'power' },
];

export async function launchTool(id: string) {
  try {
    await api.launchTool(id);
  } catch (e) {
    toast.error('Não foi possível abrir a ferramenta', errorText(e));
  }
}
