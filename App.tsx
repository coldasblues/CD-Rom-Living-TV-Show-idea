import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Lobby from './pages/Lobby';
import TVRoom from './pages/TVRoom';
import TapeStudio from './pages/TapeStudio';

const App: React.FC = () => {
  useEffect(() => {
    console.log("[LifeCycle] App Component Mounted");
  }, []);

  console.log("[LifeCycle] App Rendering...");

  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/tv" element={<TVRoom />} />
      <Route path="/studio" element={<TapeStudio />} />
    </Routes>
  );
};

export default App;