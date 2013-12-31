/**
 * File name and definition search for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var Heap = require("./heap");

/**
 * Search through a list of filenames.
 */
module.exports.fileSearch = function(filelist, keyword) {
    // var klen = keyword.length;

    var type = "value";
    var toS = function(){
        return this[type];
    };
    
    var name, value, ext;
    // var res = klen < 3 ? [] : new Heap();
    var res     = new Heap();
    var newlist = [];
    
    for (var i = 0, l = filelist.length, s, j, k, q, p, m, n; i < l; i++) {
        name  = filelist[i];
        // value = score.score(name);
        value = score(name, keyword);

        // if ((j = name.lastIndexOf(keyword)) > -1) {
        //     if (klen < 3) {
        //         res.push(name);
        //         continue;

        if (value > 0) {
            newlist.push(name);
            if (res.size() === 100 && value > res.min().value)
                res.pop();
            if (res.size() < 100)
                res.push({
                    toString : toS,
                    value : value,
                    name  : name
                });
        }
    }

    // if (klen < 3)
    //     return res;

    var ret = [];
    while (res.size())
        ret.unshift(res.pop().name);
    
    ret.newlist = newlist;
    
    return ret;
};

function score (e, term) {
    var c = 0,
        d = term.length,
        f = e.length,
        g, h, i = 1,
        j;
    if (e == term) return 1;
    for (var k = 0, l, m, n, o, p, q; k < d; ++k) {
        n = term[k], o = e.indexOf(n.toLowerCase()), p = e.indexOf(n.toUpperCase()), q = Math.min(o, p), m = q > -1 ? q : Math.max(o, p);
        if (m === -1) {
            return 0;
        }
        l = .1, e[m] === n && (l += .1), m === 0 ? (l += .6, k === 0 && (g = 1)) : e.charAt(m - 1) === " " && (l += .8), e = e.substring(m + 1, f), c += l
    }
    return h = c / d, j = (h * (d / f) + h) / 2, j /= i, g && j + .15 < 1 && (j += .15), j
};

var treeSearch = module.exports.treeSearch = function(tree, keyword, caseInsensitive, results, head) {
    if (caseInsensitive)
        keyword = keyword.toLowerCase();
    results = results || [];
    head = head || 0;
    for (var i = 0; i < tree.length; i++) {
        var node = tree[i];
        var name = node.name;
        if (caseInsensitive)
            name = name.toLowerCase();
        var index = name.indexOf(keyword);
        if (index === -1) {
            if (node.items)
                results = treeSearch(node.items, keyword, caseInsensitive, results, head);
            continue;
        }
        var result = {
            items: node.items ? treeSearch(node.items, keyword, caseInsensitive) : []
        };
        for (var p in node) {
            if (node.hasOwnProperty(p) && p !== "items")
                result[p] = node[p];
        }
        if (index === 0) {
            results.splice(head, 0, result);
            head++;
        }
        else {
            results.push(result);
        }
    }
    return results;
};

var matchPath = module.exports.matchPath = function (path, keyword) {
    var result = [];
    var pathSplits = path.split("/");
    // Optimization
    if (pathSplits.length > 4)
        pathSplits = [pathSplits.slice(0, pathSplits.length - 4).join("/") + "/"]
            .concat(pathSplits.slice(pathSplits.length - 4, pathSplits.length));
    var value = "";
    var k, i, j = -1;
    for (k = pathSplits.length-1; k >= 0  && !result.length; k--) {
        value = (k > 0 ? "/" : "") + pathSplits[k] + value;
        // find matched parts
        var matchI = null;
        var missI = null;
        for (i = 0, j = 0; i < value.length && j < keyword.length; i++) {
            if (value[i] === keyword[j]) {
                matchI = matchI === null ? i : matchI;
                j++;
                if (missI !== null) {
                    result.push({ val: value.substring(missI, i) });
                    missI = null;
                }
            }
            else {
                missI = missI === null ? i : missI;
                if (matchI !== null) {
                    result.push({ match: true, val: value.substring(matchI, i)});
                    matchI = null;
                }
            }
        }
        if (j !== keyword.length) {
            result = [];
            continue;
        }

        if (missI !== null)
            result.push({ val: value.substring(missI, i) });
        if (matchI !== null)
            result.push({ match: true, val: value.substring(matchI, i)});
        result.push({ val: value.substring(i, value.length) });
        // Add the first non matched part if exists
        if (k)
            result.unshift({ val: pathSplits.slice(0, k).join('/') });
    }
    return result;
};

});
