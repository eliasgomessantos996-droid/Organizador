/** Comandos simulados de sistema (saúde, processos, inicialização, programas). */

import { extraHandlers, mockInternals } from './mock';
import type { HealthSnapshot, InstalledProgram, ProcessInfo, StartupItem } from './types';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
let t = 0;
let ramUsed = 11.2 * GB;
let recycle = { bytes: 3.4 * GB, items: 182 };

const wave = (base: number, amp: number) => Math.max(1, Math.min(99, base + Math.sin(t / 3) * amp + (mockInternals.rnd() - 0.5) * amp));

const processes: ProcessInfo[] = [
  ['chrome.exe', 1.9 * GB, 9],
  ['Teams.exe', 820 * MB, 4],
  ['Spotify.exe', 410 * MB, 2],
  ['explorer.exe', 180 * MB, 1],
  ['OneDrive.exe', 160 * MB, 0.5],
  ['Code.exe', 940 * MB, 6],
  ['Discord.exe', 520 * MB, 1.5],
  ['msedgewebview2.exe', 240 * MB, 1],
  ['svchost.exe', 120 * MB, 0.4],
  ['Organizador.exe', 140 * MB, 1.2],
  ['steam.exe', 300 * MB, 0.6],
  ['Dropbox.exe', 210 * MB, 0.3],
].map(([name, memory, cpu], i) => ({
  pid: 1200 + i * 37,
  name: name as string,
  memory: memory as number,
  cpu: cpu as number,
  exe: `C:\\Program Files\\${String(name).replace('.exe', '')}\\${name}`,
  protected: ['explorer.exe', 'svchost.exe', 'msedgewebview2.exe', 'Organizador.exe'].includes(name as string),
}));

let startup: StartupItem[] = [
  ['Microsoft Teams', 'Microsoft Corporation', true],
  ['Spotify', 'Spotify AB', true],
  ['OneDrive', 'Microsoft Corporation', true],
  ['Discord', 'Discord Inc.', true],
  ['Steam', 'Valve Corporation', true],
  ['Dropbox', 'Dropbox, Inc.', false],
  ['Adobe Updater', 'Adobe Inc.', true],
  ['Atualizador da impressora', 'HP Inc.', true],
  ['Zoom', 'Zoom Video Communications', false],
  ['Skype', 'Skype Technologies', true],
  ['Google Drive', 'Google LLC', true],
  ['Epic Games Launcher', 'Epic Games, Inc.', false],
].map(([name, publisher, enabled], i) => ({
  id: `reg|hkcu|Run|${name}`,
  name: name as string,
  command: `"C:\\Program Files\\${name}\\${String(name).split(' ')[0]}.exe" --background`,
  path: `C:\\Program Files\\${name}\\${String(name).split(' ')[0]}.exe`,
  location: i % 4 === 3 ? 'Pasta Inicializar do usuário' : 'Registro do usuário',
  scope: i === 7 ? 'machine' : 'user',
  enabled: enabled as boolean,
  needsAdmin: i === 7,
  publisher: publisher as string,
  description: `${name}`,
  exists: true,
}));

let programs: InstalledProgram[] = [
  ['Google Chrome', 'Google LLC', '131.0', 420, '2025-03-02'],
  ['Microsoft Office 365', 'Microsoft Corporation', '16.0', 3800, '2024-08-11'],
  ['VLC media player', 'VideoLAN', '3.0.21', 180, '2025-01-20'],
  ['7-Zip 24.08 (x64)', 'Igor Pavlov', '24.08', 6, '2024-11-03'],
  ['Spotify', 'Spotify AB', '1.2.50', 340, '2025-06-14'],
  ['Discord', 'Discord Inc.', '1.0.9', 410, '2025-02-28'],
  ['Steam', 'Valve Corporation', '2.10', 640, '2023-12-01'],
  ['Jogo de Corrida 2019', 'Estúdio Exemplo', '1.4', 42000, '2019-07-15'],
  ['Editor de Vídeo Pro', 'Exemplo Software', '3.2', 2100, '2022-04-09'],
  ['Driver de Impressora HP', 'HP Inc.', '5.1', 220, '2021-10-22'],
  ['Zoom', 'Zoom Video Communications', '6.2', 300, '2024-05-30'],
  ['Visual Studio Code', 'Microsoft Corporation', '1.95', 380, '2025-09-01'],
].map(([name, publisher, version, sizeMb, date], i) => ({
  id: `hklm|prog${i}`,
  name: name as string,
  publisher: publisher as string,
  version: version as string,
  installDate: date as string,
  size: (sizeMb as number) * MB,
  location: `C:\\Program Files\\${name}`,
  canUninstall: true,
  scope: 'machine' as const,
}));

