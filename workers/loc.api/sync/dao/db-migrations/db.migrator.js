'use strict'

const {
  decorate,
  injectable
} = require('inversify')

const {
  DbMigrationVerCorrectnessError,
  DbVersionTypeError,
  MigrationLaunchingError
} = require('../../../errors')

const Migration = require('./migration')

class DbMigrator {
  constructor (
    migrationsFactory,
    TABLES_NAMES,
    syncSchema,
    logger
  ) {
    this.migrationsFactory = migrationsFactory
    this.TABLES_NAMES = TABLES_NAMES
    this.syncSchema = syncSchema
    this.logger = logger
  }

  setDao (dao) {
    this.dao = dao
  }

  getSupportedDbVer () {
    return this.syncSchema.SUPPORTED_DB_VERSION
  }

  getMigrations (versions = [1]) {
    return this.migrationsFactory(versions)
  }

  range (start = 0, end) {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end)
    ) {
      throw new DbVersionTypeError()
    }

    const isReverse = start > end
    const _start = isReverse
      ? end
      : start
    const _end = isReverse
      ? start
      : end
    const offset = _start + 1

    const range = Array(Math.abs(_end - _start))
      .fill()
      .map((item, i) => offset + i)

    return isReverse
      ? range.reverse()
      : range
  }

  async migrate (ver, isDown) {
    if (
      !Number.isInteger(ver) &&
      !Array.isArray(ver)
    ) {
      throw new DbMigrationVerCorrectnessError()
    }

    const versions = Array.isArray(ver)
      ? ver
      : [ver]
    this.logger.debug(`[Start of migrations]: ${versions.join(', ')}`)

    const migrations = this.getMigrations(versions)

    for (const migration of migrations) {
      if (!(migration instanceof Migration)) {
        continue
      }

      const ver = migration.getVersion()

      try {
        await migration.launch(isDown)
      } catch (err) {
        this.logger.debug(`[MIGRATION_V${ver}_ERROR]`)

        throw new MigrationLaunchingError()
      }
    }

    this.logger.debug('[Migrations completed successfully]')
  }

  /**
   * @abstract
   */
  async migrateFromCurrToSupportedVer () {
    const supportedVer = this.getSupportedDbVer()
    const currVer = await this.dao.getCurrDbVer()

    if (
      !Number.isInteger(supportedVer) ||
      !Number.isInteger(currVer)
    ) {
      throw new DbVersionTypeError()
    }
    if (currVer === supportedVer) {
      return
    }

    const isDown = currVer > supportedVer
    const versions = this.range(currVer, supportedVer)

    await this.migrate(versions, isDown)
  }
}

decorate(injectable(), DbMigrator)

module.exports = DbMigrator
