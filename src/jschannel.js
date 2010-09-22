/**
 * js_channel is a very lightweight abstraction on top of
 * postMessage which defines message formats and semantics
 * to support interactions more rich than just message passing
 * js_channel supports:
 *  + query/response - traditional rpc
 *  + query/update/response - incremental async return of results
 *    to a query
 *  + notifications - fire and forget
 *  + error handling
 *
 * js_channel is based heavily on json-rpc, but is focused at the
 * problem of inter-iframe RPC.
 */

;Channel = { }
/* a messaging channel is constructed from a window and an origin.
 * the channel will assert that all messages received over the
 * channel match the origin
 *
 * Arguments to Channel.build(cfg):
 *
 *   cfg.window - the remote window with which we'll communication
 *   cfg.origin - the expected origin of the remote window, may be '*'
 *                which matches any origin
 *   cfg.scope  - the 'scope' of messages.  a scope string that is
 *                prepended to message names.  local and remote endpoints
 *                of a single channel must agree upon scope. Scope may
 *                not contain double colons ('::').
 *   cfg.debugOutput - A boolean value.  If true and window.console.log is
 *                a function, then debug strings will be emitted to that
 *                function.
 *   cfg.debugOutput - A boolean value.  If true and window.console.log is
 *                a function, then debug strings will be emitted to that
 *                function.
 *   cfg.postMessageObserver - A function that will be passed two arguments,
 *                an origin and a message.  It will be passed these immediately
 *                before messages are posted.
 *   cfg.gotMessageObserver - A function that will be passed two arguments,
 *                an origin and a message.  It will be passed these arguments
 *                immediately after they pass scope and origin checks, but before
 *                they are processed.
 */
