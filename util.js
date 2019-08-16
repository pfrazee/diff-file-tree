var assert = require('assert')
var path = require('path')
var promisify = require('es6-promisify')
var fs = require('fs')
var pump = require('pump')

var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/

function join (rootpath, subpath) {
  // make sure they're not using '..' to get outside of rootpath
  if (UP_PATH_REGEXP.test(path.normalize('.' + path.sep + subpath))) {
    throw new Error(`Invalid path: ${subpath}`)
  }
  return path.normalize(path.join(rootpath, subpath))
}
exports.join = join

exports.wrapFS = function (desc) {
  if (typeof desc === 'string') {
    desc = {path: desc, fs}
  }
  desc.path = desc.path || '/'
  assert(desc && typeof desc === 'object', 'Invalid filesystem target')
  assert(desc.fs && typeof desc.fs === 'object', 'Invalid filesystem target (.fs)')
  assert(desc.path && typeof desc.path === 'string', 'Invalid filesystem target (.path)')

  var stat = promisify(desc.fs.stat, desc.fs)
  var readdir = promisify(desc.fs.readdir, desc.fs)
  var mkdir = promisify(desc.fs.mkdir, desc.fs)
  var rmdir = promisify(desc.fs.rmdir, desc.fs)
  var unlink = promisify(desc.fs.unlink, desc.fs)
  var utimes = desc.fs.utimes ? promisify(desc.fs.utimes, desc.fs) : noop
  return {
    path: desc.path,
    stat (subpath) { return stat(join(desc.path, subpath)) },
    readdir (subpath) { return readdir(join(desc.path, subpath)) },
    createReadStream (subpath, opts) { return desc.fs.createReadStream(join(desc.path, subpath), opts) },
    createWriteStream (subpath, opts) { return desc.fs.createWriteStream(join(desc.path, subpath), opts) },
    utimes (subpath, atime, mtime) { return utimes(join(desc.path, subpath), atime, mtime) },
    mkdir (subpath) { return mkdir(join(desc.path, subpath)) },
    rmdir (subpath) { return rmdir(join(desc.path, subpath)) },
    unlink (subpath) { return unlink(join(desc.path, subpath)) },
    async copyTo (target, subpath) {
      // hyperdrive supports giving the ctime and mtime in the write stream
      // we need to do this for diffs by size & mtime to work
      // meanwhile the fs uses utimes, so we use that
      var st = await this.stat(subpath)
      var rs = await this.createReadStream(subpath)
      var ws = await target.createWriteStream(subpath, {mtime: st.mtime, ctime: st.ctime})
      await new Promise((resolve, reject) => {
        pump(rs, ws, err => {
          if (err) reject(err)
          else resolve()
        })
      })
      return target.utimes(subpath, st.mtime, st.mtime)
    }
  }
}

async function noop () {}

exports.CycleError = class CycleError extends Error {
  constructor (path) {
    var msg = `Aborting file-tree comparison, a symlink or hardlink loop was detected at ${path}`
    super(msg)
    this.name = 'CycleError'
    this.message = msg
  }
}
