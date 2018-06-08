const test = require('tape')
const {mock, mockCyclical} = require('./util')
const dft = require('../index')

test('diff with cycles (left)', async t => {
  try {
    var left = mockCyclical()
    var right = mock(['/subdir/', '/subdir/foo.txt', '/bar.txt'])
    var res = await dft.diff({fs: left}, {fs: right})
    console.log('Got', res)
    t.fail('Should have thrown')
  } catch (err) {
    t.is(err.name, 'CycleError')
  }
  t.end()
})

test('diff with cycles (right)', async t => {
  try {
    var left = mock(['/subdir/', '/subdir/foo.txt', '/bar.txt'])
    var right = mockCyclical()
    var res = await dft.diff({fs: left}, {fs: right})
    console.log('Got', res)
    t.fail('Should have thrown')
  } catch (err) {
    t.is(err.name, 'CycleError')
  }
  t.end()
})
