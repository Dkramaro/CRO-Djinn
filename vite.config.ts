import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html',
        content: 'src/content/content.ts',
        background: 'src/background/background.ts',
        'offscreen-script': 'src/offscreen/offscreen.ts',
        'offscreen-minimal': 'src/offscreen/offscreen-minimal.js',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        manualChunks: (id) => {
          // Prevent code-splitting for background script - bundle everything together
          if (id.includes('src/background/') || id.includes('src/utils/screenshot')) {
            return 'background';
          }
          // Allow other modules to be split normally
          return null;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [
    {
      name: 'manifest-fix',
      closeBundle() {
        // Copy and fix manifest.json
        const manifestPath = resolve(__dirname, 'src/manifest.json');
        const manifestContent = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        
        // Fix paths to point to built files
        manifest.action.default_popup = 'src/popup/popup.html';
        manifest.options_page = 'src/options/options.html';
        manifest.web_accessible_resources[0].resources = ['src/offscreen/offscreen.html', 'src/offscreen/offscreen-minimal.html'];
        
        writeFileSync(resolve(__dirname, 'dist/manifest.json'), JSON.stringify(manifest, null, 2));
        
        // Copy and fix offscreen.html
        try {
          const offscreenDir = resolve(__dirname, 'dist/src/offscreen');
          mkdirSync(offscreenDir, { recursive: true });
          
          // Create corrected offscreen.html with proper script reference
          const offscreenHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CRO Genie Offscreen</title>
</head>
<body>
  <script type="module" src="../../offscreen-script.js"></script>
</body>
</html>`;
          
          writeFileSync(resolve(__dirname, 'dist/src/offscreen/offscreen.html'), offscreenHtml);
          
          // Create minimal offscreen HTML with correct script reference
          const minimalOffscreenHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CRO Genie Offscreen</title>
</head>
<body>
  <script src="../../offscreen-minimal.js"></script>
</body>
</html>`;
          
          writeFileSync(resolve(__dirname, 'dist/src/offscreen/offscreen-minimal.html'), minimalOffscreenHtml);
        } catch (error) {
          console.warn('Failed to create offscreen.html:', error.message);
        }

        // Copy icons with error handling
        try {
          const iconsDir = resolve(__dirname, 'dist/icons');
          mkdirSync(iconsDir, { recursive: true });
          
          copyFileSync(
            resolve(__dirname, 'icons/CRO-Genie Logo.png'),
            resolve(__dirname, 'dist/icons/CRO-Genie Logo.png')
          );
        } catch (error) {
          console.warn('Failed to copy icons:', error.message);
        }
      }
    }
  ],
});