Channel.build = function(cfg) {
    var debug = function(m) {
        if (cfg.debugOutput && window.console && window.console.log) {
            // try to stringify, if it doesn't work we'll let javascript's built in toString do its magic
            try { if (typeof m !== 'string') m = JSON.stringify(m); } catch(e) { }
            console.log("["+chanId+"] " + m);
        }
    }

    /* browser capabilities check */
    if (!window.postMessage) throw("jschannel cannot run this browser, no postMessage");
    if (!window.JSON || !window.JSON.stringify || ! window.JSON.parse) throw("jschannel cannot run this browser, no native JSON handling");

    /* basic argument validation */
    if (typeof cfg != 'object') throw("Channel build invoked without a proper object argument");

    if (!cfg.window || !cfg.window.postMessage) throw("Channel.build() called without a valid window argument");

    /* we'd have to do a little more work to be able to run multiple channels that intercommunicate the same
     * window...  Not sure if we care to support that */
    if (window === cfg.window) throw("target window is same as present window -- communication within the same window not yet supported");   

    // let's require that the client specify an origin.  if we just assume '*' we'll be
    // propagating unsafe practices.  that would be lame.
    var validOrigin = false;
    if (typeof cfg.origin === 'string') {
        var oMatch;
        if (cfg.origin === "*") validOrigin = true;
        // allow valid domains under http and https.  Also, trim paths off otherwise valid origins.
        else if (null !== (oMatch = cfg.origin.match(/^https?:\/\/(?:[-a-zA-Z0-9\.])+(?::\d+)?/))) {
            cfg.origin = oMatch[0];
            validOrigin = true;
        }
    }
    if (!validOrigin) throw ("Channel.build() called with an invalid origin");

    if (typeof cfg.scope !== 'undefined') {
        if (typeof cfg.scope !== 'string') throw 'scope, when specified, must be a string';
        if (cfg.scope.split('::').length > 1) throw "scope may not contain double colons: '::'"
    }

    /* private variables */
    // generate a random and psuedo unique id for this channel
    var chanId = (function ()
    {
        var text = "";
        var alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        for(var i=0; i < 5; i++) text += alpha.charAt(Math.floor(Math.random() * alpha.length));
        return text;
    })();

    // registrations: mapping method names to call objects
    var regTbl = { };

    // current (open) transactions
    var tranTbl = { };
    // current transaction id, start out at a random *odd* number between 1 and a million
    var curTranId = Math.floor(Math.random()*1000001) | 1;
    // are we ready yet?  when false we will block outbound messages.
    var ready = false;
    var pendingQueue = [ ];

    var createTransaction = function(id,callbacks) {
        var shouldDelayReturn = false;
        var completed = false;

        return {
            invoke: function(cbName, v) {
                // verify in table
                if (!tranTbl[id]) throw "attempting to invoke a callback of a non-existant transaction: " + id;
                // verify that the callback name is valid
                var valid = false;
                for (var i = 0; i < callbacks.length; i++) if (cbName === callbacks[i]) { valid = true; break; }
                if (!valid) throw "request supports no such callback '" + cbName + "'";

                // send callback invocation
                postMessage({ id: id, callback: cbName, params: v});
            },
            error: function(error, message) {
                completed = true;
                // verify in table
                if (!tranTbl[id]) throw "error called for non-existant message: " + id;
                if (tranTbl[id].t !== 'in') throw "error called for message we *sent*.  that's not right";

                // remove transaction from table
                delete tranTbl[id];

                // send error
                postMessage({ id: id, error: error, message: message });
            },
            complete: function(v) {
                completed = true;
                // verify in table
                if (!tranTbl[id]) throw "complete called for non-existant message: " + id;
                if (tranTbl[id].t !== 'in') throw "complete called for message we *sent*.  that's not right";
                // remove transaction from table
                delete tranTbl[id];
                // send complete
                postMessage({ id: id, result: v });
            },
            delayReturn: function(delay) {
                if (typeof delay === 'boolean') {
                    shouldDelayReturn = (delay === true);
                }
                return shouldDelayReturn;
            },
            completed: function() {
                return completed;
            }
        };
    }

    var onMessage = function(e) {
        var handled = false;
        debug("got    message: " + e.data);
        // validate event origin
        if (cfg.origin !== '*' && cfg.origin !== e.origin) {
            debug("dropping message, origin mismatch! '" + cfg.origin + "' !== '" + e.origin + "'");
            return;
        }

        // messages must be objects
        var m = JSON.parse(e.data);
        if (typeof m !== 'object') return;

        // first, descope method if it needs it
        var unscopedMethod = m.method;

        if (m.method && cfg.scope) {
            var ar = m.method.split('::');
            if (ar.length != 2) {
                debug("dropping message: has unscoped method name, I expect scoping to '" + cfg.scope + "'");
                return;
            }
            if (ar[0] !== cfg.scope) {
                debug("dropping message: out of scope: '" + ar[0] + "' !== '" + cfg.scope + "'");
                return;
            }
            unscopedMethod = ar[1];
        }

        // if an observer was specified at allocation time, invoke it
        if (typeof cfg.gotMessageObserver === 'function') {
            // pass observer a clone of the object so that our
            // manipulations are not visible (i.e. method unscoping).
            // This is not particularly efficient, but then we expect
            // that message observers are primarily for debugging anyway.
            try {
                cfg.gotMessageObserver(e.origin, JSON.parse(JSON.stringify(m)));
            } catch (e) {
                debug("gotMessageObserver() raised an exception: " + e.toString());
            }
        }

        m.method = unscopedMethod;

        // now, what type of message is this?
        if (m.id && m.method) {
            // a request!  do we have a registered handler for this request?
            if (regTbl[m.method]) {
                var trans = createTransaction(m.id, m.callbacks ? m.callbacks : [ ]);
                tranTbl[m.id] = { t: 'in' };
                try {
                    // callback handling.  we'll magically create functions inside the parameter list for each
                    // callback
                    if (m.callbacks && m.callbacks instanceof Array && m.callbacks.length > 0) {
                        for (var i = 0; i < m.callbacks.length; i++) {
                            var path = m.callbacks[i];
                            var obj = m.params;
                            var pathItems = path.split('/');
                            for (var j = 0; j < pathItems.length - 1; j++) {
                                var cp = pathItems[j];
                                if (typeof obj[cp] !== 'object') obj[cp] = { };
                                obj = obj[cp];
                            }
                            obj[pathItems[pathItems.length - 1]] = (function() {
                                var cbName = path;
                                return function(params) {
                                    return trans.invoke(cbName, params);
                                }
                            })();
                        }
                    }
                    var resp = regTbl[m.method](trans, m.params);
                    if (!trans.delayReturn() && !trans.completed()) trans.complete(resp);
                } catch(e) {
                    // automagic handling of exceptions:
                    var error = "runtime_error";
                    var message = null;
                    // * if its a string then it gets an error code of 'runtime_error' and string is the message
                    if (typeof e === 'string') {
                        message = e;
                    } else if (typeof e === 'object') {
                        // either an array or an object
                        // * if its an array of length two, then  array[0] is the code, array[1] is the error message
                        if (e && e instanceof Array && e.length == 2) {
                            error = e[0];
                            message = e[1];
                        }
                        // * if its an object then we'll look form error and message parameters
                        else if (typeof e.error === 'string') {
                            error = e.error;
                            if (!e.message) message = "";
                            else if (typeof e.message === 'string') message = e.message;
                            else e = e.message; // let the stringify/toString message give us a reasonable verbose error string
                        }
                    }

                    // message is *still* null, let's try harder
                    if (message === null) {
                        try {
                            message = JSON.stringify(e);
                        } catch (e2) {
                            message = e.toString();
                        }
                    }

                    trans.error(error,message);
                }
                handled = true;
            }
        } else if (m.id && m.callback) {
            if (!tranTbl[m.id] || tranTbl[m.id].t != 'out' ||
                !tranTbl[m.id].callbacks || !tranTbl[m.id].callbacks[m.callback])
            {
                debug("ignoring invalid callback, id:"+m.id+ " (" + m.callback +")");
            } else {
                handled = true;
                // XXX: what if client code raises an exception here?
                tranTbl[m.id].callbacks[m.callback](m.params);
            }
        } else if (m.id && ((typeof m.result !== 'undefined') || m.error)) {
            if (!tranTbl[m.id] || tranTbl[m.id].t != 'out') {
                debug("ignoring invalid response: " + m.id);
            } else {
                handled = true;
                // XXX: what if client code raises an exception here?
                if (m.error) tranTbl[m.id].error(m.error, m.message);
                else tranTbl[m.id].success(m.result);
                delete tranTbl[m.id];
            }
        } else if (m.method) {
            // tis a notification.
            if (regTbl[m.method]) {
                // yep, there's a handler for that.
                // transaction is null for notifications.
                regTbl[m.method](null, m.params);
                // if the client throws, we'll just let it bubble out
                // what can we do?  Also, here we'll ignore return values
                handled = true;
            }
        }

        if (handled) {
            // we got it, hands off.
            e.stopPropagation();
        } else {
            debug("Ignoring event: " + e.data);
        }
    }

    // scope method names based on cfg.scope specified when the Channel was instantiated 
    var scopeMethod = function(m) {
        if (typeof cfg.scope === 'string' && cfg.scope.length) m = [cfg.scope, m].join("::");
        return m;
    }

    // a small wrapper around postmessage whose primary function is to handle the
    // case that clients start sending messages before the other end is "ready"
    var postMessage = function(msg) {
        if (!msg) throw "postMessage called with null message";

        // delay posting if we're not ready yet.
        var verb = (ready ? "post  " : "queue "); 
        debug(verb + " message: " + JSON.stringify(msg));
        if (!ready) pendingQueue.push(msg);
        else {
            if (typeof cfg.postMessageObserver === 'function') {
                try {
                    cfg.postMessageObserver(cfg.origin, msg);
                } catch (e) {
                    debug("postMessageObserver() raised an exception: " + e.toString());
                }
            }
            cfg.window.postMessage(JSON.stringify(msg), cfg.origin);
        }
    }

    var onReady = function(trans, type) {
        debug('ready msg received');
        if (ready) throw "received ready message while in ready state.  help!";

        if (type === 'ping') {
            chanId += '-R';
            curTranId = curTranId+(curTranId%2);
        } else {
            chanId += '-L';
        }

        obj.unbind('__ready'); // now this handler isn't needed any more.
        ready = true;
        debug('ready msg accepted.  starting transaction id: ' + curTranId);

        if (type === 'ping') obj.notify({ method: '__ready', params: 'pong' });

        // flush queue
        while (pendingQueue.length) postMessage(pendingQueue.pop(), cfg.origin);
    };

    // Setup postMessage event listeners
    if (window.addEventListener) window.addEventListener('message', onMessage, false);
    else if(window.attachEvent) window.attachEvent('onmessage', onMessage);

    var obj = {
        // tries to unbind a bound message handler.  returns false if not possible
        unbind: function (method) {
            if (regTbl[method]) {
                if (!(delete regTbl[method])) throw ("can't delete method: " + method);
                return true;
            }
            return false;
        },
        bind: function (method, cb) {
            if (!method || typeof method !== 'string') throw "'method' argument to bind must be string";
            if (!cb || typeof cb !== 'function') throw "callback missing from bind params";

            if (regTbl[method]) throw "method '"+method+"' is already bound!";
            regTbl[method] = cb;
        },
        call: function(m) {
            if (!m) throw 'missing arguments to call function';
            if (!m.method || typeof m.method !== 'string') throw "'method' argument to call must be string";
            if (!m.success || typeof m.success !== 'function') throw "'success' callback missing from call";

            // now it's time to support the 'callback' feature of jschannel.  We'll traverse the argument
            // object and pick out all of the functions that were passed as arguments.
            var callbacks = { };
            var callbackNames = [ ];

            var pruneFunctions = function (path, obj) {
                if (typeof obj === 'object') {
                    for (var k in obj) {
                        if (!obj.hasOwnProperty(k)) continue;
                        var np = path + (path.length ? '/' : '') + k;
                        if (typeof obj[k] === 'function') {
                            callbacks[np] = obj[k];
                            callbackNames.push(np);
                            delete obj[k];
                        } else if (typeof obj[k] === 'object') {
                            pruneFunctions(np, obj[k]);
                        }
                    }
                }
            };
            pruneFunctions("", m.params);

            // build a 'request' message and send it
            var msg = { id: curTranId, method: scopeMethod(m.method), params: m.params };
            if (callbackNames.length) msg.callbacks = callbackNames;
            postMessage(msg);

            // insert into the transaction table
            tranTbl[curTranId] = { t: 'out', callbacks: callbacks, error: m.error, success: m.success };

            // increment next id (by 2)
            curTranId += 2;
        },
        notify: function(m) {
            if (!m) throw 'missing arguments to notify function';
            if (!m.method || typeof m.method !== 'string') throw "'method' argument to notify must be string";

            // no need to go into any transaction table 
            postMessage({ method: scopeMethod(m.method), params: m.params });
        },
        destroy: function () {
            if (window.removeEventListener) window.removeEventListener('message', onMessage, false);
            else if(window.detachEvent) window.detachEvent('onmessage', onMessage);
            ready = false;
            regTbl = { };
            tranTbl = { };
            curTranId = 0;
            cfg.origin = null;
            pendingQueue = [ ];
            debug("channel destroyed");
            chanId = "";
        }
    };

    obj.bind('__ready', onReady);
    ready = true; obj.notify({ method: '__ready', params: "ping" });  ready = false;

    return obj;
}
