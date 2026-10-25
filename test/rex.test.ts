import assert from "node:assert/strict";
import test from "node:test";
import { isAtToken, PickGuard } from "../src/guard.ts";
import { reportCwd } from "../src/index.ts";
import {
	findAppClientId,
	openRexPicker,
	performArgs,
	readRexContext,
	osc7Sequence,
	RexUnavailableError,
	type RexRunner,
} from "../src/rex.ts";

const context = { sessionId: "session:01a1", blockId: "block:01a1" };

const appList = JSON.stringify({
	clients: [
		{ client_id: "client:peer", principal: { kind: "peer" } },
		{ client_id: "client:app", info: { kind: "app", name: "Rex" } },
	],
});

function runnerReturning(perform: { code: number; stdout?: string; stderr?: string }): RexRunner {
	return async (args) => {
		if (args[0] === "client" && args[1] === "ls") {
			return { code: 0, stdout: appList, stderr: "" };
		}
		return { code: perform.code, stdout: perform.stdout ?? "", stderr: perform.stderr ?? "" };
	};
}

test("missing Rex env leaves the picker inert", async () => {
	assert.equal(readRexContext({}), undefined);
	assert.equal(readRexContext({ REX_SESSION: "session:1" }), undefined);
	assert.deepEqual(readRexContext({ REX_SESSION: "session:1", REX_BLOCK: "block:2" }), {
		sessionId: "session:1",
		blockId: "block:2",
	});

	const result = await openRexPicker({
		context: undefined,
		run: async () => {
			throw new Error("rex must not run without a Rex context");
		},
	});

	assert.equal(result.opened, false);
	assert.match(result.reason ?? "", /Rex/);
});

test("performArgs targets pane.insert_path on the given block and session", () => {
	const args = performArgs("client:app", context);
	assert.deepEqual(args.slice(0, 3), ["api", "call", "client.perform"]);

	const payload = JSON.parse(args[3] ?? "");
	assert.equal(payload.action, "pane.insert_path");
	assert.equal(payload.client_id, "client:app");
	assert.equal(payload.block_id, "block:01a1");
	assert.equal(payload.session_id, "session:01a1");
	assert.equal(payload.timeout_ms, 30000);
});

test("a refused call points at Remote Control", async () => {
	const result = await openRexPicker({
		context,
		run: runnerReturning({
			code: 1,
			stderr:
				'Error: stream response "control-2" failed: Rex.app is not accepting actions. Turn on Remote Control in its Settings under Rex Server. (status=403 code=refused)',
		}),
	});

	assert.equal(result.opened, false);
	assert.match(result.reason ?? "", /Remote Control/);
});

test("a timeout means the picker is still open", async () => {
	const result = await openRexPicker({
		context,
		run: runnerReturning({ code: 1, stderr: "Error: request timed out after 30000ms" }),
	});

	assert.equal(result.opened, true);
});

test("only an app client is used, and its absence is explained", async () => {
	assert.equal(await findAppClientId(runnerReturning({ code: 0 })), "client:app");

	const noApps: RexRunner = async () => ({
		code: 0,
		stdout: JSON.stringify({ clients: [{ client_id: "client:peer", principal: { kind: "peer" } }] }),
		stderr: "",
	});
	await assert.rejects(findAppClientId(noApps), (error: unknown) => {
		assert.ok(error instanceof RexUnavailableError);
		assert.match(error.hint, /Open Rex\.app/);
		return true;
	});
});

test("the guard opens on a bare @ and leaves typed paths alone", () => {
	const guard = new PickGuard();
	assert.equal(guard.shouldOpen("@", 1, false), true);
	assert.equal(guard.shouldOpen("hi @", 4, false), true);
	assert.equal(guard.shouldOpen("@src", 4, false), false);
	assert.equal(guard.shouldOpen("mail@x", 6, false), false);
	assert.equal(guard.shouldOpen("please open @", 13, false), true);
	assert.equal(guard.shouldOpen("no at sign", 11, false), false);
	assert.equal(guard.shouldOpen("const at = 1;", 13, false), false);
	assert.equal(isAtToken("@src", 4), true);
	assert.equal(isAtToken("src", 3), false);
});

test("one picker opens per bare @, but Tab and a fresh @ still reopen", () => {
	const guard = new PickGuard();
	assert.equal(guard.shouldOpen("@", 1, false), true);
	assert.equal(guard.shouldOpen("@", 1, false), false, "a second pass at the same token must not open again");
	assert.equal(guard.shouldOpen("@", 1, true), true, "an explicit Tab reopens");

	const retyped = new PickGuard();
	assert.equal(retyped.shouldOpen("@", 1, false), true);
	assert.equal(retyped.shouldOpen("", 0, false), false, "backspacing out of the token clears the guard");
	assert.equal(retyped.shouldOpen("@", 1, false), true, "retyping @ opens again");

	const typedPath = new PickGuard();
	assert.equal(typedPath.shouldOpen("odd @", 5, false), true);
	assert.equal(typedPath.shouldOpen("odd @/tmp", 9, false), false);
	assert.equal(typedPath.shouldOpen("@", 1, false), true);
});

test("a failed pick lets the same @ retry", () => {
	const guard = new PickGuard();
	assert.equal(guard.shouldOpen("@", 1, false), true);
	guard.failed();
	assert.equal(guard.shouldOpen("@", 1, false), true);
});

test("cwd reporting uses the OSC 7 form Rex reads", () => {
	assert.equal(
		osc7Sequence("host.local", "/Users/me/project"),
		"\u001b]7;file://host.local/Users/me/project\u0007",
	);
	assert.equal(osc7Sequence("host.local", "relative"), "\u001b]7;file://host.local/relative\u0007");
	const written: string[] = [];
	reportCwd((data) => written.push(data), "/tmp/x", "h");
	assert.deepEqual(written, ["\u001b]7;file://h/tmp/x\u0007"]);
});
