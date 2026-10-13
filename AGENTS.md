# futti-league-helper

Expo / React Native app (Expo Router, TypeScript strict, React Compiler). Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Do not add AI attribution to commits or pull requests, including AI `Co-Authored-By` trailers or generated-by signatures. Preserve genuine human attribution.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.
- Stack-specific template standards apply only when the project uses that stack.


## Expo has changed - do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json` (currently 57).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt, an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Package manager: npm (`package-lock.json`).

```bash
npx expo install <package>  # ALWAYS use instead of npm add: resolves SDK-compatible versions
npm start                   # start the dev server (expo start)
npm run ios                 # dev server, open iOS simulator
npm run android             # dev server, open Android emulator
npm run web                 # dev server, web
npm run lint                # lint (expo lint)
npx tsc --noEmit            # typecheck
npm test                    # unit tests (jest-expo)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

- Tests are a gate for logic-bearing work: `npm test` must pass. Rule and storage logic stays in pure functions so it can be tested.
- `expo-env.d.ts` is generated (gitignored); if typecheck reports missing CSS module types on a fresh clone, run `npx expo start` once to create it.
- No combined `Verify` command or GitHub workflow exists. Run `/ci` if you want one.
- Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/`: every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Path aliases: `@/*` maps to `src/*`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`). Run as `npx eas-cli@latest <command>`.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand; configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
