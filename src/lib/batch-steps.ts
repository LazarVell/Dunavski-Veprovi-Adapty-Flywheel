/** Consecutive steps of the Creative Studio flow that share a group run together. */
export function batchSteps<T extends { group?: string }>(steps: T[]) {
  const out: T[][] = [];
  for (const s of steps) {
    const last = out.at(-1);
    if (s.group && last?.[0].group === s.group) last.push(s);
    else out.push([s]);
  }
  return out;
}
