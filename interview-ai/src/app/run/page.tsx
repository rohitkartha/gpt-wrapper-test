"use client";
import { useState } from "react";

type Lang = "python" | "node" | "c" | "cpp" | "java";

const STARTER: Record<Lang, string> = {
  python: 'print("hello from python")\n',
  node: 'console.log("hello from node");\n',
  c: '#include <stdio.h>\nint main(){ printf("hello from C\\n"); return 0; }\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std; int main(){ cout<<"hello from C++\\n"; }\n',
  java: 'public class Main { public static void main(String[] args){ System.out.println("hello from Java"); } }\n',
};

export default function Run() {
  const [language, setLanguage] = useState<Lang>("python");
  const [code, setCode] = useState<string>(STARTER["python"]);
  const [stdin, setStdin] = useState<string>("");
  const [out, setOut] = useState<string>("");

  async function run() {
    setOut("Running…");
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, code, stdin }),
    });
    const data = await res.json();
    if (!res.ok) return setOut(`Error: ${data.error || res.status}`);
    const block = (label: string, v: string) => (v ? `\n--- ${label} ---\n${v}` : "");
    setOut(
      `exit: ${data.exitCode}${block("stdout", data.stdout)}${block("stderr", data.stderr)}${
        data.timedOut ? "\n(timed out)" : ""
      }`
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl p-4 space-y-3">
        <h1 className="text-2xl font-semibold">Multi-Lang Sandbox</h1>

        <div className="flex gap-2 items-center">
          <select
            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
            value={language}
            onChange={(e) => {
              const lang = e.target.value as Lang;
              setLanguage(lang);
              setCode(STARTER[lang]);
            }}
          >
            <option value="python">Python 3.11</option>
            <option value="node">Node 20 (JS)</option>
            <option value="c">C (gcc)</option>
            <option value="cpp">C++ (g++)</option>
            <option value="java">Java 21</option>
          </select>
          <button onClick={run} className="px-3 py-1 rounded bg-blue-600">Run</button>
        </div>

        <textarea
          className="w-full h-64 bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-sm"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <textarea
            className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded p-2 font-mono text-sm"
            placeholder="stdin (optional)"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            spellCheck={false}
          />
          <pre className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded p-2 overflow-auto text-sm whitespace-pre-wrap break-words">
            {out}
          </pre>
        </div>
      </div>
    </main>
  );
}
