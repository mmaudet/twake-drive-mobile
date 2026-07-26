# Automatisation iOS (Maestro)

Piloter l'app sur le **simulateur iOS** sans reload/nav manuel : runs E2E, et
itération perf (déclencher une sync, naviguer, lire les logs, recommencer).
Seul le **login OAuth** reste manuel (une fois par session).

## Installation (une fois)

```bash
./e2e/scripts/setup-ios-automation.sh
```

Installe **OpenJDK 17** (requis par Maestro ; le Java système est souvent en
11) et la **CLI Maestro**, et vérifie Xcode / simulateurs. Idempotent.

## Lancer l'app sur le simulateur

```bash
npm run ios            # build + install + lance sur un simulateur booté
```

Node 20 requis (`nvm use`). La 1re build compile le natif (~10-15 min) ; les
suivantes sont rapides. Metro démarre avec ; ses logs (dont l'instrumentation
`__DEV__`) sortent sur ce process.

## Piloter avec Maestro

Utilise le wrapper — il injecte le JDK 17 et le PATH :

```bash
./e2e/scripts/maestro.sh test e2e/maestro/flows   # suite E2E
./e2e/scripts/maestro.sh test un-flow.yaml        # un flow
./e2e/scripts/maestro.sh hierarchy                # inspecter l'arbre de vues
```

Maestro cible les éléments par **texte visible** (`tapOn: 'Mon Drive'`) ou par
point (`tapOn: { point: "50%,45%" }`). Le login manuel est tagué `login` et
**exclu** des runs par défaut (voir `config.yaml`).

## Boucle d'itération (perf / debug)

1. `npm run ios`, puis **login manuel** une fois (la session persiste).
2. Recharger le JS (nouveau code src **ou** node_modules) :
   `xcrun simctl terminate booted com.linagora.twakedrive && xcrun simctl launch booted com.linagora.twakedrive`
   (Metro re-transpile les fichiers édités au relaunch — pas besoin de `--clear`).
3. Driver un flow (tap un bouton dev, naviguer…) via `maestro.sh`.
4. Screenshot : `xcrun simctl io booted screenshot out.png`.
5. Lire les logs Metro, ajuster, recommencer.

Astuce logs : les stack traces `Error().stack` (console) sont tronquées à 1
frame par la symbolication Metro ; les aplatir sur une ligne
(`.replace(/\s*\n\s*/g, ' <<< ')`) rend la pile complète lisible.
