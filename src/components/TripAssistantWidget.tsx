import { useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useUniBus } from '../context/UniBusContext';
import { generateAssistantReply } from '../utils/scoring';

interface ChatMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
}

export function TripAssistantWidget({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { currentUser, trips, buses, routes, bookings, stations } = useUniBus();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: `Hi${
        currentUser ? ` ${currentUser.name.split(' ')[0]}` : ''
      }! I'm the UniBus trip assistant. I can look up upcoming trips, prices and seats, and explain how booking works. I'm a rule-based helper (no AI language model is connected), so I answer from the trips database and the FAQ.`,
    },
  ]);

  const sendPrompt = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply = generateAssistantReply(trimmed, {
      user: currentUser,
      trips,
      buses,
      routes,
      bookings,
      stations,
    });
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: trimmed },
      { id: `a-${Date.now() + 1}`, sender: 'assistant', text: reply },
    ]);
    setInput('');
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {!open ? (
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#111111] text-white text-xs font-bold shadow-lg hover:bg-[#222222] transition-colors cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-[#FACC15]" />
          <span>Ask UniBus</span>
        </button>
      ) : (
        <div className="w-[340px] sm:w-[370px] rounded-2xl bg-white border border-[#E5E0D5] shadow-2xl overflow-hidden flex flex-col max-h-[500px]">
          <div className="bg-[#111111] text-white px-4 py-3.5 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">UniBus Assistant</div>
              <div className="text-[11px] text-white/65 leading-snug mt-0.5">
                Rule-based helper · answers from live trips &amp; FAQ · no LLM connected
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggle(false)}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              aria-label="Close assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8F3] min-h-[210px] max-h-[280px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line ${
                  m.sender === 'assistant'
                    ? 'bg-white border border-[#ECE8DD] text-[#2C2A25]'
                    : 'bg-[#111111] text-white ml-8'
                }`}
              >
                <div>{m.text}</div>
                {m.sender === 'assistant' && (
                  <div className="text-[10px] font-semibold tracking-wide text-[#8E8A80] mt-2 uppercase">
                    UNIBUS ASSISTANT
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-3 pt-2.5 pb-1 bg-white border-t border-[#ECE8DD] flex items-center gap-1.5 overflow-x-auto">
            {['What trips are available?', 'How can I book a trip?', 'Cheapest fares?', 'Sabrabay stations'].map(
              (chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => sendPrompt(chip)}
                  className="px-2.5 py-1 rounded-full border border-[#E5E0D5] bg-[#FAF8F3] hover:bg-[#FACC15]/20 text-[11px] font-medium text-[#2C2A25] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {chip}
                </button>
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt(input);
            }}
            className="p-3 bg-white flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trips, prices, seats..."
              className="flex-1 px-3.5 py-2 rounded-full border border-[#DFDBD0] text-xs focus:outline-none focus:border-[#111111]"
            />
            <button
              type="submit"
              className="w-9 h-9 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
