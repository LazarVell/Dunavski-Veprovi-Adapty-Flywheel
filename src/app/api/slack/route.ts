import { NextResponse } from "next/server";

/** Posts a Watch alert to Slack through an incoming webhook (SLACK_WEBHOOK_URL). */
export async function POST(req: Request) {
  const { title, text, level } = (await req.json()) as { title: string; text: string; level: "good" | "warn" | "info" };
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return NextResponse.json({ sent: false, reason: "SLACK_WEBHOOK_URL is not set" }, { status: 503 });
  const emoji = level === "good" ? ":large_green_circle:" : level === "warn" ? ":warning:" : ":information_source:";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `${emoji} *${title}*\n${text}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `${emoji} *${title}*\n${text}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Adapty Flywheel · Watch" }] },
      ],
    }),
  });
  return NextResponse.json({ sent: res.ok, status: res.status });
}
