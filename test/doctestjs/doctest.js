/*

Javascript doctest runner
Copyright 2006-2010 Ian Bicking

This program is free software; you can redistribute it and/or modify it under
the terms of the MIT License.

*/


function doctest(verbosity/*default=0*/, elements/*optional*/,
                 outputId/*optional*/) {
  var output = document.getElementById(outputId || 'doctestOutput');
  var reporter = new doctest.Reporter(output, verbosity || 0);
  if (elements) {
      if (typeof elements == 'string') {
        // Treat it as an id
        elements = [document.getElementById(elementId)];
      }
      if (! elements.length) {
          throw('No elements');
      }
      var suite = new doctest.TestSuite(elements, reporter);
  } else {
      var els = doctest.getElementsByTagAndClassName('pre', 'doctest');
      var suite = new doctest.TestSuite(els, reporter);
  }
  suite.run();
}

doctest.runDoctest = function (el, reporter) {
  logDebug('Testing element', el);
  reporter.startElement(el);
  if (el === null) {
    throw('runDoctest() with a null element');
  }
  var parsed = new doctest.Parser(el);
  var runner = new doctest.JSRunner(reporter);
  runner.runParsed(parsed);
};

doctest.TestSuite = function (els, reporter) {
  if (this === window) {
    throw('you forgot new!');
  }
  this.els = els;
  this.parsers = [];
  for (var i=0; i<els.length; i++) {
    this.parsers.push(new doctest.Parser(els[i]));
  }
  this.reporter = reporter;
};

doctest.TestSuite.prototype.run = function (ctx) {
  if (! ctx) {
    ctx = new doctest.Context(this);
  }
  if (! ctx.runner ) {
    ctx.runner = new doctest.JSRunner(this.reporter);
  }
  return ctx.run();
};

// FIXME: should this just be part of TestSuite?
doctest.Context = function (testSuite) {
  if (this === window) {
    throw('You forgot new!');
  }
  this.testSuite = testSuite;
  this.runner = null;
};

doctest.Context.prototype.run = function (parserIndex) {
  var self = this;
  parserIndex = parserIndex || 0;
  if (parserIndex >= this.testSuite.parsers.length) {
    logInfo('All examples from all sections tested');
    this.runner.reporter.finish();
    return;
  }
  logInfo('Testing example ' + (parserIndex+1) + ' of '
           + this.testSuite.parsers.length);
  var runNext = function () {
    self.run(parserIndex+1);
  };
  this.runner.runParsed(this.testSuite.parsers[parserIndex], 0, runNext);
};

doctest.Parser = function (el) {
  if (this === window) {
    throw('you forgot new!');
  }
  if (! el) {
    throw('Bad call to doctest.Parser');
  }
  if (el.getAttribute('parsed-id')) {
    var examplesID = el.getAttribute('parsed-id');
    if (doctest._allExamples[examplesID]) {
      this.examples = doctest._allExamples[examplesID];
      return;
    }
  }
  var newHTML = document.createElement('span');
  newHTML.className = 'doctest-example-set';
  var examplesID = doctest.genID('example-set');
  newHTML.setAttribute('id', examplesID);
  el.setAttribute('parsed-id', examplesID);
  var text = doctest.getText(el);
  var lines = text.split(/(?:\r\n|\r|\n)/);
  this.examples = [];
  var example_lines = [];
  var output_lines = [];
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if (/^[$]/.test(line)) {
      if (example_lines.length) {
        var ex = new doctest.Example(example_lines, output_lines);
        this.examples.push(ex);
        newHTML.appendChild(ex.createSpan());
      }
      example_lines = [];
      output_lines = [];
      line = line.substr(1).replace(/ *$/, '').replace(/^ /, '');
      example_lines.push(line);
    } else if (/^>/.test(line)) {
      if (! example_lines.length) {
        throw('Bad example: '+doctest.repr(line)+'\n'
              +'> line not preceded by $');
      }
      line = line.substr(1).replace(/ *$/, '').replace(/^ /, '');
      example_lines.push(line);
    } else {
      output_lines.push(line);
    }
  }
  if (example_lines.length) {
    var ex = new doctest.Example(example_lines, output_lines);
    this.examples.push(ex);
    newHTML.appendChild(ex.createSpan());
  }
  el.innerHTML = '';
  el.appendChild(newHTML);
  doctest._allExamples[examplesID] = this.examples;
};

doctest._allExamples = {};

