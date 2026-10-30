CREATE TABLE "mail_throttle" (
	"recipient" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer NOT NULL
);
