const {app, BrowserWindow, Menu, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const windowStateKeeper = require('electron-window-state');
const parseString = require('xml2js').parseString;

const http = require('http');
const WebSocketServer = require('websocket').server;
const UrlParser = require('url');
const cheerio = require('cheerio');
const rp = require('request-promise');
const { lookup } = require('dns');
const sqlite3 = require('sqlite3').verbose();

let bibles = [];

let mainWindow;
let offscreenWindow;
let wsServer;
let clients = [];
let live_cards = {
  'a': undefined,
  'b': undefined,
  'c': undefined
}

const resource_path = path.join(app.getPath('documents'), 'CG Controller')

if (!fs.existsSync(resource_path)) {
  fs.mkdirSync(resource_path);
}

app.disableHardwareAcceleration();

require('electron-context-menu')({
	showInspectElement: false
});

var SERVER_URL;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
class Library {
  constructor() {
    this.library = [];
    this.playlists = [];
    this.metadata = {};
    console.log(app.getPath('userData'));
    this.path = path.join(resource_path, "Library");
    if (!fs.existsSync(this.path)){
      fs.mkdirSync(this.path);
    }
    if (!fs.existsSync(path.join(this.path, '_metadata.dat'))){
      this.write('_metadata.dat', {});
    }
    if (!fs.existsSync(path.join(this.path, '_preferences.dat'))){
      this.write('_preferences.dat', {});
    }
    this.scan();
  }

  generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  getExtension(itemType) {
    switch(itemType) {
      case 'cg-library-item':
        return '.cgl'

      case 'cg-playlist-item':
        return '.cgp'
    }
  }

  getLibraryItems(){
    return this.library
  }

  getPlaylistItems(){
    return this.playlists
  }

  scan() {
    this.library = [];
    this.playlists = [];
    var items = fs.readdirSync(this.path);
    for(var file of items) {
      if (file.endsWith(".cgl")) {
        this.library.push(file.slice(0,-4));
      }
      if (file.endsWith(".cgp")) {
        this.playlists.push(file.slice(0,-4));
      }
    }
    this.metadata = this.read('_metadata.dat');
    this.prefs = this.read('_preferences.dat');
  }

  write(itemName, data) {
    var filePath = path.join(this.path, itemName);
    var data = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, data);
  }

  read(itemName) {
    var filePath = path.join(this.path, itemName);
    var data = fs.readFileSync(filePath);
    var data = JSON.parse(data);

    return data
  }

  remove(itemName) {
    var filePath = path.join(this.path, itemName);
    fs.unlinkSync(filePath);
  }

  rename(itemType, oldName, newName) {
    console.log(itemType);
    var ext = this.getExtension(itemType);
    var oldPath = path.join(this.path, oldName + ext);
    var newPath = path.join(this.path, newName + ext);
    fs.renameSync(oldPath, newPath);
    this.scan();
  }

  updateMetadata(key, data) {
    this.metadata[key] = data;
    this.write('_metadata.dat', this.metadata);
  }

  getMetadata(key) {
    return this.metadata[key];
  }

  getAllMetadata() {
    return this.metadata;
  }

  updatePrefs(key, data) {
    this.prefs[key] = data;
    this.write('_preferences.dat', this.prefs);
  }

  updateAllPrefs(prefs) {
    this.prefs = prefs;
    this.write('_preferences.dat', this.prefs);
  }

  getPref(key) {
    return this.prefs[key];
  }

  getAllPrefs() {
    return this.prefs;
  }

  getUUID(name) {
    for(var uuid in this.metadata) {
      var item = this.metadata[uuid];
      if (item['name'] == name) {
        return uuid
      }
    }
  }

}
// expose the class
module.exports = Library;

let library = new Library();
library.scan();

ipcMain.on('get-library-data', (event) => {
  console.log('sending library data');
  var data = {
    library: library.getLibraryItems(),
    playlists: library.getPlaylistItems()
  };
  event.sender.send('library-data', data);
});

ipcMain.on('get-library-item', (event, name) => {
  var data = library.read(name+'.cgl');
  event.sender.send('library-item', name, data);
});

ipcMain.on('get-program-item', (event, name, index, goLive) => {
  var data = library.read(name+'.cgl');
  event.sender.send('program-item', name, data, index, goLive);
});

ipcMain.on('update-library-item', (event, name, data) => {
  library.write(name+'.cgl', data);
});

ipcMain.on('get-playlist-item', (event, name) => {
  var data = library.read(name+'.cgp');
  var items = [];
  if (typeof data['items'] !== 'undefined') {
    for (var uuid of data['items']) {
      items.push(library.getMetadata(uuid)['name']);
    }
    data['items'] = items;
  }
  
  event.sender.send('playlist-item', name, data);
});

ipcMain.on('update-playlist-item', (event, name, data) => {
  var items = [];
  for(var item of data['items']) {
    items.push(library.getUUID(item));
  }
  data['items'] = items;
  library.write(name+'.cgp', data);
});

ipcMain.on('rename-item', (event, itemType, oldName, newName) => {
  if (itemType == 'cg-library-item') {
    var data = library.read(oldName+'.cgl');
    var newMeta = library.getMetadata(data['uuid']);
    newMeta['name'] = newName;
    library.updateMetadata(data['uuid'], newMeta);
  }
  library.rename(itemType, oldName, newName);

  library.scan();
  console.log('sending library data');
  // Return some data to the renderer process wit the mainprocess-response ID
  var data = {
    library: library.getLibraryItems(),
    playlists: library.getPlaylistItems()
  };
  event.sender.send('library-data', data);
});

