'use strict'

const path = require('path')
const { assert } = require('chai')
const request = require('supertest')

const {
  stopEnvironment
} = require('bfx-report/test/helpers/helpers.boot')
const {
  rmDB,
  rmAllFiles
  // queueToPromise
} = require('bfx-report/test/helpers/helpers.core')
// const {
//   testMethodOfGettingCsv
// } = require('bfx-report/test/helpers/helpers.tests')

const {
  startEnvironment
} = require('./helpers/helpers.boot')
const {
  connToSQLite,
  closeSQLite,
  delay
} = require('./helpers/helpers.core')
const {
  createMockRESTv2SrvWithDate,
  getMockData
} = require('./helpers/helpers.mock-rest-v2')
const _mockData = require('./helpers/mock-data')

process.env.NODE_CONFIG_DIR = path.join(__dirname, 'config')
const { app } = require('bfx-report-express')
const agent = request.agent(app)

let wrkReportServiceApi = null
// let processorQueue = null
// let aggregatorQueue = null
let mockRESTv2Srv = null
let db = null

const basePath = '/api'
const tempDirPath = path.join(__dirname, '..', 'workers/loc.api/queue/temp')
const dbDirPath = path.join(__dirname, '..', 'db')
const date = new Date()
const end = date.getTime()
const start = (new Date()).setDate(date.getDate() - 90)
const subUserEmail = 'sub-user@email.fake'
const masterUserEmail = 'master-user@email.fake'
const subUserAuth = {
  apiKey: 'subUserApiKey',
  apiSecret: 'subUserApiSecret'
}
const masterUserAuth = {
  apiKey: 'masterUserApiKey',
  apiSecret: 'masterUserApiSecret'
}
const subAccountAuth = {
  apiKey: 'masterUserApiKey-sub-account',
  apiSecret: 'masterUserApiSecret-sub-account'
}

const masterUserMockData = new Map([
  [
    'user_info',
    [
      111,
      masterUserEmail,
      'masterUserName',
      null,
      null,
      null,
      null,
      'Kyiv'
    ]
  ]
])
const _getMockData = (methodName) => {
  return getMockData(
    methodName,
    new Map([..._mockData, ...masterUserMockData])
  )
}

describe('Sub-account', () => {
  before(async function () {
    this.timeout(20000)

    mockRESTv2Srv = createMockRESTv2SrvWithDate(
      start,
      end,
      100,
      undefined,
      { _getMockData }
    )

    await rmAllFiles(tempDirPath, ['README.md'])
    await rmDB(dbDirPath)
    const env = await startEnvironment(false, false, 1, {
      dbDriver: 'sqlite'
    })

    wrkReportServiceApi = env.wrksReportServiceApi[0]
    // processorQueue = wrkReportServiceApi.lokue_processor.q
    // aggregatorQueue = wrkReportServiceApi.lokue_aggregator.q

    const rService = wrkReportServiceApi.grc_bfx.api
    const rServiceProxy = new Proxy(rService, {
      get (target, propKey) {
        if (propKey === '_checkAuthInApi') {
          return (args) => {
            const { auth } = { ...args }
            const { apiKey, apiSecret } = { ...auth }

            if (
              apiKey === subUserAuth.apiKey &&
              apiSecret === subUserAuth.apiSecret
            ) {
              return {
                email: subUserEmail,
                timezone: 'Kyiv',
                username: 'subUserName',
                id: 222
              }
            }

            // eslint-disable-next-line no-useless-call
            return target[propKey].call(target, args)
          }
        }

        return Reflect.get(target, propKey)
      }
    })

    rService._subAccount.rService = rServiceProxy

    db = await connToSQLite()
  })

  after(async function () {
    this.timeout(5000)

    await stopEnvironment()
    await closeSQLite(db)
    await rmDB(dbDirPath)
    await rmAllFiles(tempDirPath, ['README.md'])

    try {
      await mockRESTv2Srv.close()
    } catch (err) { }
  })

  describe('Login as master user', () => {
    it('it should not be successfully performed by the createSubAccount method', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'createSubAccount',
          params: {
            subAccountApiKeys: [subUserAuth]
          },
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(401)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isObject(res.body.error)
      assert.propertyVal(res.body.error, 'code', 401)
      assert.propertyVal(res.body.error, 'message', 'Unauthorized')
    })

    it('it should be successfully performed by the login method for master user', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'login',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(res.body.result === masterUserEmail)
    })

    it('it should not be successfully performed by the login method for sub-account', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: subAccountAuth,
          method: 'login',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(401)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isObject(res.body.error)
      assert.propertyVal(res.body.error, 'code', 401)
      assert.propertyVal(res.body.error, 'message', 'Unauthorized')
    })
  })

  describe('Create sub-account', () => {
    it('it should not be successfully performed by the hasSubAccount method with master user keys', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'hasSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isNotOk(res.body.result)
    })

    it('it should be successfully performed by the createSubAccount method', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'createSubAccount',
          params: {
            subAccountApiKeys: [subUserAuth]
          },
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(res.body.result)
    })

    it('it should be successfully performed by the hasSubAccount method with master user keys', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'hasSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(res.body.result)
    })

    it('it should be successfully performed by the hasSubAccount method with sub-account keys', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: subAccountAuth,
          method: 'hasSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(res.body.result)
    })
  })

  // TODO: need to add coverage
  describe('Sync mode with sub-account', () => {
    it('it should be successfully performed by the syncNow method', async function () {
      this.timeout(60000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: subAccountAuth,
          method: 'syncNow',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(
        typeof res.body.result === 'number' ||
        res.body.result === 'SYNCHRONIZATION_IS_STARTED'
      )
    })

    it('it should be successfully performed by the getSyncProgress method', async function () {
      this.timeout(60000)

      while (true) {
        const res = await agent
          .post(`${basePath}/get-data`)
          .type('json')
          .send({
            auth: subAccountAuth,
            method: 'getSyncProgress',
            id: 5
          })
          .expect('Content-Type', /json/)
          .expect(200)

        assert.isObject(res.body)
        assert.propertyVal(res.body, 'id', 5)
        assert.isNumber(res.body.result)

        if (
          typeof res.body.result !== 'number' ||
          res.body.result === 100
        ) {
          break
        }

        await delay()
      }
    })
  })

  describe('Remove sub-account', () => {
    it('it should not be successfully performed by the removeSubAccount method', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: subAccountAuth,
          method: 'removeSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(500)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isObject(res.body.error)
      assert.propertyVal(res.body.error, 'code', 500)
      assert.propertyVal(res.body.error, 'message', 'Internal Server Error')
    })

    it('it should be successfully performed by the removeSubAccount method', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'removeSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isOk(res.body.result)
    })

    it('it should not be successfully performed by the hasSubAccount method with master user keys', async function () {
      this.timeout(5000)

      const res = await agent
        .post(`${basePath}/get-data`)
        .type('json')
        .send({
          auth: masterUserAuth,
          method: 'hasSubAccount',
          id: 5
        })
        .expect('Content-Type', /json/)
        .expect(200)

      assert.isObject(res.body)
      assert.propertyVal(res.body, 'id', 5)
      assert.isNotOk(res.body.result)
    })
  })
})
