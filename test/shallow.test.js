const test = require('tape')
const {sortDiffs, mock} = require('./util')
const dft = require('../index')

test('diff (shallow)', async t => {
  await runTests(async function check (leftDesc, rightDesc, expected) {
    try {
      console.log('## diff (shallow)', leftDesc, rightDesc)
      var left = mock(leftDesc)
      var right = mock(rightDesc)

      t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right}, {shallow: true, compareContent: true})), expected)
    } catch (err) {
      t.fail(err)
    }
  })
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
    {change: 'add', type: 'dir', path: '/a'}
  ])
  await check([], ['/a'], [
    {change: 'del', type: 'file', path: '/a'}
  ])
  await check([], ['/a/'], [
    {change: 'del', type: 'dir', path: '/a'}
  ])
  await check([], ['/a/', '/a/a'], [
    {change: 'del', type: 'dir', path: '/a'}
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
  await check([['/a', 'foo']], [['/a', 'barr']], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', 'foo']], [['/a', Buffer.from([1, 2, 3, 4])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', Buffer.from([4, 3, 2, 1])]], [['/a', 'bar']], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', Buffer.from([4, 3, 2, 1])]], [['/a', Buffer.from([1, 2, 3, 4, 5])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
}