doctest.Example = function (example, output) {
  if (this === window) {
    throw('you forgot new!');
  }
  this.example = example.join('\n');
  this.output = output.join('\n');
  this.htmlID = null;
  this.detailID = null;
};

doctest.Example.prototype.createSpan = function () {
  var id = doctest.genID('example');
  var span = document.createElement('span');
  span.className = 'doctest-example';
  span.setAttribute('id', id);
  this.htmlID = id;
  var exampleSpan = document.createElement('span');
  exampleSpan.className = 'doctest-example-code';
  var exampleLines = this.example.split(/\n/);
  for (var i=0; i<exampleLines.length; i++) {
    var promptSpan = document.createElement('span');
    promptSpan.className = 'doctest-example-prompt';
    promptSpan.innerHTML = i == 0 ? '$ ' : '&gt; ';
    exampleSpan.appendChild(promptSpan);
    var lineSpan = document.createElement('span');
    lineSpan.className = 'doctest-example-code-line';
    lineSpan.appendChild(document.createTextNode(exampleLines[i]));
    exampleSpan.appendChild(lineSpan);
    exampleSpan.appendChild(document.createTextNode('\n'));
  }
  span.appendChild(exampleSpan);
  var outputSpan = document.createElement('span');
  outputSpan.className = 'doctest-example-output';
  outputSpan.appendChild(document.createTextNode(this.output));
  span.appendChild(outputSpan);
  span.appendChild(document.createTextNode('\n'));
  return span;
};

doctest.Example.prototype.markExample = function (name, detail) {
  if (! this.htmlID) {
    return;
  }
  if (this.detailID) {
    var el = document.getElementById(this.detailID);
    el.parentNode.removeChild(el);
    this.detailID = null;
  }
  var span = document.getElementById(this.htmlID);
  span.className = span.className.replace(/ doctest-failure/, '')
                   .replace(/ doctest-success/, '')
                   + ' ' + name;
  if (detail) {
    this.detailID = doctest.genID('doctest-example-detail');
    var detailSpan = document.createElement('span');
    detailSpan.className = 'doctest-example-detail';
    detailSpan.setAttribute('id', this.detailID);
    detailSpan.appendChild(document.createTextNode(detail));
    span.appendChild(detailSpan);
  }
};

doctest.Reporter = function (container, verbosity) {
  if (this === window) {
    throw('you forgot new!');
  }
  if (! container) {
    throw('No container passed to doctest.Reporter');
  }
  this.container = container;
  this.verbosity = verbosity;
  this.success = 0;
  this.failure = 0;
  this.elements = 0;
};

doctest.Reporter.prototype.startElement = function (el) {
  this.elements += 1;
  logDebug('Adding element', el);
};

doctest.Reporter.prototype.reportSuccess = function (example, output) {
  if (this.verbosity > 0) {
    if (this.verbosity > 1) {
      this.write('Trying:\n');
      this.write(this.formatOutput(example.example));
      this.write('Expecting:\n');
      this.write(this.formatOutput(example.output));
      this.write('ok\n');
    } else {
      this.writeln(example.example + ' ... passed!');
    }
  }
  this.success += 1;
  if (doctest.strip(example.output) == '...') {
    example.markExample('doctest-success', 'Output:\n' + output);
  } else {
    example.markExample('doctest-success');
  }
};

doctest.Reporter.prototype.reportFailure = function (example, output) {
  this.write('Failed example:\n');
  this.write('<span style="color: #00f"><a href="#'
             + example.htmlID
             + '" class="doctest-failure-link" title="Go to example">'
             + this.formatOutput(example.example)
             +'</a></span>');
  this.write('Expected:\n');
  this.write(this.formatOutput(example.output));
  this.write('Got:\n');
  this.write(this.formatOutput(output));
  this.failure += 1;
  example.markExample('doctest-failure', 'Actual output:\n' + output);
};

doctest.Reporter.prototype.finish = function () {
  this.writeln((this.success+this.failure)
               + ' tests in ' + this.elements + ' items.');
  if (this.failure) {
    var color = '#f00';
  } else {
    var color = '#0f0';
  }
  this.writeln('<span class="passed">' + this.success + '</span> tests of '
               + '<span class="total">' + (this.success+this.failure) + '</span> passed, '
               + '<span class="failed" style="color: '+color+'">'
               + this.failure + '</span> failed.');
};

doctest.Reporter.prototype.writeln = function (text) {
  this.write(text+'\n');
};

