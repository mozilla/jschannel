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
 * channel match the origin */
Channel.build = function(tgt_win, tgt_origin, msg_scope) {
    var debug = function(m) {
        if (window.console && window.console.log) {
            // try to stringify, if it doesn't work we'll let javascript's built in toString do its magic
            try { if (typeof m !== 'string') m = JSON.stringify(m); } catch(e) { }
            console.log("["+whoami+"] " + m);
        }
    }

    /* browser capabilities check */
    if (!window.postMessage) throw("jschannel cannot run this browser, no postMessage");
    if (!window.JSON || !window.JSON.stringify || ! window.JSON.parse) throw("jschannel cannot run this browser, no native JSON handling");

    /* we'd have to do a little more work to be able to run multiple channels that intercommunicate the same
     * window...  Not sure if we care to support that */
    if (window === tgt_win) throw("target window is same as present window -- communication within the same window not yet supported");   

    /* basic argument validation */
    if (!tgt_win || !tgt_win.postMessage) throw("Channel.build() called without a valid window argument");
    // let's require that the client specify an origin.  if we just assume '*' we'll be
    // propagating unsafe practices.  that would be lame.
    if (typeof tgt_origin !== 'string' || 
        // allow '*'
        (tgt_origin !== "*" &&
        // allow valid domains under http and https (a simple loose check)
         !tgt_origin.match(/^https?:\/\/([-a-zA-Z0-9\.])+(:\d+)?$/)
        ))
    {
        throw ("Channel.build() called with an invalid origin");
    }
    if (typeof msg_scope !== 'undefined') {
        if (typeof msg_scope !== 'string') throw 'scope, when specified, must be a string';
        if (msg_scope.split('::').length > 1) throw "scope may not contain double colons: '::'"
    }

    /* private variables */
    // registrations: mapping method names to call objects
    var regTbl = { };

    // current (open) transactions
    var tranTbl = { };
    // current transaction id
    var curTranId = 1000;
    var remoteOrigin = tgt_origin;
    // are we ready yet?  when false we will block outbound messages.
    var ready = false;
    var pendingQueue = [ ];
    var child = false;

    // we assume that Channel will always be used for communication between two iframes in a
    // parent/child relationship.  would we ever be wrong?
    if (tgt_win == window.parent) {
        // children are odd, parents are even
        curTranId++;
        ready = true;
        child = true; // XXX: do we really care?  How much checking do we want in the works?
    } else {
        ready = false;
    }
    var whoami = child ? "child" : "parent";

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
        debug("got message: " + e.data);
        // validate event origin
        if (tgt_origin !== '*' && tgt_origin !== e.origin) {
            debug("dropping message, origin mismatch! '" + tgt_origin + "' !== '" + e.origin + "'");
            return;
        }

        // messages must be objects
        var m = JSON.parse(e.data);
        if (typeof m !== 'object') return;

        // first, descope method if it needs it
        if (m.method && msg_scope) {
            var ar = m.method.split('::');
            if (ar.length != 2) {
                debug("dropping message: has unscoped method name, I expect scoping to '" + msg_scope + "'");
                return;
            }
            if (ar[0] !== msg_scope) {
                debug("dropping message: out of scope: '" + ar[0] + "' !== '" + msg_scope + "'");
                return;
            }
            m.method = ar[1];
        }

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
        } else if (m.id && (m.result || m.error)) {
            if (!tranTbl[m.id] || tranTbl[m.id].t != 'out') {
                debug("ignoring invalid response: " + m.id);
            } else {
                handled = true;
                // XXX: what if client code raises an exception here?
                if (m.result) tranTbl[m.id].success(m.result);
                else tranTbl[m.id].error(m.error, m.message);
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

    // scope method names based on msg_scope specified when the Channel was instantiated 
    var scopeMethod = function(m) {
        if (typeof msg_scope === 'string' && msg_scope.length) m = [msg_scope, m].join("::");
        return m;
    }

    // a small wrapper around postmessage whose primary function is to handle the
    // case that clients start sending messages before the other end is "ready"
    var postMessage = function(msg) {
        if (!msg) throw "postMessage called with null message";

        // delay posting if we're not ready yet.
        var verb = (ready ? "posting" : "queueing"); 
        debug(verb + " message (" + msg.id + ") |" + msg.method + "|(" + JSON.stringify(msg));
        if (!ready) pendingQueue.push(msg);
        else tgt_win.postMessage(JSON.stringify(msg), remoteOrigin);
    }

    // run once the other side declares themselves ready
    var onReady = function(trans, args) {
        while (pendingQueue.length) {
            tgt_win.postMessage(JSON.stringify(pendingQueue.pop()), remoteOrigin);
        }
        ready = true;
        // don't respond to responses, lest the din become unbearable
        if (args !== 'pong') obj.notify({ method: '__ready', params: "pong"});
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
        query: function(m) {
            if (!m) throw 'missing arguments to query function';
            if (!m.method || typeof m.method !== 'string') throw "'method' argument to query must be string";
            if (!m.success || typeof m.success !== 'function') throw "'success' callback missing from query";

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
            postMessage({ id: curTranId, method: scopeMethod(m.method), params: m.params, callbacks: callbackNames });

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
        }
    };

    obj.bind('__ready', onReady);
    ready = true; obj.notify({ method: '__ready', params: 'ping' }); ready = false;
    debug('channel loaded.');
    return obj;
}
