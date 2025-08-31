// src/app/api/run/route.ts
// Multi-language code runner using Docker (Python, Node, C, C++, Java)

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

type Language = "python" | "node" | "c" | "cpp" | "java";
type RunBody = {
  language: Language;
  code: string;
  stdin?: string;
};

const LIMIT_SECONDS = 6;     // wall-clock timeout per run
const LIMIT_MEMORY = "256m"; // Docker memory limit
const LIMIT_CPUS = "0.5";    // Docker CPU limit

function dockerArgs(language: Language, dir: string, fileBase: string): string[] {
  const mountSpec = `${dir}:/workspace:ro`;

  const common = [
    "run", "--rm",
    "--network", "none",
    "--cpus", LIMIT_CPUS,
    "--memory", LIMIT_MEMORY,
    "--pids-limit", "64",
    "--read-only",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "-v", mountSpec,
    "-w", "/workspace",
    "--user", "1000:1000",
  ];

  switch (language) {
    case "python":
      return [...common, "python:3.11-alpine", "python", `${fileBase}.py`];

    case "node":
      return [...common, "node:20-alpine", "node", `${fileBase}.js`];

    case "c":
    return [
        ...common,
        "gcc:13",
        "/bin/sh","-lc",
        // copy from read-only /workspace → /tmp, then compile/run there
        `cp /workspace/${fileBase}.c /tmp && gcc -O2 -pipe /tmp/${fileBase}.c -o /tmp/main && /tmp/main`
    ];
    
    case "cpp":
    return [
        ...common,
        "gcc:13",
        "/bin/sh","-lc",
        `cp /workspace/${fileBase}.cpp /tmp && g++ -O2 -pipe /tmp/${fileBase}.cpp -o /tmp/main && /tmp/main`
    ];
    
    case "java":
    // require: public class Main { ... }
    return [
        ...common,
        "openjdk:21-jdk-slim",
        "/bin/sh","-lc",
        `cp /workspace/Main.java /tmp && javac -d /tmp /tmp/Main.java && cd /tmp && java Main`
    ];
    
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  try {
    const { language, code, stdin }: RunBody = await req.json();

    if (!language || !["python", "node", "c", "cpp", "java"].includes(language)) {
      return json({ error: "Unsupported or missing language" }, 400);
    }
    if (!code || code.length > 300_000) {
      return json({ error: "Missing code or too large" }, 413);
    }

    // temp dir + file
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-"));
    let fileBase = "main";
    let filename = "";

    switch (language) {
      case "python": filename = `${fileBase}.py`; break;
      case "node":   filename = `${fileBase}.js`; break;
      case "c":      filename = `${fileBase}.c`; break;
      case "cpp":    filename = `${fileBase}.cpp`; break;
      case "java":
        filename = "Main.java";
        fileBase = "Main";
        break;
    }

    await fs.writeFile(path.join(dir, filename), code, "utf8");

    // run docker
    const args = dockerArgs(language, dir, fileBase);
    const proc = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

    if (stdin) proc.stdin.write(stdin);
    proc.stdin.end();

    let stdout = "", stderr = "";
    proc.stdout.on("data", d => (stdout += d.toString()));
    proc.stderr.on("data", d => (stderr += d.toString()));

    const killer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, LIMIT_SECONDS * 1000);

    const exitCode: number = await new Promise(resolve => {
      proc.on("close", code => resolve(code ?? 137));
    });

    clearTimeout(killer);
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});

    return json({
      exitCode,
      stdout,
      stderr,
      timedOut: exitCode === 137 && !stdout && !stderr,
    });
  } catch (e: any) {
    return json({ error: e?.message || "runner error" }, 500);
  }
}

export function GET() {
  return new Response("POST { language, code, stdin? } to this endpoint.", {
    headers: { "Content-Type": "text/plain" },
  });
}
