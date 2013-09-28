define(function(require, exports, module) {
    var oop          = require("ace/lib/oop");
    var Scrollable = require("ace_tree/scrollable");
    
    var ListData = function(array) {
        this.visibleItems = array || [];
        // todo compute these automatically
        this.innerRowHeight = 34;
        this.rowHeight = 42; 
        
        this.$selectedNode = this.root;
        
        Object.defineProperty(this, "loaded", {
            get : function(){ return this.visibleItems.length; }
        });
    };
    
    (function() {
        oop.implement(this, Scrollable);
        
        this.updateData = function(array){
            this.visibleItems = array || [];
            
            // @TODO Deal with selection
            this._signal("change");
        };
        
        this.getEmptyMessage = function(){
            if (!this.keyword)
                return "Loading file list. One moment please...";
            else
                return "No files found that match '" + this.keyword + "'";
        };
    
        this.getDataRange = function(rows, columns, callback) {
            var view = this.visibleItems.slice(rows.start, rows.start + rows.length);        
            callback(null, view, false);
            return view;
        };
        
        this.getRange = function(top, bottom) {
            var start = Math.floor(top / this.rowHeight);
            var end = Math.ceil(bottom / this.rowHeight) + 1;
            var range = this.visibleItems.slice(start, end);
            range.count = start;
            range.size = this.rowHeight * range.count;
            return range;
        };
        
        this.getTotalHeight = function(top, bottom) {
            return this.rowHeight * this.visibleItems.length;
        };
        // todo move selection stuff out of here
        this.select = function(index) {
            this.selectNode({index: index});
        };
        this.selectNode = function(node) {
            if (!node) return;
            this.$selectedNode = node;
            this.selectedRow = node.index;
            this._signal("change");
            this._emit("select");
        };
        
        this.getNodePosition = function(node) {
            var i = node ? node.index : 0;
            var top = i * this.rowHeight;
            var height = this.rowHeight;
            return {top: top, height: height};
        };
        
        this.findItemAtOffset = function(offset) {
            var index = Math.floor(offset / this.rowHeight);
            return {label:this.visibleItems[index], index: index};
        };
    
        this.replaceStrong = function(value){
            if (!value)
                return "";
                
            var keyword = (this.keyword || "").replace(/\*/g, "");
            var i;
            if ((i = value.lastIndexOf(keyword)) !== -1)
                return value.substring(0, i) + "<strong>" + keyword + "</strong>" 
                    + value.substring(i+keyword.length);
            
            var result = this.search.matchPath(value, keyword);
            if (!result.length)
                return value;
                
            result.forEach(function(part, i) {
                if (part.match)
                    result[i] = "<strong>" + part.val + "</strong>";
                else
                    result[i] = part.val;
            });
            return result.join("");
        };
    
        this.renderRow = function(row, html, config) {
            var path     = this.visibleItems[row];
            var filename = path.substr(path.lastIndexOf("/") + 1);
            html.push("<div class='item " + (row == this.selectedRow ? "selected" : "") 
                + "' style='height:" + this.innerRowHeight + "px'><span>"
                + this.replaceStrong(filename)
                + "</span><span class='path'>"
                + this.replaceStrong(path)
                + "</span></div>");
        };
        
        this.navigate = function(dir, startNode) {        
            if  (typeof startNode == "number")
                var index = startNode;
            else
                index = this.selectedRow || 0;
            
            if (dir == "up") {
                index = Math.max(index - 1, 0);
            } else if (dir == "down") {
                index = Math.min(index + 1, this.visibleItems.length);
            }
            return {label: this.visibleItems[index], index: index};
        };
    }).call(ListData.prototype);
    
    return ListData;
});