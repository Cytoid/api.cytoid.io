class UserRoles1567990745585{
  async up(queryRunner) {
    queryRunner.query("ALTER TABLE users ADD COLUMN role varchar NOT NULL DEFAULT 'user'")
  }
  async down(queryRunner) {
    queryRunner.query("ALTER TABLE users DROP COLUMN role")
  }
}

exports.UserRoles1567990745585 = UserRoles1567990745585
