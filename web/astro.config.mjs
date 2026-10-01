// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // better-auth keeps sessions in Postgres; the adapter's default filesystem driver
  // would also break across replicas.
  session: false,
});
