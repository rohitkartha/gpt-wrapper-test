import { NextRequest } from "next/server";
import { OpenAI } from "openai";

export const runtime = "edge"; // fast and cheap

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const sys = {
      role: "system" as const,
      content:
        "You are a concise coding assistant for interview practice. Prefer brief, correct answers. When writing code, include minimal context and comments.",
    };

    const stream = await openai.chat.completions.create({
      model: process.env.MODEL_ID || "gpt-4o-mini",
      stream: true,
      temperature: 0.2,
      messages: [sys, ...(messages ?? [])],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`\n\n[error] ${err.message}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e: any) {
    return new Response(`[error] ${e.message}`, { status: 400 });
  }
}