ipcMain.on('get-library-data', (event) => {
  console.log('sending library data');
// Return some data to the renderer process wit the mainprocess-response ID
  var data = {
    library: library.getLibraryItems(),
    playlists: library.getPlaylistItems()
  };
  event.sender.send('library-data', data);

});

ipcMain.on('create-library-item', (event, name) => {
  var UUID = library.generateUUID();
  var item_meta = {
    name: name,
    type: 'cg-library-item',
    version: 2
  }
  library.updateMetadata(UUID, item_meta);
  item_meta['uuid'] = UUID;
  library.write(name+'.cgl', item_meta);
  library.scan();
  var data = {
    library: library.getLibraryItems(),
    playlists: library.getPlaylistItems()
  };
  event.sender.send('library-data', data);
});

ipcMain.on('create-playlist-item', (event, name) => {
  var UUID = library.generateUUID();
  var item_meta = {
    name: name,
    type: 'cg-playlist-item',
    version: 1,
    uuid: UUID
  }
  library.write(name+'.cgp', item_meta);
  library.scan();
  var data = {
    library: library.getLibraryItems(),
    playlists: library.getPlaylistItems()
  };
  event.sender.send('library-data', data);
});

ipcMain.on('remove-library-item', (event, name) => {
  library.remove(name+'.cgl');
  library.scan();
});

ipcMain.on('remove-playlist-item', (event, name) => {
  library.remove(name+'.cgp');
  library.scan();
});

ipcMain.on('get-websocket-url', (event, url) => {
  GetWebsocketUrl(url);
});

ipcMain.on('get-scripture', (event, ref, version) => {
  GetScripture(ref, version);
});

ipcMain.on('get-prefs', (event) => {
  event.returnValue = library.getAllPrefs();
});

ipcMain.on('set-prefs', (event, prefs) => {
  console.log('saving preferences...');
  library.updateAllPrefs(prefs);
});

function SendMessage(data) {
  var json = JSON.stringify(data);
  console.log(json);
  for (var i=0; i < clients.length; i++) {
    clients[i].sendUTF(json);
  }
}

ipcMain.on('send-cmd', (event, data) => {
  if (data['cmd'] == 'playin') {
    live_cards[data['data']['channel']] = data['data'];
  }
  if (data['cmd'] == 'playout') {
    live_cards[data['channel']] = undefined;
  }
  console.log('command:');

  console.log(live_cards);

  SendMessage(data);

});



function createMainWindow() {

    var menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
              {
                label:'New Presentation',
                click() { 
                  mainWindow.webContents.send('new-presentation');
                },
                accelerator: 'CmdOrCtrl+N'
              },
              {
                label:'New Playlist',
                click() { 
                  mainWindow.webContents.send('new-playlist');
                },
                accelerator: 'CmdOrCtrl+Shift+N'
              },
              {type:'separator'},
                {
                  label:'Exit',
                  click() { 
                    app.quit();
                  }
                }
            ],
          },
          {
            label: 'Edit',
            submenu: [
              {
                label: 'Preferences',
                click() { 
                  mainWindow.webContents.send('show-preferences');
                }
              }
            ],
        },
        {
          label: 'Developer Tools',
          submenu: [
            {
              label: 'Reload',
              click() {
                mainWindow.reload();
              },
              accelerator: 'CmdOrCtrl+R'
            },
            {
              role: 'toggledevtools',
              accelerator: 'CmdorCtrl+Shift+I'
            }
          ]
        }
    ]);
    Menu.setApplicationMenu(menu); 
    // Create the browser window.
    // Load the previous state with fallback to defaults
    let mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 800
    });

    
    mainWindow = new BrowserWindow({
    'x': mainWindowState.x,
    'y': mainWindowState.y,
    'width': mainWindowState.width,
    'height': mainWindowState.height,
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
    }
    });
    
    mainWindowState.manage(mainWindow);

    mainWindow.loadFile('html/mainWindow.html');

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    });
}

function createOffscreenWindow() {
    offscreenWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false, // Set this to false to make it offscreen
        transparent: true,
        enableLargerThanScreen: true,
        webPreferences: {
          offscreen: true
        }
    });

    offscreenWindow.loadFile('stage.html');
    offscreenWindow.setSize(1920, 1080);

    offscreenWindow.webContents.on('paint', (event, dirty, image) => {
        // You can handle the image here if you need to display it somewhere else or process it.
        mainWindow.webContents.send('image-update', image.toBitmap());
    });
    offscreenWindow.webContents.setFrameRate(15)
    offscreenWindow.on('closed', () => {
        offscreenWindow = null;
    });
}


async function scanBibles() {
    directoryPath = path.join(resource_path, 'Bibles');
    console.log(directoryPath)
    // Read all files in the directory
    await fs.readdirSync(directoryPath).forEach(file => {
        if (path.extname(file) === '.bbli') {
            console.log('Processing: '+file);
            let dbPath = path.join(directoryPath, file);
            let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

            db.serialize(() => {
                db.get("SELECT Title, Abbreviation, Information FROM Details", (err, row) => {
                    if (err) {
                        console.error(err.message);
                    } else {
                        bibles.push({
                            Title: row.Title,
                            Abbreviation: row.Abbreviation,
                            //Information: row.Information,
                            File: file // Add the name of the file to the details
                        });
                        if (bibles.length === fs.readdirSync(directoryPath).filter(file => path.extname(file) === '.bbli').length) {
                          mainWindow.webContents.send('bibles-updated', bibles);                        }
                    }
                });
            });

            db.close();
        }
    });

    // Sort the array alphabetically based on the Abbreviation
    //bibles.sort((a, b) => a.Abbreviation.localeCompare(b.Abbreviation));

}


