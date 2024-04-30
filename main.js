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

app.on('ready', () => {
  RunWebserver();
  createMainWindow();
  //createOffscreenWindow();
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
          }
          if (live_cards['b'] !== undefined) {
            connection.sendUTF(
              JSON.stringify({
                cmd: 'playin',
                data: live_cards['b']
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
    // gen 1:1
  
    try {
      var ref = ref_string.split(' ');
      var book = ref[0];
      if (ref[1].includes(':')) {
        var chapter = ref[1].split(':')[0];
        var verse_string = ref[1].split(':')[1];
        if (typeof ref[2] !== "undefined") {
          verse_string = verse_string+'-'+ref[2];
        }
      } else if (ref[2].includes(':')) {
        book = ref[0]+'+'+ref[1];
        var chapter = ref[2].split(':')[0];
        var verse_string = ref[2].split(':')[1];
        if (typeof ref[3] !== "undefined") {
          verse_string = verse_string+'-'+ref[2];
        }
      } else {
        var chapter = ref[1];
        var verse_start = ref[2];
        var verse_end = ref[3];
  
        if (typeof verse_end !== 'undefined') {
          var verse_string = verse_start+'-'+verse_end;
        } else {
          var verse_string = verse_start;
        }
  
      }
  
      console.log(book);
      console.log(chapter);
      console.log(verse_string);
    }
    catch(err) {
        console.log(err);
        return
    }
    
    console.log('fetching');
    var request_vars = book+'+'+chapter+'%3A'+verse_string;
    var url = 'https://www.biblegateway.com/passage/?search='+request_vars+'&version='+version;
  
    console.log(url);
    
    var options = {
      uri: url,
      headers: {
          //'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36'
      },
    };
  
    rp(options)
      .then(function (html) {
        var $ = cheerio.load(html)
        var lines = [];
        $('div.result-text-style-normal').find('span.text').each(function (index, element) {
          lines.push(element);
        });
  
        var verses = [];
        var verse_index = -1;
        for (var line of lines) {
          console.log($(line).text());
          var chapter_num = $(line).find('span.chapternum').text().replace(' ','');
          if (chapter_num.length > 0) {
            var verse_num = "1";
          } else {
            var verse_num = $(line).find('sup.versenum').text().replace(' ','');
          }
          
          if (verse_num.length > 0) {
            console.log('new verse');
            verse_index = verse_index + 1;
            verses[verse_index] = {num: verse_num};
          }
  
          var woj = $(line).find('span.woj');
          console.log(woj.length);
          if (woj.length > 0) {
            var text = '';
            woj.each(function (i, slice) {
              console.log('html text');
              var content = $(slice).contents();
              $(content).find('span').remove();
              console.log($(slice).contents().text().trim());
              console.log('end html text');
              //text = text + ' ' + $(slice).contents().filter(function() { return this.type === 'text'; }).text();
              text = text + ' ' + $(slice).contents().text();
              text = text.replace(/[0-9]+/, "").trim();
              text = text.replace(/(\[+\w+\])(\w+)/, '$2');
              console.log(text);
            });
          } else {
            console.log('html text');
            console.log($(line).contents().text().trim());
            console.log('end html text');
            //var text = $(line).contents().filter(function() { return this.type === 'text'; }).text();
            var text = $(line).contents().text();
            text = text.replace(/[0-9]+/, "").trim();
            text = text.replace(/(\[+\w+\])(\w+)/, '$2');
          }
  
          if (verse_index >= 0) {
            if (typeof verses[verse_index]['text'] !== 'undefined') {
              verses[verse_index]['text'] = verses[verse_index]['text'] + ' ' + text;
            } else {
              verses[verse_index]['text'] = text;
            }
            console.log(text);
          }
        }
  
        passage = $('span.passage-display-bcv').first().text().split(' ');
        console.log(passage[0]);
        console.log(passage[1]);
        console.log(passage[2]);
        console.log(passage[3]);
        console.log(passage[4]);
        if (passage.length >= 3) {
          book = passage[0]+' '+passage[1];
        } else {
          book = passage[0];
        }
  
        console.log(verses.length);
        console.log(book);
        if(verses.length > 0) {
          var data = {
            status: 'success',
            book: book,
            chapter: chapter,
            version: version,
            verses: verses
          }
        } else {
          var data = {
            status: 'failed',
            message: 'Scripture not found.',
          }
        }
  
        mainWindow.webContents.send('add-scripture', data);
      });
  }
  