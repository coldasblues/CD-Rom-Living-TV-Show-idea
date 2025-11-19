import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Google App Engine sets process.env.PORT. 
// Default to 8080 for local testing if not set.
const PORT = parseInt(process.env.PORT) || 8080;

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Basic Health Check for Load Balancers
app.get('/_ah/health', (req, res) => {
  res.status(200).send('OK');
});

// Fallback to index.html for SPA routing
// This ensures that reloading the page on a sub-route (e.g., /tv) works
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("Error sending index.html:", err);
            res.status(500).send('Server Error: Could not load application.');
        }
    });
});

app.listen(PORT, () => {
  console.log(`📺 Living TV Server running on port ${PORT}`);
});