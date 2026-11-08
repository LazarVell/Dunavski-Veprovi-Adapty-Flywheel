import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile, default: { execFile } }));

import { adapty, publishFlow, unwrap } from "@/lib/adapty";

type Cb = (err: Error | null, stdout: string, stderr: string) => void;
const NOISE = " »   Warning: Could not find typescript. Please ensure that typescript is a\n »   devDependency. Falling back to compiled source.\n";
const fail = (code: number) => Object.assign(new Error("failed"), { code });

/** Answers each CLI call with what `reply` returns for its arguments. */
const cli = (reply: (argv: string[]) => [Error | null, string, string]) =>
  execFile.mockImplementation((_cmd: string, argv: string[], _opts: unknown, cb: Cb) => cb(...reply(argv)));

beforeEach(() => {
  execFile.mockReset();
});

describe("adapty", () => {
  it("returns the parsed JSON", async () => {
    cli(() => [null, '{"id":"1"}', NOISE]);
    await expect(adapty(["flows", "get", "1"])).resolves.toEqual({ id: "1" });
  });

  it("asks for JSON", async () => {
    cli(() => [null, "{}", ""]);
    await adapty(["apps", "list"]);
    expect(execFile.mock.calls[0][1]).toContain("--json");
  });

  it("shows Adapty's real error, not the TypeScript warning on stderr", async () => {
    cli(() => [fail(4), JSON.stringify({ error: { message: "Flow must be published", code: "invalid" } }), NOISE]);
    const e = (await adapty(["ab-tests", "create"]).catch((x) => x)) as Error;
    expect(e.message).toContain("Flow must be published (invalid)");
    expect(e.message).not.toContain("typescript");
  });

  it("reads the other error shapes too", async () => {
    cli(() => [fail(1), JSON.stringify({ errors: [{ detail: "Bad segment" }] }), ""]);
    await expect(adapty(["segments", "create"])).rejects.toThrow("Bad segment");
  });

  it("uses real stderr when stdout has nothing", async () => {
    cli(() => [fail(2), "", `${NOISE}Not logged in\n`]);
    const e = (await adapty(["apps", "list"]).catch((x) => x)) as Error;
    expect(e.message).toContain("Not logged in");
    expect(e.message).not.toContain("typescript");
  });

  it("falls back to whatever was printed", async () => {
    cli(() => [fail(2), "plain failure text", ""]);
    await expect(adapty(["apps", "list"])).rejects.toThrow("plain failure text");
  });

  it("includes the exit code", async () => {
    cli(() => [fail(4), "", "boom"]);
    await expect(adapty(["apps", "list"])).rejects.toMatchObject({ exitCode: 4 });
  });

  it("reports output that isn't JSON", async () => {
    cli(() => [null, "not json", ""]);
    await expect(adapty(["apps", "list"])).rejects.toThrow("output was not JSON");
  });
});

describe("publishFlow", () => {
  const statuses = (...list: string[]) => {
    const queue = [...list];
    cli((argv) => (argv.includes("publish") ? [null, '{"status":"publishing"}', ""] : [null, JSON.stringify({ id: "f", name: "n", status: queue.shift() }), ""]));
  };
  const fast = { tries: 3, everyMs: 0 };

  it("confirms the publish without a prompt, since the CLI can't ask under --json", async () => {
    statuses("published");
    await publishFlow("app", "f", fast);
    expect(execFile.mock.calls[0][1]).toContain("--yes");
  });

  it("waits until Adapty has finished", async () => {
    statuses("publishing", "publishing", "published");
    await expect(publishFlow("app", "f", fast)).resolves.toMatchObject({ status: "published" });
  });

  it("reports a failed publication", async () => {
    statuses("publication_failed");
    await expect(publishFlow("app", "f", fast)).rejects.toThrow("publication_failed");
  });

  it("gives up after its tries and says so", async () => {
    statuses("publishing", "publishing", "publishing");
    await expect(publishFlow("app", "f", fast)).rejects.toThrow("still publishing");
  });
});

describe("unwrap", () => {
  it("opens the CLI's {data} wrapper and passes through bare objects", () => {
    expect(unwrap({ data: { id: "1" } })).toEqual({ id: "1" });
    expect(unwrap({ id: "1" })).toEqual({ id: "1" });
  });
});
