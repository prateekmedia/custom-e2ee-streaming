import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000

// Enable CORS for all requests
app.use(cors())

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')))

// Serve output files (encrypted videos)
app.use('/output', express.static(path.join(__dirname, '../output')))

// Serve videos directory for input videos
app.use('/videos', express.static(path.join(__dirname, '../videos')))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Encrypted HLS Static Server'
  })
})

// List available encrypted videos
app.get('/api/videos', async (req, res) => {
  const outputDir = path.join(__dirname, '../output')
  
  try {
    // Check if output directory exists
    if (!await fs.pathExists(outputDir)) {
      return res.json({ videos: [] })
    }

    const directories = (await fs.readdir(outputDir, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(async (dirent) => {
        const dirPath = path.join(outputDir, dirent.name)
        const files = await fs.readdir(dirPath)
        
        const hasEncryptedPlaylist = files.includes('encrypted-playlist.m3u8')
        const hasMetadata = files.includes('encryption-metadata.json')
        
        let metadata = null
        if (hasMetadata) {
          try {
            const metadataPath = path.join(dirPath, 'encryption-metadata.json')
            metadata = await fs.readJSON(metadataPath)
          } catch (e) {
            console.warn(`Failed to read metadata for ${dirent.name}:`, e.message)
          }
        }
        
        return {
          name: dirent.name,
          hasEncryptedPlaylist,
          hasMetadata,
          playlistUrl: hasEncryptedPlaylist ? `/output/${dirent.name}/encrypted-playlist.m3u8` : null,
          segmentCount: metadata?.segments?.length || 0,
          created: metadata?.created || null,
          files
        }
      })
    
    const videoList = await Promise.all(directories)
    res.json({ videos: videoList })
  } catch (error) {
    console.error('Error listing videos:', error)
    res.status(500).json({ error: 'Failed to list videos' })
  }
})

// Fallback to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'))
})

app.listen(port, () => {
  console.log(`🔒 Encrypted HLS Server running at http://localhost:${port}`)
  console.log(`📁 Serving client files from: ${path.join(__dirname, '../client')}`)
  console.log(`📹 Serving output files from: ${path.join(__dirname, '../output')}`)
  console.log(`🎬 Serving input videos from: ${path.join(__dirname, '../videos')}`)
  console.log(`\n🌐 Open http://localhost:${port} to access the encrypted video player`)
})