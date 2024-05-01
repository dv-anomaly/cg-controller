// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const { ipcRenderer } = require('electron');
const CryptoJS = require("crypto-js");

var SERVER_URL = 'http://127.0.0.1:8022/Bitstorm/cg-controller.html';

var PREFERENCES = {};
let library = {};
var selected_scope = '';
var live_index = -1;
var cued_index = -1;
var last_tap;
var multi_tap = false;
var touch_moved = false;
const METADATA = {};
PREFERENCES['select_on_refresh'] = {};
PREFERENCES['last_bible_ref'] = '';
PREFERENCES['last_bible_version']  = 'NKJV';
var bible_ref_focus = false;
var bible_ver_focus = false;
var bible_add_focus = false;
var live_cards = {
    'a': {
        uuid: undefined,
        sum: undefined
    },
    'b': {
        uuid: undefined,
        sum: undefined
    },
    'c': {
        uuid: undefined,
        sum: undefined
    }
}


function generateUUID() { // Public Domain/MIT
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

  function md5Hash(text) {
    return CryptoJS.MD5(text).toString();
}

function SetPref(key, value) {
    PREFERENCES[key] = value;
    SavePrefs();
}

function GetPref(key) {
    return PREFERENCES[key];
}

function SavePrefs() {
    ipcRenderer.send('set-prefs', PREFERENCES);
}

const card_template = '<div class="card border-info mb-3 %live%" data-id="%id%" data-uuid="%uuid%" data-sum="%sum%" data-name="%name%" data-channel="%channel%"><div class="card-header" contenteditable="false"><div class="sort-handle"><img src="../assets/list.svg"/></div><div class="card-header-text">[%channel_upper%]&nbsp;&nbsp;%name%</div></div><div class="card-body">%content%</div></div>';
const library_template = '<div class="list-item" id="%id%" data-type="%type%" data-uuid="%uuid%">%name%</div>';

var INPUT_NAME = "CG Controller";
var ACTIVE_TEMPLATE = null;

const templates = [
    {
        id: 'title',
        channel: 'a',
        name: 'Title',
        fields: [
            {
                type: 'title',
                name: 'Name',
                value: 'Name',
                variable: 'Title_Name'
            },
            {
                type: 'text',
                name: 'Title',
                value: 'Title',
                variable: 'Title_Title'
            }
        ]
    },
    {
        id: 'scripture',
        channel: 'a',
        name: 'Scripture',
        fields: [
            {
                type: 'text',
                name: 'Scripture',
                value: 'Scripture',
                variable: 'Scripture_Scripture'
            },
            {
                type: 'text',
                name: 'Reference',
                value: 'Reference',
                variable: 'Scripture_Reference'
            }
        ]
    },
    {
        id: 'text',
        channel: 'a',
        name: 'Text',
        fields: [
            {
                type: 'text',
                name: 'Text',
                value: 'Text',
                variable: 'Text_Text'
            }
        ]
    },
    {
        id: 'text-condensed',
        channel: 'a',
        name: 'Text Condensed',
        fields: [
            {
                type: 'text',
                name: 'Text',
                value: 'Text',
                variable: 'Text_Text'
            }
        ]
    },
    {
        id: 'heading',
        channel: 'b',
        name: 'Heading',
        fields: [
            {
                type: 'title',
                name: 'Heading',
                value: 'Heading',
                variable: 'Heading'
            },
            {
                type: 'text',
                name: 'Sub Heading',
                value: 'Sub Heading',
                variable: 'Sub_Heading'
            },
            {
                type: 'text',
                name: 'Video URL',
                value: 'Backgrounds/bar-blue-1.mp4',
                variable: 'Background_Source',
            }
        ]
    },
    {
        id: 'promo-graphic',
        channel: 'c',
        name: 'Promo Graphic',
        fields: [
            {
                type: 'text',
                name: 'Graphic URL',
                value: 'Promo/discipleship.png',
                variable: 'Graphic',
            }
        ]
    },
    {
        id: 'promo-video',
        channel: 'c',
        name: 'Promo Video',
        fields: [
            {
                type: 'text',
                name: 'Video Loop URL',
                value: 'Promo/refresh-wednesday.mp4',
                variable: 'Video',
            }
        ]
    }
];

var add_index = 0;

function InsertCard(data, id, selectElement, mode) {
    if (mode == "program") {
        var list = "#program";
        var contentEditable = false;
    } else {
        var list = "#preview";
        var contentEditable = true;
    }
    var content = '';
    $.each(data['fields'], function(index, field){
        var type = 'data-type="'+field['type']+'" ';
        var name = 'data-name="'+field['name']+'" ';
        var variable = 'data-variable="'+field['variable']+'"';
        var varData = type + name + variable;
        switch (field['type']) {
            case 'title':
                var item = '<h4 class="card-title contenteditable" contenteditable="'+contentEditable+'" '+varData+'>'+field['value']+'</h4>';
                break;
            case 'text':
                var item = '<p class="card-text contenteditable" contenteditable="'+contentEditable+'" '+varData+'>'+field['value']+'</p>';
                break;
        }
        content += item;
    });
    var card = card_template;
    card = card.replace('%id%', data['id']);
    card = card.replace('%channel%', data['channel']);
    card = card.replace('%channel_upper%', data['channel'].toUpperCase());
    card = card.replace('%uuid%', data['uuid']);
    card = card.replace('%sum%', data['sum']);
    card = card.replace('%name%', data['name']);
    card = card.replace('%name%', data['name']);
    card = card.replace('%content%', content);

    if (mode == "program") {
        if (data['uuid'] == live_cards[data['channel']]['uuid'] && data['sum'] == live_cards[data['channel']]['sum']) {
            card = card.replace('%live%', 'live');
        } else {
            console.log()
            card.replace('%live%', '');

        }
    } else {
        card.replace('%live%', '');
    }

    if (id == -1) {
        var cardIndex = $(list).children().length - 1;
        var element = $(list).append(card);

    }  else {
        //$("#preview").append(card);
        var element = $(list).children().eq(id).after(card);
        var cardIndex = id+1;
    }

    UpdateEvents();
    if (selectElement) {
        if (cardIndex < 0) {
            var cardIndex = 0;
        }
        var card = $(list).children().eq(cardIndex);
        SelectCard(card, true);
    }
}

function AddNewCard(id, template) {
    index = $("#preview > .ui-selected").index();
    size = $("#preview > .ui-selected").length;
    index = index + size - 1;
    if (index < 0 ){
        index = -1;
    }
    if (typeof id == "number") {
        add_index = id;
    }

    if(typeof template === 'undefined') {
        template = templates[add_index];
    }

    template['uuid'] = generateUUID();
    template['sum'] = md5Hash(JSON.stringify(template['fields']));

    InsertCard(template, index, true);

    UpdateLibraryItem(true);
}

function RenameItem(item, task) {
    item = $(item);
    switch(task) {
        case 'start':
            item.data('previous-value', item.text());
            item.attr("contenteditable", "true");
            item.focus();
            item.addClass("editing");
            break;

        case 'stop':
            var itemType = item.data('type');
            var oldValue = item.data('previous-value');
            var newValue = item.text();

            if (itemType == 'cg-library-item') {
                var parent = $(item).closest(".selectable").attr('id');
                if (parent == 'current_playlist') {
                    PREFERENCES['select_on_refresh']['current'] = newValue;
                } else if (parent == 'library_pane') {
                    PREFERENCES['select_on_refresh']['library'] = newValue;
                }
                PREFERENCES['select_on_refresh']['playlist'] = $("#playlists_pane").children('.ui-selected').text();
            }

            if (itemType == 'cg-playlist-item') {
                PREFERENCES['select_on_refresh']['playlist'] = newValue;
                var library_item = $("#library_pane").children(".ui-selected").text();
                var current_item = $("#current_playlist").children(".ui-selected").text();
                PREFERENCES['select_on_refresh']['library'] = library_item;
                PREFERENCES['select_on_refresh']['current'] = current_item;
            }
            $(item).attr("contenteditable", "false");
            $(item).removeClass("editing");

            ipcRenderer.send('rename-item', itemType, oldValue, newValue);

            SavePrefs();
            break;

        case 'revert':

            break;
    }
    

    $(this).blur();
    $(this).attr("contenteditable", "false");
}

function SaveSelectionState() {
    SetPref('select_on_refresh', {});
    PREFERENCES['select_on_refresh']['current'] = $('#current_playlist').children('.ui-selected').text();
    PREFERENCES['select_on_refresh']['playlist'] = $('#playlists_pane').children('.ui-selected').text();
    PREFERENCES['select_on_refresh']['library'] = $('#library_pane').children('.ui-selected').text();
    SavePrefs();
}

function ShowPresentationDialog() {
    $("#new-presentation-name").text('New Presentation');
        $("#new-presentation").modal();
        setTimeout(() => {
            $("#new-presentation-name").focus();
            document.execCommand('selectAll', false, null);
        }, 500);
}

function HidePresentationDialog() {
        $("#new-presentation").modal('toggle');
}

function ShowPlaylistDialog() {
    $("#new-playlist-name").text('New Playlist');
        $("#new-playlist").modal();
        setTimeout(() => {
            $("#new-playlist-name").focus();
            document.execCommand('selectAll', false, null);
        }, 500);
}

function HidePlaylistDialog() {
    $("#new-playlist").modal('toggle');
}

function UpdateEvents() {

    $('.contenteditable').off('keydown');
    $(".contenteditable").off("input");

    $('.contenteditable').keydown(function(e) {
        // trap the return key being pressed
        if (e.keyCode === 13) {
            var item = $(e.currentTarget)
            e.preventDefault(); //Prevent default browser behavior
            if (window.getSelection) {
                var selection = window.getSelection(),
                    range = selection.getRangeAt(0),
                    newline = document.createTextNode("\u000A"),
                    textNode = document.createTextNode("\u00a0"); //Passing " " directly will not end up being shown correctly
                range.deleteContents();//required or not?
                range.insertNode(newline);
                range.collapse(false);
                range.insertNode(textNode);
                range.selectNodeContents(textNode);

                selection.removeAllRanges();
                selection.addRange(range);
                return false;
            }
        }
    });

    $(".contenteditable").on("input" , $.debounce(1000, function(e) {
        item = $(e.currentTarget);
        UpdateLibraryItem(true);
    }));

    $(".contenteditable").off("focus");
    $(".contenteditable").focus(function(){
        SelectCard($(this).closest(".card"), false);
        setTimeout(function(){
            document.execCommand('selectAll', false, null);
          }, 10);
        
    });

    $(".contenteditable").off("blur");
    $(".contenteditable").on("blur" , function(e) {
        item = $(e.currentTarget);
        UpdateLibraryItem(true);
        document.getSelection().removeAllRanges();
    });

    /*
    $(".contenteditable").off("click");
    $(".contenteditable").click(function(){
        $(this).focus();
    });

    */
    

    $("#preview > .card").off("mousedown");
    $("#preview > .card").on("mousedown", function(e){
        var item = $(e.currentTarget);
        DeFocus();
        SetSelectedScope(item.parent().attr("id"));
        if (e.which == 3) {
            SelectCard(item, false);
            var item = $(e.currentTarget);
            var libraryItemName = $("#preview").data("library-item");
            SendToProgram(libraryItemName, item.index(), false);
        }
    });

    $("#preview").find('.contenteditable').off('mousedown');
    $("#preview").find('.contenteditable').on('mousedown', function(e) { e.stopPropagation(); });

    $("#preview > .card").off("dblclick");
    $("#preview > .card").on("dblclick", function(e){
        var item = $(e.currentTarget);
        var libraryItemName = $("#preview").data("library-item");
        if (!$(":focus").hasClass("contenteditable")) {
            SendToProgram(libraryItemName, item.index(), true);
        }
    });

    $("#preview > .card").off("touchend");
    $("#preview > .card").on("touchend", function(e){
        e.preventDefault();
        var now = new Date().getTime();
        var timesince = now - last_tap;
        var item = $(e.currentTarget);
        var libraryItemName = $("#preview").data("library-item");
        if((timesince < 600) && (timesince > 0)){
     
            if (!multi_tap) {
                SendToProgram(libraryItemName, item.index(), true);
            }
     
        }
     
        last_tap = new Date().getTime();

        if (!touch_moved) {
            SelectCard(item, false);
        } else {
            touch_moved = false;
        }
    });

    $("#preview > .card").off("touchmove");
    $("#preview > .card").on("touchmove", function(e){
        touch_moved = true;
    });

    $("#preview > .card").off("touchstart");
    $("#preview > .card").on("touchstart" , $.debounce(50, function(e) {
        var item = $(e.currentTarget);
        var libraryItemName = $("#preview").data("library-item");
        e.preventDefault();
        if (e.touches.length == 2) {
            multi_tap = true;
            SendToProgram(libraryItemName, item.index(), false);
            setTimeout(function(){ DeFocus(); multi_tap = false }, 100);
            SelectCard(item, false);
        }
        
    }));


    $("#program > .card").off("mousedown");
    $("#program > .card").on("mousedown", function(e){
        var item = $(e.currentTarget);
        e.preventDefault();

        if (e.which == 1) {
            if (item.hasClass('live')) {
                PlayOut(item.data('channel'));
            } else {
                PlayIn(item.index());
            }
        }
        if (e.which == 3) {
            Cue(item.index());
        }
    });

    $("#program > .card").off("touchstart");
    $("#program > .card").on("touchstart" , $.debounce(50, function(e) {
        var item = $(e.currentTarget);
        e.preventDefault();
        if (e.touches.length == 2) {
            Cue(item.index());
        }
    }));


    $(".list-item").off("mousedown");
    $(".list-item").on("mousedown", function(e){
        var item = $(e.currentTarget);
        var parent = $(e.currentTarget).parent();
        if (parent.attr("id") == "playlists_pane") {
            ipcRenderer.send('get-playlist-item', item.text());
            SelectPlaylistItem(e.currentTarget);
        }
        if (parent.attr("id") == "library_pane" || parent.attr("id") == "current_playlist") {
            ipcRenderer.send('get-library-item', item.text());
            $(".editing").blur();
            
            SelectListItem(e.currentTarget);
        }

        SetSelectedScope(item.parent().attr("id"));
      
    });

    $(".list-item").on("mousedown" , $.debounce(500, function(e) {
        SaveSelectionState();
    }));

    $(".list-item").off("dblclick");
    $(".list-item").on("dblclick", function(e){
        RenameItem(e.currentTarget, 'start');
    });

    $("#library-popover").off("dblclick");
    $("#library-popover").on("dblclick", function(e){
        ShowPresentationDialog();
    });

    $("#playlist-popover").off("dblclick");
    $("#playlist-popover").on("dblclick", function(e){
        ShowPlaylistDialog();
    });

    $(".list-item").off("focus");
    $(".list-item").on("focus", function(e){
        document.execCommand('selectAll', false, null);
    });

    $(".list-item").off("keydown");
    $(".list-item").on("keydown",function(e){
        var key = e.keyCode || e.charCode;  // ie||others
        if(key == 13)  // if enter key is pressed
            $(e.currentTarget).blur();
    });

    $(".list-item").off("focusout");
    $(".list-item").on("focusout", function(e){
        if ($(e.currentTarget).hasClass("editing")) {
            RenameItem(e.currentTarget, 'stop');
        }
        
    });

    $("#new-presentation-name").off("keydown");
    $("#new-presentation-name").on("keydown",function(e){
        var key = e.keyCode || e.charCode;  // ie||others
        if(key == 13) {
            e.preventDefault();
            $("#create-presentation").trigger('click');
        }
    });

    $("#new-playlist-name").off("keydown");
    $("#new-playlist-name").on("keydown",function(e){
        var key = e.keyCode || e.charCode;  // ie||others
        if(key == 13) {
            e.preventDefault();
            $("#create-playlist").trigger('click');
        }
    });

    $("#create-presentation").off("click");
    $("#create-presentation").click(function(){
        $("#new-presentation-name").blur();
        HidePresentationDialog();
        CreateNewPresentation();
    });

    $("#create-playlist").off("click");
    $("#create-playlist").click(function(){
        $("#new-playlist-name").blur();
        HidePlaylistDialog();
        CreateNewPlaylist();
    });

    $("#play-in").off("click");
    $("#play-in").click(function(){
        PlayIn();
    });

    $("#play-out-middle").off("click");
    $("#play-out-middle").click(function(){
        PlayOut('a');
    });

    $("#play-out-bottom").off("click");
    $("#play-out-bottom").click(function(){
        PlayOut('b');
    });

    $("#play-out-promo").off("click");
    $("#play-out-promo").click(function(){
        PlayOut('c');
    });

    $('[contenteditable]').off('paste');
    $('[contenteditable]').on('paste', function(e) {
        e.preventDefault();
        var text = '';
        if (e.clipboardData || e.originalEvent.clipboardData) {
          text = (e.originalEvent || e).clipboardData.getData('text/plain');
        } else if (window.clipboardData) {
          text = window.clipboardData.getData('Text');
        }
        if (document.queryCommandSupported('insertText')) {
          document.execCommand('insertText', false, text);
        } else {
          document.execCommand('paste', false, text);
        }
    });

    
    

}

function AutoScroll(wrapper, item, speed) {
    if (typeof speed === 'undefined') {
        speed = 500;
    }
    var offset = (wrapper.height() / 2) - (item.height() / 2);
    var curPosition = wrapper.scrollTop();
    var newPosition = curPosition + item.offset().top - offset;
    wrapper.animate({
        scrollTop: newPosition
    }, speed);

}

function PlayIn(index) {
    if (GetPref('overlay_active')) {
        var style = '';
    } else {
        var style = 'Full';
    }

    if (typeof index !== 'undefined') {
        live_index = index;
    } else if (cued_index != -1) {
        live_index = cued_index;
    } else {
        return
    }
    
    list_length = $("#program").children().length;
    if (live_index != list_length - 1) {
        cued_index = live_index + 1;
    } else {
        cued_index = -1;
    }
    var card = $("#program").children().eq(live_index);
    // doplayin

    var title_name = card.data('id')+style;
    var card_variables = {};

    card.find(".card-body").children().each(function (index, field){
        field = $(field);
        card_variables[field.data("variable")] = field.text();
    });

    var card_data = {
        'id': card.data('id'),
        'uuid': card.data('uuid'),
        'sum': card.data('sum'),
        'channel': card.data('channel'),
        'name': card.data('name'),
        fields: [ ]

    }

    card.find(".card-body").children().each(function (index, card){
        card = $(card);
        var cardFields = {
            type: card.data("type"),
            channel: card.data("channel"),
            name: card.data("name"),
            value: card.text(),
            variable: card.data("variable")
        }
        card_data['fields'].push(cardFields);
    });

    $("#program .cued").removeClass("cued");
    $("#program .live[data-channel='"+card.data('channel')+"']").removeClass("live");
    live_cards[card.data('channel')] = card_data;
    $("#program").children().eq(live_index).addClass("live");

    if (cued_index == -1 || cued_index == live_index) {
        Cue(live_index);
    } else {
        Cue(cued_index);
    }

    ipcRenderer.send('send-cmd', 
        { 
            cmd: 'playin',
            data: card_data
        });

    // if (typeof ACTIVE_TEMPLATE !== 'undefined') {
    //     // A template is active,
    //     if (ACTIVE_TEMPLATE == title_name) {
    //         CgUpdate(card_variables);
    //     } else {
    //         CgPlayOut(ACTIVE_TEMPLATE);
    //         ACTIVE_TEMPLATE = title_name;
    //         //setTimeout(function(){
    //             CgPlayIn(title_name, card_variables);
    //         //}, 500);
    //     }
        
    // } else {
    //     // No Template Active PlayIn
    //     CgPlayIn(title_name, card_variables);
    //     ACTIVE_TEMPLATE = title_name;
    // }
    
    
}

function PlayOut(channel) {
    if (channel == 'all') {
        $("#program .live").removeClass("live");
        live_cards = {
            'a': {
                uuid: undefined,
                sum: undefined
            },
            'b': {
                uuid: undefined,
                sum: undefined
            },
            'c': {
                uuid: undefined,
                sum: undefined
            }
        };

    } else {
        $("#program .live[data-channel='"+channel+"']").removeClass("live");
        live_cards[channel]['uuid'] = undefined;
        live_cards[channel]['sum'] = undefined;

    }

    ipcRenderer.send('send-cmd', {
        cmd: 'playout',
        channel: channel
    });

    // //do playout
    // if (typeof ACTIVE_TEMPLATE !== 'undefined') {
    //     CgPlayOut(ACTIVE_TEMPLATE);
    //     ACTIVE_TEMPLATE = null;
    // }
}

function Cue(index) {
    $("#program .cued").removeClass("cued");
    cued_index = index;
    if (cued_index != -1) {
        $("#program").children().eq(cued_index).addClass("cued");
    }

    AutoScroll($("#program"), $("#program .cued"));
}

function SendToProgram(name, index, goLive) {
    ipcRenderer.send('get-program-item', name, index, goLive);
}

function CreateNewPresentation() {
    SaveSelectionState();
    ipcRenderer.send('create-library-item', $("#new-presentation-name").text());
}

function CreateNewPlaylist() {
    SaveSelectionState();
    ipcRenderer.send('create-playlist-item', $("#new-playlist-name").text());

}

function SetSelectedScope(scope) {
    selected_scope = scope;
}

function RemoveItems() {
    switch(selected_scope) {
        case 'preview':
            if (!$(":focus").hasClass("contenteditable")) {
                $("#preview > .ui-selected").remove();
                UpdateLibraryItem();
            }
            break;
        case 'library_pane':
            ipcRenderer.send('remove-library-item', $("#library_pane > .ui-selected").text());
            $("#library_pane > .ui-selected").remove();
            break;
        case 'playlists_pane':
            ipcRenderer.send('remove-playlist-item', $("#playlists_pane > .ui-selected").text());
            $("#playlists_pane > .ui-selected").remove();
            break;
        case 'current_playlist':
            $("#current_playlist > .ui-selected").remove();
            UpdatePlaylistItem();
            break;
    }
}

function UpdateLibraryItem(render) {
    var libraryItemName = $("#preview").data("library-item");
    var uuid = $("#preview").data("library-item-uuid");
    var items = [];
    $("#preview").children().each(function(index, item) {
        var item = $(item);
        var fields = [];
        var render_variables = {}
        item.find(".card-body").children().each(function (index, card){
            card = $(card);
            var cardFields = {
                type: card.data("type"),
                name: card.data("name"),
                value: card.text(),
                variable: card.data("variable")
            }
            fields.push(cardFields);
            render_variables[cardFields['variable']] = cardFields['value'];
        });
        items.push({
            id: item.data("id"),
            uuid: item.data('uuid'),
            sum: md5Hash(JSON.stringify(fields)),
            channel: item.data("channel"),
            name: item.data("name"),
            fields: fields

        });
        if (render) {
            CgRender(render_variables);
        }
        
    });

    var libraryItem = {
        uuid: uuid,
        type: 'cg-library-item',
        version: 2,
        items: items
    };

    ipcRenderer.send('update-library-item', libraryItemName, libraryItem);
}

function ExportPreviewToText() {
    var libraryItemName = $("#preview").data("library-item");
    var uuid = $("#preview").data("library-item-uuid");
    var items = [];
    $("#preview").children().each(function(index, item) {
        var item = $(item);
        var fields = [];
        item.find(".card-body").children().each(function (index, card){
            card = $(card);
            var cardFields = {
                type: card.data("type"),
                uuid: card.data('uuid'),
                sum: card.data('sum'),
                name: card.data("name"),
                value: card.text(),
                variable: card.data("variable")
            }
            fields.push(cardFields);
        });
        items.push({
            id: item.data("id"),
            uuid: item.data('uuid'),
            sum: item.data('sum'),
            channel: item.data("channel"),
            name: item.data("name"),
            fields: fields

        });
        
    });

    var text = libraryItemName;
    for(var item of items) {
        text = text + "\n";
        for(var field of item['fields']) {
            text = text + "\n" + field['name'] + ": " + field['value'];
        }
        
    }

}
function UpdatePlaylistItem() {
    var playlistItemName = $("#current_playlist").data("playlist-item");
    var items = [];
    $("#current_playlist").children().each(function(index, item) {
        var item = $(item);
        var text = item.text();
        items.push(text);
    });

    var playlistItem = {
        type: 'cg-playlist-item',
        version: 1,
        items: items
    };

    ipcRenderer.send('update-playlist-item', playlistItemName, playlistItem);
}

function DeSelectCards() {
    $("#preview > .ui-selected").removeClass("ui-selected");
    DeFocus();
}

function DeSelectListItems() {
    $("#library_pane > .ui-selected").removeClass("ui-selected");
    $("#current_playlist > .ui-selected").removeClass("ui-selected");
    DeFocus();
}

function DeSelectPlaylistItems() {
    $("#playlists_pane > .ui-selected").removeClass("ui-selected");
}

function SelectCard (elementsToSelect, scroll)
{
    // add unselecting class to all elements in the styleboard canvas except the ones to select
    $("#preview > .ui-selected").removeClass("ui-selected");
    $(elementsToSelect).addClass("ui-selected");
    if(scroll) {
        AutoScroll($("#preview"), $(elementsToSelect), 0);
    }
    

}

function SelectListItem (item) {
    DeSelectListItems();
    $(item).addClass("ui-selected");
}

function SelectPlaylistItem (item) {
    DeSelectPlaylistItems();
    $(item).addClass("ui-selected");
}

function DeFocus() {
    $(":focus.contenteditable").blur();
}

function debounce(callback, delay) {
    var timeout
    return function() {
      var args = arguments
      clearTimeout(timeout)
      timeout = setTimeout(function() {
        callback.apply(this, args)
      }.bind(this), delay)
    }
  }

function UpdateLibrary() {
    $("#library_pane").children().remove();
    $("#playlists_pane").children().remove();
    $("#current_playlist").children().remove();

    for(var item of library['library']) {
        var element = library_template.replace('%name%', item);
        var element = element.replace('%type%', 'cg-library-item');
        if (item == PREFERENCES['select_on_refresh']['library']) {
            element = element.replace('%id%', 'library_sel');
        } else {
            element = element.replace('%id%', '');
        }
        $("#library_pane").append(element);
        
    }

    for(var item of library['playlists']) {
        var element = library_template.replace('%name%', item);
        var element = element.replace('%type%', 'cg-playlist-item');

        if (item == PREFERENCES['select_on_refresh']['playlist']) {
            element = element.replace('%id%', 'playlist_sel');
        } else {
            element = element.replace('%id%', '');
        }

        $("#playlists_pane").append(element);
    }

    setTimeout(function(){
        $('#library_sel').mousedown();
        $("#playlist_sel").mousedown();
    }, 10);
    

}

function ShowPreferences() {
    $('#titler_live_url').val(GetPref('titler_live_url'));
    $('#webserver_port').val(GetPref('webserver_port'));
    $('#preferences').modal('show');
}
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

var drawArray = function(arr, width, height) {
    // set your canvas width/height
    canvas.width = width;
    canvas.height = height;
    var dataImage = new ImageData(width, height);

  // Set the pixel data using the TypedArray set method
  dataImage.data.set(arr);

  // Place the ImageData on the canvas
  ctx.putImageData(dataImage, 0, 0);
  };

$( document ).ready(function() {

    PREFERENCES = ipcRenderer.sendSync('get-prefs');
    
    ipcRenderer.send('get-websocket-url', GetPref('titler_live_url'));

    $(".btn-bible").popover({
        html: true,
        //trigger: 'focus',
        content: function() {
            return $('#add-bible').html();
        }
    });

    $(function() {
        $('#preview').selectable({
            cancel: '.sort-handle,.contenteditable',
            selecting: function(e, ui) { // on select
                var curr = $(ui.selecting.tagName, e.target).index(ui.selecting); // get selecting item index
                if(e.shiftKey && prev > -1) { // if shift key was pressed and there is previous - select them all
                    $(ui.selecting.tagName, e.target).slice(Math.min(prev, curr), 1 + Math.max(prev, curr)).addClass('ui-selected');
                    prev = -1; // and reset prev
                } else {
                    prev = curr; // othervise just save prev
                }
            }
        }).sortable({
            items: "> div",
            handle: '.sort-handle',
            helper: function(e, item) {
                if ( ! item.hasClass('ui-selected') ) {
                    item.parent().children('.ui-selected').removeClass('ui-selected');
                    item.addClass('ui-selected');
                }

                var selected = item.parent().children('.ui-selected').clone();
                item.data('multidrag', selected).siblings('.ui-selected').remove();
                return $('<div/>').append(selected);
            },
            stop: function(e, ui) {
                var selected = ui.item.data('multidrag');
                ui.item.after(selected);
                ui.item.remove();
                UpdateLibraryItem();
                UpdateEvents();
            }
        });
    });

    $.each(templates, function(index, template){
        var item = '<a class="dropdown-item" href="#" data-index='+index+'>['+template['channel'].toUpperCase()+']&nbsp;&nbsp;'+template['name']+'</a>';
        $("#addMenu").append(item);
    });

    $('#save-preferences').click(function (){
        SetPref('titler_live_url', $('#titler_live_url').val());
        SetPref('webserver_port', $('#webserver_port').val());
        $('#preferences').modal('hide');
    });

    $("#btn-add").click(function() {
        $(".btn-bible").popover('hide');
        AddNewCard();
    });

    $("#btn-add-dropdown").click(function() {
        $(".btn-bible").popover('hide');
    });

    $('.btn-bible').off();
    $('.btn-bible').on('mousedown', function(e) {
        if(!bible_add_focus && !bible_ref_focus && !bible_ver_focus) {
            $('.btn-bible').popover('show');
        }
    });

    $('.btn-bible').on('show.bs.popover', function (e) {
        setTimeout(function(){
            var input = $("div.popover-body > form.add-bible").find('.bible-reference');
            var ref = $("div.popover-body > form.add-bible").find('.bible-reference');
            var version = $("div.popover-body > form.add-bible").find('.bible-version');
            var add_btn = $("div.popover-body > form.add-bible").find('.btn-bible-add');
            input.val(GetPref('last_bible_ref'));
            version.val(GetPref('last_bible_version'));

            ref.focus(function(){
                bible_ref_focus = true;
            });
            ref.blur(function(){
                bible_ref_focus = false;
                setTimeout(function(){
                    if(!bible_add_focus && !bible_ref_focus && !bible_ver_focus) {
                        $('.btn-bible').popover('hide');
                    }
                }, 1);
            });

            version.focus(function(){
                bible_ver_focus = true;
            });
            version.blur(function(){
                bible_ver_focus = false;
                setTimeout(function(){
                    if(!bible_add_focus && !bible_ref_focus && !bible_ver_focus) {
                        $('.btn-bible').popover('hide');
                    }
                }, 1);
            });
            
            add_btn.focus(function(){
                bible_add_focus = true;
            });
            add_btn.blur(function(){
                bible_add_focus = false;
                setTimeout(function(){
                    if(!bible_add_focus && !bible_ref_focus && !bible_ver_focus) {
                        $('.btn-bible').popover('hide');
                    }
                }, 1);
            });

            $(input).on('focus', function() {
                document.execCommand('selectAll', false, null);
            });
            input.focus();

            $(input).on('keydown', function(e) {
                var key = e.charCode ? e.charCode : e.keyCode ? e.keyCode : 0;
                if(key == 13) {
                    e.preventDefault();
                    var reference = $("div.popover-body > form.add-bible").find('.bible-reference');
                    var version = $("div.popover-body > form.add-bible").find('.bible-version');
                    SetPref('last_bible_ref', input.val());
                    ipcRenderer.send('get-scripture', reference.val(), version.val());
                    $('div.popover-body').find('.btn-bible-add-image').hide();
                    $('div.popover-body').find('.btn-bible-load-image').show();
                    //$('.btn-bible').popover('hide');
                }
            });

            $(version).on('keydown', function(e) {
                var key = e.charCode ? e.charCode : e.keyCode ? e.keyCode : 0;
                if(key == 13) {
                    e.preventDefault();
                    var reference = $("div.popover-body > form.add-bible").find('.bible-reference');
                    var version = $("div.popover-body > form.add-bible").find('.bible-version');
                    SetPref('last_bible_ref', input.val());
                    ipcRenderer.send('get-scripture', reference.val(), version.val());
                    $('div.popover-body').find('.btn-bible-add-image').hide();
                    $('div.popover-body').find('.btn-bible-load-image').show();
                    //$('.btn-bible').popover('hide');
                }
            });

            var add_btn = $("div.popover-body > form.add-bible").find('.btn-bible-add');

            $(add_btn).on('click', function() {
                var reference = $("div.popover-body > form.add-bible").find('.bible-reference');
                var version = $("div.popover-body > form.add-bible").find('.bible-version');
                SetPref('last_bible_ref', input.val());
                ipcRenderer.send('get-scripture', reference.val(), version.val());
                //$('.btn-bible').popover('hide');
                $('div.popover-body').find('.btn-bible-add-image').hide();
                $('div.popover-body').find('.btn-bible-load-image').show();
            });
        }, 1);

    });

    $('.btn-bible').on('hide.bs.popover', function() {
        var ref = $("div.popover-body > form.add-bible").find('.bible-reference');
        var version = $("div.popover-body > form.add-bible").find('.bible-version');
        SetPref('last_bible_ref', ref.val());
        SetPref('last_bible_version', version.val());
    });



    $("#addMenu > a").click(function(e) {
        AddNewCard($(e.currentTarget).data("index"));
    });

    $('html').keyup(function(e){
        if (e.keyCode == 46) {
            e.preventDefault();
            RemoveItems();
        }
    });

    $('html').keydown(function(e){
        if (e.ctrlKey) {
            if (e.keyCode == 65 || e.keyCode == 97) { // 'A' or 'a'
                if (!$(":focus").hasClass("contenteditable") && $(".ui-selected").length > 0) {
                    e.preventDefault();
                    $(".card").addClass("ui-selected");
                }
                
                // SELECT ALL MARKERS HERE...
            }
        }
    });

    $("#current_playlist").sortable({
        stop: function(event, ui) {
            UpdatePlaylistItem();
        }
    });


   function clickWorkaround () {
    var clicked = false, clickY;
        $("#preview").on({
            'mousemove': function(e) {
                clicked && updateScrollPos(e);
            },
            'mousedown': function(e) {
                clicked = true;
                clickY = e.pageY;
            },
            'mouseup': function() {
                clicked = false;
                $('html').css('cursor', 'auto');
            }
        });

        var updateScrollPos = function(e) {
            $("#preview").scrollTop($("#preview").scrollTop() + (clickY - e.pageY) /60 );
        }
   }

   $("#library_pane").sortable({
        connectWith: "#current_playlist",
        helper: "clone",
        placeholder: "placeholder",
        start: function (event, ui) {
            $(ui.item).show();
            clone = $(ui.item).clone();
            before = $(ui.item).prev();
            parent = $(ui.item).parent();
        },
        beforeStop: function(event, ui) {
            // Don't allow resorting in list1... would call cancel here, but there is a jquery 1.7 bug so we
            // need to do the check here but do the cancel in "stop" below. @see http://bugs.jqueryui.com/ticket/6054
            $(this).sortable("option", "selfDrop", $(ui.placeholder).parent()[0] == this);
        },
        stop: function(event, ui) {
            var $sortable = $(this);
            if ($sortable.sortable("option", "selfDrop")) {
                $sortable.sortable('cancel');
                return;
            }
            DeSelectListItems();

            if (before.length)
                before.after(clone);
            else
                parent.prepend(clone);

            UpdateEvents();
            UpdatePlaylistItem();
        }
    });

    ipcRenderer.send('get-library-data');

    ipcRenderer.send('get-bibles');

}); // End On Ready

ipcRenderer.on('library-data', (event, data) => {
    library = data;
    UpdateLibrary();
    UpdateEvents();
});

ipcRenderer.on('library-item', (event, name, data) => {
    $("#preview").children().remove();
    $("#preview").data("library-item", name);
    $("#preview").data("library-item-uuid", data['uuid']);
    for(var item of data['items']) {
        InsertCard(item, -1, false, name);
        fields = {}
        for(var field of item["fields"]) {
            fields[field['variable']] = field['value'];
        }
        CgRender(fields);
    }
    
});

ipcRenderer.on('program-item', (event, name, data, index, goLive) => {
    live_index = -1;
    cued_index = -1;
    $("#program").children().remove();
    $("#program").data("library-item", name);
    var doSelect = false;
    for(var item of data['items']) {
        InsertCard(item, -1, false, "program");
    }
    if (goLive) {
        PlayIn(index);
    } else {
        Cue(index);
    }
    
});

ipcRenderer.on('playlist-item', (event, name, data) => {
    $("#current_playlist").children().remove();
    $("#current_playlist").data("playlist-item", name);
    for(var item of data['items']) {
        var element = library_template.replace('%name%', item);
        element = element.replace('%type%', 'cg-library-item');

        if (item == PREFERENCES['select_on_refresh']['current']) {
            element = element.replace('%id%', 'current_sel');
        } else {
            element = element.replace('%id%', '');
        }
        $("#current_playlist").append(element);
        
    }
    setTimeout(function(){
        $('#current_sel').mousedown();
    }, 10);
    UpdateEvents();
});

ipcRenderer.on('new-presentation', (event) => {
    ShowPresentationDialog();
});

ipcRenderer.on('new-playlist', (event) => {
    ShowPlaylistDialog();
});

ipcRenderer.on('websocket-url', (event, url) => {
    StartBackend(url);
});

ipcRenderer.on('metadata', (event, meta) => {
    METADATA = meta;
});


ipcRenderer.on('add-scripture', (event, data) => {
    console.log('scripture:')
    console.log(data);
    if (data['status'] == 'success') {
        for(var verse of data['verses']) {
            var card_details = {
                id: 'scripture',
                channel: 'a',
                name: 'Scripture',
                fields: [
                    {
                        type: 'text',
                        name: 'Scripture',
                        value: verse['scripture'],
                        variable: 'Scripture_Scripture'
                    },
                    {
                        type: 'text',
                        name: 'Reference',
                        value: verse['reference'],
                        variable: 'Scripture_Reference'
                    }
                ]
            }

            AddNewCard('scripture', card_details);
            $('div.popover-body').find('.btn-bible-load-image').hide();
            $('div.popover-body').find('.btn-bible-add-image').show();
        }
    }
});


ipcRenderer.on('show-preferences', (event) => {
    ShowPreferences();
});


ipcRenderer.on('playin', (event) => {
    PlayIn();
});

ipcRenderer.on('playout-a', (event) => {
    PlayOut('a');
});

ipcRenderer.on('playout-b', (event) => {
    PlayOut('b');
});

ipcRenderer.on('playout-c', (event) => {
    PlayOut('c');
});
ipcRenderer.on('playout-all', (event) => {
    PlayOut('all');
});

ipcRenderer.on('cue-next', (event) => {
    var index  = $("#program .cued").index() + 1;
    if (index < $('#program').children().length) {
        Cue(index);
    }
});

ipcRenderer.on('cue-prev', (event) => {
    var index  = $("#program .cued").index() - 1;
    if (index >= 0) {
        Cue(index);
    }
});

ipcRenderer.on('cue', (event, index) => {
    if (index >= 0 && index < $('#program').children().length) {
        Cue(index);
    }
});

ipcRenderer.on('image-update', (event, data) => {
    rgba = window.convertBgraToRgba(data);
    drawArray(rgba,1919,1079);
});

    
ipcRenderer.on('bibles', (event, bibles) => {
    $('.bible-version').empty();
    bibles.forEach(bible => {
        $('.bible-version').append(`<option label="${bible['Abbreviation']} - ${bible['Title']}">${bible['Abbreviation']}</option>`);
    });
});


// Titler Live Interface

function StartBackend(ws_url) {
    // Initiate the server connection.
    ServiceHandler.init(ws_url);

    // We should handle error conditions, such as network loss or something else unexpected.
    ServiceHandler.onclose = function () {
        console.warn("ServiceHandler disconnected");
    };

    ServiceHandler.onerror = function(error) {
        console.error("ServiceHandler error", error);
    };

    // This is our callback when the server is connected and we're ready to access the APIs.
    ServiceHandler.onready = function () {

        // The ServiceHandler's scheduler object is the one implementing the API, so we save a reference.
        window.scheduler = ServiceHandler.scheduler;

        var titler_variables = {};

        for(var template of templates) {
            for(var field of template['fields']) {
                titler_variables[field['variable']] = {
                    category: "required",
                }
            }
        }


        // Declare variables that this input will use here, instead of hardcoding these in the XML defintion file. These can be changed at any time later.
        scheduler.updateInputDefinition(INPUT_NAME, {
            variables: titler_variables
        });

        // Establish a callback for when one or more variable value changes. This is usefull to sync values between several browser windows, for example.
        // Normaly, only the values that actually changed are contained in the callback, however when first connecting the server, all variables' values will be sent over. This is to make sure the controls are populated with initial default values and ensures the values aren't lost when reloading the page, for example.
        scheduler.variablesChanged.connect(function (inputName, variables) {
            // Because there is a single server for all HTML inputs, this callback will be fired for any variable change and contain data we're not neccessary interested in, so we filter using the input name we set in the definition xml file.
            if (inputName == INPUT_NAME) {
                console.debug("Variables changed", variables);

            }
        });
        
        

        scheduler.redirected.connect(function (inputName, newUrl) {
            // Because there is a single server for all HTML inputs, this callback will be fired for any variable change and contain 
            // data we're not neccessary interested in, so we filter using the input name we set in the definition xml file.
            if (inputName == INPUT_NAME) {
                window.location.replace(newUrl);
            }
        });

        console.info("ServiceHandler connected, ready to send/receive messages!");
    };
}
window.onbeforeunload = function() {
    scheduler.pageClosed(INPUT_NAME);
};

function CgRender(data) {
    try {
        scheduler.scheduleVariablesEx(
            "render", //action
            0, //time
            INPUT_NAME, //inputName
            "0", //channelName
            INPUT_NAME, //queueName
            "", //titleName
            "", //startSegmentName
            "", //endSegmentName
            data //variables
        );
    }
    catch (err) {
        return
    }
    
}

function CgUpdate(data) {
    try {
        scheduler.scheduleVariablesEx(
            "update", //action
            0, //time
            INPUT_NAME, //inputName
            "0", //channelName
            INPUT_NAME, //queueName
            "", //titleName
            "", //startSegmentName
            "", //endSegmentName
            data //variables
        );
    }
    catch (err) {
        return
    }

}

function CgPlayIn(title_name, data) {
    try {
        scheduler.scheduleVariablesEx(
            "animatein", //action
            0, //time
            INPUT_NAME, //inputName
            "0", //channelName
            INPUT_NAME, //queueName
            title_name, //titleName
            "", //startSegmentName
            "", //endSegmentName
            data //variables
        );
    }
    catch (err) {
        return
    }

}

function CgPlayOut(title_name) {
    try {
        scheduler.scheduleVariablesEx(
            "animateout", //action
            0, //time
            INPUT_NAME, //inputName
            "0", //channelName
            INPUT_NAME, //queueName
            title_name, //titleName
            "", //startSegmentName
            "", //endSegmentName
            {} //variables
        );
    }
    catch (err) {
        return
    }

}