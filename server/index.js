import { VideoProcessor } from './video-processor.js'
import fs from 'fs-extra'
import path from 'path'

console.log('🔒 Encrypted HLS Video Processing System')
console.log('=====================================')

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Usage:')
    console.log('  node server/index.js <command> [options]')
    console.log('')
    console.log('Commands:')
    console.log('  process <video-file> [output-name]  - Process and encrypt a video')
    console.log('  serve                               - Start the web server')
    console.log('  list                                - List processed videos')
    console.log('')
    console.log('Examples:')
    console.log('  node server/index.js process videos/sample.mp4 my-video')
    console.log('  node server/index.js serve')
    console.log('  node server/index.js list')
    process.exit(1)
  }

  const command = args[0]

  switch (command) {
    case 'process':
      await processVideo(args[1], args[2])
      break
    case 'serve':
      await startServer()
      break
    case 'list':
      await listVideos()
      break
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

async function processVideo(inputVideo, outputName) {
  if (!inputVideo) {
    console.error('Please specify an input video file')
    process.exit(1)
  }

  if (!await fs.pathExists(inputVideo)) {
    console.error(`Input video file not found: ${inputVideo}`)
    process.exit(1)
  }

  const processor = new VideoProcessor()
  const name = outputName || path.basename(inputVideo, path.extname(inputVideo))

  try {
    console.log(`🎬 Processing video: ${inputVideo}`)
    console.log(`📦 Output name: ${name}`)
    console.log('')

    const result = await processor.processAndEncryptVideo(inputVideo, name)
    
    console.log('')
    console.log('✅ Processing completed successfully!')
    console.log(`📁 Output directory: ${result.outputDir}`)
    console.log(`🔒 Encrypted playlist: ${result.encryptedPlaylistPath}`)
    console.log(`📊 Segments encrypted: ${result.segmentCount}`)
    console.log(`🔑 Master key: ${result.masterKey.substring(0, 20)}...`)
    console.log('')
    console.log('🌐 To play the video, start the server with:')
    console.log('   node server/index.js serve')
    
  } catch (error) {
    console.error('❌ Processing failed:', error.message)
    process.exit(1)
  }
}

async function startServer() {
  const { default: serverModule } = await import('./static-server.js')
}

async function listVideos() {
  const outputDir = path.join(process.cwd(), 'output')
  
  if (!await fs.pathExists(outputDir)) {
    console.log('📁 No output directory found. Process some videos first.')
    return
  }

  try {
    const directories = await fs.readdir(outputDir, { withFileTypes: true })
    const videos = directories.filter(dirent => dirent.isDirectory())

    if (videos.length === 0) {
      console.log('📹 No processed videos found.')
      return
    }

    console.log(`📹 Found ${videos.length} processed video(s):`)
    console.log('')

    for (const video of videos) {
      const videoDir = path.join(outputDir, video.name)
      const metadataPath = path.join(videoDir, 'encryption-metadata.json')
      const playlistPath = path.join(videoDir, 'encrypted-playlist.m3u8')
      
      console.log(`📦 ${video.name}`)
      
      if (await fs.pathExists(metadataPath)) {
        try {
          const metadata = await fs.readJSON(metadataPath)
          console.log(`   🔒 Segments: ${metadata.segments.length}`)
          console.log(`   📅 Created: ${new Date(metadata.created).toLocaleString()}`)
          console.log(`   🔑 Algorithm: ${metadata.algorithm}`)
        } catch (e) {
          console.log(`   ⚠️  Could not read metadata`)
        }
      }
      
      if (await fs.pathExists(playlistPath)) {
        console.log(`   ✅ Encrypted playlist available`)
      } else {
        console.log(`   ❌ Encrypted playlist missing`)
      }
      
      console.log('')
    }
    
    console.log('🌐 To play videos, start the server with:')
    console.log('   node server/index.js serve')
  } catch (error) {
    console.error('Error listing videos:', error.message)
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...')
  process.exit(0)
})

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})