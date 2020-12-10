var assert = require('assert')
var {basename} = require('path')
var streamEqual = require('stream-equal')
var {Readable} = require('streamx')
var debug = require('debug')('diff-file-tree')
var {wrapFS, join, CycleError} = require('./util')

exports.diff = async function diff (left, right, opts) {
  opts = opts || {}
  var compareContentCache = opts.compareContentCache
  var seen = new Set()
  var changes = []
  left = wrapFS(left)
  right = wrapFS(right)
  await walk('/')
  return changes

  async function walk (path) {
    // get files in folder
    var [leftNames, rightNames] = await Promise.all([
      left.readdir(path),
      right.readdir(path)
    ])

    // run ops based on set membership
    var ps = []
    debug('walk', path, leftNames, rightNames)
    leftNames.forEach(name => {
      if (rightNames.indexOf(name) === -1) {
        ps.push(addRecursive(join(path, name)))
      } else {
        ps.push(diff(join(path, name)))
      }
    })
    rightNames.forEach(name => {
      if (leftNames.indexOf(name) === -1) {
        ps.push(delRecursive(join(path, name)))
      } else {
        // already handled
      }
    })
    return Promise.all(ps)
  }

  async function diff (path) {
    debug('diff', path)
    if (opts.filter && opts.filter(path)) {
      return
    }
    // stat the entry
    var [leftStat, rightStat] = await Promise.all([
      left.stat(path),
      right.stat(path)
    ])
    // check for cycles
    checkForCycle(leftStat, path)
    checkForCycle(rightStat, path)
    // both a file
    if (leftStat.isFile() && rightStat.isFile()) {
      return diffFile(path, leftStat, rightStat)
    }
    // both a dir
    if (leftStat.isDirectory() && rightStat.isDirectory()) {
      return walk(path)
    }
    // incongruous, remove all in archive then add all in staging
    await delRecursive(path, true)
    await addRecursive(path, true)
  }

  async function diffFile (path, leftStat, rightStat) {
    debug('diffFile', path)
    var isEq = (
      (leftStat.size === rightStat.size) &&
      (isTimeEqual(leftStat.mtime, rightStat.mtime))
    )
    if (!isEq && opts.compareContent) {
      // try the cache
      let cacheHit = false
      if (compareContentCache) {
        let cacheEntry = compareContentCache[path]
        if (cacheEntry && cacheEntry.leftMtime === +leftStat.mtime && cacheEntry.rightMtime === +rightStat.mtime) {
          isEq = cacheEntry.isEq
          cacheHit = true
        }
      }

      // actually compare the files
      if (!cacheHit) {
        let szl = opts.sizeLimit && opts.sizeLimit.maxSize ? opts.sizeLimit.maxSize : 0
        if (szl && (leftStat.size > szl || rightStat.size > szl)) {
          isEq = opts.sizeLimit.assumeEq || false
        } else {
          let ls = await left.createReadStream(path)
          let rs = await right.createReadStream(path)
          isEq = await new Promise((resolve, reject) => {
            streamEqual(ls, rs, (err, res) => {
              if (err) reject(err)
              else resolve(res)
            })
          })
        }
      }

      // store in the cache
      if (compareContentCache && !cacheHit) {
        compareContentCache[path] = {
          leftMtime: +leftStat.mtime,
          rightMtime: +rightStat.mtime,
          isEq
        }
      }
    }
    if (!isEq) {
      changes.push({change: 'mod', type: 'file', path})
    }
  }

  async function addRecursive (path, isFirstRecursion = false) {
    debug('addRecursive', path)
    if (opts.filter && opts.filter(path)) {
      return
    }
    // find everything at and below the current path in staging
    // they should be added
    var st = await left.stat(path)
    if (!isFirstRecursion /* when first called from diff(), dont check for a cycle again */) {
      checkForCycle(st, path)
    }
    if (st.isFile()) {
      changes.push({change: 'add', type: 'file', path})
    } else if (st.isDirectory()) {
      // add dir first
      changes.push({change: 'add', type: 'dir', path})
      // add children second
      if (!opts.shallow) {
        var children = await left.readdir(path)
        await Promise.all(children.map(name => addRecursive(join(path, name))))
      }
    }
  }

  async function delRecursive (path, isFirstRecursion = false) {
    debug('delRecursive', path)
    if (opts.filter && opts.filter(path)) {
      return
    }
    // find everything at and below the current path in the archive
    // they should be removed
    var st = await right.stat(path)
    if (!isFirstRecursion /* when first called from diff(), dont check for a cycle again */) {
      checkForCycle(st, path)
    }
    if (st.isFile()) {
      changes.push({change: 'del', type: 'file', path})
    } else if (st.isDirectory()) {
      // del children first
      if (!opts.shallow) {
        var children = await right.readdir(path)
        await Promise.all(children.map(name => delRecursive(join(path, name))))
      }
      // del dir second
      changes.push({change: 'del', type: 'dir', path})
    }
  }

  function checkForCycle (st, path) {
    if (!st.ino) return // not all "filesystem" implementations we use have inodes (eg Dat)
    var id = `${st.dev}-${st.ino}-${basename(path)}` // include basename because windows apparently gives dup inodes sometimes
    if (seen.has(id)) {
      throw new CycleError(path)
    }
    seen.add(id)
  }
}

