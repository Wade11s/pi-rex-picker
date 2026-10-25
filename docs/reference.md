# Reference

Triggers, Rex calls, failure messages, and limits. Instructions live in the
[README](../README.md).

## Triggers

| Input | Condition | Result |
| --- | --- | --- |
| `@` | The `@` token holds no characters after the `@` | Rex picker |
| `Tab` | The cursor sits inside a token that starts with `@` | Rex picker |
| `/rex-pick` | Always | Rex picker |
| `ctrl+alt+r` | Always, unless rebound | Rex picker |
| `@src` | Any other `@` token | Pi's own completion |
| `@` | Rex unavailable | Pi's own completion, plus one notification |

A bare `@` opens the picker once per token. Backspacing out of the token and typing
`@` again opens it again. `Tab` always opens it.

## Files

| Path | Role |
| --- | --- |
| `src/index.ts` | Pi registration, autocomplete wrapper, `/rex-pick`, `ctrl+alt+r` |
| `src/rex.ts` | Rex process calls, app client discovery, the OSC 7 sequence |
| `src/guard.ts` | Decides when a token opens the picker |
| `test/rex.test.ts` | Unit tests, run with `node --test` |
| `.pi/extensions/pi-rex-picker.ts` | Project shim, one re-export |
| `package.json` | Package manifest, `pi.extensions` points at `src/index.ts` |

The table covers the paths you change. Regenerate the full file list with
`find . -path ./.git -prune -o -path ./.agents -prune -o -path ./docs -prune -o -type f -print`.

## Rex calls

The extension makes two calls per pick.

```
rex client ls --json
rex api call client.perform '{"client_id":"…","action":"pane.insert_path","block_id":"…","session_id":"…","origin":"cli","timeout_ms":30000}'
```

Discovery keeps the single client whose `info.kind` is `"app"`. A client without
`info`, such as the CLI's own connection, is skipped.

`pane.insert_path` takes no arguments. Rex opens its Insert Path pane, and the path the
user picks goes into the block named by `block_id`, which is the Pi block.

## Failure messages

| Message | Cause |
| --- | --- |
| `Turn on Remote Control in Rex > Settings > Rex Server` | Rex answered with status 403 |
| `No Rex app client is connected.` | No client reported `info.kind` `"app"` |
| `Found 2 connected Rex app clients (…)` | More than one app client is connected |
| `Rex file picker needs a Rex terminal: REX_SESSION and REX_BLOCK are not set, so Pi's own @ picker is used instead.` | Pi is not running inside Rex |
| `Rex did not answer` plus the CLI error | The `rex` binary is missing, or the server is down |
| `Rex returned a client list that is not JSON.` | The CLI and the app disagree on the payload |

A timeout is not a failure. It means the pane is still open, so the extension reports
nothing and Pi keeps the `@`.

## Limits

- `client.perform` caps at 30 seconds. Rex closes the call, the pane stays open, and a
  path picked later still arrives.
- Typing in the Pi prompt while the pane is open cancels the autocomplete request. Rex
  can still insert a path.
- One app client at a time.
- The path arrives as typed text, so the quoting comes from Rex. A path with spaces is
  inserted as Rex chooses to quote it.

## Rex settings

Show recently used paths sits in Rex Settings under Integrated Path Browser. It is one
app-wide value, shared by every session on the host, so this extension cannot turn it
off for Pi alone.

| Default | Value | Meaning |
| --- | --- | --- |
| `Workspace.insertPathShowsRecentPaths` | `0` | Hide recent paths |
| `Workspace.insertPathShowsRecentPaths` | absent or `1` | Show recent paths |

## Development

```bash
npm test          # node --test over test/, no network and no real rex
npm run typecheck # needs @earendil-works/pi-coding-agent and pi-tui resolvable
```

`npm test` runs on Node's built-in TypeScript stripping, so the `.ts` files need no
build step. `npm run typecheck` needs the Pi packages on disk. When developing against
a Pi install elsewhere, link them first:

```bash
PI_NM=~/.pi/agent/install/releases/1.4.0/node_modules
mkdir -p node_modules
ln -s "$PI_NM/@earendil-works" node_modules/@earendil-works
ln -s "$PI_NM/@types" node_modules/@types
```
