import assert from 'node:assert/strict'
import { candidates, normalise } from './address.ts'

assert.equal(normalise('  '), '')
assert.equal(normalise('192.168.1.50'), 'http://192.168.1.50')
assert.equal(normalise('voron.local:7125/'), 'http://voron.local:7125')
assert.equal(normalise('http://mainsail.lan/#/console'), 'http://mainsail.lan')
assert.equal(normalise('http://fluidd.lan/dashboard'), 'http://fluidd.lan')
assert.equal(normalise('https://printer.lan/moonraker/'), 'https://printer.lan/moonraker')
assert.equal(normalise('http://10.1.24.221:5185/mr'), 'http://10.1.24.221:5185/mr')
assert.throws(() => normalise('ftp://printer'))
assert.throws(() => normalise('http://'))
assert.deepEqual(candidates(''), [])
assert.deepEqual(candidates('mainsail.lan'), ['http://mainsail.lan', 'http://mainsail.lan:7125'])
assert.deepEqual(candidates('mainsail.lan:7125'), ['http://mainsail.lan:7125'])
assert.deepEqual(candidates('http://host:5185/mr'), ['http://host:5185/mr'])
console.log('address: ok')
