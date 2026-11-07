/**
 * Watch: follows the campaign's users and raises alerts.
 * MOCKED: time passing. We replay Lumen's real later install cohorts (14-day outcomes) week by week
 * to stand in for "the campaign's users, a week later". Ad CTRs for fatigue are simulated.
 */
import watch from "../../data/derived/watch.json";
import { CHANNEL_LABEL, COUNTRY_NAME } from "./insights";

export const W = watch;
type Outcome = { users: number; payers: number; paidRate: number; refundRate: number; revPerUser: number };

/** The last four complete weekly cohorts, used as weeks 1-4 after launch. */
export const REPLAY_WEEKS = watch.weeks.filter((w) => w.users >= 1000).slice(-4);

export type Alert = { id: string; week: number; level: "good" | "warn" | "info"; title: string; text: string };

const sum = (os: Outcome[]) => {
  const users = os.reduce((a, o) => a + o.users, 0), payers = os.reduce((a, o) => a + o.payers, 0);
  const refunded = os.reduce((a, o) => a + Math.round((o.payers * o.refundRate) / 100), 0);
  return { users, payers, refunded, paidRate: users ? (100 * payers) / users : 0, refundRate: payers ? (100 * refunded) / payers : 0 };
};

export function weekView(i: number, channels: string[]) {
  const wk = REPLAY_WEEKS[i];
  const byCh = wk.byChannel as Record<string, Outcome>;
  const camp = sum(channels.map((c) => byCh[c]).filter(Boolean));
  return { wk, camp };
}

/** Simulated CTR per concept: the first concept starts strongest and wears out from week 3. */
export function ctrSeries(conceptIds: string[]) {
  return REPLAY_WEEKS.map((_, i) => ({
    week: `W${i + 1}`,
    ...Object.fromEntries(conceptIds.map((id, k) => [id, +(k === 0 ? [2.9, 2.8, 2.1, 1.5][i] : [2.1, 2.2, 2.15, 2.1][i] - k * 0.2).toFixed(2)])),
  }));
}

export function alertsFor(i: number, channels: string[], conceptNames: { id: string; name: string }[]): Alert[] {
  const { wk, camp } = weekView(i, channels);
  const base = watch.baseline;
  const out: Alert[] = [];
  const chNames = channels.map((c) => CHANNEL_LABEL[c] ?? c).join(" + ");

  if (camp.users) {
    const good = camp.paidRate >= base.paidRate;
    out.push({
      id: `conv-${i}`,
      week: i + 1,
      level: good ? "good" : "warn",
      title: good ? `Campaign users are converting at ${camp.paidRate.toFixed(0)}%` : `Campaign users convert below average`,
      text: `${camp.users.toLocaleString()} installs from ${chNames} in week ${i + 1}: ${camp.paidRate.toFixed(1)}% paid within 14 days vs ${base.paidRate}% for the app. Refunds ${camp.refundRate.toFixed(1)}% of payers (app: ${base.refundRate}%). ${good ? "Keep going." : "Check the targeting."}`,
    });
  }

  // Refund spikes by country: at least 2 refunds, 15+ payers, and at least twice the country's own 14-day baseline.
  const byCountry = wk.byCountry as Record<string, Outcome>;
  for (const [c, o] of Object.entries(byCountry)) {
    const b = (watch.baselineByCountry as Record<string, Outcome>)[c];
    const refunded = Math.round((o.payers * o.refundRate) / 100);
    if (o.payers >= 15 && refunded >= 2 && o.refundRate >= 2 * b.refundRate) {
      out.push({
        id: `refund-${c}-${i}`,
        week: i + 1,
        level: "warn",
        title: `Refunds are spiking in ${COUNTRY_NAME[c] ?? c}`,
        text: `${refunded} of ${o.payers} payers refunded within 14 days (${o.refundRate}%), against ${b.refundRate}% normally for ${c}. Early signal on a small group: I suggest pausing ${c} until next week's cohort confirms it.`,
      });
    }
  }

  if (i === 2 && conceptNames[0]) {
    out.push({
      id: `fatigue-${i}`,
      week: i + 1,
      level: "info",
      title: `“${conceptNames[0].name}” is wearing out`,
      text: `Click-through fell from 2.8% to 2.1% this week (simulated ad data). Rotate in the next concept.`,
    });
  }
  return out;
}
