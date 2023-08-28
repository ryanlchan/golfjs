/** @type {import('vite').UserConfig} */
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: "/golfjs/",
    assetsInclude: ["**/*.png"],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                stats: resolve(__dirname, 'stats.html'),
                new: resolve(__dirname, 'new.html'),
                settings: resolve(__dirname, 'settings.html'),
            }
        }
    }
})