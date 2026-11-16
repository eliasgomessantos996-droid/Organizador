/**
 * Backend simulado usado quando o app roda no navegador (npm run dev),
 * fora do Tauri. Gera um disco fictício determinístico para testes visuais.
 * Não é incluído no fluxo do aplicativo instalado.
 */

import { categoryFromExt, extOf } from './categories';
import { applyBackendFilter, sortForBackend, summarizeEntries } from './mockQuery';
import type {
  Conflict,
  DeleteReport,
  DriveInfo,
  FileEntry,
  FileFilter,
  OpReport,
  ProgressEvent,
  ScanStats,
  SortSpec,
  TrashEntry,
} from './types';

interface Node {
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
  created: number;
  accessed: number;
  hidden?: boolean;
  children?: Map<string, Node>;
}

const NOW = Date.now();
const DAY = 86_400_000;

// Gerador pseudoaleatório com semente (resultados estáveis entre execuções).
let seed = 20261116;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a));

function dir(name: string, ageDays = between(30, 900), hidden = false): Node {
  const t = NOW - ageDays * DAY;
  return { name, isDir: true, size: 0, modified: t, created: t - 10 * DAY, accessed: t, hidden, children: new Map() };
}

function file(name: string, size: number, ageDays: number, usedDaysAgo?: number): Node {
  const t = NOW - ageDays * DAY - between(0, 20 * 3_600_000);
  return { name, isDir: false, size, modified: t, created: t - between(0, 30) * DAY, accessed: NOW - (usedDaysAgo ?? ageDays) * DAY };
}