app.on('ready', async () => {
  console.log('Scanning Bibles...');
  await scanBibles();
  console.log('Starting Webserver...')
  RunWebserver();
  createMainWindow();
});

ipcMain.on('get-bibles', (event, args) => {
  mainWindow.webContents.send('bibles', bibles);
});

ipcMain.on('main-to-offscreen', (event, args) => {
    offscreenWindow.webContents.send('from-main', args);
});

ipcMain.on('offscreen-to-main', (event, args) => {
    mainWindow.webContents.send('from-offscreen', args);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow()
    }
  })

  function serveStaticFiles(req, res) {
    let filePath = path.join(resource_path, req.url === '/' ? 'display.html' : req.url);
    console.log(filePath);
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
  
    const contentType = mimeTypes[extname] || 'application/octet-stream';
  
    fs.readFile(filePath, function(error, content) {
      if (error) {
        if (error.code == 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 Not Found</h1>', 'utf-8');
        } else {
          res.writeHead(500);
          res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }

  function RunWebserver() {
    const server = http.createServer(function(req, res) {  
    const url_path = req.url.substring(1).split('/');
    switch (url_path[0]) {
      case 'api':
        res.writeHead(200, { 'Content-Type': 'text/json' });    
        let response = {
          status: 'failed',
          request: url_path
        };

        switch (url_path[1]) {
          case 'playin':
            mainWindow.webContents.send('playin');
            response['status'] = 'success';
            break;
          case 'playout-a':
            mainWindow.webContents.send('playout-a');
            response['status'] = 'success';
            break;
          case 'playout-b':
            mainWindow.webContents.send('playout-b');
            response['status'] = 'success';
            break;
          case 'playout-c':
            mainWindow.webContents.send('playout-c');
            response['status'] = 'success';
            break;
          case 'playout-all':
            mainWindow.webContents.send('playout-all');
            response['status'] = 'success';
            break;
          case 'cue-next':
            mainWindow.webContents.send('cue-next');
            response['status'] = 'success';
            break;
          case 'cue-prev':
            mainWindow.webContents.send('cue-prev');
            response['status'] = 'success';
            break;
        }
        
        jsonResponse = JSON.stringify(response, null, 2);
            res.write(jsonResponse);
            res.end();
            break;
      default:
        serveStaticFiles(req, res);
        break;
      }
    });
  
    server.listen(1337, function() {
      console.log('HTTP server listening on port ' + 1337);
    });
  
    wsServer = new WebSocketServer({
      httpServer: server
    });
  
    wsServer.on('request', function(request) {
      const connection = request.accept(null, request.origin);
      const index = clients.push(connection) - 1;
  
      connection.on('message', function(message) {
        if (message.type === 'utf8') {
          const json = JSON.stringify({ type: 'message', data: message.utf8Data });
          console.log(message);

          if (live_cards['a'] !== undefined) {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playin',
                data: live_cards['a']
              })
            );
          } else {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playout',
                channel: 'a'
              })
            );
          }
          if (live_cards['b'] !== undefined) {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playin',
                data: live_cards['b']
              })
            );
          } else {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playout',
                channel: 'b'
              })
            );
          }
          if (live_cards['c'] !== undefined) {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playin',
                data: live_cards['c']
              })
            );
          } else {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playout',
                channel: 'c'
              })
            );
          }
        }
      });
  
      connection.on('close', function() {
        clients.splice(index, 1);
      });
    });
  }
  
  function GetWebsocketUrl(url) {
    SERVER_URL = url;
    http.get(SERVER_URL, resp => {
      let data = '';
  
      resp.on('data', chunk => {
        data += chunk;
      });
  
      resp.on('end', () => {
        const parsed_url = new UrlParser(SERVER_URL);
        const port = /channel=([0-9]+)/.exec(resp.headers['set-cookie'])[1];
        const ws_url = `ws://${parsed_url.hostname}:${port}`;
        console.log(ws_url);
        mainWindow.webContents.send('websocket-url', ws_url);
      });
    }).on('error', err => {
      console.log('Error: ' + err.message);
    });
  }

  function GetScripture(ref_string, version) {
    book_numbers = {
      "genesis": 1, "exodus": 2, "leviticus": 3, "numbers": 4, "deuteronomy": 5,
      "joshua": 6, "judges": 7, "ruth": 8, "1 samuel": 9, "2 samuel": 10,
      "1 kings": 11, "2 kings": 12, "1 chronicles": 13, "2 chronicles": 14,
      "ezra": 15, "nehemiah": 16, "esther": 17, "job": 18, "psalms": 19,
      "proverbs": 20, "ecclesiastes": 21, "song of solomon": 22, "isaiah": 23,
      "jeremiah": 24, "lamentations": 25, "ezekiel": 26, "daniel": 27,
      "hosea": 28, "joel": 29, "amos": 30, "obadiah": 31, "jonah": 32,
      "micah": 33, "nahum": 34, "habakkuk": 35, "zephaniah": 36,
      "haggai": 37, "zechariah": 38, "malachi": 39, "matthew": 40,
      "mark": 41, "luke": 42, "john": 43, "acts": 44, "romans": 45,
      "1 corinthians": 46, "2 corinthians": 47, "galatians": 48, "ephesians": 49,
      "philippians": 50, "colossians": 51, "1 thessalonians": 52,
      "2 thessalonians": 53, "1 timothy": 54, "2 timothy": 55, "titus": 56,
      "philemon": 57, "hebrews": 58, "james": 59, "1 peter": 60, "2 peter": 61,
      "1 john": 62, "2 john": 63, "3 john": 64, "jude": 65, "revelation": 66
    };

    short_long = {
      "gen": "genesis", "exo": "exodus", "lev": "leviticus", "num": "numbers", "deu": "deuteronomy",
      "jos": "joshua", "jdg": "judges", "rut": "ruth", "1sa": "1 samuel", "2sa": "2 samuel",
      "1ki": "1 kings", "2ki": "2 kings", "1ch": "1 chronicles", "2ch": "2 chronicles",
      "ezr": "ezra", "neh": "nehemiah", "est": "esther", "job": "job", "psa": "psalms",
      "pro": "proverbs", "ecc": "ecclesiastes", "sng": "song of solomon", "isa": "isaiah",
      "jer": "jeremiah", "lam": "lamentations", "ezk": "ezekiel", "dan": "daniel",
      "hos": "hosea", "jol": "joel", "amo": "amos", "oba": "obadiah", "jon": "jonah",
      "mic": "micah", "nam": "nahum", "hab": "habakkuk", "zep": "zephaniah",
      "hag": "haggai", "zec": "zechariah", "mal": "malachi", "mat": "matthew",
      "mrk": "mark", "luk": "luke", "jhn": "john", "act": "acts", "rom": "romans",
      "1co": "1 corinthians", "2co": "2 corinthians", "gal": "galatians", "eph": "ephesians",
      "php": "philippians", "col": "colossians", "1th": "1 thessalonians", "2th": "2 thessalonians",
      "1ti": "1 timothy", "2ti": "2 timothy", "tit": "titus", "phm": "philemon",
      "heb": "hebrews", "jas": "james", "1pe": "1 peter", "2pe": "2 peter",
      "1jn": "1 john", "2jn": "2 john", "3jn": "3 john", "jud": "jude", "rev": "revelation",
      "songs": "songs of solomon", "sngs": "songs of solomon"
    };

    other_common = {
      "song of songs": "songs of solomon", "songs of songs": "songs of solomon"
    }

    chapters = {
      "genesis": {1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 22, 7: 24, 8: 22, 9: 29, 10: 32, 11: 32, 12: 20, 13: 18, 14: 24, 15: 21, 16: 16, 17: 27, 18: 33, 19: 38, 20: 18, 21: 34, 22: 24, 23: 20, 24: 67, 25: 34, 26: 35, 27: 46, 28: 22, 29: 35, 30: 43, 31: 55, 32: 32, 33: 20, 34: 31, 35: 29, 36: 43, 37: 36, 38: 30, 39: 23, 40: 23, 41: 57, 42: 38, 43: 34, 44: 34, 45: 28, 46: 34, 47: 31, 48: 22, 49: 33, 50: 26},
      "exodus": {1: 22, 2: 25, 3: 22, 4: 31, 5: 23, 6: 30, 7: 25, 8: 32, 9: 35, 10: 29, 11: 10, 12: 51, 13: 22, 14: 31, 15: 27, 16: 36, 17: 16, 18: 27, 19: 25, 20: 26, 21: 36, 22: 31, 23: 33, 24: 18, 25: 40, 26: 37, 27: 21, 28: 43, 29: 46, 30: 38, 31: 18, 32: 35, 33: 23, 34: 35, 35: 35, 36: 38, 37: 29, 38: 31, 39: 43, 40: 38},
      "leviticus": {1: 17, 2: 16, 3: 17, 4: 35, 5: 19, 6: 30, 7: 38, 8: 36, 9: 24, 10: 20, 11: 47, 12: 8, 13: 59, 14: 57, 15: 33, 16: 34, 17: 16, 18: 30, 19: 37, 20: 27, 21: 24, 22: 33, 23: 44, 24: 23, 25: 55, 26: 46, 27: 34},
      "numbers": {1: 54, 2: 34, 3: 51, 4: 49, 5: 31, 6: 27, 7: 89, 8: 26, 9: 23, 10: 36, 11: 35, 12: 16, 13: 33, 14: 45, 15: 41, 16: 50, 17: 13, 18: 32, 19: 22, 20: 29, 21: 35, 22: 41, 23: 30, 24: 25, 25: 18, 26: 65, 27: 23, 28: 31, 29: 40, 30: 16, 31: 54, 32: 42, 33: 56, 34: 29, 35: 34, 36: 13},
      "deuteronomy": {1: 46, 2: 37, 3: 29, 4: 49, 5: 33, 6: 25, 7: 26, 8: 20, 9: 29, 10: 22, 11: 32, 12: 32, 13: 18, 14: 29, 15: 23, 16: 22, 17: 20, 18: 22, 19: 21, 20: 20, 21: 23, 22: 30, 23: 25, 24: 22, 25: 19, 26: 19, 27: 26, 28: 68, 29: 29, 30: 20, 31: 30, 32: 52, 33: 29, 34: 12},
      "joshua": {1: 18, 2: 24, 3: 17, 4: 24, 5: 15, 6: 27, 7: 26, 8: 35, 9: 27, 10: 43, 11: 23, 12: 24, 13: 33, 14: 15, 15: 63, 16: 10, 17: 18, 18: 28, 19: 51, 20: 9, 21: 45, 22: 34, 23: 16, 24: 33},
      "judges": {1: 36, 2: 23, 3: 31, 4: 24, 5: 31, 6: 40, 7: 25, 8: 35, 9: 57, 10: 18, 11: 40, 12: 15, 13: 25, 14: 20, 15: 20, 16: 31, 17: 13, 18: 31, 19: 30, 20: 48, 21: 25},
      "ruth": {1: 22, 2: 23, 3: 18, 4: 22},
      "1 samuel": {1: 28, 2: 36, 3: 21, 4: 22, 5: 12, 6: 21, 7: 17, 8: 22, 9: 27, 10: 27, 11: 15, 12: 25, 13: 23, 14: 52, 15: 35, 16: 23, 17: 58, 18: 30, 19: 24, 20: 42, 21: 15, 22: 23, 23: 29, 24: 22, 25: 44, 26: 25, 27: 12, 28: 25, 29: 11, 30: 31, 31: 13},
      "2 samuel": {1: 27, 2: 32, 3: 39, 4: 12, 5: 25, 6: 23, 7: 29, 8: 18, 9: 13, 10: 19, 11: 27, 12: 31, 13: 39, 14: 33, 15: 37, 16: 23, 17: 29, 18: 33, 19: 43, 20: 26, 21: 22, 22: 51, 23: 39, 24: 25},
      "1 kings": {1: 53, 2: 46, 3: 28, 4: 34, 5: 18, 6: 38, 7: 51, 8: 66, 9: 28, 10: 29, 11: 43, 12: 33, 13: 34, 14: 31, 15: 34, 16: 34, 17: 24, 18: 46, 19: 21, 20: 43, 21: 29, 22: 53},
      "2 kings": {1: 18, 2: 25, 3: 27, 4: 44, 5: 27, 6: 33, 7: 20, 8: 29, 9: 37, 10: 36, 11: 21, 12: 21, 13: 25, 14: 29, 15: 38, 16: 20, 17: 41, 18: 37, 19: 37, 20: 21, 21: 26, 22: 20, 23: 37, 24: 20, 25: 30},
      "1 chronicles": {1: 54, 2: 55, 3: 24, 4: 43, 5: 26, 6: 81, 7: 40, 8: 40, 9: 44, 10: 14, 11: 47, 12: 40, 13: 14, 14: 17, 15: 29, 16: 43, 17: 27, 18: 17, 19: 19, 20: 8, 21: 30, 22: 19, 23: 32, 24: 31, 25: 31, 26: 32, 27: 34, 28: 21, 29: 30},
      "2 chronicles": {1: 17, 2: 18, 3: 17, 4: 22, 5: 14, 6: 42, 7: 22, 8: 18, 9: 31, 10: 19, 11: 23, 12: 16, 13: 22, 14: 15, 15: 19, 16: 14, 17: 19, 18: 34, 19: 11, 20: 37, 21: 20, 22: 12, 23: 21, 24: 27, 25: 28, 26: 23, 27: 9, 28: 27, 29: 36, 30: 27, 31: 21, 32: 33, 33: 25, 34: 33, 35: 27, 36: 23},
      "ezra": {1: 11, 2: 70, 3: 13, 4: 24, 5: 17, 6: 22, 7: 28, 8: 36, 9: 15, 10: 44},
      "nehemiah": {1: 11, 2: 20, 3: 32, 4: 23, 5: 19, 6: 19, 7: 73, 8: 18, 9: 38, 10: 39, 11: 36, 12: 47, 13: 31},
      "esther": {1: 22, 2: 23, 3: 15, 4: 17, 5: 14, 6: 14, 7: 10, 8: 17, 9: 32, 10: 3},
      "job": {1: 22, 2: 13, 3: 26, 4: 21, 5: 27, 6: 30, 7: 21, 8: 22, 9: 35, 10: 22, 11: 20, 12: 25, 13: 28, 14: 22, 15: 35, 16: 22, 17: 16, 18: 21, 19: 29, 20: 29, 21: 34, 22: 30, 23: 17, 24: 25, 25: 6, 26: 14, 27: 23, 28: 28, 29: 25, 30: 31, 31: 40, 32: 22, 33: 33, 34: 37, 35: 16, 36: 33, 37: 24, 38: 41, 39: 30, 40: 24, 41: 34, 42: 17},
      "psalms": {1: 6, 2: 12, 3: 8, 4: 8, 5: 12, 6: 10, 7: 17, 8: 9, 9: 20, 10: 18, 11: 7, 12: 8, 13: 6, 14: 7, 15: 5, 16: 11, 17: 15, 18: 50, 19: 14, 20: 9, 21: 13, 22: 31, 23: 6, 24: 10, 25: 22, 26: 12, 27: 14, 28: 9, 29: 11, 30: 12, 31: 24, 32: 11, 33: 22, 34: 22, 35: 28, 36: 12, 37: 40, 38: 22, 39: 13, 40: 17, 41: 13, 42: 11, 43: 5, 44: 26, 45: 17, 46: 11, 47: 9, 48: 14, 49: 20, 50: 23, 51: 19, 52: 9, 53: 6, 54: 7, 55: 23, 56: 13, 57: 11, 58: 11, 59: 17, 60: 12, 61: 8, 62: 12, 63: 11, 64: 10, 65: 13, 66: 20, 67: 7, 68: 35, 69: 36, 70: 5, 71: 24, 72: 20, 73: 28, 74: 23, 75: 10, 76: 12, 77: 20, 78: 72, 79: 13, 80: 19, 81: 16, 82: 8, 83: 18, 84: 12, 85: 13, 86: 17, 87: 7, 88: 18, 89: 52, 90: 17, 91: 16, 92: 15, 93: 5, 94: 23, 95: 11, 96: 13, 97: 12, 98: 9, 99: 9, 100: 5, 101: 8, 102: 28, 103: 22, 104: 35, 105: 45, 106: 48, 107: 43, 108: 13, 109: 31, 110: 7, 111: 10, 112: 10, 113: 9, 114: 8, 115: 18, 116: 19, 117: 2, 118: 29, 119: 176, 120: 7, 121: 8, 122: 9, 123: 4, 124: 8, 125: 5, 126: 6, 127: 5, 128: 6, 129: 8, 130: 8, 131: 3, 132: 18, 133: 3, 134: 3, 135: 21, 136: 26, 137: 9, 138: 8, 139: 24, 140: 13, 141: 10, 142: 7, 143: 12, 144: 15, 145: 21, 146: 10, 147: 20, 148: 14, 149: 9, 150: 6},
      "proverbs": {1: 33, 2: 22, 3: 35, 4: 27, 5: 23, 6: 35, 7: 27, 8: 36, 9: 18, 10: 32, 11: 31, 12: 28, 13: 25, 14: 35, 15: 33, 16: 33, 17: 28, 18: 24, 19: 29, 20: 30, 21: 31, 22: 29, 23: 35, 24: 34, 25: 28, 26: 28, 27: 27, 28: 28, 29: 27, 30: 33, 31: 31},
      "ecclesiastes": {1: 18, 2: 26, 3: 22, 4: 16, 5: 20, 6: 12, 7: 29, 8: 17, 9: 18, 10: 20, 11: 10, 12: 14},
      "song of solomon": {1: 17, 2: 17, 3: 11, 4: 16, 5: 16, 6: 13, 7: 13, 8: 14},
      "isaiah": {1: 31, 2: 22, 3: 26, 4: 6, 5: 30, 6: 13, 7: 25, 8: 22, 9: 21, 10: 34, 11: 16, 12: 6, 13: 22, 14: 32, 15: 9, 16: 14, 17: 14, 18: 7, 19: 25, 20: 6, 21: 17, 22: 25, 23: 18, 24: 23, 25: 12, 26: 21, 27: 13, 28: 29, 29: 24, 30: 33, 31: 9, 32: 20, 33: 24, 34: 17, 35: 10, 36: 22, 37: 38, 38: 22, 39: 8, 40: 31, 41: 29, 42: 25, 43: 28, 44: 28, 45: 25, 46: 13, 47: 15, 48: 22, 49: 26, 50: 11, 51: 23, 52: 15, 53: 12, 54: 17, 55: 13, 56: 12, 57: 21, 58: 14, 59: 21, 60: 22, 61: 11, 62: 12, 63: 19, 64: 12, 65: 25, 66: 24},
      "jeremiah": {1: 19, 2: 37, 3: 25, 4: 31, 5: 31, 6: 30, 7: 34, 8: 22, 9: 26, 10: 25, 11: 23, 12: 17, 13: 27, 14: 22, 15: 21, 16: 21, 17: 27, 18: 23, 19: 15, 20: 18, 21: 14, 22: 30, 23: 40, 24: 10, 25: 38, 26: 24, 27: 22, 28: 17, 29: 32, 30: 24, 31: 40, 32: 44, 33: 26, 34: 22, 35: 19, 36: 32, 37: 21, 38: 28, 39: 18, 40: 16, 41: 18, 42: 22, 43: 13, 44: 30, 45: 5, 46: 28, 47: 7, 48: 47, 49: 39, 50: 46, 51: 64, 52: 34},
      "lamentations": {1: 22, 2: 22, 3: 66, 4: 22, 5: 22},
      "ezekiel": {1: 28, 2: 10, 3: 27, 4: 17, 5: 17, 6: 14, 7: 27, 8: 18, 9: 11, 10: 22, 11: 25, 12: 28, 13: 23, 14: 23, 15: 8, 16: 63, 17: 24, 18: 32, 19: 14, 20: 49, 21: 32, 22: 31, 23: 49, 24: 27, 25: 17, 26: 21, 27: 36, 28: 26, 29: 21, 30: 26, 31: 18, 32: 32, 33: 33, 34: 31, 35: 15, 36: 38, 37: 28, 38: 23, 39: 29, 40: 49, 41: 26, 42: 20, 43: 27, 44: 31, 45: 25, 46: 24, 47: 23, 48: 35},
      "daniel": {1: 21, 2: 49, 3: 30, 4: 37, 5: 31, 6: 28, 7: 28, 8: 27, 9: 27, 10: 21, 11: 45, 12: 13},
      "hosea": {1: 11, 2: 23, 3: 5, 4: 19, 5: 15, 6: 11, 7: 16, 8: 14, 9: 17, 10: 15, 11: 12, 12: 14, 13: 16, 14: 9},
      "joel": {1: 20, 2: 32, 3: 21},
      "amos": {1: 15, 2: 16, 3: 15, 4: 13, 5: 27, 6: 14, 7: 17, 8: 14, 9: 15},
      "obadiah": {1: 21},
      "jonah": {1: 17, 2: 10, 3: 10, 4: 11},
      "micah": {1: 16, 2: 13, 3: 12, 4: 13, 5: 15, 6: 16, 7: 20},
      "nahum": {1: 15, 2: 13, 3: 19},
      "habakkuk": {1: 17, 2: 20, 3: 19},
      "zephaniah": {1: 18, 2: 15, 3: 20},
      "haggai": {1: 15, 2: 23},
      "zechariah": {1: 21, 2: 13, 3: 10, 4: 14, 5: 11, 6: 15, 7: 14, 8: 23, 9: 17, 10: 12, 11: 17, 12: 14, 13: 9, 14: 21},
      "malachi": {1: 14, 2: 17, 3: 18, 4: 6},
      "matthew": {1: 25, 2: 23, 3: 17, 4: 25, 5: 48, 6: 34, 7: 29, 8: 34, 9: 38, 10: 42, 11: 30, 12: 50, 13: 58, 14: 36, 15: 39, 16: 28, 17: 27, 18: 35, 19: 30, 20: 34, 21: 46, 22: 46, 23: 39, 24: 51, 25: 46, 26: 75, 27: 66, 28: 20},
      "mark": {1: 45, 2: 28, 3: 35, 4: 41, 5: 43, 6: 56, 7: 37, 8: 38, 9: 50, 10: 52, 11: 33, 12: 44, 13: 37, 14: 72, 15: 47, 16: 20},
      "luke": {1: 80, 2: 52, 3: 38, 4: 44, 5: 39, 6: 49, 7: 50, 8: 56, 9: 62, 10: 42, 11: 54, 12: 59, 13: 35, 14: 35, 15: 32, 16: 31, 17: 37, 18: 43, 19: 48, 20: 47, 21: 38, 22: 71, 23: 56, 24: 53},
      "john": {1: 51, 2: 25, 3: 36, 4: 54, 5: 47, 6: 71, 7: 53, 8: 59, 9: 41, 10: 42, 11: 57, 12: 50, 13: 38, 14: 31, 15: 27, 16: 33, 17: 26, 18: 40, 19: 42, 20: 31, 21: 25},
      "acts": {1: 26, 2: 47, 3: 26, 4: 37, 5: 42, 6: 15, 7: 60, 8: 40, 9: 43, 10: 48, 11: 30, 12: 25, 13: 52, 14: 28, 15: 41, 16: 40, 17: 34, 18: 28, 19: 41, 20: 38, 21: 40, 22: 30, 23: 35, 24: 27, 25: 27, 26: 32, 27: 44, 28: 31},
      "romans": {1: 32, 2: 29, 3: 31, 4: 25, 5: 21, 6: 23, 7: 25, 8: 39, 9: 33, 10: 21, 11: 36, 12: 21, 13: 14, 14: 23, 15: 33, 16: 27},
      "1 corinthians": {1: 31, 2: 16, 3: 23, 4: 21, 5: 13, 6: 20, 7: 40, 8: 13, 9: 27, 10: 33, 11: 34, 12: 31, 13: 13, 14: 40, 15: 58, 16: 24},
      "2 corinthians": {1: 24, 2: 17, 3: 18, 4: 18, 5: 21, 6: 18, 7: 16, 8: 24, 9: 15, 10: 18, 11: 33, 12: 21, 13: 14},
      "galatians": {1: 24, 2: 21, 3: 29, 4: 31, 5: 26, 6: 18},
      "ephesians": {1: 23, 2: 22, 3: 21, 4: 32, 5: 33, 6: 24},
      "philippians": {1: 30, 2: 30, 3: 21, 4: 23},
      "colossians": {1: 29, 2: 23, 3: 25, 4: 18},
      "1 thessalonians": {1: 10, 2: 20, 3: 13, 4: 18, 5: 28},
      "2 thessalonians": {1: 12, 2: 17, 3: 18},
      "1 timothy": {1: 20, 2: 15, 3: 16, 4: 16, 5: 25, 6: 21},
      "2 timothy": {1: 18, 2: 26, 3: 17, 4: 22},
      "titus": {1: 16, 2: 15, 3: 15},
      "philemon": {1: 25},
      "hebrews": {1: 14, 2: 18, 3: 19, 4: 16, 5: 14, 6: 20, 7: 28, 8: 13, 9: 28, 10: 39, 11: 40, 12: 29, 13: 25},
      "james": {1: 27, 2: 26, 3: 18, 4: 17, 5: 20},
      "1 peter": {1: 25, 2: 25, 3: 22, 4: 19, 5: 14},
      "2 peter": {1: 21, 2: 22, 3: 18},
      "1 john": {1: 10, 2: 29, 3: 24, 4: 21, 5: 21},
      "2 john": {1: 13},
      "3 john": {1: 14},
      "jude": {1: 25},
      "revelation": {1: 20, 2: 29, 3: 22, 4: 11, 5: 14, 6: 17, 7: 17, 8: 13, 9: 21, 10: 11, 11: 19, 12: 17, 13: 18, 14: 20, 15: 8, 16: 21, 17: 18, 18: 24, 19: 21, 20: 15, 21: 27, 22: 21},
    };

    function parseReference(ref) {
        var lookup = undefined;
        ref = ref.replace(/\s+/g, ' ').trim();
        console.log(ref);
        const parts = ref.split(' ');
        if (parts.length === 3) {
            var book = parts[0] + parts[1];
            var capterVerse = parts[2];
        } else {
          var book = parts[0];
          var chapterVerse = parts[1];
        }

        //Remove spaces for short lookup
      book = book.replace(/\s/g, '');

      lookup = short_long[book]
      if (lookup == undefined) {
        for (let item in other_common) {
          if (item.startsWith(book)) {
            lookup = other_common[item];
            break;
          }
        }
        if (lookup == undefined) {
          //Add space for full lookukp
          if (/^\d/.test(book)) {
            book = book.replace(/^(\d+)([a-zA-Z])/g, '$1 $2');
          }
          for (let key in book_numbers) {
            if (key.startsWith(book)) {
              lookup = key;
              break;
            }
          }
        }
        
      }


        if (chapterVerse.includes('-')) {
          const nums = chapterVerse.split('-');
          console.log(nums);
          if (nums[0].includes(':')) {
            var [chapterStart, verseStart] = nums[0].split(':');
            if (nums[1] == '') {
              chapterEnd = chapterStart;
              verseEnd = chapters[lookup][chapterEnd];
            } else if (nums[1].includes(':')) {
              var [chapterEnd, verseEnd] = nums[1].split(':');
            } else {
              var chapterEnd = chapterStart;
              var verseEnd = nums[1];
            }
          } else {
            if (Object.keys(chapters[lookup]).length < 2) {
              chapterStart = 1;
              verseStart = nums[0];
              chapterEnd = 1;
              if (nums[1] == '') {
                verseEnd = chapters[lookup][1];
              } else {
                verseEnd = nums[1];
              }
            } else {
              var chapterStart = nums[0];
              var verseStart = 1;
              if (nums[1] == '') {
                chapterEnd = chapterStart;
                verseEnd = chapters[lookup][chapterEnd];
                verseEnd = chapters[lookup][chapterEnd];
              } else if (nums[1].includes(':')) {
                var [chapterEnd, verseEnd] = nums[1].split(':');
              } else {
                if (chapters[lookup].length() < 2) {
                  chapterEnd = chapterStart;
                  verseEnd = chapters[lookup][chapterEnd];
                } else {
                  chapterEnd = nums[1];
                  verseEnd = chapters[lookup][chapterEnd];
                }
                var chapterEnd = nums[1];
                var verseEnd = chapters[lookup][chapterEnd];
              }
            }
          } 
        } else if (chapterVerse.includes(':')) {
          var nums = chapterVerse.split(':');
          var chapterStart = nums[0];
          var verseStart = nums[1];
          var chapterEnd = nums[0];
          var verseEnd = nums[1];
        } else if (/^\d+$/.test(chapterVerse)) {
          var chapterStart = chapterVerse;
          var verseStart = 1;
          var chapterEnd = chapterVerse;
          var verseEnd = chapters[lookup][chapterEnd];
        }

      
      

      console.log(book);
      console.log(lookup);
      console.log(chapterStart);
      console.log(verseStart);
      console.log(chapterEnd);
      console.log(verseEnd);

      return {
        book: lookup,
        bookNumber: book_numbers[lookup],
        chapterStart: chapterStart,
        verseStart: verseStart,
        chapterEnd: chapterEnd,
        verseEnd: verseEnd
      };

      
    }

    const ref = parseReference(ref_string);
    if (!ref) {
      console.error('Invalid reference string:', ref_string);
      return;
    }

    if (ref.book !== undefined && ref.bookNumber !== undefined && ref.chapterStart !== undefined && ref.verseStart !== undefined && ref.chapterEnd !== undefined && ref.verseEnd !== undefined) {
      const bibleFile = bibles.find(b => b.Abbreviation === version);
      if (!bibleFile) {
        console.error('Bible version not found:', version);
        var data = {
          status: 'failed',
          message: 'Bible version not found.'
        };
        mainWindow.webContents.send('add-scripture', data);
        return;
      }

      const dbPath = path.join(resource_path, 'Bibles', bibleFile.File);
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.error('Database connection error:', err.message);
          var data = {
            status: 'failed',
            message: 'Database connection error.'
          };
          mainWindow.webContents.send('add-scripture', data);
          return;
        }
      });

      let query = `SELECT * FROM Bible WHERE Book = ${ref.bookNumber} AND Chapter BETWEEN ${ref.chapterStart} AND ${ref.chapterEnd}`;

      db.all(query, (err, rows) => {
        if (err) {
          console.error('Database query error:', err.message);
          var data = {
            status: 'failed',
            message: 'Database query error.'
          };
          mainWindow.webContents.send('add-scripture', data);
          db.close();
          return;
        }

        var scriptures = [];
        for (row in rows) {
          row = rows[row];
          if (ref.chapterStart == ref.chapterEnd) {
            if (row.Verse >= ref.verseStart && row.Verse <= ref.verseEnd) {
              scriptures.push(row);
            }
          } else {
            if (row.Chapter == ref.chapterStart && row.Verse >= ref.verseStart) {
              scriptures.push(row);
            } else if (row.Chapter < ref.chapterEnd && row.Chapter > ref.chapterStart) {
              scriptures.push(row);
            } else if (row.Chapter == ref.chapterEnd && row.Verse <= ref.verseEnd) {
              scriptures.push(row);
            }
          }
        }
        const verses = scriptures.map(row => ({
          reference: `${ref.book.replace(/\b\w/g, char => char.toUpperCase())} ${row.Chapter}:${row.Verse} ${version}`,
          scripture: `${row.Scripture}`
        }));

        if(verses.length > 0) {
          var data = {
            status: 'success',
            verses: verses
          }
        } else {
          var data = {
            status: 'failed',
            message: 'Scripture not found.',
          }
        }

        mainWindow.webContents.send('add-scripture', data);

        db.close();
      });
    } else {
      var data = {
        status: 'failed',
        message: 'Scripture not found.',
      }

      mainWindow.webContents.send('add-scripture', data);
    }

    
  }
  

