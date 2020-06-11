const test = require('tape')
const {mock} = require('./util')
const dft = require('../index')

test('abort on too large', async t => {
  var left = mock(['/subdir/', '/subdir/foo.txt', '/bar.txt'])
  await new Promise((resolve, reject) => setTimeout(resolve, 1e3)) // make sure mtimes differ
  var right = mock(['/subdir/', '/subdir/foo.txt', '/bar.txt'])
  var res = await dft.diff({fs: left}, {fs: right}, {compareContent: true, sizeLimit: {maxSize: 1, assumeEq: true}})
  t.deepEqual(res, [])
  res = await dft.diff({fs: left}, {fs: right}, {compareContent: true, sizeLimit: {maxSize: 1, assumeEq: false}})
  t.deepEqual(res, [
    { change: 'mod', type: 'file', path: '/bar.txt' },
    { change: 'mod', type: 'file', path: '/subdir/foo.txt' }
  ])
  t.end()
})
