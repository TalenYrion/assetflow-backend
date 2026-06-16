import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1781605214020 implements MigrationInterface {
    name = 'InitialSchema1781605214020'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "thumbnail" ("id" SERIAL NOT NULL, "url" character varying NOT NULL, "width" integer NOT NULL DEFAULT '200', "height" integer NOT NULL DEFAULT '200', "storagePath" character varying NOT NULL, "assetId" integer, CONSTRAINT "REL_b242ed41501760fe5345867973" UNIQUE ("assetId"), CONSTRAINT "PK_12afcbe5bdad28526b88dbdaf3f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."assets_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED', 'BANNED')`);
        await queryRunner.query(`CREATE TABLE "assets" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "description" text, "price" numeric(10,2) NOT NULL DEFAULT '0', "fileExtension" character varying, "creatorId" integer NOT NULL, "status" "public"."assets_status_enum" NOT NULL DEFAULT 'DRAFT', "storagePath" character varying NOT NULL, "deletedAt" TIMESTAMP, "updateAT" TIMESTAMP NOT NULL DEFAULT now(), "createdAt" TIMESTAMP DEFAULT now(), "thumbnailId" integer, CONSTRAINT "REL_b39366e4e213ef4fbbab3568bc" UNIQUE ("thumbnailId"), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum" AS ENUM('SUCCESS', 'REFUNDED')`);
        await queryRunner.query(`CREATE TABLE "order" ("id" SERIAL NOT NULL, "pricePaid" numeric(10,2) NOT NULL DEFAULT '0', "transactionId" character varying NOT NULL, "status" "public"."order_status_enum" NOT NULL DEFAULT 'SUCCESS', "platformFee" numeric(10,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "assetSnapshot" json, "buyerId" integer, "sellerId" integer, "assetId" integer, CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('BUYER', 'SELLER')`);
        await queryRunner.query(`CREATE TYPE "public"."user_onboardingstatus_enum" AS ENUM('ACTIVE', 'PENDING')`);
        await queryRunner.query(`CREATE TABLE "user" ("id" SERIAL NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying, "email" character varying NOT NULL, "avatarUrl" character varying, "bio" character varying, "password" character varying, "role" "public"."user_role_enum" NOT NULL DEFAULT 'BUYER', "refreshToken" character varying, "stripeAccountId" character varying, "onboardingStatus" "public"."user_onboardingstatus_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "file_types" ("id" SERIAL NOT NULL, "extension" character varying NOT NULL, "mimeType" character varying, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_23d9ec7f059bcd845618e163d79" UNIQUE ("extension"), CONSTRAINT "PK_46a1b5c6e75c5542f754741f33b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "wishlist" ("userId" integer NOT NULL, "assetId" integer NOT NULL, CONSTRAINT "PK_745f93940c05fe06ea2b86ccb45" PRIMARY KEY ("userId", "assetId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f6eeb74a295e2aad03b76b0ba8" ON "wishlist" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a91c2e0cecf6045d5da8b77c75" ON "wishlist" ("assetId") `);
        await queryRunner.query(`ALTER TABLE "thumbnail" ADD CONSTRAINT "FK_b242ed41501760fe53458679736" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_eea23d2ce49335741505eaa9672" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_b39366e4e213ef4fbbab3568bc7" FOREIGN KEY ("thumbnailId") REFERENCES "thumbnail"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_20981b2b68bf03393c44dd1b9d7" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_8a583acc24e13bcf84b1b9d0d20" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_8b2e2e46cf8773a56a0fd512856" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlist" ADD CONSTRAINT "FK_f6eeb74a295e2aad03b76b0ba87" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "wishlist" ADD CONSTRAINT "FK_a91c2e0cecf6045d5da8b77c752" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wishlist" DROP CONSTRAINT "FK_a91c2e0cecf6045d5da8b77c752"`);
        await queryRunner.query(`ALTER TABLE "wishlist" DROP CONSTRAINT "FK_f6eeb74a295e2aad03b76b0ba87"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_8b2e2e46cf8773a56a0fd512856"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_8a583acc24e13bcf84b1b9d0d20"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_20981b2b68bf03393c44dd1b9d7"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT "FK_b39366e4e213ef4fbbab3568bc7"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT "FK_eea23d2ce49335741505eaa9672"`);
        await queryRunner.query(`ALTER TABLE "thumbnail" DROP CONSTRAINT "FK_b242ed41501760fe53458679736"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a91c2e0cecf6045d5da8b77c75"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f6eeb74a295e2aad03b76b0ba8"`);
        await queryRunner.query(`DROP TABLE "wishlist"`);
        await queryRunner.query(`DROP TABLE "file_types"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TYPE "public"."user_onboardingstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
        await queryRunner.query(`DROP TABLE "order"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
        await queryRunner.query(`DROP TABLE "assets"`);
        await queryRunner.query(`DROP TYPE "public"."assets_status_enum"`);
        await queryRunner.query(`DROP TABLE "thumbnail"`);
    }

}
