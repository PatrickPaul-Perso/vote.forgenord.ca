import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({ output: 'server', session: false, adapter: cloudflare({ imageService: 'compile', configPath: process.env.FORGENORD_WRANGLER_CONFIG || 'wrangler.jsonc' }) });
