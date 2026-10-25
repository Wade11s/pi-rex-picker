import { spawn } from "node:child_process";

export type RexContext = { sessionId: string; blockId: string };

export type RexResult = { code: number; stdout: string; stderr: string };

export type RexRunner = (args: string[]) => Promise<RexResult>;

export type PickerOutcome = { opened: boolean; reason?: string };

export const PICKER_TIMEOUT_MS = 30_000;

export const REMOTE_CONTROL_HINT = "Turn on Remote Control in Rex > Settings > Rex Server";

const PICKER_ACTION = "pane.insert_path";
const REFUSED = /status=403|not accepting actions/i;
const TIMED_OUT = /timeout|timed out|deadline exceeded/i;
const ABORTED_CODE = 130;

const NO_CONTEXT_REASON =
	"Rex file picker needs a Rex terminal: REX_SESSION and REX_BLOCK are not set, so Pi's own @ picker is used instead.";
const CANCELLED_REASON = "Rex file picker cancelled.";

export class RexUnavailableError extends Error {
	readonly hint: string;

	constructor(message: string, hint: string) {
		super(message);
		this.name = "RexUnavailableError";
		this.hint = hint;
	}
}

export function readRexContext(env: Record<string, string | undefined>): RexContext | undefined {
	const sessionId = env.REX_SESSION?.trim();
	const blockId = env.REX_BLOCK?.trim();
	if (!sessionId || !blockId) return undefined;
	return { sessionId, blockId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appClients(payload: Record<string, unknown>): Array<{ id: string; name: string }> {
	const entries = payload.clients;
	if (!Array.isArray(entries)) {
		throw new RexUnavailableError(
			"Rex returned an unreadable client list.",
			"Check that the `rex` CLI matches the running Rex.app version.",
		);
	}

	const apps: Array<{ id: string; name: string }> = [];
	for (const entry of entries) {
		if (!isRecord(entry)) continue;
		const info = entry.info;
		if (!isRecord(info) || info.kind !== "app") continue;
		const id = entry.client_id;
		if (typeof id !== "string" || id.length === 0) continue;
		apps.push({ id, name: typeof info.name === "string" && info.name.length > 0 ? info.name : id });
	}
	return apps;
}

export async function findAppClientId(run: RexRunner): Promise<string> {
	const listing = await run(["client", "ls", "--json"]);
	if (listing.code !== 0) {
		throw new RexUnavailableError(
			"Rex did not answer `rex client ls`.",
			firstLine(listing.stderr) || "Check that Rex.app is running.",
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(listing.stdout);
	} catch {
		throw new RexUnavailableError(
			"Rex returned a client list that is not JSON.",
			"Check that the `rex` CLI matches the running Rex.app version.",
		);
	}
	if (!isRecord(parsed)) {
		throw new RexUnavailableError(
			"Rex returned a client list that is not an object.",
			"Check that the `rex` CLI matches the running Rex.app version.",
		);
	}

	const apps = appClients(parsed);
	const [only] = apps;
	if (apps.length === 1 && only !== undefined) return only.id;
	if (apps.length === 0) {
		throw new RexUnavailableError(
			"No Rex app client is connected.",
			"Open Rex.app, then try the picker again.",
		);
	}
	throw new RexUnavailableError(
		`Found ${apps.length} connected Rex app clients (${apps.map((app) => app.name).join(", ")}).`,
		"Quit the extra Rex.app windows, then try the picker again.",
	);
}

export function performArgs(clientId: string, context: RexContext): string[] {	return [
		"api",
		"call",
		"client.perform",
		JSON.stringify({
			client_id: clientId,
			action: PICKER_ACTION,
			block_id: context.blockId,
			session_id: context.sessionId,
			origin: "cli",
			timeout_ms: PICKER_TIMEOUT_MS,
		}),
	];
}

export function osc7Sequence(host: string, cwd: string): string {
	const path = cwd.startsWith("/") ? cwd : `/${cwd}`;
	return `\u001b]7;file://${host}${path}\u0007`;
}

function firstLine(text: string): string {
	return (
		text
			.split("\n")
			.map((line) => line.trim())
			.find((line) => line.length > 0) ?? ""
	);
}

function outcomeFromCall(result: RexResult): PickerOutcome {
	const said = `${result.stdout}\n${result.stderr}`;
	if (REFUSED.test(said)) return { opened: false, reason: REMOTE_CONTROL_HINT };
	if (result.code === 0) return { opened: true };
	if (TIMED_OUT.test(said)) return { opened: true };

	const detail = firstLine(result.stderr) || firstLine(result.stdout);
	return {
		opened: false,
		reason: detail ? `Rex file picker failed: ${detail}` : `Rex file picker failed (exit code ${result.code}).`,
	};
}

function describeError(error: unknown): string {
	if (error instanceof RexUnavailableError) return `${error.message} ${error.hint}`;
	if (error instanceof Error) return `Rex file picker failed: ${error.message}`;
	return "Rex file picker failed.";
}

export async function openRexPicker(opts: {
	context: RexContext | undefined;
	run: RexRunner;
	signal?: AbortSignal;
}): Promise<PickerOutcome> {
	const { context, run, signal } = opts;
	if (!context) return { opened: false, reason: NO_CONTEXT_REASON };
	if (signal?.aborted) return { opened: false, reason: CANCELLED_REASON };

	try {
		const clientId = await findAppClientId(run);
		if (signal?.aborted) return { opened: false, reason: CANCELLED_REASON };
		const result = await run(performArgs(clientId, context));
		if (signal?.aborted) return { opened: false, reason: CANCELLED_REASON };
		return outcomeFromCall(result);
	} catch (error) {
		return { opened: false, reason: describeError(error) };
	}
}

export function createRexRunner(signal?: AbortSignal): RexRunner {
	return (args) =>
		new Promise<RexResult>((resolve) => {
			if (signal?.aborted) {
				resolve({ code: ABORTED_CODE, stdout: "", stderr: "aborted" });
				return;
			}

			const child = spawn("rex", args, {
				stdio: ["ignore", "pipe", "pipe"],
				...(signal ? { signal } : {}),
			});

			let stdout = "";
			let stderr = "";
			let settled = false;

			const settle = (result: RexResult) => {
				if (settled) return;
				settled = true;
				resolve(result);
			};

			child.stdout?.setEncoding("utf8");
			child.stderr?.setEncoding("utf8");
			child.stdout?.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr?.on("data", (chunk: string) => {
				stderr += chunk;
			});
			child.on("error", (error: Error) => {
				settle({
					code: signal?.aborted ? ABORTED_CODE : 127,
					stdout,
					stderr: stderr.length > 0 ? stderr : error.message,
				});
			});
			child.on("close", (code) => {
				settle({
					code: signal?.aborted ? ABORTED_CODE : (code ?? 1),
					stdout,
					stderr,
				});
			});
		});
}
