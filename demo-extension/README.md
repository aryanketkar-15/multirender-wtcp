# MRA demo extension: a real page-rewriting attacker

A small Chrome (Manifest V3) extension for the demo. It stands in for malware or a hostile browser
extension: once armed, it rewrites the consent notice's disclosure paragraph in your browser 1.5
seconds after the notice appears. The server's record is untouched. The browser's attestation
describes the rewritten text, so the independent verifier reports `DIGEST_MISMATCH` and names the
paragraph.

It runs only on `http://localhost:5173/consent` and `/demo` (and the `127.0.0.1` equivalents).

## Install (once)

1. Open `chrome://extensions` in Chrome or Edge and turn on **Developer mode**.
2. Choose **Load unpacked** and select this `demo-extension` folder.
3. Pin the extension to the toolbar so you can see its badge.

## Use in the demo

1. Open the live demo at `http://localhost:5173/demo` and sign in. Do the honest run first.
2. Click the extension's toolbar icon (or open its options page and press **Arm the attack**). A red **ON** badge means it is armed.
3. Reload `/demo`. A moment after the notice appears, its first paragraph changes by itself.
4. Tick the box and accept. The verifier flags the change.
5. Click the icon again to disarm.

Remove the extension from `chrome://extensions` when you are done. It does nothing outside the
local demo pages, but it is an attack tool and should not stay installed.
