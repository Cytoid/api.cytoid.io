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
  "ownerId"      uuid
);
CREATE TABLE "users" (
  "id"                uuid      PRIMARY KEY DEFAULT uuid_generate_v4(),
  "uid"               varchar   UNIQUE,
  "name"              varchar,
  "password"          bytea,
  "email"             varchar   UNIQUE REFERENCES "emails" ("address") ON DELETE SET NULL,
  "avatarPath"        varchar   REFERENCES "files"  ("path") ON DELETE SET NULL,
  "date_registration" TIMESTAMP NOT NULL             DEFAULT now(),
  "active"            boolean   NOT NULL             DEFAULT true
);
ALTER TABLE "emails" ADD CONSTRAINT "EMAIL_PK_OWNER_ID" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "FILE_PK_OWNER_ID" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL;
CREATE TABLE "profiles" (
  "id"                uuid      NOT NULL PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "birthday"          DATE,
  "headerPath"        varchar   REFERENCES "files"("path") ON DELETE SET NULL,
  "bio"               text      NOT NULL DEFAULT '',
  "badges"            varchar[] NOT NULL DEFAULT ARRAY[]::varchar[]
);
CREATE TABLE "levels" (
  "id"            SERIAL         NOT NULL PRIMARY KEY,
  "version"       integer        NOT NULL,
  "uid"           varchar        NOT NULL UNIQUE,
  "title"         varchar        NOT NULL,
  "metadata"      jsonb          NOT NULL,
  "duration"      real           NOT NULL,
  "description"   text           NOT NULL DEFAULT '',
  "published"     boolean        DEFAULT false,
  "censored"      varchar,
  "tags"          citext[]       NOT NULL DEFAULT ARRAY[]::citext[],
  "category"      varchar[]      NOT NULL DEFAULT ARRAY[]::varchar[],
  "date_created"  TIMESTAMP      NOT NULL DEFAULT now(),
  "date_modified" TIMESTAMP      NOT NULL DEFAULT now(),
  "ownerId"       uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "packagePath"   varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  "bundlePath"    varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  "size"          integer        NOT NULL
);
CREATE INDEX levels_tag ON levels USING GIN ("tags");
CREATE INDEX levels_date_created ON levels ("date_created");
CREATE INDEX levels_date_modified ON levels ("date_modified");
CREATE INDEX levels_duration ON levels ("duration");

CREATE TABLE "charts" (
  "id"         SERIAL   NOT NULL PRIMARY KEY,
  "name"       varchar,
  "difficulty" smallint NOT NULL,
  "type"       varchar  NOT NULL,
  "levelId"    integer NOT NULL REFERENCES "levels" ("id") ON DELETE CASCADE,
  "notesCount" integer NOT NULL,
  "checksum"   varchar,
  UNIQUE ("levelId", "type")
);
CREATE TABLE "level_ratings" (
  "id"      SERIAL   NOT NULL PRIMARY KEY,
  "rating"  smallint NOT NULL,
  "levelId" integer  NOT NULL REFERENCES "levels" ("id") ON DELETE CASCADE,
  "userId"  uuid     NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  UNIQUE ("levelId", "userId"),
  CHECK (((rating <= 10) AND (rating >= 0)))
);
CREATE TABLE "records" (
  "id"       SERIAL         NOT NULL PRIMARY KEY,
  "date"     TIMESTAMP      NOT NULL DEFAULT now(),
  "score"    integer        NOT NULL,
  "accuracy" numeric(9,8)   NOT NULL,
  "rating"   numeric(10,8)  NOT NULL,
  "details"  jsonb          NOT NULL,
  "mods"     varchar(32) [] NOT NULL DEFAULT ARRAY[]::varchar[],
  "ranked"   boolean        NOT NULL,
  "chartId"  integer        NOT NULL REFERENCES "charts" ("id") ON DELETE CASCADE,
  "ownerId"  uuid           NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX records_chart ON records ("chartId");
CREATE INDEX records_owner ON records ("ownerId");

CREATE TABLE "level_downloads" (
  "id"       SERIAL    NOT NULL PRIMARY KEY,
  "userId"   uuid      NOT NULL REFERENCES "users" ("id")  ON DELETE CASCADE,
  "levelId"  integer   NOT NULL REFERENCES "levels" ("id") ON DELETE CASCADE,
  "date"     TIMESTAMP NOT NULL DEFAULT now(),
  "count"    smallint  NOT NULL DEFAULT 1,
  UNIQUE ("levelId", "userId")
);

CREATE TABLE collections
(
    "id"            SERIAL    NOT NULL PRIMARY KEY,
    "uid"           varchar   NOT NULL UNIQUE,
    "coverPath"     varchar   REFERENCES files ("path"),
    "title"         varchar   NOT NULL DEFAULT '',
    "brief"         varchar   NOT NULL DEFAULT '',
    "description"   text      NOT NULL DEFAULT '',
    "ownerId"       uuid      REFERENCES users ("id"),
    "date_created"  TIMESTAMP NOT NULL DEFAULT now(),
    "date_modified" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE collections_levels
(
    "collectionId" integer NOT NULL REFERENCES collections ("id"),
    "levelId" integer NOT NULL REFERENCES levels ("id"),
    "order" integer NOT NULL,
    UNIQUE ("collectionId", "levelId"),
    UNIQUE ("collectionId", "order"),
    CHECK ("order" > 0)
);
