## Welcome to JSChannel

JSChannel is a small JavaScript abstraction layer on top of HTML5
cross document messaging.  It builds rich messaging
semantics out of postMessage.

## Overview

HTML5's cross document messaging opens up a ton of possibilities for
interesting client side creations.  But, the specification only
provides the bare minimum amount of plumbing required to support cross
domain client side communication.  JSChannel is a very small
abstraction that provides higher level messaging semantics on top of
postMessage, which include:

  * Query/Response - including support for *callback arguments*
  * Notifications - Fire and forget style.

In addition to support for these messaging semantics, the library sports
the following additional features:

  * "scoping", all messages will be safely tucked under the namespace you
    provide.
  * multiple channel support - message handling properly stops propagation
    once messages are handled, and when they're not it leaves
    them alone.  This means you can have an arbitrary number of different
    channels in a single page.
  * Rich messaging semantics - Query/Response and Notifications
  * An idiomatic api - exceptions inside message handlers automatically
    turn into error responses.  return values are likewise converted into
    "success" responses.
  * support for errors: the library provides the basic structure for error
    propagation while the client define error codes.
  * very compatible with asynchronicity.
  * supports any browser with JSON parsing (native or as a JS library) and
    postMessage.
  * designed primarily for inter-frame communication.

## Sample usage

The simplest possible use case.  A client (parent.html) loads up another
document in an iframe (child.html) and invokes a function on her.

### parent.html

    <html>
    <head><script src="src/jschannel.js"></script></head>
    <body>
    <iframe id="childId" src="child.html"></iframe>
    </body>
    <script>
    
    var chan = Channel.build(document.getElementById("childId").contentWindow, "*", "testScope");
    chan.query({
        method: "reverse",
        params: "hello world!",
        success: function(v) {
            console.log(v);
        }
    });
    
    </script>
    </html>

### child.html

    <html><head>
    <script src="src/jschannel.js"></script>
    <script>
    
    var chan = Channel.build(window.parent, "*", "testScope");
    chan.bind("reverse", function(trans, s) {
        if (typeof s !== 'string') {
            throw [ "invalid_arguments", 'argument to reverse function should be a string' ];
        }
        return s.split("").reverse().join("");
    });
    
    </script>
    </head>
    </html>

## Influences

[JSON-RPC](http://groups.google.com/group/json-rpc/web/json-rpc-2-0)
provided some design inspiration for message formats.

The existence of [pmrpc](http://code.google.com/p/pmrpc/) inspired me there's
room for pure js abstractions in this area.

The API design was influenced by
[postmessage](http://github.com/daepark/postmessage).

## LICENSE

    Copyright (c) 2010, Lloyd Hilaiel <lloyd@hilaiel.com>
    
    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.
    
    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
