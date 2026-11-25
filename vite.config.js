import { defineConfig } from 'vite';
import manifest from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [{
    name: 'app-version',
    transformIndexHtml(html) {
      return html.replace('%APP_VERSION%', manifest.version);
    },
  }],
});
