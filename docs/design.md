# Design

Why the extension hands the picker to Rex, and why it reports Pi's working directory.

## About the path handoff

Rex owns the dialog and the insertion. The extension asks Rex to run `pane.insert_path`
against the Pi block, and Rex types the chosen path into that block. Pi then receives
the path the same way it receives typing.

The alternative is for Pi to render the picker and insert the path itself. That needs
the chosen path back as a value. Rex's client actions return nothing for this pane,
since the pane types into a terminal rather than producing data, and `client.perform`
caps at 30 seconds. Waiting for a value would mean waiting on an answer that never
arrives, and a picker that expires while the user browses.

The cost of the chosen shape is that Pi cannot see or adjust the path. If Rex quotes a
path with spaces one way, that is the text Pi gets. A pi feature that needed to inspect
the path, such as validating it against the project, would have to ask Rex differently
or read the editor text afterwards.

## About the starting directory

Rex opens Insert Path at the directory the terminal last reported. Pi is a full-screen
TUI, and a TUI sets its own screen state, so it never reports a directory. Measured
before the fix:

```
rex api call block.method {… "method": "pwd"}   →   {}
```

With no directory, the pane falls back to its own default, which is not the project.
The extension writes an OSC 7 sequence carrying Pi's working directory before each
call. The same query after the fix, on a Pi block:

```
{"pwd":"file://wadeMacBook-Air.local/Users/hwj/Desktop/SI/my-pi-extensions/pi-rex-picker",
 "owner":{"pid":49798,"name":"node"}}
```

The owner is `node`, which is the Pi process, so the report comes from the extension
and not from a shell that happened to run in that pane. The directory in that
transcript is the checkout path at the time of the measurement, before the repository
took its current name.

Whether the pane treats that directory as its root is the one part not yet proven here.
It needs a person to open the pane and look.

## About the 30 second reply

`client.perform` takes `timeout_ms`, and values above 30000 are lowered to 30000. Rex
answers when the action finishes. A person can take longer than 30 seconds to find a
file, so a timeout is normal and must not read as an error. The extension treats a
timeout as "pane still open", reports nothing, and lets Rex insert the path whenever
the pick is made. Pi's editor is free during that time, so typing cancels the
autocomplete request without closing the pane.

## About the autocomplete registration

Pi keeps autocomplete wrappers in a list, and `resetExtensionUI` clears that list and
rebuilds the provider. On Pi 1.4.0 the reset runs after `session_start` is dispatched,
so a wrapper added inside that handler is discarded without a warning. A wrapper added
from a microtask is discarded too. A wrapper added from a `setTimeout` of zero
milliseconds survives.

Measured with a probe extension that logged every call to `getSuggestions`:

```
session_start → sync wrapper added     → never called
               microtask wrapper added → never called
               timeout 0 wrapper added → called with line="@"
```

The extension therefore defers registration by one tick and listens for `agent_start`
to add a wrapper once more if a session somehow starts without one. Either wrapper
opens the pane at most once per token, because the guard lives in the extension rather
than in the provider chain.

## About recent paths

Rex shares the recent path list across every session on the host, and the setting sits
in one place for the whole app. `pane.insert_path` takes no arguments, so a call cannot
ask for a list without them. Turning the setting off is the only way to hide recent
paths, and it changes every Rex session on that machine. The extension documents the
setting instead of changing it.
