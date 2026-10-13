# Fütti League Tracker

A commissioner's tool for Fütti ("footy"), a made-up sport modeled on futsal. It creates leagues, generates rosters from the game's dice charts, runs the promotion and relegation offseason, and keeps the history of players, teams and seasons. It never simulates a match: games are played on the tabletop.

The app is tablet-first (iPad and Android), runs on Windows and Mac through the web build in a browser, and stores everything locally on the device (SQLite on native, IndexedDB on web). Built with Expo and React Native.

## Commands

```bash
npm install        # install dependencies
npm start          # start the dev server
npm run ios        # dev server, open the iOS simulator
npm run android    # dev server, open the Android emulator
npm run web        # dev server, open in a browser
npm run lint       # lint
npx tsc --noEmit   # typecheck
npm test           # unit tests
```

Use `npx expo install <package>` to add dependencies so versions match the Expo SDK.

## Status

Early development. The app shell and local storage are in place; leagues, teams, rosters and the offseason are planned.
