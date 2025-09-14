# Encrypted HLS Video Streaming

A complete solution for streaming encrypted video content using ChaCha20-Poly1305 encryption. Videos are processed server-side and played in a React web client with real-time decryption.

## What's This For?

Perfect for scenarios where you need secure video streaming:
- Educational content protection
- Premium video distribution  
- Secure internal video sharing
- Research into client-side encryption

## Quick Start

### 1. Process Your Video

Put your video file in the `videos/` folder, then run:

```bash
# Convert and encrypt a video
node server/index.js process videos/your-video.mp4 my-secure-video

# Start the static file server  
node server/index.js serve
```

### 2. Watch It

```bash
# Start the React client
cd client-react
npm install
npm run dev
```

Open `http://localhost:5173`, click "Load Sample Video" and watch your encrypted video play!

## How It Works

**Server Side:**
1. FFmpeg converts your video to HLS segments (10-second chunks)
2. Each segment gets encrypted with ChaCha20-Poly1305 
3. A special M3U8 playlist stores encryption keys and nonces

**Client Side:**  
1. React app loads the encrypted playlist
2. Custom HLS.js loader decrypts segments in real-time
3. Video plays normally while being decrypted on-demand

## Project Structure

```
encrypted-hls/
├── server/                    # Video processing & encryption
│   ├── index.js              # Main CLI tool
│   ├── video-processor.js    # FFmpeg integration  
│   └── encryption.js         # ChaCha20-Poly1305 crypto
├── client-react/             # Modern React player
│   ├── src/
│   │   ├── lib/encrypted-loader.ts  # Custom HLS loader
│   │   └── components/EncryptedPlayer.tsx
├── videos/                   # Put your input videos here
└── output/                   # Encrypted videos end up here
```

## Requirements

- **Node.js 18+** 
- **FFmpeg** (for video processing)
- **Modern browser** (Chrome, Firefox, Safari)

## Security Notes

⚠️ **Important:** This is client-side decryption, which means:
- Encryption keys are visible in browser memory
- Anyone with the M3U8 file can decrypt the video
- Use HTTPS in production to prevent interception
- Consider this "obfuscation plus" rather than true DRM

For stronger security, implement server-side key management and user authentication.

## Commands Reference

```bash
# Process a video
node server/index.js process <input-file> [output-name]

# List processed videos  
node server/index.js list

# Start file server (serves encrypted content)
node server/index.js serve

# Test encryption (development)
node test-encryption.js
```

## Browser Compatibility

Works in all modern browsers. The React client uses:
- HLS.js for video streaming
- libsodium for decryption  
- Native video controls

## License

Apache-2.0

Educational and research use only. Don't use this to pirate content!