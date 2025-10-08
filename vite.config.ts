import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export default defineConfig(({ mode }) => ({
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
  esbuild: {
    // Development: Keep all console logs for debugging
    // Production: Remove ALL console logs to prevent sensitive data exposure
    ...(mode === 'production' && {
      drop: ['console', 'debugger'],
    }),
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [
    {
      name: 'remove-debug-production',
      transform(code, id) {
        // Remove debug code in production builds
        if (mode === 'production' && id.includes('config/debug')) {
          return {
            code: `
              export const DEBUG = {
                ENCRYPTION: false,
                STORAGE: false,
                API_CALLS: false,
                GENERAL: false
              };
              export const safeLog = {
                apiKey: () => {},
                settings: () => {}
              };
            `,
            map: null
          };
        }
      }
    },
    {
      name: 'remove-cdn-references',
      renderChunk(code, chunk) {
        // Remove CDN references from bundled code to comply with Manifest V3
        // This runs after bundling, so it catches minified code too
        if (code.includes('cdnjs.cloudflare.com')) {
          // Replace the entire pdfobjectnewwindow case with an error throw
          // Handle both minified and non-minified code
          code = code.replace(
            /case\s*["']pdfobjectnewwindow["']\s*:[\s\S]*?break;/g,
            'case"pdfobjectnewwindow":throw new Error("This output mode is not supported");break;'
          );
          // Remove any remaining CDN URLs
          code = code.replace(
            /https:\/\/cdnjs\.cloudflare\.com[^"'\s]*/g,
            ''
          );
          // Remove integrity attributes that reference the CDN
          code = code.replace(
            /integrity\s*=\s*["'][^"']*sha512[^"']*["']/g,
            ''
          );
        }
        return code;
      }
    },
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
        manifest.web_accessible_resources[0].resources = ['src/offscreen/offscreen.html', 'src/offscreen/offscreen-minimal.html', 'icons/*'];
        
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
  <title>CRO Djinn Offscreen</title>
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
  <title>CRO Djinn Offscreen</title>
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
          
          // Copy extension icons (properly sized for Chrome Web Store)
          const extensionIcons = ['icon-16.png', 'icon-48.png', 'icon-128.png'];
          extensionIcons.forEach(iconFile => {
            try {
              copyFileSync(
                resolve(__dirname, `icons/${iconFile}`),
                resolve(__dirname, `dist/icons/${iconFile}`)
              );
            } catch (error) {
              console.warn(`Failed to copy icon ${iconFile}:`, error.message);
            }
          });
          
          // Copy main logo (for backwards compatibility)
          try {
            copyFileSync(
              resolve(__dirname, 'icons/CRO-Djinn Logo.png'),
              resolve(__dirname, 'dist/icons/CRO-Djinn Logo.png')
            );
          } catch (error) {
            console.warn('Failed to copy main logo:', error.message);
          }
          
          // Copy star rating images
          const starImages = ['1 Star.png', '2 star.png', '3 Star.png'];
          starImages.forEach(starImage => {
            try {
              copyFileSync(
                resolve(__dirname, `icons/${starImage}`),
                resolve(__dirname, `dist/icons/${starImage}`)
              );
            } catch (error) {
              console.warn(`Failed to copy star image ${starImage}:`, error.message);
            }
          });
        } catch (error) {
          console.warn('Failed to copy icons:', error.message);
        }
      }
    }
  ],
}));
