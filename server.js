import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the dist directory (created by npm run build)
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  // If dist doesn't exist yet, warn the user
  if (process.env.NODE_ENV !== 'production') {
    res.send('App is running in server mode. Run "npm run build" first, or use "npm run dev" for development.');
  } else {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`📺 Living TV Server running on http://localhost:${PORT}`);
});