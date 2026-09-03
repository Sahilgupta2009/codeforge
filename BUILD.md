# Building CodeForge (no PC required)

CodeForge is built with Expo so it can be compiled into a real installable
APK entirely through **EAS Build**, Expo's cloud build service — no
Android Studio, no local Gradle/NDK, no PC. This works from Replit,
Termux, or any shell with Node.js and internet access.

## One-time setup

1. **Create a free Expo account** at https://expo.dev if you don't have one.

2. **Install the EAS CLI** (in your Replit/Termux shell):
   ```bash
   npm install -g eas-cli
   ```

3. **Log in:**
   ```bash
   eas login
   ```

4. **Install project dependencies** from the project root:
   ```bash
   npm install
   ```

5. **Link the project to your Expo account:**
   ```bash
   eas init
   ```
   This will print a project ID — paste it into `app.json` under
   `expo.extra.eas.projectId` and into `package.json`'s `eas.projectId`,
   replacing `REPLACE_WITH_YOUR_EAS_PROJECT_ID` in both files.

## Building an APK

```bash
eas build --platform android --profile preview
```

This uploads your source to Expo's build servers, compiles it there, and
gives you a **download link for a real `.apk`** when done (typically
10-20 minutes). You'll get a build status URL too — you can close the
shell and check back later.

Once it finishes:
- Open the link on your Android device (or scan the QR code EAS prints).
- Download the APK.
- You'll need "Install unknown apps" permission enabled for your browser
  or file manager the first time — Android will prompt you for this.

## Iterating during development

For fast iteration without a full rebuild each time (since most of
CodeForge's logic is JS, not native code), use Expo Go or a dev client:

```bash
npx expo start
```

This prints a QR code / URL. If you're testing on the **same device**
you're developing on, open `exp://127.0.0.1:8081` in the Expo Go app
(install it from the Play Store first), or use tunnel mode if Expo Go
can't reach your dev server directly:

```bash
npx expo start --tunnel
```

**Note:** some native modules used later in this project (isomorphic-git,
react-native-pdf, SAF file access) require a **custom dev client** rather
than the stock Expo Go app, since Expo Go only bundles a fixed set of
native modules. Once those parts land, use:

```bash
eas build --platform android --profile development
```

to get an installable dev-client APK, then:

```bash
npx expo start --dev-client
```

to connect to it for fast-refresh development — you'll only need to
rebuild the dev client when native dependencies change, not on every JS
edit.

## Production build (signed, for real distribution)

```bash
eas build --platform android --profile production
```

This produces an `.aab` (Android App Bundle) rather than a sideloadable
APK, matching Play Store submission requirements — EAS manages the
signing keystore for you (stored securely on Expo's servers, or you can
provide your own).

## Troubleshooting

- **Build fails on a native dependency:** check the EAS build logs (linked
  in the CLI output) — most failures at this stage are version mismatches
  between an installed package and the Expo SDK version pinned in
  `package.json`. Run `npx expo install --check` to auto-fix mismatched
  versions.
- **"projectId not found":** re-run `eas init` and make sure the ID was
  copied into both `app.json` and `package.json`.
- **App installs but crashes on launch:** run `eas build:list` to grab the
  build, then `eas build:view <id>` for the full native log — this is
  almost always a missing permission or plugin config in `app.json`.
