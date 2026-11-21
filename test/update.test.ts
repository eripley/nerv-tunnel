import { test, jest, expect } from "@jest/globals";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeMonitor, globalPrefix, latestUpdate } from "../src/update.js";

test("only a matching global installation can update itself", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "nerv-prefix-"));
  try {
    const root = join(tmp, "lib/node_modules/nerv-tunnel");
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(tmp, "bin"));
    await writeFile(join(root, "dist/cli.js"), "");
    expect(globalPrefix(tmp)).toBeUndefined();
    expect(globalPrefix(root)).toBeUndefined();
    await symlink(join(root, "dist/cli.js"), join(tmp, "bin/nerv"));
    expect(globalPrefix(root)).toBe(tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("reads the official latest tag and compares semantic versions", async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ name: "nerv-tunnel", version: "1.10.0" }),
    );
  await expect(latestUpdate("1.9.9", request)).resolves.toBe("1.10.0");
  expect(request).toHaveBeenCalledWith(
    "https://registry.npmjs.org/nerv-tunnel/latest",
    { signal: expect.anything() },
  );
  for (const version of ["1.9.9", "1.9.8", "1.9.9-beta.1", "--version"]) {
    request.mockResolvedValueOnce(
      Response.json({ name: "nerv-tunnel", version }),
    );
    // Consume each queued registry response before setting up the next one.
    // eslint-disable-next-line no-await-in-loop
    await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  }
  request.mockResolvedValueOnce(
    Response.json({ name: "other", version: "8.0.0" }),
  );
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  request.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
  request.mockRejectedValueOnce(new Error("offline"));
  await expect(latestUpdate("1.9.9", request)).resolves.toBeUndefined();
});

test("prompts before installing and reopens only after success", async () => {
  const system = {
    latestUpdate: jest.fn<typeof latestUpdate>().mockResolvedValue("1.2.0"),
    ask: jest.fn<() => Promise<unknown>>(),
    install: jest.fn<(prefix: string, latest: string) => void>(),
    reopen: jest.fn<(prefix: string) => void>(),
  };
  system.ask.mockResolvedValueOnce("continue");
  await expect(beforeMonitor("/fixture", system)).resolves.toBe(true);
  system.ask.mockResolvedValueOnce(undefined);
  await expect(beforeMonitor("/fixture", system)).resolves.toBe(false);
  expect(system.install).not.toHaveBeenCalled();
  system.ask.mockResolvedValue("install");
  system.install.mockImplementationOnce(() => {
    throw new Error("permission denied");
  });
  const stderr = jest.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    await expect(beforeMonitor("/fixture", system)).resolves.toBe(true);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("Update failed"),
    );
  } finally {
    stderr.mockRestore();
  }
  expect(system.reopen).not.toHaveBeenCalled();
  await expect(beforeMonitor("/fixture", system)).resolves.toBe(false);
  expect(system.install).toHaveBeenLastCalledWith("/fixture", "1.2.0");
  expect(system.reopen).toHaveBeenCalledWith("/fixture");
});

test("skips the network when update checks are disabled", async () => {
  const original = process.env.NERV_NO_UPDATE_CHECK;
  const lookup = jest.fn<typeof latestUpdate>();
  try {
    process.env.NERV_NO_UPDATE_CHECK = "1";
    await expect(
      beforeMonitor("/fixture", {
        latestUpdate: lookup,
        ask: jest.fn<() => Promise<unknown>>(),
        install: jest.fn(),
        reopen: jest.fn(),
      }),
    ).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  } finally {
    if (original === undefined) delete process.env.NERV_NO_UPDATE_CHECK;
    else process.env.NERV_NO_UPDATE_CHECK = original;
  }
});
