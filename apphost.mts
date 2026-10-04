// Aspire TypeScript AppHost: Astro (SSR) + better-auth + PostgreSQL.
// Run locally:   aspire run            (or `aspire start` in the background)
// Publish:       aspire publish -o out/compose
//                DEPLOY_TARGET=k8s aspire publish -o out/k8s
// Push images:   aspire do push        (after `docker login ghcr.io`; CI does this)

import { copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createBuilder, refExpr, ProbeType } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

// One AppHost publishes one resource to one environment; pick it per run.
const k8s = process.env.DEPLOY_TARGET === 'k8s';
const target = k8s
  ? await builder.addKubernetesEnvironment('k8s')
      // CI pushes the chart under this name to oci://ghcr.io/jrmatherly/matherlynet/charts (publish-images.yml).
      .withHelm({ configure: async (helm) => { await helm.withNamespace('matherlynet').withChartName('matherlynet').withChartDescription('matherlynet: Astro web app, PostgreSQL and the Aspire dashboard'); } })
  : await builder.addDockerComposeEnvironment('compose');

const ghcr = await builder.addContainerRegistry('ghcr', 'ghcr.io', { repository: 'jrmatherly/matherlynet' });
await target.withContainerRegistry(ghcr);

// Published Compose runs the Aspire dashboard (OTLP receiver + trace UI, traces include request paths). Its UI
// port would be published on all host interfaces; bind it to loopback and reach it through an SSH tunnel.
if (!k8s) {
  await target.configureDashboard(async (dashboard) => {
    await dashboard.publishAsDockerComposeService(async (_resource, service) => {
      await service.ports.clear();
      await service.ports.add('127.0.0.1:18888:18888');
    });
  });
}

// Public origin of the web app. Dev pins the web endpoint to 4321 so this default matches;
// set it to the real public URL when deploying (OAuth callbacks are built from it).
const appUrl = await builder.addParameter('app-url', { value: 'http://localhost:4321', publishValueAsDefault: false });
const authSecret = await builder.addParameterWithGeneratedValue('better-auth-secret', { minLength: 32 }, { secret: true, persist: true });

// An optional parameter (empty when unset; the app supplies any default). `addParameter`'s `value` beats
// user secrets and Parameters__* env vars, so pass the configured value through; publishValueAsDefault: false
// keeps local values out of the published artifacts.
const config = await builder.getConfiguration();
const optionalParameter = async (name: string, secret = false) =>
  builder.addParameter(name, {
    value: (await config.getConfigValue(`Parameters:${name}`)) || '',
    secret,
    publishValueAsDefault: false,
  });

// Boolean settings. appsettings.json `true` arrives as "True" (.NET's JSON provider stringifies booleans), so
// compare case-insensitively; anything but true/false (or unset) fails the run instead of silently reading false.
const flag = async (key: string) => {
  const value = await config.getConfigValue(key);
  if (!value || /^false$/i.test(value)) return false;
  if (/^true$/i.test(value)) return true;
  throw new Error(`${key} must be true or false, not "${value}"`);
};

// OAuth apps: a provider is enabled only when both values are non-empty (see web/src/lib/auth.ts).
// Set with e.g. `aspire secret set Parameters:github-client-id <id>`.
const oauth = Object.fromEntries(await Promise.all(
  ['github-client-id', 'github-client-secret', 'google-client-id', 'google-client-secret'].map(async (name) =>
    [name, await optionalParameter(name, name.endsWith('secret'))]),
));

// A verified account with this email gets the admin role (see web/src/lib/auth.ts).
const adminEmail = await optionalParameter('admin-email');

// Mail: Mailpit catches everything under `aspire run`; deployments send through `smtp-url`
// (e.g. smtps://user:pass@smtp.example.com:465), set with `aspire secret set Parameters:smtp-url <url>`.
const mailFrom = await optionalParameter('mail-from');
const smtpUrl = await builder.executionContext().isRunMode()
  ? await (await builder.addMailPit('mailpit')).uriExpression()
  : await optionalParameter('smtp-url', true);

const pg = await builder.addPostgres('pg')
  .withDataVolume()
  // addDatabase() only creates the database under `aspire run`; published Compose/K8s rely on this.
  .withEnvironment('POSTGRES_DB', 'appdb');
const appdb = await pg.addDatabase('appdb');

// Self-hosted analytics, opt-in: Umami__Enabled=true (env) or "Umami": { "Enabled": true } (appsettings.json).
// Browsers load its tracker, so production routes a public hostname to it: cloudflared on the compose network
// reaches http://umami:3000 with no host port. Umami__Public=true publishes container port 3000 on a random host
// port on all interfaces (`docker compose port umami 3000`), for a cloudflared outside it: firewall that port.
// After the first start, change the default admin/umami login: `node scripts/umami-set-password.mjs`
// (docs/deployment.md). Then create the website in Umami and enter its script URL and website id on /admin.
// Umami lives in appdb's `umami` schema (its `user`/`session` tables would collide with better-auth's in
// `public`); a separate database wouldn't exist in published output (see POSTGRES_DB above).
// Not withPostgreSQL(): it publishes DATABASE_URL with the Postgres password inlined as a literal.
if (await flag('Umami:Enabled')) {
  const umamiSecret = await builder.addParameterWithGeneratedValue('umami-secret', { minLength: 32 }, { secret: true, persist: true });
  const umami = await builder.addUmami('umami', { secret: umamiSecret })
    .withEnvironment('DATABASE_URL', refExpr`${await appdb.uriExpression()}?schema=umami`)
    .waitFor(appdb);
  if (await flag('Umami:Public')) await umami.withExternalHttpEndpoints();
  // Umami exits if Postgres isn't accepting connections yet, and Compose's depends_on doesn't wait for that.
  if (!k8s) await umami.publishAsDockerComposeService(async (_resource, service) => { await service.restart.set('unless-stopped'); });
}

