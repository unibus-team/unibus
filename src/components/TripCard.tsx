import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ScoredTrip } from '../types/unibus';
import { formatDateShort, formatDuration, formatTime12h } from '../utils/scoring';

export function TripCard({
  scored,
  highlightBest = false,
  onDetails,
  onBook,
}: {
  scored: ScoredTrip;
  highlightBest?: boolean;
  onDetails: (scored: ScoredTrip) => void;
  onBook: (scored: ScoredTrip) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { trip, bus, route, matchPercent, tags, breakdown } = scored;
  const isTop = highlightBest && tags.includes('Best match');

  return (
    <div
      className={`rounded-2xl bg-white transition-all overflow-hidden ${
        isTop
          ? 'border-2 border-[#FACC15] shadow-sm'
          : 'border border-[#E8E4D9] hover:border-[#D4CFC2]'
      }`}
    >
      {/* Top strip matching screenshot */}
      <div
        className={`px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-2 ${
          isTop ? 'bg-[#FACC15]' : 'bg-[#FFFDF5] border-b border-[#F2EFE6]'
        }`}
      >
        {isTop && (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#111111] text-[#FACC15] whitespace-nowrap">
            Best match
          </span>
        )}
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#111111] text-white tabular-nums whitespace-nowrap">
          {matchPercent}% match
        </span>
        {tags
          .filter((t) => t !== 'Best match')
          .map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white border border-[#E6DFC8] text-[#4E4A3F] whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
      </div>

      {/* Main content */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#6E6A61] mb-3">
              <span className="px-2 py-0.5 rounded-md bg-[#111111] text-white font-semibold text-[11px] whitespace-nowrap">
                {bus.category}
              </span>
              <span className="font-semibold text-[#2C2A25]">{bus.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDateShort(trip.date)}</span>
            </div>

            {/* Departure -> Duration -> Arrival timeline */}
            <div className="flex items-center gap-3 sm:gap-5">
              <div>
                <div className="text-lg sm:text-xl font-extrabold text-[#111111] tabular-nums leading-tight">
                  {formatTime12h(trip.departureTime)}
                </div>
                <div className="text-xs text-[#6E6A61] mt-0.5">{route.from}</div>
              </div>

              <div className="flex-1 flex items-center gap-2 min-w-[70px]">
                <div className="h-[1px] flex-1 border-b border-dashed border-[#CBC5B5]" />
                <span className="text-[11px] font-medium text-[#7A766D] tabular-nums whitespace-nowrap">
                  {formatDuration(route.estDurationMin)}
                </span>
                <div className="h-[1px] flex-1 border-b border-dashed border-[#CBC5B5]" />
                <span className="w-2 h-2 rounded-full bg-[#ECE8DD] border border-[#CBC5B5] shrink-0" />
              </div>

              <div className="text-right">
                <div className="text-lg sm:text-xl font-extrabold text-[#111111] tabular-nums leading-tight">
                  {formatTime12h(trip.arrivalTime)}
                </div>
                <div className="text-xs text-[#6E6A61] mt-0.5">{route.to}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-[#6E6A61]">
              <span
                className={`font-semibold tabular-nums ${
                  trip.freeSeats <= 5 ? 'text-rose-600' : 'text-[#55524B]'
                }`}
              >
                {trip.freeSeats} seats left
              </span>
              <span>Scheduled arrival (estimate)</span>
              <span className="text-[#8E8A80]">Drop-off: {trip.gateDropoff}</span>
            </div>
          </div>

          {/* Right price + CTAs */}
          <div className="flex md:flex-col items-center md:items-end justify-between gap-3 md:pl-5 md:border-l border-[#F0ECE1] shrink-0">
            <div className="text-left md:text-right">
              <span className="text-2xl font-extrabold text-[#111111] tabular-nums">{trip.priceEgp}</span>
              <span className="text-xs text-[#7A766D] ml-1">EGP / seat</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDetails(scored)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[#DFDBD0] text-[#111111] hover:bg-[#FAF8F3] transition-colors whitespace-nowrap cursor-pointer"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => onBook(scored)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] transition-colors whitespace-nowrap cursor-pointer"
              >
                Book now
              </button>
            </div>
          </div>
        </div>

        {/* Transparent score toggle */}
        <div className="mt-3 pt-2.5 border-t border-[#F4F1E8]">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7A766D] hover:text-[#111111] transition-colors cursor-pointer"
          >
            <span>How this score is calculated</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="mt-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] text-xs text-[#4E4A3F] space-y-1">
              <div className="font-semibold text-[#111111]">Transparent weighted scoring breakdown:</div>
              <div className="tabular-nums font-mono text-[11px]">{breakdown.explanation}</div>
              <p className="text-[11px] text-[#7A766D]">
                Corridor: {route.corridorNotes} ({route.distanceKm} km)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
