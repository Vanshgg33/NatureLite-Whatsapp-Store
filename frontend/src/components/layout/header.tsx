'use client';

import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function Header({ title, description, icon, action }: HeaderProps) {
  return (
    <header className="flex h-14 md:h-16 flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.07] bg-[#F7F5F0] px-4 sm:px-6 py-3 sm:py-0 flex-shrink-0">
      <div className="min-w-0 flex items-center gap-2">
        {icon}
        <div>
          <h1 className="font-display italic text-lg sm:text-xl text-gray-900 truncate tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-gray-500 truncate">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Search…"
            className="w-44 md:w-56 pl-9 h-9 bg-white border-black/10 text-sm rounded-lg focus-visible:ring-[#2F6B47]/30"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg bg-white border border-black/10 text-gray-500 hover:text-gray-700 hover:bg-white"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

        {action}
      </div>
    </header>
  );
}