doctest.Reporter.prototype.write = function (text) {
  var leading = /^[ ]*/.exec(text)[0];
  text = text.substr(leading.length);
  for (var i=0; i<leading.length; i++) {
    text = String.fromCharCode(160)+text;
  }
  text = text.replace(/\n/g, '<br>');
  this.container.innerHTML += text;
};

doctest.Reporter.prototype.formatOutput = function (text) {
  if (! text) {
    return '    <span style="color: #999">(nothing)</span>\n';
  }
  var lines = text.split(/\n/);
  var output = '';
  for (var i=0; i<lines.length; i++) {
    output += '    '+doctest.escapeSpaces(doctest.escapeHTML(lines[i]))+'\n';
  }
  return output;
};

doctest.JSRunner = function (reporter) {
  if (this === window) {
    throw('you forgot new!');
  }
  this.reporter = reporter;
};

doctest.JSRunner.prototype.runParsed = function (parsed, index, finishedCallback) {
  var self = this;
  index = index || 0;
  if (index >= parsed.examples.length) {
    if (finishedCallback) {
      finishedCallback();
    }
    return;
  }
  var example = parsed.examples[index];
  if (typeof example == 'undefined') {
    throw('Undefined example (' + (index+1) + ' of ' + parsed.examples.length + ')');
  }
  doctest._waitCond = null;
  this.run(example);
  var finishThisRun = function () {
    self.finishRun(example);
    self.runParsed(parsed, index+1, finishedCallback);
  };
  if (doctest._waitCond !== null) {
    if (typeof doctest._waitCond == 'number') {
      var condition = null;
      var time = 0;
      var maxTime = null;
    } else {
      var condition = doctest._waitCond;
      // FIXME: shouldn't be hard-coded
      var time = 100;
      var maxTime = doctest._waitTimeout || doctest.defaultTimeout;
    }
    var start = (new Date()).getTime();
    var timeoutFunc = function () {
      if (condition === null
          || condition()) {
        finishThisRun();
      } else {
        // Condition not met, try again soon...
        if ((new Date()).getTime() - start > maxTime) {
          // Time has run out
          var msg = 'Error: wait(' + repr(condition) + ') has timed out';
          writeln(msg);
          logDebug(msg);
          logDebug('Timeout after ' + ((new Date()).getTime() - start)
                   + ' milliseconds');
          finishThisRun();
          return;
        }
        setTimeout(timeoutFunc, time);
      }
    };
    setTimeout(timeoutFunc, time);
  } else {
    finishThisRun();
  }
};

doctest.JSRunner.prototype.run = function (example) {
  this.capturer = new doctest.OutputCapturer();
  this.capturer.capture();
  try {
    var result = window.eval(example.example);
  } catch (e) {
    writeln('Error: ' + (e.message || e));
    var result = null;
    logDebug('Error in expression: ' + example.example);
    logDebug('Traceback for error', e);
    if (e.stack) {
      var stack = e.stack.split('\n');
      for (var i=0; i<stack.length; i++) {
        if (stack[i] == '@:0' || ! stack[i]) {
          continue;
        }
        var parts = stack[i].split('@');
        var context = parts[0];
        parts = parts[1].split(':');
        var filename = parts[parts.length-2].split('/');
        filename = filename[filename.length-1];
        var lineno = parts[parts.length-1];
        if (context != '' && filename != 'jsdoctest.js') {
          logDebug('  ' + context + ' -> '+filename+':'+lineno);
        }
      }
    }
  }
  if (typeof result != 'undefined'
      && result !== null
      && example.output) {
    writeln(doctest.repr(result));
  }
};

doctest.JSRunner.prototype.finishRun = function(example) {
  this.capturer.stopCapture();
  var success = this.checkResult(this.capturer.output, example.output);
  if (success) {
    this.reporter.reportSuccess(example, this.capturer.output);
  } else {
    this.reporter.reportFailure(example, this.capturer.output);
    logDebug('Failure: '+doctest.repr(example.output)
             +' != '+doctest.repr(this.capturer.output));
  }
};

doctest.JSRunner.prototype.checkResult = function (got, expected) {
  expected = expected.replace(/[\n\r]*$/, '') + '\n';
  got = got.replace(/[\n\r]*$/, '') + '\n';
  if (expected == '...\n') {
    return true;
  }
  expected = RegExp.escape(expected);
  // Note: .* doesn't match newlines, but [^] matches everything
  expected = '^' + expected.replace(/\\.\\.\\./g, "[^]*") + '$';
  expected = expected.replace(/\n/, '\\n');
  var re = new RegExp(expected);
  return got.search(re) != -1;
};

