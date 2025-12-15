CREATE TABLE `adverts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`price` text NOT NULL,
	`photo` text NOT NULL,
	`link` text NOT NULL,
	`fake_link` text,
	`person_dot_name` text NOT NULL,
	`email` text,
	`status` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adverts_person_dot_name_unique` ON `adverts` (`person_dot_name`);--> statement-breakpoint
CREATE TABLE `email_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_id` integer NOT NULL,
	`msg_id` text NOT NULL,
	`subject` text NOT NULL,
	`text` text NOT NULL,
	`sender_name` text NOT NULL,
	`email_from` text NOT NULL,
	`tg_msg_id` integer,
	`advert_id` integer,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`advert_id`) REFERENCES `adverts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_msg_id_unique` ON `email_messages` (`msg_id`);--> statement-breakpoint
CREATE TABLE `emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`is_valid` integer DEFAULT 1 NOT NULL,
	`is_spam` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 1759890102 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emails_email_unique` ON `emails` (`email`);--> statement-breakpoint
CREATE TABLE `presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proxies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`proxy` text NOT NULL,
	`is_valid` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proxies_proxy_unique` ON `proxies` (`proxy`);--> statement-breakpoint
CREATE TABLE `smart_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_online` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`username` text,
	`role` text DEFAULT 'guest' NOT NULL,
	`spoof_name` text DEFAULT '-' NOT NULL,
	`team` text DEFAULT 'tsum' NOT NULL,
	`giro_mode` integer DEFAULT 0 NOT NULL,
	`topic_mode` integer DEFAULT 0 NOT NULL,
	`smart_mode` integer DEFAULT 0 NOT NULL,
	`spoof_mode` integer DEFAULT 0 NOT NULL,
	`html_mailer_mode` integer DEFAULT 0 NOT NULL,
	`short_mode` integer DEFAULT 0 NOT NULL,
	`paypal_mode` integer DEFAULT 0 NOT NULL,
	`interval` text DEFAULT '[1,1]' NOT NULL,
	`api_key_tsum` text DEFAULT '-' NOT NULL,
	`profile_id_tsum` text DEFAULT '-' NOT NULL,
	`api_key_aqua` text DEFAULT '-' NOT NULL,
	`profile_id_aqua` text DEFAULT '-' NOT NULL,
	`email_cursor_id` integer,
	`proxy_cursor_id` integer,
	`smart_preset_cursor_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_id_unique` ON `users` (`telegram_id`);