CREATE TABLE "playground_call" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_call_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"visitor" text NOT NULL,
	"caller" text NOT NULL,
	"prompt_chars" integer NOT NULL,
	"routed_at" timestamp with time zone,
	"decision" text,
	"stopped_at" text,
	"reason" text,
	"reply_chars" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	CONSTRAINT "playground_call_closed" CHECK (("playground_call"."ended_at" is null) = ("playground_call"."decision" is null)),
	CONSTRAINT "playground_call_decision" CHECK ("playground_call"."decision" in ('forwarded', 'refused', 'cut', 'lost'))
);
--> statement-breakpoint
CREATE INDEX "playground_call_started_at" ON "playground_call" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "playground_call_open" ON "playground_call" USING btree ("started_at") WHERE "playground_call"."ended_at" is null;