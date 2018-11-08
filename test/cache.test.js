const test = require('tape')
const {sortDiffs, mock} = require('./util')
const dft = require('../index')

test('diff with cache', async t => {
  await runTests(async function check (leftDesc, rightDesc, expected, expectedCacheKeys) {
    try {
      console.log('## diff', leftDesc, rightDesc)
      var left = mock(leftDesc)
      var right = mock(rightDesc)
      var compareContentCache = {}

      t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right}, {compareContent: true, compareContentCache})), expected)
      if (expectedCacheKeys) {
        t.deepEqual(Object.keys(compareContentCache), expectedCacheKeys)
      }
      t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right}, {compareContent: true, compareContentCache})), expected)
    } catch (err) {
      t.fail(err)
    }
  })
  t.end()
})

test('diff with cache when == but different mtimes', async t => {
  var left = mock([['/a', 'foo']])
  console.log('waiting 1.5s to get different mtime')
  await new Promise((resolve, reject) => setTimeout(resolve, 1.5e3))
  var right = mock([['/a', 'foo']])
  var compareContentCache = {}

  t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right}, {compareContent: true, compareContentCache})), [])
  t.deepEqual(compareContentCache['/a'].isEq, true)
  t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right}, {compareContent: true, compareContentCache})), [])
  t.end()
})

async function runTests (check) {
  await check([], [], [])
  await check(['/a'], ['/a'], [])
  await check(['/a/', '/a/a'], ['/a/', '/a/a'], [])
  await check(['/a/', '/a/a/', '/a/a/a'], ['/a/', '/a/a/', '/a/a/a'], [])
  await check(['/a/', '/a/a/', '/a/a/a/', '/a/a/a/a'], ['/a/', '/a/a/', '/a/a/a/', '/a/a/a/a'], [])
  await check(['/a'], [], [
    {change: 'add', type: 'file', path: '/a'}
  ])
  await check(['/a/'], [], [
    {change: 'add', type: 'dir', path: '/a'}
  ])
  await check(['/a/', '/a/a'], [], [
    {change: 'add', type: 'dir', path: '/a'},
    {change: 'add', type: 'file', path: '/a/a'}
  ])
  await check([], ['/a'], [
    {change: 'del', type: 'file', path: '/a'}
  ])
  await check([], ['/a/'], [
    {change: 'del', type: 'dir', path: '/a'}
  ])
  await check([], ['/a/', '/a/a'], [
    {change: 'del', type: 'dir', path: '/a'},
    {change: 'del', type: 'file', path: '/a/a'}
  ])
  await check(['/a'], ['/b'], [
    {change: 'add', type: 'file', path: '/a'},
    {change: 'del', type: 'file', path: '/b'}
  ])
  await check(['/a/', '/a/a/', '/a/a/a/', '/a/a/a/a'], ['/a/', '/a/a/', '/a/a/a/', '/a/a/a/b'], [
    {change: 'add', type: 'file', path: '/a/a/a/a'},
    {change: 'del', type: 'file', path: '/a/a/a/b'}
  ])
  await check(['/a/'], ['/b/'], [
    {change: 'add', type: 'dir', path: '/a'},
    {change: 'del', type: 'dir', path: '/b'}
  ])
  await check(['/a'], ['/a/'], [
    {change: 'del', type: 'dir', path: '/a'},
    {change: 'add', type: 'file', path: '/a'}
  ])
  await check(['/a/'], ['/a'], [
    {change: 'del', type: 'file', path: '/a'},
    {change: 'add', type: 'dir', path: '/a'}
  ])
  await check([['/a', 'foo']], [['/a', 'foo']], [])
  await check([['/a', 'foo']], [['/a', 'barr']], [
    {change: 'mod', type: 'file', path: '/a'}
  ], ['/a'])
  await check([['/a', 'foo'], ['/b', 'foo']], [['/a', 'barr'], ['/b', 'foo']], [
    {change: 'mod', type: 'file', path: '/a'}
  ], ['/a'])
  await check([['/a', 'foo'], ['/b', 'foo']], [['/a', 'barr'], ['/b', 'fozzo']], [
    {change: 'mod', type: 'file', path: '/a'},
    {change: 'mod', type: 'file', path: '/b'}
  ], ['/a', '/b'])
  await check([['/a', 'foo']], [['/a', Buffer.from([1, 2, 3, 4])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ], ['/a'])
  await check([['/a', Buffer.from([4, 3, 2, 1])]], [['/a', 'bar']], [
    {change: 'mod', type: 'file', path: '/a'}
  ], ['/a'])
  await check([['/a', Buffer.from([4, 3, 2, 1])]], [['/a', Buffer.from([1, 2, 3, 4, 5])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ], ['/a'])
}
