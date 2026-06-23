CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'starter' NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `investigation_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`saturation_score` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investigation_workers_investigation_id_worker_id_unique` ON `investigation_workers` (`investigation_id`,`worker_id`);--> statement-breakpoint
CREATE TABLE `investigations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`manager_id` text NOT NULL,
	`title` text NOT NULL,
	`problem_description` text NOT NULL,
	`ishikawa_category` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `managers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `managers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managers_email_unique` ON `managers` (`email`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`direction` text NOT NULL,
	`content_type` text DEFAULT 'text' NOT NULL,
	`content` text,
	`audio_url` text,
	`raw_whatsapp_id` text,
	`transcription_status` text DEFAULT 'not_applicable' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`key_points_extracted` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_raw_whatsapp_id_unique` ON `messages` (`raw_whatsapp_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`investigation_id` text NOT NULL,
	`root_cause` text NOT NULL,
	`confidence_score` integer NOT NULL,
	`confidence_justification` text,
	`ishikawa_breakdown` text,
	`sources_summary` text,
	`recommendations` text,
	`generated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_investigation_id_unique` ON `reports` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`role_description` text,
	`whatsapp_number` text NOT NULL,
	`anonymous_alias` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_company_id_whatsapp_number_unique` ON `workers` (`company_id`,`whatsapp_number`);