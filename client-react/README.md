# React Encrypted Video Player

A clean, dark-themed React app for playing encrypted HLS video streams with real-time ChaCha20-Poly1305 decryption.

## What You Get

- **Minimal UI** - Just a video player and load button
- **Dark theme** - Easy on the eyes  
- **Auto-play** - Videos start automatically when loaded
- **File upload** - Load your own encrypted M3U8 files
- **Real-time decryption** - ChaCha20-Poly1305 decryption happens live

Built with React 19, TypeScript, Vite, and ShadCN components.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` and you're ready to go!

## How to Use

1. Click "Load M3U8 File" to upload an encrypted playlist
2. Or click "Load Sample Video" to try the demo
3. Video starts playing automatically
4. Use standard browser video controls

## Key Files

- `src/lib/encrypted-loader.ts` - Custom HLS.js loader that decrypts segments
- `src/components/EncryptedPlayer.tsx` - Main video player component  
- `src/hooks/useEncryptedPlayer.ts` - React hook managing HLS.js

## How Decryption Works

1. Upload an encrypted M3U8 playlist file
2. App extracts the encryption key and segment nonces
3. HLS.js loads video segments normally
4. Custom loader intercepts segments and decrypts them with libsodium
5. Decrypted video plays in the browser

## Browser Support

Works in all modern browsers. Uses HLS.js for video streaming and libsodium for decryption.

## Build for Production

```bash
npm run build
```

The app is totally client-side, so you can deploy the built files anywhere.

## License

Apache-2.0