define(function(require, exports, module) {
    "use strict";
    
    var oop  = require("ace/lib/oop");
    var Base = require("ace_tree/list_data");
    
    var ListData = function(array) {
        Base.call(this);
        
        // todo compute these automatically
        this.innerRowHeight = 34;
        this.rowHeight = 42;
        
        Object.defineProperty(this, "loaded", {
            get : function(){ return this.visibleItems.length; }
        });
    };
    oop.inherits(ListData, Base);
    (function() {
        
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
            var path = this.visibleItems[row];
            var isSelected = this.isSelected(row);
            var filename = path.substr(path.lastIndexOf("/") + 1);
            html.push("<div class='item " + (isSelected ? "selected" : "") 
                + "' style='height:" + this.innerRowHeight + "px'><span>"
                + this.replaceStrong(filename)
                + "</span><span class='path'>"
                + this.replaceStrong(path)
                + "</span></div>");
        };
    }).call(ListData.prototype);
    
    return ListData;
});