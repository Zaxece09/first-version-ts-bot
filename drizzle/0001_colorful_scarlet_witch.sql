PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`is_valid` integer DEFAULT 1 NOT NULL,
	`is_spam` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 1760388895 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_emails`("id", "user_id", "name", "email", "is_valid", "is_spam", "created_at") SELECT "id", "user_id", "name", "email", "is_valid", "is_spam", "created_at" FROM `emails`;--> statement-breakpoint
DROP TABLE `emails`;--> statement-breakpoint
ALTER TABLE `__new_emails` RENAME TO `emails`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `emails_email_unique` ON `emails` (`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `lock_mode` integer DEFAULT 0 NOT NULL;