function add(parent: Node, child: Node): Node {
  parent.children!.set(child.name.toLowerCase(), child);
  return child;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

function buildDisk(): Map<string, Node> {
  const drives = new Map<string, Node>();
  const c = dir('C:', 1000);
  const d = dir('D:', 600);
  const e = dir('E:', 30);
  drives.set('c:', c);
  drives.set('d:', d);
  drives.set('e:', e);

  const win = add(c, dir('Windows', 400));
  add(win, dir('System32', 300));
  add(win, dir('Temp', 2));
  const pf = add(c, dir('Program Files', 300));
  for (const app of ['Mozilla Firefox', 'Microsoft Office', 'VideoLAN', '7-Zip', 'Spotify']) {
    const a = add(pf, dir(app, between(20, 300)));
    add(a, file(`${app.split(' ')[0].toLowerCase()}.exe`, between(2, 90) * MB, between(20, 300)));
  }
  const users = add(c, dir('Users', 900));
  const home = add(users, dir('Ana', 800));
  const desktop = add(home, dir('Desktop', 5));
  const docs = add(home, dir('Documents', 30));
  const downloads = add(home, dir('Downloads', 1));
  const pictures = add(home, dir('Pictures', 12));
  const music = add(home, dir('Music', 200));
  const videos = add(home, dir('Videos', 60));
  const appdata = add(home, dir('AppData', 1, true));
  const local = add(appdata, dir('Local', 1));
  const temp = add(local, dir('Temp', 1));
  for (let i = 0; i < 40; i++) add(temp, file(`~tmp${(1000 + i).toString(16)}.tmp`, between(10, 9000) * 1024, between(0, 90)));

  // Área de trabalho
  add(desktop, file('Lista de compras.txt', 2 * 1024, 3));
  add(desktop, file('Currículo 2026.docx', 84 * 1024, 40));
  add(desktop, file('Atalho - Navegador.lnk', 2 * 1024, 300));
  add(desktop, file('Captura de tela 2026-11-10 093012.png', 1.2 * MB, 6));

  // Downloads cheios de coisa antiga
  const dl: [string, number, number, number?][] = [
    ['setup_editor_video_v3.exe', 184 * MB, 410, 410],
    ['driver_impressora_x64.msi', 62 * MB, 700, 700],
    ['ChromeSetup.exe', 1.4 * MB, 380, 380],
    ['relatorio_anual_2025.pdf', 3.8 * MB, 320, 200],
    ['fotos_viagem_praia.zip', 1.6 * GB, 290, 290],
    ['video_aniversario_vovo.mp4', 2.3 * GB, 150, 140],
    ['planilha_gastos_casa.xlsx', 240 * 1024, 12, 1],
    ['contrato_aluguel_assinado.pdf', 1.1 * MB, 45, 20],
    ['documento (1).docx', 88 * 1024, 220, 220],
    ['documento (2).docx', 88 * 1024, 219, 219],
    ['musica_nova.mp3', 7.4 * MB, 30, 2],
    ['Windows11_InstallationAssistant.exe', 4.2 * MB, 520, 520],
    ['ubuntu-24.04-desktop-amd64.iso', 5.8 * GB, 610, 610],
    ['boleto_novembro.pdf', 180 * 1024, 2, 2],
    ['wallpaper_montanhas_4k.jpg', 8.2 * MB, 95, 30],
    ['curso_fotografia_aula1.mp4', 860 * MB, 400, 390],
    ['curso_fotografia_aula2.mp4', 910 * MB, 400, 395],
    ['projeto_final.rar', 420 * MB, 260, 260],
    ['nota_fiscal_notebook.pdf', 520 * 1024, 700, 100],
    ['arquivo_incompleto.crdownload', 140 * MB, 80, 80],
  ];
  for (const [n, s, a, u] of dl) add(downloads, file(n, Math.round(s), a, u));
  add(desktop, { ...downloads.children!.get('contrato_aluguel_assinado.pdf')! });
  add(desktop, { ...downloads.children!.get('wallpaper_montanhas_4k.jpg')!, name: 'wallpaper (1).jpg' });
  for (let i = 1; i <= 14; i++) add(downloads, file(`Captura de tela 2026-0${(i % 9) + 1}-1${i % 10} 10${i}233.png`, between(300, 2400) * 1024, between(10, 300)));

  // Documentos
  const trabalho = add(docs, dir('Trabalho', 20));
  const relatorios = add(trabalho, dir('Relatórios', 25));
  for (let i = 1; i <= 12; i++) add(relatorios, file(`Relatório mensal ${String(i).padStart(2, '0')}-2026.pdf`, between(400, 4000) * 1024, between(5, 330)));
  const projetos = add(trabalho, dir('Projetos', 15));
  for (const p of ['Site novo', 'Campanha verão', 'Orçamento 2027']) {
    const pp = add(projetos, dir(p, between(5, 120)));
    add(pp, file('briefing.docx', between(40, 300) * 1024, between(5, 120)));
    add(pp, file('apresentação.pptx', between(2, 30) * MB, between(5, 120)));
    add(pp, file('cronograma.xlsx', between(30, 200) * 1024, between(5, 120)));
    add(pp, file('notas.txt', between(1, 12) * 1024, between(5, 120)));
  }
  const pessoal = add(docs, dir('Pessoal', 60));
  add(pessoal, file('Declaração IR 2026.pdf', 2.1 * MB, 200));
  add(pessoal, file('Receitas da família.docx', 320 * 1024, 500, 30));
  add(pessoal, file('Senhas antigas (não usar).txt', 3 * 1024, 1500, 1500));
  add(pessoal, file('Orçamento doméstico.xlsx', 180 * 1024, 8, 1));
  const faculdade = add(docs, dir('Faculdade', 900));
  for (let i = 1; i <= 18; i++) add(faculdade, file(`Trabalho ${i} - ${pick(['Cálculo', 'Física', 'Estatística', 'Programação'])}.pdf`, between(200, 6000) * 1024, between(900, 1800), between(900, 1800)));
  const code = add(docs, dir('Código', 100));
  for (const n of ['index.html', 'app.js', 'estilos.css', 'script.py', 'dados.json', 'README.md']) add(code, file(n, between(2, 80) * 1024, between(30, 200)));

  // Imagens
  for (const album of ['Férias 2025', 'Aniversário', 'Natal 2024', 'Formatura']) {
    const al = add(pictures, dir(album, between(20, 700)));
    const age = between(20, 700);
    for (let i = 1; i <= between(18, 46); i++) add(al, file(`IMG_${String(between(1000, 9999))}.jpg`, between(1800, 6200) * 1024, age + between(0, 3)));
  }
  const wall = add(pictures, dir('Wallpapers', 300));
  for (let i = 1; i <= 8; i++) add(wall, file(`papel de parede ${i}.jpg`, between(900, 9000) * 1024, between(100, 600)));
  // Cópias de verdade (para o detector de duplicados ter o que encontrar)
  const dup = add(pictures, dir('Cópias do celular', 140));
  const ferias = pictures.children!.get('férias 2025')!;
  [...ferias.children!.values()].slice(0, 9).forEach((f) => add(dup, { ...f }));
  for (let i = 1; i <= 4; i++) add(dup, file(`IMG_${2000 + i}.jpg`, 3_145_728 + i * 1000, 140));

  // Música
  for (const album of ['Clássicos do Rock', 'MPB Acústico', 'Lo-fi para estudar']) {
    const al = add(music, dir(album, between(100, 900)));
    for (let i = 1; i <= 12; i++) add(al, file(`${String(i).padStart(2, '0')} - Faixa ${i}.mp3`, between(3, 11) * MB, between(100, 900), between(10, 900)));
  }

  // Vídeos
  add(videos, file('Gravação de tela 2026-09-01.mp4', 640 * MB, 76));
  add(videos, file('Filme de família 2019.mkv', 4.4 * GB, 2400, 2000));
  add(videos, file('Tutorial Excel.mp4', 380 * MB, 500, 480));

  // Disco D: backup
  const bk = add(d, dir('Backup', 400));
  const bkf = add(bk, dir('Fotos antigas', 1500));
  for (let i = 1; i <= 60; i++) add(bkf, file(`DSC_${String(i).padStart(4, '0')}.JPG`, between(2000, 5000) * 1024, between(1500, 3000), between(1000, 3000)));
  add(bk, file('backup_sistema_2023.zip', 18 * GB, 1050, 1050));
  const jogos = add(d, dir('Jogos', 300));
  add(jogos, file('instalador_jogo.exe', 3.2 * GB, 600, 600));

  // Pendrive E:
  add(e, file('Trabalho final.docx', 1.4 * MB, 20));
  add(e, file('Fotos para imprimir.zip', 230 * MB, 25));
  return drives;
}

let disk = buildDisk();
const HOME = 'C:\\Users\\Ana';

/* ───────────── Caminhos ───────────── */
function parts(path: string): string[] {
  return path.replace(/\//g, '\\').split('\\').filter(Boolean);
}

function resolve(path: string): Node | null {
  const p = parts(path);
  if (!p.length) return null;
  let node = disk.get(p[0].toLowerCase()) ?? null;
  for (const seg of p.slice(1)) {
    if (!node?.children) return null;
    node = node.children.get(seg.toLowerCase()) ?? null;
  }
  return node;
}

function parentOf(path: string): { parent: Node | null; name: string; parentPath: string } {
  const p = parts(path);
  const name = p[p.length - 1];
  const parentPath = p.length <= 1 ? '' : p.length === 2 ? `${p[0]}\\` : p.slice(0, -1).join('\\');
  return { parent: p.length > 1 ? resolve(parentPath) : null, name, parentPath };
}

function join(dirPath: string, name: string) {
  return dirPath.endsWith('\\') ? `${dirPath}${name}` : `${dirPath}\\${name}`;
}

function toEntry(path: string, n: Node, id?: number): FileEntry {
  const ext = n.isDir ? '' : extOf(n.name);
  const { parentPath } = parentOf(path);
  return {
    id,
    name: n.name,
    path,
    parent: parentPath,
    isDir: n.isDir,
    size: n.isDir ? 0 : n.size,
    modified: n.modified,
    created: n.created,
    accessed: n.accessed,
    ext,
    category: categoryFromExt(ext, n.isDir),
    hidden: !!n.hidden,
    system: false,
    readonly: false,
    isLink: n.name.endsWith('.lnk'),
  };
}

function sizeOf(n: Node): { size: number; files: number; dirs: number } {
  if (!n.isDir) return { size: n.size, files: 1, dirs: 0 };
  let size = 0;
  let files = 0;
  let dirs = 0;
  for (const c of n.children!.values()) {
    const s = sizeOf(c);
    size += s.size;
    files += s.files;
    dirs += s.dirs + (c.isDir ? 1 : 0);
  }
  return { size, files, dirs };
}

function clone(n: Node): Node {
  return { ...n, children: n.children ? new Map([...n.children].map(([k, v]) => [k, clone(v)])) : undefined };
}

function uniqueName(parent: Node, name: string, isDir: boolean, copySuffix = false): string {
  const dot = isDir ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const has = (n: string) => parent.children!.has(n.toLowerCase());
  if (copySuffix) {
    let n = `${stem} - Cópia${ext}`;
    for (let i = 2; has(n); i++) n = `${stem} - Cópia (${i})${ext}`;
    return n;
  }
  if (!has(name)) return name;
  for (let i = 2; ; i++) {
    const n = `${stem} (${i})${ext}`;
    if (!has(n)) return n;
  }
}

function isProtected(path: string): string | null {
  const p = parts(path);
  if (p.length <= 1) return 'Não é possível alterar a raiz de uma unidade.';
  const low = path.toLowerCase();
  if (low.startsWith('c:\\windows')) return `“${p[p.length - 1]}” é uma pasta protegida do sistema.`;
  if (['c:\\users', 'c:\\users\\ana', 'c:\\program files'].includes(low)) return `“${p[p.length - 1]}” é uma pasta essencial e não pode ser alterada.`;
  for (const u of protectedPaths) if (low === u || low.startsWith(`${u}\\`)) return 'Está em uma pasta protegida nas Configurações.';
  return null;
}

/* ───────────── Progresso ───────────── */
let emit: (e: ProgressEvent) => void = () => {};
export function setEmitter(fn: (e: ProgressEvent) => void) {
  emit = fn;
}
const cancelled = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function animateProgress(taskId: string, phase: string, total: number, steps = 8, bytesTotal = 0) {
  for (let i = 1; i <= steps; i++) {
    if (cancelled.has(taskId)) return false;
    await sleep(90);
    emit({
      taskId,
      phase,
      done: Math.round((total * i) / steps),
      total,
      bytesDone: Math.round((bytesTotal * i) / steps),
      bytesTotal,
      current: `item ${i}`,
    });
  }
  return true;
}

/* ───────────── Estado simulado ───────────── */
let clipboard: { paths: string[]; cut: boolean } | null = null;
let protectedPaths: string[] = [];
interface MockTrash extends TrashEntry {
  node: Node;
}
let trash: MockTrash[] = [];
interface Slot {
  entries: FileEntry[];
  removed: Set<number>;
  roots: string[];
  elapsedMs: number;
}
export const slots = new Map<string, Slot>();

function collect(path: string, n: Node, opts: { includeHidden?: boolean; skipSystem?: boolean }, out: FileEntry[]) {
  if (!n.isDir) return;
  for (const c of n.children!.values()) {
    if (c.hidden && !opts.includeHidden) continue;
    const p = join(path, c.name);
    if (c.isDir) {
      if (opts.skipSystem && p.toLowerCase().startsWith('c:\\windows')) continue;
      collect(p, c, opts, out);
    } else out.push(toEntry(p, c, out.length));
  }
}

function slotEntries(slot: string): { s: Slot; live: FileEntry[] } {
  const s = slots.get(slot);
  if (!s) throw 'Nenhuma análise carregada. Analise as pastas novamente.';
  return { s, live: s.entries.filter((e) => !s.removed.has(e.id!)) };
}

function query(slot: string, filter: FileFilter, sort: SortSpec) {
  const { live } = slotEntries(slot);
  return sortForBackend(applyBackendFilter(live, filter), sort);
}

/* ───────────── Operações ───────────── */
function doCopyMove(sources: string[], dest: string, conflict: Conflict, move: boolean): OpReport {
  const report: OpReport = { done: [], failed: [], skipped: [], bytes: 0, cancelled: false };
  const target = resolve(dest);
  if (!target?.isDir) {
    report.failed.push({ path: dest, error: 'A pasta de destino não existe.' });
    return report;
  }
  for (const src of sources) {
    const n = resolve(src);
    const { parent, name, parentPath } = parentOf(src);
    if (!n || !parent) {
      report.failed.push({ path: src, error: 'O item não foi encontrado.' });
      continue;
    }
    if (move) {
      const prot = isProtected(src);
      if (prot) {
        report.failed.push({ path: src, error: prot });
        continue;
      }
    }
    if (n.isDir && (dest.toLowerCase() === src.toLowerCase() || dest.toLowerCase().startsWith(`${src.toLowerCase()}\\`))) {
      report.failed.push({ path: src, error: 'Não é possível copiar uma pasta para dentro dela mesma.' });
      continue;
    }
    const sameDir = parentPath.toLowerCase() === dest.toLowerCase().replace(/\\$/, '') || (parentPath.endsWith('\\') && parentPath.toLowerCase() === dest.toLowerCase());
    let newName = name;
    if (sameDir) {
      if (move) {
        report.skipped.push(src);
        continue;
      }
      newName = uniqueName(target, name, n.isDir, true);
    } else if (target.children!.has(name.toLowerCase())) {
      if (conflict === 'skip') {
        report.skipped.push(src);
        continue;
      }
      if (conflict === 'rename') newName = uniqueName(target, name, n.isDir);
      else target.children!.delete(name.toLowerCase());
    }
    const copy = move ? n : clone(n);
    copy.name = newName;
    if (!move) copy.created = Date.now();
    target.children!.set(newName.toLowerCase(), copy);
    if (move) parent.children!.delete(name.toLowerCase());
    report.bytes += sizeOf(n).size;
    report.done.push({ from: src, to: join(dest, newName) });
  }
  return report;
}

function remove(paths: string[], permanent: boolean): DeleteReport {
  const r: DeleteReport = { deleted: [], failed: [], bytes: 0, cancelled: false };
  for (const p of paths) {
    const prot = isProtected(p);
    const n = resolve(p);
    const { parent, name, parentPath } = parentOf(p);
    if (prot) {
      r.failed.push({ path: p, error: prot });
      continue;
    }
    if (!n || !parent) {
      r.failed.push({ path: p, error: 'O item não foi encontrado.' });
      continue;
    }
    parent.children!.delete(name.toLowerCase());
    const size = sizeOf(n).size;
    r.bytes += size;
    r.deleted.push(p);
    if (!permanent) {
      trash.unshift({
        id: `t${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        originalPath: p,
        originalParent: parentPath,
        deletedAt: Date.now(),
        size: n.isDir ? null : size,
        isDir: n.isDir,
        category: categoryFromExt(extOf(name), n.isDir),
        node: n,
      });
    }
  }
  return r;
}

function restoreTrash(items: MockTrash[]) {
  const failed: string[] = [];
  let done = 0;
  for (const t of items) {
    const parent = resolve(t.originalParent);
    if (!parent?.isDir || parent.children!.has(t.name.toLowerCase())) {
      failed.push(`${t.originalPath}: não foi possível restaurar.`);
      continue;
    }
    parent.children!.set(t.name.toLowerCase(), t.node);
    trash = trash.filter((x) => x !== t);
    done++;
  }
  return { done, failed };
}

/* ───────────── Despacho de comandos ───────────── */
type Args = Record<string, unknown>;
const handlers: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  app_info: () => ({ version: '1.0.0', platform: 'windows', os: 'Windows 11 Pro (simulado no navegador)' }),
  special_folders: () => ({
    home: HOME,
    desktop: `${HOME}\\Desktop`,
    documents: `${HOME}\\Documents`,
    downloads: `${HOME}\\Downloads`,
    pictures: `${HOME}\\Pictures`,
    music: `${HOME}\\Music`,
    videos: `${HOME}\\Videos`,
    temp: `${HOME}\\AppData\\Local\\Temp`,
  }),
  list_drives: (): DriveInfo[] => [
    { mount: 'C:\\', label: 'Windows', fileSystem: 'NTFS', total: 476 * GB, free: 61 * GB, removable: false, kind: 'ssd', isSystem: true },
    { mount: 'D:\\', label: 'Dados', fileSystem: 'NTFS', total: 931 * GB, free: 512 * GB, removable: false, kind: 'hdd', isSystem: false },
    { mount: 'E:\\', label: 'PENDRIVE', fileSystem: 'FAT32', total: 29 * GB, free: 21 * GB, removable: true, kind: 'desconhecido', isSystem: false },
  ],
  list_dir: (a) => {
    const n = resolve(a.path as string);
    if (!n) throw 'O item não foi encontrado (pode ter sido movido ou excluído).';
    if (!n.isDir) throw 'Não é uma pasta.';
    return [...n.children!.values()].filter((c) => a.showHidden || !c.hidden).map((c) => toEntry(join(a.path as string, c.name), c));
  },
  stat_path: (a) => {
    const n = resolve(a.path as string);
    if (!n) throw 'O item não foi encontrado.';
    return toEntry(a.path as string, n);
  },
  path_exists: (a) => !!resolve(a.path as string),
  is_dir: (a) => !!resolve(a.path as string)?.isDir,
  folder_size: async (a) => {
    await animateProgress(a.taskId as string, 'Calculando tamanho', 100, 4);
    const n = resolve(a.path as string);
    return n ? sizeOf(n) : { size: 0, files: 0, dirs: 0 };
  },
  read_text_preview: (a) =>
    `Pré-visualização de ${String(a.path).split('\\').pop()}\n\nEste é um arquivo de exemplo do modo navegador.\nNo aplicativo instalado, o conteúdo real aparece aqui.`,
  open_path: () => undefined,
  reveal_path: () => undefined,
  check_conflicts: (a) => {
    const dest = resolve(a.dest as string);
    if (!dest?.isDir) return [];
    return (a.sources as string[])
      .filter((s) => parentOf(s).parentPath.toLowerCase() !== (a.dest as string).toLowerCase())
      .map((s) => parentOf(s).name)
      .filter((n) => dest.children!.has(n.toLowerCase()));
  },
  copy_items: async (a) => {
    await animateProgress(a.taskId as string, 'Copiando', (a.sources as string[]).length, 6);
    return doCopyMove(a.sources as string[], a.dest as string, a.conflict as Conflict, false);
  },
  move_items: async (a) => {
    await animateProgress(a.taskId as string, 'Movendo', (a.sources as string[]).length, 4);
    return doCopyMove(a.sources as string[], a.dest as string, a.conflict as Conflict, true);
  },
  delete_items: async (a) => {
    await animateProgress(a.taskId as string, a.permanent ? 'Excluindo' : 'Enviando para a Lixeira', (a.paths as string[]).length, 4);
    return remove(a.paths as string[], !!a.permanent);
  },
  rename_item: (a) => {
    const path = a.path as string;
    const prot = isProtected(path);
    if (prot) throw prot;
    const newName = String(a.newName).trim();
    if (!newName || /[\\/:*?"<>|]/.test(newName)) throw 'O nome não pode conter \\ / : * ? " < > |';
    const n = resolve(path);
    const { parent, name, parentPath } = parentOf(path);
    if (!n || !parent) throw 'O item não foi encontrado.';
    if (newName.toLowerCase() !== name.toLowerCase() && parent.children!.has(newName.toLowerCase()))
      throw `Já existe um item chamado “${newName}” nesta pasta.`;
    parent.children!.delete(name.toLowerCase());
    n.name = newName;
    parent.children!.set(newName.toLowerCase(), n);
    return join(parentPath, newName);
  },
  create_folder: (a) => {
    const p = resolve(a.parent as string);
    if (!p?.isDir) throw 'A pasta não existe.';
    const name = uniqueName(p, (a.name as string) || 'Nova pasta', true);
    add(p, dir(name, 0));
    return join(a.parent as string, name);
  },
  create_text_file: (a) => {
    const p = resolve(a.parent as string);
    if (!p?.isDir) throw 'A pasta não existe.';
    const name = uniqueName(p, (a.name as string) || 'Novo documento de texto.txt', false);
    add(p, file(name, 0, 0));
    return join(a.parent as string, name);
  },
  clipboard_write: (a) => {
    clipboard = { paths: a.paths as string[], cut: !!a.cut };
  },
  clipboard_read: () => clipboard,
  clipboard_clear: () => {
    clipboard = null;
  },
  set_protected_paths: (a) => {
    protectedPaths = (a.paths as string[]).map((p) => p.toLowerCase().replace(/\\$/, ''));
  },
  check_protected: (a) => isProtected(a.path as string),
  cancel_task: (a) => {
    cancelled.add(a.taskId as string);
    return true;
  },
  save_text_file: (a) => {
    // No navegador, baixa o arquivo.
    const blob = new Blob([String(a.contents)], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = String(a.path).split('\\').pop() || 'arquivo.txt';
    link.click();
  },

  scan_start: async (a) => {
    const taskId = a.taskId as string;
    const roots = (a.roots as string[]).filter((r) => resolve(r)?.isDir);
    if (!roots.length) throw 'Nenhuma das pastas selecionadas existe.';
    const entries: FileEntry[] = [];
    for (const r of roots) collect(r, resolve(r)!, (a.options as { includeHidden?: boolean; skipSystem?: boolean }) ?? {}, entries);
    const ok = await animateProgress(taskId, 'Lendo pastas', entries.length, 10, entries.reduce((s, e) => s + e.size, 0));
    const slot: Slot = { entries, removed: new Set(), roots, elapsedMs: 900 };
    slots.set(a.slot as string, slot);
    const stats: ScanStats = {
      roots,
      files: entries.length,
      dirs: Math.max(1, Math.round(entries.length / 8)),
      bytes: entries.reduce((s, e) => s + e.size, 0),
      errors: 0,
      elapsedMs: 900,
      cancelled: !ok,
    };
    return stats;
  },
  scan_query: (a) => {
    const list = query(a.slot as string, a.filter as FileFilter, a.sort as SortSpec);
    const offset = a.offset as number;
    return {
      total: list.length,
      totalSize: list.reduce((s, e) => s + e.size, 0),
      offset,
      items: list.slice(offset, offset + (a.limit as number)),
    };
  },
  scan_summary: (a) => summarizeEntries(query(a.slot as string, a.filter as FileFilter, a.sort as SortSpec), slots.get(a.slot as string)!.roots),
  scan_ids: (a) => query(a.slot as string, a.filter as FileFilter, a.sort as SortSpec).map((e) => e.id!),
  scan_paths: (a) => {
    const { s } = slotEntries(a.slot as string);
    return (a.ids as number[]).map((i) => s.entries[i]?.path).filter(Boolean);
  },
  scan_remove: (a) => {
    const { s } = slotEntries(a.slot as string);
    for (const i of a.ids as number[]) s.removed.add(i);
    const live = s.entries.filter((e) => !s.removed.has(e.id!));
    return { roots: s.roots, files: live.length, dirs: 0, bytes: live.reduce((x, e) => x + e.size, 0), errors: 0, elapsedMs: s.elapsedMs, cancelled: false };
  },
  scan_stats: (a) => {
    const s = slots.get(a.slot as string);
    if (!s) return null;
    const live = s.entries.filter((e) => !s.removed.has(e.id!));
    return { roots: s.roots, files: live.length, dirs: 0, bytes: live.reduce((x, e) => x + e.size, 0), errors: 0, elapsedMs: s.elapsedMs, cancelled: false };
  },
  scan_dispose: (a) => {
    slots.delete(a.slot as string);
  },

  trash_list: () => trash.map(({ node: _n, ...t }) => t),
  trash_restore: (a) => restoreTrash(trash.filter((t) => (a.ids as string[]).includes(t.id))),
  trash_purge: (a) => {
    const ids = a.ids as string[];
    const before = trash.length;
    trash = trash.filter((t) => !ids.includes(t.id));
    return { done: before - trash.length, failed: [] };
  },
  trash_restore_paths: (a) => {
    const paths = (a.paths as string[]).map((p) => p.toLowerCase());
    return restoreTrash(trash.filter((t) => paths.includes(t.originalPath.toLowerCase())));
  },
  undo_moves: (a) => {
    const report: OpReport = { done: [], failed: [], skipped: [], bytes: 0, cancelled: false };
    for (const [original, current] of a.pairs as [string, string][]) {
      const n = resolve(current);
      const cur = parentOf(current);
      const orig = parentOf(original);
      const dest = resolve(orig.parentPath);
      if (!n || !cur.parent || !dest?.isDir) {
        report.failed.push({ path: current, error: 'O item não foi encontrado.' });
        continue;
      }
      cur.parent.children!.delete(cur.name.toLowerCase());
      const name = dest.children!.has(orig.name.toLowerCase()) ? uniqueName(dest, orig.name, n.isDir) : orig.name;
      n.name = name;
      dest.children!.set(name.toLowerCase(), n);
      report.done.push({ from: current, to: join(orig.parentPath, name) });
    }
    return report;
  },
};

/** Ponto de entrada usado por `call()` em api.ts. */
export async function handle(cmd: string, args: Args): Promise<unknown> {
  const h = handlers[cmd] ?? extraHandlers[cmd];
  if (!h) {
    console.warn(`[simulação] comando sem implementação: ${cmd}`);
    return null;
  }
  await sleep(cmd.startsWith('list_') || cmd.startsWith('scan_q') ? 60 : 20);
  try {
    return await h(args);
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Outros módulos simulados (saúde, limpeza...) registram seus comandos aqui. */
export const extraHandlers: Record<string, (a: Args) => unknown | Promise<unknown>> = {};

/** Recria o disco simulado (usado pelos testes). */
export function resetMockDisk() {
  seed = 20261116;
  disk = buildDisk();
}

export const mockInternals = { resolve, sizeOf, join, toEntry, collect, HOME, animateProgress, sleep, between, rnd, emit: (e: ProgressEvent) => emit(e) };