Object.assign(extraHandlers, {
  health_snapshot: (): HealthSnapshot => {
    t++;
    ramUsed = Math.max(6 * GB, Math.min(15.4 * GB, ramUsed + (mockInternals.rnd() - 0.5) * 0.4 * GB));
    const usage = wave(34, 14);
    return {
      cpu: {
        usage,
        brand: 'Intel(R) Core(TM) i5-1240P (simulado)',
        cores: 12,
        physicalCores: 8,
        frequencyMhz: 2100,
        perCore: Array.from({ length: 12 }, (_, i) => wave(usage + (i % 3) * 6 - 6, 18)),
      },
      memory: { total: 16 * GB, used: ramUsed, available: 16 * GB - ramUsed, swapTotal: 4 * GB, swapUsed: 0.6 * GB },
      disks: [
        { mount: 'C:\\', label: 'Windows', fileSystem: 'NTFS', total: 476 * GB, free: 61 * GB, removable: false, kind: 'ssd', isSystem: true },
        { mount: 'D:\\', label: 'Dados', fileSystem: 'NTFS', total: 931 * GB, free: 512 * GB, removable: false, kind: 'hdd', isSystem: false },
        { mount: 'E:\\', label: 'PENDRIVE', fileSystem: 'FAT32', total: 29 * GB, free: 21 * GB, removable: true, kind: 'desconhecido', isSystem: false },
      ],
      system: {
        os: 'Windows 11 Pro 23H2 (simulado)',
        osVersion: '11',
        hostName: 'NOTEBOOK-SALA',
        arch: 'x86_64',
        uptimeSecs: 9 * 86400 + 4 * 3600,
        bootTime: Math.floor(Date.now() / 1000) - 9 * 86400,
        processCount: 214,
        elevated: false,
      },
      takenAt: Date.now(),
    };
  },
  top_processes: () => processes.map((p) => ({ ...p, cpu: Math.max(0, p.cpu + (mockInternals.rnd() - 0.5) * p.cpu) })),
  kill_process: (a: Record<string, unknown>) => {
    const p = processes.find((x) => x.pid === a.pid);
    if (p?.protected) throw `“${p.name}” é essencial para o Windows e não deve ser encerrado.`;
    const i = processes.findIndex((x) => x.pid === a.pid);
    if (i >= 0) processes.splice(i, 1);
  },
  trim_memory: async () => {
    await mockInternals.sleep(900);
    const freed = 1.3 * GB;
    const before = 16 * GB - ramUsed;
    ramUsed -= freed;
    return { processes: 186, freedBytes: freed, beforeAvailable: before, afterAvailable: before + freed };
  },
  junk_estimate: () => ({ recycleBytes: recycle.bytes, recycleItems: recycle.items, tempBytes: 2.1 * GB, tempFiles: 4830 }),
  battery_info: () => ({ percent: 76, charging: false, plugged: false, health: 81, cycles: 342, vendor: 'Exemplo', model: 'Bateria 54 Wh', minutesLeft: 214 }),
  startup_list: () => startup,
  startup_set_enabled: (a: Record<string, unknown>) => {
    const it = startup.find((s) => s.id === a.id);
    if (it?.needsAdmin) throw 'Este item vale para todos os usuários e exige o Organizador como administrador.';
    startup = startup.map((s) => (s.id === a.id ? { ...s, enabled: !!a.enabled } : s));
  },
  programs_list: () => programs,
  program_uninstall: (a: Record<string, unknown>) => {
    programs = programs.filter((p) => p.id !== a.id);
  },
  launch_tool: () => undefined,
  is_elevated: () => false,
  relaunch_admin: () => {
    throw 'No navegador não é possível reiniciar como administrador.';
  },
  self_autostart_get: () => false,
  self_autostart_set: () => undefined,
  recycle_info: () => recycle,
  empty_recycle_bin: () => {
    const r = recycle;
    recycle = { bytes: 0, items: 0 };
    return r;
  },
});
