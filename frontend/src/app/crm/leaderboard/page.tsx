// frontend/src/app/crm/leaderboard/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { api } from '@/lib/api';

export default function LeaderboardPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-leaderboard'],
    queryFn: () => api.getCrmLeaderboard(),
  });

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#D4A017]" /> Leaderboard
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Last 30 days</p>
      </div>

      <div className="p-5 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" /></div>
        ) : data.map((entry: any, i: number) => (
          <div key={entry.agent._id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900">{entry.agent.name}</p>
              <p className="text-[11px] text-gray-500">{entry.agent.departmentType === 'crm_head' ? 'Manager' : 'Agent'}</p>
            </div>
            <div className="flex gap-5 text-right">
              <div>
                <p className="text-lg font-bold text-[#7C5C1E] tabular-nums">{entry.points}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">pts</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-800 tabular-nums">{entry.totalCalls}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">calls</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 tabular-nums">{entry.convRate}%</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">conv.</p>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && !data.length && <p className="text-center text-sm text-gray-400 py-16">No agents yet</p>}
      </div>
    </div>
  );
}
