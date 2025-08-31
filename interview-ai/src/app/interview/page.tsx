"use client";
import { useEffect, useRef, useState } from "react";

type Lang = "python" | "node" | "c" | "cpp" | "java";
type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const STARTER: Record<Lang, string> = {
  python: 'print("hello from python")\n',
  node: 'console.log("hello from node");\n',
  c: '#include <stdio.h>\nint main(){ printf("hello from C\\n"); return 0; }\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std; int main(){ cout<<"hello from C++\\n"; }\n',
  java: 'public class Main { public static void main(String[] args){ System.out.println("hello from Java"); } }\n',
};

export default function Interview() {
  // --- layout (resizable) ---
  const [split, setSplit] = useState(50); // % width for chat on desktop
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = window.innerWidth;
      const next = Math.min(75, Math.max(25, (e.clientX / w) * 100));
      setSplit(next);
    };
    const onUp = () => (dragging.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // --- chat state ---
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: "You are a helpful coding assistant." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const next = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setSending(true);
  
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
  
      // Try JSON first; if it fails, fall back to text.
      let replyText = "";
      const ct = res.headers.get("content-type") || "";
  
      if (ct.includes("application/json")) {
        const data = await res.json();
        replyText =
          data?.message?.content ??
          data?.choices?.[0]?.message?.content ??
          data?.text ??
          JSON.stringify(data);
      } else {
        replyText = await res.text();
      }
  
      setMessages([...next, { role: "assistant", content: String(replyText) }]);
    } catch (e: any) {
      setMessages([
        ...next,
        { role: "assistant", content: `Error: ${e?.message || e}` },
      ]);
    } finally {
      setSending(false);
    }
  }
  
  // --- sandbox state ---
  const [language, setLanguage] = useState<Lang>("python");
  const [code, setCode] = useState<string>(STARTER["python"]);
  const [stdin, setStdin] = useState<string>("");
  const [out, setOut] = useState<string>("");

  async function runCode() {
    setOut("Running…");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code, stdin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOut(`Error: ${data.error || res.status}`);
        return;
      }
      const block = (label: string, v: string) =>
        v ? `\n--- ${label} ---\n${v}` : "";
      setOut(
        `exit: ${data.exitCode}${block("stdout", data.stdout)}${block(
          "stderr",
          data.stderr
        )}${data.timedOut ? "\n(timed out)" : ""}`
      );
    } catch (e: any) {
      setOut(`Error: ${e?.message || e}`);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg md:text-xl font-semibold">Interview Workspace</h1>
        <div className="text-xs text-neutral-400">
          Chat + Sandbox (network disabled in runner)
        </div>
      </div>

      {/* Desktop: side-by-side with draggable divider; Mobile: stacked */}
      <div className="hidden md:block">
        <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
          <div
            className="absolute top-0 left-0 h-full border-r border-neutral-800"
            style={{ width: `${split}%` }}
          >
            <ChatPane
              messages={messages}
              input={input}
              setInput={setInput}
              sending={sending}
              onSend={sendMessage}
            />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={() => (dragging.current = true)}
            className="absolute top-0"
            style={{ left: `${split}%`, width: 6, cursor: "col-resize", height: "100%" }}
          >
            <div className="w-[2px] h-full bg-neutral-800 mx-auto" />
          </div>

          {/* Right pane */}
          <div
            className="absolute top-0 right-0 h-full"
            style={{ left: `calc(${split}% + 6px)` }}
          >
            <SandboxPane
              language={language}
              setLanguage={(l) => {
                setLanguage(l);
                setCode(STARTER[l]);
              }}
              code={code}
              setCode={setCode}
              stdin={stdin}
              setStdin={setStdin}
              out={out}
              runCode={runCode}
            />
          </div>
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden grid gap-3 p-3">
        <section className="rounded-xl border border-neutral-800 overflow-hidden">
          <ChatPane
            messages={messages}
            input={input}
            setInput={setInput}
            sending={sending}
            onSend={sendMessage}
          />
        </section>
        <section className="rounded-xl border border-neutral-800 overflow-hidden">
          <SandboxPane
            language={language}
            setLanguage={(l) => {
              setLanguage(l);
              setCode(STARTER[l]);
            }}
            code={code}
            setCode={setCode}
            stdin={stdin}
            setStdin={setStdin}
            out={out}
            runCode={runCode}
          />
        </section>
      </div>
    </main>
  );
}

// --- Components ---

function ChatPane(props: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  onSend: () => void;
}) {
  const { messages, input, setInput, sending, onSend } = props;
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  return (
    <section className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
        <div className="font-medium">Chat</div>
        <div className="text-xs text-neutral-500">/api/chat</div>
      </div>
      <div ref={scroller} className="flex-1 overflow-auto p-4 space-y-3">
        {messages
          .filter((m) => m.role !== "system")
          .map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "bg-neutral-900 border border-neutral-800 rounded-xl p-3"
                  : "bg-neutral-950 border border-neutral-800 rounded-xl p-3"
              }
            >
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                {m.role}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
        {messages.filter((m) => m.role !== "system").length === 0 && (
          <div className="text-neutral-500 text-sm">
            Start the conversation—ask for a solution, hints, or code review.
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="p-3 border-t border-neutral-800 bg-neutral-950"
      >
        <div className="flex gap-2">
          <input
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
            placeholder="Message the assistant…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 rounded-lg bg-blue-600 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

function SandboxPane(props: {
  language: Lang;
  setLanguage: (v: Lang) => void;
  code: string;
  setCode: (v: string) => void;
  stdin: string;
  setStdin: (v: string) => void;
  out: string;
  runCode: () => void;
}) {
  const {
    language,
    setLanguage,
    code,
    setCode,
    stdin,
    setStdin,
    out,
    runCode,
  } = props;

  return (
    <section className="h-full flex flex-col border-l border-neutral-800">
      <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-3 bg-neutral-950">
        <div className="font-medium">Sandbox</div>
        <span className="text-xs text-neutral-500">/api/run</span>
        <select
          className="ml-auto bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Lang)}
        >
          <option value="python">Python 3.11</option>
          <option value="node">Node 20 (JS)</option>
          <option value="c">C (gcc)</option>
          <option value="cpp">C++ (g++)</option>
          <option value="java">Java 21</option>
        </select>
        <button onClick={runCode} className="px-3 py-1 rounded bg-blue-600">
          Run
        </button>
      </div>

      <div className="flex-1 grid grid-rows-[1fr_auto] md:grid-cols-2 md:grid-rows-1 gap-[1px] bg-neutral-800">
        <div className="bg-neutral-950 p-3">
          <textarea
            className="w-full h-full min-h-[240px] bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="bg-neutral-950 p-3 space-y-3">
          <textarea
            className="w-full h-24 bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-sm"
            placeholder="stdin (optional)"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            spellCheck={false}
          />
          <pre className="w-full h-[calc(100%-96px-0.75rem)] bg-neutral-900 border border-neutral-800 rounded p-2 overflow-auto text-sm whitespace-pre-wrap break-words">
{out}
          </pre>
        </div>
      </div>
    </section>
  );
}
