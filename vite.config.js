/** @type {import('vite').UserConfig} */
import { resolve } from 'path';
import { defineConfig } from 'vite';
import json from '@rollup/plugin-json';

export default defineConfig({
    base: "/golfjs/",
    assetsInclude: ["**/*.png", "static/js/courses.json"],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                stats: resolve(__dirname, 'stats.html'),
                new: resolve(__dirname, 'new.html'),
            },
            plugins: [json()]
        }
    }
})