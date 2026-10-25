# pi-rex-picker

Pi's `@` file picker, replaced by Rex's. Press `@` in the Pi prompt and Rex opens
Insert Path. Pick a file or folder and Rex types its path into the prompt, so the
prompt ends up with `@<path>`.

Pi keeps its own `@` list as the fallback. When Rex is missing or refuses the call,
Pi's list comes back and a notification names the reason.

## Before you start

Two conditions must hold. Otherwise the extension does nothing and Pi behaves as if
it were not installed.

- Pi runs inside a Rex terminal. Rex sets `REX_SESSION` and `REX_BLOCK` for a terminal
  it opens, and the extension reads both. Pi started anywhere else stays on its own
  picker.
- Remote Control is on in Rex, under Settings, Rex Server. Without it Rex answers
  `Rex.app is not accepting actions`, and the extension shows the same instruction
  inside Pi.

Rex's Insert Path pane also lists recent paths. That list belongs to Rex, not to this
extension, and [the reference](docs/reference.md#rex-settings) names the setting.

## Install

Install from git for every project:

```bash
pi install git:github.com/Wade11s/pi-rex-picker
```

Add `-l` to record it in the current project's `.pi/settings.json` instead of your
user settings. Append `@<ref>` to pin a tag or branch.

To install from a local clone, pass the directory:

```bash
pi install ./pi-rex-picker
```

Pi reads the extension path from `pi.extensions` in `package.json`. While you work
inside this repository, `.pi/extensions/pi-rex-picker.ts` loads it without any
install step.

## Use

Four triggers open the same picker.

- Type `@` on its own. Pi shows no list of its own, because Rex takes over.
- Press `Tab` inside an `@` token, even after you typed part of a path.
- Run `/rex-pick`.
- Press `ctrl+alt+r`.

Typing after `@` stays with Pi. `@src` and `@src/ap` filter Pi's list as usual, so Rex
only serves the bare `@` and an explicit `Tab`. A bare `@` opens the picker once.
Backspace out of the token and type `@` again to reopen it.

## Change the shortcut

The key is registered in `src/index.ts`:

```ts
pi.registerShortcut("ctrl+alt+r", { ... });
```

Replace the key id with any Pi key id, then run `/reload`. `/rex-pick` needs no
keybinding.

## Read more

- [Reference](docs/reference.md) lists the triggers, the Rex calls, the failure
  messages, and the limits.
- [Design](docs/design.md) explains why Rex inserts the path, and why the extension
  reports Pi's working directory.
- [Development](docs/reference.md#development) covers the test and typecheck commands.
