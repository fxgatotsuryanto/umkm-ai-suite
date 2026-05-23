'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Check, UserCheck, Clock, Wifi } from 'lucide-react';
import { api, type Chat } from '@/lib/api';

function groupByNumber(chats: Chat[]): Record<string, Chat[]> {
  return chats.reduce((acc, c) => {
    if (!acc[c.wa_number]) acc[c.wa_number] = [];
    acc[c.wa_number].push(c);
    return acc;
  }, {} as Record<string, Chat[]>);
}

export default function WAPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchChats = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await api.getChats(200);
      setChats(data);
      setLastRefresh(new Date());
      setError('');
    } catch {
      setError('Gagal terhubung ke backend');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChats();
    intervalRef.current = setInterval(() => fetchChats(), 10000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected, chats]);

  const grouped = groupByNumber(chats);
  const numbers = Object.keys(grouped).sort((a, b) => {
    const la = grouped[a][0].created_at;
    const lb = grouped[b][0].created_at;
    return new Date(lb).getTime() - new Date(la).getTime();
  });
  const selectedChats = selected ? [...(grouped[selected] ?? [])].reverse() : [];
  const selectedName = selected ? (grouped[selected]?.[0]?.customer_name || selected) : '';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left Panel: Chat List ─────────────────────────── */}
      <div className="w-80 flex flex-col border-r border-slate-200 bg-white flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800">WA Auto-Reply</h2>
            <button
              onClick={() => fetchChats(true)}
              disabled={refreshing}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={`text-slate-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Wifi size={11} className={error ? 'text-red-400' : 'text-green-500'} />
            {error
              ? <span className="text-red-400">{error}</span>
              : <span>Refresh otomatis · {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            }
          </div>
          {numbers.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{numbers.length} kontak</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">{chats.length} pesan</span>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : numbers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
              <MessageSquare size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium text-center">Belum ada chat masuk</p>
              <p className="text-xs text-center mt-1 opacity-70">Pesan WA akan muncul di sini setelah n8n terkoneksi</p>
            </div>
          ) : (
            numbers.map(num => {
              const msgs = grouped[num];
              const latest = msgs[0];
              const count = msgs.length;
              const isSelected = selected === num;
              return (
                <button
                  key={num}
                  onClick={() => setSelected(num)}
                  className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-teal-500' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                        {(latest.customer_name || num)[0].toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {latest.customer_name || num}
                        </p>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {new Date(latest.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{latest.message_in}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                          <Check size={9} /> AI Replied
                        </span>
                        <span className="text-xs text-slate-400">{count}×</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel: Conversation ─────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={28} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500">Pilih percakapan</p>
              <p className="text-sm mt-1 opacity-60">Klik kontak di sebelah kiri</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center font-bold text-white text-sm">
                  {selectedName[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{selectedName}</p>
                  <p className="text-xs text-slate-400">{selected} · {selectedChats.length} pesan</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">
                  <Check size={11} /> AI Replied
                </span>
                <button className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                  <UserCheck size={13} /> Ambil Alih
                </button>
                <button className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                  <Check size={13} /> Selesai
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {selectedChats.map(chat => (
                <div key={chat.id} className="space-y-2">
                  {/* Customer bubble */}
                  <div className="flex justify-start">
                    <div className="max-w-sm">
                      <p className="text-xs text-slate-400 mb-1 ml-1">{chat.customer_name || chat.wa_number}</p>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-2.5 shadow-sm">
                        <p className="text-sm text-slate-700 leading-relaxed">{chat.message_in}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 ml-1">
                        {new Date(chat.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {/* AI bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-sm">
                      <p className="text-xs text-slate-400 mb-1 mr-1 text-right">
                        🤖 AI · {chat.tokens_used} token
                      </p>
                      <div className="bg-teal-600 rounded-2xl rounded-tr-md px-4 py-2.5 shadow-sm">
                        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{chat.message_out}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Live indicator */}
            <div className="bg-white border-t border-slate-100 px-5 py-2 flex items-center gap-2">
              <Clock size={12} className="text-slate-400" />
              <span className="text-xs text-slate-400">
                Auto-refresh aktif · terakhir {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
