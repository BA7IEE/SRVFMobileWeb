import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const source = env.VITE_DATA_SOURCE ?? 'unconfigured';
  if (source === 'api' || !['mock', 'unconfigured'].includes(source))
    throw new Error('真实网络传输禁止启用');
  if (command === 'build' && source === 'mock' && process.env.SRVF_EXPLICIT_BUILD !== 'mock')
    throw new Error('请显式执行 build:mock');
  if (mode === 'production' && source !== 'unconfigured') throw new Error('普通构建禁止模拟数据');
  const csp = `default-src 'self'; script-src 'self'${command === 'serve' && !isPreview ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src ${command === 'serve' && !isPreview ? "'self' ws://127.0.0.1:*" : "'none'"}; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`;
  return {
    plugins: [
      {
        name: 'srvf-local-vant-icons',
        enforce: 'pre',
        transform(code, id) {
          if (id.replaceAll('\\', '/').includes('/vant/lib/index.css')) {
            return code.replace(
              /,\s*url\(\/\/at\.alicdn\.com\/[^)]+\)\s*format\(["']woff["']\)/g,
              '',
            );
          }
        },
      },
      vue(),
    ],
    base: './',
    define: { __MOCK__: JSON.stringify(source === 'mock') },
    server: { headers: { 'Content-Security-Policy': csp } },
    preview: { headers: { 'Content-Security-Policy': csp } },
    build: { sourcemap: false, outDir: source === 'mock' ? 'dist-mock' : 'dist' },
  };
});