// Should I really be setting this on RegExp?
RegExp.escape = function (text) {
  if (!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
};

doctest.OutputCapturer = function () {
  if (this === window) {
    throw('you forgot new!');
  }
  this.output = '';
};

var output = null;

doctest.OutputCapturer.prototype.capture = function () {
  output = this;
};

doctest.OutputCapturer.prototype.stopCapture = function () {
  output = null;
};

doctest.OutputCapturer.prototype.write = function (text) {
  this.output += text;
};

// Used to create unique IDs:
doctest._idGen = 0;

doctest.genID = function (prefix) {
  prefix = prefix || 'generic-doctest';
  var id = doctest._idGen++;
  return prefix + '-' + doctest._idGen;
};

function writeln() {
  for (var i=0; i<arguments.length; i++) {
    write(arguments[i]);
    if (i) {
      write(' ');
    }
  }
  write('\n');
}

doctest.writeln = writeln;

function write(text) {
  if (output !== null) {
    output.write(text);
  } else {
    log(text);
  }
}

doctest.write = write;

doctest._waitCond = null;

function wait(conditionOrTime, hardTimeout) {
  // FIXME: should support a timeout even with a condition
  if (typeof conditionOrTime == 'undefined'
      || conditionOrTime === null) {
    // same as wait-some-small-amount-of-time
    conditionOrTime = 0;
  }
  doctest._waitCond = conditionOrTime;
  doctest._waitTimeout = hardTimeout;
};

doctest.wait = wait;

function assert(expr, statement) {
  if (typeof expr == 'string') {
    if (! statement) {
      statement = expr;
    }
    expr = eval(expr);
  }
  if (! expr) {
    throw('AssertionError: '+statement);
  }
}

doctest.assert = assert;

doctest.getText = function (el) {
  if (! el) {
    throw('You must pass in an element');
  }
  var text = '';
  for (var i=0; i<el.childNodes.length; i++) {
    var sub = el.childNodes[i];
    if (sub.nodeType == 3) {
      // TEXT_NODE
      text += sub.nodeValue;
    } else if (sub.childNodes) {
      text += doctest.getText(sub);
    }
  }
  return text;
};

doctest.reload = function (button/*optional*/) {
  if (button) {
    button.innerHTML = 'reloading...';
    button.disabled = true;
  }
  location.reload();
};

/* Taken from MochiKit, with an addition to print objects */
doctest.repr = function (o) {
    if (typeof o == 'undefined') {
        return 'undefined';
    } else if (o === null) {
        return "null";
    }
    try {
        if (typeof(o.__repr__) == 'function') {
            return o.__repr__();
        } else if (typeof(o.repr) == 'function' && o.repr != arguments.callee) {
            return o.repr();
        }
        for (var i=0; i<doctest.repr.registry.length; i++) {
            var item = doctest.repr.registry[i];
            if (item[0](o)) {
                return item[1](o);
            }
        }
    } catch (e) {
        if (typeof(o.NAME) == 'string' && (
                o.toString == Function.prototype.toString ||
                    o.toString == Object.prototype.toString)) {
            return o.NAME;
        }
    }
    try {
        var ostring = (o + "");
        if (ostring == '[object Object]') {
          ostring = '{';
          var keys = [];
          for (var i in o) {
            if (typeof o.prototype == 'undefined'
                || o[i] !== o.prototype[i]) {
              keys.push(i);
            }
          }
          keys.sort();
          for (i=0; i<keys.length; i++) {
            if (ostring != '{') {
              ostring += ', ';
            }
            ostring += keys[i] + ': ' + doctest.repr(o[keys[i]]);
          }
          ostring += '}';
        }
    } catch (e) {
        return "[" + typeof(o) + "]";
    }
    if (typeof(o) == "function") {
        var ostring = ostring.replace(/^\s+/, "").replace(/\s+/g, " ");
        var idx = ostring.indexOf("{");
        if (idx != -1) {
            ostring = ostring.substr(o, idx) + "{...}";
        }
    }
    return ostring;
};

doctest.repr.registry = [
    [function (o) {
         return typeof o == 'string';},
     function (o) {
         o = '"' + o.replace(/([\"\\])/g, '\\$1') + '"';
         o = o.replace(/[\f]/g, "\\f")
         .replace(/[\b]/g, "\\b")
         .replace(/[\n]/g, "\\n")
         .replace(/[\t]/g, "\\t")
         .replace(/[\r]/g, "\\r");
         return o;
     }],
    [function (o) {
         return typeof o == 'number';},
     function (o) {
         return o + "";
     }],
    [function (o) {
         var typ = typeof o;
         if ((typ != 'object' && ! (type == 'function' && typeof o.item == 'function')) ||
             o === null ||
             typeof o.length != 'number' ||
             o.nodeType === 3) {
             return false;
         }
         return true;
     },
     function (o) {
         var s = "[";
         for (var i=0; i<o.length; i++) {
             s += doctest.repr(o[i]);
             if (i != o.length-1) {
                 s += ", ";
             }
         }
         s += "]";
         return s;
     }]];

doctest.getElementsByTagAndClassName = function (tagName, className, parent/*optional*/) {
    parent = parent || document;
    var els = parent.getElementsByTagName(tagName);
    var result = [];
    var re = new RegExp("\\b"+className+"\\b");
    for (var i=0; i<els.length; i++) {
        var el = els[i];
        if (el.className && el.className.search(re) != -1) {
            result.push(el);
        }
    }
    return result;
};

doctest.strip = function (str) {
    str = str + "";
    return str.replace(/\s+$/, "").replace(/^\s+/, "");
};

doctest.rstrip = function (str) {
  str = str + "";
  return str.replace(/\s+$/, "");
};

doctest.escapeHTML = function (s) {
    return s.replace(/&/g, '&amp;')
    .replace(/\"/g, "&quot;")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

doctest.escapeSpaces = function (s) {
  return s.replace(/  /g, '&nbsp; ');
};

doctest.extend = function (obj, extendWith) {
    for (i in extendWith) {
        obj[i] = extendWith[i];
    }
    return obj;
};

doctest.extendDefault = function (obj, extendWith) {
    for (i in extendWith) {
        if (typeof obj[i] == 'undefined') {
            obj[i] = extendWith[i];
        }
    }
    return obj;
};

if (typeof repr == 'undefined') {
    repr = doctest.repr;
}

if (typeof log == 'undefined') {
    if (typeof console != 'undefined'
        && typeof console.log != 'undefined') {
        log = function () {
          console.log.apply(console, arguments);
        };
    } else {
        log = function () {
            // FIXME: do something
        };
    }
}

if (typeof logDebug == 'undefined') {
    logDebug = log;
}

if (typeof logInfo == 'undefined') {
    logInfo = log;
}

doctest.autoSetup = function (parent) {
  var tags = doctest.getElementsByTagAndClassName('div', 'test', parent);
  // First we'll make sure everything has an ID
  var tagsById = {};
  for (var i=0; i<tags.length; i++) {
    var tagId = tags[i].getAttribute('id');
    if (! tagId) {
      tagId = 'test-' + (++doctest.autoSetup._idCount);
      tags[i].setAttribute('id', tagId);
    }
    // FIXME: test uniqueness here, warn
    tagsById[tagId] = tags[i];
  }
  // Then fill in the labels
  for (i=0; i<tags.length; i++) {
    var el = document.createElement('span');
    el.className = 'test-id';
    var anchor = document.createElement('a');
    anchor.setAttribute('href', '#' + tags[i].getAttribute('id'));
    anchor.appendChild(document.createTextNode(tagId));
    var button = document.createElement('button');
    button.innerHTML = 'test';
    button.setAttribute('type', 'button');
    button.setAttribute('test-id', tags[i].getAttribute('id'));
    button.onclick = function () {
      location.hash = '#' + this.getAttribute('test-id');
      location.reload();
    };
    el.appendChild(anchor);
    el.appendChild(button);
    tags[i].insertBefore(el, tags[i].childNodes[0]);
  }
  // Lastly, create output areas in each section
  for (i=0; i<tags.length; i++) {
    var outEl = doctest.getElementsByTagAndClassName('pre', 'output', tags[i]);
    if (! outEl.length) {
      outEl = document.createElement('pre');
      outEl.className = 'output';
      outEl.setAttribute('id', tags[i].getAttribute('id') + '-output');
    }
  }
  if (location.hash.length > 1) {
    // This makes the :target CSS work, since if the hash points to an
    // element whose id has just been added, it won't be noticed
    location.hash = location.hash;
  }
  var output = document.getElementById('doctestOutput');
  if (! output) {
    output = document.createElement('pre');
    output.setAttribute('id', 'doctestOutput');
    output.className = 'output';
    tags[0].parentNode.insertBefore(output, tags[0]);
  }
  var reloader = document.getElementById('doctestReload');
  if (! reloader) {
    reloader = document.createElement('button');
    reloader.setAttribute('type', 'button');
    reloader.innerHTML = 'test all';
    reloader.onclick = function () {
      location.hash = '';
      location.reload();
    };
    output.parentNode.insertBefore(reloader, output);
  }
};

doctest.autoSetup._idCount = 0;

doctest.Spy = function (name, options, extraOptions) {
  if (this === window) {
    if (spies[name]) {
      return spies[name];
    }
    return new Spy(name, options);
  }
  name = name || 'spy';
  options = options || {};
  if (typeof options == "function") {
    options = {applies: options};
  }
  if (extraOptions) {
    doctest.extendDefault(options, extraOptions);
  }
  doctest.extendDefault(options, doctest.defaultSpyOptions);
  var self = this;
  this.name = name;
  this.options = options;
  this.called = false;
  this.calledWait = false;
  this.args = null;
  this.self = null;
  this.argList = [];
  this.selfList = [];
  this.writes = options.writes || false;
  this.returns = options.returns || null;
  this.applies = options.applies || null;
  this.binds = options.binds || null;
  this.throwError = options.throwError || null;
  this.func = function () {
    self.called = true;
    self.calledWait = true;
    self.args = doctest._argsToArray(arguments);
    self.self = this;
    self.argList.push(self.args);
    self.selfList.push(this);
    // It might be possible to get the caller?
    if (self.writes) {
      writeln(self.formatCall());
    }
    if (self.throwError) {
      throw self.throwError;
    }
    if (self.applies) {
      return self.applies.apply(this, arguments);
    }
    return self.returns;
  };
  this.func.toString = function () {
    return "Spy('" + self.name + "').func";
  };
  if (options.methods) {
    this.methods(options.methods);
  }
  doctest.spies[name] = this;
  if (options.wait) {
    this.wait();
  }
};

doctest.Spy.prototype.formatCall = function () {
  var s = '';
  if (this.self !== window && this.self !== this) {
    s += doctest.repr(this.self) + '.';
  }
  s += this.name;
  if (this.args === null) {
    return s + ':never called';
  }
  s += '(';
  for (var i=0; i<this.args.length; i++) {
    if (i) {
      s += ', ';
    }
    s += doctest.repr(this.args[i], true);
  }
  s += ')';
  return s;
};

doctest.Spy.prototype.method = function (name, options) {
  var desc = this.name + '.' + name;
  var newSpy = new Spy(desc, options);
  this.func[name] = newSpy.func;
  return newSpy;
};

doctest.Spy.prototype.methods = function (props) {
  for (var i in props) {
    if (props[i] === props.prototype[i]) {
      continue;
    }
    this.method(i, props[i]);
  }
  return this;
};

doctest.Spy.prototype.wait = function (timeout) {
  var self = this;
  var func = function () {
    var value = self.calledWait;
    if (value) {
      self.calledWait = false;
    }
    return value;
  };
  func.repr = function () {
    return 'called:'+repr(self);
  };
  doctest.wait(func, timeout);
};

doctest.Spy.prototype.repr = function () {
  return "Spy('" + this.name + "')";
};

doctest._argsToArray = function (args) {
  var array = [];
  for (var i=0; i<args.length; i++) {
    array.push(args[i]);
  }
  return array;
};

Spy = doctest.Spy;

spies = doctest.spies = {};

doctest.defaultTimeout = 2000;

doctest.defaultSpyOptions = {writes: true};

window.addEventListener('load', function () {
  var auto = false;
  if (/\bautodoctest\b/.exec(document.body.className)) {
    doctest.autoSetup();
    auto = true;
  }
  var loc = window.location.search.substring(1);
  if (auto || (/doctestRun/).exec(loc)) {
    var elements = null;
    // FIXME: we need to put the output near the specific test being tested:
    if (location.hash) {
      var el = document.getElementById(location.hash.substr(1));
      if (/\btest\b/.exec(el.className)) {
        elements = doctest.getElementsByTagAndClassName('pre', 'doctest', el);
      }
    }
    doctest(0, elements);
  }
}, false);

