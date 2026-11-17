import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Tabs } from '../../components/ui/controls';
import { useNav } from '../../store/nav';
import { ForgottenFiles } from './ForgottenFiles';
import { RecycleBin } from './RecycleBin';
import { SystemCleanup } from './SystemCleanup';

type Tab = 'sistema' | 'esquecidos' | 'lixeira';

export function Cleanup() {
  const params = useNav((s) => s.params);
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? 'sistema');
  useEffect(() => {
    if (params.tab && ['sistema', 'esquecidos', 'lixeira'].includes(params.tab)) setTab(params.tab as Tab);
  }, [params.nonce, params.tab]);

  return (
    <div className="page-scroll">
      <PageHeader icon="broom" title="Limpeza" subtitle="Libere espaço removendo o que não serve mais. Você vê tudo antes de apagar." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sistema', label: 'Limpeza do sistema', icon: 'broom' },
          { value: 'esquecidos', label: 'Arquivos esquecidos', icon: 'clock' },
          { value: 'lixeira', label: 'Lixeira', icon: 'trash' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {tab === 'sistema' ? <SystemCleanup /> : tab === 'esquecidos' ? <ForgottenFiles /> : <RecycleBin />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
