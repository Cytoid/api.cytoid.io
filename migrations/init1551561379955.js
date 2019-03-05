const fs = require('fs').promises;

class init1551561379955 {
  async up(queryRunner) {
    const filehandle = await fs.open('migrations/Initialization.sql', 'r');
    const sqlQueries = await filehandle.readFile('utf-8');
    await queryRunner.query(sqlQueries);
  }

  async down(queryRunner) {
    await queryRunner.dropTable('records');
    await queryRunner.dropTable('level_ratings');
    await queryRunner.dropTable('charts');
    await queryRunner.dropTable('levels');
    await queryRunner.dropTable('files');
    await queryRunner.dropTable('users');
  }

}

exports.init1551561379955 = init1551561379955;
