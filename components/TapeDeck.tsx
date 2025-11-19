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
  const imgRef = useRef<HTMLImageElement>(null);

  // Expose the capture function to the parent
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      const canvas = document.createElement('canvas');
      
      // Determine source dimensions
      let width = 1280;
      let height = 720;
      
      if (videoRef.current && videoSrc) {
        width = videoRef.current.videoWidth || 1280;
        height = videoRef.current.videoHeight || 720;
      } else if (imgRef.current && staticImageSrc) {
        width = imgRef.current.naturalWidth || 1280;
        height = imgRef.current.naturalHeight || 720;
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      // Draw source to canvas
      if (videoSrc && videoRef.current) {
          ctx.drawImage(videoRef.current, 0, 0, width, height);
      } else if (staticImageSrc && imgRef.current) {
          ctx.drawImage(imgRef.current, 0, 0, width, height);
      } else {
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