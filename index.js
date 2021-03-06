// no npm!
const os        = require('os')
const { spawn } = require('child_process');
const stdin     = process.openStdin()
const lokinet   = require('./lokinet');

// reads ~/.loki/[testnet/]key

//
// start config
//

var lokid_config = {
  binary_location: 'src/loki/build/release/bin/lokid',
  network : "test",
  rpc_ip  : '127.0.0.1',
  rpc_port: 0, // 0 means base on default network port
  rpc_user: 'user',
  rpc_pass: 'pass',
}

var lokinet_config = {
  binary_location : 'src/loki-network/lokinet',
  bootstrap_url   : 'http://206.81.100.174/n-st-1.signed',
  rpc_ip          : '127.0.0.1',
  rpc_port        : 28082,
  public_port     : 1090,
  // just make them the same for now
  // but build the system so they could be separate
  testnet : lokid_config.network == "test",
}
//
// end config
//

// autoconfig
if (lokid_config.rpc_port === 0) {
  if (lokid_config.network.toLowerCase() == "test" || lokid_config.network.toLowerCase() == "testnet" || lokid_config.network.toLowerCase() == "test-net") {
    lokid_config.rpc_port = 38157
  } else
  if (lokid_config.network.toLowerCase() == "staging" || lokid_config.network.toLowerCase() == "stage") {
    lokid_config.rpc_port = 28082
  } else {
    // main
    lokid_config.rpc_port = 18082
  }
}

// upload lokid to lokinet
lokinet_config.lokid = lokid_config

// TODO storage server
const storageServer_location = ''

// ugly hack for Ryan's mac box
if (os.platform() == 'darwin') {
  process.env.DYLD_LIBRARY_PATH = 'depbuild/boost_1_64_0/stage/lib'
}

const storageServer_ip   = '127.0.0.1'
const storageServer_port = '8080'

var shuttingDown = false

var storage_server
function launchStorageServer(cb) {
  storage_server = spawn(storageServer_location, [tmpPath]);
  storage_server.stdout.on('data', (data) => {
    var parts = data.toString().split(/\n/)
    parts.pop()
    data = parts.join('\n')
    console.log(`StorageServer: ${data}`)
  })

  storage_server.stderr.on('data', (data) => {
    console.log(`StorageServerErr: ${data}`)
  })

  storage_server.on('close', (code) => {
    console.log(`StorageServer process exited with code ${code}`)
    if ((loki_daemon && loki_daemon.killed) || shuttingDown) {
      console.log('loki_daemon is also down, stopping launcher')
      stdin.pause()
    } else {
      console.log('loki_daemon is still running, restarting storage server')
      launchStorageServer()
    }
  })
  if (cb) cb()
}

//console.log('userInfo', os.userInfo('utf8'))
//console.log('started as', process.getuid(), process.geteuid())
if (os.platform() == 'darwin') {
  if (process.getuid() != 0) {
    console.error('MacOS requires you start this with sudo')
    process.exit()
  }
} else {
  if (process.getuid() == 0) {
    console.error('Its not recommended you run this as root')
  }
}

lokinet.startServiceNode(lokinet_config)

/*
try {
  process.seteuid('rtharp')
  console.log(`New uid: ${process.geteuid()}`)
} catch(err) {
  console.log(`Failed to set uid: ${err}`)
}
*/

var lokid_options = ['--service-node', '--rpc-login='+lokid_config.rpc_user+':'+lokid_config.rpc_pass+'']
if (lokid_config.network.toLowerCase() == "test" || lokid_config.network.toLowerCase() == "testnet" || lokid_config.network.toLowerCase() == "test-net") {
  lokid_options.push('--testnet')
} else
if (lokid_config.network.toLowerCase() == "staging" || lokid_config.network.toLowerCase() == "stage") {
  lokid_options.push('--stagenet')
}

const loki_daemon = spawn(lokid_config.binary_location, lokid_options);

loki_daemon.stdout.on('data', (data) => {
  var parts = data.toString().split(/\n/)
  parts.pop()
  data = parts.join('\n')
  if (data.trim()) {
    console.log(`lokid: ${data}`)
  }
})

loki_daemon.stderr.on('data', (data) => {
  console.log(`lokiderr: ${data}`)
})

loki_daemon.on('close', (code) => {
  console.log(`loki_daemon process exited with code ${code}`)
  shuttingDown = true
  stdin.pause()
  if (lokinet.isRunning()) {
    lokinet.stop()
  } else {
    console.log('lokinet is not running, trying to exit')
    // lokinet could be waiting to start up
    process.exit()
  }
})

// resume stdin in the parent process (node app won't quit all by itself
// unless an error or process.exit() happens)
stdin.resume()

// i don't want binary, do you?
stdin.setEncoding( 'utf8' )

// on any data into stdin
stdin.on( 'data', function( key ){
  // ctrl-c ( end of text )
  if ( key === '\u0003' ) {
    process.exit()
  }
  // local echo, write the key to stdout all normal like
  if (!shuttingDown) {
    // on ssh we don't need this
    //process.stdout.write(key)
    loki_daemon.stdin.write(key)
  }
})

process.on('SIGHUP', () => {
  console.log('shuttingDown?', shuttingDown)
  console.log('loki_daemon status', loki_daemon)
  console.log('lokinet status', lokinet.isRunning())
})
