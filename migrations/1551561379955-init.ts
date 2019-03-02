import {MigrationInterface, QueryRunner} from "typeorm";

export class init1551561379955 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "uid" character varying, "name" character varying NOT NULL, "password" bytea NOT NULL, "email" character varying, "email_verified" boolean, "birthday" TIMESTAMP, "date_registration" TIMESTAMP NOT NULL DEFAULT now(), "date_last_active" TIMESTAMP NOT NULL, CONSTRAINT "UQ_6e20ce1edf0678a09f1963f9587" UNIQUE ("uid"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "files" ("id" SERIAL NOT NULL, "url" character varying NOT NULL, "content" jsonb, "date_created" TIMESTAMP NOT NULL DEFAULT now(), "ownerId" uuid, CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "levels" ("id" SERIAL NOT NULL, "version" integer NOT NULL, "uid" character varying NOT NULL, "title" character varying NOT NULL, "metadata" jsonb NOT NULL, "duration" numeric(6,2) NOT NULL, "description" text NOT NULL, "published" boolean NOT NULL DEFAULT false, "tags" character varying(30) array NOT NULL, "date_created" TIMESTAMP NOT NULL DEFAULT now(), "date_modified" TIMESTAMP NOT NULL DEFAULT now(), "ownerId" uuid, "packageId" integer, "directoryId" integer, CONSTRAINT "UQ_dc6d31feda3115631ed140ede1d" UNIQUE ("uid"), CONSTRAINT "PK_05f8dd8f715793c64d49e3f1901" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "charts" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "difficulty" smallint NOT NULL, "levelId" integer, CONSTRAINT "PK_fa7124425552d2d37725307008b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "level_ratings" ("id" SERIAL NOT NULL, "rating" smallint NOT NULL, "levelId" integer NOT NULL, "userId" uuid NOT NULL, CONSTRAINT "UQ_43d80bf5656da04961fad38dea1" UNIQUE ("levelId", "userId"), CONSTRAINT "CHK_8ff0e51faadff2a7ffbce8bfb1" CHECK (((rating < 10 ) AND (rating >= 0))), CONSTRAINT "PK_c9695292a2d417f582e3f404759" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "record" ("id" SERIAL NOT NULL, "date" TIMESTAMP NOT NULL DEFAULT now(), "score" integer NOT NULL, "accuracy" numeric(5,2) NOT NULL, "details" jsonb NOT NULL, "mods" character varying(32) array NOT NULL, "ranking" integer, "chartId" integer NOT NULL, "ownerId" uuid NOT NULL, CONSTRAINT "PK_5cb1f4d1aff275cf9001f4343b9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "files" ADD CONSTRAINT "FK_a23484d1055e34d75b25f616792" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "levels" ADD CONSTRAINT "FK_a36e9579bb4d75d7c5f14f85654" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "levels" ADD CONSTRAINT "FK_5ed55e14914776974ba80f93f4b" FOREIGN KEY ("packageId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "levels" ADD CONSTRAINT "FK_1d26ebcad7a37ef4af9d23e4121" FOREIGN KEY ("directoryId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "charts" ADD CONSTRAINT "FK_4d552ec3082eb081c5e790c8a67" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "level_ratings" ADD CONSTRAINT "FK_dde78845be37a48f288d130f118" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "level_ratings" ADD CONSTRAINT "FK_2cf712979dc147367d9c45171b3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "record" ADD CONSTRAINT "FK_9d1902adcb32920d0b76ee65690" FOREIGN KEY ("chartId") REFERENCES "charts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "record" ADD CONSTRAINT "FK_36fbf19df585bf8b2b38103b8f0" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "record" DROP CONSTRAINT "FK_36fbf19df585bf8b2b38103b8f0"`);
        await queryRunner.query(`ALTER TABLE "record" DROP CONSTRAINT "FK_9d1902adcb32920d0b76ee65690"`);
        await queryRunner.query(`ALTER TABLE "level_ratings" DROP CONSTRAINT "FK_2cf712979dc147367d9c45171b3"`);
        await queryRunner.query(`ALTER TABLE "level_ratings" DROP CONSTRAINT "FK_dde78845be37a48f288d130f118"`);
        await queryRunner.query(`ALTER TABLE "charts" DROP CONSTRAINT "FK_4d552ec3082eb081c5e790c8a67"`);
        await queryRunner.query(`ALTER TABLE "levels" DROP CONSTRAINT "FK_1d26ebcad7a37ef4af9d23e4121"`);
        await queryRunner.query(`ALTER TABLE "levels" DROP CONSTRAINT "FK_5ed55e14914776974ba80f93f4b"`);
        await queryRunner.query(`ALTER TABLE "levels" DROP CONSTRAINT "FK_a36e9579bb4d75d7c5f14f85654"`);
        await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT "FK_a23484d1055e34d75b25f616792"`);
        await queryRunner.query(`DROP TABLE "record"`);
        await queryRunner.query(`DROP TABLE "level_ratings"`);
        await queryRunner.query(`DROP TABLE "charts"`);
        await queryRunner.query(`DROP TABLE "levels"`);
        await queryRunner.query(`DROP TABLE "files"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
