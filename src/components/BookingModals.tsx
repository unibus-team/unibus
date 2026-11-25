import { useState } from 'react';
import { CheckCircle2, MapPin, Star, X } from 'lucide-react';
import { ScoredTrip } from '../types/unibus';
import { formatDateShort, formatDuration, formatTime12h } from '../utils/scoring';

export function TripDetailsModal({
  scored,
  onClose,
  onBook,
}: {
  scored: ScoredTrip;
  onClose: () => void;
  onBook: (scored: ScoredTrip) => void;
}) {
  const { trip, bus, route, matchPercent } = scored;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white border border-[#E8E4D9] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#111111] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#FACC15] font-semibold">Trip #{trip.id} · {matchPercent}% match</div>
            <h3 className="text-lg font-bold mt-0.5">
              {route.from} → {route.to}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD]">
            <div>
              <div className="text-xs text-[#7A766D]">Departure</div>
              <div className="font-bold text-[#111111] tabular-nums">
                {formatDateShort(trip.date)} · {formatTime12h(trip.departureTime)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A766D]">Estimated Arrival</div>
              <div className="font-bold text-[#111111] tabular-nums">
                {formatTime12h(trip.arrivalTime)} ({formatDuration(route.estDurationMin)})
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A766D]">Vehicle</div>
              <div className="font-semibold text-[#111111]">
                {bus.name} ({bus.category}) · {bus.plateNumber}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A766D]">Availability</div>
              <div className="font-semibold text-[#111111] tabular-nums">
                {trip.freeSeats} of {bus.totalSeats} seats free
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs text-[#55524B]">
              <MapPin className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#111111]">Corridor & Drop-off: </span>
                {route.corridorNotes}. Drops at <strong>{trip.gateDropoff}</strong>.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {bus.amenities.map((a) => (
                <span
                  key={a}
                  className="px-2.5 py-1 rounded-lg bg-[#FAF8F3] border border-[#E8E4D9] text-xs font-medium text-[#4E4A3F]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[#ECE8DD] flex items-center justify-between">
            <div>
              <span className="text-2xl font-extrabold text-[#111111] tabular-nums">{trip.priceEgp} EGP</span>
              <span className="text-xs text-[#7A766D] ml-1">per seat</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onBook(scored);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm cursor-pointer"
            >
              Book this trip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BookTripModal({
  scored,
  initialPassengers = 1,
  onClose,
  onConfirm,
}: {
  scored: ScoredTrip;
  initialPassengers?: number;
  onClose: () => void;
  onConfirm: (
    tripId: number,
    passengers: number,
    pickupNote?: string
  ) => Promise<{ ok: boolean; reference?: string; error?: string }> | { ok: boolean; reference?: string; error?: string };
}) {
  const [passengers, setPassengers] = useState(Math.min(initialPassengers, scored.trip.freeSeats));
  const [pickupNote, setPickupNote] = useState('');
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await onConfirm(scored.trip.id, passengers, pickupNote);
    setSubmitting(false);
    if (res.ok && res.reference) {
      setConfirmedRef(res.reference);
      setError(null);
    } else {
      setError(res.error || 'Could not complete booking.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-[#E8E4D9] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#111111] text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-bold">
            {confirmedRef ? 'Booking Confirmed' : 'Confirm Seat Reservation'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmedRef ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs text-[#7A766D]">Booking Reference</div>
              <div className="text-2xl font-extrabold font-mono text-[#111111] mt-0.5">{confirmedRef}</div>
              <p className="text-sm text-[#55524B] mt-2">
                {scored.route.from} → {scored.route.to} · {passengers} seat(s) ·{' '}
                <strong className="tabular-nums">{scored.trip.priceEgp * passengers} EGP</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] text-sm">
              <div className="font-bold text-[#111111]">
                {scored.route.from} → {scored.route.to}
              </div>
              <div className="text-xs text-[#6E6A61] mt-1">
                {scored.bus.name} ({scored.bus.category}) · {formatDateShort(scored.trip.date)} ·{' '}
                {formatTime12h(scored.trip.departureTime)}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Passengers (Max {scored.trip.freeSeats} free)
              </label>
              <input
                type="number"
                min={1}
                max={scored.trip.freeSeats}
                value={passengers}
                onChange={(e) => setPassengers(Math.max(1, Math.min(scored.trip.freeSeats, Number(e.target.value) || 1)))}
                className="w-full px-3.5 py-2 rounded-xl border border-[#DFDBD0] text-sm tabular-nums focus:outline-none focus:border-[#111111]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                Pickup Landmark / Note (Optional)
              </label>
              <input
                type="text"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                placeholder="e.g., Waiting near Tanta Railway Gate 2"
                className="w-full px-3.5 py-2 rounded-xl border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#ECE8DD]">
              <div>
                <div className="text-xs text-[#7A766D]">Total fare (pay at boarding)</div>
                <div className="text-xl font-extrabold text-[#111111] tabular-nums">
                  {scored.trip.priceEgp * passengers} EGP
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Booking...' : 'Confirm seat'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function RateTripModal({
  routeLabel,
  onClose,
  onSubmit,
}: {
  routeLabel: string;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-[#E8E4D9] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#111111] text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-bold">Rate your journey</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(rating, comment || 'Smooth commute');
            onClose();
          }}
          className="p-6 space-y-4"
        >
          <div className="text-sm font-semibold text-[#111111]">{routeLabel}</div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="p-1 cursor-pointer"
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={`w-7 h-7 ${
                    star <= rating ? 'fill-[#FACC15] text-[#FACC15]' : 'text-[#D4CFC2]'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share cleanliness, driver punctuality, or traffic notes..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm cursor-pointer"
          >
            Submit review
          </button>
        </form>
      </div>
    </div>
  );
}
