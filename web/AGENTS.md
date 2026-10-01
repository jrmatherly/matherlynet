# Agent guide: web (Astro)

## Development

This app is orchestrated by Aspire from the repository root. Do not run `astro dev` directly:
it would start without the database, secrets, or the fixed port (4321) that auth callbacks rely on.

```sh
aspire start          # from the repo root; app at http://localhost:4321
aspire logs web       # dev server output
aspire stop
```

The AppHost sets `ASTRO_DEV_BACKGROUND=0` so Astro 7 does not detach the dev server when it detects an AI agent.

## Documentation

Full documentation: <https://docs.astro.build>

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
