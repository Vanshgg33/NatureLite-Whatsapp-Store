import ComingSoon from '@/components/crm/ComingSoon';

// Needed because customers/[id] would otherwise capture "duplicates" as a customer id.
export default function Page() {
  return <ComingSoon />;
}
