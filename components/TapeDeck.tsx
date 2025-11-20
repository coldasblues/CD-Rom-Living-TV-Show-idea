import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface TapeDeckProps {
  videoSrc: string | null;
  staticImageSrc: string | null; // Loaded tape frames
  onEnded: () => void;
  isProcessing: boolean;
  loop?: boolean; // New prop for static noise
}

export interface TapeDeckHandle {
  captureFrame: () => string | null;
}

const TapeDeck = forwardRef<TapeDeckHandle, TapeDeckProps>(({ videoSrc, staticImageSrc, onEnded, isProcessing, loop = false }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Expose the capture function to the parent
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      const canvas = document.createElement('canvas');
      
      // Determine source dimensions
      let width = 1280;
      let height = 720;
      
      // Prioritize video dimensions if available
      if (videoRef.current && videoSrc) {
        if (videoRef.current.videoWidth) width = videoRef.current.videoWidth;
        if (videoRef.current.videoHeight) height = videoRef.current.videoHeight;
      } else if (imgRef.current && staticImageSrc) {
        if (imgRef.current.naturalWidth) width = imgRef.current.naturalWidth;
        if (imgRef.current.naturalHeight) height = imgRef.current.naturalHeight;
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      // Draw source to canvas
      try {
        if (videoSrc && videoRef.current) {
            ctx.drawImage(videoRef.current, 0, 0, width, height);
        } else if (staticImageSrc && imgRef.current) {
            ctx.drawImage(imgRef.current, 0, 0, width, height);
        } else {
            return null;
        }
      } catch (e) {
        console.error("Frame capture failed:", e);
        return null;
      }
      
      // Return Base64 without the data URL prefix
      return canvas.toDataURL('image/png').split(',')[1];
    }
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    // When using the `src` attribute directly on the video tag, 
    // the browser handles loading automatically. 
    // We explicitly trigger play to ensure autoplay works after a source switch.
    const attemptPlay = async () => {
      try {
        // Reset time to 0 to ensure full playback on loop/restart
        if (loop) video.currentTime = 0; 
        await video.play();
      } catch (error: any) {
        // "AbortError" is expected when the source changes rapidly (e.g. switching to static).
        // We ignore it to prevent console noise.
        if (error.name !== 'AbortError') {
          console.warn("Autoplay blocked or failed:", error);
        }
      }
    };

    attemptPlay();
  }, [videoSrc, loop]);

  return (
    <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden border-b-2 border-gray-800 group">
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          className={`w-full h-full object-cover ${isProcessing && !loop ? 'opacity-50 grayscale' : 'opacity-100 filter-none'} transition-all duration-1000`}
          crossOrigin="anonymous"
          playsInline
          onEnded={onEnded}
          loop={loop}
          muted={isProcessing} // Only mute if processing (static noise), allow audio for looping content
          autoPlay
        >
          {/* Using src on parent video tag prevents race conditions with <source> tags */}
          Your browser does not support the video tag.
        </video>
      ) : staticImageSrc ? (
         // Display loaded tape frame
         <img 
            ref={imgRef}
            src={staticImageSrc} 
            className={`w-full h-full object-cover ${isProcessing ? 'opacity-50 grayscale' : 'opacity-100'} transition-all duration-1000`}
            alt="Tape Frame"
         />
      ) : (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gray-950">
           <div className="w-full h-full bg-[radial-gradient(circle,rgba(30,30,30,1)_0%,rgba(0,0,0,1)_100%)] flex items-center justify-center">
              <span className="animate-pulse text-green-700 tracking-widest text-2xl">NO SIGNAL</span>
           </div>
        </div>
      )}
      
      {/* "REC" indicator overlaid on video */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20 pointer-events-none">
         <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-red-600 animate-pulse' : 'bg-green-600'} shadow-[0_0_10px_red]`}></div>
         <span className="text-xs text-white/80 font-bold tracking-widest drop-shadow-md">
            {isProcessing ? 'TUNING...' : 'PLAY'}
         </span>
      </div>
    </div>
  );
});

TapeDeck.displayName = "TapeDeck";
export default TapeDeck;