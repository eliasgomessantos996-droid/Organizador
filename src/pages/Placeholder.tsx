import { EmptyState } from '../components/ui/controls';
import { PageHeader } from '../components/layout/PageHeader';
import type { IconName } from '../components/Icon';

/** Página provisória enquanto o recurso é construído. */
export function Placeholder({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="page-scroll">
      <PageHeader icon={icon} title={title} subtitle="Este recurso está sendo construído." />
      <div className="card">
        <EmptyState icon={icon} title="Em construção" text="Esta página ganha vida nas próximas etapas." />
      </div>
    </div>
  );
}
