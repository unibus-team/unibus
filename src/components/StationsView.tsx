import { useState } from 'react';
import { ArrowRight, Clock, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import { useUniBus } from '../context/UniBusContext';
import { CongestionLevel } from '../types/unibus';

const CONGESTION_BADGE: Record<CongestionLevel, string> = {
  Smooth: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  Heavy: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function StationsView({
  onFindFromCity,
}: {
  onFindFromCity: (city: string) => void;
}) {
  const { stations, trafficReports, currentUser, submitTrafficReport } = useUniBus();
  const [selectedId, setSelectedId] = useState(stations[0]?.id || 'st-sabrabay');
  const [reportLevel, setReportLevel] = useState<CongestionLevel>('Moderate');
  const [fareNote, setFareNote] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = stations.find((s) => s.id === selectedId) || stations[0];

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setFeedback({ ok: false, text: 'Log in as a student to submit a live station congestion update.' });
      return;
    }
    const res = await submitTrafficReport(selected.id, reportLevel, fareNote);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Could not submit update.' });
      return;
    }
    setFareNote('');
    setFeedback({ ok: true, text: 'Live update recorded. Your student trust score increased (+0.05).' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">
            Stations &amp; Sabrabay Hubs
          </h1>
          <p className="text-sm text-[#6E6A61] mt-1">
            Main terminals, railway transfers, and Sabrabay Complex gates with live student traffic updates.
          </p>
        </div>
      </div>

      {/* Interactive Corridor Network Map + Selected Station Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl bg-[#111111] text-white p-5 sm:p-6 border border-[#242424] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold tracking-wider uppercase text-[#FACC15]">
                Gharbia → Sabrabay Network
              </div>
              <div className="text-sm text-white/75 mt-0.5">
                Click any hub node to inspect headways, landmarks, and live congestion
              </div>
            </div>
          </div>

          <div className="relative w-full h-[270px] rounded-xl bg-[#171717] border border-white/10 overflow-hidden">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              {/* Corridor connection lines into Tanta & Sabrabay */}
              <line x1="18" y1="48" x2="50" y2="52" stroke="#FACC15" strokeOpacity="0.4" strokeWidth="0.6" />
              <line x1="84" y1="58" x2="68" y2="56" stroke="#FACC15" strokeOpacity="0.4" strokeWidth="0.6" />
              <line x1="68" y1="56" x2="56" y2="66" stroke="#FACC15" strokeOpacity="0.4" strokeWidth="0.6" />
              <line x1="56" y1="66" x2="50" y2="52" stroke="#FACC15" strokeOpacity="0.5" strokeWidth="0.7" />
              <line x1="72" y1="22" x2="42" y2="28" stroke="#FACC15" strokeOpacity="0.5" strokeWidth="0.7" />
              <line x1="50" y1="52" x2="42" y2="28" stroke="#FACC15" strokeOpacity="0.9" strokeWidth="1.0" />
              <line x1="18" y1="48" x2="42" y2="28" stroke="#FFFFFF" strokeOpacity="0.25" strokeDasharray="1.5 1.5" strokeWidth="0.5" />
            </svg>

            {stations.map((st) => {
              const isSelected = st.id === selected.id;
              const isCampus = st.type === 'Campus Gate';
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedId(st.id)}
                  style={{ left: `${st.x}%`, top: `${st.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer focus:outline-none"
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-transform ${
                      isSelected ? 'scale-125' : 'group-hover:scale-110'
                    } ${
                      isCampus
                        ? 'bg-[#FACC15] border-white'
                        : st.congestion === 'Heavy'
                        ? 'bg-rose-500 border-white'
                        : st.congestion === 'Moderate'
                        ? 'bg-amber-400 border-white'
                        : 'bg-emerald-400 border-white'
                    }`}
                  />
                  <span
                    className={`mt-1 block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                      isSelected ? 'bg-[#FACC15] text-[#111111]' : 'bg-black/75 text-white'
                    }`}
                  >
                    {st.city}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15]" /> Sabrabay Campus Gate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Smooth
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Moderate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Heavy Jam
            </span>
          </div>
        </div>

        {/* Selected Station Card + Crowdsourced Report */}
        <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[#7A766D]">{selected.type}</div>
                <h2 className="text-lg font-extrabold text-[#111111] mt-0.5">{selected.name}</h2>
                <div className="text-xs text-[#6E6A61] mt-0.5">{selected.nameAr}</div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
                  CONGESTION_BADGE[selected.congestion]
                }`}
              >
                {selected.congestion}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#111111] font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#D97706]" />
                <span>{selected.landmarks}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#55524B] tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {selected.linesCount} active lines · ~{selected.avgHeadwayMin} min headway · Updated{' '}
                  {selected.lastUpdated}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onFindFromCity(selected.city)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#111111] hover:bg-[#222222] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Find trips via {selected.city}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <form onSubmit={handleReport} className="pt-4 border-t border-[#ECE8DD] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111111]">Report Live Congestion</span>
              {currentUser && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium tabular-nums">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Trust {currentUser.trustScore.toFixed(2)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Smooth', 'Moderate', 'Heavy'] as CongestionLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setReportLevel(lvl)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    reportLevel === lvl
                      ? 'bg-[#111111] text-[#FACC15] border-[#111111]'
                      : 'bg-[#FAF8F3] text-[#4E4A3F] border-[#E5E0D5]'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={fareNote}
              onChange={(e) => setFareNote(e.target.value)}
              placeholder="Optional fare/queue note..."
              className="w-full px-3 py-1.5 rounded-lg border border-[#DFDBD0] text-xs focus:outline-none focus:border-[#111111]"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
            >
              Submit update
            </button>
            {feedback && (
              <p className={`text-[11px] font-medium ${feedback.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {feedback.text}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* All Stations Grid + Recent Crowdsourced Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map((st) => (
          <div
            key={st.id}
            onClick={() => setSelectedId(st.id)}
            className={`rounded-2xl bg-white p-4 border transition-all cursor-pointer ${
              st.id === selected.id ? 'border-[#111111] shadow-sm' : 'border-[#E8E4D9] hover:border-[#D4CFC2]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] text-[#7A766D] font-medium">{st.type}</div>
                <h3 className="text-sm font-bold text-[#111111] mt-0.5">{st.name}</h3>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CONGESTION_BADGE[st.congestion]}`}>
                {st.congestion}
              </span>
            </div>
            <p className="text-xs text-[#6E6A61] mt-2 line-clamp-2">{st.landmarks}</p>
            <div className="mt-3 pt-2.5 border-t border-[#F4F1E8] flex items-center justify-between text-[11px] text-[#7A766D] tabular-nums">
              <span>{st.linesCount} lines · ~{st.avgHeadwayMin}m</span>
              <span>{st.lastUpdated}</span>
            </div>
          </div>
        ))}
      </div>

      {trafficReports.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5">
          <h3 className="text-sm font-bold text-[#111111] mb-3">Recent Crowdsourced Reports</h3>
          <div className="divide-y divide-[#F4F1E8]">
            {trafficReports.slice(0, 5).map((r) => (
              <div key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold text-[#111111]">{r.userName}</span>
                  <span className="text-[#7A766D]"> · {r.stationName}</span>
                  {r.fareNote && <span className="text-[#55524B]"> — “{r.fareNote}”</span>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CONGESTION_BADGE[r.congestion]}`}>
                  {r.congestion}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
