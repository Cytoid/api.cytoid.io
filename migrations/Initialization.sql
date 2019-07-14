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
  "tags"          varchar[]      NOT NULL DEFAULT ARRAY[]::varchar[],
  "category"      varchar[]      NOT NULL DEFAULT ARRAY[]::varchar[],
  "date_created"  TIMESTAMP      NOT NULL DEFAULT now(),
  "date_modified" TIMESTAMP      NOT NULL DEFAULT now(),
  "ownerId"       uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "packagePath"   varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  "bundlePath"    varchar REFERENCES "files" ("path") ON DELETE SET NULL,
  "size"          integer        NOT NULL
);
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
  "accuracy" real           NOT NULL,
  "details"  jsonb          NOT NULL,
  "mods"     varchar(32) [] NOT NULL DEFAULT ARRAY[]::varchar[],
  "ranked"   boolean        NOT NULL,
  "chartId"  integer        NOT NULL REFERENCES "charts" ("id") ON DELETE CASCADE,
  "ownerId"  uuid           NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX records_chart ON records USING hash ("chartId");

CREATE TABLE "level_downloads" (
  "id"       SERIAL    NOT NULL PRIMARY KEY,
  "userId"   uuid      NOT NULL REFERENCES "users" ("id")  ON DELETE CASCADE,
  "levelId"  integer   NOT NULL REFERENCES "levels" ("id") ON DELETE CASCADE,
  "date"     TIMESTAMP NOT NULL DEFAULT now(),
  "count"    smallint  NOT NULL DEFAULT 0,
  UNIQUE ("levelId", "userId")
);


CREATE TABLE "posts" (
  "id"            SERIAL    NOT NULL PRIMARY KEY,
  "slug"          varchar   NOT NULL UNIQUE,
  "ownerId"       uuid      REFERENCES "users" ("id") ON DELETE SET NULL,
  "title"         varchar   NOT NULL,
  "subtitle"      varchar   NOT NULL,
  "tags"          varchar[] NOT NULL DEFAULT ARRAY[]::varchar[],
  "date_created"  TIMESTAMP NOT NULL DEFAULT now(),
  "content"       text      NOT NULL,
  "metadata"      jsonb     NOT NULL,
  "headerPath"    varchar   REFERENCES "files"("path") ON DELETE SET NULL
);

CREATE MATERIALIZED VIEW tags_search AS
    SELECT tag,
           count(tag),
           to_tsvector(tag) as tsv
    FROM (SELECT lower(unnest(tags)) AS tag FROM levels) AS tags
    GROUP BY tag ORDER BY count DESC;

CREATE INDEX tags_search_tsv ON tags_search USING gin(tsv);

CREATE MATERIALIZED VIEW levels_search AS
SELECT setweight(to_tsvector(levels.uid), 'C') ||
       setweight(to_tsvector(title), 'D') ||
       setweight(to_tsvector(description), 'A') ||
       setweight(to_tsvector(array_to_string(tags, ',', '*')), 'D') ||
       setweight(to_tsvector(coalesce(users.uid, '')), 'B') ||
       setweight(to_tsvector(coalesce(users.name, '')), 'B') as tsv,
       levels.id,
       levels.title,
       levels.uid
FROM levels
JOIN users on levels."ownerId" = users.id
WHERE published=true;

CREATE INDEX levels_search_tsv ON levels_search USING gin(tsv);

CREATE VIEW records_ratings AS (
    SELECT r.id, r.date,
           r.accuracy,
           r."ownerId"                             AS "ownerId",
           CASE
               WHEN r.accuracy < 0.7 THEN ((|/ (r.accuracy / 0.7)) * 0.5)
               WHEN r.accuracy < 0.97 THEN 0.7 - 0.2 * log((1.0 - r.accuracy) / 0.03)
               WHEN r.accuracy < 0.997 THEN 0.7 - 0.16 * log((1.0 - r.accuracy) / 0.03)
               WHEN r.accuracy < 0.9997 THEN 0.78 - 0.08 * log((1.0 - r.accuracy) / 0.03)
               ELSE r.accuracy * 200.0 - 199.0 END AS performance_rating,
           c.difficulty                            AS difficulty_rating
    FROM records r
    JOIN charts c ON r."chartId"=c.id
    WHERE r.ranked=true
);


CREATE MATERIALIZED VIEW leaderboard AS (
    SELECT *, rank() OVER (ORDER BY rating DESC) AS ranking
    FROM (
        SELECT avg(performance_rating * difficulty_rating) AS rating,
               "ownerId"
        FROM records_ratings
        GROUP BY "ownerId"
    ) as lb
);

