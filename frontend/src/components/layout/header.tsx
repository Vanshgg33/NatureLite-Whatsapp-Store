'use client';

import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  return (
    <header className="flex h-14 md:h-16 flex-col sm:flex-row sm:items-center justify-between gap-3 border-b bg-white px-4 sm:px-6 py-3 sm:py-0">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{title}</h1>
        {description && <p className="text-xs sm:text-sm text-gray-500 truncate">{description}</p>}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="relative hidden sm:block flex-1 sm:flex-initial max-w-[200px] sm:max-w-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input type="search" placeholder="Search..." className="w-full sm:w-48 md:w-64 pl-9" />
        </div>

        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        {action}
      </div>
    </header>
  );
}
