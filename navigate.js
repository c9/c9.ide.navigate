define(function(require, exports, module) {
    main.consumes = [
        "Panel", "settings", "ui", "watcher", "menus", "tabManager", "find", 
        "fs", "panels", "fs.cache", "preferences", "c9", "tree", "commands"
    ];
    main.provides = ["navigate"];
    return main;
    
    function main(options, imports, register) {
        var Panel    = imports.Panel;
        var settings = imports.settings;
        var ui       = imports.ui;
        var c9       = imports.c9;
        var fs       = imports.fs;
        var fsCache  = imports["fs.cache"];
        var tabs     = imports.tabManager;
        var menus    = imports.menus;
        var watcher  = imports.watcher;
        var panels   = imports.panels;
        var find     = imports.find;
        var filetree = imports.tree;
        var prefs    = imports.preferences;
        var commands = imports.commands;
        
        var markup   = require("text!./navigate.xml");
        var search   = require('./search');
        var Tree     = require("ace_tree/tree");
        var ListData = require("./dataprovider");
        var basename = require("path").basename;
        
        /***** Initialization *****/
        
        var plugin = new Panel("Ajax.org", main.consumes, {
            index        : options.index || 200,
            caption      : "Navigate",
            elementName  : "winGoToFile",
            minWidth     : 130,
            autohide     : true,
            where        : options.where || "left"
        });
        // var emit   = plugin.getEmitter();
        
        var winGoToFile, txtGoToFile, tree, ldSearch;
        var lastSearch, lastPreviewed;
        
        var dirty         = true;
        var arrayCache    = [];
        var timer;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            var command = plugin.setCommand({
                name    : "navigate",
                hint    : "search for a filename, line or symbol and jump to it",
                bindKey : { mac: "Command-E|Command-P", win: "Ctrl-E|Ctrl-P" }
            });
            
            commands.addCommand({
                name    : "navigate_altkey",
                hint    : "search for a filename, line or symbol and jump to it",
                bindKey : {
                    mac: "Command-O", 
                    win: "Ctrl-O"
                },
                group : "Panels",
                exec  : function() {
                    command.exec();
                }
            }, plugin);
            
            panels.on("afterAnimate", function(){
                if (panels.isActive("navigate"))
                    tree && tree.resize();
            });
            
            // Menus
            var mnuItem = new apf.item({ command : "navigate" });
            menus.addItemByPath("File/Open...", mnuItem, 500, plugin);
            menus.addItemByPath("Goto/Goto File...", mnuItem.cloneNode(false), 100, plugin);
    
            // Settings
            settings.on("read", function(){
                settings.setDefaults("user/general", [["preview-navigate", "false"]]);
            }, plugin);
            
            // Prefs
            prefs.add({
                "General" : {
                    "General" : {
                        "Enable Preview on Navigation" : {
                            type     : "checkbox",
                            position : 2000,
                            path     : "user/general/@preview-navigate"
                        }
                    }
                }
            }, plugin);
    
            // Update when the fs changes
            fs.on("afterWriteFile", function(e){
                // Only mark dirty if file didn't exist yet
                if (arrayCache.indexOf(e.path) == -1)
                    markDirty(e);
            });
            fs.on("afterUnlink",    markDirty);
            fs.on("afterRmfile",    markDirty);
            fs.on("afterRmdir",     markDirty);
            fs.on("afterCopy",      markDirty);
            fs.on("afterRename",    markDirty);
            fs.on("afterSymlink",   markDirty);
            
            // Or when a watcher fires
            watcher.on("delete",     markDirty);
            watcher.on("directory",  markDirty);
            
            // Or when the user refreshes the tree
            filetree.on("refresh", markDirty); 
            
            // Or when we change the visibility of hidden files
            fsCache.on("setShowHidden", markDirty);
            
            // Pre-load file list
            updateFileCache();
        }
        
        function offlineHandler(e){
            // Online
            if (e.state & c9.STORAGE) {
                txtGoToFile.enable();
                //@Harutyun This doesn't work
                // tree.enable();
            }
            // Offline
            else {
                // do not close panel while typing
                if (!txtGoToFile.ace.isFocused())
                    txtGoToFile.disable();
                //@Harutyun This doesn't work
                // tree.disable();
            }
        }
        
        var drawn = false;
        function draw(options){
            if (drawn) return;
            drawn = true;
            
            // Create UI elements
            ui.insertMarkup(options.aml, markup, plugin);
            
            // Import CSS
            ui.insertCss(require("text!./style.css"), plugin);
            
            var treeParent   = plugin.getElement("navigateList");
            txtGoToFile      = plugin.getElement("txtGoToFile");
            winGoToFile      = plugin.getElement("winGoToFile");
            txtGoToFile      = plugin.getElement("txtGoToFile");

            // Create the Ace Tree
            tree      = new Tree(treeParent.$int);
            ldSearch  = new ListData(arrayCache);
            ldSearch.search = search;
            
            // Assign the dataprovider
            tree.setDataProvider(ldSearch);
            
            tree.renderer.setScrollMargin(0, 10);

            // @TODO this is probably not sufficient
            window.addEventListener("resize", function(){ tree.resize() });
            
            tree.textInput = txtGoToFile.ace.textInput;
            
            txtGoToFile.ace.commands.addCommands([
                {
                    bindKey : "ESC",
                    exec    : function(){ plugin.hide(); }
                }, {
                    bindKey : "Enter",
                    exec    : function(){ openFile(true); }
                },
            ]);
            function forwardToTree() {
                tree.execCommand(this.name);
            }
            txtGoToFile.ace.commands.addCommands([
                "centerselection",
                "goToStart",
                "goToEnd",
                "pageup",
                "gotopageup",
                "scrollup",
                "scrolldown",
                "goUp",
                "goDown",
                "selectUp",
                "selectDown",
                "selectMoreUp",
                "selectMoreDown"
            ].map(function(name) {
                var command = tree.commands.byName[name];
                return {
                    name: command.name,
                    bindKey: command.editorKey || command.bindKey,
                    exec: forwardToTree
                }
            }));
            
            tree.on("click", function(ev){
                var e = ev.domEvent;
                if (!e.shiftKey && !e.metaKey  && !e.ctrlKey  && !e.altKey)
                if (tree.selection.getSelectedNodes().length === 1)
                    openFile(true);
            });
            
            tree.selection.$wrapAround = true;
            
            txtGoToFile.ace.on("input", function(e) {
                var val = txtGoToFile.getValue();
                filter(val);
    
                if (dirty && val.length > 0 && ldSearch.loaded) {
                    dirty = false;
                    updateFileCache(true);
                }
            });
            
            tree.selection.on("change", function(){ previewFile(); });
    
            function onblur(e){
                if (!winGoToFile.visible)
                    return;
                
                var to = e.toElement;
                if (!to || apf.isChildOf(winGoToFile, to, true)
                  || (lastPreviewed && tabs.previewTab 
                  && tabs.previewTab === lastPreviewed
                  && (apf.isChildOf(lastPreviewed.aml.relPage, to, true)
                  || lastPreviewed.aml == to))) {
                    return;
                }
                
                // TODO add better support for overlay panels
                setTimeout(function(){ plugin.hide() }, 10);
            }
    
            apf.addEventListener("movefocus", onblur);
    
            // Focus the input field
            setTimeout(function(){
                txtGoToFile.focus();
            }, 10);
            
            // Offline
            c9.on("stateChange", offlineHandler, plugin);
            offlineHandler({ state: c9.status });
        }
        
        /***** Methods *****/
        
        function reloadResults(){
            if (!winGoToFile) {
                plugin.once("draw", function(){
                    reloadResults();
                });
                return;
            }
            
            // Wait until window is visible
            if (!winGoToFile.visible) {
                winGoToFile.on("prop.visible", function visible(e){
                    if (e.value) {
                        reloadResults();
                        winGoToFile.off("prop.visible", visible);
                    }
                });
                return;
            }
            
            var sel = tree.selection.getSelectedNodes();
            if (lastSearch) {
                filter(lastSearch, sel.length);
            } else {
                ldSearch.updateData(arrayCache);
            }
        }
    
        function markDirty(options){
            // Ignore hidden files
            var path = options && options.path || "";
            if (path && !fsCache.showHidden && path.charAt(0) == ".")
                return;
            
            dirty = true;
            if (panels.isActive("navigate")) {
                clearTimeout(timer);
                timer = setTimeout(function(){ updateFileCache(true); }, 2000);
            }
        }
    
        var updating = false;
        function updateFileCache(isDirty){
            clearTimeout(timer);
            if (updating)
                return;
            updating = true;
            find.getFileList({
                path    : "/",
                nocache : isDirty,
                hidden  : fsCache.showHidden,
                buffer  : true
            }, function(err, data){
                if (err)
                    return;

                arrayCache = data.trim().split("\n");
                
                updating = false;
                reloadResults();
            });
            
            dirty = false;
        }
        
        /**
         * Searches through the dataset
         *
         */
        function filter(keyword, nosel){
            keyword = keyword.replace(/\*/g, "");
    
            if (!arrayCache.length) {
                lastSearch = keyword;
                return;
            }
            
            // Needed for highlighting
            ldSearch.keyword = keyword;
            
            var searchResults;
            if (!keyword) {
                var result = arrayCache.slice();
                // More prioritization for already open files
                tabs.getTabs().forEach(function (tab) {
                    if (!tab.path
                      || tab.document.meta.preview) return;
                    
                    var idx = result.indexOf(tab.path);
                    if (idx > -1) {
                        result.splice(idx, 1);
                        result.unshift(tab.path);
                    }
                });
                searchResults = result;
            }
            else {
                tree.provider.setScrollTop(0);
                searchResults = search.fileSearch(arrayCache, keyword);
            }
    
            lastSearch = keyword;
    
            if (searchResults)
                ldSearch.updateData(searchResults);
                
            if (nosel || !searchResults.length)
                return;
    
            var first = -1;
            if (keyword) {
                first = 0
                // See if there are open files that match the search results
                // and the first if in the displayed results
                var openTabs = tabs.getTabs(), hash = {};
                for (var i = openTabs.length - 1; i >= 0; i--) {
                    var tab = openTabs[i];
                    if (!tab.document.meta.preview && tab.path) {
                        if (basename(tab.path).indexOf(keyword) == 0)
                            hash[tab.path] = true;
                    }
                }
                
                // loop over all visible items. If we find a visible item
                // that is in the `hash`, select it and return.
                
                var last = tree.renderer.$size.height / tree.provider.rowHeight;
                for (var i = 0; i < last; i++) {
                    if (hash[ldSearch.visibleItems[i]]) {
                        first = i;
                        break;
                    }
                }
            }
            // select the first item in the list
            tree.select(tree.provider.getNodeAtIndex(first));
        }

        function openFile(noanim){
            if (!ldSearch.loaded)
                return false;

            var nodes = tree.selection.getSelectedNodes();
            var cursor = tree.selection.getCursor();
    
            // Cancel Preview and Keep the tab if there's only one
            if (tabs.preview({ cancel: true, keep : nodes.length == 1 }) === true)
                return plugin.hide();
            
            plugin.hide();
            
            var fn = function(){};
            for (var i = 0, l = nodes.length; i < l; i++) {
                var path  = "/" + nodes[i].id.replace(/^[\/]+/, "");
                
                tabs.open({
                    path   : path, 
                    noanim : l > 1,
                    active : nodes[i].id === cursor.id
                }, fn);
            }
            
            lastPreviewed = null;
        }
        
        function previewFile(noanim){
            if (!settings.getBool("user/general/@preview-navigate"))
                return;
            
            if (!ldSearch.loaded)
                return false;
            
            var node = tree.selection.getCursor();
            var value = node && node.id;
            if (!value)
                return;
                
            var path  = "/" + value.replace(/^[\/]+/, "");
            lastPreviewed = tabs.preview({ path: path }, function(){});
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("draw", function(e){
            draw(e);
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("show", function(e){
            txtGoToFile.focus();
            txtGoToFile.select();
        });
        plugin.on("hide", function(e){
            // Cancel Preview
            tabs.preview({ cancel: true });
        });
        plugin.on("unload", function(){
            loaded = false;
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Navigation panel. Allows a user to navigate to files by searching
         * for a fuzzy string that matches the path of the file.
         * @singleton
         * @extends Panel
         **/
        /**
         * @command navigate
         */
        /**
         * Fires when the navigate panel shows
         * @event showPanelNavigate
         * @member panels
         */
        /**
         * Fires when the navigate panel hides
         * @event hidePanelNavigate
         * @member panels
         */
        plugin.freezePublicAPI({
            /**
             * @property {Object}  The tree implementation
             * @private
             */
            get tree() { return tree; }
        });
        
        register(null, {
            navigate: plugin
        });
    }
});