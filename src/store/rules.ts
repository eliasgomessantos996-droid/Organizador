import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IconName } from '../components/Icon';
import { joinPath } from '../lib/format';
import type { Rule, SpecialFolders } from '../lib/types';

interface RulesState {
  rules: Rule[];
  add: (r: Rule) => void;
  update: (id: string, patch: Partial<Rule>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
}

const uid = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function blankRule(source = ''): Rule {
  return {
    id: uid(),
    name: 'Nova regra',
    enabled: true,
    source,
    recursive: false,
    conditions: { categories: [], extensions: [], nameContains: '', olderThanDays: null, minSize: null, maxSize: null },
    action: { type: 'move', dest: '{categoria}' },
  };
}

export const useRules = create<RulesState>()(
  persist(
    (set, get) => ({
      rules: [],
      add: (r) => set({ rules: [...get().rules, r] }),
      update: (id, patch) => set({ rules: get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
      remove: (id) => set({ rules: get().rules.filter((r) => r.id !== id) }),
      duplicate: (id) => {
        const r = get().rules.find((x) => x.id === id);
        if (r) set({ rules: [...get().rules, { ...r, id: uid(), name: `${r.name} (cópia)` }] });
      },
      move: (id, dir) => {
        const list = [...get().rules];
        const i = list.findIndex((r) => r.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        set({ rules: list });
      },
    }),
    { name: 'organizador-regras', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  make: (sp: SpecialFolders) => Rule | null;
}

export const TEMPLATES: RuleTemplate[] = [
  {
    id: 'downloads-tipo',
    name: 'Organizar Downloads por tipo',
    description: 'Cria pastas como Imagens, PDFs, Instaladores e Compactados dentro de Downloads.',
    icon: 'layers',
    make: (sp) => (sp.downloads ? { ...blankRule(sp.downloads), name: 'Organizar Downloads por tipo', action: { type: 'move', dest: '{categoria}' } } : null),
  },
  {
    id: 'capturas',
    name: 'Separar capturas de tela',
    description: 'Leva capturas de tela soltas em Downloads para Imagens\\Capturas de tela.',
    icon: 'image',
    make: (sp) =>
      sp.downloads && sp.pictures
        ? {
            ...blankRule(sp.downloads),
            name: 'Separar capturas de tela',
            conditions: { ...blankRule().conditions, nameContains: 'Captura de tela', categories: ['image'] },
            action: { type: 'move', dest: joinPath(sp.pictures, 'Capturas de tela') },
          }
        : null,
  },
  {
    id: 'fotos-data',
    name: 'Fotos por ano e mês',
    description: 'Organiza as fotos soltas em Imagens em pastas como 2025\\03 - Março.',
    icon: 'calendar',
    make: (sp) =>
      sp.pictures
        ? { ...blankRule(sp.pictures), name: 'Fotos por ano e mês', conditions: { ...blankRule().conditions, categories: ['image'] }, action: { type: 'move', dest: '{ano}\\{mes} - {mes_nome}' } }
        : null,
  },
  {
    id: 'documentos',
    name: 'Documentos baixados para Documentos',
    description: 'Move PDFs, planilhas e documentos de Downloads para Documentos\\Baixados.',
    icon: 'file-text',
    make: (sp) =>
      sp.downloads && sp.documents
        ? {
            ...blankRule(sp.downloads),
            name: 'Documentos baixados para Documentos',
            conditions: { ...blankRule().conditions, categories: ['document', 'pdf', 'spreadsheet', 'presentation'] },
            action: { type: 'move', dest: joinPath(joinPath(sp.documents, 'Baixados'), '{categoria}') },
          }
        : null,
  },
  {
    id: 'instaladores',
    name: 'Instaladores antigos para a Lixeira',
    description: 'Manda para a Lixeira instaladores (.exe, .msi) baixados há mais de 30 dias.',
    icon: 'package',
    make: (sp) =>
      sp.downloads
        ? { ...blankRule(sp.downloads), name: 'Instaladores antigos para a Lixeira', conditions: { ...blankRule().conditions, categories: ['executable'], olderThanDays: 30 }, action: { type: 'trash' } }
        : null,
  },
];
