import React from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useEncryptedPlayer } from '@/hooks/useEncryptedPlayer';
import { Button } from '@/components/ui/button';

export const EncryptedPlayer: React.FC = () => {
  const {
    videoRef,
    error,
    loadingStatus,
    loadEncryptedFile,
    loadEncryptedPlaylist
  } = useEncryptedPlayer();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadEncryptedFile(file);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
      {/* Video Player */}
      <div className="relative w-full max-w-4xl">
        <video
          ref={videoRef}
          className="w-full aspect-video bg-black rounded-lg"
          controls
          playsInline
          autoPlay
          muted
        />
        
        {/* Loading Overlay */}
        {loadingStatus === 'loading' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="text-center text-white">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Loading encrypted video...</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-red-500 text-center">
          {error}
        </div>
      )}

      {/* Load Buttons */}
      <div className="flex gap-4 flex-wrap justify-center">
        <div className="relative">
          <input
            type="file"
            accept=".m3u8,application/vnd.apple.mpegurl"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={loadingStatus === 'loading'}
          />
          <Button
            variant="outline"
            size="lg"
            disabled={loadingStatus === 'loading'}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Load M3U8 File
          </Button>
        </div>
        
        <Button
          variant="outline" 
          size="lg"
          onClick={() => loadEncryptedPlaylist('/output/my-encrypted-video/encrypted-playlist.m3u8')}
          disabled={loadingStatus === 'loading'}
        >
          Load Sample Video
        </Button>
      </div>
    </div>
  );
};