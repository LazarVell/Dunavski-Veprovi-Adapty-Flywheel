import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { MobileStages } from "@/components/Rail";
import { I, CHANNEL_LABEL } from "@/lib/insights";
import funding from "../../data/derived/funding.json";
import signal from "../../data/derived/signal.json";
import { usd } from "@/components/ui";

const asa = I.channels.find((c) => c.key === "apple_search_ads")!;
const tiktok = I.channels.find((c) => c.key === "tiktok_ads")!;
const unpaid = funding.unpaidGross.appStore + funding.unpaidGross.googlePlay;

const SUMMARY: Record<string, string> = {
  "/insights": `${CHANNEL_LABEL.apple_search_ads} users bring in $${asa.revPerUser.toFixed(2)} each; TikTok users $${tiktok.revPerUser.toFixed(2)}, and ${tiktok.refundRate}% of them refund.`,
  "/studio": "A campaign pack aimed at those payers: copy, banners in 12 languages, a video script, and a matching paywall drafted in Adapty.",
  "/funding": `${usd(unpaid)} of store revenue is earned but not paid out yet. Adapty Finance can advance most of it to fund the campaign.`,
  "/watch": "Follows the users the campaign brings in, and posts to Slack when they pay, refund, or the ad wears out.",
  "/signal": `Scores every install at 24 hours and tells Meta, TikTok and Google what it's worth. The top-scored fifth brings in ${signal.holdout.quintiles[4].revShare}% of revenue.`,
};

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl">
      <MobileStages />
      <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] md:text-6xl">
        Find out who pays. Make ads for those people. Fund the spend.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
        Ad tools optimize for installs. Adapty knows which users actually pay and keep paying once refunds come out, and Adapty
        Finance can advance the money. Flywheel joins those into one loop.
      </p>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {STAGES.map((s) => (
          <li key={s.href} className="bg-surface sm:last:odd:col-span-2">
            <Link href={s.href} className="flex h-full gap-4 p-6 transition-colors hover:bg-canvas">
              <span className="font-display text-4xl font-extrabold text-money">{s.n}</span>
              <span>
                <span className="block font-display text-xl font-bold">{s.name}</span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">{SUMMARY[s.href]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-3">
        Stage {STAGES.length} feeds stage 1: what the campaign&apos;s users actually pay becomes the next round of insights.
      </p>
    </div>
  );
}
