import sodium from 'sodium-native'
import fs from 'fs-extra'
import path from 'path'

export class ChaChaEncryption {
  constructor() {
    this.algorithm = 'chacha20-poly1305'
  }

  generateKey() {
    const key = Buffer.alloc(sodium.crypto_aead_chacha20poly1305_ietf_KEYBYTES)
    sodium.randombytes_buf(key)
    return key
  }

  generateNonce() {
    const nonce = Buffer.alloc(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES)
    sodium.randombytes_buf(nonce)
    return nonce
  }

  encryptSegment(plaintext, key, nonce, additionalData = null) {
    const ciphertext = Buffer.alloc(plaintext.length + sodium.crypto_aead_chacha20poly1305_ietf_ABYTES)
    
    sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      ciphertext,
      plaintext,
      additionalData,
      null, // nsec (not used)
      nonce,
      key
    )
    
    return ciphertext
  }

  decryptSegment(ciphertext, key, nonce, additionalData = null) {
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_aead_chacha20poly1305_ietf_ABYTES)
    
    sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      plaintext,
      null, // nsec
      ciphertext,
      additionalData,
      nonce,
      key
    )
    
    return plaintext
  }
}

export async function encryptHLSSegments(segmentDirectory) {
  const encryption = new ChaChaEncryption()
  const masterKey = encryption.generateKey()
  const encryptedSegments = []

  console.log(`Encrypting segments in: ${segmentDirectory}`)
  
  const segments = (await fs.readdir(segmentDirectory)).filter(file => file.endsWith('.ts'))
  console.log(`Found ${segments.length} segments to encrypt`)
  
  for (const segment of segments) {
    const segmentPath = path.join(segmentDirectory, segment)
    const segmentData = await fs.readFile(segmentPath)
    const nonce = encryption.generateNonce()
    
    const encryptedData = encryption.encryptSegment(segmentData, masterKey, nonce)
    
    // Save encrypted segment
    const encryptedFilename = segment.replace('.ts', '.enc')
    const encryptedPath = path.join(segmentDirectory, encryptedFilename)
    await fs.writeFile(encryptedPath, encryptedData)
    
    encryptedSegments.push({
      original: segment,
      encrypted: encryptedFilename,
      nonce: nonce.toString('base64'),
      size: segmentData.length,
      encryptedSize: encryptedData.length
    })
    
    console.log(`Encrypted: ${segment} -> ${encryptedFilename}`)
  }

  return { masterKey, encryptedSegments }
}

export function generateCustomM3U8(encryptedSegments, masterKey, segmentDuration = 10) {
  let playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${segmentDuration}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD

#EXT-X-CUSTOM-KEY:METHOD=CHACHA20-POLY1305,URI="data:text/plain;base64,${masterKey.toString('base64')}"

`

  encryptedSegments.forEach((segment, index) => {
    playlist += `#EXTINF:${segmentDuration}.0,
#EXT-X-SEGMENT-NONCE:${segment.nonce}
${segment.encrypted}
`
  })

  playlist += '#EXT-X-ENDLIST'
  return playlist
}