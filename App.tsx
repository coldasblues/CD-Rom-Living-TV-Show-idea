import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Lobby from './pages/Lobby';
import TVRoom from './pages/TVRoom';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/tv" element={<TVRoom />} />
    </Routes>
  );
};

export default App;