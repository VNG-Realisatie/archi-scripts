var _commonScriptName;
var _commonCounter;

// default console logging is off. Override in calling function with push() and pop()
let _commonShowInfoMessage = [false];
let _commonShowDebugMessage = [false];


/**
 * initConsoleLog and finishconsole
 * 	first and last call in an Archi script
 * 
 * @param pFile : string __FILE__ as current script
 * @param pClear : boolean for clear console
 */
function initConsoleLog(pFile, pClear) {
	_commonCounter = startCounter();
	// Show output in the console
	filePath = pFile.split("/");
	_commonScriptName = filePath[filePath.length - 1];

	console.show();
    if (pClear) { console.clear() };

	console.log("============================================");
    console.log(`Platform: ${$.process.platform}\nEngine:   ${$.process.engine}\n`)
	console.log(`Executing script "${_commonScriptName}"...\n`);
}

function finishConsoleLog() {
	_commonCounter = endCounter(_commonCounter);
	duration = `${_commonCounter.minutes}m${_commonCounter.seconds}s`
	console.log(`\nScript "${_commonScriptName}" finished in ${duration}\n`);
}

/**
 * startCounter and endCounter
 * 	measure runtime for a block of code
 */
function startCounter() {
	return new Date();
}

function endCounter(startCounter) {
	_endCounter = new Date();
	_durationInSeconds = parseInt((_endCounter - startCounter) / 1000);
	_minutes = parseInt(_durationInSeconds / 60);
	_seconds = parseInt(_durationInSeconds % 60);
	return { minutes: _minutes, seconds: _seconds };
}

/**
 * info()
 * 	show informational message if global _commonShowInfoMessage is set
 * @param msg string information message
 */
function info(msg) {
	logMessage(_commonShowInfoMessage, "Info", msg)
}

/**
 * debug()
 * 	show debug message if global _commonShowDebugMessage is set
 * @param msg string information message
 */
function debug(msg) {
	logMessage(_commonShowDebugMessage, "Debug", msg)
}

/**
 * logMessage()
 * 	show message with prefix
 * @param msg string information message
 */
function logMessage(logSwitch, logType, pMsg) {
	if (logSwitch[logSwitch.length - 1]) {
		let preFix = '>';
		console.log(`${preFix.repeat(logSwitch.length)} ${logType}: ${pMsg}`)
	};
}

/**
 * stack()
 * 	show stack message and error stack trace
 * @param msg string information message
 */
function stack(msg) {
		console.log("Error: " + msg)
		console.log("Stack: " + (new Error()).stack)
}

/**
 * slash()
 *  return OS dependent filepath separator
 */
function slash() {
	var System = Java.type("java.lang.System")
	var nameOS = System.getProperty("os.name", "");

	// fs.writefile seems to accept slashes and backslashes independent of platform??
	// if (slash() == "\\") {
	// 	documentSettings.path = documentSettings.path.replaceAll("/", "\\/");
	// } else {
	// 	documentSettings.path = documentSettings.path.replaceAll(/\\/g, "/");
	// }

	if (nameOS.indexOf("Win") != -1) {
		return "\\";
	} else {
		if ((nameOS.indexOf("Mac") != -1) ||
			(nameOS.indexOf("X11") != -1) ||
			(nameOS.indexOf("Linux") != -1)) {
			return "/";
		} else {
			throw (`>> Unknown OS: ${nameOS}`);
		}
	}
}

/**
 * function table
 * 	generate text table strings suitable for printing to stdout
 * 	usage: var s = table(rows, opts={})
 * 	
 *  based on https://www.npmjs.com/package/text-table
 * 
 * @param pRows 2 dimensional array with rows and columns
 * @param opts object with layout options
 * 
 * options are
 * 	opts.markdown   - generate a markdown table
 * 	opts.hsep       - separator to use between columns, default '  '
 * 	opts.align      - array of alignment types for each column, default ['l','l',...]
 *  opts.stringLength - callback function to use when calculating the string length
 * 
 * 	alignment types are:
 *     'l' - left
 *     'r' - right
 *     'c' - center
 *     '.' - decimal
 */
