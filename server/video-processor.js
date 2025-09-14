import { spawn } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { encryptHLSSegments, generateCustomM3U8 } from './encryption.js'

export class VideoProcessor {
  constructor() {
    this.outputDir = path.join(process.cwd(), 'output')
  }

  async ensureOutputDir() {
    await fs.ensureDir(this.outputDir)
  }

  async convertToHLS(inputVideo, outputName = 'stream') {
    await this.ensureOutputDir()
    
    const outputDir = path.join(this.outputDir, outputName)
    await fs.ensureDir(outputDir)
    
    const outputPlaylist = path.join(outputDir, 'playlist.m3u8')
    const segmentPattern = path.join(outputDir, 'segment%04d.ts')

    console.log(`Converting ${inputVideo} to HLS format...`)

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputVideo,
        '-codec', 'copy',
        '-start_number', '0',
        '-hls_time', '10',
        '-hls_list_size', '0',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        '-f', 'hls',
        outputPlaylist
      ]

      const ffmpeg = spawn('ffmpeg', ffmpegArgs)
      
      ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`)
      })

      ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg stderr: ${data}`)
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('Video conversion completed successfully')
          resolve({
            outputDir,
            playlistPath: outputPlaylist,
            segmentPattern
          })
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`))
        }
      })

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`))
      })
    })
  }

  async convertToHLSMultiBitrate(inputVideo, outputName = 'stream') {
    await this.ensureOutputDir()
    
    const outputDir = path.join(this.outputDir, outputName)
    await fs.ensureDir(outputDir)
    
    const masterPlaylist = path.join(outputDir, 'master.m3u8')

    console.log(`Converting ${inputVideo} to multi-bitrate HLS format...`)

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputVideo,
        '-filter_complex', '[0:v]split=3[v1][v2][v3]; [v1]scale=w=1920:h=1080[v1out]; [v2]scale=w=1280:h=720[v2out]; [v3]scale=w=854:h=480[v3out]',
        '-map', '[v1out]', '-c:v:0', 'libx264', '-b:v:0', '5000k', '-maxrate:v:0', '5350k',
        '-map', '[v2out]', '-c:v:1', 'libx264', '-b:v:1', '2800k', '-maxrate:v:1', '2996k',
        '-map', '[v3out]', '-c:v:2', 'libx264', '-b:v:2', '1400k', '-maxrate:v:2', '1498k',
        '-f', 'hls',
        '-hls_time', '10',
        '-hls_playlist_type', 'vod',
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', path.join(outputDir, 'stream_%v/data%04d.ts'),
        '-master_pl_name', 'master.m3u8',
        '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2',
        path.join(outputDir, 'stream_%v/playlist.m3u8')
      ]

      const ffmpeg = spawn('ffmpeg', ffmpegArgs)
      
      ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`)
      })

      ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg stderr: ${data}`)
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('Multi-bitrate video conversion completed successfully')
          resolve({
            outputDir,
            masterPlaylist
          })
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`))
        }
      })

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`))
      })
    })
  }

  async processAndEncryptVideo(inputVideo, outputName = 'encrypted-stream') {
    try {
      // Step 1: Convert to HLS
      console.log('Step 1: Converting video to HLS format...')
      const { outputDir } = await this.convertToHLS(inputVideo, outputName)
      
      // Step 2: Encrypt segments
      console.log('Step 2: Encrypting HLS segments...')
      const { masterKey, encryptedSegments } = await encryptHLSSegments(outputDir)
      
      // Step 3: Generate custom encrypted M3U8
      console.log('Step 3: Generating encrypted playlist...')
      const encryptedPlaylist = generateCustomM3U8(encryptedSegments, masterKey)
      
      const encryptedPlaylistPath = path.join(outputDir, 'encrypted-playlist.m3u8')
      await fs.writeFile(encryptedPlaylistPath, encryptedPlaylist)
      
      // Step 4: Save encryption metadata
      const metadataPath = path.join(outputDir, 'encryption-metadata.json')
      const metadata = {
        masterKey: masterKey.toString('base64'),
        segments: encryptedSegments,
        algorithm: 'chacha20-poly1305',
        created: new Date().toISOString()
      }
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
      
      console.log('Video processing and encryption completed successfully!')
      console.log(`Encrypted playlist: ${encryptedPlaylistPath}`)
      console.log(`Encryption metadata: ${metadataPath}`)
      
      return {
        outputDir,
        encryptedPlaylistPath,
        metadataPath,
        masterKey: masterKey.toString('base64'),
        segmentCount: encryptedSegments.length
      }
      
    } catch (error) {
      console.error('Error processing video:', error.message)
      throw error
    }
  }
}

// CLI usage
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  const inputVideo = process.argv[2]
  const outputName = process.argv[3] || 'encrypted-stream'
  
  if (!inputVideo) {
    console.error('Usage: node video-processor.js <input-video> [output-name]')
    process.exit(1)
  }
  
  const processor = new VideoProcessor()
  processor.processAndEncryptVideo(inputVideo, outputName)
    .then((result) => {
      console.log('Processing complete:', result)
    })
    .catch((error) => {
      console.error('Processing failed:', error)
      process.exit(1)
    })
}