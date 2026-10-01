ALTER TABLE "site_settings" ADD COLUMN "sentry_dsn" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "sentry_server" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "sentry_browser" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "umami_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "umami_script_url" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "umami_website_id" text;