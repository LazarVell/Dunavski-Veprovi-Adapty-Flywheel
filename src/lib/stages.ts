/**
 * Signal is built but not part of the presented product. While this is false it is out of the navigation,
 * the ring and the home page, and /signal is a 404. Set it to true to bring the stage back.
 */
export const SIGNAL_ENABLED: boolean = false;

const ALL_STAGES = [
  { href: "/insights", n: 1, name: "Insights", job: "Who pays, and why" },
  { href: "/studio", n: 2, name: "Creative Studio", job: "Ads for the users who pay" },
  { href: "/funding", n: 3, name: "Funding", job: "Pay for it with Adapty Finance" },
  { href: "/watch", n: 4, name: "Watch", job: "Did those users pay?" },
  { href: "/signal", n: 5, name: "Signal", job: "Teach the ad platforms who pays" },
] as const;

export const STAGES = ALL_STAGES.filter((s) => SIGNAL_ENABLED || s.href !== "/signal");
