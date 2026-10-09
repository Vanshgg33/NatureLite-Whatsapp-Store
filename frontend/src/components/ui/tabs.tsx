'use client';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('flex gap-1 rounded-fms-control p-1', className)}
      style={{ background: '#EFEDE6' }}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors font-jakarta',
        'text-fms-muted data-[state=active]:bg-white data-[state=active]:text-fms-ink data-[state=active]:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fms-brand focus-visible:ring-offset-1',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = T.Content;
