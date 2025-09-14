import { useEffect, useRef, useState } from 'react';
import Hls, { Events, ErrorTypes } from 'hls.js';
import { EncryptedSegmentLoader } from '@/lib/encrypted-loader';

interface PlayerState {
  isLoaded: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  loadingStatus: 'idle' | 'loading' | 'loaded' | 'error';
}

interface UseEncryptedPlayerResult extends PlayerState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  loadEncryptedPlaylist: (playlistUrl: string) => Promise<void>;
  loadEncryptedFile: (file: File) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  seekRelative: (seconds: number) => void;
  setVolume: (volume: number) => void;
  destroy: () => void;
}

export const useEncryptedPlayer = (): UseEncryptedPlayerResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [state, setState] = useState<PlayerState>({
    isLoaded: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    error: null,
    loadingStatus: 'idle'
  });

  const updateState = (updates: Partial<PlayerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const initializePlayer = async () => {
    try {
      await EncryptedSegmentLoader.initialize();

      if (videoRef.current && Hls.isSupported()) {
        const hls = new Hls({
          debug: true,
          enableWorker: false,
          loader: EncryptedSegmentLoader // Pass the class, not an instance
        });

        hls.attachMedia(videoRef.current);
        hlsRef.current = hls;

        // Set up event handlers
        hls.on(Events.MEDIA_ATTACHED, () => {
          // Media attached
        });

        hls.on(Events.MANIFEST_LOADED, (_event, data) => {
          updateState({ loadingStatus: 'loaded', isLoaded: true });
          // Autoplay when manifest is loaded
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.log('Autoplay prevented by browser:', e);
            });
          }
        });

        hls.on(Events.FRAG_LOADED, (_event, data) => {
          // Fragment loaded successfully
        });

        hls.on(Events.ERROR, (_event, data) => {
          console.error('HLS Error:', data);
          
          if (data.fatal) {
            switch (data.type) {
              case ErrorTypes.NETWORK_ERROR:
                console.error('Network error, trying to recover...');
                hls.startLoad();
                break;
              case ErrorTypes.MEDIA_ERROR:
                console.error('Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.error('Fatal error, destroying HLS instance');
                updateState({ error: data.details || 'Unknown HLS error', loadingStatus: 'error' });
                break;
            }
          }
        });

        return true;
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        return true;
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Player initialization failed:', errorMessage);
      updateState({ error: errorMessage, loadingStatus: 'error' });
      return false;
    }
  };

  const loadEncryptedPlaylist = async (playlistUrl: string) => {
    updateState({ loadingStatus: 'loading', error: null });
    
    const initialized = await initializePlayer();
    if (!initialized) return;
    
    
    if (hlsRef.current) {
      hlsRef.current.loadSource(playlistUrl);
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native support
      videoRef.current.src = playlistUrl;
    }
  };

  const loadEncryptedFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    await loadEncryptedPlaylist(url);
    
    // Clean up object URL when done
    const video = videoRef.current;
    if (video) {
      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.removeEventListener('loadeddata', cleanup);
      };
      video.addEventListener('loadeddata', cleanup, { once: true });
    }
  };

  const play = async (): Promise<void> => {
    if (videoRef.current) {
      await videoRef.current.play();
    }
  };

  const pause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const seek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const seekRelative = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const setVolume = (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (videoRef.current) {
      videoRef.current.volume = clampedVolume;
    }
    updateState({ volume: clampedVolume });
  };

  const destroy = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    updateState({ isLoaded: false, loadingStatus: 'idle' });
  };

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      updateState({ 
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    };

    const handlePlay = () => {
      updateState({ isPlaying: true });
    };

    const handlePause = () => {
      updateState({ isPlaying: false });
    };

    const handleVolumeChange = () => {
      updateState({ volume: video.volume });
    };

    const handleError = () => {
      updateState({ 
        error: 'Video playback error',
        loadingStatus: 'error'
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('error', handleError);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroy();
    };
  }, []);

  return {
    ...state,
    videoRef,
    loadEncryptedPlaylist,
    loadEncryptedFile,
    play,
    pause,
    seek,
    seekRelative,
    setVolume,
    destroy
  };
};