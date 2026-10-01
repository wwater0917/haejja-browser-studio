import { defineConfig } from 'vite';
export default defineConfig({server:{proxy:{'/api/food':'http://127.0.0.1:8768','/food-media':'http://127.0.0.1:8768'}},build:{rollupOptions:{input:{main:'index.html',manual:'manual.html',food:'food.html'}}}});
