# Trojan Horse — Jarvis Satellite Setup

The **Trojan Horse** is the native mobile shell (JarvisPhone) that wraps your web app and enables always-on "Hey Jarvis" wake-word detection.

## Architecture

1. **Server (Node.js)** — Runs Porcupine wake-word detection. When it hears "Hey Jarvis", it broadcasts via WebSocket to all connected clients.
2. **Web App (mobile.html)** — Loaded inside the native app. Listens for WebSocket messages and Neural Pulse (postMessage from native shell).
3. **Native Shell (Capacitor)** — Android app that loads the web view. Can run Porcupine on-device (future) or rely on the server’s WebSocket.

## Current Flow

- **Desktop**: Server runs Porcupine → detects "Jarvis" → WebSocket → browser/mobile gets it → activates mic.
- **Mobile**: Same WebSocket flow when the phone is on the same network as the server.

## Setup

### 1. Server

```bash
npm start
```

Ensure `PICOVOICE_ACCESS_KEY` is set in `.env` (you already have it).

### 2. Capacitor URL

Edit `capacitor.config.json` and set `server.url`:

- **Android Emulator**: `http://10.0.2.2:3022/mobile.html` (10.0.2.2 = host)
- **Real device (same WiFi)**: `http://YOUR_PC_IP:3022/mobile.html` (e.g. `http://192.168.1.5:3022/mobile.html`)
- **Tunnel (ngrok)**: `https://YOUR_NGROK_URL/mobile.html` (set `cleartext: false` for https)

### 3. Run on device/emulator

```bash
npx cap sync android
npx cap open android
```

Then run the app from Android Studio.

### 4. WebSocket connection

The mobile web view connects to `ws://YOUR_SERVER/mobile.html`’s host. If you load from `http://192.168.1.5:3022/mobile.html`, the WebSocket uses `ws://192.168.1.5:3022` and the server must be reachable at that address.

## What’s done

- Server-side Porcupine wake word
- WebSocket broadcast to clients
- Neural Bridge (postMessage) for future native Porcupine
- `voice.js` supports both `voice-orb` and `mobile-voice-orb`
- Mobile voice handler sends transcript to `/api/chat` and shows response
- Capacitor Android project present
- `PICOVOICE_ACCESS_KEY` in `.env`

## Optional: Native Porcupine

The GitHub workflow installs `@picovoice/porcupine-android`. To enable on-device wake word (no server needed), add the native Porcupine plugin and wire it to send the Neural Pulse to the WebView when "Jarvis" is detected.
