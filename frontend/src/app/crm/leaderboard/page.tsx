'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, Phone, CheckCircle2, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';

const RANK_STYLES = [
  { bg: '#FEF3C7', color: '#92400E', ring: '#D97706' },
  { bg: '#F3F4F6', color: '#4B5563', ring: '#9CA3AF' },
  { bg: '#FFF7ED', color: '#9A3412', ring: '#F97316' },
];

function Stat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-3 w-3" style={{ color }} />
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#A09A93' }}>{label}</p>
      </div>
      <p className="text-[15px] font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{value}</p>
    </div>
  );
}

export default function LeaderboardPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-leaderboard'],
    queryFn: () => api.getCrmLeaderboard(),
  });

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      <div className="bg-white px-7 py-5" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <h1 className="text-xl font-semibold flex items-center gap-2.5" style={{ color: '#1C1917' }}>
          <Trophy className="h-5 w-5" style={{ color: '#D4A017' }} />
          Agent Leaderboard
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>Last 30 days · ranked by conversions</p>
      </div>

      <div className="p-7 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Trophy className="h-10 w-10 mb-4" style={{ color: '#D1CAC2' }} />
            <p className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>No activity yet</p>
            <p className="text-[13px] mt-1" style={{ color: '#A09A93' }}>Leaderboard fills as agents log calls</p>
          </div>
        ) : data.map((entry: any, i: number) => {
          const rank = i + 1;
          const rs = RANK_STYLES[i] ?? { bg: '#F7F5F0', color: '#A09A93', ring: '#E8E2D9' };
          const convRate = entry.callsCount > 0 ? Math.round((entry.conversions / entry.callsCount) * 100) : 0;
          const initials = (entry.agent?.name ?? 'A').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

          return (
            <div
              key={entry.agent?._id ?? i}
              className="bg-white rounded-xl crm-count-in"
              style={{
                border: `1px solid ${i < 3 ? rs.ring + '60' : '#E8E2D9'}`,
                boxShadow: i === 0 ? '0 4px 16px rgba(212,160,23,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                animationDelay: `${i * 40}ms`,
              }}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Rank badge */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1 w-10">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                    style={{ background: rs.bg, color: rs.color, border: `1.5px solid ${rs.ring}50` }}
                  >
                    {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                  </div>
                </div>

                {/* Avatar */}
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: i === 0 ? 'linear-gradient(135deg, #1A3625, #2A5040)' : '#F0EDE7', color: i === 0 ? '#D4A017' : '#7C5C1E' }}
                >
                  {initials}
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] truncate" style={{ color: '#1C1917' }}>{entry.agent?.name ?? 'Unknown'}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#A09A93' }}>
                    {entry.agent?.crmRole === 'crm_head' ? 'CRM Manager' : 'Senior Agent'}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center" style={{ borderLeft: '1px solid #F0EDE7', paddingLeft: '16px', gap: '0px' }}>
                  <Stat label="Calls" value={entry.callsCount ?? 0} icon={Phone} color="#7C5C1E" />
                  <div style={{ width: '1px', height: '32px', background: '#F0EDE7' }} />
                  <Stat label="Conv." value={entry.conversions ?? 0} icon={CheckCircle2} color="#16A34A" />
                  <div style={{ width: '1px', height: '32px', background: '#F0EDE7' }} />
                  <Stat label="Rate" value={`${convRate}%`} icon={TrendingUp} color="#2563EB" />
                </div>

                {/* Bar */}
                {data.length > 0 && (
                  <div className="w-20 hidden sm:block">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE7' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${((entry.conversions ?? 0) / Math.max(...data.map((d: any) => d.conversions ?? 0), 1)) * 100}%`,
                          background: i === 0 ? 'linear-gradient(90deg, #D97706, #D4A017)' : '#D1CAC2',
                        }}
                      />
                    </div>
                    <p className="text-[10px] mt-1 text-right font-medium" style={{ color: '#A09A93' }}>{entry.conversions ?? 0} conv</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
