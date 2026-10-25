export type GuardState = { position: string; text: string };

const AT_TOKEN = /(^|\s)@[^\s]*$/;

export function isAtToken(line: string, col: number): boolean {
	return AT_TOKEN.test(line.slice(0, col));
}

export function isBareAtToken(line: string, col: number): boolean {
	const beforeCursor = line.slice(0, col);
	const match = AT_TOKEN.exec(beforeCursor);
	if (match === null) return false;
	return match.index + match[1].length === beforeCursor.length - 1;
}

export class PickGuard {
	private opened: GuardState | undefined;

	shouldOpen(line: string, col: number, force: boolean): boolean {
		if (!isAtToken(line, col)) {
			this.opened = undefined;
			return false;
		}
		if (force) return true;
		if (!isBareAtToken(line, col)) return false;

		const beforeCursor = line.slice(0, col);
		const position = `${col}:${beforeCursor.length}`;
		if (this.opened?.position === position && this.opened.text === beforeCursor) return false;

		this.opened = { position, text: beforeCursor };
		return true;
	}

	failed(): void {
		this.opened = undefined;
	}

	reset(): void {
		this.opened = undefined;
	}
}
