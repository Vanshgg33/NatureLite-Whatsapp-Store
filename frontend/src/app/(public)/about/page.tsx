import { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Our Story — Purity Foods',
  description: 'Learn about Purity Foods — our mission to bring traditional cold-pressed oils and bilona ghee to your kitchen.',
};

const AboutClient = dynamic(() => import('./AboutClient'), { ssr: false });

export default function AboutPage() {
  return (
    <div className="pt-0">
      <AboutClient />
    </div>
  );
}
