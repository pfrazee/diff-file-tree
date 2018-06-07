const tempy = require('tempy')
const ScopedFS = require('scoped-fs')
const fs = require('fs')
const path = require('path')

module.exports.mock = function mock (desc) {
  var sfs = new ScopedFS(tempy.directory())
  desc.forEach(item => {
    if (typeof item === 'string') {
      item = [item, 'content']
    }
    if (item[0].endsWith('/')) {
      fs.mkdirSync(path.join(sfs.base, item[0]))
    } else if (item[0].endsWith('*')) {
      var symlinkTarget = tempy.directory()
      fs.writeFileSync(path.join(symlinkTarget, 'symlink-target-file.txt'), 'hi', 'utf8')
      console.log('symlinking', path.join(sfs.base, item[0].slice(0, -1)), symlinkTarget)
      fs.symlinkSync(symlinkTarget, path.join(sfs.base, item[0].slice(0, -1)))
    } else {
      fs.writeFileSync(path.join(sfs.base, item[0]), item[1], Buffer.isBuffer(item[1]) ? 'binary' : 'utf8')
    }
  })
  return sfs
}

module.exports.sortDiffs = function sortDiffs (diffs) {
  diffs = diffs.slice() // clone the array
  diffs.sort(function (a, b) {
    return a.path.localeCompare(b.path)
  })
  return diffs
}