const web = await builder
  .addViteApp('web', './web')
  .withPnpm()
  .withEndpointCallback('http', async (endpoint) => { await endpoint.port.set(4321); })
  // Astro 7 detaches `astro dev` when it detects an AI agent; Aspire must own the process.
  .withEnvironment('ASTRO_DEV_BACKGROUND', '0')
  .withReference(appdb)
  .waitFor(appdb)
  .withEnvironment('BETTER_AUTH_URL', appUrl)
  .withEnvironment('BETTER_AUTH_SECRET', authSecret)
  .withEnvironment('GITHUB_CLIENT_ID', oauth['github-client-id'])
  .withEnvironment('GITHUB_CLIENT_SECRET', oauth['github-client-secret'])
  .withEnvironment('GOOGLE_CLIENT_ID', oauth['google-client-id'])
  .withEnvironment('GOOGLE_CLIENT_SECRET', oauth['google-client-secret'])
  .withEnvironment('ADMIN_EMAIL', adminEmail)
  .withEnvironment('MAIL_FROM', mailFrom)
  .withEnvironment('SMTP_URL', smtpUrl)
  .withDockerfileBaseImage({ buildImage: 'node:24-slim', runtimeImage: 'node:24-alpine' })
  .publishAsPackageScript({ scriptName: 'start' })
  // CI sets IMAGE_TAG to the commit SHA; Aspire's default push tag is `latest`. Set it when publishing too: it
  // becomes SENTRY_RELEASE in the output. The image a deployment pulls is set separately (WEB_IMAGE in the
  // Compose .env, parameters.web.web_image in the chart).
  .withRemoteImageTag(process.env.IMAGE_TAG ?? 'latest')
  .withEnvironment('SENTRY_RELEASE', process.env.IMAGE_TAG ?? '')
  // K8s: the pod is Ready only once migrations ran and Astro answers; distinct paths because each probe also
  // registers a health check keyed by path. /api/auth/ok stays up while Postgres is down (site settings fall back;
  // better-auth's database rate limiter skips /ok), so a database outage doesn't restart pods into migrate.mjs.
  // Startup: migrate.mjs may wait up to 60 s for Postgres; liveness and readiness only start once this passes.
  .withHttpProbe(ProbeType.Startup, { path: '/api/auth/ok?probe=startup', periodSeconds: 5, failureThreshold: 18 })
  .withHttpProbe(ProbeType.Readiness, { path: '/api/auth/ok' })
  .withHttpProbe(ProbeType.Liveness, { path: '/api/auth/ok?probe=liveness', periodSeconds: 30, timeoutSeconds: 3 })
  .withExternalHttpEndpoints();

// Compose: who can reach the web port on the host. The origin must be reachable only through Cloudflare
// (rate limiting trusts cf-connecting-ip). none: no host port, cloudflared joins the compose network and
// uses http://web:4321. loopback: cloudflared on the host. public: only behind another firewall.
const hostPort = (await config.getConfigValue('Web:HostPort')) ?? 'none';
if (!['none', 'loopback', 'public'].includes(hostPort)) throw new Error(`Web:HostPort must be none, loopback or public, not "${hostPort}"`);
if (!k8s) {
  await web.publishAsDockerComposeService(async (_resource, service) => {
    // migrate.mjs gives up after 60 s; restart instead of staying down.
    await service.restart.set('unless-stopped');
    await service.ports.clear();
    if (hostPort === 'loopback') await service.ports.add('127.0.0.1:4321:4321');
    if (hostPort === 'public') await service.ports.add('4321:4321');
  });
}

// Compose: Aspire 13.6's TS SDK can't set a healthcheck (.claude/rules/apphost.md), so web's lives in
// deploy/docker-compose.override.yaml. Publishing copies it next to docker-compose.yaml, where Compose merges it.
// The output directory is Aspire's Pipeline:OutputPath (`-o`; a relative one resolves against the directory
// `aspire publish` ran in, checked from web/), else <AppHost dir>/aspire-output. Not in run mode: `aspire run`/`start`
// have no publish-compose step, and depending on an unknown step fails the AppHost.
if (!k8s && !(await builder.executionContext().isRunMode())) {
  await builder.pipeline().addStep('copy-compose-override', async () => {
    const output = await config.getConfigValue('Pipeline:OutputPath');
    const appHostDir = await config.getConfigValue('AppHost:Directory');
    // Guessing a directory could copy the healthcheck somewhere the published Compose file isn't.
    if (!output && !appHostDir) throw new Error('copy-compose-override: neither Pipeline:OutputPath nor AppHost:Directory is set');
    const dir = output ? resolve(output) : join(appHostDir!, 'aspire-output');
    await copyFile(new URL('./deploy/docker-compose.override.yaml', import.meta.url), join(dir, 'docker-compose.override.yaml'));
  }, { dependsOn: ['publish-compose'], requiredBy: ['publish'] });
}

await builder.build().run();
