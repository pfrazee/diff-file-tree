const test = require('tape')
const {mock} = require('./util')
const dft = require('../index')

test('abort apply-stream', async t => {
  try {
    var left = mock(['/1.txt', '/2.txt', '/3.txt'])
    var right = mock([])
    var changes = await dft.diff({fs: left}, {fs: right})
    var stream = dft.applyRightStream({fs: left}, {fs: right}, changes)
    var applied = []
    stream.on('data', ({op, path}) => {
      applied.push({op, path})
      stream.destroy()
    })
    await new Promise((resolve, reject) => {
      stream.on('error', reject)
      stream.on('close', resolve)
    })
    console.log('Applied', applied)
    t.is(applied.length, 1)
  } catch (err) {
    t.fail(err)
  }
  t.end()
})
