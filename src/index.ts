import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { hostname } from "node:os";
import { PickGuard } from "./guard.ts";
import { createRexRunner, openRexPicker, osc7Sequence, readRexContext } from "./rex.ts";

const OPEN_FAILED = "Rex file picker did not open.";

// Rex's Insert Path pane opens at the directory the terminal last reported. A TUI
// does not report one, so the pane would fall back to its own default instead of
// the project. OSC 7 is the sequence Rex reads, and it must be emitted while the
// picker is being requested, not only at startup.
export function reportCwd(write: (data: string) => void, cwd: string, host: string = hostname()): void {
	write(osc7Sequence(host, cwd));
}

export default function rexFilePicker(pi: ExtensionAPI): void {
	let session: ExtensionContext | undefined;
	let registered = false;
	let healed = false;
	const guard = new PickGuard();
	let notifiedAt: string | undefined;

	const rexAvailable = (): boolean => readRexContext(process.env) !== undefined;

	const ensureWrapper = (ctx: ExtensionContext): void => {
		if (registered) return;
		registered = true;
		ctx.ui.addAutocompleteProvider(wrap);
	};

	const pick = async (ctx: ExtensionContext): Promise<void> => {
		reportCwd((data) => process.stdout.write(data), process.cwd());
		const result = await openRexPicker({ context: readRexContext(process.env), run: createRexRunner() });
		if (!result.opened) ctx.ui.notify(result.reason ?? OPEN_FAILED, "error");
	};

	pi.registerCommand("rex-pick", {
		description: "Insert a file path with Rex's file picker",
		handler: async (_args, ctx) => {
			await pick(ctx);
		},
	});

	pi.registerShortcut("ctrl+alt+r", {
		description: "Insert a file path with Rex's file picker",
		handler: async (ctx) => {
			await pick(ctx);
		},
	});

	const wrap = (current: AutocompleteProvider): AutocompleteProvider => ({
		triggerCharacters: current.triggerCharacters,

		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			if (!guard.shouldOpen(line, cursorCol, options.force === true)) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}
			if (options.signal.aborted) return null;

			const position = `${cursorLine}:${cursorCol}`;

			reportCwd((data) => process.stdout.write(data), process.cwd());
			const result = await openRexPicker({
				context: readRexContext(process.env),
				run: createRexRunner(options.signal),
				signal: options.signal,
			});

			if (result.opened) return null;
			guard.failed();
			if (options.signal.aborted) return null;

			if (position !== notifiedAt) {
				notifiedAt = position;
				session?.ui.notify(result.reason ?? OPEN_FAILED, "error");
			}
			return current.getSuggestions(lines, cursorLine, cursorCol, options);
		},

		applyCompletion(lines, cursorLine, cursorCol, item: AutocompleteItem, prefix: string) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	});

	pi.on("session_start", (_event, ctx) => {
		session = ctx;
		registered = false;
		healed = false;
		guard.reset();
		if (ctx.mode !== "tui" || !rexAvailable()) return;
		// Pi 1.4.0 drops autocomplete wrappers added while session_start is still
		// dispatching; a 0 ms timer lands after the editor is wired. A microtask is
		// still too early, so this cannot be queueMicrotask.
		setTimeout(() => ensureWrapper(ctx), 0);
	});

	pi.on("agent_start", (_event, ctx) => {
		if (healed || ctx.mode !== "tui" || !rexAvailable()) return;
		healed = true;
		registered = false;
		ensureWrapper(ctx);
	});

	pi.on("session_shutdown", () => {
		session = undefined;
		registered = false;
		healed = false;
		guard.reset();
		notifiedAt = undefined;
	});
}
