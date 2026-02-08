-- RenameColumn: photo_url -> thumbnail_url
ALTER TABLE "users" RENAME COLUMN "photo_url" TO "thumbnail_url";

-- RenameColumn: twitter_username -> screen_name
ALTER TABLE "users" RENAME COLUMN "twitter_username" TO "screen_name";
