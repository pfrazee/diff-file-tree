const test = require('tape')
const MemoryFileSystem = require('memory-fs')
const dft = require('./index')

test('diff', async t => {
  await runTests(async function check (leftDesc, rightDesc, expected) {
    try {
      console.log('## diff', leftDesc, rightDesc)
      var left = mock(leftDesc)
      var right = mock(rightDesc)

      t.deepEqual(sortDiffs(await dft.diff({fs: left}, {fs: right})), expected)
    } catch (err) {
      t.fail(err)
    }
  })
  t.end()
})

test('applyRight', async t => {
  await runTests(async function check (leftDesc, rightDesc, expected) {
    try {
      console.log('## applyRight', leftDesc, rightDesc)
      var left = mock(leftDesc)
      var right = mock(rightDesc)
      
      var diffs = await dft.diff({fs: left}, {fs: right})
      t.deepEqual(sortDiffs(diffs), expected)

      await dft.applyRight({fs: left}, {fs: right}, diffs)
      t.same((await dft.diff({fs: left}, {fs: right})).length, 0)
    } catch (err) {
      t.fail(err)
    }
  })
  t.end()
})

test('applyLeft', async t => {
  await runTests(async function check (leftDesc, rightDesc, expected) {
    try {
      console.log('## applyLeft', leftDesc, rightDesc)
      var left = mock(leftDesc)
      var right = mock(rightDesc)

      var diffs = await dft.diff({fs: left}, {fs: right})
      t.deepEqual(sortDiffs(diffs), expected)
      
      await dft.applyLeft({fs: left}, {fs: right}, diffs)
      t.same((await dft.diff({fs: left}, {fs: right})).length, 0)
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
  await check([['/a', 'foo']], [['/a', 'bar']], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', 'foo']], [['/a', Buffer.from([1,2,3,4])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', Buffer.from([4,3,2,1])]], [['/a', 'bar']], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
  await check([['/a', Buffer.from([4,3,2,1])]], [['/a',  Buffer.from([1,2,3,4])]], [
    {change: 'mod', type: 'file', path: '/a'}
  ])
}

function mock (desc) {
  var mfs = new MemoryFileSystem()
  desc.forEach(item => {
    if (typeof item === 'string') {
      item = [item, 'content']
    }
    if (item[0].endsWith('/')) {
      mfs.mkdirSync(item[0])
    } else {
      mfs.writeFileSync(item[0], item[1], Buffer.isBuffer(item[1]) ? 'binary' : 'utf8')
    }
  })
  return mfs
}

function sortDiffs (diffs) {
  diffs = diffs.slice() // clone the array
  diffs.sort(function (a, b) {
    return a.path.localeCompare(b.path)
  })
  return diffs
}