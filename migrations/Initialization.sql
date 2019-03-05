CREATE TABLE "users" (
  "id"                uuid      NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  "uid"               varchar,
  "name"              varchar   NOT NULL,
  "password"          bytea     NOT NULL,
  "email"             varchar,
  "email_verified"    boolean,
  "birthday"          TIMESTAMP,
  "date_registration" TIMESTAMP NOT NULL             DEFAULT now(),
  "date_last_active"  TIMESTAMP NOT NULL,
  CONSTRAINT "USER_UID_UNIQUE" UNIQUE ("uid"),
  CONSTRAINT "USER_EMAIL_UNIQUE" UNIQUE ("email")
);
CREATE TABLE "files" (
  "id"           SERIAL            NOT NULL PRIMARY KEY,
  "url"          character varying NOT NULL,
  "content"      jsonb,
  "date_created" TIMESTAMP         NOT NULL DEFAULT now(),
  "ownerId"      uuid
);
CREATE TABLE "levels" (
  "id"            SERIAL         NOT NULL PRIMARY KEY,
  "version"       integer        NOT NULL,
  "uid"           varchar        NOT NULL,
  "title"         varchar        NOT NULL,
  "metadata"      jsonb          NOT NULL,
  "duration"      decimal(6, 2)  NOT NULL,
  "description"   text           NOT NULL,
  "published"     boolean        NOT NULL DEFAULT false,
  "tags"          varchar(30) [] NOT NULL,
  "date_created"  TIMESTAMP      NOT NULL DEFAULT now(),
  "date_modified" TIMESTAMP      NOT NULL DEFAULT now(),
  "ownerId"       uuid,
  "packageId"     integer,
  "directoryId"   integer,
  CONSTRAINT "LEVEL_UID_UNIQUE" UNIQUE ("uid")
);
CREATE TABLE "charts" (
  "id"         SERIAL            NOT NULL PRIMARY KEY,
  "title"      character varying NOT NULL,
  "difficulty" smallint          NOT NULL,
  "levelId"    integer
);
CREATE TABLE "level_ratings" (
  "id"      SERIAL   NOT NULL PRIMARY KEY,
  "rating"  smallint NOT NULL,
  "levelId" integer  NOT NULL,
  "userId"  uuid     NOT NULL,
  CONSTRAINT "LEVEL_RATING_UNIQUE" UNIQUE ("levelId", "userId"),
  CONSTRAINT "LEVEL_RATING_RANGE" CHECK (((rating < 10) AND (rating >= 0)))
);
CREATE TABLE "records" (
  "id"       SERIAL                      NOT NULL PRIMARY KEY,
  "date"     TIMESTAMP                   NOT NULL DEFAULT now(),
  "score"    integer                     NOT NULL,
  "accuracy" numeric(5, 2)               NOT NULL,
  "details"  jsonb                       NOT NULL,
  "mods"     character varying(32) array NOT NULL,
  "ranking"  integer,
  "chartId"  integer                     NOT NULL,
  "ownerId"  uuid                        NOT NULL
);
ALTER TABLE "files"
  ADD CONSTRAINT "FILES_FK_OWNER" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "levels"
  ADD CONSTRAINT "LEVELS_FK_OWNER" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "levels"
  ADD CONSTRAINT "LEVELS_FK_PACKAGE" FOREIGN KEY ("packageId") REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "levels"
  ADD CONSTRAINT "LEVELS_FK_DIRECTORY" FOREIGN KEY ("directoryId") REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "charts"
  ADD CONSTRAINT "CHARTS_FK_LEVEL" FOREIGN KEY ("levelId") REFERENCES "levels" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "level_ratings"
  ADD CONSTRAINT "LEVEL_RATINGS_FK_LEVEL" FOREIGN KEY ("levelId") REFERENCES "levels" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "level_ratings"
  ADD CONSTRAINT "LEVEL_RATINGS_FK_USER" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "records"
  ADD CONSTRAINT "RECORDS_FK_CHART" FOREIGN KEY ("chartId") REFERENCES "charts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "records"
  ADD CONSTRAINT "RECORDS_FK_OWNER" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