function table(pRows, opts) {
    const cLineChar = '-';
    const cIndexTitle = 1;
    const cIndexLine = 2;

    if (!opts) opts = {};
    var markDown = opts.markdown === true ? true : false;
    if (markDown) {
        var hsep = ' | ';
    } else {
        var hsep = opts.hsep === undefined ? '  ' : opts.hsep;
    }
    var align = opts.align || [];
    var stringLength = opts.stringLength || function (s) { return String(s).length; };

    // if option markdown is set, create and insert a row with the markdown title separator
    var rows_ = [];
    if (markDown) {
        var i_rowsTitle = 0;
        for (let i_row = 0; i_row < pRows.length; i_row++) {
            rows_[i_rowsTitle] = pRows[i_row];
            i_rowsTitle++;
            if (i_row == 0) {
                rows_[i_rowsTitle] = [];
                for (let i_cell = 0; i_cell < pRows[i_row].length; i_cell++) {
                    rows_[i_rowsTitle][i_cell] = cLineChar;
                }
                i_rowsTitle++;
            }
        }
    } else {
        rows_ = pRows;
    }
    
    var dotsizes = reduce(rows_, function (acc, row) {
        forEach(row, function (c, ix) {
            let n = dotindex(c);
            if (!acc[ix] || n > acc[ix]) acc[ix] = n;
        });
        return acc;
    }, []);
    
    // for collumns with '.', find the dot and fill out to the right
    var irow = 0;
    var rows = map(rows_, function (row) {
        irow++;
        return  map(row, function (c_, ix) {
            let c = String(c_);
            if (align[ix] === '.' && 
                (!markDown || // there is no title
                    (markDown && (irow != cIndexTitle && irow != cIndexLine)) // skip the Title rows
                ) 
                ) { 
                let index = dotindex(c);
                let size = dotsizes[ix] + (/\./.test(c) ? -1 : 0) - (stringLength(c) - index);

                return c + Array(size).join(' ');
            }
            else return c;
        });
    });
    
    var sizes = reduce(rows, function (acc, row) {
        forEach(row, function (c, ix) {
            let n = stringLength(c);
            if (!acc[ix] || n > acc[ix]) acc[ix] = n;
        });
        return acc;
    }, []);

    var irow = 0;
    var tableString = map(rows, function (row) {
        irow++;
        return `${markDown ? '| ' : ''}` + map(row, function (c, ix) {
            let n = (sizes[ix] - stringLength(c)) || 0;
            let s = Array(Math.max(n + 1, 1)).join(' ');
            if (markDown && irow == cIndexLine)  {
                return c + Array(Math.max(n + 1, 1)).join(cLineChar);
            }
            if ((align[ix] === 'c') || (markDown && irow == cIndexTitle)) {
                return Array(Math.ceil(n / 2 + 1)).join(' ')
                    + c + Array(Math.floor(n / 2 + 1)).join(' ');
            }
            if (align[ix] === 'r' || align[ix] === '.') {
                return s + c;
            }
            return c + s;
        }).join(hsep) //.replace(/\s+$/, '');
    }).join(`${markDown ? ' |' : ''}\n`);
    return tableString + `${markDown ? ' |' : ''}\n`;
};

function dotindex (c) {
    let m = /\.[^.]*$/.exec(c);
    return m ? m.index + 1 : c.length;
}

function reduce (xs, f, init) {
    if (xs.reduce) return xs.reduce(f, init);
    let i = 0;
    let acc = arguments.length >= 3 ? init : xs[i++];
    for (; i < xs.length; i++) {
        f(acc, xs[i], i);
    }
    return acc;
}

function forEach (xs, f) {
    if (xs.forEach) return xs.forEach(f);
    for (let i = 0; i < xs.length; i++) {
        f.call(xs, xs[i], i);
    }
}

function map (xs, f) {
    if (xs.map) return xs.map(f);
    let res = [];
    for (let i = 0; i < xs.length; i++) {
        res.push(f.call(xs, xs[i], i));
    }
    return res;
}
