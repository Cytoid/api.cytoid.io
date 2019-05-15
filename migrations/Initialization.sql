CREATE TABLE "emails" (
  "address"           varchar   PRIMARY KEY,
  "verified"          boolean   NOT NULL DEFAULT false,
  "ownerId"           uuid      NOT NULL
);
CREATE TABLE "files" (
  "path"         varchar   NOT NULL PRIMARY KEY,
  "type"         varchar   NOT NULL,
  "content"      jsonb,
  "date_created" TIMESTAMP NOT NULL DEFAULT now(),
  "ownerId"      uuid,
  "created"      boolean   DEFAULT false
);
CREATE TABLE "users" (
  "id"                uuid      PRIMARY KEY DEFAULT uuid_generate_v4(),
  "uid"               varchar,
  "name"              varchar,
  "password"          bytea,
  "email"             varchar   REFERENCES "emails" ("address") ON DELETE SET NULL,
  "avatarPath"        varchar   REFERENCES "files"  ("path") ON DELETE SET NULL,
  "date_registration" TIMESTAMP NOT NULL             DEFAULT now(),
  "active"            boolean   NOT NULL             DEFAULT true,
  CONSTRAINT "USER_UID_UNIQUE" UNIQUE ("uid"),
);
ALTER TABLE "emails" ADD CONSTRAINT "EMAIL_PK_OWNER_ID" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "FILE_PK_OWNER_ID" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL;
CREATE TABLE "profiles" (
  "id"                uuid      NOT NULL PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "birthday"          DATE,
  "headerPath"        varchar   REFERENCES "files"("path") ON DELETE SET NULL,
  "bio"               text      NOT NULL DEFAULT '',
  "badges"            varchar[] NOT NULL DEFAULT '{}'
);
CREATE TABLE "levels" (
  "id"            SERIAL         NOT NULL PRIMARY KEY,
  "version"       integer        NOT NULL,
  "uid"           varchar        NOT NULL,
  "title"         varchar        NOT NULL,
  "metadata"      jsonb          NOT NULL,
  "duration"      real           NOT NULL,
  "description"   text           NOT NULL,
  "published"     boolean        NOT NULL DEFAULT false,
  "censored"      varchar,
  "tags"          varchar(30) [] NOT NULL,
  "date_created"  TIMESTAMP      NOT NULL DEFAULT now(),
  "date_modified" TIMESTAMP      NOT NULL DEFAULT now(),
  "ownerId"       uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "packagePath"   varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  "bundlePath"    varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  CONSTRAINT "LEVEL_UID_UNIQUE" UNIQUE ("uid")
);
CREATE TABLE "charts" (
  "id"         SERIAL   NOT NULL PRIMARY KEY,
  "name"       varchar,
  "difficulty" smallint NOT NULL,
  "type"       varchar  NOT NULL,
  "levelId"    integer REFERENCES "levels" ("id") ON DELETE CASCADE,
  CONSTRAINT "LEVEL_CHART_TYPE_UNIQUE" UNIQUE ("levelId", "type")
);
CREATE TABLE "level_ratings" (
  "id"      SERIAL   NOT NULL PRIMARY KEY,
  "rating"  smallint NOT NULL,
  "levelId" integer  NOT NULL REFERENCES "levels" ("id") ON DELETE CASCADE,
  "userId"  uuid     NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "LEVEL_RATING_UNIQUE" UNIQUE ("levelId", "userId"),
  CONSTRAINT "LEVEL_RATING_RANGE" CHECK (((rating <= 10) AND (rating > 0)))
);
CREATE TABLE "records" (
  "id"       SERIAL         NOT NULL PRIMARY KEY,
  "date"     TIMESTAMP      NOT NULL DEFAULT now(),
  "score"    integer        NOT NULL,
  "accuracy" real           NOT NULL,
  "details"  jsonb          NOT NULL,
  "mods"     varchar(32) [] NOT NULL DEFAULT '{}',
  "ranking"  integer,
  "chartId"  integer        NOT NULL REFERENCES "charts" ("id") ON DELETE CASCADE,
  "ownerId"  uuid           NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
