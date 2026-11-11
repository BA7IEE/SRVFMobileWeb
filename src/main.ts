import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'vant/lib/index.css';
import './styles/tokens.brand.css';
import './styles/tokens.mobile.css';
import './styles/vant-theme.css';
import './styles/base.css';
import App from './App.vue';
import { initializeData } from './data';
import { router } from './app/router';
import { useAuth } from './features/auth/store';

async function bootstrap() {
  await initializeData();
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  await useAuth(pinia).restoreSession();
  app.use(router);
  await router.isReady();
  app.mount('#app');
}
void bootstrap();
