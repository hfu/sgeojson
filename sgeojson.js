require('dotenv').config()
const sqlite3 = require('sqlite3').verbose()
const tilebelt = require('@mapbox/tilebelt')
const zlib = require('zlib')
const VectorTile = require('@mapbox/vector-tile').VectorTile
const Protobuf = require('pbf')

const q = function(v) {
  for(let i = 0; true; i++) {
    if(v / (2 ** i) < 1) return i - 1
  }
}

const db = new sqlite3.Database(process.env.MBTILES, sqlite3.OPEN_READONLY)
db.each(`SELECT * FROM tiles WHERE zoom_level=${process.env.Z}`, (err, r) => {
  if (err) throw err
  const [z, x, y] = 
    [r.zoom_level, r.tile_column, (1 << r.zoom_level) - r.tile_row - 1]
  let buf = r.tile_data
  if (process.env.GZIPPED === 'true') buf = zlib.gunzipSync(buf)
  const tile = new VectorTile(new Protobuf(buf))
  let version = -1
  let extent = -1
  let stat = {}
  for(const name of Object.keys(tile.layers)) {
    let count = 0
    for(let i = 0; i < tile.layers[name].length; i++) {
      for(let a of tile.layers[name].feature(i).loadGeometry()) {
        count += a.length
      }
    }
    version = tile.layers[name].version
    extent = tile.layers[name].extent
    stat[name] = count
  }
  let json = {type: 'Feature'}
  json.geometry = tilebelt.tileToGeoJSON([x, y, z])
  json.properties = {
    size: buf.length, q: q(buf.length), version: version, extent: q(extent),
    stat: JSON.stringify(stat)
  }
  console.log(JSON.stringify(json))
}, (err, count) => {
  db.close()
})
