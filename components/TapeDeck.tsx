
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface TapeDeckProps {
  videoSrc: string | null;
  staticImageSrc: string | null; // New prop for loaded tape frames
  onEnded: () => void;
  isProcessing: boolean;
}

export interface TapeDeckHandle {
  captureFrame: () => string | null;
}

const TapeDeck = forwardRef<TapeDeckHandle, TapeDeckProps>(({ videoSrc, staticImageSrc, onEnded, isProcessing }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Expose the capture function to the parent
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      if (!videoRef.current) return null;
      
      // If we are currently showing a static image and no video, we might want to return that static image?
      // But generally, the loop captures from the video element.
      // If the user loaded a tape, `staticImageSrc` is valid. We can return that if video is not playing.
      
      // However, to keep it robust:
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      
      // Ensure we capture at a reasonable resolution for the API
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      // Draw video
      if (videoSrc) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else if (staticImageSrc) {
          // If video is not loaded, we can't easily draw the video element.
          // The parent should likely manage the 'lastFrame' state directly if it's from a file.
          // But if we need to recapture for some reason, this returns null currently.
          // We'll rely on the parent passing the `lastFrameBase64` into the generator if video isn't active.
          return null; 
      }
      
      // Return Base64 without the data URL prefix
      return canvas.toDataURL('image/png').split(',')[1];
    }
  }));

  useEffect(() => {
    if (videoRef.current && videoSrc) {
        videoRef.current.load();
        videoRef.current.play().catch(e => console.error("Autoplay blocked", e));
    }
  }, [videoSrc]);

  return (
    <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden border-b-2 border-gray-800 group">
      {videoSrc ? (
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isProcessing ? 'opacity-50 grayscale' : 'opacity-100 filter-none'} transition-all duration-1000`}
          crossOrigin="anonymous"
          playsInline
          onEnded={onEnded}
          loop={false} 
        >
          <source src={videoSrc} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : staticImageSrc ? (
         // Display loaded tape frame
         <img 
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
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
         <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-red-600 animate-pulse' : 'bg-green-600'} shadow-[0_0_10px_red]`}></div>
         <span className="text-xs text-white/80 font-bold tracking-widest drop-shadow-md">
            {isProcessing ? 'GENERATING...' : 'PLAY'}
         </span>
      </div>
    </div>
  );
});

TapeDeck.displayName = "TapeDeck";
export default TapeDeck;
