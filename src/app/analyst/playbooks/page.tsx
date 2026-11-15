import { PlaybookManager } from '@/components/playbooks/PlaybookManager';

// Analysts can list and search playbooks but not change them.
export default function AnalystPlaybooksPage() {
  return <PlaybookManager canEdit={false} />;
}
