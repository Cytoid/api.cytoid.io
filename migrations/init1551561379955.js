const fs = require('fs').promises;

class init1551561379955 {
  async up(queryRunner) {
    await fs.open('migrations/Initialization.sql', 'r')
      .then(filehandle => filehandle.readFile('utf-8'))
      .then(content => queryRunner.query(content));

    await fs.open('migrations/Search.sql', 'r')
      .then(filehandle => filehandle.readFile('utf-8'))
      .then(content => queryRunner.query(content));

    await fs.open('migrations/Ratings.sql', 'r')
      .then(filehandle => filehandle.readFile('utf-8'))
      .then(content => queryRunner.query(content));
  }

  async down(queryRunner) {
    await queryRunner.dropTable('records');
    await queryRunner.dropTable('level_ratings');
    await queryRunner.dropTable('charts');
    await queryRunner.dropTable('levels');
    await queryRunner.dropTable('files');
    await queryRunner.dropTable('users');
    await queryRunner.query('DROP MATERIALIZED VIEW tags_search')
  }

}

exports.init1551561379955 = init1551561379955;
