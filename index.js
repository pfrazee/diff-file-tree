var assert = require('assert')
var streamEqual = require('stream-equal')
var debug = require('debug')('diff-file-tree')
var {wrapFS, join} = require('./util')

exports.diff = async function diff (left, right, opts) {
  opts = opts || {}
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
    // both a file
    if (leftStat.isFile() && rightStat.isFile()) {
      return diffFile(path, leftStat, rightStat)
    }
    // both a dir
    if (leftStat.isDirectory() && rightStat.isDirectory()) {
      return walk(path)
    }
    // incongruous, remove all in archive then add all in staging
    await delRecursive(path)
    await addRecursive(path)
  }

  async function diffFile (path) {
    debug('diffFile', path)
    var isEq = await new Promise((resolve, reject) => {
      streamEqual(
        left.createReadStream(path),
        right.createReadStream(path),
        (err, res) => {
          if (err) reject(err)
          else resolve(res)
        }
      )
    })
    if (!isEq) {
      changes.push({change: 'mod', type: 'file', path})
    }
  }

  async function addRecursive (path) {
    debug('addRecursive', path)
    if (opts.filter && opts.filter(path)) {
      return
    }
    // find everything at and below the current path in staging
    // they should be added
    var st = await left.stat(path)
    if (st.isFile()) {
      changes.push({change: 'add', type: 'file', path})
    } else if (st.isDirectory()) {
      // add dir first
      changes.push({change: 'add', type: 'dir', path})
      // add children second
      var children = await left.readdir(path)
      await Promise.all(children.map(name => addRecursive(join(path, name))))
    }
  }

  async function delRecursive (path) {
    debug('delRecursive', path)
    if (opts.filter && opts.filter(path)) {
      return
    }
    // find everything at and below the current path in the archive
    // they should be removed
    var st = await right.stat(path)
    if (st.isFile()) {
      changes.push({change: 'del', type: 'file', path})
    } else if (st.isDirectory()) {
      // del children second
      var children = await right.readdir(path)
      await Promise.all(children.map(name => delRecursive(join(path, name))))
      // del dir second
      changes.push({change: 'del', type: 'dir', path})
    }
  }
}

exports.applyRight = async function applyRight (left, right, changes) {

  left = wrapFS(left)
  right = wrapFS(right)
  assert(Array.isArray(changes), 'Valid changes')

  // apply changes
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
      await left.copyTo(right, d.path)
    }
    if (op === 'delfile') {
      debug('unlink', d.path)
      await right.unlink(d.path)
    }
  }
}

exports.applyLeft = async function applyLeft (left, right, changes) {
  left = wrapFS(left)
  right = wrapFS(right)
  assert(Array.isArray(changes), 'Valid changes')

  // apply opposite changes, in reverse
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
      await right.copyTo(left, d.path)
    }
  }
}