exports.applyRight = async function applyRight (left, right, changes) {
  left = wrapFS(left)
  right = wrapFS(right)
  assert(Array.isArray(changes), 'Valid changes')

  // copies can be done in parallel
  var copyPromises = []

  // apply changes
  debug('applyRight', changes)
  for (let i = 0; i < changes.length; i++) {
    let d = changes[i]
    let op = d.change + d.type
    if (op === 'adddir') {
      debug('mkdir', d.path)
      await right.mkdir(d.path)
    }
    if (op === 'deldir') {
      debug('rmdir', d.path)
      await right.rmdir(d.path)
    }
    if (op === 'addfile' || op === 'modfile') {
      debug('writeFile', d.path)
      copyPromises.push(left.copyTo(right, d.path))
    }
    if (op === 'delfile') {
      debug('unlink', d.path)
      await right.unlink(d.path)
    }
  }
  return Promise.all(copyPromises)
}

exports.applyRightStream = function applyRightStream (left, right, changes) {
  left = wrapFS(left)
  right = wrapFS(right)
  assert(Array.isArray(changes), 'Valid changes')
  var stream = new Readable()

  debug('applyRightStream', changes)
  var i = 0
  var closed = false
  stream.on('close', () => {
    debug(`applyRightStream closed on i=${i}`)
    closed = true
  })
  async function tick () {
    if (closed) return

    let d = changes[i]
    if (!d) return stream.push(null)

    try {
      let op = d.change + d.type
      if (op === 'adddir') {
        debug('mkdir', d.path)
        stream.push({op: 'mkdir', path: d.path})
        await right.mkdir(d.path)
      }
      if (op === 'deldir') {
        debug('rmdir', d.path)
        stream.push({op: 'rmdir', path: d.path})
        await right.rmdir(d.path)
      }
      if (op === 'addfile' || op === 'modfile') {
        debug('writeFile', d.path)
        stream.push({op: 'writeFile', path: d.path})
        await left.copyTo(right, d.path)
      }
      if (op === 'delfile') {
        debug('unlink', d.path)
        stream.push({op: 'unlink', path: d.path})
        await right.unlink(d.path)
      }
    } catch (e) {
      return stream.destroy(e)
    }

    i++
    if (i < changes.length) {
      tick()
    } else {
      stream.push(null)
    }
  }
  tick()

  return stream
}

exports.applyLeft = async function applyLeft (left, right, changes) {
  left = wrapFS(left)
  right = wrapFS(right)
  assert(Array.isArray(changes), 'Valid changes')

  // copies can be done in parallel
  var copyPromises = []

  // apply opposite changes, in reverse
  debug('applyLeft', changes)
  for (let i = changes.length - 1; i >= 0; i--) {
    let d = changes[i]
    let op = d.change + d.type
    if (op === 'adddir') {
      debug('rmdir', d.path)
      await left.rmdir(d.path)
    }
    if (op === 'deldir') {
      debug('mkdir', d.path)
      await left.mkdir(d.path)
    }
    if (op === 'addfile') {
      debug('unlink', d.path)
      await left.unlink(d.path)
    }
    if (op === 'modfile' || op === 'delfile') {
      debug('writeFile', d.path)
      copyPromises.push(right.copyTo(left, d.path))
    }
  }
  return Promise.all(copyPromises)
}

function isTimeEqual (left, right) {
  left = +left
  right = +right
  return left === right
}
