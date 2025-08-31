"use client";
import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "system"; content: string };

function stripHtml(s: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(s)) return "An error occurred (HTML response). Check server logs.";
  return s;
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextHistory = [...messages, { role: "user", content: text } as Msg];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
        signal: controller.signal,
      });
    } catch (e: any) {
      setMessages([...nextHistory, { role: "system", content: `Network error: ${e.message}` }]);
      setLoading(false);
      abortRef.current = null;
      return;
    }

    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.includes("text/html")) {
      const txt = await res.text();
      const msg =
        res.status === 429
          ? "Rate limit / quota exceeded. Add billing or enable mock mode."
          : stripHtml(txt) || `HTTP ${res.status}`;
      setMessages([...nextHistory, { role: "system", content: msg }]);
      setLoading(false);
      abortRef.current = null;
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setMessages([...nextHistory, { role: "assistant", content: acc }]);
    }

    setLoading(false);
    abortRef.current = null;
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl p-4 flex flex-col h-screen">
        <h1 className="text-xl md:text-2xl font-semibold mb-4">Interview AI — Chat MVP</h1>

        <div className="flex-1 overflow-y-auto space-y-3 border border-neutral-800 rounded-2xl p-4 bg-neutral-900">
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const isSystem = m.role === "system";
            const bubble =
              "max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap break-words break-all leading-relaxed";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={
                    isSystem
                      ? `${bubble} bg-amber-900/30 text-amber-200 border border-amber-700/40`
                      : isUser
                      ? `${bubble} bg-blue-600 text-white`
                      : `${bubble} bg-neutral-800 text-neutral-100`
                  }
                >
                  {!isUser && !isSystem && <div className="text-xs text-green-400 mb-1">Assistant</div>}
                  {isUser && <div className="text-xs text-blue-200/80 mb-1">You</div>}
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading && <div className="text-green-400 text-sm animate-pulse">Assistant is typing…</div>}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-neutral-500"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            onClick={send}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
            disabled={loading || !input.trim()}
          >
            Send
          </button>
          <button
            onClick={stop}
            className="px-4 py-2 rounded-xl border border-neutral-700 text-neutral-200 disabled:opacity-50"
            disabled={!loading}
          >
            Stop
          </button>
        </div>
      </div>
    </main>
  );
}
