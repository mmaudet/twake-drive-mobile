# iOS automation (Maestro)

Drive the app on the **iOS simulator** without manual reload/nav: E2E runs, and
perf iteration (trigger a sync, navigate, read the logs, start over).
Only the **OAuth login** stays manual (once per session).

## Installation (once)

```bash
./e2e/scripts/setup-ios-automation.sh
```

Installs **OpenJDK 17** (required by Maestro; the system Java is often 11) and
the **Maestro CLI**, and checks Xcode / simulators. Idempotent.

## Launch the app on the simulator

```bash
npm run ios            # build + install + launch on a booted simulator
```

Node 20 required (`nvm use`). The 1st build compiles the native code (~10-15 min);
subsequent ones are fast. Metro starts with it; its logs (including the `__DEV__`
instrumentation) come out on that process.

## Drive with Maestro

Use the wrapper — it injects JDK 17 and the PATH:

```bash
./e2e/scripts/maestro.sh test e2e/maestro/flows   # E2E suite
./e2e/scripts/maestro.sh test a-flow.yaml         # a single flow
./e2e/scripts/maestro.sh hierarchy                # inspect the view tree
```

Maestro targets elements by **visible text** (`tapOn: 'Mon Drive'`) or by point
(`tapOn: { point: "50%,45%" }`). The manual login is tagged `login` and
**excluded** from runs by default (see `config.yaml`).

## Iteration loop (perf / debug)

1. `npm run ios`, then **manual login** once (the session persists).
2. Reload the JS (new src code **or** node_modules):
   `xcrun simctl terminate booted com.linagora.twakedrive && xcrun simctl launch booted com.linagora.twakedrive`
   (Metro re-transpiles the edited files on relaunch — no need for `--clear`).
3. Drive a flow (tap a dev button, navigate…) through `maestro.sh`.
4. Screenshot: `xcrun simctl io booted screenshot out.png`.
5. Read the Metro logs, adjust, start over.

Logs tip: `Error().stack` stack traces (console) are truncated to 1 frame by
Metro symbolication; flattening them onto a single line
(`.replace(/\s*\n\s*/g, ' <<< ')`) makes the full stack readable.
