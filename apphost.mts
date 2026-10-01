// Aspire TypeScript AppHost: Astro (SSR) + better-auth + PostgreSQL.
// Run locally:   aspire run            (or `aspire start` in the background)
// Publish:       aspire publish -o out/compose
//                DEPLOY_TARGET=k8s aspire publish -o out/k8s
// Push images:   aspire do push        (after `docker login ghcr.io`; CI does this)

import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

// One AppHost publishes one resource to one environment; pick it per run.
const target = process.env.DEPLOY_TARGET === 'k8s'
  ? await builder.addKubernetesEnvironment('k8s')
      .withHelm({ configure: async (helm) => { await helm.withNamespace('matherlynet'); } })
  : await builder.addDockerComposeEnvironment('compose');

const ghcr = await builder.addContainerRegistry('ghcr', 'ghcr.io', { repository: 'jrmatherly/matherlynet' });
await target.withContainerRegistry(ghcr);

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

await builder
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
  // CI sets IMAGE_TAG to the commit SHA; Aspire's default push tag is `latest`.
  .withRemoteImageTag(process.env.IMAGE_TAG ?? 'latest')
  .withExternalHttpEndpoints();

await builder.build().run();
