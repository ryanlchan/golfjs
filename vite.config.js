/** @type {import('vite').UserConfig} */
import { resolve } from 'path';
import { defineConfig } from 'vite';
import preact from "@preact/preset-vite";

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
    },
    plugins: [preact()],
    resolve: {
        alias: {
            react: "./node_modules/preact/compat/",
            "react-dom": "./node_modules/preact/compat/",
            assets: "/src/assets",
            components: "/src/components",
            common: "/src/common",
            hooks: "/src/hooks",
            contexts: "/src/contexts",
            services: "/src/services",
            src: "/src",
        }
    }
})