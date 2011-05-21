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
    
    var chan = Channel.build({
        window: document.getElementById("childId").contentWindow,
        origin: "*",
        scope: "testScope"
    });
    chan.call({
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
    
    var chan = Channel.build({window: window.parent, origin: "*", scope: "testScope"});
    chan.bind("reverse", function(trans, s) {
        return s.split("").reverse().join("");
    });
    
    </script>
    </head>
    </html>

## Documentation

Full documentation for JSChannel can be found
[here](http://mozilla.github.com/jschannel/docs/).

## Influences

[JSON-RPC](http://groups.google.com/group/json-rpc/web/json-rpc-2-0)
provided some design inspiration for message formats.

The existence of [pmrpc](http://code.google.com/p/pmrpc/) inspired me there's
room for pure js abstractions in this area.

The API design was influenced by
[postmessage](http://github.com/daepark/postmessage).

## LICENSE

All files that are part of this project are covered by the following
license.  The one exception is code under test/doctestjs which
includes licensing information inside.
    
    Version: MPL 1.1/GPL 2.0/LGPL 2.1
    
    The contents of this file are subject to the Mozilla Public License Version 
    1.1 (the "License"); you may not use this file except in compliance with 
    the License. You may obtain a copy of the License at 
    http://www.mozilla.org/MPL/
    
    Software distributed under the License is distributed on an "AS IS" basis,
    WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
    for the specific language governing rights and limitations under the
    License.
    
    The Original Code is jschannel.
    
    The Initial Developer of the Original Code is Lloyd Hilaiel.

    Portions created by the Initial Developer are Copyright (C) 2010
    the Initial Developer. All Rights Reserved.
    
    Contributor(s):
    
    Alternatively, the contents of this file may be used under the terms of
    either the GNU General Public License Version 2 or later (the "GPL"), or
    the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
    in which case the provisions of the GPL or the LGPL are applicable instead
    of those above. If you wish to allow use of your version of this file only
    under the terms of either the GPL or the LGPL, and not to allow others to
    use your version of this file under the terms of the MPL, indicate your
    decision by deleting the provisions above and replace them with the notice
    and other provisions required by the GPL or the LGPL. If you do not delete
    the provisions above, a recipient may use your version of this file under
    the terms of any one of the MPL, the GPL or the LGPL.
